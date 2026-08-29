import {
    describe,
    expect,
    it
} from "vitest";

import {
    getAssetResolutionOrder
} from "../src/index.js";

describe(
    "getAssetResolutionOrder",
    () => {
        it(
            "resolves spritevault_first",
            () => {
                expect(
                    getAssetResolutionOrder(
                        "spritevault_first"
                    )
                ).toEqual([
                    "spritevault",
                    "generated"
                ]);
            }
        );

        it(
            "resolves generated_first",
            () => {
                expect(
                    getAssetResolutionOrder(
                        "generated_first"
                    )
                ).toEqual([
                    "generated",
                    "spritevault"
                ]);
            }
        );

        it(
            "resolves generated_only",
            () => {
                expect(
                    getAssetResolutionOrder(
                        "generated_only"
                    )
                ).toEqual([
                    "generated"
                ]);
            }
        );

        it(
            "resolves spritevault_only",
            () => {
                expect(
                    getAssetResolutionOrder(
                        "spritevault_only"
                    )
                ).toEqual([
                    "spritevault"
                ]);
            }
        );
    }
);