import {
    defineConfig
} from "@playwright/test";

import path from "node:path";

import {
    fileURLToPath
} from "node:url";

const currentFile =
    fileURLToPath(import.meta.url);

const qaPackageDir =
    path.dirname(currentFile);

const buildDir =
    process.env.GAME_FACTORY_BUILD_DIR;

if (!buildDir) {
    throw new Error(
        "GAME_FACTORY_BUILD_DIR is not set"
    );
}

const qaReportPath =
    process.env.GAME_FACTORY_QA_REPORT;

if (!qaReportPath) {
    throw new Error(
        "GAME_FACTORY_QA_REPORT is not set"
    );
}

if (!buildDir) {
    throw new Error(
        "GAME_FACTORY_BUILD_DIR is not set"
    );
}

export default defineConfig({
    testDir: "./tests",

    timeout: 20_000,

    use: {
        baseURL:
            "http://127.0.0.1:4173",

        browserName: "chromium",

        viewport: {
            width: 1280,
            height: 720
        },

        screenshot: "only-on-failure",
        trace: "retain-on-failure"
    },

    webServer: {
        command:
            "pnpm run serve:build",

        url:
            "http://127.0.0.1:4173/__health",

        reuseExistingServer: false,

        timeout: 60_000,

        stdout: "pipe",
        stderr: "pipe",

        env: {
            ...process.env,

            GAME_FACTORY_BUILD_DIR:
                buildDir
        }
    },

    reporter: [
        ["line"],

        [
            "./src/GameFactoryReporter.ts",
            {
                outputFile: qaReportPath
            }
        ]
    ],
});