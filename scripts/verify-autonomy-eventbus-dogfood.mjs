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
        "packages",
        "runtime",
        "src",
        "events",
        "EventBus.ts"
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
        "EventBus TypeScript verification passed\n"
    );
} else {
    verifyRuntime(
        source
    );

    process.stdout.write(
        "EventBus runtime verification passed\n"
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
            "EventBus TypeScript verification failed:",
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


function verifyRuntime(
    source
) {
    const transpiled =
        ts.transpileModule(
            source,
            {
                fileName:
                    "EventBus.ts",

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
            module.exports
    };


    /*
     * Functional fixture isolation only.
     *
     * node:vm is not a production security boundary.
     */
    vm.runInNewContext(
        transpiled.outputText,
        sandbox,
        {
            timeout:
                1_000,

            filename:
                "EventBus.js"
        }
    );


    const {
        EventBus
    } =
        module.exports;


    if (
        typeof EventBus !==
        "function"
    ) {
        throw new Error(
            "EventBus export is missing"
        );
    }


    verifyStableDispatch(
        EventBus
    );
}


function verifyStableDispatch(
    EventBus
) {
    const bus =
        new EventBus();


    const calls =
        [];


    let unsubscribeSecond =
        () => {};


    bus.on(
        "tick",

        () => {
            calls.push(
                "first"
            );


            /*
             * Mutating subscriptions must not alter the set of
             * handlers for the event already being dispatched.
             */
            unsubscribeSecond();


            bus.on(
                "tick",

                () => {
                    calls.push(
                        "late"
                    );
                }
            );
        }
    );


    unsubscribeSecond =
        bus.on(
            "tick",

            () => {
                calls.push(
                    "second"
                );
            }
        );


    bus.emit(
        "tick",
        {
            frame:
                1
        }
    );


    assertCalls(
        calls,

        [
            "first",
            "second"
        ],

        [
            "Listeners present when emit() starts must all receive",
            "the current event exactly once.",
            "Listeners added during emit() must wait until the next event."
        ].join(
            " "
        )
    );


    calls.length =
        0;


    bus.emit(
        "tick",
        {
            frame:
                2
        }
    );


    assertCalls(
        calls,

        [
            "first",
            "late"
        ],

        [
            "Subscription mutations made during the previous emit()",
            "must apply to the next event."
        ].join(
            " "
        )
    );
}


function assertCalls(
    actual,
    expected,
    message
) {
    if (
        actual.length !==
            expected.length ||
        actual.some(
            (
                value,
                index
            ) =>
                value !==
                expected[index]
        )
    ) {
        throw new Error(
            [
                message,
                `Expected calls: ${JSON.stringify(expected)}.`,
                `Actual calls: ${JSON.stringify(actual)}.`
            ].join(
                " "
            )
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