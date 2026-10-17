
import {
    mkdtemp,
    rm
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
    describe,
    expect,
    it,
    vi
} from "vitest";

import type {
    WorkerPreparationInput,
    WorkerSettlementInput,
    WorkerWorkspaceRef
} from "@game-factory/autonomy";

import {
    ProvisionedCodingWorker,
    type TransactionalCodingWorker
} from "../src/autonomy/ProvisionedCodingWorker.js";

async function fixture() {
    const root = await mkdtemp(
        join(tmpdir(), "freeform-worker-")
    );

    const workspace: WorkerWorkspaceRef = {
        id: "test-worktree",
        root,
        baseRevision: "a".repeat(40)
    };

    const events: string[] = [];

    const worker: TransactionalCodingWorker = {
        prepare: vi.fn(async () => {
            events.push("worker.prepare");
            return workspace;
        }),

        execute: vi.fn(async () => {
            events.push("worker.execute");

            return {
                summary: "Code written",
                changedFiles: []
            };
        }),

        settle: vi.fn(async () => {
            events.push("worker.settle");

            return {
                acceptedRevision: "b".repeat(40)
            };
        })
    };

    const provisioner = {
        prepare: vi.fn(async () => {
            events.push("dependencies.prepare");
        }),

        cleanup: vi.fn(async () => {
            events.push("dependencies.cleanup");
        })
    };

    // These are only forwarding tests; the wrapper does not
    // inspect the internals of the run or contract.
    const preparation = {
        run: {},
        contract: {}
    } as WorkerPreparationInput;

    const settlement = {
        ...preparation,
        workspace,
        outcome: "accept" as const,
        acceptanceId: "acceptance-1",
        workerResult: {
            summary: "Code written",
            changedFiles: [],
            changeSet: { digest: "digest-1" }
        }
    } satisfies WorkerSettlementInput;

    return {
        root,
        workspace,
        events,
        worker,
        provisioner,
        preparation,
        settlement
    };
}

describe("ProvisionedCodingWorker", () => {
    it("prepares dependencies before coding", async () => {
        const f = await fixture();

        try {
            const subject = new ProvisionedCodingWorker({
                worker: f.worker,
                provisioner: f.provisioner
            });

            await subject.prepare(f.preparation);

            expect(f.events).toEqual([
                "worker.prepare",
                "dependencies.prepare"
            ]);
        } finally {
            await rm(f.root, {
                recursive: true,
                force: true
            });
        }
    });

    it("cleans dependencies before accepting changes", async () => {
        const f = await fixture();

        try {
            const subject = new ProvisionedCodingWorker({
                worker: f.worker,
                provisioner: f.provisioner
            });

            await subject.prepare(f.preparation);
            await subject.settle(f.settlement);

            expect(f.events).toEqual([
                "worker.prepare",
                "dependencies.prepare",
                "dependencies.cleanup",
                "worker.settle"
            ]);
        } finally {
            await rm(f.root, {
                recursive: true,
                force: true
            });
        }
    });

    it("discards worktree when provisioning fails", async () => {
        const f = await fixture();

        try {
            f.provisioner.prepare.mockRejectedValueOnce(
                new Error("Install failed")
            );

            const subject = new ProvisionedCodingWorker({
                worker: f.worker,
                provisioner: f.provisioner
            });

            await expect(
                subject.prepare(f.preparation)
            ).rejects.toThrow("Install failed");

            expect(f.events).toEqual([
                "worker.prepare",
                "dependencies.cleanup",
                "worker.settle"
            ]);
        } finally {
            await rm(f.root, {
                recursive: true,
                force: true
            });
        }
    });

    it("does not settle if dependency cleanup fails", async () => {
        const f = await fixture();

        try {
            f.provisioner.cleanup.mockRejectedValueOnce(
                new Error("Cleanup failed")
            );

            const subject = new ProvisionedCodingWorker({
                worker: f.worker,
                provisioner: f.provisioner
            });

            await expect(
                subject.settle(f.settlement)
            ).rejects.toThrow("Cleanup failed");

            expect(f.worker.settle).not.toHaveBeenCalled();
        } finally {
            await rm(f.root, {
                recursive: true,
                force: true
            });
        }
    });

    it("supports settlement replay after worktree removal", async () => {
        const f = await fixture();

        try {
            await rm(f.root, {
                recursive: true,
                force: true
            });

            const subject = new ProvisionedCodingWorker({
                worker: f.worker,
                provisioner: f.provisioner
            });

            await subject.settle(f.settlement);

            expect(f.provisioner.cleanup).not.toHaveBeenCalled();
            expect(f.worker.settle).toHaveBeenCalledOnce();
        } finally {
            await rm(f.root, {
                recursive: true,
                force: true
            });
        }
    });
});
