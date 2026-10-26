import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CheckCircle2, ExternalLink, FilePlus2, FileText, GitBranch, History, Landmark, RefreshCw, ScrollText, ShieldCheck, Upload } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaseStatusBadge, InstrumentStatusBadge, MockLabel, RiskBadge, SeverityBadge } from "@/components/badges";
import { ChainTimeline } from "@/components/chain-timeline";
import { EventLog } from "@/components/event-log";
import { ProvenanceBar, ProvenanceTable } from "@/components/provenance-table";
import { KeyValues, Section } from "@/components/ui-kit";
import { WhyPendingBox } from "@/components/why-pending";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { addDocumentAction, applyReleaseAction, caseAction, fetchAAAction } from "@/app/actions";
import { daysBetween, fmtDate, fmtDateTime, formatINR, humanize, shortHash } from "@/lib/format";
import { bestEvidence, effectiveValue, normalize } from "@/lib/provenance";
import { requirePageUser } from "@/lib/session";
import { canView, loadInstrument } from "@/lib/views";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "FDR Passport" };

const selectCls = "h-9 w-full rounded-lg border bg-background px-2.5 text-sm";

export default async function PassportPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const { tab } = await searchParams;
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
  const chainIssues = chain.gaps.length + chain.amountDrops.length + chain.lienBreaks.length;

  return (
    <>
      <PageHeader
        crumbs={[isInstitution ? { label: "My deposits", href: "/institution" } : { label: "Verification queue", href: "/officer" }, { label: ins.code }]}
        eyebrow={ins.type === "FDR" ? "Fixed Deposit Receipt · lien to AICTE" : "Online deposit to AICTE account"}
        title={
          <span className="flex flex-wrap items-center gap-3">
            FDR Passport <span className="font-mono text-xl text-muted-foreground">{ins.code}</span>
          </span>
        }
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <InstrumentStatusBadge status={ins.status} />
            <span>{ins.institution.name}</span>
            {!isInstitution && <RiskBadge score={ins.institution.riskScore} />}
          </span>
        }
        actions={
          <>
            {(isOfficer || user.role === "BANK") &&
              openCases.map((c) => (
                <Link key={c.id} href={`/officer/cases/${c.id}`} className={buttonVariants({ size: "lg" })}>
                  Review case {c.code}
                </Link>
              ))}
            {isInstitution && holding && !hasLiveSuccessor && !openRelease && (
              <Link href={`/institution/submit?predecessor=${ins.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
                <RefreshCw aria-hidden /> Renew / replace
              </Link>
            )}
          </>
        }
      />

      {/* summary strip */}
      <div className="card-surface mb-6 grid divide-y sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-4">
        <div className="p-5">
          <div className="text-xs font-medium text-muted-foreground">Principal</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums tracking-tight">{formatINR(String(effectiveValue(fields.amount)))}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Required {formatINR(ins.requiredAmount.toFixed(0))}</div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-muted-foreground">{ins.type === "FDR" ? "Bank · FDR number" : "Bank · transaction ref"}</div>
          <div className="mt-1 truncate font-medium">{String(effectiveValue(fields.bankName) ?? "—")}</div>
          <div className="font-mono text-sm text-muted-foreground">{String(effectiveValue(fields.fdrNumber) ?? "—")}</div>
        </div>
        <div className="p-5">
          <div className="text-xs font-medium text-muted-foreground">Maturity</div>
          <div className="mt-1 font-medium">{fmtDate(mat)}</div>
          {days !== null && (
            <div className={cn("text-sm font-medium", days <= 0 ? "text-orange-700" : days <= 90 ? "text-amber-700" : "text-muted-foreground")}>
              {days <= 0 ? `Matured ${-days} days ago` : `in ${days} days`}
            </div>
          )}
        </div>
        <div className="p-5">
          <div className="mb-2 text-xs font-medium text-muted-foreground">Who vouched for it</div>
          <ProvenanceBar fields={fields} type={ins.type} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {why.map(({ case: c, why: w }) => (
            <div key={c.id} className="space-y-3">
              <WhyPendingBox w={w} title={`Why is ${c.code} (${humanize(c.type).toLowerCase()}) pending?`} />
              {isInstitution && ["CLARIFICATION_REQUIRED", "RETURNED"].includes(c.status) && (
                <Section title="Respond to the officer" icon={ScrollText}>
                  <ActionForm action={caseAction} hidden={{ caseId: c.id, action: "RESPOND" }}>
                    <Textarea name="reason" rows={3} required placeholder="Explain what you corrected or uploaded (upload documents from the panel on the right first)" />
                    <SubmitButton>Send response</SubmitButton>
                  </ActionForm>
                </Section>
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

          <Tabs defaultValue={["verify", "chain", "docs", "audit"].includes(tab ?? "") ? tab : openDisc.length === 0 && chainIssues > 0 ? "chain" : "verify"} className="gap-4">
            <TabsList variant="line" className="w-full justify-start gap-4 border-b pb-0">
              <TabsTrigger value="verify" className="flex-none px-1 pb-2.5">
                <ShieldCheck aria-hidden /> Verification
                {openDisc.length > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-800">{openDisc.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="chain" className="flex-none px-1 pb-2.5">
                <GitBranch aria-hidden /> Renewal chain
                {chainIssues > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-800">{chainIssues}</span>}
              </TabsTrigger>
              <TabsTrigger value="docs" className="flex-none px-1 pb-2.5">
                <FileText aria-hidden /> Documents <span className="text-[11px] text-muted-foreground">{ins.documents.length}</span>
              </TabsTrigger>
              <TabsTrigger value="audit" className="flex-none px-1 pb-2.5">
                <History aria-hidden /> Audit trail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="verify" className="space-y-6">
              <Section
                title="Claimed vs Extracted vs Confirmed"
                description="Extracted values are evidence for the officer and are never auto-accepted."
                bodyClassName="p-0"
                action={
                  isOfficer && ins.bankId ? (
                    <ActionForm action={fetchAAAction} hidden={{ instrumentId: ins.id }} className="flex items-center gap-2 space-y-0">
                      <MockLabel>Mock AA sandbox</MockLabel>
                      <SubmitButton variant="outline" size="sm">
                        <Landmark aria-hidden /> Fetch bank confirmation
                      </SubmitButton>
                    </ActionForm>
                  ) : undefined
                }
              >
                <ProvenanceTable fields={fields} type={ins.type} />
              </Section>

              <Section title="Discrepancies" icon={AlertTriangle} description={`Rules ${v.rulesVersion} · checks run on the most independent evidence available`}>
                {openDisc.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-800">
                    <CheckCircle2 className="size-4" aria-hidden /> No open discrepancies.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {openDisc.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-start gap-3 rounded-lg border bg-background px-3.5 py-2.5 text-sm">
                        <SeverityBadge severity={d.severity} />
                        <span className="min-w-0 flex-1">{d.message}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">{d.code}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {resolvedDisc.length > 0 && (
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">{resolvedDisc.length} resolved</summary>
                    <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                      {resolvedDisc.map((d) => (
                        <li key={d.id}>
                          ✓ {d.message} · resolved {fmtDate(d.resolvedAt)}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </Section>
            </TabsContent>

            <TabsContent value="chain">
              <Section title="Renewal chain X-ray" icon={GitBranch} description="Every renewal, replacement and top-up linked; checked for gaps in cover, amount drops and missing liens.">
                <ChainTimeline analysis={chain} focusId={ins.id} today={now} />
              </Section>
            </TabsContent>

            <TabsContent value="docs">
              <Section title="Documents" icon={FileText} description="Every file is hashed (SHA-256) on upload and the hash is anchored." bodyClassName="p-0">
                <ul className="divide-y">
                  {ins.documents.map((d) => {
                    const a = v.anchored.get(d.id);
                    return (
                      <li key={d.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-red-50 text-[10px] font-bold text-red-700">PDF</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{humanize(d.kind)}</span>
                            <span className="rounded bg-muted px-1.5 text-[11px] text-muted-foreground">v{d.version}</span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {d.filename} · {fmtDate(d.createdAt)} · {d.uploadedBy.name}
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground" title={d.sha256}>
                            SHA-256 {shortHash(d.sha256, 20)}{" "}
                            {a && a.sha256 === d.sha256 ? <span className="font-sans text-emerald-700">· anchored (DB)</span> : <span className="font-sans text-red-700">· not anchored</span>}
                          </div>
                        </div>
                        <a href={d.url} target="_blank" className={buttonVariants({ variant: "outline", size: "sm" })}>
                          Open <ExternalLink aria-hidden />
                        </a>
                      </li>
                    );
                  })}
                  {ins.documents.length === 0 && <li className="px-5 py-6 text-sm text-muted-foreground">No documents on file (legacy record).</li>}
                </ul>
              </Section>
            </TabsContent>

            <TabsContent value="audit">
              <Section title="Audit trail" icon={History} description="Append-only; each event's hash covers the previous one.">
                <EventLog events={ins.events} />
              </Section>
            </TabsContent>
          </Tabs>
        </div>

        <aside className="space-y-4">
          <Section title="Key facts">
            <KeyValues
              items={[
                ["Submitted", fmtDate(ins.submittedAt)],
                ["Affidavit due", fmtDate(ins.affidavitDueAt)],
                ["Regional office", ins.institution.regionalOffice],
                ...(ins.predecessorId
                  ? ([
                      [
                        "Supersedes",
                        <Link key="p" className="font-mono text-xs text-primary hover:underline" href={`/institution/instruments/${ins.predecessorId}`}>
                          {chain.nodes.find((n) => n.id === ins.predecessorId)?.code ?? "predecessor"}
                        </Link>,
                      ],
                    ] as [React.ReactNode, React.ReactNode][])
                  : []),
              ]}
            />
          </Section>

          <Section title="Cases" bodyClassName="p-0">
            <ul className="divide-y text-sm">
              {ins.cases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    {isInstitution ? (
                      <span className="font-mono text-xs font-medium">{c.code}</span>
                    ) : (
                      <Link href={`/officer/cases/${c.id}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {c.code}
                      </Link>
                    )}
                    <div className="text-xs text-muted-foreground">{humanize(c.type)}</div>
                  </div>
                  <CaseStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          </Section>

          {ins.nocs.length > 0 && (
            <Section title="Lien-release NOCs" icon={ShieldCheck} bodyClassName="p-0">
              <ul className="divide-y text-sm">
                {ins.nocs.map((n) => (
                  <li key={n.id} className="px-5 py-3">
                    <div className="flex items-center justify-between gap-2">
                      <Link href={`/noc/${n.code}`} className="font-mono text-xs font-medium text-primary hover:underline">
                        {n.code}
                      </Link>
                      <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", n.revokedAt ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800")}>{n.revokedAt ? "Revoked" : "Valid"}</span>
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmtDateTime(n.issuedAt)} ·{" "}
                      <Link href={`/verify/${n.code}`} className="hover:underline">
                        verify
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          )}

          {isInstitution && !["RELEASED", "CLOSED", "REJECTED"].includes(ins.status) && (
            <Section title="Add a document" icon={Upload}>
              <ActionForm action={addDocumentAction} hidden={{ instrumentId: ins.id }} className="space-y-3 text-sm">
                <select name="kind" className={selectCls} aria-label="Document type" defaultValue={ins.documents.some((d) => d.kind === "AFFIDAVIT_3") ? "FDR_COPY" : "AFFIDAVIT_3"}>
                  <option value="AFFIDAVIT_3">Affidavit-3</option>
                  <option value="FDR_COPY">FDR copy (new version, re-extracted)</option>
                  <option value="LOA_EOA">LoA / EoA</option>
                  <option value="OTHER">Other</option>
                </select>
                <input type="file" name="file" accept="application/pdf,image/png,image/jpeg" className="block w-full text-xs file:mr-2 file:rounded-md file:border file:bg-muted file:px-2 file:py-1 file:text-xs" />
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name="useSpecimen" /> No file? Generate a specimen Affidavit-3 (demo)
                </label>
                <SubmitButton variant="outline" className="w-full">
                  Upload &amp; anchor
                </SubmitButton>
              </ActionForm>
            </Section>
          )}

          {isInstitution && holding && !openRelease && (
            <Section title="Apply for release" icon={FilePlus2} description="APH 2024-27 §6.46 · only the principal returns to the Trust; interest belongs to AICTE">
              <ActionForm action={applyReleaseAction} hidden={{ instrumentId: ins.id }} className="space-y-3 text-sm">
                <label className="block">
                  <span className="text-xs font-medium">Affidavit-6</span>
                  <input type="file" name="affidavit6" accept="application/pdf" className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border file:bg-muted file:px-2 file:py-1 file:text-xs" />
                </label>
                <label className="block">
                  <span className="text-xs font-medium">Latest LoA / EoA</span>
                  <input type="file" name="loaEoa" accept="application/pdf" className="mt-1 block w-full text-xs file:mr-2 file:rounded-md file:border file:bg-muted file:px-2 file:py-1 file:text-xs" />
                </label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <input type="checkbox" name="useSpecimen" defaultChecked /> Attach generated specimens for any left empty (demo)
                </label>
                <Textarea name="note" rows={2} placeholder="Request letter / note" />
                <p className="text-xs text-muted-foreground">Deductions of 10% or 50% may apply (APH §1.12 / §2.16).</p>
                <SubmitButton className="w-full">Submit release application</SubmitButton>
              </ActionForm>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
