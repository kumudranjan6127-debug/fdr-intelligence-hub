import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, ExternalLink, FileText, RefreshCw } from "lucide-react";
import { AppShell, PageHeader } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaseStatusBadge, InstrumentStatusBadge, MockLabel, RiskBadge, SeverityBadge } from "@/components/badges";
import { ChainTimeline } from "@/components/chain-timeline";
import { EventLog } from "@/components/event-log";
import { ProvenanceTable } from "@/components/provenance-table";
import { WhyPendingBox } from "@/components/why-pending";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { addDocumentAction, applyReleaseAction, caseAction, fetchAAAction } from "@/app/actions";
import { daysBetween, fmtDate, fmtDateTime, formatINR, humanize, shortHash } from "@/lib/format";
import { bestEvidence, effectiveValue, normalize } from "@/lib/provenance";
import { requirePageUser } from "@/lib/session";
import { canView, loadInstrument } from "@/lib/views";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "FDR Passport" };

export default async function PassportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requirePageUser();
  const v = await loadInstrument(id);
  if (!v || !canView(user, v.ins)) notFound();
  const { ins, fields, chain, openCases, why } = v;
  const now = new Date();
  const mat = normalize("maturityDate", bestEvidence(fields.maturityDate).value);
  const days = mat ? daysBetween(now, mat) : null;
  const isInstitution = user.role === "INSTITUTION";
  const isOfficer = ["RO", "BUREAU", "ADMIN", "CELL", "AUTHORITY"].includes(user.role);
  const holding = ["ACTIVE", "EXPIRING", "MATURED"].includes(ins.status);
  const hasLiveSuccessor = ins.successors.some((s) => !["REJECTED", "DRAFT"].includes(s.status));
  const openRelease = openCases.some((c) => c.type === "RELEASE");
  const openDisc = ins.discrepancies.filter((d) => !d.resolvedAt);
  const resolvedDisc = ins.discrepancies.filter((d) => d.resolvedAt);

  return (
    <AppShell user={user}>
      <PageHeader
        title={`FDR Passport · ${ins.code}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <InstrumentStatusBadge status={ins.status} />
            <span>{ins.type === "FDR" ? "Fixed Deposit Receipt (lien to AICTE)" : "Online deposit to AICTE account"}</span>
            <span>{ins.institution.name}</span>
            {!isInstitution && <RiskBadge score={ins.institution.riskScore} />}
          </span>
        }
        actions={
          <>
            {openCases.map((c) =>
              isOfficer || user.role === "BANK" ? (
                <Link key={c.id} href={`/officer/cases/${c.id}`} className={buttonVariants({ variant: "default" })}>
                  Open case {c.code}
                </Link>
              ) : null,
            )}
            {isInstitution && holding && !hasLiveSuccessor && !openRelease && (
              <Link href={`/institution/submit?predecessor=${ins.id}`} className={buttonVariants({ variant: "outline" })}>
                <RefreshCw aria-hidden /> Submit renewal / replacement
              </Link>
            )}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          {why.map(({ case: c, why: w }) => (
            <div key={c.id} className="space-y-2">
              <WhyPendingBox w={w} title={`Why is ${c.code} (${humanize(c.type)}) pending?`} />
              {isInstitution && ["CLARIFICATION_REQUIRED", "RETURNED"].includes(c.status) && (
                <ActionForm action={caseAction} hidden={{ caseId: c.id, action: "RESPOND" }} className="rounded-xl border bg-card p-4">
                  <label htmlFor={`resp-${c.id}`} className="text-sm font-medium">
                    Respond to the officer
                  </label>
                  <textarea id={`resp-${c.id}`} name="reason" rows={2} required className="w-full rounded-lg border bg-transparent px-2 py-1 text-sm" placeholder="Explain what you corrected or uploaded" />
                  <SubmitButton>Send response</SubmitButton>
                </ActionForm>
              )}
            </div>
          ))}
          {why.length === 0 && holding && days !== null && days <= 90 && !hasLiveSuccessor && (
            <WhyPendingBox
              title="What this deposit needs next"
              w={{
                open: true,
                blockingStep: days <= 0 ? "Matured without renewal or release" : "Approaching maturity",
                owner: "Institution",
                ownerRole: "INSTITUTION",
                daysPending: Math.max(0, -days),
                slaBreached: days <= 0,
                nextAction: days <= 0 ? "Renew with a fresh lien in favour of AICTE, or apply for release if the 10-year term is complete" : `Renew before ${fmtDate(mat)} with a fresh lien in favour of AICTE`,
                evidence: [`Maturity ${fmtDate(mat)}`],
              }}
            />
          )}

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Who vouched for each field</h2>
              {isOfficer && ins.bankId && (
                <ActionForm action={fetchAAAction} hidden={{ instrumentId: ins.id }} className="flex flex-col items-end">
                  <div className="flex items-center gap-2">
                    <MockLabel>Mock AA sandbox</MockLabel>
                    <SubmitButton variant="outline">Fetch bank confirmation</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </div>
            <ProvenanceTable fields={fields} type={ins.type} />
            <p className="mt-2 text-xs text-muted-foreground">
              Required deposit {formatINR(ins.requiredAmount.toFixed(0))} (rules {v.rulesVersion}). Extracted values are never auto-accepted; they are evidence for the officer.
            </p>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Discrepancies</h2>
            {openDisc.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-800">
                <CheckCircle2 className="size-4" aria-hidden /> No open discrepancies.
              </p>
            ) : (
              <ul className="space-y-2">
                {openDisc.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <SeverityBadge severity={d.severity} />
                    <span className="flex-1">{d.message}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">{d.code}</span>
                  </li>
                ))}
              </ul>
            )}
            {resolvedDisc.length > 0 && (
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-xs text-muted-foreground">{resolvedDisc.length} resolved</summary>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {resolvedDisc.map((d) => (
                    <li key={d.id}>
                      ✓ {d.message} — resolved {fmtDate(d.resolvedAt)}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Renewal chain</h2>
            <div className="rounded-xl border bg-card p-4">
              <ChainTimeline analysis={chain} focusId={ins.id} today={now} />
            </div>
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Audit trail</h2>
            <div className="rounded-xl border bg-card p-4">
              <EventLog events={ins.events} />
            </div>
          </section>
        </div>

        <aside className="space-y-4">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Key facts</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                <dt className="text-muted-foreground">Principal</dt>
                <dd className="font-medium">{formatINR(String(effectiveValue(fields.amount)))}</dd>
                <dt className="text-muted-foreground">Maturity</dt>
                <dd>
                  {fmtDate(mat)}
                  {days !== null && <span className={cn("ml-1 text-xs", days <= 90 ? "text-amber-800" : "text-muted-foreground")}>({days <= 0 ? `${-days}d ago` : `in ${days}d`})</span>}
                </dd>
                <dt className="text-muted-foreground">Submitted</dt>
                <dd>{fmtDate(ins.submittedAt)}</dd>
                <dt className="text-muted-foreground">Affidavit due</dt>
                <dd>{fmtDate(ins.affidavitDueAt)}</dd>
                {ins.predecessorId && (
                  <>
                    <dt className="text-muted-foreground">Supersedes</dt>
                    <dd>
                      <Link className="font-mono text-xs hover:underline" href={`/institution/instruments/${ins.predecessorId}`}>
                        {chain.nodes.find((n) => n.id === ins.predecessorId)?.code ?? "predecessor"}
                      </Link>
                    </dd>
                  </>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Documents</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2.5 text-sm">
                {ins.documents.map((d) => {
                  const a = v.anchored.get(d.id);
                  return (
                    <li key={d.id}>
                      <a href={d.url} target="_blank" className="flex items-center gap-1.5 font-medium hover:underline">
                        <FileText className="size-3.5" aria-hidden /> {humanize(d.kind)} <ExternalLink className="size-3 text-muted-foreground" aria-hidden />
                      </a>
                      <div className="text-xs text-muted-foreground">
                        v{d.version} · {d.filename} · {fmtDate(d.createdAt)} · {d.uploadedBy.name}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground" title={d.sha256}>
                        SHA-256 {shortHash(d.sha256, 16)} {a && a.sha256 === d.sha256 ? "· anchored (DB)" : "· not anchored"}
                      </div>
                    </li>
                  );
                })}
                {ins.documents.length === 0 && <li className="text-muted-foreground">No documents on file.</li>}
              </ul>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {ins.cases.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-2">
                    {isInstitution ? <span className="font-mono text-xs">{c.code}</span> : <Link href={`/officer/cases/${c.id}`} className="font-mono text-xs hover:underline">{c.code}</Link>}
                    <span className="text-xs text-muted-foreground">{humanize(c.type)}</span>
                    <CaseStatusBadge status={c.status} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {ins.nocs.length > 0 && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Lien-release NOCs</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {ins.nocs.map((n) => (
                    <li key={n.id}>
                      <Link href={`/noc/${n.code}`} className="font-mono text-xs hover:underline">
                        {n.code}
                      </Link>{" "}
                      <span className={cn("text-xs", n.revokedAt ? "text-red-700" : "text-emerald-800")}>{n.revokedAt ? "revoked" : "valid"}</span>
                      <div className="text-xs text-muted-foreground">
                        {fmtDateTime(n.issuedAt)} · <Link href={`/verify/${n.code}`} className="hover:underline">verify</Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {isInstitution && !["RELEASED", "CLOSED", "REJECTED"].includes(ins.status) && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Add a document</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={addDocumentAction} hidden={{ instrumentId: ins.id }} className="space-y-2 text-sm">
                  <select name="kind" className="h-8 w-full rounded-lg border bg-transparent px-2 text-sm" aria-label="Document type" defaultValue={ins.documents.some((d) => d.kind === "AFFIDAVIT_3") ? "FDR_COPY" : "AFFIDAVIT_3"}>
                    <option value="AFFIDAVIT_3">Affidavit-3</option>
                    <option value="FDR_COPY">FDR copy (new version — re-extracted)</option>
                    <option value="LOA_EOA">LoA / EoA</option>
                    <option value="OTHER">Other</option>
                  </select>
                  <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" className="block w-full text-xs" />
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="useSpecimen" /> No file? Generate a specimen Affidavit-3 (demo)
                  </label>
                  <SubmitButton variant="outline">Upload</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}

          {isInstitution && holding && !openRelease && (
            <Card size="sm">
              <CardHeader>
                <CardTitle>Apply for release (APH §6.46)</CardTitle>
              </CardHeader>
              <CardContent>
                <ActionForm action={applyReleaseAction} hidden={{ instrumentId: ins.id }} className="space-y-3 text-sm">
                  <p className="text-xs text-muted-foreground">Only principal returns to the Trust; interest belongs to AICTE. Penalties of 10% / 50% may apply.</p>
                  <label className="block">
                    <span className="text-xs font-medium">Affidavit-6</span>
                    <input type="file" name="affidavit6" accept="application/pdf" className="mt-1 block w-full text-xs" />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium">Latest LoA / EoA</span>
                    <input type="file" name="loaEoa" accept="application/pdf" className="mt-1 block w-full text-xs" />
                  </label>
                  <label className="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="useSpecimen" defaultChecked /> Attach generated specimen documents for any left empty (demo)
                  </label>
                  <textarea name="note" rows={2} placeholder="Request letter / note" className="w-full rounded-lg border bg-transparent px-2 py-1 text-sm" />
                  <SubmitButton variant="outline">Submit release application</SubmitButton>
                </ActionForm>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
