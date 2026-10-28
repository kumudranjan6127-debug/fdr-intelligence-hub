import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, FileText, Plus, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { CaseStatusBadge, InstrumentStatusBadge, RiskBadge } from "@/components/badges";
import { ProvenanceBar } from "@/components/provenance-table";
import { CategoryTiles } from "@/components/dashboard-panels";
import { EmptyState, Section } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db";
import { daysBetween, fmtDate, fmtDateTime, formatINR, formatLakh, humanize } from "@/lib/format";
import { bestEvidence, effectiveValue, normalize, tierFieldsOf } from "@/lib/provenance";
import { protects } from "@/lib/protection";
import { inCategory } from "@/lib/registry";
import { loadRegistry } from "@/lib/services/registry";
import { requirePageUser } from "@/lib/session";
import { OPEN_CASE_STATUSES } from "@/lib/transitions";
import { cn } from "@/lib/utils";

export const metadata = { title: "Institution dashboard" };
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
  const required = live.reduce((s, i) => (BigInt(i.requiredAmount.toFixed(0)) > s ? BigInt(i.requiredAmount.toFixed(0)) : s), 0n);
  const openCases = live.reduce((s, i) => s + i.cases.length, 0);
  const rows = (await loadRegistry(db, now)).rows.filter((r) => r.institutionId === inst.id);
  const covered = rows.filter(protects).reduce((a, r) => a + r.amountPaise, 0n);
  const shortfall = covered >= required ? 0n : required - covered;
  const coverPct = required ? Math.min(100, Number((covered * 100n) / required)) : 100;
  const openDisc = live.reduce((s, i) => s + i.discrepancies.length, 0);

  type Action = { key: string; kind: string; text: string; href: string; cta: string; Icon: typeof Bell; tone: string; rank: number };
  const actions: Action[] = [];
  for (const i of live) {
    const r = rows.find((x) => x.id === i.id);
    if (i.cases[0]?.status === "CLARIFICATION_REQUIRED")
      actions.push({ key: `c-${i.id}`, kind: "Clarification requested", text: `AICTE asked about ${i.code}. Reply on the deposit page.`, href: `/institution/instruments/${i.id}`, cta: "Respond", Icon: AlertTriangle, tone: "bg-red-50 text-red-700", rank: 0 });
    if (r && inCategory(r, "matured"))
      actions.push({ key: `m-${i.id}`, kind: "Renewal overdue", text: `${i.code} matured ${-(r.daysToMaturity ?? 0)} days ago. Renew it or apply for release.`, href: `/institution/submit?predecessor=${i.id}`, cta: "Renew", Icon: AlertTriangle, tone: "bg-red-50 text-red-700", rank: 1 });
    else if (r && inCategory(r, "expiring"))
      actions.push({ key: `e-${i.id}`, kind: "Renewal due", text: `${i.code} matures in ${r.daysToMaturity} days, on ${fmtDate(r.maturityDate)}.`, href: `/institution/submit?predecessor=${i.id}`, cta: "Renew", Icon: RefreshCw, tone: "bg-amber-50 text-amber-800", rank: 2 });
  }
  actions.sort((a, b) => a.rank - b.rank);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Dashboard" }]}
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

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="card-surface border-t-4 border-t-gov-blue" aria-labelledby="cover-title">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3.5">
            <h2 id="cover-title" className="flex items-center gap-2 font-semibold">
              <ShieldCheck className="size-4 text-primary" aria-hidden />
              Security deposit coverage
            </h2>
            <span className="text-xs text-muted-foreground">Required by AICTE for this institution (APH Table 1.4)</span>
          </header>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-4">
              <div>
                <div className={cn("text-4xl font-bold tabular-nums tracking-tight", coverPct >= 100 ? "text-emerald-700" : coverPct >= 60 ? "text-amber-700" : "text-red-700")}>{coverPct}%</div>
                <div className="text-xs text-muted-foreground">covered</div>
              </div>
              <div className="min-w-48 flex-1">
                <div className="h-3 overflow-hidden rounded-full bg-muted" role="img" aria-label={`${coverPct}% of the required deposit is covered`}>
                  <div className={cn("h-full rounded-full", coverPct >= 100 ? "bg-emerald-600" : coverPct >= 60 ? "bg-amber-500" : "bg-red-600")} style={{ width: `${Math.min(100, coverPct)}%` }} />
                </div>
                <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
                  <span>₹0</span>
                  <span>{formatLakh(required)}</span>
                </div>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Required deposit", formatINR(required), ""],
                ["Covered by valid FDRs", formatINR(covered), "text-emerald-700"],
                ["Shortfall", formatINR(shortfall), shortfall > 0n ? "text-red-700" : "text-emerald-700"],
              ].map(([k, v, cls]) => (
                <div key={k} className="rounded-lg border bg-background px-3 py-2.5">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
                  <dd className={cn("mt-0.5 text-base font-bold tabular-nums sm:text-lg", cls)}>{v}</dd>
                </div>
              ))}
            </dl>
            <p
              className={cn(
                "mt-4 flex items-start gap-2 rounded-lg border px-3.5 py-3 text-sm",
                shortfall === 0n ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-950",
              )}
            >
              {shortfall === 0n ? <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />}
              <span>
                <strong className="font-semibold">{shortfall === 0n ? "Fully covered. " : "Not fully covered. "}</strong>
                {shortfall === 0n
                  ? "Your requirement is met by live deposits that the bank has checked and that carry no open issue."
                  : "Only live deposits that the bank has checked and that carry no open issue count. Renew matured FDRs and answer any clarification to close the gap."}
              </span>
            </p>
            <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <li>{live.length} deposits in force</li>
              <li>
                {openDisc} open discrepanc{openDisc === 1 ? "y" : "ies"}
              </li>
              <li>
                {openCases} open case{openCases === 1 ? "" : "s"}
              </li>
              <li>{inst.isLeased ? "Leased premises (deposit doubled)" : "Own premises"}</li>
              <li>Interest accrues to AICTE</li>
            </ul>
          </div>
        </section>

        <Section title="Action needed" icon={Bell} description="Most urgent first" bodyClassName="p-0">
          {actions.length === 0 ? (
            <EmptyState icon={CheckCircle2} title="Nothing needs your action">
              Reminders appear 90, 30 and 7 days before a deposit matures.
            </EmptyState>
          ) : (
            <ul className="divide-y">
              {actions.map((x) => (
                <li key={x.key} className="flex items-start gap-3 px-5 py-3.5">
                  <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", x.tone)}>
                    <x.Icon className="size-4" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{x.kind}</div>
                    <div className="text-sm font-medium leading-snug">{x.text}</div>
                  </div>
                  <Link href={x.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
                    {x.cta}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mb-3 mt-8 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-lg font-bold tracking-tight text-navy">Your instruments by category</h2>
      </div>
      <CategoryTiles rows={rows} hrefBase={null} />

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

      {reminders.length > 0 && (
        <Section title="Latest reminders" icon={Bell} className="mt-8" description="In-app channel · email and WhatsApp are roadmap P6">
          <ul className="space-y-2.5 text-sm">
            {reminders.slice(0, 5).map((r) => (
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
          <Link href="/notifications" className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
            All notifications →
          </Link>
        </Section>
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
