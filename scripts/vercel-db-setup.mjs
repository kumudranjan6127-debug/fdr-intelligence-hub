// Runs inside `npm run build`. On Vercel production builds only: apply migrations, then seed the demo data if the database is
// empty. Locally it does nothing, so `npm run build` never touches your dev database.
// A commit whose message contains "[reseed]" wipes and reseeds the demo data on that one deploy.
import { execSync } from "child_process";

if (!process.env.VERCEL) {
  console.log("vercel-db-setup: not on Vercel, skipping migrations/seed");
  process.exit(0);
}
// Preview deployments share the production Neon database, so a branch must never migrate or reseed it.
if (process.env.VERCEL_ENV !== "production") {
  console.log(`vercel-db-setup: ${process.env.VERCEL_ENV} build, skipping migrations/seed`);
  process.exit(0);
}
const run = (cmd) => execSync(cmd, { stdio: "inherit" });
run("npx prisma migrate deploy");
if ((process.env.VERCEL_GIT_COMMIT_MESSAGE ?? "").includes("[reseed]")) run("npx tsx prisma/seed.ts");
else run("npx tsx prisma/seed-if-empty.ts");
