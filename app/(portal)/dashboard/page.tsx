import Link from "next/link";
import { AlertTriangle, Bell, CalendarClock, CheckCircle2, Clock, FileWarning, Hourglass, Inbox, RefreshCw, ShieldCheck, TrendingUp, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { RiskBadge, SeverityBadge } from "@/components/badges";
import { MaturityJobButton } from "@/components/maturity-job-button";
import { EmptyState, Section, StatCard } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
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
    db.institution.findMany({ orderBy: { riskScore: "desc" }, take: 6 }),
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
      acc[d.code] ??= { code: d.code, severity: d.severity, n: 0 };
      acc[d.code].n += d._count;
      if (d.severity === "HIGH") acc[d.code].severity = "HIGH";
      return acc;
    }, {}),
  ).sort((a, b) => b.n - a.n);
  const maxDisc = Math.max(1, ...discByCode.map((d) => d.n));

  return (
    <>
      <PageHeader
        eyebrow="Management overview"
        title="Security deposit dashboard"
        subtitle={`${instruments.length} instruments · ${formatLakh(held)} principal held with AICTE · as of ${fmtDateTime(now)}`}
        actions={["RO", "BUREAU", "ADMIN", "AUTHORITY"].includes(user.role) ? <MaturityJobButton /> : null}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard icon={ShieldCheck} label="Active" value={count(["ACTIVE"])} tone="green" />
        <StatCard icon={Hourglass} label="Expiring ≤ 90 days" value={count(["EXPIRING"])} tone="amber" />
        <StatCard icon={CalendarClock} label="Matured" value={count(["MATURED"])} tone="orange" hint={`${unclaimed.length} past 10-yr term`} />
        <StatCard icon={RefreshCw} label="Renewed / replaced" value={count(["RENEWED", "REPLACED"])} tone="slate" />
        <StatCard icon={Wallet} label="Released" value={count(["RELEASED", "CLOSED"])} tone="violet" />
        <StatCard icon={Inbox} label="Pending cases" value={openCases.length} tone={overSla ? "red" : "navy"} hint={`${overSla} past ${rules.caseSlaDays}-day SLA`} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="Open cases by age" icon={Clock} description={`Days since the case was opened · ${openCases.length} open`}>
          <div className="space-y-3" role="img" aria-label={buckets.map((b) => `${b.label}: ${b.n}`).join(", ")}>
            {buckets.map((b) => (
              <div key={b.label} className="grid grid-cols-[84px_1fr] items-center gap-3 text-sm" title={`${b.label}: ${b.n} case${b.n === 1 ? "" : "s"}`}>
                <span className="text-xs text-muted-foreground">{b.label}</span>
                <div className="flex items-center gap-2">
                  <div className="h-6 flex-1 rounded-md bg-muted/60">
                    <div className="h-6 rounded-r-sm rounded-l-md bg-primary/80 transition-all hover:bg-primary" style={{ width: `${(b.n / maxBucket) * 100}%`, minWidth: b.n ? 6 : 0 }} />
                  </div>
                  <span className="w-6 text-right text-sm font-medium tabular-nums">{b.n}</span>
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
        </Section>

        <Section title="Maturing in the next 30 days" icon={CalendarClock} description="Reminders go out at 90 / 30 / 7 days" bodyClassName="p-0">
          {expiring30.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing matures in the next 30 days" />
          ) : (
            <ul className="divide-y">
              {expiring30.map(({ i, m, d }) => (
                <li key={i.id}>
                  <Link href={`/institution/instruments/${i.id}`} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 hover:bg-muted/40">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{i.institution.name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {i.code} · {formatLakh(String(effectiveValue(tierFieldsOf(i).amount)))}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", d! <= 7 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900")}>in {d} days</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{fmtDate(m)}</div>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title="Unclaimed matured deposits"
          icon={FileWarning}
          description={`Past the ${rules.termYears}-year term with no release application: the failure mode AICTE flagged in 2019`}
          bodyClassName="p-0"
          className="border-orange-200"
        >
          {unclaimed.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No unclaimed deposits" />
          ) : (
            <ul className="divide-y">
              {unclaimed.map(({ i, start, termEnd, overdue }) => (
                <li key={i.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{i.institution.name}</div>
                    <div className="text-xs text-muted-foreground">
                      <Link href={`/institution/instruments/${i.id}`} className="font-mono text-primary hover:underline">
                        {i.code}
                      </Link>{" "}
                      · {formatLakh(String(effectiveValue(tierFieldsOf(i).amount)))} · deposited {fmtDate(start)} · term ended {fmtDate(termEnd)}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs font-semibold text-orange-900">{overdue} days unclaimed</span>
                    <Link href={`/dashboard/notice/${i.id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                      Draft notice
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Risk leaderboard" icon={TrendingUp} description="40·late renewals + 30·gap days/30 + 20·open discrepancies + 10·overdue cases (cap 100)" bodyClassName="p-0">
          <ul className="divide-y">
            {institutions.map((i, idx) => {
              const parts = (i.riskBreakdown as { lateRenewals?: number; gapDays?: number; openDiscrepancies?: number; overdueCases?: number } | null) ?? {};
              return (
                <li key={i.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="w-5 text-sm font-semibold tabular-nums text-muted-foreground">{idx + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{i.name}</div>
                    <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                      {[
                        [parts.lateRenewals, "late renewal"],
                        [parts.gapDays, "gap days"],
                        [parts.openDiscrepancies, "open discrepancies"],
                        [parts.overdueCases, "overdue cases"],
                      ]
                        .filter(([n]) => Number(n) > 0)
                        .map(([n, l]) => (
                          <span key={l as string} className="rounded bg-muted px-1.5 py-0.5">
                            {n} {l}
                          </span>
                        ))}
                    </div>
                  </div>
                  <RiskBadge score={i.riskScore} />
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title="Open discrepancies by type" icon={AlertTriangle}>
          {discByCode.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="No open discrepancies" />
          ) : (
            <ul className="space-y-3">
              {discByCode.map((d) => (
                <li key={d.code} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 text-sm">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <SeverityBadge severity={d.severity} />
                      <span className="truncate">{humanize(d.code)}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted">
                      <div className={cn("h-1.5 rounded-full", d.severity === "HIGH" ? "bg-red-500" : "bg-amber-400")} style={{ width: `${(d.n / maxDisc) * 100}%` }} />
                    </div>
                  </div>
                  <span className="text-base font-semibold tabular-nums">{d.n}</span>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Recent reminders" icon={Bell} description="In-app channel · email and WhatsApp in Phase 6">
          {reminders.length === 0 ? (
            <EmptyState icon={Bell} title="No reminders yet">
              Click <strong>Run maturity job</strong> above.
            </EmptyState>
          ) : (
            <ul className="space-y-3 text-sm">
              {reminders.map((r) => (
                <li key={r.id} className="flex gap-3">
                  <span className="mt-0.5 h-fit shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium">{r.kind.replace("MATURITY_", "T-")}</span>
                  <div className="min-w-0">
                    <div>{r.message}</div>
                    <div className="text-xs text-muted-foreground">{fmtDateTime(r.sentAt ?? r.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
