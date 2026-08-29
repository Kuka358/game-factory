import path from "node:path";

import {
    fileURLToPath
} from "node:url";

import {
    runQa
} from "./run-qa-process.js";

const buildPath =
    process.argv[2];

if (!buildPath) {
    console.error(
        "Usage: qa <build-directory> [--headed]"
    );

    process.exit(1);
}

const currentFile =
    fileURLToPath(import.meta.url);

const qaPackageDir =
    path.dirname(
        path.dirname(currentFile)
    );

const repositoryRoot =
    path.resolve(
        qaPackageDir,
        "../.."
    );

const absoluteBuildPath =
    path.isAbsolute(buildPath)
        ? buildPath
        : path.resolve(
              repositoryRoot,
              buildPath
          );

const result =
    await runQa({
        buildDir:
            absoluteBuildPath,

        headed:
            process.argv.includes(
                "--headed"
            )
    });

process.exit(
    result.exitCode
);