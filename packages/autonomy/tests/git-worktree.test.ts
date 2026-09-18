import {
    execFile
} from "node:child_process";

import {
    access,
    mkdtemp,
    mkdir,
    readFile,
    rm,
    unlink,
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
    GitWorktreeManager
} from "../src/index.js";


const execFileAsync =
    promisify(
        execFile
    );


describe(
    "GitWorktreeManager",
    () => {
        it(
            "creates an isolated detached worktree",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "src",
                            "main.txt"
                        ),
                        "dirty main workspace\n",
                        "utf8"
                    );

                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "run-001",
                            "iteration-001",
                            1
                        );

                    expect(
                        await readFile(
                            join(
                                worktree.path,
                                "src",
                                "main.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
                    );

                    await manager.remove(
                        worktree
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
            "collects tracked deleted and untracked changes",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "run-002",
                            "iteration-001",
                            1
                        );

                    await writeFile(
                        join(
                            worktree.path,
                            "src",
                            "main.txt"
                        ),
                        "changed\n",
                        "utf8"
                    );

                    await unlink(
                        join(
                            worktree.path,
                            "src",
                            "remove.txt"
                        )
                    );

                    await writeFile(
                        join(
                            worktree.path,
                            "src",
                            "new.txt"
                        ),
                        "new\n",
                        "utf8"
                    );

                    const changes =
                        await manager
                            .collectChanges(
                                worktree
                            );

                    expect(
                        [...changes.changedFiles]
                            .sort()
                    ).toEqual([
                        "src/main.txt",
                        "src/new.txt",
                        "src/remove.txt"
                    ]);

                    await manager.remove(
                        worktree
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
            "rejects real changes outside iteration scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "run-003",
                            "iteration-001",
                            1
                        );

                    await writeFile(
                        join(
                            worktree.path,
                            "outside.txt"
                        ),
                        "unauthorized\n",
                        "utf8"
                    );

                    await expect(
                        manager.assertChangesAllowed(
                            worktree,
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            }
                        )
                    ).rejects.toThrow(
                        "outside iteration scope"
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "outside.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "outside original\n"
                    );

                    await manager.remove(
                        worktree
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
            "promotes the verified changeset while preserving dirty files outside scope",
            async () => {
                const repository =
                    await createRepository();

                try {
                    await writeFile(
                        join(
                            repository,
                            "outside.txt"
                        ),
                        "dirty outside\n",
                        "utf8"
                    );

                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "promotion-run",
                            "iteration",
                            1
                        );

                    await writeFile(
                        join(
                            worktree.path,
                            "src",
                            "main.txt"
                        ),
                        "promoted\n",
                        "utf8"
                    );

                    await unlink(
                        join(
                            worktree.path,
                            "src",
                            "remove.txt"
                        )
                    );

                    await writeFile(
                        join(
                            worktree.path,
                            "src",
                            "new.txt"
                        ),
                        "new file\n",
                        "utf8"
                    );

                    const snapshot =
                        await manager
                            .snapshotAllowedChanges(
                                worktree,
                                {
                                    allowedPaths: [
                                        "src/**"
                                    ],

                                    forbiddenPaths:
                                        []
                                }
                            );

                    await manager.promote(
                        worktree,
                        {
                            allowedPaths: [
                                "src/**"
                            ],

                            forbiddenPaths:
                                []
                        },
                        snapshot.digest
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "main.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "promoted\n"
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "new.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "new file\n"
                    );

                    await expect(
                        access(
                            join(
                                repository,
                                "src",
                                "remove.txt"
                            )
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
                        "dirty outside\n"
                    );

                    await manager.remove(
                        worktree
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
            "refuses promotion when the verified changeset changed afterwards",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "digest-run",
                            "iteration",
                            1
                        );

                    await writeFile(
                        join(
                            worktree.path,
                            "src",
                            "main.txt"
                        ),
                        "verified version\n",
                        "utf8"
                    );

                    const snapshot =
                        await manager
                            .snapshotAllowedChanges(
                                worktree,
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
                            worktree.path,
                            "src",
                            "main.txt"
                        ),
                        "changed after verify\n",
                        "utf8"
                    );

                    await expect(
                        manager.promote(
                            worktree,
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            },
                            snapshot.digest
                        )
                    ).rejects.toThrow(
                        "changeset changed after verification"
                    );

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "main.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
                    );

                    await manager.remove(
                        worktree
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
            "refuses promotion when the main iteration scope became dirty",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "dirty-main-run",
                            "iteration",
                            1
                        );

                    await writeFile(
                        join(
                            worktree.path,
                            "src",
                            "main.txt"
                        ),
                        "isolated\n",
                        "utf8"
                    );

                    const snapshot =
                        await manager
                            .snapshotAllowedChanges(
                                worktree,
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
                            "main.txt"
                        ),
                        "user change\n",
                        "utf8"
                    );

                    await expect(
                        manager.promote(
                            worktree,
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            },
                            snapshot.digest
                        )
                    ).rejects.toThrow(
                        "main iteration scope is dirty"
                    );

                    await manager.remove(
                        worktree
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
            "refuses promotion when main HEAD changed",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "head-run",
                            "iteration",
                            1
                        );

                    await writeFile(
                        join(
                            worktree.path,
                            "src",
                            "main.txt"
                        ),
                        "isolated\n",
                        "utf8"
                    );

                    const snapshot =
                        await manager
                            .snapshotAllowedChanges(
                                worktree,
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
                        "new committed value\n",
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

                    await expect(
                        manager.promote(
                            worktree,
                            {
                                allowedPaths: [
                                    "src/**"
                                ],

                                forbiddenPaths:
                                    []
                            },
                            snapshot.digest
                        )
                    ).rejects.toThrow(
                        "repository HEAD changed"
                    );

                    await manager.remove(
                        worktree
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
            "allows isolated worktree removal to be retried",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "remove-retry",
                            "iteration",
                            1
                        );

                    await manager.remove(
                        worktree
                    );

                    await expect(
                        manager.remove(
                            worktree
                        )
                    ).resolves.toBeUndefined();
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
            "removes only the isolated worktree",
            async () => {
                const repository =
                    await createRepository();

                try {
                    const manager =
                        new GitWorktreeManager({
                            repositoryRoot:
                                repository
                        });

                    const worktree =
                        await manager.create(
                            "run-004",
                            "iteration-001",
                            1
                        );

                    await manager.remove(
                        worktree
                    );

                    await expect(
                        access(
                            worktree.path
                        )
                    ).rejects.toMatchObject({
                        code:
                            "ENOENT"
                    });

                    expect(
                        await readFile(
                            join(
                                repository,
                                "src",
                                "main.txt"
                            ),
                            "utf8"
                        )
                    ).toBe(
                        "original\n"
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
                "game-factory-worktree-"
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
            "src",
            "remove.txt"
        ),
        "remove me\n",
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