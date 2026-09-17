import type {
    AutonomousRun
} from "./state.js";


export interface CreateAutonomousRunInput {
    id:
        string;

    goal:
        string;

    maxIterations:
        number;

    now?:
        string;
}


export function createAutonomousRun(
    input:
        CreateAutonomousRunInput
): AutonomousRun {
    const id =
        input.id.trim();

    const goal =
        input.goal.trim();

    if (id.length === 0) {
        throw new Error(
            "Autonomous run id must not be empty"
        );
    }

    if (goal.length === 0) {
        throw new Error(
            "Autonomous run goal must not be empty"
        );
    }

    if (
        !Number.isInteger(
            input.maxIterations
        ) ||
        input.maxIterations <= 0
    ) {
        throw new Error(
            "Autonomous run maxIterations must be a positive integer"
        );
    }

    const now =
        input.now ??
        new Date().toISOString();

    return {
        id,
        goal,

        status:
            "planning",

        currentIteration:
            0,

        maxIterations:
            input.maxIterations,

        iterations:
            [],

        createdAt:
            now,

        updatedAt:
            now
    };
}