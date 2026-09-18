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
    GitCheckpointManager
} from "../src/index.js";


const execFileAsync =
    promisify(
        execFile
    );


describe(
    "GitCheckpointManager",
    () => {
        it(
            "restores only changed files inside iteration scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    const checkpoint =
                        await manager.create(
                            "run-001",
                            "iteration-001",
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "file.txt"
                        ),
                        "changed\n",
                        "utf8"
                    );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "new.txt"
                        ),
                        "new\n",
                        "utf8"
                    );

                    await writeFile(
                        join(
                            repository,
                            "outside.txt"
                        ),
                        "outside changed\n",
                        "utf8"
                    );

                    await manager.restore(
                        checkpoint
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "file.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
                    );

                    await expect(
                        readFile(
                            join(
                                repository,
                                "src",
                                "new.txt"
                            ),
                            "utf8"
                        )
                    ).rejects.toMatchObject({
                        code:
                            "ENOENT"
                    });

                    expect(
                        await readFile(
                            join(
                                repository,
                                "outside.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "outside changed\n"
                    );

                    await manager.release(
                        checkpoint
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
            "restores staged changes inside iteration scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    const checkpoint =
                        await manager.create(
                            "run-staged",
                            "iteration-staged",
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "file.txt"
                        ),
                        "staged change\n",
                        "utf8"
                    );

                    await runGit(
                        repository,
                        [
                            "add",
                            "src/file.txt"
                        ]
                    );

                    await manager.restore(
                        checkpoint
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "file.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
                    );

                    const status =
                        await readGit(
                            repository,
                            [
                                "status",
                                "--porcelain"
                            ]
                        );

                    expect(
                        status
                    ).toBe(
                        ""
                    );

                    await manager.release(
                        checkpoint
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
            "rejects a dirty iteration scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "src",
                            "file.txt"
                        ),
                        "already dirty\n",
                        "utf8"
                    );

                    const manager =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    await expect(
                        manager.create(
                            "run-002",
                            "iteration-001",
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        )
                    ).rejects.toThrow(
                        "iteration scope is not clean"
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
            "restores a durable checkpoint with a new manager instance",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const firstManager =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    const checkpoint =
                        await firstManager.create(
                            "run-restart",
                            "iteration-restart",
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "file.txt"
                        ),
                        "interrupted worker state\n",
                        "utf8"
                    );

                    const restartedManager =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    await restartedManager.restore(
                        checkpoint
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "file.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
                    );

                    await restartedManager.release(
                        checkpoint
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
            "refuses to restore when HEAD changed after checkpoint creation",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    const checkpoint =
                        await manager.create(
                            "run-head-change",
                            "iteration-head-change",
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        );

                    await writeFile(
                        join(
                            repository,
                            "outside.txt"
                        ),
                        "new committed state\n",
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
                            "move HEAD"
                        ]
                    );

                    await writeFile(
                        join(
                            repository,
                            "src",
                            "file.txt"
                        ),
                        "worker change\n",
                        "utf8"
                    );

                    await expect(
                        manager.restore(
                            checkpoint
                        )
                    ).rejects.toThrow(
                        "HEAD changed"
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "file.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "worker change\n"
                    );

                    await manager.release(
                        checkpoint
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
            "allows pre-existing changes outside iteration scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "outside.txt"
                        ),
                        "user change\n",
                        "utf8"
                    );

                    const manager =
                        new GitCheckpointManager({
                            repositoryRoot:
                                repository
                        });

                    const checkpoint =
                        await manager.create(
                            "run-003",
                            "iteration-001",
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        );

                    expect(
                        checkpoint.id.startsWith(
                            "git:"
                        )
                    ).toBe(
                        true
                    );

                    await manager.release(
                        checkpoint
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
                "game-factory-git-checkpoint-"
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
            "file.txt"
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

async function readGit(
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