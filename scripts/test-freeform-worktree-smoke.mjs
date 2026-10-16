
import {
    GitWorktreeManager
} from "../packages/autonomy/dist/index.js";

const repositoryRoot = process.argv[2];

if (!repositoryRoot) {
    throw new Error(
        "Usage: node scripts/test-freeform-worktree-smoke.mjs <gameRoot>"
    );
}

const manager = new GitWorktreeManager({
    repositoryRoot
});

const worktree = await manager.create(
    "pr2-smoke",
    "foundation",
    1
);

try {
    console.log("WORKTREE CREATED");
    console.log("Path:", worktree.path);
    console.log("Base SHA:", worktree.headSha);
} finally {
    await manager.remove(worktree);
    console.log("WORKTREE REMOVED");
}
