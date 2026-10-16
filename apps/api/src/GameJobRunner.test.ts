
import assert from "node:assert/strict";
import { test } from "node:test";

import {
    GameJobRunner,
    type GameJobPipeline
} from "./GameJobRunner.js";

import {
    GameJobStore
} from "./GameJobStore.js";

interface TestScenario {
    success: boolean;
    qaResult: string;
    throwError?: boolean;
}

function startTestJob(scenario: TestScenario) {
    const store = new GameJobStore();

    const job = store.create({
        prompt: "Create a test game",
        mode: "template",
        orientation: "landscape",
        target: "web"
    });

    const pipeline: GameJobPipeline = async (
        _prompt,
        _outputRoot,
        options
    ) => {
        options?.onProgress?.({
            stage: "testing",
            message: "Running QA"
        });

        // Simulates a premature completion event.
        options?.onProgress?.({
            stage: "completed",
            message: "Premature completion"
        });

        assert.notEqual(
            store.get(job.id)?.status,
            "completed",
            "Progress event must not complete the job"
        );

        if (scenario.throwError) {
            throw new Error("Pipeline crashed");
        }

        return {
            success: scenario.success,
            qa: {
                result: scenario.qaResult
            },
            generation: {
                spec: {
                    metadata: {
                        title: "Test Game"
                    }
                },
                workspace: {
                    root: "C:\\generated\\test-game"
                }
            }
        };
    };

    const runner = new GameJobRunner({
        store,
        outputRoot: "C:\\generated",
        pipeline
    });

    runner.enqueue(job.id);

    return {
        store,
        jobId: job.id
    };
}

async function waitForFinalStatus(
    store: GameJobStore,
    jobId: string
) {
    for (let attempt = 0; attempt < 100; attempt++) {
        const job = store.get(jobId);

        if (
            job?.status === "completed" ||
            job?.status === "failed"
        ) {
            return job;
        }

        await new Promise<void>((resolve) => {
            setImmediate(resolve);
        });
    }

    throw new Error("Job did not reach a final status");
}

test("QA failure must not complete a game", async () => {
    const { store, jobId } = startTestJob({
        success: false,
        qaResult: "failed"
    });

    const job = await waitForFinalStatus(store, jobId);

    assert.equal(job.status, "failed");
    assert.equal(job.gameId, undefined);
    assert.match(job.error ?? "", /QA result: failed/);
});

test("QA success completes the game", async () => {
    const { store, jobId } = startTestJob({
        success: true,
        qaResult: "passed"
    });

    const job = await waitForFinalStatus(store, jobId);

    assert.equal(job.status, "completed");
    assert.equal(job.title, "Test Game");
    assert.equal(job.gameId, "test-game");
    assert.equal(job.error, undefined);
});

test("Pipeline exceptions produce failed status", async () => {
    const { store, jobId } = startTestJob({
        success: false,
        qaResult: "failed",
        throwError: true
    });

    const job = await waitForFinalStatus(store, jobId);

    assert.equal(job.status, "failed");
    assert.match(job.error ?? "", /Pipeline crashed/);
    assert.equal(job.gameId, undefined);
});
