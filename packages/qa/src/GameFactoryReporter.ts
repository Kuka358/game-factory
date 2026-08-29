import fs from "node:fs/promises";
import path from "node:path";

import type {
    FullResult,
    Reporter,
    TestCase,
    TestResult
} from "@playwright/test/reporter";

import type {
    QaReport,
    QaTestStatus
} from "./QaReport.js";

interface GameFactoryReporterOptions {
    outputFile: string;
}

export default class GameFactoryReporter
    implements Reporter
{
    private readonly tests:
        QaReport["tests"] = [];

    private readonly errors:
        string[] = [];

    private readonly screenshots:
        string[] = [];

    constructor(
        private readonly options:
            GameFactoryReporterOptions
    ) {}

    printsToStdio(): boolean {
        return false;
    }

    onTestEnd(
        test: TestCase,
        result: TestResult
    ): void {
        this.tests.push({
            id: test
                .titlePath()
                .join(" > "),

            status:
                this.mapTestStatus(
                    result.status
                ),

            duration_ms:
                result.duration
        });

        for (
            const error of
            result.errors
        ) {
            if (error.message) {
                this.errors.push(
                    error.message
                );
            }
        }

        for (
            const attachment of
            result.attachments
        ) {
            if (
                attachment.path &&
                attachment.contentType
                    .startsWith("image/")
            ) {
                this.screenshots.push(
                    attachment.path
                );
            }
        }
    }

    async onEnd(
        result: FullResult
    ): Promise<void> {
        try {
            const report: QaReport = {
                result:
                    result.status ===
                    "passed"
                        ? "passed"
                        : "failed",

                tests: this.tests,

                errors: this.errors,

                screenshots:
                    this.screenshots,

                metrics: {}
            };

            const reportPath =
                path.resolve(
                    this.options.outputFile
                );

            await fs.mkdir(
                path.dirname(reportPath),
                {
                    recursive: true
                }
            );

            await fs.writeFile(
                reportPath,
                JSON.stringify(
                    report,
                    null,
                    2
                ),
                "utf8"
            );

            console.log(
                `QA report written: ${reportPath}`
            );
        } catch (error) {
            console.error(
                "Failed to write Game Factory QA report:",
                error
            );
        }
    }

    private mapTestStatus(
        status: TestResult["status"]
    ): QaTestStatus {
        if (status === "passed") {
            return "passed";
        }

        if (status === "skipped") {
            return "skipped";
        }

        return "failed";
    }
}