import Link from "next/link";
import { AlertTriangle, CalendarClock, FileWarning } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { RiskBadge, SeverityBadge } from "@/components/badges";
import { MaturityJobButton } from "@/components/maturity-job-button";
import { db } from "@/lib/db";
import { addYears, daysBetween, fmtDate, fmtDateTime, formatLakh, humanize } from "@/lib/format";
import { bestEvidence, effectiveValue, normalize, tierFieldsOf } from "@/lib/provenance";
import { requirePageUser } from "@/lib/session";
import { getActiveRules, toChainNode } from "@/lib/services/core";
import { buildChain } from "@/lib/chain";
import { OFFICER_ROLES, OPEN_CASE_STATUSES } from "@/lib/transitions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const BUCKETS = [
  { label: "0–7 days", max: 7 },
  { label: "8–15 days", max: 15 },
  { label: "16–30 days", max: 30 },
  { label: "31–60 days", max: 60 },
  { label: "60+ days", max: Infinity },
];

export default async function Dashboard() {
  const user = await requirePageUser(OFFICER_ROLES);
  const now = new Date();
  const { rules } = await getActiveRules(db);
  const [instruments, openCases, discrepancies, reminders, institutions] = await Promise.all([
    db.instrument.findMany({ include: { institution: { select: { id: true, name: true, riskScore: true } }, cases: { select: { type: true, status: true } } } }),
    db.case.findMany({ where: { status: { in: OPEN_CASE_STATUSES } }, select: { id: true, code: true, type: true, status: true, statusChangedAt: true, openedAt: true } }),
    db.discrepancy.groupBy({ by: ["code", "severity"], where: { resolvedAt: null }, _count: true }),
    db.reminder.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { instrument: { select: { code: true, id: true } } } }),
    db.institution.findMany({ orderBy: { riskScore: "desc" }, take: 8 }),
  ]);

  const mat = (i: (typeof instruments)[number]) => normalize("maturityDate", bestEvidence(tierFieldsOf(i).maturityDate).value);
  const count = (s: string[]) => instruments.filter((i) => s.includes(i.status)).length;
  const held = instruments
    .filter((i) => ["ACTIVE", "EXPIRING", "MATURED", "RELEASE_REQUESTED"].includes(i.status))
    .reduce((s, i) => s + BigInt(String(effectiveValue(tierFieldsOf(i).amount) ?? "0")), 0n);

  const expiring30 = instruments
    .filter((i) => ["ACTIVE", "EXPIRING"].includes(i.status))
    .map((i) => ({ i, m: mat(i), d: mat(i) ? daysBetween(now, mat(i)!) : null }))
    .filter((x) => x.d !== null && x.d > 0 && x.d <= 30)
    .sort((a, b) => a.d! - b.d!);

  // U7 — past the 10-year term (from the chain's first deposit), matured, and no release application.
  const nodes = instruments.map(toChainNode);
  const unclaimed = instruments
    .filter((i) => i.status === "MATURED" && !i.cases.some((c) => c.type === "RELEASE" && !["REJECTED", "WITHDRAWN"].includes(c.status)))
    .map((i) => {
      const root = buildChain(nodes, i.id)[0];
      const start = root?.issueDate ?? normalize("issueDate", bestEvidence(tierFieldsOf(i).issueDate).value);
      const termEnd = start ? addYears(new Date(`${start}T00:00:00Z`), rules.termYears) : null;
      return { i, start, termEnd, overdue: termEnd ? daysBetween(termEnd, now) : null };
    })
    .filter((x) => x.termEnd && x.termEnd <= now);

  const ages = openCases.map((c) => daysBetween(c.openedAt, now));
  const buckets = BUCKETS.map((b, idx) => ({ ...b, n: ages.filter((a) => a <= b.max && (idx === 0 || a > BUCKETS[idx - 1].max)).length }));
  const maxBucket = Math.max(1, ...buckets.map((b) => b.n));
  const overSla = openCases.filter((c) => daysBetween(c.statusChangedAt, now) > rules.caseSlaDays).length;

  const discByCode = Object.values(
    discrepancies.reduce<Record<string, { code: string; severity: string; n: number }>>((acc, d) => {
      const k = d.code;
      acc[k] ??= { code: d.code, severity: d.severity, n: 0 };
      acc[k].n += d._count;
      if (d.severity === "HIGH") acc[k].severity = "HIGH";
      return acc;
    }, {}),
  ).sort((a, b) => b.n - a.n);

  const tiles = [
    { label: "Active", value: count(["ACTIVE"]) },
    { label: "Expiring ≤ 90 days", value: count(["EXPIRING"]), tone: "amber" },
    { label: "Matured", value: count(["MATURED"]), tone: "orange" },
    { label: "Renewed / replaced", value: count(["RENEWED", "REPLACED"]) },
    { label: "Released", value: count(["RELEASED", "CLOSED"]) },
    { label: "Pending cases", value: openCases.length, hint: `${overSla} past ${rules.caseSlaDays}-day SLA` },
  ];

  return (
    <AppShell user={user}>
      <PageHeader
        title="Security deposit dashboard"
        subtitle={`${instruments.length} instruments · ${formatLakh(held)} principal held · as of ${fmtDateTime(now)}`}
        actions={["RO", "BUREAU", "ADMIN", "AUTHORITY"].includes(user.role) ? <MaturityJobButton /> : null}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-xl border bg-card p-4">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className={cn("mt-1 text-3xl font-semibold tabular-nums", t.tone === "amber" && "text-amber-800", t.tone === "orange" && "text-orange-800")}>{t.value}</div>
            {t.hint && <div className="mt-0.5 text-xs text-muted-foreground">{t.hint}</div>}
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Open cases by age</h2>
          <p className="text-xs text-muted-foreground">Days since the case was opened · {openCases.length} open</p>
          <div className="mt-4 space-y-2" role="img" aria-label={buckets.map((b) => `${b.label}: ${b.n}`).join(", ")}>
            {buckets.map((b) => (
              <div key={b.label} className="group grid grid-cols-[88px_1fr] items-center gap-3 text-sm" title={`${b.label}: ${b.n} case${b.n === 1 ? "" : "s"}`}>
                <span className="text-xs text-muted-foreground">{b.label}</span>
                <div className="flex items-center gap-2">
                  <div className="h-5 rounded-r-[4px] bg-primary/80 transition group-hover:bg-primary" style={{ width: `${(b.n / maxBucket) * 85}%`, minWidth: b.n ? 4 : 0 }} />
                  <span className="text-xs tabular-nums text-foreground">{b.n}</span>
                </div>
              </div>
            ))}
          </div>
          <table className="sr-only">
            <caption>Open cases by age</caption>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.label}>
                  <th>{b.label}</th>
                  <td>{b.n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <CalendarClock className="size-4" aria-hidden /> Maturing in the next 30 days
          </h2>
          {expiring30.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Nothing matures in the next 30 days.</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {expiring30.map(({ i, m, d }) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/institution/instruments/${i.id}`} className="font-mono text-xs text-primary hover:underline">
                      {i.code}
                    </Link>
                    <div className="text-xs text-muted-foreground">{i.institution.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium text-amber-800">in {d} days</div>
                    <div className="text-xs text-muted-foreground">{fmtDate(m)} · {formatLakh(String(effectiveValue(tierFieldsOf(i).amount)))}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <FileWarning className="size-4" aria-hidden /> Unclaimed matured deposits
          </h2>
          <p className="text-xs text-muted-foreground">Past the {rules.termYears}-year term with no release application — the 2010-11 failure mode AICTE flagged in 2019.</p>
          {unclaimed.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">None.</p>
          ) : (
            <ul className="mt-3 divide-y text-sm">
              {unclaimed.map(({ i, start, termEnd, overdue }) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <Link href={`/institution/instruments/${i.id}`} className="font-mono text-xs text-primary hover:underline">
                      {i.code}
                    </Link>{" "}
                    <span className="text-xs">{formatLakh(String(effectiveValue(tierFieldsOf(i).amount)))}</span>
                    <div className="text-xs text-muted-foreground">
                      {i.institution.name} · deposited {fmtDate(start)} · term ended {fmtDate(termEnd)} ({overdue} days ago)
                    </div>
                  </div>
                  <Link href={`/dashboard/notice/${i.id}`} className="rounded-md border px-2 py-1 text-xs hover:bg-muted">
                    Draft notice
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Risk leaderboard</h2>
          <ul className="mt-3 divide-y text-sm">
            {institutions.map((i) => {
              const parts = (i.riskBreakdown as { lateRenewals?: number; gapDays?: number; openDiscrepancies?: number; overdueCases?: number } | null) ?? {};
              return (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div>
                    <div className="font-medium">{i.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {parts.lateRenewals ?? 0} late renewal · {parts.gapDays ?? 0} gap days · {parts.openDiscrepancies ?? 0} open discrepancies · {parts.overdueCases ?? 0} overdue cases
                    </div>
                  </div>
                  <RiskBadge score={i.riskScore} />
                </li>
              );
            })}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4" aria-hidden /> Open discrepancies by type
          </h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {discByCode.map((d) => (
              <li key={d.code} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <SeverityBadge severity={d.severity} /> {humanize(d.code)}
                </span>
                <span className="tabular-nums">{d.n}</span>
              </li>
            ))}
            {discByCode.length === 0 && <li className="text-muted-foreground">None open.</li>}
          </ul>
        </section>

        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-semibold">Recent reminders</h2>
          <p className="text-xs text-muted-foreground">In-app channel · email / WhatsApp in Phase 6</p>
          {reminders.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No reminders yet — run the maturity job.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {reminders.map((r) => (
                <li key={r.id}>
                  <span className="mr-2 rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{r.kind}</span>
                  {r.message}
                  <div className="text-xs text-muted-foreground">{fmtDateTime(r.sentAt ?? r.createdAt)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AppShell>
  );
}

