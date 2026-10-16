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
            "inserts content after one exact unique anchor",
            () => {
                expect(
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
                                    "insert_after",

                                path:
                                    "src/value.ts",

                                anchor:
                                    "const value = 1;\n",

                                content:
                                    "const second = 2;\n"
                            }
                        ]
                    )
                ).toEqual([
                    {
                        path:
                            "src/value.ts",

                        operation:
                            "write",

                        originalContent:
                            "const value = 1;\n",

                        content:
                            "const value = 1;\nconst second = 2;\n"
                    }
                ]);
            }
        );


        it(
            "inserts content before one exact unique anchor",
            () => {
                expect(
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/value.ts",

                                content:
                                    "const second = 2;\n"
                            }
                        ],

                        [
                            {
                                operation:
                                    "insert_before",

                                path:
                                    "src/value.ts",

                                anchor:
                                    "const second = 2;",

                                content:
                                    "const first = 1;\n"
                            }
                        ]
                    )
                ).toEqual([
                    {
                        path:
                            "src/value.ts",

                        operation:
                            "write",

                        originalContent:
                            "const second = 2;\n",

                        content:
                            "const first = 1;\nconst second = 2;\n"
                    }
                ]);
            }
        );

        it(
            "does not normalize whitespace other than line endings",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/example.ts",

                                    content:
                                        "const value = 1;\r\n"
                                }
                            ],

                            [
                                {
                                    operation:
                                        "replace",

                                    path:
                                        "src/example.ts",

                                    oldText:
                                        "const  value = 1;\n",

                                    newText:
                                        "const value = 2;\n"
                                }
                            ]
                        )
                ).toThrow(
                    "anchor was not found"
                );
            }
        );

        it(
            "matches multiline insert anchors across LF and CRLF",
            () => {
                const original =
                    [
                        "function example() {",
                        "    return 1;",
                        "}",
                        ""
                    ].join(
                        "\r\n"
                    );


                const result =
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/example.ts",

                                content:
                                    original
                            }
                        ],

                        [
                            {
                                operation:
                                    "insert_after",

                                path:
                                    "src/example.ts",

                                anchor:
                                    [
                                        "function example() {",
                                        "    return 1;",
                                        "}"
                                    ].join(
                                        "\n"
                                    ),

                                content:
                                    [
                                        "",
                                        "export const second = 2;"
                                    ].join(
                                        "\n"
                                    )
                            }
                        ]
                    );


                expect(
                    result[0]
                        ?.content
                ).toBe(
                    [
                        "function example() {",
                        "    return 1;",
                        "}",
                        "export const second = 2;",
                        ""
                    ].join(
                        "\r\n"
                    )
                );
            }
        );

        it(
            "matches multiline replace anchors across LF and CRLF without changing surrounding line endings",
            () => {
                const result =
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/example.ts",

                                content:
                                    [
                                        "const before = 1;",
                                        "const value =",
                                        "    oldValue;",
                                        "const after = 2;",
                                        ""
                                    ].join(
                                        "\r\n"
                                    )
                            }
                        ],

                        [
                            {
                                operation:
                                    "replace",

                                path:
                                    "src/example.ts",

                                oldText:
                                    [
                                        "const value =",
                                        "    oldValue;"
                                    ].join(
                                        "\n"
                                    ),

                                newText:
                                    [
                                        "const value =",
                                        "    newValue;"
                                    ].join(
                                        "\n"
                                    )
                            }
                        ]
                    );


                expect(
                    result
                ).toEqual([
                    {
                        path:
                            "src/example.ts",

                        operation:
                            "write",

                        originalContent:
                            [
                                "const before = 1;",
                                "const value =",
                                "    oldValue;",
                                "const after = 2;",
                                ""
                            ].join(
                                "\r\n"
                            ),

                        content:
                            [
                                "const before = 1;",
                                "const value =",
                                "    newValue;",
                                "const after = 2;",
                                ""
                            ].join(
                                "\r\n"
                            )
                    }
                ]);
            }
        );


        it(
            "applies insertions against the current virtual file state",
            () => {
                expect(
                    planSurgicalEdits(
                        [
                            {
                                path:
                                    "src/value.ts",

                                content:
                                    "const first = 1;\n"
                            }
                        ],

                        [
                            {
                                operation:
                                    "insert_after",

                                path:
                                    "src/value.ts",

                                anchor:
                                    "const first = 1;\n",

                                content:
                                    "const second = 2;\n"
                            },

                            {
                                operation:
                                    "insert_after",

                                path:
                                    "src/value.ts",

                                anchor:
                                    "const second = 2;\n",

                                content:
                                    "const third = 3;\n"
                            }
                        ]
                    )
                ).toEqual([
                    {
                        path:
                            "src/value.ts",

                        operation:
                            "write",

                        originalContent:
                            "const first = 1;\n",

                        content: [
                            "const first = 1;",
                            "const second = 2;",
                            "const third = 3;",
                            ""
                        ].join(
                            "\n"
                        )
                    }
                ]);
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
            "rejects inserting into a missing file",
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
                                        "insert_after",

                                    path:
                                        "src/missing.ts",

                                    anchor:
                                        "target",

                                    content:
                                        "inserted"
                                }
                            ]
                        )
                ).toThrow(
                    "insert requires an existing file"
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
            "rejects a stale insert anchor",
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
                                        "insert_after",

                                    path:
                                        "src/value.ts",

                                    anchor:
                                        "const missing = true;",

                                    content:
                                        "\nconst second = 2;\n"
                                }
                            ]
                        )
                ).toThrow(
                    "insert anchor was not found"
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
            "rejects an ambiguous insert anchor",
            () => {
                expect(
                    () =>
                        planSurgicalEdits(
                            [
                                {
                                    path:
                                        "src/value.ts",

                                    content:
                                        "x\nx\n"
                                }
                            ],

                            [
                                {
                                    operation:
                                        "insert_after",

                                    path:
                                        "src/value.ts",

                                    anchor:
                                        "x",

                                    content:
                                        "y"
                                }
                            ]
                        )
                ).toThrow(
                    "insert anchor is ambiguous"
                );
            }
        );


        it(
            "rejects an empty insert anchor",
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
                                        "insert_before",

                                    path:
                                        "src/value.ts",

                                    anchor:
                                        "",

                                    content:
                                        "const first = 0;\n"
                                }
                            ]
                        )
                ).toThrow(
                    "insert anchor must not be empty"
                );
            }
        );


        it(
            "rejects empty insert content",
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
                                        "insert_after",

                                    path:
                                        "src/value.ts",

                                    anchor:
                                        "const value = 1;",

                                    content:
                                        ""
                                }
                            ]
                        )
                ).toThrow(
                    "insert content must not be empty"
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
            "rejects replacing almost the complete file while leaving only a trailing newline",
            () => {
                const original =
                    "export const value = 1;\n";


                const oldText =
                    "export const value = 1;";


                expect(
                    oldText.length
                ).toBe(
                    original.length -
                    1
                );


                expect(
                    () =>
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

                                    oldText,

                                    newText:
                                        "export const value = 2;"
                                }
                            ]
                        )
                ).toThrow(
                    "anchor covers too much"
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