import Link from "next/link";
import { Bell, Plus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { CaseStatusBadge, InstrumentStatusBadge, RiskBadge, SeverityBadge } from "@/components/badges";
import { ProvenanceSummary } from "@/components/provenance-table";
import { buttonVariants } from "@/components/ui/button";
import { db } from "@/lib/db";
import { daysBetween, fmtDate, fmtDateTime, formatINR, formatLakh } from "@/lib/format";
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

  return (
    <AppShell user={user}>
      <PageHeader
        title={inst.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>Permanent ID {inst.permanentId}</span>
            <span>{inst.regionalOffice}</span>
            <span>{inst.isLeased ? "Leased premises (deposit doubled)" : "Own premises"}</span>
            <RiskBadge score={inst.riskScore} />
          </span>
        }
        actions={
          <Link href="/institution/submit" className={buttonVariants()}>
            <Plus aria-hidden /> Submit new instrument
          </Link>
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Deposits in force" value={String(live.length)} />
        <Stat label="Principal held with AICTE" value={formatLakh(held)} hint="Interest accrues to AICTE (APH §1.12)" />
        <Stat label="Open cases" value={String(live.reduce((s, i) => s + i.cases.length, 0))} />
      </div>

      {reminders.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-300 bg-amber-50/60 p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Bell className="size-4" aria-hidden /> Reminders
          </h2>
          <ul className="space-y-1.5 text-sm">
            {reminders.slice(0, 6).map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline gap-x-2">
                <Link href={`/institution/instruments/${r.instrumentId}`} className="font-mono text-xs hover:underline">
                  {r.code}
                </Link>
                <span>{r.message}</span>
                <span className="text-xs text-muted-foreground">{fmtDateTime(r.sentAt ?? r.createdAt)} · in-app</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {live.map((i) => {
          const f = tierFieldsOf(i);
          const mat = normalize("maturityDate", bestEvidence(f.maturityDate).value);
          const days = mat ? daysBetween(now, mat) : null;
          const c = i.cases[0];
          const high = i.discrepancies.filter((d) => d.severity === "HIGH");
          return (
            <Link key={i.id} href={`/institution/instruments/${i.id}`} className="group rounded-xl border bg-card p-4 shadow-xs transition hover:border-primary/40 hover:shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-muted-foreground">
                    {i.code} · {i.type === "FDR" ? "Fixed Deposit Receipt" : "Online deposit"}
                  </div>
                  <div className="mt-0.5 text-lg font-semibold">{formatINR(String(effectiveValue(f.amount)))}</div>
                  <div className="text-sm text-muted-foreground">
                    {String(effectiveValue(f.bankName) ?? "—")} · {String(effectiveValue(f.fdrNumber) ?? "—")}
                  </div>
                </div>
                <InstrumentStatusBadge status={i.status} />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                {days !== null && (
                  <span className={cn("rounded-md px-2 py-0.5 text-xs font-medium", days <= 0 ? "bg-orange-100 text-orange-900" : days <= 90 ? "bg-amber-100 text-amber-900" : "bg-muted text-muted-foreground")}>
                    {days <= 0 ? `Matured ${fmtDate(mat)} (${-days} days ago)` : `Matures in ${days} days · ${fmtDate(mat)}`}
                  </span>
                )}
                {c && <CaseStatusBadge status={c.status} />}
                {high.length > 0 && <SeverityBadge severity="HIGH" />}
              </div>
              {high.length > 0 && <p className="mt-2 text-xs text-red-800">{high[0].message}</p>}
              <div className="mt-3 border-t pt-2">
                <ProvenanceSummary fields={f} type={i.type} />
              </div>
            </Link>
          );
        })}
        {live.length === 0 && <p className="text-sm text-muted-foreground">No deposits in force. {inst.isGovernment && "Government institutions are exempt from the deposit (affidavit still required)."}</p>}
      </div>

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold text-muted-foreground">History</h2>
          <ul className="divide-y rounded-xl border bg-card text-sm">
            {history.map((i) => (
              <li key={i.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                <Link href={`/institution/instruments/${i.id}`} className="font-mono text-xs hover:underline">
                  {i.code}
                </Link>
                <span className="text-muted-foreground">{formatINR(String(effectiveValue(tierFieldsOf(i).amount)))}</span>
                <InstrumentStatusBadge status={i.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}
