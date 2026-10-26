// Runs inside `npm run build`. On Vercel only: apply migrations, then seed the demo data if the database is
// empty. Locally it does nothing, so `npm run build` never touches your dev database.
import { execSync } from "child_process";

if (!process.env.VERCEL) {
  console.log("vercel-db-setup: not on Vercel, skipping migrations/seed");
  process.exit(0);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("npx prisma migrate deploy");
run("npx tsx prisma/seed-if-empty.ts");
