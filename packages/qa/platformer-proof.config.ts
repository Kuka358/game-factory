import { defineConfig } from "@playwright/test";
import base from "./playwright.config.js";
export default defineConfig(base, { testDir: "./proof", testMatch: "platformer.proof.spec.ts", timeout: 180_000, retries: 0 });
