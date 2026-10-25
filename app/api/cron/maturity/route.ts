import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { runMaturityJob } from "@/lib/services/maturity";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. Signed-in officers may also trigger it.
async function authorized(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") === `Bearer ${secret}`) return true;
  const u = await currentUser();
  if (u && ["RO", "BUREAU", "AUTHORITY", "ADMIN"].includes(u.role)) return true;
  return !secret && process.env.NODE_ENV !== "production";
}

async function handle(req: Request) {
  if (!(await authorized(req))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const result = await runMaturityJob(db);
  return NextResponse.json(result);
}

export const GET = handle;
export const POST = handle;
