import Link from "next/link";
import { AlertTriangle, CalendarClock, Download, FileCheck2, Info, Landmark, Lock, QrCode, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaseStatusBadge, InstrumentStatusBadge, LienBadge, TrustBadge } from "@/components/badges";
import { EmptyState, Section, StatCard } from "@/components/ui-kit";
import { buttonVariants } from "@/components/ui/button";
import { caseAction } from "@/app/actions";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, formatINR, formatLakh } from "@/lib/format";
import { loadRegistry } from "@/lib/services/registry";
import { requirePageUser } from "@/lib/session";
import type { NocPayload } from "@/lib/services/noc";
import { cn } from "@/lib/utils";
import { appNow } from "@/lib/demo-clock";

export const metadata = { title: "Bank portal" };
export const dynamic = "force-dynamic";

const STEPS = [
  "AICTE issues a lien-release NOC and anchors its SHA-256 at issue.",
  "Scan the QR on the letter or PDF, or open “Verify”: the portal re-hashes the record and shows Valid or Revoked.",
  "Only then lift the lien and pay the principal to the Trust; accrued interest goes to AICTE.",
  "Record it here with “Confirm lien lifted”. The case closes and the audit trail keeps the event.",
];

export default async function BankInbox() {
  const user = await requirePageUser(["BANK"]);
  const now = await appNow();
  const [nocs, { rows }] = await Promise.all([
    db.noc.findMany({ where: { instrument: { bankId: user.bankId } }, include: { case: true }, orderBy: { issuedAt: "desc" } }),
    loadRegistry(db, now),
  ]);
  const ledger = rows.filter((r) => r.bank === user.bank?.name).sort((a, b) => (a.daysToMaturity ?? 1e9) - (b.daysToMaturity ?? 1e9));
  const live = ledger.filter((r) => r.status === "ACTIVE" || r.status === "EXPIRING" || r.status === "MATURED");
  const underLien = live.filter((r) => r.lien === true);
  const awaiting = nocs.filter((n) => !n.revokedAt && n.case.status === "NOC_ISSUED");
  const soon = live.filter((r) => r.daysToMaturity !== null && r.daysToMaturity >= 0 && r.daysToMaturity <= 90);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Bank portal (simulated)" }, { label: "Dashboard" }]}
        title={user.bank?.name ?? "Bank"}
        subtitle="Lien-release NOCs addressed to deposits at your bank, and the deposits you hold with a lien in favour of AICTE."
        actions={
          <Link href="/verify" className={buttonVariants()}>
            <QrCode className="size-4" aria-hidden />
            Verify a NOC
          </Link>
        }
      />

      <p className="mb-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">Simulation of a bank&apos;s view.</strong> This page stands in for the bank&apos;s side so the flow can be shown end to end. The bank and every deposit are
          fictional, and confirmations come from the Mock AA sandbox.
        </span>
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatCard icon={Landmark} label="Deposits on the AICTE portal" value={ledger.length} hint={`${live.length} live or matured`} tone="navy" />
        <StatCard icon={Lock} label="Under lien to AICTE" value={formatLakh(underLien.reduce((a, r) => a + r.amountPaise, 0n))} hint={`${underLien.length} deposits`} tone="green" />
        <StatCard icon={FileCheck2} label="NOCs awaiting your action" value={awaiting.length} hint="Verify, lift the lien, confirm" tone={awaiting.length ? "amber" : "slate"} />
        <StatCard icon={CalendarClock} label="Maturing in 90 days" value={soon.length} hint={formatLakh(soon.reduce((a, r) => a + r.amountPaise, 0n))} tone={soon.length ? "orange" : "slate"} />
      </div>

      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Section title="NOC inbox" icon={FileCheck2} description="Verify each NOC before lifting a lien" bodyClassName="p-0">
          {nocs.length === 0 ? (
            <EmptyState icon={FileCheck2} title="No NOCs addressed to your bank" />
          ) : (
            <ul className="divide-y">
              {nocs.map((n) => {
                const p = n.payload as unknown as NocPayload;
                const wait = !n.revokedAt && n.case.status === "NOC_ISSUED";
                return (
                  <li key={n.id} className={cn("px-5 py-4", wait && "bg-primary/3", n.revokedAt && "bg-red-50/50")}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-mono text-sm font-semibold">{n.code}</div>
                        <div className="text-sm">
                          FDR {p.instrument.fdrNumber} · {p.institution.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Issued {fmtDateTime(n.issuedAt)} by {p.issuer.name} · pay {formatINR(p.payableToTrustPaise)} to the Trust; interest to AICTE
                        </div>
                      </div>
                      {n.revokedAt ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
                          <AlertTriangle className="size-3" aria-hidden />
                          Revoked: do not act
                        </span>
                      ) : (
                        <CaseStatusBadge status={n.case.status} />
                      )}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <Link href={`/verify/${n.code}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        <ShieldCheck className="size-3.5" aria-hidden />
                        Verify
                      </Link>
                      <Link href={`/noc/${n.code}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
                        View letter
                      </Link>
                      <a href={`/api/noc/${n.code}/pdf`} download className={buttonVariants({ variant: "ghost", size: "sm" })}>
                        <Download className="size-3.5" aria-hidden />
                        PDF
                      </a>
                      {wait && (
                        <ActionForm action={caseAction} hidden={{ caseId: n.caseId, action: "BANK_CONFIRM" }} className="ml-auto">
                          <SubmitButton>Confirm lien lifted &amp; principal paid</SubmitButton>
                        </ActionForm>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section title="How to act on a NOC" icon={ShieldCheck} description="Four steps, every time">
          <ol className="space-y-3">
            {STEPS.map((s, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-saffron/15 text-xs font-bold text-saffron-deep ring-1 ring-saffron/40">{i + 1}</span>
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ol>
          <p className="mt-4 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">A matching hash proves the NOC record is unchanged since issue. It does not prove the FDR itself is genuine: that is your bank&apos;s own record.</p>
        </Section>
      </div>

      <Section title="Deposit ledger" icon={Landmark} description="Deposits at your bank that are on the AICTE portal, soonest maturity first" className="mt-6" bodyClassName="p-0">
        {ledger.length === 0 ? (
          <EmptyState icon={Landmark} title="No deposits on record" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-225 text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-semibold">FDR number</th>
                  <th className="px-3 py-2.5 font-semibold">Institution</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                  <th className="px-3 py-2.5 font-semibold">Maturity</th>
                  <th className="px-3 py-2.5 font-semibold">Status</th>
                  <th className="px-3 py-2.5 font-semibold">Check</th>
                  <th className="px-5 py-2.5 font-semibold">Lien</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((r) => (
                  <tr key={r.id} className="border-b last:border-b-0">
                    <td className="px-5 py-2.5">
                      <div className="font-mono text-xs font-semibold">{r.fdrNumber ?? "—"}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">{r.code}</div>
                    </td>
                    <td className="max-w-60 truncate px-3 py-2.5">{r.institution.split(",")[0]}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{formatINR(r.amountPaise)}</td>
                    <td className="px-3 py-2.5">
                      <div className="tabular-nums">{fmtDate(r.maturityDate)}</div>
                      {r.daysToMaturity !== null && ["ACTIVE", "EXPIRING", "MATURED"].includes(r.status) && (
                        <div className={cn("text-[11px]", r.daysToMaturity < 0 ? "text-red-700" : r.daysToMaturity <= 90 ? "text-amber-800" : "text-muted-foreground")}>
                          {r.daysToMaturity < 0 ? `${-r.daysToMaturity} days ago` : `in ${r.daysToMaturity} days`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <InstrumentStatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5">
                      <TrustBadge trust={r.trust} />
                    </td>
                    <td className="px-5 py-2.5">
                      <LienBadge lien={r.lien} confirmed={r.lienConfirmed} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </>
  );
}
