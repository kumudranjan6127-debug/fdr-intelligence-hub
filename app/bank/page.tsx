import Link from "next/link";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaseStatusBadge } from "@/components/badges";
import { caseAction } from "@/app/actions";
import { db } from "@/lib/db";
import { fmtDateTime, formatINR } from "@/lib/format";
import { requirePageUser } from "@/lib/session";
import type { NocPayload } from "@/lib/services/noc";
import { cn } from "@/lib/utils";

export const metadata = { title: "NOC inbox" };
export const dynamic = "force-dynamic";

export default async function BankInbox() {
  const user = await requirePageUser(["BANK"]);
  const nocs = await db.noc.findMany({
    where: { instrument: { bankId: user.bankId } },
    include: { case: true },
    orderBy: { issuedAt: "desc" },
  });

  return (
    <AppShell user={user}>
      <PageHeader title={`${user.bank?.name ?? "Bank"} · NOC inbox`} subtitle="Lien-release NOCs addressed to deposits held at your bank. Verify each one before lifting a lien." />
      <div className="space-y-3">
        {nocs.map((n) => {
          const p = n.payload as unknown as NocPayload;
          const awaiting = !n.revokedAt && n.case.status === "NOC_ISSUED";
          return (
            <div key={n.id} className={cn("rounded-xl border bg-card p-4", awaiting && "border-primary/40")}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-mono text-sm font-medium">{n.code}</div>
                  <div className="text-sm">
                    FDR {p.instrument.fdrNumber} · {p.institution.name}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Issued {fmtDateTime(n.issuedAt)} by {p.issuer.name} · pay {formatINR(p.payableToTrustPaise)} to the Trust; interest to AICTE
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {n.revokedAt ? <span className="text-xs font-medium text-red-700">Revoked — do not act</span> : <CaseStatusBadge status={n.case.status} />}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                <Link href={`/verify/${n.code}`} className="text-primary hover:underline">
                  Verify →
                </Link>
                <Link href={`/noc/${n.code}`} className="text-primary hover:underline">
                  View letter →
                </Link>
                {awaiting && (
                  <ActionForm action={caseAction} hidden={{ caseId: n.caseId, action: "BANK_CONFIRM" }} className="ml-auto">
                    <SubmitButton>Confirm lien lifted &amp; principal paid</SubmitButton>
                  </ActionForm>
                )}
              </div>
            </div>
          );
        })}
        {nocs.length === 0 && <p className="text-sm text-muted-foreground">No NOCs addressed to your bank.</p>}
      </div>
    </AppShell>
  );
}
