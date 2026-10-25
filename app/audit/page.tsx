import Link from "next/link";
import { CheckCircle2, XCircle } from "lucide-react";
import { AppShell, PageHeader, ROLE_LABEL } from "@/components/app-shell";
import { MockLabel } from "@/components/badges";
import { db } from "@/lib/db";
import { verifyEventChain } from "@/lib/events";
import { fmtDateTime, humanize, shortHash } from "@/lib/format";
import { requirePageUser } from "@/lib/session";

export const metadata = { title: "Audit trail" };
export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const user = await requirePageUser(["RO", "BUREAU", "AUTHORITY", "ADMIN"]);
  const [check, events, anchors] = await Promise.all([
    verifyEventChain(db),
    db.event.findMany({ orderBy: { seq: "desc" }, take: 100, include: { actor: { select: { name: true } }, instrument: { select: { code: true, id: true } } } }),
    db.ledgerAnchor.groupBy({ by: ["refType"], _count: true }),
  ]);

  return (
    <AppShell user={user}>
      <PageHeader title="Audit trail" subtitle="Append-only. Each event's SHA-256 covers its content and the previous event's hash, so any edit or deletion breaks the chain." actions={<MockLabel>Hash anchored (DB) — ledger in Phase 3</MockLabel>} />

      <div className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${check.ok ? "border-emerald-300 bg-emerald-50" : "border-red-300 bg-red-50"}`} role="status">
        {check.ok ? <CheckCircle2 className="size-5 text-emerald-700" aria-hidden /> : <XCircle className="size-5 text-red-700" aria-hidden />}
        <div className="text-sm">
          <div className="font-medium">{check.ok ? `Hash chain intact — all ${check.checked} events re-verified` : `Chain broken at event #${check.brokenAt}: ${check.problem}`}</div>
          <div className="text-muted-foreground">Anchors: {anchors.map((a) => `${a._count} ${a.refType.toLowerCase()}`).join(" · ")}</div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">#</th>
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Instrument</th>
              <th className="px-3 py-2 font-medium">Hash · prev</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id} className="border-t align-top">
                <td className="px-3 py-2 tabular-nums text-muted-foreground">{e.seq}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs">{fmtDateTime(e.createdAt)}</td>
                <td className="px-3 py-2">
                  {humanize(e.action)}
                  {e.reason && <div className="max-w-80 truncate text-xs italic text-muted-foreground" title={e.reason}>“{e.reason}”</div>}
                </td>
                <td className="px-3 py-2 text-xs">
                  {e.actor?.name ?? "System job"}
                  <div className="text-muted-foreground">{ROLE_LABEL[e.actorRole]}</div>
                </td>
                <td className="px-3 py-2">
                  {e.instrument && (
                    <Link href={`/institution/instruments/${e.instrument.id}`} className="font-mono text-xs hover:underline">
                      {e.instrument.code}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">
                  {shortHash(e.sha256, 10)}
                  <div>← {shortHash(e.prevSha256, 10)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
