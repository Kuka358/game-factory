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
        "syntax" &&
    mode !==
        "structure" &&
    mode !==
        "runtime"
) {
    throw new Error(
        `Unknown verification mode: ${mode ?? "<missing>"}`
    );
}


const repositoryRoot =
    process.cwd();


const runtimePath =
    join(
        repositoryRoot,
        "packages",
        "runtime",
        "src",
        "platformer-physics.ts"
    );


const hazardPath =
    join(
        repositoryRoot,
        "packages",
        "engine-phaser",
        "src",
        "templates",
        "platformer",
        "hazard-clearance.ts"
    );


const generatorPath =
    join(
        repositoryRoot,
        "packages",
        "engine-phaser",
        "src",
        "templates",
        "platformer",
        "PlatformerLevelGenerator.ts"
    );


const [
    runtimeSource,
    hazardSource,
    generatorSource
] =
    await Promise.all([
        readFile(
            runtimePath,
            "utf8"
        ),

        readFile(
            hazardPath,
            "utf8"
        ),

        readFile(
            generatorPath,
            "utf8"
        )
    ]);


if (
    mode ===
    "syntax"
) {
    verifySyntax(
        runtimePath,
        runtimeSource
    );

    verifySyntax(
        hazardPath,
        hazardSource
    );

    verifySyntax(
        generatorPath,
        generatorSource
    );


    console.log(
        "Platformer physics syntax verification passed"
    );
}


if (
    mode ===
    "structure"
) {
    verifyStructure(
        runtimePath,
        runtimeSource,
        hazardPath,
        hazardSource,
        generatorPath,
        generatorSource
    );


    console.log(
        "Platformer physics architecture verification passed"
    );
}


if (
    mode ===
    "runtime"
) {
    verifyRuntime(
        runtimeSource,
        hazardSource,
        generatorPath,
        generatorSource
    );


    console.log(
        "Platformer physics runtime verification passed"
    );
}


function verifySyntax(
    fileName,
    source
) {
    const result =
        ts.transpileModule(
            source,
            {
                fileName,

                reportDiagnostics:
                    true,

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


    const errors =
        (
            result.diagnostics ??
            []
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
            `Syntax verification failed for ${fileName}:`,

            ...errors.map(
                diagnostic =>
                    ts.flattenDiagnosticMessageText(
                        diagnostic.messageText,
                        "\n"
                    )
            )
        ].join(
            "\n"
        )
    );
}


function verifyStructure(
    runtimeFileName,
    runtimeSource,
    hazardFileName,
    hazardSource,
    generatorFileName,
    generatorSource
) {
    const runtimeFile =
        parseTypeScript(
            runtimeFileName,
            runtimeSource
        );


    const hazardFile =
        parseTypeScript(
            hazardFileName,
            hazardSource
        );


    const generatorFile =
        parseTypeScript(
            generatorFileName,
            generatorSource
        );


    /*
     * PlatformerLevelGenerator still uses ARCADE_GRAVITY_Y
     * inside calculateMaximumSafeHorizontalGap().
     *
     * The refactor may either preserve the existing local
     * re-export import or import the constant directly from
     * @game-factory/runtime, but the binding must not disappear.
     */
    const hasGravityImport =
        hasNamedImport(
            generatorFile,
            "@game-factory/runtime",
            "ARCADE_GRAVITY_Y"
        ) ||
        hasNamedImport(
            generatorFile,
            "../../physics.js",
            "ARCADE_GRAVITY_Y"
        );


    if (!hasGravityImport) {
        throw new Error(
            [
                "PlatformerLevelGenerator.ts must preserve",
                "an ARCADE_GRAVITY_Y import because",
                "calculateMaximumSafeHorizontalGap still uses it"
            ].join(
                " "
            )
        );
    }


    /*
     * The shared helper is the architectural purpose
     * of this dogfood refactor.
     */
    if (
        !hasExportedFunction(
            runtimeFile,
            "calculateArcadeJumpHeight"
        )
    ) {
        throw new Error(
            [
                "packages/runtime/src/platformer-physics.ts",
                "must export calculateArcadeJumpHeight()"
            ].join(
                " "
            )
        );
    }


    /*
     * Hazard clearance must use the shared helper for
     * the theoretical ideal jump rise.
     */
    if (
        !hasNamedImport(
            hazardFile,
            "@game-factory/runtime",
            "calculateArcadeJumpHeight"
        )
    ) {
        throw new Error(
            [
                "hazard-clearance.ts must import",
                "calculateArcadeJumpHeight from @game-factory/runtime"
            ].join(
                " "
            )
        );
    }


    if (
        countCalls(
            hazardFile,
            "calculateArcadeJumpHeight"
        ) <
        1
    ) {
        throw new Error(
            "hazard-clearance.ts must use calculateArcadeJumpHeight()"
        );
    }


    /*
     * PlatformerLevelGenerator must also use the shared
     * helper in calculateMaximumSafeRise().
     */
    if (
        !hasNamedImport(
            generatorFile,
            "@game-factory/runtime",
            "calculateArcadeJumpHeight"
        )
    ) {
        throw new Error(
            [
                "PlatformerLevelGenerator.ts must import",
                "calculateArcadeJumpHeight from @game-factory/runtime"
            ].join(
                " "
            )
        );
    }


    if (
        countCalls(
            generatorFile,
            "calculateArcadeJumpHeight"
        ) <
        1
    ) {
        throw new Error(
            "PlatformerLevelGenerator.ts must use calculateArcadeJumpHeight()"
        );
    }


    /*
     * Avoid accepting full-file rewrites that accidentally
     * remove the final newline.
     */
    for (
        const [
            fileName,
            source
        ] of [
            [
                runtimeFileName,
                runtimeSource
            ],

            [
                hazardFileName,
                hazardSource
            ],

            [
                generatorFileName,
                generatorSource
            ]
        ]
    ) {
        if (
            !source.endsWith(
                "\n"
            )
        ) {
            throw new Error(
                `${fileName} must end with a newline`
            );
        }
    }
}


function verifyRuntime(
    runtimeSource,
    hazardSource,
    generatorFileName,
    generatorSource
) {
    const runtime =
        evaluateCommonJs(
            runtimeSource,
            "platformer-physics.ts",
            {}
        );


    /*
     * Shared runtime constants must not change as part
     * of this refactor.
     */
    assertEqual(
        runtime.ARCADE_GRAVITY_Y,
        1200,
        "ARCADE_GRAVITY_Y changed unexpectedly"
    );


    assertEqual(
        runtime.ARCADE_PHYSICS_FPS,
        60,
        "ARCADE_PHYSICS_FPS changed unexpectedly"
    );


    assertEqual(
        runtime.PLATFORMER_BODIES
            ?.player
            ?.width,
        40,
        "player body width changed unexpectedly"
    );


    assertEqual(
        runtime.PLATFORMER_BODIES
            ?.hazard
            ?.width,
        38,
        "hazard body width changed unexpectedly"
    );


    assertEqual(
        runtime.PLATFORMER_BODIES
            ?.hazard
            ?.height,
        28,
        "hazard body height changed unexpectedly"
    );


    assertEqual(
        runtime.PLATFORMER_ENTITY_HEIGHTS
            ?.hazard,
        20,
        "hazard entity height changed unexpectedly"
    );


    const calculateArcadeJumpHeight =
        runtime.calculateArcadeJumpHeight;


    /*
     * Baseline intentionally does not have this function yet.
     *
     * Structure verification is responsible for requiring it
     * after the refactor. If present, runtime verification
     * validates its actual behaviour.
     */
    if (
        typeof calculateArcadeJumpHeight ===
        "function"
    ) {
        assertClose(
            calculateArcadeJumpHeight(
                560
            ),
            560 ** 2 /
                (
                    2 *
                    1200
                ),
            "calculateArcadeJumpHeight(560)"
        );


        assertClose(
            calculateArcadeJumpHeight(
                600
            ),
            150,
            "calculateArcadeJumpHeight(600)"
        );


        assertClose(
            calculateArcadeJumpHeight(
                0
            ),
            0,
            "calculateArcadeJumpHeight(0)"
        );
    }


    /*
     * Execute the real hazard helper against the runtime
     * fixture and confirm that refactoring the theoretical
     * jump height does not alter gameplay behaviour.
     */
    const hazard =
        evaluateCommonJs(
            hazardSource,
            "hazard-clearance.ts",
            {
                "@game-factory/runtime":
                    runtime,

                "@game-factory/game-spec":
                    {}
            }
        );


    if (
        typeof hazard.hazardHeightAboveSurface !==
        "function"
    ) {
        throw new Error(
            "hazardHeightAboveSurface export is missing"
        );
    }


    assertEqual(
        hazard.hazardHeightAboveSurface({
            jump_force:
                200,

            move_speed:
                280
        }),
        20,
        "low jump hazard clearance changed"
    );


    assertEqual(
        hazard.hazardHeightAboveSurface({
            jump_force:
                560,

            move_speed:
                280
        }),
        20,
        "normal hazard clearance changed"
    );


    assertEqual(
        hazard.hazardHeightAboveSurface({
            jump_force:
                560,

            move_speed:
                100
        }),
        12,
        "narrow-speed hazard clearance changed"
    );


    /*
     * calculateMaximumSafeRise() is private, so extract only
     * that function and evaluate it in an isolated fixture.
     *
     * Before the refactor the function uses ARCADE_GRAVITY_Y
     * directly. After the refactor it should use
     * calculateArcadeJumpHeight().
     *
     * Supplying both globals makes the runtime verifier valid
     * for both the baseline and the refactored implementation.
     */
    const safeRise =
        evaluatePrivateFunction(
            generatorFileName,
            generatorSource,
            "calculateMaximumSafeRise",

            {
                ARCADE_GRAVITY_Y:
                    1200,

                calculateArcadeJumpHeight:
                    typeof calculateArcadeJumpHeight ===
                        "function"
                        ? calculateArcadeJumpHeight
                        : jumpForce =>
                            (
                                jumpForce *
                                jumpForce
                            ) /
                            (
                                2 *
                                1200
                            )
            }
        );


    assertEqual(
        safeRise(
            560
        ),
        84,
        "calculateMaximumSafeRise(560) changed"
    );


    assertEqual(
        safeRise(
            600
        ),
        97,
        "calculateMaximumSafeRise(600) changed"
    );


    assertEqual(
        safeRise(
            0
        ),
        0,
        "calculateMaximumSafeRise(0) changed"
    );
}


function parseTypeScript(
    fileName,
    source
) {
    return ts.createSourceFile(
        fileName,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS
    );
}


function hasExportedFunction(
    sourceFile,
    name
) {
    return sourceFile.statements.some(
        statement =>
            ts.isFunctionDeclaration(
                statement
            ) &&
            statement.name
                ?.text ===
                name &&
            statement.modifiers
                ?.some(
                    modifier =>
                        modifier.kind ===
                        ts.SyntaxKind
                            .ExportKeyword
                ) ===
                true
    );
}


function hasNamedImport(
    sourceFile,
    moduleName,
    importedName
) {
    return sourceFile.statements.some(
        statement => {
            if (
                !ts.isImportDeclaration(
                    statement
                ) ||
                !ts.isStringLiteral(
                    statement.moduleSpecifier
                ) ||
                statement.moduleSpecifier
                    .text !==
                    moduleName
            ) {
                return false;
            }


            const bindings =
                statement.importClause
                    ?.namedBindings;


            if (
                !bindings ||
                !ts.isNamedImports(
                    bindings
                )
            ) {
                return false;
            }


            return bindings.elements.some(
                element =>
                    element.name.text ===
                        importedName ||
                    element.propertyName
                        ?.text ===
                        importedName
            );
        }
    );
}


function countCalls(
    sourceFile,
    name
) {
    let count =
        0;


    const visit =
        node => {
            if (
                ts.isCallExpression(
                    node
                ) &&
                ts.isIdentifier(
                    node.expression
                ) &&
                node.expression.text ===
                    name
            ) {
                count +=
                    1;
            }


            ts.forEachChild(
                node,
                visit
            );
        };


    visit(
        sourceFile
    );


    return count;
}


function evaluatePrivateFunction(
    fileName,
    source,
    functionName,
    globals
) {
    const sourceFile =
        parseTypeScript(
            fileName,
            source
        );


    const declaration =
        sourceFile.statements.find(
            statement =>
                ts.isFunctionDeclaration(
                    statement
                ) &&
                statement.name
                    ?.text ===
                    functionName
        );


    if (
        !declaration
    ) {
        throw new Error(
            `Private function ${functionName} is missing`
        );
    }


    const functionSource =
        source.slice(
            declaration.getStart(
                sourceFile
            ),
            declaration.getEnd()
        );


    const transpiled =
        ts.transpileModule(
            [
                functionSource,
                "",
                `globalThis.__verifiedFunction = ${functionName};`
            ].join(
                "\n"
            ),
            {
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


    const sandbox = {
        ...globals
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
                `${functionName}.js`
        }
    );


    const result =
        sandbox.__verifiedFunction;


    if (
        typeof result !==
        "function"
    ) {
        throw new Error(
            `Unable to evaluate ${functionName}`
        );
    }


    return result;
}


function evaluateCommonJs(
    source,
    fileName,
    modules
) {
    const transpiled =
        ts.transpileModule(
            source,
            {
                fileName,

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

        require(
            specifier
        ) {
            if (
                Object.prototype.hasOwnProperty.call(
                    modules,
                    specifier
                )
            ) {
                return modules[
                    specifier
                ];
            }


            throw new Error(
                `Unexpected module import while verifying ${fileName}: ${specifier}`
            );
        }
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
                fileName.replace(
                    /\.ts$/,
                    ".js"
                )
        }
    );


    return module.exports;
}


function assertEqual(
    actual,
    expected,
    message
) {
    if (
        actual !==
        expected
    ) {
        throw new Error(
            `${message}: expected ${expected}, received ${actual}`
        );
    }
}


function assertClose(
    actual,
    expected,
    message
) {
    if (
        typeof actual !==
            "number" ||
        !Number.isFinite(
            actual
        ) ||
        Math.abs(
            actual -
            expected
        ) >
            1e-9
    ) {
        throw new Error(
            `${message}: expected ${expected}, received ${actual}`
        );
    }
}