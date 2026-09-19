export interface SurgicalCreateFileEdit {
    operation:
        "create";

    path:
        string;

    content:
        string;
}


export interface SurgicalReplaceEdit {
    operation:
        "replace";

    path:
        string;

    /**
     * Exact text copied from the current file.
     *
     * It must occur exactly once in the current virtual file state.
     */
    oldText:
        string;

    newText:
        string;
}


export interface SurgicalDeleteFileEdit {
    operation:
        "delete";

    path:
        string;
}


export type SurgicalFileEdit =
    | SurgicalCreateFileEdit
    | SurgicalReplaceEdit
    | SurgicalDeleteFileEdit;


export interface SurgicalFileSnapshot {
    path:
        string;

    /**
     * null means that the file does not exist.
     *
     * Empty files are represented by "".
     */
    content:
        string | null;
}


export interface PlannedSurgicalFileMutation {
    path:
        string;

    operation:
        "write" | "delete";

    /**
     * Content observed before the edit batch.
     *
     * Later the filesystem applicator can use this value to detect
     * concurrent/stale changes before touching the worktree.
     */
    originalContent:
        string | null;

    /**
     * Complete final content for write operations.
     *
     * Delete operations always use "".
     */
    content:
        string;
}


interface MutableFileState {
    originalContent:
        string | null;

    currentContent:
        string | null;
}


/**
 * Validate and calculate a complete edit batch entirely in memory.
 *
 * No filesystem mutation happens here. If any edit is invalid the
 * complete batch fails and no mutation plan is returned.
 */
export function planSurgicalEdits(
    snapshots:
        readonly SurgicalFileSnapshot[],

    edits:
        readonly SurgicalFileEdit[]
): PlannedSurgicalFileMutation[] {
    const states =
        new Map<
            string,
            MutableFileState
        >();


    for (
        const snapshot of
        snapshots
    ) {
        const path =
            normalizeSurgicalPath(
                snapshot.path
            );


        if (
            states.has(
                path
            )
        ) {
            throw new Error(
                `Duplicate surgical edit snapshot: ${path}`
            );
        }


        if (
            snapshot.content !==
                null &&
            typeof snapshot.content !==
                "string"
        ) {
            throw new Error(
                `Invalid surgical edit snapshot content: ${path}`
            );
        }


        states.set(
            path,
            {
                originalContent:
                    snapshot.content,

                currentContent:
                    snapshot.content
            }
        );
    }


    const touchedPaths:
        string[] = [];

    const touched =
        new Set<string>();


    for (
        const edit of
        edits
    ) {
        const path =
            normalizeSurgicalPath(
                edit.path
            );


        const state =
            states.get(
                path
            );


        if (!state) {
            throw new Error(
                `Surgical edit has no file snapshot: ${path}`
            );
        }


        switch (
            edit.operation
        ) {
            case "create": {
                validateString(
                    edit.content,
                    `create content for ${path}`
                );


                /*
                 * Checking originalContent, rather than only the
                 * current virtual state, prevents:
                 *
                 *   delete existing file
                 *   create same file with arbitrary full content
                 *
                 * from becoming a full-file rewrite escape hatch.
                 */
                if (
                    state.originalContent !==
                    null
                ) {
                    throw new Error(
                        `Surgical create requires a missing file: ${path}`
                    );
                }


                if (
                    state.currentContent !==
                    null
                ) {
                    throw new Error(
                        `Surgical file was already created in this batch: ${path}`
                    );
                }


                state.currentContent =
                    edit.content;

                break;
            }


            case "replace": {
                validateString(
                    edit.oldText,
                    `replace oldText for ${path}`
                );


                validateString(
                    edit.newText,
                    `replace newText for ${path}`
                );


                if (
                    state.currentContent ===
                    null
                ) {
                    throw new Error(
                        `Surgical replace requires an existing file: ${path}`
                    );
                }


                if (
                    edit.oldText.length ===
                    0
                ) {
                    throw new Error(
                        `Surgical replace oldText must not be empty: ${path}`
                    );
                }


                if (
                    edit.oldText ===
                    edit.newText
                ) {
                    throw new Error(
                        `Surgical replace must change content: ${path}`
                    );
                }


                const occurrences =
                    countOccurrences(
                        state.currentContent,
                        edit.oldText
                    );


                if (
                    occurrences ===
                    0
                ) {
                    throw new Error(
                        `Surgical replace anchor was not found: ${path}`
                    );
                }


                if (
                    occurrences >
                    1
                ) {
                    throw new Error(
                        `Surgical replace anchor is ambiguous (${occurrences} matches): ${path}`
                    );
                }


                state.currentContent =
                    replaceExactOnce(
                        state.currentContent,
                        edit.oldText,
                        edit.newText
                    );

                break;
            }


            case "delete": {
                /*
                 * A file created earlier in this batch may not be
                 * deleted again. It is unnecessary work and would
                 * make the protocol easier to abuse.
                 */
                if (
                    state.originalContent ===
                    null
                ) {
                    throw new Error(
                        `Surgical delete requires a file that existed before the batch: ${path}`
                    );
                }


                if (
                    state.currentContent ===
                    null
                ) {
                    throw new Error(
                        `Surgical file was already deleted in this batch: ${path}`
                    );
                }


                state.currentContent =
                    null;

                break;
            }


            default: {
                const unreachable:
                    never =
                    edit;


                throw new Error(
                    `Unsupported surgical edit operation: ${String(
                        (
                            unreachable as {
                                operation?:
                                    unknown;
                            }
                        ).operation
                    )}`
                );
            }
        }


        if (
            !touched.has(
                path
            )
        ) {
            touched.add(
                path
            );

            touchedPaths.push(
                path
            );
        }
    }


    const result:
        PlannedSurgicalFileMutation[] = [];


    for (
        const path of
        touchedPaths
    ) {
        const state =
            states.get(
                path
            );


        if (!state) {
            throw new Error(
                `Missing surgical edit state: ${path}`
            );
        }


        /*
         * Multiple valid replacements could theoretically cancel
         * each other. Do not report a mutation when the final state
         * is byte-for-byte identical to the original snapshot.
         */
        if (
            state.currentContent ===
            state.originalContent
        ) {
            continue;
        }


        if (
            state.currentContent ===
            null
        ) {
            result.push({
                path,

                operation:
                    "delete",

                originalContent:
                    state.originalContent,

                content:
                    ""
            });

            continue;
        }


        result.push({
            path,

            operation:
                "write",

            originalContent:
                state.originalContent,

            content:
                state.currentContent
        });
    }


    return result;
}


function replaceExactOnce(
    content:
        string,

    oldText:
        string,

    newText:
        string
): string {
    const index =
        content.indexOf(
            oldText
        );


    if (
        index <
        0
    ) {
        /*
         * Normally unreachable because occurrence count was already
         * checked, but keep this helper independently safe.
         */
        throw new Error(
            "Surgical replacement anchor disappeared"
        );
    }


    return (
        content.slice(
            0,
            index
        ) +
        newText +
        content.slice(
            index +
            oldText.length
        )
    );
}


function countOccurrences(
    content:
        string,

    search:
        string
): number {
    let count =
        0;

    let offset =
        0;


    while (
        offset <=
        content.length -
            search.length
    ) {
        const index =
            content.indexOf(
                search,
                offset
            );


        if (
            index <
            0
        ) {
            break;
        }


        count +=
            1;


        /*
         * Advance by one rather than search.length so overlapping
         * anchors are considered ambiguous too.
         */
        offset =
            index +
            1;
    }


    return count;
}


function normalizeSurgicalPath(
    value:
        string
): string {
    if (
        typeof value !==
        "string"
    ) {
        throw new Error(
            "Surgical edit path must be a string"
        );
    }


    const normalized =
        value.trim();


    if (
        normalized.length ===
        0
    ) {
        throw new Error(
            "Surgical edit path must not be empty"
        );
    }


    return normalized;
}


function validateString(
    value:
        unknown,

    name:
        string
): asserts value is string {
    if (
        typeof value !==
        "string"
    ) {
        throw new Error(
            `${name} must be a string`
        );
    }
}