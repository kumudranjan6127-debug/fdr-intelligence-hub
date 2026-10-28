import Link from "next/link";
import type { CaseStatus, CaseType } from "@prisma/client";
import { AlertTriangle, Clock, Inbox, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { CaseStatusBadge } from "@/components/badges";
import { EmptyState, StatCard } from "@/components/ui-kit";
import { db } from "@/lib/db";
import { formatLakh, humanize } from "@/lib/format";
import { effectiveValue, tierFieldsOf } from "@/lib/provenance";
import { riskBand } from "@/lib/risk";
import { requirePageUser } from "@/lib/session";
import { getActiveRules } from "@/lib/services/core";
import { OFFICER_ROLES, OPEN_CASE_STATUSES } from "@/lib/transitions";
import { caseInclude, userNames, whyFor } from "@/lib/views";
import { cn } from "@/lib/utils";
import { appNow } from "@/lib/demo-clock";

export const metadata = { title: "Verification queue" };
export const dynamic = "force-dynamic";

type Search = { status?: string; type?: string; view?: string; ro?: string };
const selectCls = "h-9 rounded-lg border bg-background px-2.5 text-sm";

function RiskChip({ score }: { score: number }) {
  const band = riskBand(score);
  return (
    <span
      className={cn(
        "inline-flex size-10 flex-col items-center justify-center rounded-lg text-sm font-semibold tabular-nums leading-none",
        band === "HIGH" ? "bg-red-100 text-red-800" : band === "MEDIUM" ? "bg-amber-100 text-amber-900" : "bg-emerald-100 text-emerald-800",
      )}
      title={`Risk ${Math.round(score)} (${band.toLowerCase()})`}
    >
      {Math.round(score)}
      <span className="mt-0.5 text-[9px] font-medium uppercase tracking-wide">{band === "MEDIUM" ? "med" : band.toLowerCase()}</span>
    </span>
  );
}

export default async function OfficerQueue({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requirePageUser([...OFFICER_ROLES, "BANK"]);
  const sp = await searchParams;
  const { rules } = await getActiveRules(db);
  const statusFilter = OPEN_CASE_STATUSES.includes(sp.status as CaseStatus) ? (sp.status as CaseStatus) : undefined;
  const typeFilter = ["NEW_SUBMISSION", "RENEWAL", "REPLACEMENT", "RELEASE"].includes(sp.type ?? "") ? (sp.type as CaseType) : undefined;
  const view = sp.view ?? "mine";

  const cases = await db.case.findMany({
    where: {
      status: statusFilter ?? { in: OPEN_CASE_STATUSES },
      type: typeFilter,
      instrument: {
        ...(user.role === "BANK" ? { bankId: user.bankId } : {}),
        ...(sp.ro ? { institution: { regionalOffice: sp.ro } } : {}),
      },
    },
    include: caseInclude,
  });
  const names = await userNames(cases.flatMap((c) => c.clearances.map((x) => x.decidedById)));
  const now = await appNow();
  const rows = cases
    .map((c) => ({ c, w: whyFor(c, rules.caseSlaDays, names, now) }))
    .sort((a, b) => b.c.instrument.institution.riskScore - a.c.instrument.institution.riskScore || +a.c.openedAt - +b.c.openedAt);

  const isMine = (r: (typeof rows)[number]) =>
    user.role === "CELL"
      ? r.c.status === "CLEARANCES_PENDING" && r.c.clearances.some((x) => x.cell === user.cell && x.status === "PENDING")
      : user.role === "ADMIN" || r.w.ownerRole === user.role || (user.role === "RO" && r.w.ownerRole === "BUREAU");
  const mine = rows.filter(isMine);
  const shown = view === "all" ? rows : mine;
  const breached = rows.filter((r) => r.w.slaBreached).length;
  const withHigh = rows.filter((r) => r.c.instrument.discrepancies.some((d) => d.severity === "HIGH")).length;
  const ros = Array.from(new Set((await db.institution.findMany({ select: { regionalOffice: true } })).map((i) => i.regionalOffice))).sort();

  const q = (patch: Partial<Search>) => {
    const p = new URLSearchParams({ ...(sp as Record<string, string>), ...(patch as Record<string, string>) });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/officer?${p.toString()}`;
  };

  return (
    <>
      <PageHeader eyebrow="Regulation Bureau" title="Verification queue" subtitle="Sorted by institution risk score, then age. Risk counts late renewals, coverage gaps, open discrepancies and overdue cases." />

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={UserCheck} label="Needs my action" value={mine.length} tone={mine.length ? "navy" : "slate"} />
        <StatCard icon={Inbox} label="All open cases" value={rows.length} tone="slate" />
        <StatCard icon={Clock} label={`Past ${rules.caseSlaDays}-day SLA`} value={breached} tone={breached ? "red" : "slate"} />
        <StatCard icon={AlertTriangle} label="With high-severity discrepancy" value={withHigh} tone={withHigh ? "amber" : "slate"} />
      </div>

      <div className="card-surface overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
          <div className="inline-flex rounded-lg bg-muted p-1 text-sm" role="tablist">
            {[
              ["mine", `Needs my action`, mine.length],
              ["all", `All open`, rows.length],
            ].map(([v, label, n]) => (
              <Link
                key={v as string}
                href={q({ view: v as string })}
                role="tab"
                aria-selected={view === v}
                className={cn("rounded-md px-3 py-1.5 font-medium", view === v ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {label} <span className="ml-1 text-xs text-muted-foreground">{n}</span>
              </Link>
            ))}
          </div>
          <form className="ml-auto flex flex-wrap items-center gap-2" action="/officer">
            <input type="hidden" name="view" value={view} />
            <select name="status" defaultValue={sp.status ?? ""} className={selectCls} aria-label="Filter by status">
              <option value="">Any status</option>
              {OPEN_CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </select>
            <select name="type" defaultValue={sp.type ?? ""} className={selectCls} aria-label="Filter by case type">
              <option value="">Any type</option>
              {["NEW_SUBMISSION", "RENEWAL", "REPLACEMENT", "RELEASE"].map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
            <select name="ro" defaultValue={sp.ro ?? ""} className={selectCls} aria-label="Filter by regional office">
              <option value="">All regional offices</option>
              {ros.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <button className="h-9 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">Apply</button>
          </form>
        </div>

        {shown.length === 0 ? (
          <EmptyState icon={Inbox} title="Nothing waiting on you">
            <Link href={q({ view: "all" })} className="text-primary hover:underline">
              See all open cases
            </Link>
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-4 py-2.5 font-medium">Risk</th>
                  <th className="px-3 py-2.5 font-medium">Case</th>
                  <th className="px-3 py-2.5 font-medium">Institution</th>
                  <th className="px-3 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-3 py-2.5 font-medium">Status</th>
                  <th className="px-3 py-2.5 font-medium">Why pending</th>
                  <th className="px-4 py-2.5 text-right font-medium">Days</th>
                </tr>
              </thead>
              <tbody>
                {shown.map(({ c, w }) => {
                  const high = c.instrument.discrepancies.filter((d) => d.severity === "HIGH").length;
                  return (
                    <tr key={c.id} className="group relative border-b align-middle last:border-b-0 hover:bg-primary/3">
                      <td className="px-4 py-3">
                        <RiskChip score={c.instrument.institution.riskScore} />
                      </td>
                      <td className="px-3 py-3">
                        <Link href={`/officer/cases/${c.id}`} className="font-mono text-xs font-semibold text-primary after:absolute after:inset-0 hover:underline">
                          {c.code}
                        </Link>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {humanize(c.type)} · {c.instrument.type === "FDR" ? "FDR" : "Online"}
                        </div>
                      </td>
                      <td className="max-w-72 px-3 py-3">
                        <div className="truncate font-medium" title={c.instrument.institution.name}>
                          {c.instrument.institution.name}
                        </div>
                        <div className="text-xs text-muted-foreground">{c.instrument.institution.regionalOffice}</div>
                      </td>
                      <td className="px-3 py-3 text-right font-medium tabular-nums">{formatLakh(String(effectiveValue(tierFieldsOf(c.instrument).amount)))}</td>
                      <td className="px-3 py-3">
                        <CaseStatusBadge status={c.status} />
                        {high > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-xs font-medium text-red-700">
                            <AlertTriangle className="size-3" aria-hidden /> {high} high-severity
                          </div>
                        )}
                      </td>
                      <td className="max-w-64 px-3 py-3">
                        <div className="font-medium">{w.blockingStep}</div>
                        <div className="text-xs text-muted-foreground">Owner: {w.owner}</div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={cn("inline-flex min-w-10 justify-center rounded-md px-2 py-1 text-sm font-semibold tabular-nums", w.slaBreached ? "bg-red-100 text-red-800" : "bg-muted text-foreground")}>{w.daysPending}</span>
                        {w.slaBreached && <div className="mt-0.5 text-[10px] font-medium text-red-700">SLA breached</div>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
