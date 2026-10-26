import Link from "next/link";
import { notFound } from "next/navigation";
import type { Cell } from "@prisma/client";
import { AlertTriangle, CheckCircle2, CircleDashed, ExternalLink, FileText, Gavel, History, Landmark, Scale, ShieldCheck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaseStatusBadge, InstrumentStatusBadge, MockLabel, RiskBadge, SeverityBadge } from "@/components/badges";
import { EventLog } from "@/components/event-log";
import { ProvenanceTable } from "@/components/provenance-table";
import { KeyValues, Section } from "@/components/ui-kit";
import { WhyPendingBox } from "@/components/why-pending";
import { buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { caseAction, clearanceAction, fetchAAAction } from "@/app/actions";
import { db } from "@/lib/db";
import { fmtDate, fmtDateTime, formatINR, humanize, shortHash } from "@/lib/format";
import { tierFieldsOf } from "@/lib/provenance";
import { requirePageUser } from "@/lib/session";
import { getActiveRules } from "@/lib/services/core";
import { CASE_ACTIONS, OFFICER_ROLES, OPEN_CASE_STATUSES, availableActions, type CaseAction } from "@/lib/transitions";
import { caseInclude, canView, penaltyPreview, userNames, whyFor } from "@/lib/views";
import { cn } from "@/lib/utils";

export const metadata = { title: "Case review" };
export const dynamic = "force-dynamic";

const CELL_NAME: Record<Cell, string> = { FINANCE: "Finance", LEGAL: "Legal", GRIEVANCE: "Grievance" };
const PRIMARY: CaseAction[] = ["ACCEPT", "SEND_FOR_CLEARANCES", "APPROVE_RELEASE", "ISSUE_NOC", "BANK_CONFIRM"];

export default async function CaseReview({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ doc?: string }> }) {
  const [{ id }, { doc: docParam }] = await Promise.all([params, searchParams]);
  const user = await requirePageUser([...OFFICER_ROLES, "BANK"]);
  const c = await db.case.findUnique({
    where: { id },
    include: {
      ...caseInclude,
      nocs: { orderBy: { issuedAt: "desc" } },
      events: { include: { actor: { select: { name: true } } }, orderBy: { seq: "desc" } },
    },
  });
  if (!c || !canView(user, c.instrument)) notFound();

  const { rules } = await getActiveRules(db);
  const [docs, discrepancies, instrumentEvents] = await Promise.all([
    db.document.findMany({ where: { instrumentId: c.instrumentId }, orderBy: { createdAt: "asc" } }),
    db.discrepancy.findMany({ where: { instrumentId: c.instrumentId, resolvedAt: null }, orderBy: { severity: "desc" } }),
    db.event.findMany({ where: { instrumentId: c.instrumentId, caseId: null }, include: { actor: { select: { name: true } } }, orderBy: { seq: "desc" }, take: 15 }),
  ]);
  const names = await userNames(c.clearances.map((x) => x.decidedById));
  const w = whyFor(c, rules.caseSlaDays, names);
  const fields = tierFieldsOf(c.instrument);
  const ins = c.instrument;
  const actions = availableActions(c, user.role);
  const plain = actions.filter((a) => !CASE_ACTIONS[a].reasonRequired);
  const withReason = actions.filter((a) => CASE_ACTIONS[a].reasonRequired);
  const open = OPEN_CASE_STATUSES.includes(c.status);
  const selected = docs.find((d) => d.id === docParam) ?? docs.filter((d) => d.kind === "FDR_COPY").at(-1) ?? docs[0];
  const isRelease = c.type === "RELEASE";
  const preview = isRelease ? penaltyPreview(c, rules) : null;
  const recordedPenalty = c.penaltyPct !== null;
  const events = [...c.events, ...instrumentEvents].sort((a, b) => b.seq - a.seq);
  const highCount = discrepancies.filter((d) => d.severity === "HIGH").length;

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Verification queue", href: "/officer" }, { label: c.code }]}
        eyebrow={`${humanize(c.type)} case · ${c.code}`}
        title={ins.institution.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs">Case</span> <CaseStatusBadge status={c.status} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-xs">Deposit</span> <InstrumentStatusBadge status={ins.status} />
            </span>
            <RiskBadge score={ins.institution.riskScore} />
            <span>Opened {fmtDate(c.openedAt)}</span>
            <span aria-hidden>·</span>
            <span>{ins.institution.regionalOffice}</span>
          </span>
        }
        actions={
          <Link href={`/institution/instruments/${ins.id}`} className={buttonVariants({ variant: "outline", size: "lg" })}>
            FDR Passport {ins.code}
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        {/* document viewer */}
        <section className="card-surface overflow-hidden xl:sticky xl:top-6 xl:self-start" aria-label="Document viewer">
          <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2.5">
            <FileText className="mr-1 size-4 text-primary" aria-hidden />
            {docs.map((d) => (
              <Link
                key={d.id}
                href={`/officer/cases/${c.id}?doc=${d.id}`}
                scroll={false}
                className={cn("rounded-md px-2.5 py-1 text-xs font-medium", selected?.id === d.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
              >
                {humanize(d.kind)} <span className="opacity-70">v{d.version}</span>
              </Link>
            ))}
          </div>
          {selected ? (
            <>
              <iframe src={`${selected.url}#view=FitH`} title={`${humanize(selected.kind)}: ${selected.filename}`} className="h-[68vh] w-full bg-white" />
              <div className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-2 text-[11px] text-muted-foreground">
                <span className="font-mono" title={selected.sha256}>
                  SHA-256 {shortHash(selected.sha256, 24)} <span className="font-sans text-emerald-700">· anchored (DB)</span>
                </span>
                <a href={selected.url} target="_blank" className="inline-flex items-center gap-1 font-medium hover:text-foreground">
                  Open in new tab <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            </>
          ) : (
            <div className="flex h-72 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <FileText className="size-6" aria-hidden />
              No documents on file (legacy record)
            </div>
          )}
        </section>

        {/* verification + decision */}
        <div className="min-w-0 space-y-6">
          <WhyPendingBox w={w} />

          {open && (
            <section className="card-surface overflow-hidden border-primary/30">
              <div className="flex items-center gap-2 border-b bg-primary/4 px-5 py-3">
                <Gavel className="size-4 text-primary" aria-hidden />
                <h2 className="text-[15px] font-semibold tracking-tight">Your decision</h2>
                <span className="ml-auto text-xs text-muted-foreground">Acting as {humanize(user.role)}</span>
              </div>
              <div className="space-y-4 p-5">
                {actions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No action available to you at this step. Waiting on {w.owner}.</p>
                ) : (
                  <>
                    {plain.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {plain.map((a) => (
                          <ActionForm key={a} action={caseAction} hidden={{ caseId: c.id, action: a }}>
                            <SubmitButton size="lg" variant={PRIMARY.includes(a) ? "default" : "outline"}>
                              {CASE_ACTIONS[a].label}
                            </SubmitButton>
                          </ActionForm>
                        ))}
                      </div>
                    )}
                    {plain.includes("ACCEPT") && highCount > 0 && (
                      <p className="flex items-center gap-1.5 text-xs font-medium text-red-700">
                        <AlertTriangle className="size-3.5" aria-hidden /> {highCount} high-severity discrepanc{highCount === 1 ? "y is" : "ies are"} still open
                      </p>
                    )}
                    {plain.includes("ISSUE_NOC") && <p className="text-xs text-muted-foreground">The NOC payload is hashed and anchored; the bank verifies it via QR.</p>}
                    {withReason.length > 0 && (
                      <ActionForm action={caseAction} hidden={{ caseId: c.id }} className={cn("space-y-2", plain.length > 0 && "border-t pt-4")}>
                        <label htmlFor="reason" className="text-xs font-medium">
                          Reason <span className="font-normal text-muted-foreground">(mandatory; sent to the institution and kept in the audit trail)</span>
                        </label>
                        <Textarea id="reason" name="reason" rows={3} required placeholder="e.g. Principal on the FDR copy reads ₹45,00,000; claimed ₹50,00,000. Upload the correct receipt or revise the claim." />
                        <div className="flex flex-wrap gap-2">
                          {withReason.map((a) => (
                            <SubmitButton key={a} name="action" value={a} variant={a === "REJECT" ? "destructive" : "outline"}>
                              {CASE_ACTIONS[a].label}
                            </SubmitButton>
                          ))}
                        </div>
                      </ActionForm>
                    )}
                  </>
                )}
              </div>
            </section>
          )}

          <Tabs defaultValue={isRelease ? "release" : "verify"} className="gap-4">
            <TabsList variant="line" className="w-full justify-start gap-4 border-b pb-0">
              <TabsTrigger value="verify" className="flex-none px-1 pb-2.5">
                <ShieldCheck aria-hidden /> Verification
                {discrepancies.length > 0 && <span className="rounded-full bg-red-100 px-1.5 text-[11px] font-semibold text-red-800">{discrepancies.length}</span>}
              </TabsTrigger>
              {isRelease && (
                <TabsTrigger value="release" className="flex-none px-1 pb-2.5">
                  <Scale aria-hidden /> Release &amp; penalty
                </TabsTrigger>
              )}
              <TabsTrigger value="audit" className="flex-none px-1 pb-2.5">
                <History aria-hidden /> Audit trail
              </TabsTrigger>
            </TabsList>

            <TabsContent value="verify" className="space-y-6">
              <Section
                title="Claimed vs Extracted vs Confirmed"
                bodyClassName="p-0"
                action={
                  ins.bankId && ["RO", "BUREAU", "ADMIN", "BANK"].includes(user.role) ? (
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
              <Section title={`Discrepancies (${discrepancies.length})`} icon={AlertTriangle}>
                {discrepancies.length === 0 ? (
                  <p className="flex items-center gap-2 text-sm text-emerald-800">
                    <CheckCircle2 className="size-4" aria-hidden /> No open discrepancies.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {discrepancies.map((d) => (
                      <li key={d.id} className="flex flex-wrap items-start gap-3 rounded-lg border bg-background px-3.5 py-2.5 text-sm">
                        <SeverityBadge severity={d.severity} />
                        <span className="min-w-0 flex-1">{d.message}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>
            </TabsContent>

            {isRelease && (
              <TabsContent value="release" className="space-y-6">
                {c.clearances.length > 0 && (
                  <Section title="Cell clearances" icon={Scale} description="Finance, Legal and Grievance must all clear before the penalty engine runs.">
                    <ol className="space-y-3">
                      {c.clearances.map((x) => {
                        const mineToDecide = x.status === "PENDING" && c.status === "CLEARANCES_PENDING" && (user.role === "ADMIN" || (user.role === "CELL" && user.cell === x.cell));
                        return (
                          <li key={x.id} className={cn("rounded-lg border px-4 py-3", mineToDecide && "border-primary/40 bg-primary/3")}>
                            <div className="flex flex-wrap items-center gap-2.5">
                              {x.status === "CLEARED" ? (
                                <CheckCircle2 className="size-5 text-emerald-600" aria-hidden />
                              ) : x.status === "OBJECTION" ? (
                                <XCircle className="size-5 text-red-600" aria-hidden />
                              ) : (
                                <CircleDashed className="size-5 text-amber-600" aria-hidden />
                              )}
                              <span className="font-medium">{CELL_NAME[x.cell]} cell</span>
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 text-[11px] font-medium",
                                  x.status === "CLEARED" ? "bg-emerald-100 text-emerald-800" : x.status === "OBJECTION" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900",
                                )}
                              >
                                {humanize(x.status)}
                              </span>
                              {x.decidedAt && (
                                <span className="text-xs text-muted-foreground">
                                  {fmtDate(x.decidedAt)} · {names.get(x.decidedById ?? "") ?? ""}
                                </span>
                              )}
                            </div>
                            {x.note && <p className="mt-1.5 pl-7 text-xs text-muted-foreground">“{x.note}”</p>}
                            {mineToDecide && (
                              <ActionForm action={clearanceAction} hidden={{ caseId: c.id, cell: x.cell }} className="mt-3 pl-7">
                                <Textarea name="note" rows={2} placeholder="Note (required for an objection)" />
                                <div className="flex gap-2">
                                  <SubmitButton name="decision" value="CLEARED">
                                    Clear
                                  </SubmitButton>
                                  <SubmitButton name="decision" value="OBJECTION" variant="destructive">
                                    Raise objection
                                  </SubmitButton>
                                </div>
                              </ActionForm>
                            )}
                          </li>
                        );
                      })}
                    </ol>
                  </Section>
                )}

                {preview && (
                  <Section title={recordedPenalty ? "Penalty assessed" : "Penalty engine preview"} icon={Gavel} description="APH rules engine · deductions are not cumulative; the highest applicable one is used">
                    <div className="grid gap-4 sm:grid-cols-3">
                      <div className="rounded-lg bg-muted/50 p-3">
                        <div className="text-xs text-muted-foreground">Principal</div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums">{formatINR(preview.principal)}</div>
                      </div>
                      <div className="rounded-lg bg-red-50 p-3">
                        <div className="text-xs text-red-800">Deduction · {recordedPenalty ? Number(c.penaltyPct) : preview.pct}%</div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums text-red-800">{formatINR(recordedPenalty ? c.penaltyAmount!.toFixed(0) : preview.deduction)}</div>
                      </div>
                      <div className="rounded-lg bg-emerald-50 p-3">
                        <div className="text-xs text-emerald-800">Payable to Trust</div>
                        <div className="mt-0.5 text-lg font-semibold tabular-nums text-emerald-900">
                          {formatINR(recordedPenalty ? preview.principal - BigInt(c.penaltyAmount!.toFixed(0)) : preview.payable)}
                        </div>
                      </div>
                    </div>
                    <KeyValues
                      className="mt-4"
                      items={[
                        ["Rule", <span key="r" className="text-xs font-normal">{recordedPenalty ? c.penaltyRuleRef : preview.ruleRef}</span>],
                        ["Interest", <span key="i" className="font-normal">Retained by AICTE (APH §1.12)</span>],
                        ...(!recordedPenalty ? ([["Why", <span key="w" className="text-xs font-normal">{preview.reasons.join(" · ")}</span>]] as [React.ReactNode, React.ReactNode][]) : []),
                      ]}
                    />
                  </Section>
                )}

                {c.nocs.length > 0 && (
                  <Section title="Lien-release NOC" icon={ShieldCheck} bodyClassName="p-0">
                    <ul className="divide-y text-sm">
                      {c.nocs.map((n) => (
                        <li key={n.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                          <Link href={`/noc/${n.code}`} className="font-mono text-xs font-semibold text-primary hover:underline">
                            {n.code}
                          </Link>
                          <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", n.revokedAt ? "bg-red-100 text-red-800" : "bg-emerald-100 text-emerald-800")}>{n.revokedAt ? "Revoked" : "Valid"}</span>
                          <span className="text-xs text-muted-foreground">{fmtDateTime(n.issuedAt)}</span>
                          <Link href={`/verify/${n.code}`} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "ml-auto")}>
                            Verify
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}
              </TabsContent>
            )}

            <TabsContent value="audit">
              <Section title="Audit trail" icon={History}>
                <EventLog events={events} />
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
}
