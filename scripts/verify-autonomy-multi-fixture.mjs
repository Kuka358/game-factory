import {
    readFile
} from "node:fs/promises";

import {
    join
} from "node:path";

import vm from "node:vm";
import ts from "typescript";


const stage =
    process.argv[2];

const mode =
    process.argv[3];


if (
    stage !== "math" &&
    stage !== "normalize"
) {
    throw new Error(
        `Unknown verification stage: ${stage ?? "<missing>"}`
    );
}

if (
    mode !== "typescript" &&
    mode !== "runtime"
) {
    throw new Error(
        `Unknown verification mode: ${mode ?? "<missing>"}`
    );
}


const mathPath =
    join(
        process.cwd(),
        "src",
        "math.ts"
    );

const normalizePath =
    join(
        process.cwd(),
        "src",
        "normalize.ts"
    );


if (
    mode ===
    "typescript"
) {
    verifyTypeScript(
        stage === "math"
            ? [
                mathPath
            ]
            : [
                mathPath,
                normalizePath
            ]
    );

    process.stdout.write(
        `TypeScript verification passed for ${stage}\n`
    );
} else if (
    stage ===
    "math"
) {
    const mathSource =
        await readFile(
            mathPath,
            "utf8"
        );

    verifyMathRuntime(
        mathSource
    );

    process.stdout.write(
        "Math runtime verification passed\n"
    );
} else {
    const [
        mathSource,
        normalizeSource
    ] =
        await Promise.all([
            readFile(
                mathPath,
                "utf8"
            ),

            readFile(
                normalizePath,
                "utf8"
            )
        ]);

    verifyNormalizeRuntime(
        mathSource,
        normalizeSource
    );

    process.stdout.write(
        "Normalize runtime verification passed\n"
    );
}


function verifyTypeScript(
    files
) {
    const program =
        ts.createProgram({
            rootNames:
                files,

            options: {
                target:
                    ts.ScriptTarget
                        .ES2022,

                module:
                    ts.ModuleKind
                        .ES2022,

                moduleResolution:
                    ts.ModuleResolutionKind
                        .Bundler,

                strict:
                    true,

                noEmit:
                    true,

                skipLibCheck:
                    true
            }
        });


    const errors =
        ts.getPreEmitDiagnostics(
            program
        ).filter(
            diagnostic =>
                diagnostic.category ===
                ts.DiagnosticCategory
                    .Error
        );


    if (
        errors.length ===
        0
    ) {
        return;
    }


    throw new Error(
        [
            "TypeScript verification failed:",
            ...errors.map(
                diagnostic =>
                    formatDiagnostic(
                        diagnostic
                    )
            )
        ].join(
            "\n"
        )
    );
}


function verifyMathRuntime(
    mathSource
) {
    const math =
        evaluateCommonJs(
            mathSource,
            "math.ts"
        );


    assertFunction(
        math.add,
        "add"
    );

    assertFunction(
        math.clamp,
        "clamp"
    );


    assertEqual(
        math.add(
            2,
            3
        ),
        5,
        "add(2, 3)"
    );

    assertEqual(
        math.clamp(
            5,
            0,
            10
        ),
        5,
        "clamp(5, 0, 10)"
    );

    assertEqual(
        math.clamp(
            -2,
            0,
            10
        ),
        0,
        "clamp(-2, 0, 10)"
    );

    assertEqual(
        math.clamp(
            42,
            0,
            10
        ),
        10,
        "clamp(42, 0, 10)"
    );
}


function verifyNormalizeRuntime(
    mathSource,
    normalizeSource
) {
    const math =
        evaluateCommonJs(
            mathSource,
            "math.ts"
        );


    assertFunction(
        math.clamp,
        "clamp"
    );


    let clampCalls =
        0;


    const instrumentedMath = {
        ...math,

        clamp(
            ...args
        ) {
            clampCalls +=
                1;

            return math.clamp(
                ...args
            );
        }
    };


    const normalize =
        evaluateCommonJs(
            normalizeSource,
            "normalize.ts",

            specifier => {
                if (
                    specifier ===
                    "./math.js"
                ) {
                    return instrumentedMath;
                }

                throw new Error(
                    `Unexpected module import: ${specifier}`
                );
            }
        );


    assertFunction(
        normalize.normalizeClamped,
        "normalizeClamped"
    );


    const checks = [
        [
            "normalizeClamped(5, 0, 10)",
            normalize.normalizeClamped(
                5,
                0,
                10
            ),
            0.5
        ],

        [
            "normalizeClamped(-5, 0, 10)",
            normalize.normalizeClamped(
                -5,
                0,
                10
            ),
            0
        ],

        [
            "normalizeClamped(15, 0, 10)",
            normalize.normalizeClamped(
                15,
                0,
                10
            ),
            1
        ]
    ];


    for (
        const [
            name,
            actual,
            expected
        ] of
        checks
    ) {
        assertEqual(
            actual,
            expected,
            name
        );
    }


    if (
        clampCalls <
        checks.length
    ) {
        throw new Error(
            [
                "normalizeClamped must use the clamp function",
                "created by the previous accepted iteration.",
                `Observed clamp calls: ${clampCalls}.`
            ].join(
                " "
            )
        );
    }
}


function evaluateCommonJs(
    source,
    filename,
    requireFunction =
        specifier => {
            throw new Error(
                `Unexpected module import: ${specifier}`
            );
        }
) {
    const transpiled =
        ts.transpileModule(
            source,
            {
                fileName:
                    filename,

                compilerOptions: {
                    target:
                        ts.ScriptTarget
                            .ES2022,

                    module:
                        ts.ModuleKind
                            .CommonJS,

                    strict:
                        true
                }
            }
        );


    const module = {
        exports:
            {}
    };


    const sandbox = {
        module,

        exports:
            module.exports,

        require:
            requireFunction
    };


    /*
     * Functional fixture isolation only.
     *
     * node:vm is not considered a production security boundary.
     */
    vm.runInNewContext(
        transpiled.outputText,
        sandbox,
        {
            timeout:
                1_000,

            filename
        }
    );


    return module.exports;
}


function assertFunction(
    value,
    name
) {
    if (
        typeof value !==
        "function"
    ) {
        throw new Error(
            `${name} export is missing`
        );
    }
}


function assertEqual(
    actual,
    expected,
    name
) {
    if (
        actual !==
        expected
    ) {
        throw new Error(
            `${name}: expected ${expected}, got ${actual}`
        );
    }
}


function formatDiagnostic(
    diagnostic
) {
    const message =
        ts.flattenDiagnosticMessageText(
            diagnostic.messageText,
            "\n"
        );

    if (
        !diagnostic.file ||
        diagnostic.start ===
            undefined
    ) {
        return message;
    }

    const position =
        diagnostic.file
            .getLineAndCharacterOfPosition(
                diagnostic.start
            );

    return (
        `${diagnostic.file.fileName}:` +
        `${position.line + 1}:` +
        `${position.character + 1} ` +
        message
    );
}