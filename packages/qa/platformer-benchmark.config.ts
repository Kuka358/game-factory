import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";

// Separate from ordinary CI; reuse the same build server, reporter and browser.
export default defineConfig(base, {
    testDir: "./benchmark",
    testMatch: "platformer.benchmark.spec.ts",
    timeout: 90_000,
    retries: 0
});
