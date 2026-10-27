// Bring the test database's schema up to date and load the demo seed (which clears the app's rows first).
import { execSync } from "child_process";

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? "";
  const env = { ...process.env, DATABASE_URL: url, DATABASE_URL_UNPOOLED: url, DEMO_MODE: "1", ANTHROPIC_API_KEY: "" };
  const run = (cmd: string) => execSync(cmd, { stdio: "inherit", env });
  run("npx prisma migrate deploy");
  run("npx tsx prisma/seed.ts");
}
