
import { execFile } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

import {
    FreeformDependencyProvisioner
} from "../packages/freeform/dist/index.js";

import {
    GitWorktreeManager,
    DockerExecutionSandbox,
    DeterministicCommandVerifier,
    STRICT_VERIFICATION_EXECUTION_POLICY,
    createAutonomousRun
} from "../packages/autonomy/dist/index.js";

const execFileAsync = promisify(execFile);

const [repositoryRoot, dockerExecutable] =
    process.argv.slice(2);

if (
    !repositoryRoot ||
    !isAbsolute(repositoryRoot) ||
    !dockerExecutable ||
    !isAbsolute(dockerExecutable)
) {
    throw new Error(
        "Usage: node scripts/test-freeform-docker-verifier.mjs <absolute-game-root> <absolute-docker-path>"
    );
}

const image = "game-factory-freeform-verifier:pr2";

const provisioner = new FreeformDependencyProvisioner({
    dockerExecutable,
    image,
    storeVolume: "game-factory-freeform-pnpm-store"
});

const manager = new GitWorktreeManager({
    repositoryRoot,
    worktreesDirectory: join(
        repositoryRoot,
        ".game-factory",
        "wt"
    )
});

const worktree = await manager.create(
    "pr2-docker",
    "foundation",
    1
);

try {
    console.log("WORKTREE CREATED:", worktree.path);

    // Provisioning step: network access is allowed here.
    // Only trusted, locked dependencies are installed.
    
    console.log("Preparing Linux dependencies using shared pnpm store...");

    const installStartedAt = Date.now();

    await provisioner.prepare(worktree.path);

    console.log("LINUX DEPENDENCIES INSTALLED");
    console.log(
        `Provisioning duration: ${(
            (Date.now() - installStartedAt) / 1000
        ).toFixed(1)}s`
    );


    const sandbox = new DockerExecutionSandbox({
        dockerExecutable,
        image,
        memoryMb: 2048,
        cpus: 2,
        executableMap: {
            [process.execPath]: "/usr/local/bin/node"
        }
    });

    const checks = [
        {
            command: "verify:tsc",
            executable: process.execPath,
            args: [
                "node_modules/typescript/bin/tsc",
                "--noEmit"
            ],
            policy: STRICT_VERIFICATION_EXECUTION_POLICY
        },
        {
            command: "verify:vite",
            executable: process.execPath,
            args: [
                "node_modules/vite/bin/vite.js",
                "build"
            ],
            policy: STRICT_VERIFICATION_EXECUTION_POLICY
        }
    ];

    const verifier = new DeterministicCommandVerifier({
        sandbox,
        commands: checks
    });

    const run = createAutonomousRun({
        id: "pr2-docker-smoke",
        goal: "Verify Phaser workspace",
        maxIterations: 1
    });

    const contract = {
        id: "foundation",
        objective: "Verify the Phaser game scaffold",
        rationale: "Check the clean game environment",
        scope: {
            allowedPaths: ["src/main.ts"],
            forbiddenPaths: [".env"]
        },
        changes: [{
            description: "Verify scaffold"
        }],
        acceptanceCriteria: [
            "TypeScript passes",
            "Vite builds successfully"
        ],
        verification: [
            {
                id: "foundation-tsc",
                command: "verify:tsc",
                required: true
            },
            {
                id: "foundation-vite",
                command: "verify:vite",
                required: true
            }
        ],
        architecturalConstraints: [],
        maxLocalAttempts: 1,
        escalation: {
            onRepeatedFailure: false,
            onArchitectureConflict: false,
            maxRepairRounds: 0
        }
    };

    console.log("Running isolated Docker verification...");

    const report = await verifier.verify({
        run,
        contract,
        attempt: 1,
        workerResult: {
            summary: "Scaffold verification",
            changedFiles: []
        },
        workspace: {
            id: worktree.id,
            root: worktree.path,
            baseRevision: worktree.headSha
        }
    });

    for (const check of report.checks) {
        console.log(
            `${check.passed ? "PASS" : "FAIL"} ${check.id}`
        );

        if (!check.passed) {
            console.error(check.stderr);
            console.error(check.stdout);
        }
    }

    if (!report.passed) {
        throw new Error(
            "Docker verification failed"
        );
    }

    console.log(
        "FREEFORM DOCKER VERIFICATION PASSED"
    );


} finally {
    try {
        console.log("Cleaning Linux-generated artifacts...");

        await provisioner.cleanup(worktree.path);

        console.log("LINUX ARTIFACTS REMOVED");
    } finally {
        await manager.remove(worktree);

        console.log("WORKTREE REMOVED");
    }
}


