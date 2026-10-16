import {
    describe,
    expect,
    it
} from "vitest";

import {
    createAutonomousRun
} from "../src/index.js";


describe(
    "createAutonomousRun",
    () => {
        it(
            "creates a new run in planning state",
            () => {
                const run =
                    createAutonomousRun({
                        id:
                            "run-001",

                        goal:
                            "Add autonomous development",

                        maxIterations:
                            10,

                        now:
                            "2026-09-17T00:00:00.000Z"
                    });

                expect(
                    run
                ).toEqual({
                    id:
                        "run-001",

                    goal:
                        "Add autonomous development",

                    status:
                        "planning",

                    currentIteration:
                        0,

                    maxIterations:
                        10,

                    iterations:
                        [],

                    createdAt:
                        "2026-09-17T00:00:00.000Z",

                    updatedAt:
                        "2026-09-17T00:00:00.000Z"
                });
            }
        );


        it(
            "rejects an empty goal",
            () => {
                expect(
                    () =>
                        createAutonomousRun({
                            id:
                                "run-001",

                            goal:
                                "   ",

                            maxIterations:
                                10
                        })
                ).toThrow(
                    "Autonomous run goal must not be empty"
                );
            }
        );


        it(
            "rejects an invalid maxIterations",
            () => {
                expect(
                    () =>
                        createAutonomousRun({
                            id:
                                "run-001",

                            goal:
                                "Test",

                            maxIterations:
                                0
                        })
                ).toThrow(
                    "Autonomous run maxIterations must be a positive integer"
                );
            }
        );
    }
);