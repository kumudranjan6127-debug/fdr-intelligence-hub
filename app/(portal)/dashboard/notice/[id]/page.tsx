import { notFound } from "next/navigation";
import { PageHeader } from "@/components/app-shell";
import { db } from "@/lib/db";
import { fmtDate, formatINR } from "@/lib/format";
import { effectiveValue, tierFieldsOf } from "@/lib/provenance";
import { requirePageUser } from "@/lib/session";
import { OFFICER_ROLES } from "@/lib/transitions";

export const metadata = { title: "Notice draft" };
export const dynamic = "force-dynamic";

// U7 — one-click notice to an institution whose deposit has completed its term but was never claimed.
export default async function NoticeDraft({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser(OFFICER_ROLES);
  const ins = await db.instrument.findUnique({ where: { id }, include: { institution: true } });
  if (!ins) notFound();
  const f = tierFieldsOf(ins);
  const today = fmtDate(new Date());
  const text = `No. AICTE/RB/SD/${ins.code}                                                  Date: ${today}

To
The Chairman / Secretary,
Trust / Society running ${ins.institution.name}
(AICTE Permanent ID ${ins.institution.permanentId})

Subject: Security deposit ${ins.code} — holding term complete; application for release not received

Sir / Madam,

AICTE records show that the security deposit furnished by your Trust/Society —
  Instrument: ${ins.type === "FDR" ? "Fixed Deposit Receipt" : "Online deposit"} no. ${String(effectiveValue(f.fdrNumber))}
  Bank: ${String(effectiveValue(f.bankName))}
  Principal: ${formatINR(String(effectiveValue(f.amount)))}
  Matured on: ${fmtDate(String(effectiveValue(f.maturityDate)))}
— has completed the holding term prescribed in the Approval Process Handbook 2024-27 (§1.12), and no
application for its release has been received.

You may apply online for release under APH §6.46 ("Release of Security Deposit") with: the request
letter, Affidavit-6, a copy of the FDR / payment proof, the latest LoA / EoA, and clearances from the
AICTE Finance, Legal and Grievance cells. Only the principal is released to the Trust; interest accrued
on the deposit belongs to AICTE. Deductions under APH §1.12 / §2.16 may apply.

Please apply within 30 days of this notice, or inform this office if the deposit is to be continued.

Yours faithfully,

${user.name}
${user.designation ?? ""}
Regulation Bureau, AICTE`;

  return (
    <>
      <PageHeader title="Notice draft — unclaimed matured deposit" subtitle="Review and edit before sending. Sending by email / post is Phase 6." />
      <textarea defaultValue={text} rows={34} className="w-full card-surface p-4 font-mono text-[13px] leading-relaxed" aria-label="Notice text" />
    </>
  );
}
