import {
    execFile
} from "node:child_process";

import {
    mkdtemp,
    mkdir,
    readFile,
    rm,
    writeFile
} from "node:fs/promises";

import {
    tmpdir
} from "node:os";

import {
    join
} from "node:path";

import {
    promisify
} from "node:util";

import {
    describe,
    expect,
    it
} from "vitest";

import {
    VerifiedCommitManager
} from "../src/index.js";


const execFileAsync =
    promisify(
        execFile
    );


describe(
    "VerifiedCommitManager",
    () => {
        it(
            "commits only verified paths and advances HEAD",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const baseRevision =
                        await getHead(
                            repository
                        );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "main.txt"
                        ),
                        "verified\n",
                        "utf8"
                    );

                    const manager =
                        new VerifiedCommitManager({
                            repositoryRoot:
                                repository
                        });

                    const result =
                        await manager.commit({
                            baseRevision,

                            changedFiles: [
                                "src/main.txt"
                            ],

                            message:
                                "autonomy: verified iteration"
                        });

                    expect(
                        result.committed
                    ).toBe(
                        true
                    );

                    expect(
                        result.revision
                    ).not.toBe(
                        baseRevision
                    );

                    expect(
                        await getHead(
                            repository
                        )
                    ).toBe(
                        result.revision
                    );

                    expect(
                        await showFile(
                            repository,
                            "HEAD:src/main.txt"
                        )
                    ).toBe(
                        "verified\n"
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );


        it(
            "preserves unrelated staged and unstaged changes",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const baseRevision =
                        await getHead(
                            repository
                        );

                    await writeFile(
                        join(
                            repository,
                            "outside.txt"
                        ),
                        "staged user change\n",
                        "utf8"
                    );

                    await runGit(
                        repository,
                        [
                            "add",
                            "outside.txt"
                        ]
                    );

                    await writeFile(
                        join(
                            repository,
                            "other.txt"
                        ),
                        "unstaged user change\n",
                        "utf8"
                    );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "main.txt"
                        ),
                        "verified\n",
                        "utf8"
                    );

                    const manager =
                        new VerifiedCommitManager({
                            repositoryRoot:
                                repository
                        });

                    await manager.commit({
                        baseRevision,

                        changedFiles: [
                            "src/main.txt"
                        ],

                        message:
                            "autonomy: verified iteration"
                    });

                    expect(
                        await showFile(
                            repository,
                            "HEAD:src/main.txt"
                        )
                    ).toBe(
                        "verified\n"
                    );

                    expect(
                        await showFile(
                            repository,
                            "HEAD:outside.txt"
                        )
                    ).toBe(
                        "outside original\n"
                    );

                    const staged =
                        await runGitOutput(
                            repository,
                            [
                                "diff",
                                "--cached",
                                "--name-only"
                            ]
                        );

                    expect(
                        staged.trim()
                    ).toBe(
                        "outside.txt"
                    );

                    const unstaged =
                        await runGitOutput(
                            repository,
                            [
                                "diff",
                                "--name-only"
                            ]
                        );

                    expect(
                        unstaged
                    ).toContain(
                        "other.txt"
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );


        it(
            "refuses to commit when HEAD changed from the verified base",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const baseRevision =
                        await getHead(
                            repository
                        );

                    await writeFile(
                        join(
                            repository,
                            "outside.txt"
                        ),
                        "advance head\n",
                        "utf8"
                    );

                    await runGit(
                        repository,
                        [
                            "add",
                            "outside.txt"
                        ]
                    );

                    await runGit(
                        repository,
                        [
                            "commit",
                            "-m",
                            "advance head"
                        ]
                    );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "main.txt"
                        ),
                        "verified\n",
                        "utf8"
                    );

                    const manager =
                        new VerifiedCommitManager({
                            repositoryRoot:
                                repository
                        });

                    await expect(
                        manager.commit({
                            baseRevision,

                            changedFiles: [
                                "src/main.txt"
                            ],

                            message:
                                "autonomy: verified iteration"
                        })
                    ).rejects.toThrow(
                        "repository HEAD changed"
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );

        it(
            "commits newly created verified files without consuming unrelated staged changes",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const baseRevision =
                        await getHead(
                            repository
                        );

                    await writeFile(
                        join(
                            repository,
                            "outside.txt"
                        ),
                        "user staged change\n",
                        "utf8"
                    );

                    await runGit(
                        repository,
                        [
                            "add",
                            "outside.txt"
                        ]
                    );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "new.ts"
                        ),
                        "export const value = 42;\n",
                        "utf8"
                    );

                    const manager =
                        new VerifiedCommitManager({
                            repositoryRoot:
                                repository
                        });

                    const result =
                        await manager.commit({
                            baseRevision,

                            changedFiles: [
                                "src/new.ts"
                            ],

                            message:
                                "autonomy: add verified file"
                        });

                    expect(
                        result.committed
                    ).toBe(
                        true
                    );

                    expect(
                        await showFile(
                            repository,
                            "HEAD:src/new.ts"
                        )
                    ).toBe(
                        "export const value = 42;\n"
                    );

                    expect(
                        await showFile(
                            repository,
                            "HEAD:outside.txt"
                        )
                    ).toBe(
                        "outside original\n"
                    );

                    const staged =
                        await runGitOutput(
                            repository,
                            [
                                "diff",
                                "--cached",
                                "--name-only"
                            ]
                        );

                    expect(
                        staged.trim()
                    ).toBe(
                        "outside.txt"
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );


        it(
            "does not create a commit for an empty verified changeset",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const baseRevision =
                        await getHead(
                            repository
                        );

                    const manager =
                        new VerifiedCommitManager({
                            repositoryRoot:
                                repository
                        });

                    const result =
                        await manager.commit({
                            baseRevision,

                            changedFiles:
                                [],

                            message:
                                "autonomy: no-op iteration"
                        });

                    expect(
                        result
                    ).toEqual({
                        revision:
                            baseRevision,

                        committed:
                            false
                    });

                    expect(
                        await getHead(
                            repository
                        )
                    ).toBe(
                        baseRevision
                    );
                } finally {
                    await rm(
                        repository,
                        {
                            recursive:
                                true,

                            force:
                                true
                        }
                    );
                }
            }
        );
    }
);


async function createRepository():
    Promise<string>
{
    const repository =
        await mkdtemp(
            join(
                tmpdir(),
                "game-factory-verified-commit-"
            )
        );

    await runGit(
        repository,
        [
            "init"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.autocrlf",
            "false"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "core.eol",
            "lf"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.email",
            "test@example.com"
        ]
    );

    await runGit(
        repository,
        [
            "config",
            "user.name",
            "Game Factory Test"
        ]
    );

    await mkdir(
        join(
            repository,
            "src"
        ),
        {
            recursive:
                true
        }
    );

    await writeFile(
        join(
            repository,
            ".gitignore"
        ),
        ".game-factory/\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "src",
            "main.txt"
        ),
        "original\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "outside.txt"
        ),
        "outside original\n",
        "utf8"
    );

    await writeFile(
        join(
            repository,
            "other.txt"
        ),
        "other original\n",
        "utf8"
    );

    await runGit(
        repository,
        [
            "add",
            "."
        ]
    );

    await runGit(
        repository,
        [
            "commit",
            "-m",
            "initial"
        ]
    );

    return repository;
}


async function getHead(
    repository:
        string
): Promise<string> {
    return (
        await runGitOutput(
            repository,
            [
                "rev-parse",
                "HEAD"
            ]
        )
    ).trim();
}


async function showFile(
    repository:
        string,

    revisionPath:
        string
): Promise<string> {
    return runGitOutput(
        repository,
        [
            "show",
            revisionPath
        ]
    );
}


async function runGit(
    repository:
        string,

    args:
        readonly string[]
): Promise<void> {
    await execFileAsync(
        "git",
        [
            ...args
        ],
        {
            cwd:
                repository,

            encoding:
                "utf8",

            windowsHide:
                true
        }
    );
}


async function runGitOutput(
    repository:
        string,

    args:
        readonly string[]
): Promise<string> {
    const result =
        await execFileAsync(
            "git",
            [
                ...args
            ],
            {
                cwd:
                    repository,

                encoding:
                    "utf8",

                windowsHide:
                    true
            }
        );

    return String(
        result.stdout
    );
}