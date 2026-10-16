
import { execFile } from "node:child_process";
import {
    access,
    mkdtemp,
    readFile,
    rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { readdir, writeFile } from "node:fs/promises";
import { vi } from "vitest";

import {
    FreeformGameInitializer
} from "../src/workspace/FreeformGameInitializer.js";

import {
    afterEach,
    describe,
    expect,
    it
} from "vitest";

import type {
    FreeformBlueprint
} from "../src/contracts/FreeformBlueprint.js";

import {
    FreeformWorkspaceBootstrapper
} from "../src/workspace/FreeformWorkspaceBootstrapper.js";

const execFileAsync = promisify(execFile);
const temporaryRoots: string[] = [];

async function gamesDirectory(): Promise<string> {
    const root = await mkdtemp(
        join(tmpdir(), "game-factory-bootstrap-test-")
    );

    temporaryRoots.push(root);
    return join(root, "games");
}

afterEach(async () => {
    for (const root of temporaryRoots.splice(0)) {
        await rm(root, {
            recursive: true,
            force: true
        });
    }
});

function blueprint(): FreeformBlueprint {
    return {
        schemaVersion: "1.0",
        id: "brick_breaker",
        title: "Brick Breaker",
        pitch: "A small arcade brick breaker",
        target: "web",
        technology: {
            engine: "phaser",
            language: "typescript"
        },
        viewport: {
            width: 800,
            height: 600,
            orientation: "landscape"
        },
        controls: [{
            action: "move paddle",
            input: "keyboard",
            description: "Move horizontally"
        }],
        mechanics: [{
            id: "ball",
            rules: ["Ball bounces"],
            failureModes: ["Ball falls"]
        }],
        scenes: [{
            id: "game",
            purpose: "Gameplay",
            transitions: []
        }],
        visualStyle: {
            style: "minimal",
            paletteNotes: "Bright colors",
            camera: "fixed"
        },
        assets: [],
        acceptance: [{
            id: "playable",
            scenario: "Launch game",
            expected: "Game loads"
        }],
        constraints: {
            offlineRuntime: true,
            noRemoteCode: true,
            scope: "small-2d"
        }
    };
}

describe("FreeformWorkspaceBootstrapper", () => {
    it("creates a standalone Git-backed Phaser project", async () => {
        const bootstrapper = new FreeformWorkspaceBootstrapper({
            gamesDirectory: await gamesDirectory()
        });

        const result = await bootstrapper.create(blueprint());

        expect(result.blueprintId).toBe("brick_breaker");
        expect(result.headSha).toMatch(/^[a-f0-9]{40}$/);

        const manifest = JSON.parse(
            await readFile(
                join(result.root, "package.json"),
                "utf8"
            )
        );

        expect(manifest.dependencies.phaser).toBe("3.90.0");
        expect(manifest.devDependencies.vite).toBe("7.3.6");

        const entry = await readFile(
            join(result.root, "src", "main.ts"),
            "utf8"
        );

        expect(entry).toContain("new Phaser.Game");
        expect(entry).toContain("width: 800");
        expect(entry).toContain("height: 600");

        await access(join(result.root, "src", "game", ".gitkeep"));

        const { stdout } = await execFileAsync(
            "git",
            ["status", "--porcelain"],
            { cwd: result.root, encoding: "utf8" }
        );

        expect(stdout.trim()).toBe("");
    });

    it("never overwrites an existing workspace", async () => {
        const bootstrapper = new FreeformWorkspaceBootstrapper({
            gamesDirectory: await gamesDirectory()
        });

        const first = await bootstrapper.create(blueprint());

        await expect(
            bootstrapper.create(blueprint())
        ).rejects.toThrow();

        const entry = await readFile(
            join(first.root, "src", "main.ts"),
            "utf8"
        );

        expect(entry).toContain("new Phaser.Game");
    });

    it("rejects an invalid Blueprint before creating files", async () => {
        const directory = await gamesDirectory();

        const bootstrapper = new FreeformWorkspaceBootstrapper({
            gamesDirectory: directory
        });

        const value = blueprint();
        value.id = "../outside";

        await expect(
            bootstrapper.create(value)
        ).rejects.toThrow("invalid Blueprint");

        await expect(
            access(directory)
        ).rejects.toThrow();
    });

    it("escapes HTML in game titles", async () => {
        const value = blueprint();
        value.title = "<Paddle & Ball>";

        const bootstrapper = new FreeformWorkspaceBootstrapper({
            gamesDirectory: await gamesDirectory()
        });

        const result = await bootstrapper.create(value);

        const html = await readFile(
            join(result.root, "index.html"),
            "utf8"
        );

        expect(html).toContain(
            "&lt;Paddle &amp; Ball&gt;"
        );
    });

    it("rejects Windows reserved directory names", async () => {
        const value = blueprint();
        value.id = "con";

        const bootstrapper = new FreeformWorkspaceBootstrapper({
            gamesDirectory: await gamesDirectory()
        });

        await expect(
            bootstrapper.create(value)
        ).rejects.toThrow(
            "Reserved workspace directory name"
        );
    });
});


describe("FreeformGameInitializer", () => {
    it("creates a clean Git repository with committed lockfile", async () => {
        const directory = await gamesDirectory();

        const generateLockfile = vi.fn(
            async (root: string): Promise<void> => {
                await writeFile(
                    join(root, "pnpm-lock.yaml"),
                    "lockfileVersion: '9.0'\n"
                );
            }
        );

        const initializer = new FreeformGameInitializer({
            gamesDirectory: directory,
            provisioner: { generateLockfile }
        });

        const result = await initializer.create(blueprint());

        expect(generateLockfile).toHaveBeenCalledOnce();

        expect(result.headSha).toMatch(/^[a-f0-9]{40}$/);

        const history = await execFileAsync(
            "git",
            ["log", "-2", "--format=%s"],
            { cwd: result.root, encoding: "utf8" }
        );

        expect(history.stdout).toContain(
            "chore: lock game dependencies"
        );

        expect(history.stdout).toContain(
            "chore: bootstrap freeform game"
        );

        const status = await execFileAsync(
            "git",
            ["status", "--porcelain"],
            { cwd: result.root, encoding: "utf8" }
        );

        expect(status.stdout.trim()).toBe("");
    });

    it("removes incomplete workspaces when provisioning fails", async () => {
        const directory = await gamesDirectory();

        const initializer = new FreeformGameInitializer({
            gamesDirectory: directory,
            provisioner: {
                generateLockfile: async () => {
                    throw new Error("Provisioning failed");
                }
            }
        });

        await expect(
            initializer.create(blueprint())
        ).rejects.toThrow("Provisioning failed");

        expect(await readdir(directory)).toEqual([]);
    });

    it("rejects unexpected files generated during initialization", async () => {
        const directory = await gamesDirectory();

        const initializer = new FreeformGameInitializer({
            gamesDirectory: directory,
            provisioner: {
                generateLockfile: async (root: string) => {
                    await writeFile(
                        join(root, "pnpm-lock.yaml"),
                        "lockfileVersion: '9.0'\n"
                    );

                    await writeFile(
                        join(root, "unexpected.txt"),
                        "unexpected"
                    );
                }
            }
        });

        await expect(
            initializer.create(blueprint())
        ).rejects.toThrow(
            "Unexpected changes during lockfile generation"
        );

        expect(await readdir(directory)).toEqual([]);
    });

    it("does not overwrite a previously initialized game", async () => {
        const directory = await gamesDirectory();

        const generateLockfile = vi.fn(
            async (root: string): Promise<void> => {
                await writeFile(
                    join(root, "pnpm-lock.yaml"),
                    "lockfileVersion: '9.0'\n"
                );
            }
        );

        const initializer = new FreeformGameInitializer({
            gamesDirectory: directory,
            provisioner: { generateLockfile }
        });

        const first = await initializer.create(blueprint());

        await expect(
            initializer.create(blueprint())
        ).rejects.toThrow();

        expect(generateLockfile).toHaveBeenCalledTimes(1);

        const manifest = await readFile(
            join(first.root, "package.json"),
            "utf8"
        );

        expect(manifest).toContain("game-brick_breaker");
    });
});
