import {
    readFile
} from "node:fs/promises";

import {
    join
} from "node:path";

import vm from "node:vm";
import ts from "typescript";


const mode =
    process.argv[2];

if (
    mode !==
        "typescript" &&
    mode !==
        "runtime"
) {
    throw new Error(
        `Unknown verification mode: ${mode ?? "<missing>"}`
    );
}


const sourcePath =
    join(
        process.cwd(),
        "src",
        "math.ts"
    );

const source =
    await readFile(
        sourcePath,
        "utf8"
    );


if (
    mode ===
    "typescript"
) {
    verifyTypeScript(
        sourcePath
    );

    process.stdout.write(
        "TypeScript verification passed\n"
    );
} else {
    verifyRuntime(
        source
    );

    process.stdout.write(
        "Runtime verification passed\n"
    );
}


function verifyTypeScript(
    file
) {
    const program =
        ts.createProgram({
            rootNames: [
                file
            ],

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


    const diagnostics =
        ts.getPreEmitDiagnostics(
            program
        );

    const errors =
        diagnostics.filter(
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

    const messages =
        errors.map(
            diagnostic =>
                formatDiagnostic(
                    diagnostic
                )
        );

    throw new Error(
        [
            "TypeScript verification failed:",
            ...messages
        ].join(
            "\n"
        )
    );
}


function verifyRuntime(
    source
) {
    const transpiled =
        ts.transpileModule(
            source,
            {
                fileName:
                    "math.ts",

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


    /*
     * Functional smoke isolation only.
     *
     * node:vm is NOT treated as a production security boundary.
     */
    const sandbox = {
        exports:
            {}
    };


    const verificationProgram =
        [
            transpiled.outputText,
            "",
            'if (typeof exports.add !== "function") {',
            '    throw new Error("add export is missing");',
            "}",
            "",
            'if (typeof exports.clamp !== "function") {',
            '    throw new Error("clamp export is missing");',
            "}",
            "",
            "const checks = [",
            '    ["add(2, 3)", exports.add(2, 3), 5],',
            '    ["clamp(5, 0, 10)", exports.clamp(5, 0, 10), 5],',
            '    ["clamp(-2, 0, 10)", exports.clamp(-2, 0, 10), 0],',
            '    ["clamp(42, 0, 10)", exports.clamp(42, 0, 10), 10]',
            "];",
            "",
            "for (const [name, actual, expected] of checks) {",
            "    if (actual !== expected) {",
            "        throw new Error(`${name}: expected ${expected}, got ${actual}`);",
            "    }",
            "}"
        ].join(
            "\n"
        );


    vm.runInNewContext(
        verificationProgram,
        sandbox,
        {
            timeout:
                1_000,

            displayErrors:
                true
        }
    );
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