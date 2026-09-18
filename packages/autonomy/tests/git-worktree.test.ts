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