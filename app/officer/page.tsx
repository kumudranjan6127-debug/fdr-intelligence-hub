import Link from "next/link";
import type { CaseStatus, CaseType } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { CaseStatusBadge, RiskBadge } from "@/components/badges";
import { db } from "@/lib/db";
import { formatLakh, humanize } from "@/lib/format";
import { effectiveValue, tierFieldsOf } from "@/lib/provenance";
import { requirePageUser } from "@/lib/session";
import { getActiveRules } from "@/lib/services/core";
import { OFFICER_ROLES, OPEN_CASE_STATUSES } from "@/lib/transitions";
import { caseInclude, userNames, whyFor } from "@/lib/views";
import { cn } from "@/lib/utils";

export const metadata = { title: "Officer queue" };
export const dynamic = "force-dynamic";

type Search = { status?: string; type?: string; view?: string; ro?: string };

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
  const now = new Date();
  const rows = cases
    .map((c) => ({ c, w: whyFor(c, rules.caseSlaDays, names, now) }))
    .sort((a, b) => b.c.instrument.institution.riskScore - a.c.instrument.institution.riskScore || +a.c.openedAt - +b.c.openedAt);

  const isMine = (r: (typeof rows)[number]) =>
    user.role === "CELL" ? r.c.clearances.some((x) => x.cell === user.cell && x.status === "PENDING") && r.c.status === "CLEARANCES_PENDING" : user.role === "ADMIN" || r.w.ownerRole === user.role || (user.role === "RO" && r.w.ownerRole === "BUREAU");
  const mine = rows.filter(isMine);
  const shown = view === "all" ? rows : mine;
  const ros = Array.from(new Set((await db.institution.findMany({ select: { regionalOffice: true } })).map((i) => i.regionalOffice))).sort();

  const q = (patch: Partial<Search>) => {
    const p = new URLSearchParams({ ...(sp as Record<string, string>), ...(patch as Record<string, string>) });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/officer?${p.toString()}`;
  };

  return (
    <AppShell user={user}>
      <PageHeader title="Verification queue" subtitle="Sorted by institution risk score, then by age. Risk = late renewals, coverage gaps, open discrepancies and overdue cases." />

      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <div className="inline-flex rounded-lg border bg-card p-0.5">
          {[
            ["mine", `Needs my action (${mine.length})`],
            ["all", `All open (${rows.length})`],
          ].map(([v, label]) => (
            <Link key={v} href={q({ view: v })} className={cn("rounded-md px-3 py-1", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              {label}
            </Link>
          ))}
        </div>
        <form className="flex flex-wrap items-center gap-2" action="/officer">
          <input type="hidden" name="view" value={view} />
          <select name="status" defaultValue={sp.status ?? ""} className="h-8 rounded-lg border bg-card px-2 text-sm" aria-label="Filter by status">
            <option value="">Any status</option>
            {OPEN_CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
          <select name="type" defaultValue={sp.type ?? ""} className="h-8 rounded-lg border bg-card px-2 text-sm" aria-label="Filter by case type">
            <option value="">Any type</option>
            {["NEW_SUBMISSION", "RENEWAL", "REPLACEMENT", "RELEASE"].map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
          <select name="ro" defaultValue={sp.ro ?? ""} className="h-8 rounded-lg border bg-card px-2 text-sm" aria-label="Filter by regional office">
            <option value="">All regional offices</option>
            {ros.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button className="h-8 rounded-lg border bg-card px-3 hover:bg-muted">Apply</button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Risk</th>
              <th className="px-3 py-2 font-medium">Case</th>
              <th className="px-3 py-2 font-medium">Institution</th>
              <th className="px-3 py-2 font-medium">Amount</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Why pending</th>
              <th className="px-3 py-2 text-right font-medium">Days</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ c, w }) => {
              const high = c.instrument.discrepancies.filter((d) => d.severity === "HIGH").length;
              return (
                <tr key={c.id} className="border-t align-top hover:bg-muted/30">
                  <td className="px-3 py-2.5">
                    <RiskBadge score={c.instrument.institution.riskScore} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Link href={`/officer/cases/${c.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                      {c.code}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {humanize(c.type)} · {c.instrument.type === "FDR" ? "FDR" : "Online"}
                    </div>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="max-w-64 truncate font-medium" title={c.instrument.institution.name}>
                      {c.instrument.institution.name}
                    </div>
                    <div className="text-xs text-muted-foreground">{c.instrument.institution.regionalOffice}</div>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums">{formatLakh(String(effectiveValue(tierFieldsOf(c.instrument).amount)))}</td>
                  <td className="px-3 py-2.5">
                    <CaseStatusBadge status={c.status} />
                    {high > 0 && (
                      <div className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-red-700">
                        <AlertTriangle className="size-3" aria-hidden /> {high} high-severity
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="font-medium">{w.blockingStep}</div>
                    <div className="text-xs text-muted-foreground">Owner: {w.owner}</div>
                  </td>
                  <td className={cn("px-3 py-2.5 text-right tabular-nums", w.slaBreached && "font-semibold text-red-700")}>
                    {w.daysPending}
                    {w.slaBreached && <div className="text-[10px] font-medium">SLA {rules.caseSlaDays}d</div>}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                  Nothing waiting on you. <Link href={q({ view: "all" })} className="text-primary hover:underline">See all open cases</Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
