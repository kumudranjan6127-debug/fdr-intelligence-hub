import Link from "next/link";
import { AlertTriangle, Bell, FileText, Inbox, Landmark, Plus, Scale, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { CaseStatusBadge, InstrumentStatusBadge, RiskBadge } from "@/components/badges";
import { ProvenanceBar } from "@/components/provenance-table";
import { EmptyState, Section, StatCard } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db";
import { daysBetween, fmtDate, fmtDateTime, formatINR, formatLakh, humanize } from "@/lib/format";
import { bestEvidence, effectiveValue, normalize, tierFieldsOf } from "@/lib/provenance";
import { requirePageUser } from "@/lib/session";
import { OPEN_CASE_STATUSES } from "@/lib/transitions";
import { cn } from "@/lib/utils";

export const metadata = { title: "My deposits" };
export const dynamic = "force-dynamic";

const HISTORY = ["RENEWED", "REPLACED", "RELEASED", "CLOSED", "REJECTED"];

export default async function InstitutionHome() {
  const user = await requirePageUser(["INSTITUTION"]);
  const inst = await db.institution.findUniqueOrThrow({ where: { id: user.institutionId! } });
  const instruments = await db.instrument.findMany({
    where: { institutionId: inst.id },
    include: {
      cases: { where: { status: { in: OPEN_CASE_STATUSES } }, orderBy: { openedAt: "desc" } },
      discrepancies: { where: { resolvedAt: null } },
      reminders: { orderBy: { createdAt: "desc" } },
    },
    orderBy: { createdAt: "desc" },
  });
  const now = new Date();
  const live = instruments.filter((i) => !HISTORY.includes(i.status));
  const history = instruments.filter((i) => HISTORY.includes(i.status));
  const reminders = instruments.flatMap((i) => i.reminders.map((r) => ({ ...r, code: i.code, instrumentId: i.id }))).sort((a, b) => +b.createdAt - +a.createdAt);
  const held = live.reduce((s, i) => s + BigInt(String(effectiveValue(tierFieldsOf(i).amount) ?? "0")), 0n);
  const required = live.reduce((s, i) => (BigInt(i.requiredAmount.toFixed(0)) > s ? BigInt(i.requiredAmount.toFixed(0)) : s), 0n);
  const openCases = live.reduce((s, i) => s + i.cases.length, 0);

  return (
    <>
      <PageHeader
        eyebrow="Institution"
        title={inst.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span>Permanent ID {inst.permanentId}</span>
            <span aria-hidden>·</span>
            <span>{inst.regionalOffice}</span>
            <span aria-hidden>·</span>
            <span>{inst.isLeased ? "Leased premises (deposit doubled)" : "Own premises"}</span>
            <RiskBadge score={inst.riskScore} />
          </span>
        }
        actions={
          <Link href="/institution/submit" className={buttonVariants({ size: "lg" })}>
            <Plus aria-hidden /> Submit new instrument
          </Link>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={Wallet} label="Deposits in force" value={live.length} />
        <StatCard icon={Landmark} label="Principal held with AICTE" value={formatLakh(held)} hint="Interest accrues to AICTE (APH §1.12)" tone="green" />
        <StatCard icon={Scale} label="Largest single requirement" value={formatLakh(required)} hint={`${inst.programmes} programmes${inst.isLeased ? " · ×2 leased" : ""}`} tone="slate" />
        <StatCard icon={Inbox} label="Open cases" value={openCases} tone={openCases ? "amber" : "slate"} hint={openCases ? "See “Why is this pending?” on each deposit" : "Nothing pending"} />
      </div>

      {reminders.length > 0 && (
        <Section title="Reminders" icon={Bell} className="mt-6 border-amber-300 bg-amber-50/50" description="In-app channel · email and WhatsApp arrive in Phase 6">
          <ul className="space-y-2.5 text-sm">
            {reminders.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900">{humanize(r.kind)}</span>
                <Link href={`/institution/instruments/${r.instrumentId}`} className="font-mono text-xs font-medium text-primary hover:underline">
                  {r.code}
                </Link>
                <span className="min-w-0 flex-1">{r.message}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(r.sentAt ?? r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mb-3 mt-8 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold tracking-tight">Deposits in force</h2>
        <span className="text-sm text-muted-foreground">{live.length} instrument{live.length === 1 ? "" : "s"}</span>
      </div>

      {live.length === 0 ? (
        <div className="card-surface">
          <EmptyState icon={Wallet} title="No deposits in force">
            {inst.isGovernment ? "Government institutions are exempt from the deposit (an affidavit is still required)." : "Submit your first FDR or online deposit to get started."}
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {live.map((i) => {
            const f = tierFieldsOf(i);
            const iss = normalize("issueDate", bestEvidence(f.issueDate).value);
            const mat = normalize("maturityDate", bestEvidence(f.maturityDate).value);
            const days = mat ? daysBetween(now, mat) : null;
            const total = iss && mat ? Math.max(1, daysBetween(iss, mat)) : 1;
            const elapsed = iss ? Math.min(100, Math.max(0, (daysBetween(iss, now) / total) * 100)) : 0;
            const c = i.cases[0];
            const high = i.discrepancies.filter((d) => d.severity === "HIGH");
            return (
              <Link key={i.id} href={`/institution/instruments/${i.id}`} className="card-surface group flex flex-col p-5 transition hover:border-primary/40 hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <FileText className="size-3.5" aria-hidden />
                    <span className="font-mono">{i.code}</span>
                    <span>· {i.type === "FDR" ? "Fixed Deposit Receipt" : "Online deposit"}</span>
                  </div>
                  <InstrumentStatusBadge status={i.status} />
                </div>
                <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight">{formatINR(String(effectiveValue(f.amount)))}</div>
                <div className="mt-0.5 truncate text-sm text-muted-foreground">
                  {String(effectiveValue(f.bankName) ?? "—")} · {String(effectiveValue(f.fdrNumber) ?? "—")}
                </div>

                {days !== null && (
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between text-xs">
                      <span className="text-muted-foreground">{fmtDate(iss)}</span>
                      <span className={cn("font-medium", days <= 0 ? "text-orange-800" : days <= 90 ? "text-amber-800" : "text-muted-foreground")}>
                        {days <= 0 ? `Matured ${-days} days ago` : `Matures in ${days} days`}
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${Math.round(elapsed)}% of term elapsed`}>
                      <div className={cn("h-full rounded-full", days <= 0 ? "bg-orange-500" : days <= 90 ? "bg-amber-500" : "bg-primary/70")} style={{ width: `${elapsed}%` }} />
                    </div>
                    <div className="mt-1 text-right text-[11px] text-muted-foreground">{fmtDate(mat)}</div>
                  </div>
                )}

                {(c || high.length > 0) && (
                  <div className="mt-3 space-y-1.5">
                    {c && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">{humanize(c.type)}:</span> <CaseStatusBadge status={c.status} />
                      </div>
                    )}
                    {high.length > 0 && (
                      <p className="flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-800">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {high[0].message}
                      </p>
                    )}
                  </div>
                )}

                <div className="mt-auto pt-4">
                  <ProvenanceBar fields={f} type={i.type} />
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {history.length > 0 && (
        <Section title="History" className="mt-8" bodyClassName="p-0">
          <ul className="divide-y text-sm">
            {history.map((i) => (
              <li key={i.id}>
                <Link href={`/institution/instruments/${i.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-muted/50">
                  <span className="font-mono text-xs font-medium">{i.code}</span>
                  <span className="text-muted-foreground">{formatINR(String(effectiveValue(tierFieldsOf(i).amount)))}</span>
                  <InstrumentStatusBadge status={i.status} />
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </>
  );
}
