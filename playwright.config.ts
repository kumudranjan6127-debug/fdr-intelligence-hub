// Browser end-to-end tests (e2e/). The app runs on port 3100 against TEST_DATABASE_URL, which global-setup
// migrates and reseeds, so the demo database is never touched. Locally set PW_CHANNEL=chrome to use installed Chrome.
import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const testDb = process.env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Set TEST_DATABASE_URL to a throwaway database (it is reseeded on every run).");
if (testDb === process.env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: e2e tests reseed it.");

const PORT = 3100;
const appEnv = { DATABASE_URL: testDb, DATABASE_URL_UNPOOLED: testDb, DEMO_MODE: "1", ANTHROPIC_API_KEY: "", BLOB_READ_WRITE_TOKEN: "" };

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 180_000,
  expect: { timeout: 30_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: process.env.PW_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: process.env.CI ? `npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    env: appEnv,
    reuseExistingServer: false,
    timeout: 300_000,
  },
});
