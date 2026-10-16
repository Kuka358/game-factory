
import {
    mkdtemp,
    writeFile,
    rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    afterEach,
    describe,
    expect,
    it,
    vi
} from "vitest";

import {
    FreeformDependencyProvisioner
} from "../src/workspace/FreeformDependencyProvisioner.js";

const directories: string[] = [];

async function workspace(): Promise<string> {
    const root = await mkdtemp(
        join(tmpdir(), "freeform-provisioner-")
    );

    directories.push(root);
    return root;
}

afterEach(async () => {
    for (const root of directories.splice(0)) {
        await rm(root, {
            recursive: true,
            force: true
        });
    }
});

function createProvisioner(
    runDocker: (
        args: readonly string[],
        timeoutMs: number
    ) => Promise<void>
): FreeformDependencyProvisioner {
    return new FreeformDependencyProvisioner({
        dockerExecutable:
            process.platform === "win32"
                ? "C:\\docker.exe"
                : "/usr/bin/docker",
        image: "game-factory-freeform-verifier:pr2",
        runDocker
    });
}

describe("FreeformDependencyProvisioner", () => {
    it("installs locked dependencies with a shared store", async () => {
        const root = await workspace();

        await writeFile(
            join(root, "package.json"),
            "{}"
        );

        await writeFile(
            join(root, "pnpm-lock.yaml"),
            "lockfileVersion: '9.0'"
        );

        const runner = vi.fn(async () => {});

        await createProvisioner(runner).prepare(root);

        expect(runner).toHaveBeenCalledOnce();

        const args = runner.mock.calls[0]![0] as string[];

        expect(args).toContain("--frozen-lockfile");
        expect(args).toContain("--ignore-scripts");
        expect(args).toContain("--ignore-workspace");

        expect(args).toContain(
            "type=volume,source=game-factory-freeform-pnpm-store,target=/pnpm/store"
        );

        expect(args).toContain("bridge");
    });

    it("cleans artifacts without network access", async () => {
        const root = await workspace();
        const runner = vi.fn(async () => {});

        await createProvisioner(runner).cleanup(root);

        const args = runner.mock.calls[0]![0] as string[];

        expect(args).toContain("none");
        expect(args).toContain("rm -rf -- node_modules dist");
        expect(args).not.toContain("bridge");
    });

    it("generates a lockfile without installing node_modules", async () => {
        const root = await workspace();

        await writeFile(
            join(root, "package.json"),
            '{"name":"test-game"}\n'
        );

        const runner = vi.fn(
            async (
                args: readonly string[],
                _timeoutMs: number
            ): Promise<void> => {
                expect(args).toContain("--lockfile-only");
                expect(args).toContain("--no-frozen-lockfile");
                expect(args).toContain("--ignore-scripts");
                expect(args).toContain("--ignore-workspace");

                await writeFile(
                    join(root, "pnpm-lock.yaml"),
                    "lockfileVersion: '9.0'\n"
                );
            }
        );

        await createProvisioner(runner).generateLockfile(root);

        expect(runner).toHaveBeenCalledOnce();
    });

    it("refuses to replace an existing lockfile", async () => {
        const root = await workspace();

        await writeFile(
            join(root, "package.json"),
            '{"name":"test-game"}\n'
        );

        await writeFile(
            join(root, "pnpm-lock.yaml"),
            "lockfileVersion: '9.0'\n"
        );

        const runner = vi.fn(
            async (
                _args: readonly string[],
                _timeoutMs: number
            ): Promise<void> => {}
        );

        await expect(
            createProvisioner(runner).generateLockfile(root)
        ).rejects.toThrow("already contains");

        expect(runner).not.toHaveBeenCalled();
    });

    it("detects unexpected manifest modifications", async () => {
        const root = await workspace();

        await writeFile(
            join(root, "package.json"),
            '{"name":"test-game"}\n'
        );

        const runner = vi.fn(
            async (
                _args: readonly string[],
                _timeoutMs: number
            ): Promise<void> => {
                await writeFile(
                    join(root, "pnpm-lock.yaml"),
                    "lockfileVersion: '9.0'\n"
                );

                await writeFile(
                    join(root, "package.json"),
                    '{"name":"unexpected-game"}\n'
                );
            }
        );

        await expect(
            createProvisioner(runner).generateLockfile(root)
        ).rejects.toThrow(
            "Lockfile generation modified package.json"
        );
    });


    it("rejects workspaces without a lockfile", async () => {
        const root = await workspace();

        await writeFile(
            join(root, "package.json"),
            "{}"
        );

        const runner = vi.fn(async () => {});

        await expect(
            createProvisioner(runner).prepare(root)
        ).rejects.toThrow();

        expect(runner).not.toHaveBeenCalled();
    });
});
