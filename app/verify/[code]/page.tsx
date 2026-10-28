import Link from "next/link";
import { CheckCircle2, ShieldAlert, ShieldCheck, XCircle } from "lucide-react";
import { PublicShell } from "@/components/app-shell";
import { MockLabel } from "@/components/badges";
import { CopyChecker } from "@/components/copy-checker";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, formatINR, humanize } from "@/lib/format";
import { currentUser } from "@/lib/session";
import { verifyNoc } from "@/lib/services/noc";
import { bankEvidenceText } from "@/lib/evidence";
import { cn } from "@/lib/utils";

export const metadata = { title: "Verify NOC" };
export const dynamic = "force-dynamic";

// Public page — the QR target on every lien-release NOC (U4). No sign-in needed.
export default async function VerifyNoc({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const [v, user] = await Promise.all([verifyNoc(db, decodeURIComponent(code).trim().toUpperCase()), currentUser()]);

  if (!v.found || !v.noc) {
    return (
      <PublicShell user={user} active="verify">
        <div className="mx-auto max-w-xl rounded-2xl border border-red-300 bg-red-50 p-6 text-center">
          <XCircle className="mx-auto size-8 text-red-700" aria-hidden />
          <h1 className="mt-2 text-lg font-semibold">No NOC with code “{code}”</h1>
          <p className="mt-1 text-sm text-red-900">This code was not issued by the portal. Do not act on the letter — contact the AICTE Regulation Bureau.</p>
          <Link href="/verify" className="mt-4 inline-block text-sm text-primary hover:underline">
            Try another code
          </Link>
        </div>
      </PublicShell>
    );
  }

  const { noc, anchor, recordIntact, documents = [] } = v;
  const p = noc.payload;
  const revoked = !!noc.revokedAt;
  const docsIntact = documents.every((d) => d.intact);
  const verdict = revoked ? "REVOKED" : !recordIntact ? "ALTERED" : !docsIntact ? "DOCS_CHANGED" : "VALID";
  const banner = {
    VALID: { cls: "border-emerald-300 bg-emerald-50 text-emerald-950", Icon: ShieldCheck, title: "Valid NOC", body: "Issued by the portal, not revoked, and the record matches its anchored hash." },
    REVOKED: { cls: "border-red-300 bg-red-50 text-red-950", Icon: XCircle, title: "Revoked NOC — do not act on it", body: `Revoked on ${fmtDateTime(noc.revokedAt)}: ${noc.revokeReason}` },
    ALTERED: { cls: "border-red-300 bg-red-50 text-red-950", Icon: ShieldAlert, title: "Record does not match its anchored hash", body: "The NOC record has changed since it was issued. Do not act on it." },
    DOCS_CHANGED: { cls: "border-red-300 bg-red-50 text-red-950", Icon: ShieldAlert, title: "A supporting document has changed", body: "The stored copy of a document no longer matches the hash anchored at issue." },
  }[verdict];

  return (
    <PublicShell user={user} active="verify">
      <div className="mx-auto max-w-3xl space-y-5">
        <div className={cn("flex items-start gap-3 rounded-2xl border p-5", banner.cls)} role="status">
          <banner.Icon className="mt-0.5 size-7 shrink-0" aria-hidden />
          <div>
            <h1 className="text-lg font-semibold">{banner.title}</h1>
            <p className="text-sm">{banner.body}</p>
            <p className="mt-1 font-mono text-xs">{noc.code}</p>
          </div>
        </div>

        <section className="card-surface p-5">
          <h2 className="mb-3 font-semibold">What the NOC says</h2>
          <dl className="grid gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Issued by</dt>
            <dd>
              {p.issuer.name}, {p.issuer.designation}
            </dd>
            <dt className="text-muted-foreground">Issued on</dt>
            <dd>{fmtDateTime(noc.issuedAt)}</dd>
            <dt className="text-muted-foreground">Addressed to</dt>
            <dd>{p.addressedTo}</dd>
            <dt className="text-muted-foreground">Institution</dt>
            <dd>
              {p.institution.name} ({p.institution.permanentId})
            </dd>
            <dt className="text-muted-foreground">Instrument</dt>
            <dd>
              {p.instrument.type === "FDR" ? "FDR" : "Online deposit"} {p.instrument.fdrNumber} · {p.instrument.bankName}
            </dd>
            <dt className="text-muted-foreground">Principal</dt>
            <dd>{formatINR(p.instrument.principalPaise)}</dd>
            <dt className="text-muted-foreground">Deduction</dt>
            <dd>
              {p.deduction.pct}% ({formatINR(p.deduction.amountPaise)})
            </dd>
            <dt className="text-muted-foreground">Payable to Trust</dt>
            <dd className="font-medium">{formatINR(p.payableToTrustPaise)}</dd>
            <dt className="text-muted-foreground">Bank evidence</dt>
            <dd className={p.bankEvidence?.level === "BANK_CONFIRMED" ? "" : "font-medium text-amber-900"}>{bankEvidenceText(p.bankEvidence)}</dd>
            <dt className="text-muted-foreground">Status</dt>
            <dd className={revoked ? "font-medium text-red-700" : "font-medium text-emerald-800"}>{revoked ? `Revoked ${fmtDate(noc.revokedAt)}` : "Not revoked"}</dd>
          </dl>
        </section>

        <section className="card-surface p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Integrity</h2>
            <MockLabel>Hash anchored (DB) — ledger in Phase 3</MockLabel>
          </div>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              {recordIntact ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" aria-hidden /> : <XCircle className="mt-0.5 size-4 text-red-700" aria-hidden />}
              <div>
                NOC record {recordIntact ? "matches" : "does NOT match"} its anchored hash
                <div className="break-all font-mono text-[11px] text-muted-foreground">
                  anchored {anchor?.sha256 ?? "—"} · {fmtDateTime(anchor?.anchoredAt)} · txRef {anchor?.txRef ?? "none (Phase 3)"}
                </div>
              </div>
            </li>
            {documents.map((d) => (
              <li key={d.kind + d.anchoredSha256} className="flex items-start gap-2">
                {d.intact ? <CheckCircle2 className="mt-0.5 size-4 text-emerald-700" aria-hidden /> : <XCircle className="mt-0.5 size-4 text-red-700" aria-hidden />}
                <div className="min-w-0">
                  {humanize(d.kind)}: stored copy {d.intact ? "matches" : "does NOT match"} the hash anchored at issue
                  {d.fileId && (
                    <a href={`/api/files/${d.fileId}`} className="ml-2 text-xs text-primary hover:underline" download>
                      download anchored copy
                    </a>
                  )}
                  <div className="break-all font-mono text-[11px] text-muted-foreground">{d.anchoredSha256}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <CopyChecker anchored={documents.map((d) => ({ kind: humanize(d.kind), sha256: d.anchoredSha256, fileId: d.fileId }))} />

        <p className="rounded-xl border border-dashed p-4 text-xs leading-relaxed text-muted-foreground">
          <strong>What this page proves:</strong> that this NOC was issued by the portal, whether it has been revoked, and that the record and documents are byte-for-byte unchanged since issue.{" "}
          <strong>What it does not prove:</strong> that the bank actually issued the underlying FDR — that authenticity comes from the bank itself (Account Aggregator / bank portal; Mock AA sandbox in
          this prototype).
        </p>
      </div>
    </PublicShell>
  );
}
