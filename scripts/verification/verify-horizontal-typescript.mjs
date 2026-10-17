
import { createRequire } from "node:module";
import { resolve } from "node:path";

const require = createRequire(
    new URL(
        "../../packages/freeform/package.json",
        import.meta.url
    )
);

const ts = require("typescript");

const root = process.cwd();

const files = [
    resolve(root, "src/game/Paddle.ts"),
    resolve(root, "src/game/constants.ts")
];

const program = ts.createProgram(files, {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    esModuleInterop: true,
    types: []
});

const diagnostics = ts.getPreEmitDiagnostics(program);

if (diagnostics.length > 0) {
    const host = {
        getCanonicalFileName: path => path,
        getCurrentDirectory: () => root,
        getNewLine: () => "\n"
    };

    console.error(
        ts.formatDiagnosticsWithColorAndContext(
            diagnostics,
            host
        )
    );

    process.exitCode = 1;
} else {
    console.log(
        "PADDLE TYPESCRIPT VERIFICATION PASSED"
    );
}
