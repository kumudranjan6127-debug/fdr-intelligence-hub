import Link from "next/link";
import { notFound } from "next/navigation";
import type { Cell } from "@prisma/client";
import { CheckCircle2, CircleDashed, ExternalLink, XCircle } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CaseStatusBadge, InstrumentStatusBadge, MockLabel, RiskBadge, SeverityBadge } from "@/components/badges";
import { EventLog } from "@/components/event-log";
import { ProvenanceTable } from "@/components/provenance-table";
import { WhyPendingBox } from "@/components/why-pending";
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
const DANGER: CaseAction[] = ["REJECT"];
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
  const open = OPEN_CASE_STATUSES.includes(c.status);
  const selected = docs.find((d) => d.id === docParam) ?? docs.filter((d) => d.kind === "FDR_COPY").at(-1) ?? docs[0];
  const isRelease = c.type === "RELEASE";
  const preview = isRelease ? penaltyPreview(c, rules) : null;
  const recordedPenalty = c.penaltyPct !== null;
  const events = [...c.events, ...instrumentEvents].sort((a, b) => b.seq - a.seq);

  return (
    <AppShell user={user}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xs text-muted-foreground">
            <Link href="/officer" className="hover:underline">
              Queue
            </Link>{" "}
            / {c.code}
          </div>
          <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
            {humanize(c.type)} · {ins.institution.name}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <CaseStatusBadge status={c.status} />
            <InstrumentStatusBadge status={ins.status} />
            <RiskBadge score={ins.institution.riskScore} />
            <Link href={`/institution/instruments/${ins.id}`} className="font-mono text-xs hover:underline">
              FDR Passport {ins.code} →
            </Link>
            <span>Opened {fmtDate(c.openedAt)}</span>
          </div>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* left: document viewer */}
        <section className="xl:sticky xl:top-16 xl:self-start" aria-label="Document viewer">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {docs.map((d) => (
              <Link
                key={d.id}
                href={`/officer/cases/${c.id}?doc=${d.id}`}
                scroll={false}
                className={cn("rounded-md border px-2 py-1 text-xs", selected?.id === d.id ? "border-primary bg-primary/10 font-medium text-primary" : "bg-card hover:bg-muted")}
              >
                {humanize(d.kind)} v{d.version}
              </Link>
            ))}
          </div>
          {selected ? (
            <>
              <iframe src={`${selected.url}#view=FitH`} title={`${humanize(selected.kind)} — ${selected.filename}`} className="h-[72vh] w-full rounded-xl border bg-white" />
              <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono" title={selected.sha256}>
                  SHA-256 {shortHash(selected.sha256, 24)} · anchored (DB)
                </span>
                <a href={selected.url} target="_blank" className="inline-flex items-center gap-1 hover:underline">
                  Open <ExternalLink className="size-3" aria-hidden />
                </a>
              </div>
            </>
          ) : (
            <div className="flex h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">No documents on file — legacy record.</div>
          )}
        </section>

        {/* right: verification */}
        <div className="space-y-5">
          <WhyPendingBox w={w} />

          {open && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Decision</h2>
              {actions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No action available to {humanize(user.role)} at this step{w.owner ? ` — waiting on ${w.owner}` : ""}.</p>
              ) : (
                <div className="space-y-3">
                  {actions
                    .filter((a) => !CASE_ACTIONS[a].reasonRequired)
                    .map((a) => (
                      <ActionForm key={a} action={caseAction} hidden={{ caseId: c.id, action: a }}>
                        <SubmitButton variant={PRIMARY.includes(a) ? "default" : "outline"}>{CASE_ACTIONS[a].label}</SubmitButton>
                        {a === "ISSUE_NOC" && <p className="text-xs text-muted-foreground">Hashes the NOC payload and anchors it; the bank verifies it via QR at /verify.</p>}
                        {a === "ACCEPT" && discrepancies.some((d) => d.severity === "HIGH") && (
                          <p className="text-xs text-red-800">⚠ {discrepancies.filter((d) => d.severity === "HIGH").length} high-severity discrepancy(ies) are open.</p>
                        )}
                      </ActionForm>
                    ))}
                  {actions.filter((a) => CASE_ACTIONS[a].reasonRequired).length > 0 && (
                    <ActionForm action={caseAction} hidden={{ caseId: c.id }} className="space-y-2 border-t pt-3">
                      <label htmlFor="reason" className="text-xs font-medium">
                        Reason (mandatory, sent to the institution and kept in the audit trail)
                      </label>
                      <Textarea id="reason" name="reason" rows={2} required placeholder="e.g. Principal on the FDR copy reads ₹45,00,000; claimed ₹50,00,000. Upload the correct receipt or revise the claim." />
                      <div className="flex flex-wrap gap-2">
                        {actions
                          .filter((a) => CASE_ACTIONS[a].reasonRequired)
                          .map((a) => (
                            <SubmitButton key={a} name="action" value={a} variant={DANGER.includes(a) ? "destructive" : "outline"}>
                              {CASE_ACTIONS[a].label}
                            </SubmitButton>
                          ))}
                      </div>
                    </ActionForm>
                  )}
                </div>
              )}
            </section>
          )}

          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Claimed vs Extracted vs Confirmed</h2>
              {ins.bankId && ["RO", "BUREAU", "ADMIN", "BANK"].includes(user.role) && (
                <ActionForm action={fetchAAAction} hidden={{ instrumentId: ins.id }} className="flex flex-col items-end">
                  <div className="flex items-center gap-2">
                    <MockLabel>Mock AA sandbox</MockLabel>
                    <SubmitButton variant="outline">Fetch bank confirmation</SubmitButton>
                  </div>
                </ActionForm>
              )}
            </div>
            <ProvenanceTable fields={fields} type={ins.type} />
          </section>

          <section>
            <h2 className="mb-2 font-semibold">Discrepancies ({discrepancies.length})</h2>
            {discrepancies.length === 0 ? (
              <p className="flex items-center gap-1.5 text-sm text-emerald-800">
                <CheckCircle2 className="size-4" aria-hidden /> No open discrepancies.
              </p>
            ) : (
              <ul className="space-y-2">
                {discrepancies.map((d) => (
                  <li key={d.id} className="flex flex-wrap items-start gap-2 rounded-lg border bg-card px-3 py-2 text-sm">
                    <SeverityBadge severity={d.severity} />
                    <span className="flex-1">{d.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {isRelease && (
            <section className="space-y-4 rounded-xl border bg-card p-4">
              <h2 className="font-semibold">Release (APH §6.46)</h2>
              {c.clearances.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Cell clearances</h3>
                  <ul className="space-y-2">
                    {c.clearances.map((x) => {
                      const mineToDecide = x.status === "PENDING" && c.status === "CLEARANCES_PENDING" && (user.role === "ADMIN" || (user.role === "CELL" && user.cell === x.cell));
                      return (
                        <li key={x.id} className="rounded-lg border px-3 py-2 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            {x.status === "CLEARED" ? <CheckCircle2 className="size-4 text-emerald-700" aria-hidden /> : x.status === "OBJECTION" ? <XCircle className="size-4 text-red-700" aria-hidden /> : <CircleDashed className="size-4 text-amber-700" aria-hidden />}
                            <span className="font-medium">{CELL_NAME[x.cell]} cell</span>
                            <span className="text-xs text-muted-foreground">
                              {humanize(x.status)}
                              {x.decidedAt ? ` · ${fmtDate(x.decidedAt)} · ${names.get(x.decidedById ?? "") ?? ""}` : ""}
                            </span>
                          </div>
                          {x.note && <p className="mt-1 text-xs text-muted-foreground">“{x.note}”</p>}
                          {mineToDecide && (
                            <ActionForm action={clearanceAction} hidden={{ caseId: c.id, cell: x.cell }} className="mt-2">
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
                  </ul>
                </div>
              )}

              {preview && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{recordedPenalty ? "Penalty assessed" : "Penalty engine preview"}</h3>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                    <dt className="text-muted-foreground">Principal</dt>
                    <dd className="tabular-nums">{formatINR(preview.principal)}</dd>
                    <dt className="text-muted-foreground">Deduction</dt>
                    <dd className="tabular-nums">
                      {recordedPenalty ? Number(c.penaltyPct) : preview.pct}% · {formatINR(recordedPenalty ? c.penaltyAmount!.toFixed(0) : preview.deduction)}
                    </dd>
                    <dt className="text-muted-foreground">Payable to Trust</dt>
                    <dd className="font-semibold tabular-nums">{formatINR(recordedPenalty ? preview.principal - BigInt(c.penaltyAmount!.toFixed(0)) : preview.payable)}</dd>
                    <dt className="text-muted-foreground">Interest</dt>
                    <dd>Retained by AICTE (APH §1.12)</dd>
                    <dt className="text-muted-foreground">Rule</dt>
                    <dd className="text-xs">{recordedPenalty ? c.penaltyRuleRef : preview.ruleRef}</dd>
                  </dl>
                  {!recordedPenalty && (
                    <ul className="mt-1.5 text-xs text-muted-foreground">
                      {preview.reasons.map((r) => (
                        <li key={r}>• {r}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {c.nocs.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">NOC</h3>
                  <ul className="space-y-1 text-sm">
                    {c.nocs.map((n) => (
                      <li key={n.id} className="flex flex-wrap items-center gap-2">
                        <Link href={`/noc/${n.code}`} className="font-mono text-xs text-primary hover:underline">
                          {n.code}
                        </Link>
                        <span className={cn("text-xs", n.revokedAt ? "text-red-700" : "text-emerald-800")}>{n.revokedAt ? "revoked" : "valid"}</span>
                        <span className="text-xs text-muted-foreground">{fmtDateTime(n.issuedAt)}</span>
                        <Link href={`/verify/${n.code}`} className="text-xs hover:underline">
                          verify →
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          <section>
            <h2 className="mb-2 font-semibold">Audit trail</h2>
            <div className="rounded-xl border bg-card p-4">
              <EventLog events={events} />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}
