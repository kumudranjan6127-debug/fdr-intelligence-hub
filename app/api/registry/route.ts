import { db } from "@/lib/db";
import { SORTS, toCsv, type SortKey } from "@/lib/registry";
import { queryRegistry } from "@/lib/services/registry";
import { currentUser } from "@/lib/session";
import { appNow } from "@/lib/demo-clock";

// CSV export of the FDR registry with the same search and category as the page. Officers only.
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user || user.role === "INSTITUTION" || user.role === "BANK") return new Response("Not found", { status: 404 });
  const p = new URL(req.url).searchParams;
  const sort = (SORTS as readonly string[]).includes(p.get("sort") ?? "") ? (p.get("sort") as SortKey) : undefined;
  const { rows } = await queryRegistry(db, { q: p.get("q") ?? "", cat: p.get("cat") ?? undefined, sort, dir: p.get("dir") === "asc" ? "asc" : "desc" }, await appNow());
  const day = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + toCsv(rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fdr-registry-${day}.csv"`, "Cache-Control": "private, no-store" },
  });
}
