import {
    describe,
    expect,
    it
} from "vitest";

import {
    WorkspaceGuard
} from "../src/index.js";


describe(
    "WorkspaceGuard",
    () => {
        const guard =
            new WorkspaceGuard({
                allowedCommands: [
                    "pnpm typecheck",
                    "pnpm test"
                ]
            });

        const scope = {
            allowedPaths: [
                "packages/autonomy/**"
            ],

            forbiddenPaths: [
                "packages/autonomy/secrets/**"
            ]
        };


        it(
            "allows paths inside iteration scope",
            () => {
                expect(
                    () =>
                        guard
                            .assertPathAllowed(
                                "packages/autonomy/src/index.ts",
                                scope
                            )
                ).not.toThrow();
            }
        );


        it(
            "rejects paths outside iteration scope",
            () => {
                expect(
                    () =>
                        guard
                            .assertPathAllowed(
                                "packages/game-spec/src/index.ts",
                                scope
                            )
                ).toThrow(
                    "outside iteration scope"
                );
            }
        );


        it(
            "gives forbidden paths priority",
            () => {
                expect(
                    () =>
                        guard
                            .assertPathAllowed(
                                "packages/autonomy/secrets/key.txt",
                                scope
                            )
                ).toThrow(
                    "forbidden"
                );
            }
        );


        it(
            "rejects repository path traversal",
            () => {
                expect(
                    () =>
                        guard
                            .assertPathAllowed(
                                "../package.json",
                                scope
                            )
                ).toThrow(
                    "path traversal"
                );
            }
        );


        it(
            "accepts an allowlisted command",
            () => {
                expect(
                    () =>
                        guard
                            .assertCommandAllowed(
                                "pnpm typecheck"
                            )
                ).not.toThrow();
            }
        );


        it(
            "rejects a command outside the allowlist",
            () => {
                expect(
                    () =>
                        guard
                            .assertCommandAllowed(
                                "git reset --hard"
                            )
                ).toThrow(
                    "not allowed"
                );
            }
        );
    }
);