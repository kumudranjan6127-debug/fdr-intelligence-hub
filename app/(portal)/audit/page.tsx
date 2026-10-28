import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { CheckCircle2, Fingerprint, Link2, Search, XCircle } from "lucide-react";
import { PageHeader, ROLE_LABEL } from "@/components/app-shell";
import { MockLabel } from "@/components/badges";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db";
import { verifyEventChain } from "@/lib/events";
import { fmtDateTime, humanize, shortHash } from "@/lib/format";
import { requirePageUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

const PAGE = 30;
const GROUPS: Record<string, { label: string; actions: string[] }> = {
  submissions: { label: "Submissions", actions: ["INSTRUMENT_SUBMITTED", "DOCUMENT_UPLOADED", "AI_EXTRACTED", "CASE_OPENED"] },
  verification: { label: "Verification", actions: ["AA_CONFIRMED", "AA_NOT_FOUND", "AA_FIP_UNKNOWN", "CASE_ACCEPT", "CASE_REQUEST_CLARIFICATION", "CASE_COMPLETENESS_CHECK", "CASE_START_SCRUTINY"] },
  release: { label: "Release & NOC", actions: ["CASE_SEND_FOR_CLEARANCES", "CLEARANCE_CLEARED", "PENALTY_ASSESSED", "CASE_APPROVE_RELEASE", "NOC_ISSUED", "NOC_REVOKED", "CASE_BANK_CONFIRM", "CASE_CLOSED"] },
  system: { label: "System jobs", actions: ["STATUS_RECOMPUTED", "REMINDER_SENT", "INSTRUMENT_STATUS"] },
};

type SP = { group?: string; q?: string; page?: string };

function href(sp: SP, patch: Partial<SP>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `/audit?${s}` : "/audit";
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requirePageUser(["RO", "BUREAU", "AUTHORITY", "ADMIN"]);
  const sp = await searchParams;
  const group = GROUPS[sp.group ?? ""] ? sp.group! : "";
  const q = (sp.q ?? "").trim();
  const where: Prisma.EventWhereInput = {
    ...(group ? { action: { in: GROUPS[group].actions } } : {}),
    ...(q ? { OR: [{ instrument: { code: { contains: q, mode: "insensitive" } } }, { actor: { name: { contains: q, mode: "insensitive" } } }, { action: { contains: q.toUpperCase().replace(/\s+/g, "_") } }] } : {}),
  };
  const [check, total, anchors, counts] = await Promise.all([
    verifyEventChain(db),
    db.event.count({ where }),
    db.ledgerAnchor.groupBy({ by: ["refType"], _count: true }),
    Promise.all(Object.entries(GROUPS).map(async ([k, g]) => [k, await db.event.count({ where: { action: { in: g.actions } } })] as const)),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const page = Math.min(pages, Math.max(1, Number(sp.page) || 1));
  const events = await db.event.findMany({
    where,
    orderBy: { seq: "desc" },
    skip: (page - 1) * PAGE,
    take: PAGE,
    include: { actor: { select: { name: true } }, instrument: { select: { code: true, id: true } } },
  });

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard", href: "/dashboard" }, { label: "Audit trail" }]}
        title="Audit trail"
        subtitle="Append-only. Each event's SHA-256 covers its content and the previous event's hash, so any edit or deletion breaks the chain."
        actions={<MockLabel>Hash anchored (DB) · ledger in Phase 3</MockLabel>}
      />

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <div className={cn("flex items-start gap-3 rounded-xl border p-5", check.ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50")} role="status">
          {check.ok ? <CheckCircle2 className="size-6 shrink-0 text-emerald-700" aria-hidden /> : <XCircle className="size-6 shrink-0 text-red-700" aria-hidden />}
          <div className="text-sm">
            <div className="text-base font-semibold">{check.ok ? `Hash chain intact: all ${check.checked} events re-verified just now` : `Chain broken at event #${check.brokenAt}: ${check.problem}`}</div>
            <div className="mt-1 text-muted-foreground">Anchors: {anchors.map((a) => `${a._count} ${a.refType.toLowerCase()}`).join(" · ")}</div>
          </div>
        </div>
        <div className="card-surface p-5 text-sm">
          <div className="flex items-center gap-2 font-semibold">
            <Link2 className="size-4 text-primary" aria-hidden />
            How the chain works
          </div>
          <p className="mt-1.5 leading-relaxed text-muted-foreground">
            Event <span className="font-mono">n</span> stores <span className="font-mono">sha256(content + hash of n−1)</span>. Changing or deleting any earlier event changes every hash after it, and this page
            reports the first broken link.
          </p>
        </div>
      </div>

      <div className="my-4 flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Event types" className="flex flex-wrap gap-2">
          <Link
            href={href(sp, { group: undefined, page: undefined })}
            aria-current={!group ? "true" : undefined}
            className={cn("rounded-full border px-3 py-1 text-sm font-medium", !group ? "border-gov-blue bg-gov-blue text-white" : "bg-card hover:bg-muted")}
          >
            All events <span className="opacity-70">{check.checked}</span>
          </Link>
          {counts.map(([k, n]) => (
            <Link
              key={k}
              href={href(sp, { group: k, page: undefined })}
              aria-current={group === k ? "true" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm font-medium", group === k ? "border-gov-blue bg-gov-blue text-white" : "bg-card hover:bg-muted")}
            >
              {GROUPS[k].label} <span className="opacity-70">{n}</span>
            </Link>
          ))}
        </nav>
        <form action="/audit" className="flex gap-2">
          {group && <input type="hidden" name="group" value={group} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input name="q" defaultValue={q} aria-label="Search by instrument code, person or action" placeholder="Instrument, person or action" className="h-9 w-64 rounded-lg border bg-background pl-8 pr-3 text-sm" />
          </div>
          <button className={buttonVariants({ variant: "outline" })}>Search</button>
        </form>
      </div>

      <div className="card-surface overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-200 text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2.5 font-semibold">#</th>
                <th className="px-3 py-2.5 font-semibold">When</th>
                <th className="px-3 py-2.5 font-semibold">Action</th>
                <th className="px-3 py-2.5 font-semibold">Actor</th>
                <th className="px-3 py-2.5 font-semibold">Instrument</th>
                <th className="px-4 py-2.5 font-semibold">
                  <span className="inline-flex items-center gap-1">
                    <Fingerprint className="size-3.5" aria-hidden /> Hash ← previous
                  </span>
                </th>
              </tr>
            </thead>
            <tbody>
              {events.map((e) => (
                <tr key={e.id} className="border-b align-top last:border-b-0 hover:bg-muted/30">
                  <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{e.seq}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-xs">{fmtDateTime(e.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <span className="font-medium">{humanize(e.action)}</span>
                    {e.reason && (
                      <div className="max-w-80 truncate text-xs italic text-muted-foreground" title={e.reason}>
                        “{e.reason}”
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs">
                    {e.actor?.name ?? "System job"}
                    <div className="text-muted-foreground">{ROLE_LABEL[e.actorRole]}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    {e.instrument && (
                      <Link href={`/institution/instruments/${e.instrument.id}`} className="font-mono text-xs text-primary hover:underline">
                        {e.instrument.code}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[11px] text-muted-foreground">
                    {shortHash(e.sha256, 10)}
                    <div>← {shortHash(e.prevSha256, 10)}</div>
                  </td>
                </tr>
              ))}
              {events.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    No events match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
          <span className="text-muted-foreground">
            {total ? `Showing ${(page - 1) * PAGE + 1}–${Math.min(page * PAGE, total)} of ${total}` : "0 events"}
          </span>
          {pages > 1 && (
            <nav aria-label="Pages" className="flex items-center gap-1">
              <Link
                href={href(sp, { page: page > 2 ? String(page - 1) : undefined })}
                aria-disabled={page === 1}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), page === 1 && "pointer-events-none opacity-50")}
              >
                Newer
              </Link>
              <span className="px-2 tabular-nums text-muted-foreground">
                Page {page} of {pages}
              </span>
              <Link href={href(sp, { page: String(page + 1) })} aria-disabled={page === pages} className={cn(buttonVariants({ variant: "outline", size: "sm" }), page === pages && "pointer-events-none opacity-50")}>
                Older
              </Link>
            </nav>
          )}
        </footer>
      </div>
    </>
  );
}
