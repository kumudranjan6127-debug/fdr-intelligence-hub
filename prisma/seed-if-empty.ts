// Runs during `vercel-build`: seeds the demo dataset only when the database has no users yet,
// so redeploys never wipe data. To reseed on purpose, run `npm run db:seed` against the database.
import { execSync } from "child_process";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

(async () => {
  const users = await db.user.count();
  await db.$disconnect();
  if (users > 0) {
    console.log(`Database already has ${users} users — skipping seed.`);
    return;
  }
  console.log("Empty database — seeding demo data…");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
