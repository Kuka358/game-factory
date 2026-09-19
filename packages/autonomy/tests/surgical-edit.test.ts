import {
    describe,
    expect,
    it
} from "vitest";

import {
    planSurgicalEdits
} from "../src/index.js";


describe(
    "planSurgicalEdits",
    () => {
        it(
            "creates a file that was missing from the snapshot",
            () => {
                expect(
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/new.ts",

                                content:
                                    null
                            }
                        ],

                        [
                            {
                                operation:
                                    "create",

                                path:
                                    "src/new.ts",

                                content:
                                    "export const created = true;\n"
                            }
                        ]
                    )
                ).toEqual([
                    {
                        path:
                            "src/new.ts",

                        operation:
                            "write",

                        originalContent:
                            null,

                        content:
                            "export const created = true;\n"
                    }
                ]);
            }
        );


        it(
            "replaces one exact unique range without rewriting surrounding content",
            () => {
                const original = [
                    "export function value() {",
                    "    return 1;",
                    "}",
                    ""
                ].join(
                    "\n"
                );


                const result =
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/value.ts",

                                content:
                                    original
                            }
                        ],

                        [
                            {
                                operation:
                                    "replace",

                                path:
                                    "src/value.ts",

                                oldText:
                                    "    return 1;",

                                newText:
                                    "    return 2;"
                            }
                        ]
                    );


                expect(
                    result
                ).toEqual([
                    {
                        path:
                            "src/value.ts",

                        operation:
                            "write",

                        originalContent:
                            original,

                        content: [
                            "export function value() {",
                            "    return 2;",
                            "}",
                            ""
                        ].join(
                            "\n"
                        )
                    }
                ]);
            }
        );


        it(
            "applies multiple replacements to the same virtual file in order",
            () => {
                const result =
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/math.ts",

                                content:
                                    "const a = 1;\nconst b = 2;\n"
                            }
                        ],

                        [
                            {
                                operation:
                                    "replace",

                                path:
                                    "src/math.ts",

                                oldText:
                                    "const a = 1;",

                                newText:
                                    "const a = 10;"
                            },

                            {
                                operation:
                                    "replace",

                                path:
                                    "src/math.ts",

                                oldText:
                                    "const b = 2;",

                                newText:
                                    "const b = 20;"
                            }
                        ]
                    );


                expect(
                    result
                ).toHaveLength(
                    1
                );


                expect(
                    result[0]
                        ?.content
                ).toBe(
                    "const a = 10;\nconst b = 20;\n"
                );
            }
        );


        it(
            "deletes a file that existed before the batch",
            () => {
                expect(
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/old.ts",

                                content:
                                    "obsolete\n"
                            }
                        ],

                        [
                            {
                                operation:
                                    "delete",

                                path:
                                    "src/old.ts"
                            }
                        ]
                    )
                ).toEqual([
                    {
                        path:
                            "src/old.ts",

                        operation:
                            "delete",

                        originalContent:
                            "obsolete\n",

                        content:
                            ""
                    }
                ]);
            }
        );


        it(
            "rejects creating over an existing file",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/existing.ts",

                                    content:
                                        "existing\n"
                                }
                            ],

                            [
                                {
                                    operation:
                                        "create",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "replacement\n"
                                }
                            ]
                        )
                ).toThrow(
                    "requires a missing file"
                );
            }
        );


        it(
            "rejects replacing a missing file",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/missing.ts",

                                    content:
                                        null
                                }
                            ],

                            [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/missing.ts",

                                    oldText:
                                        "before",

                                    newText:
                                        "after"
                                }
                            ]
                        )
                ).toThrow(
                    "requires an existing file"
                );
            }
        );


        it(
            "rejects a stale replacement anchor",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/value.ts",

                                    content:
                                        "const value = 1;\n"
                                }
                            ],

                            [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/value.ts",

                                    oldText:
                                        "const value = 2;",

                                    newText:
                                        "const value = 3;"
                                }
                            ]
                        )
                ).toThrow(
                    "anchor was not found"
                );
            }
        );


        it(
            "rejects an ambiguous replacement anchor",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/value.ts",

                                    content: [
                                        "const value = 1;",
                                        "const value = 1;",
                                        ""
                                    ].join(
                                        "\n"
                                    )
                                }
                            ],

                            [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/value.ts",

                                    oldText:
                                        "const value = 1;",

                                    newText:
                                        "const value = 2;"
                                }
                            ]
                        )
                ).toThrow(
                    "anchor is ambiguous"
                );
            }
        );


        it(
            "rejects a replacement that changes nothing",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/value.ts",

                                    content:
                                        "const value = 1;\n"
                                }
                            ],

                            [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/value.ts",

                                    oldText:
                                        "const value = 1;",

                                    newText:
                                        "const value = 1;"
                                }
                            ]
                        )
                ).toThrow(
                    "must change content"
                );
            }
        );

        it(
            "rejects replacing the complete existing file",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/value.ts",

                                    content:
                                        "const value = 1;\n"
                                }
                            ],

                            [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/value.ts",

                                    oldText:
                                        "const value = 1;\n",

                                    newText:
                                        "const value = 2;\n"
                                }
                            ]
                        )
                ).toThrow(
                    "must not replace the complete existing file"
                );
            }
        );

        it(
            "does not allow delete then create to bypass surgical replacement",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/existing.ts",

                                    content:
                                        "original\n"
                                }
                            ],

                            [
                                {
                                    operation:
                                        "delete",

                                    path:
                                        "src/existing.ts"
                                },

                                {
                                    operation:
                                        "create",

                                    path:
                                        "src/existing.ts",

                                    content:
                                        "completely rewritten\n"
                                }
                            ]
                        )
                ).toThrow(
                    "requires a missing file"
                );
            }
        );
    }
);