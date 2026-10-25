import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { AppShell } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Textarea } from "@/components/ui/textarea";
import { revokeNocAction } from "@/app/actions";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, formatINR, humanize, shortHash } from "@/lib/format";
import { requestOrigin } from "@/lib/origin";
import { requirePageUser } from "@/lib/session";
import type { NocPayload } from "@/lib/services/noc";
import { canView } from "@/lib/views";

export const metadata = { title: "Lien-release NOC" };
export const dynamic = "force-dynamic";

// The NOC "letter" — a styled HTML page (PDF generation is Phase 7). The QR points at /verify/:code.
export default async function NocLetter({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const user = await requirePageUser();
  const noc = await db.noc.findUnique({ where: { code }, include: { instrument: true } });
  if (!noc || !canView(user, noc.instrument)) notFound();
  const p = noc.payload as unknown as NocPayload;
  const verifyUrl = `${await requestOrigin()}/verify/${noc.code}`;
  const qr = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 168, errorCorrectionLevel: "M" });

  return (
    <AppShell user={user}>
      <div className="mx-auto max-w-3xl space-y-4">
        {noc.revokedAt && (
          <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            <strong>Revoked</strong> on {fmtDateTime(noc.revokedAt)} — {noc.revokeReason}
          </div>
        )}
        <article className="relative rounded-2xl border bg-white p-8 text-[15px] leading-relaxed shadow-sm print:border-0 print:shadow-none">
          <header className="flex items-start justify-between gap-6 border-b pb-4">
            <div>
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">All India Council for Technical Education · Regulation Bureau</div>
              <h1 className="mt-1 text-xl font-semibold">No Objection Certificate — Release of Lien</h1>
              <div className="mt-1 font-mono text-sm">{p.code}</div>
              <div className="text-xs text-muted-foreground">Prototype letter · SIH26265 demo · fictional parties</div>
            </div>
            <figure className="text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qr} alt={`QR code linking to ${verifyUrl}`} width={112} height={112} />
              <figcaption className="mt-1 text-[10px] text-muted-foreground">Scan to verify</figcaption>
            </figure>
          </header>

          <div className="mt-5 space-y-4">
            <p>
              Date: {fmtDate(p.issuedAt)}
              <br />
              To: {p.addressedTo}
            </p>
            <p>
              Subject: Release of lien on {p.instrument.type === "FDR" ? "Fixed Deposit Receipt" : "security deposit"} no. <strong>{p.instrument.fdrNumber}</strong> held in favour of the Member
              Secretary, AICTE — {p.institution.name} (Permanent ID {p.institution.permanentId}).
            </p>
            <p>
              The competent authority has approved the release of the above security deposit under APH 2024-27 §6.46 (case {p.caseCode}). AICTE has no objection to the lien being lifted and the
              deposit being closed as below:
            </p>
            <table className="w-full text-sm">
              <tbody className="[&_td]:border-b [&_td]:py-1.5 [&_th]:border-b [&_th]:py-1.5 [&_th]:pr-4 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground">
                <tr>
                  <th>Principal</th>
                  <td className="tabular-nums">{formatINR(p.instrument.principalPaise)}</td>
                </tr>
                <tr>
                  <th>Deduction</th>
                  <td className="tabular-nums">
                    {p.deduction.pct}% · {formatINR(p.deduction.amountPaise)} {p.deduction.ruleRef ? <span className="text-xs text-muted-foreground">({p.deduction.ruleRef})</span> : null}
                  </td>
                </tr>
                <tr>
                  <th>Payable to the Trust / Society</th>
                  <td className="font-semibold tabular-nums">{formatINR(p.payableToTrustPaise)}</td>
                </tr>
                <tr>
                  <th>Interest</th>
                  <td>{p.interest}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-sm">
              Documents relied on:{" "}
              {p.documents.map((d) => (
                <span key={d.sha256} className="mr-2 inline-block font-mono text-xs">
                  {humanize(d.kind)} #{shortHash(d.sha256, 12)}
                </span>
              ))}
            </p>
            <p className="pt-6">
              {p.issuer.name}
              <br />
              <span className="text-sm text-muted-foreground">
                {p.issuer.designation}, {p.issuer.office}
              </span>
            </p>
          </div>
          <footer className="mt-6 border-t pt-3 text-[11px] text-muted-foreground">
            SHA-256 of this NOC record: <span className="font-mono">{noc.sha256}</span> · anchored (DB) — ledger in Phase 3. Verify at {verifyUrl}. A matching hash proves this record is unchanged since
            issue; it does not by itself prove the underlying FDR is genuine.
          </footer>
        </article>

        <div className="flex flex-wrap gap-3 text-sm">
          <Link href={`/verify/${noc.code}`} className="text-primary hover:underline">
            Open verification page →
          </Link>
          <Link href={`/institution/instruments/${noc.instrumentId}`} className="text-primary hover:underline">
            FDR Passport →
          </Link>
        </div>

        {!noc.revokedAt && ["AUTHORITY", "ADMIN"].includes(user.role) && (
          <ActionForm action={revokeNocAction} hidden={{ code: noc.code }} className="rounded-xl border bg-card p-4">
            <h2 className="text-sm font-semibold">Revoke this NOC</h2>
            <Textarea name="reason" rows={2} required placeholder="Reason (shown on the public verification page)" />
            <SubmitButton variant="destructive">Revoke</SubmitButton>
          </ActionForm>
        )}
      </div>
    </AppShell>
  );
}
