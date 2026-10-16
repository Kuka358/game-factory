import {
    lstat,
    mkdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import {
    dirname,
    resolve
} from "node:path";

import type {
    IterationScope
} from "./contracts.js";

import {
    planSurgicalEdits,
    type PlannedSurgicalFileMutation,
    type SurgicalFileEdit,
    type SurgicalFileSnapshot
} from "./surgical-edit.js";

import {
    WorkspaceGuard,
    normalizeRepositoryPath
} from "./workspace.js";


export interface SurgicalEditApplicationInput {
    repositoryRoot:
        string;

    scope:
        IterationScope;

    edits:
        readonly SurgicalFileEdit[];
}


interface PreparedMutation {
    path:
        string;

    absolutePath:
        string;

    mutation:
        PlannedSurgicalFileMutation;
}


export class SurgicalEditApplicator
{
    private readonly guard =
        new WorkspaceGuard();


    async apply(
        input:
            SurgicalEditApplicationInput
    ): Promise<string[]> {
        const repositoryRoot =
            resolve(
                input.repositoryRoot
            );


        /*
         * Normalize and scope-check the COMPLETE edit batch
         * before reading or mutating any target.
         */
        const edits =
            await this.prepareEdits(
                repositoryRoot,
                input.scope,
                input.edits
            );


        const snapshots =
            await this.readSnapshots(
                repositoryRoot,
                edits
            );


        /*
         * planSurgicalEdits performs all semantic checks entirely
         * in memory.
         */
        const plan =
            planSurgicalEdits(
                snapshots,
                edits
            );


        const prepared =
            plan.map(
                mutation => ({
                    path:
                        mutation.path,

                    absolutePath:
                        resolve(
                            repositoryRoot,
                            mutation.path
                        ),

                    mutation
                })
            );


        /*
         * Stale-state preflight happens for the WHOLE mutation
         * batch before any filesystem write.
         */
        for (
            const item of
            prepared
        ) {
            await assertNoSymbolicLinkTraversal(
                repositoryRoot,
                item.path
            );


            await assertSnapshotStillCurrent(
                item.absolutePath,
                item.path,
                item.mutation
                    .originalContent
            );
        }


        const attempted:
            PreparedMutation[] = [];


        try {
            for (
                const item of
                prepared
            ) {
                /*
                 * Narrow the race window by checking again directly
                 * before each mutation.
                 */
                await assertNoSymbolicLinkTraversal(
                    repositoryRoot,
                    item.path
                );


                await assertSnapshotStillCurrent(
                    item.absolutePath,
                    item.path,
                    item.mutation
                        .originalContent
                );


                /*
                 * Add before mutation so a partially-failed write
                 * is also included in rollback.
                 */
                attempted.push(
                    item
                );


                if (
                    item.mutation
                        .operation ===
                    "delete"
                ) {
                    await rm(
                        item.absolutePath,
                        {
                            force:
                                false
                        }
                    );

                    continue;
                }


                await mkdir(
                    dirname(
                        item.absolutePath
                    ),
                    {
                        recursive:
                            true
                    }
                );


                /*
                 * mkdir may have created path components.
                 * Validate them before the final write.
                 */
                await assertNoSymbolicLinkTraversal(
                    repositoryRoot,
                    item.path
                );


                await writeFile(
                    item.absolutePath,
                    item.mutation
                        .content,
                    "utf8"
                );
            }
        } catch (
            error
        ) {
            const rollbackFailures:
                string[] = [];


            for (
                const item of
                attempted
                    .slice()
                    .reverse()
            ) {
                try {
                    await restoreMutationSnapshot(
                        repositoryRoot,
                        item
                    );
                } catch (
                    rollbackError
                ) {
                    rollbackFailures.push(
                        [
                            item.path,
                            describeError(
                                rollbackError
                            )
                        ].join(
                            ": "
                        )
                    );
                }
            }


            if (
                rollbackFailures.length >
                0
            ) {
                throw new Error(
                    [
                        "Surgical edit application failed and rollback was incomplete.",
                        `Original failure: ${describeError(error)}`,
                        "Rollback failures:",
                        ...rollbackFailures
                    ].join(
                        "\n"
                    ),
                    {
                        cause:
                            error
                    }
                );
            }


            throw error;
        }


        return prepared.map(
            item =>
                item.path
        );
    }


    private async prepareEdits(
        repositoryRoot:
            string,

        scope:
            IterationScope,

        edits:
            readonly SurgicalFileEdit[]
    ): Promise<SurgicalFileEdit[]> {
        const result:
            SurgicalFileEdit[] = [];


        for (
            const edit of
            edits
        ) {
            const path =
                normalizeRepositoryPath(
                    edit.path
                );


            this.guard
                .assertPathAllowed(
                    path,
                    scope
                );


            const absolute =
                resolve(
                    repositoryRoot,
                    path
                );


            assertInsideRepository(
                repositoryRoot,
                absolute
            );


            await assertNoSymbolicLinkTraversal(
                repositoryRoot,
                path
            );


            switch (
                edit.operation
            ) {
                case "insert_before":
                    result.push({
                        operation:
                            "insert_before",

                        path,

                        anchor:
                            edit.anchor,

                        content:
                            edit.content
                    });

                    break;


                case "insert_after":
                    result.push({
                        operation:
                            "insert_after",

                        path,

                        anchor:
                            edit.anchor,

                        content:
                            edit.content
                    });

                    break;

                case "create":
                    result.push({
                        operation:
                            "create",

                        path,

                        content:
                            edit.content
                    });

                    break;


                case "replace":
                    result.push({
                        operation:
                            "replace",

                        path,

                        oldText:
                            edit.oldText,

                        newText:
                            edit.newText
                    });

                    break;


                case "delete":
                    result.push({
                        operation:
                            "delete",

                        path
                    });

                    break;
            }
        }


        return result;
    }


    private async readSnapshots(
        repositoryRoot:
            string,

        edits:
            readonly SurgicalFileEdit[]
    ): Promise<SurgicalFileSnapshot[]> {
        const snapshots:
            SurgicalFileSnapshot[] = [];


        const seen =
            new Set<string>();


        for (
            const edit of
            edits
        ) {
            if (
                seen.has(
                    edit.path
                )
            ) {
                continue;
            }


            seen.add(
                edit.path
            );


            const absolute =
                resolve(
                    repositoryRoot,
                    edit.path
                );


            snapshots.push({
                path:
                    edit.path,

                content:
                    await readTextFileOrMissing(
                        absolute,
                        edit.path
                    )
            });
        }


        return snapshots;
    }
}


async function readTextFileOrMissing(
    absolutePath:
        string,

    repositoryPath:
        string
): Promise<string | null> {
    try {
        const buffer =
            await readFile(
                absolutePath
            );


        if (
            buffer.includes(
                0
            )
        ) {
            throw new Error(
                `Surgical edits refuse binary file content: ${repositoryPath}`
            );
        }


        return buffer.toString(
            "utf8"
        );
    } catch (
        error
    ) {
        if (
            isMissingFileError(
                error
            )
        ) {
            return null;
        }


        throw error;
    }
}


async function assertSnapshotStillCurrent(
    absolutePath:
        string,

    repositoryPath:
        string,

    expected:
        string | null
): Promise<void> {
    const current =
        await readTextFileOrMissing(
            absolutePath,
            repositoryPath
        );


    if (
        current !==
        expected
    ) {
        throw new Error(
            `Surgical edit snapshot became stale before application: ${repositoryPath}`
        );
    }
}


async function restoreMutationSnapshot(
    repositoryRoot:
        string,

    item:
        PreparedMutation
): Promise<void> {
    await assertNoSymbolicLinkTraversal(
        repositoryRoot,
        item.path
    );


    const original =
        item.mutation
            .originalContent;


    if (
        original ===
        null
    ) {
        await rm(
            item.absolutePath,
            {
                force:
                    true
            }
        );

        return;
    }


    await mkdir(
        dirname(
            item.absolutePath
        ),
        {
            recursive:
                true
        }
    );


    await assertNoSymbolicLinkTraversal(
        repositoryRoot,
        item.path
    );


    await writeFile(
        item.absolutePath,
        original,
        "utf8"
    );
}


function assertInsideRepository(
    repositoryRoot:
        string,

    absolute:
        string
): void {
    const root =
        resolve(
            repositoryRoot
        );


    const target =
        resolve(
            absolute
        );


    if (
        target !==
            root &&
        !target.startsWith(
            `${root}${process.platform === "win32" ? "\\" : "/"}`
        )
    ) {
        throw new Error(
            `Surgical edit path escapes repository: ${absolute}`
        );
    }
}


async function assertNoSymbolicLinkTraversal(
    repositoryRoot:
        string,

    repositoryPath:
        string
): Promise<void> {
    const root =
        resolve(
            repositoryRoot
        );


    const segments =
        normalizeRepositoryPath(
            repositoryPath
        ).split(
            "/"
        );


    let current =
        root;


    for (
        const segment of
        segments
    ) {
        current =
            resolve(
                current,
                segment
            );


        assertInsideRepository(
            root,
            current
        );


        try {
            const stat =
                await lstat(
                    current
                );


            if (
                stat.isSymbolicLink()
            ) {
                throw new Error(
                    `Surgical edits refuse symbolic link path: ${repositoryPath}`
                );
            }
        } catch (
            error
        ) {
            if (
                isMissingFileError(
                    error
                )
            ) {
                return;
            }


            throw error;
        }
    }
}


function isMissingFileError(
    value:
        unknown
): value is NodeJS.ErrnoException {
    return (
        value instanceof
            Error &&
        "code" in
            value &&
        (
            value as
                NodeJS.ErrnoException
        ).code ===
            "ENOENT"
    );
}


function describeError(
    value:
        unknown
): string {
    return value instanceof
        Error
        ? value.message
        : String(
            value
        );
}