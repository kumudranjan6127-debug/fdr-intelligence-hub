import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

// Health check: reports whether the database is reachable and seeded. Never echoes connection strings.
export async function GET() {
  const env = {
    DATABASE_URL: !!process.env.DATABASE_URL,
    DATABASE_URL_UNPOOLED: !!process.env.DATABASE_URL_UNPOOLED,
    ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
    CRON_SECRET: !!process.env.CRON_SECRET,
  };
  try {
    const [users, instruments] = await Promise.all([db.user.count(), db.instrument.count()]);
    return NextResponse.json({ ok: true, db: "reachable", users, instruments, env });
  } catch (e) {
    const err = e as { name?: string; code?: string; message?: string };
    const message = (err.message ?? String(e)).replace(/postgres(ql)?:\/\/\S+/g, "<redacted-url>").slice(0, 600);
    return NextResponse.json({ ok: false, db: "error", error: { name: err.name, code: err.code, message }, env }, { status: 500 });
  }
}
