
import { execFile } from "node:child_process";
import {
    access,
    readFile,
    realpath
} from "node:fs/promises";
import {
    isAbsolute,
    join
} from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface FreeformDependencyProvisionerOptions {
    dockerExecutable: string;
    image: string;
    storeVolume?: string;

    // Injected for unit tests.
    runDocker?: (
        args: readonly string[],
        timeoutMs: number
    ) => Promise<void>;
}

export class FreeformDependencyProvisioner {
    private readonly image: string;
    private readonly storeVolume: string;

    private readonly runDocker: (
        args: readonly string[],
        timeoutMs: number
    ) => Promise<void>;

    constructor(
        options: FreeformDependencyProvisionerOptions
    ) {
        if (!isAbsolute(options.dockerExecutable)) {
            throw new Error(
                "dockerExecutable must be absolute"
            );
        }

        if (
            !options.image ||
            options.image.startsWith("-")
        ) {
            throw new Error("Invalid Docker image");
        }

        this.image = options.image;

        this.storeVolume =
            options.storeVolume ??
            "game-factory-freeform-pnpm-store";

        if (
            !/^[a-z][a-z0-9_-]{0,63}$/
                .test(this.storeVolume)
        ) {
            throw new Error(
                "Invalid Docker store volume"
            );
        }

        this.runDocker = options.runDocker ??
            (async (args, timeoutMs) => {
                await execFileAsync(
                    options.dockerExecutable,
                    [...args],
                    {
                        windowsHide: true,
                        timeout: timeoutMs,
                        maxBuffer: 4_000_000
                    }
                );
            });
    }

    async generateLockfile(workspaceRoot: string): Promise<void> {
        const root = await this.resolveRoot(workspaceRoot);

        const manifestPath = join(root, "package.json");
        const lockfilePath = join(root, "pnpm-lock.yaml");

        const originalManifest = await readFile(manifestPath);

        // Lockfile initialization must never overwrite
        // an existing dependency resolution.
        try {
            await access(lockfilePath);

            throw new Error(
                "Workspace already contains pnpm-lock.yaml"
            );
        } catch (error) {
            if (
                (error as NodeJS.ErrnoException).code !==
                "ENOENT"
            ) {
                throw error;
            }
        }

        await this.runDocker([
            "run",
            "--rm",
            "--pull", "never",
            "--network", "bridge",
            "--read-only",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--memory", "2g",
            "--pids-limit", "128",
            "--tmpfs", "/tmp:rw,nosuid,nodev,size=128m",
            "--volume", `${root}:/workspace`,
            "--mount",
            `type=volume,source=${this.storeVolume},target=/pnpm/store`,
            "--workdir", "/workspace",
            "--env", "CI=1",
            "--env", "HOME=/tmp",
            this.image,
            "pnpm",
            "install",
            "--lockfile-only",
            "--no-frozen-lockfile",
            "--ignore-scripts",
            "--ignore-workspace",
            "--store-dir=/pnpm/store"
        ], 180_000);

        // pnpm's lockfile-only mode can also update
        // package.json. Reject unexpected manifest changes.
        const updatedManifest = await readFile(manifestPath);

        if (!originalManifest.equals(updatedManifest)) {
            throw new Error(
                "Lockfile generation modified package.json"
            );
        }

        await access(lockfilePath);
    }

    async prepare(workspaceRoot: string): Promise<void> {
        const root = await this.resolveRoot(workspaceRoot);

        await Promise.all([
            access(join(root, "package.json")),
            access(join(root, "pnpm-lock.yaml"))
        ]);

        await this.runDocker([
            "run",
            "--rm",
            "--pull", "never",
            "--network", "bridge",
            "--read-only",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--memory", "2g",
            "--pids-limit", "128",
            "--tmpfs",
            "/tmp:rw,nosuid,nodev,size=128m",
            "--volume", `${root}:/workspace`,
            "--mount",
            `type=volume,source=${this.storeVolume},target=/pnpm/store`,
            "--workdir", "/workspace",
            "--env", "CI=1",
            "--env", "HOME=/tmp",
            this.image,
            "pnpm",
            "install",
            "--frozen-lockfile",
            "--ignore-scripts",
            "--ignore-workspace",
            "--store-dir=/pnpm/store"
        ], 180_000);
    }

    async cleanup(workspaceRoot: string): Promise<void> {
        const root = await this.resolveRoot(workspaceRoot);

        await this.runDocker([
            "run",
            "--rm",
            "--pull", "never",
            "--network", "none",
            "--read-only",
            "--cap-drop", "ALL",
            "--security-opt", "no-new-privileges",
            "--volume", `${root}:/workspace`,
            "--workdir", "/workspace",
            this.image,
            "sh",
            "-c",
            "rm -rf -- node_modules dist"
        ], 120_000);
    }

    private async resolveRoot(
        workspaceRoot: string
    ): Promise<string> {
        if (!isAbsolute(workspaceRoot)) {
            throw new Error(
                "Workspace root must be absolute"
            );
        }

        return realpath(workspaceRoot);
    }
}
