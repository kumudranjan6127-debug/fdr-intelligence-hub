// Integration tests: the real services against a real Postgres (TEST_DATABASE_URL), wiped and reseeded per run.
import { defineConfig } from "vitest/config";
import { loadEnv } from "vite";
import { fileURLToPath } from "url";

const env = { ...loadEnv("test", process.cwd(), ""), ...process.env };
const testDb = env.TEST_DATABASE_URL;
if (!testDb) throw new Error("Set TEST_DATABASE_URL to a throwaway database (it is wiped on every run).");
process.env.TEST_DATABASE_URL = testDb; // for global-setup, which runs in this process
if (testDb === env.DATABASE_URL) throw new Error("TEST_DATABASE_URL must differ from DATABASE_URL: integration tests wipe it.");

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: {
    include: ["tests/integration/**/*.test.ts"],
    globalSetup: ["tests/integration/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 900_000,
    env: {
      DATABASE_URL: testDb,
      DATABASE_URL_UNPOOLED: testDb,
      DEMO_MODE: "1",
      // Deterministic extraction (local text parser) and in-database file storage.
      ANTHROPIC_API_KEY: "",
      BLOB_READ_WRITE_TOKEN: "",
    },
  },
});
