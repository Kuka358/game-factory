
import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { promisify } from "node:util";

import type {
    FreeformDependencyProvisioner
} from "./FreeformDependencyProvisioner.js";

import {
    FreeformWorkspaceBootstrapper,
    type FreeformWorkspaceResult
} from "./FreeformWorkspaceBootstrapper.js";

const execFileAsync = promisify(execFile);

export interface FreeformGameInitializerOptions {
    gamesDirectory: string;

    provisioner: Pick<
        FreeformDependencyProvisioner,
        "generateLockfile"
    >;
}

export class FreeformGameInitializer {
    private readonly bootstrapper:
        FreeformWorkspaceBootstrapper;

    private readonly provisioner:
        FreeformGameInitializerOptions["provisioner"];

    constructor(options: FreeformGameInitializerOptions) {
        this.bootstrapper = new FreeformWorkspaceBootstrapper({
            gamesDirectory: options.gamesDirectory
        });

        this.provisioner = options.provisioner;
    }

    async create(input: unknown): Promise<FreeformWorkspaceResult> {
        // Bootstrapper validates the Blueprint, creates a new
        // directory, and commits the trusted game scaffold.
        const workspace = await this.bootstrapper.create(input);

        try {
            await this.provisioner.generateLockfile(
                workspace.root
            );

            // Only the lockfile may have been created.
            // Reject unexpected changes before staging.
            const status = await git(workspace.root, [
                "status",
                "--porcelain=v1",
                "--untracked-files=all"
            ]);

            if (status.trim() !== "?? pnpm-lock.yaml") {
                throw new Error(
                    "Unexpected changes during lockfile generation: " +
                    status
                );
            }

            await git(workspace.root, [
                "add",
                "--",
                "pnpm-lock.yaml"
            ]);

            const staged = await git(workspace.root, [
                "diff",
                "--cached",
                "--name-only"
            ]);

            if (staged.trim() !== "pnpm-lock.yaml") {
                throw new Error(
                    "Unexpected staged files during initialization"
                );
            }

            await git(workspace.root, [
                "-c", "user.name=Game Factory",
                "-c", "user.email=game-factory@localhost",
                "-c", "commit.gpgsign=false",
                "commit",
                "-m", "chore: lock game dependencies",
                "--only",
                "--",
                "pnpm-lock.yaml"
            ]);

            const finalStatus = await git(workspace.root, [
                "status",
                "--porcelain=v1",
                "--untracked-files=all"
            ]);

            if (finalStatus.trim().length > 0) {
                throw new Error(
                    "Initialized game repository is not clean"
                );
            }

            const headSha = await git(workspace.root, [
                "rev-parse",
                "HEAD"
            ]);

            if (headSha === workspace.headSha) {
                throw new Error(
                    "Lockfile commit did not advance HEAD"
                );
            }

            return {
                ...workspace,
                headSha
            };
        } catch (error) {
            // WorkspaceBootstrapper created this directory
            // exclusively for this initialization attempt.
            // Do not leave a partially initialized game.
            try {
                await rm(workspace.root, {
                    recursive: true,
                    force: true,
                    maxRetries: 3,
                    retryDelay: 100
                });
            } catch (cleanupError) {
                throw new AggregateError(
                    [error, cleanupError],
                    "Game initialization and cleanup both failed"
                );
            }

            throw error;
        }
    }
}

async function git(
    cwd: string,
    args: readonly string[]
): Promise<string> {
    const platformArgs =
        process.platform === "win32"
            ? ["-c", "core.longpaths=true"]
            : [];

    const result = await execFileAsync(
        "git",
        [...platformArgs, ...args],
        {
            cwd,
            encoding: "utf8",
            windowsHide: true,
            timeout: 30_000
        }
    );

    return result.stdout.trim();
}
