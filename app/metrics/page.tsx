import Link from "next/link";
import { BadgeCheck, Clock, FileSearch, ScanSearch, ShieldCheck, Workflow } from "lucide-react";
import { PageHeader, PublicShell } from "@/components/app-shell";
import { EmptyState, Section, StatCard } from "@/components/ui-kit";
import { currentUser } from "@/lib/session";
import results from "@/eval/results.json";

export const metadata = { title: "Measured results" };
export const dynamic = "force-dynamic";

const LABEL_TEXT: Record<string, string> = {
  AMOUNT_MISMATCH: "Claimed amount differs from the bank",
  FDR_NUMBER_MISMATCH: "Claimed FDR number differs from the bank",
  LIEN_MISSING: "No lien in favour of AICTE",
  COVERAGE_GAP: "Gap in cover between renewals",
  AMOUNT_DROP: "Renewal for a smaller amount",
  BELOW_REQUIRED: "Deposit below the required amount",
  DUPLICATE_DOCUMENT: "Same document on two deposits",
  DUPLICATE_FDR_NUMBER: "Same bank + FDR number elsewhere",
  NEAR_DUPLICATE: "Near-identical deposit elsewhere",
};

const FIELD_TEXT: Record<string, string> = {
  bankName: "Bank",
  fdrNumber: "FDR number",
  amount: "Principal",
  issueDate: "Issue date",
  maturityDate: "Maturity date",
  lienNoted: "Lien",
};

export default async function MetricsPage() {
  const user = await currentUser();
  const o = results.detection.overall;
  const w = results.workflow;
  const t = results.detection.timingMs;
  const defects = results.detection.byLabel.filter((b): b is (typeof b & { expected: string; detected: number; recall: number }) => "expected" in b);

  return (
    <PublicShell user={user} wide>
      <PageHeader
        eyebrow="Evaluation"
        title="Measured results"
        subtitle={`${results.cases} labelled cases from seed ${results.seed} · code at commit ${results.commit} · run ${new Date(results.generatedAt).toLocaleDateString("en-IN", { dateStyle: "medium", timeZone: "Asia/Kolkata" })}`}
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={ScanSearch} label="Planted defects caught" value={`${o.recall}%`} hint={`${o.detected} of ${o.defectiveCases}`} tone="green" />
        <StatCard icon={ShieldCheck} label="Correct deposits flagged" value={o.cleanFlagged} hint={`of ${o.cleanCases} (false positives)`} tone={o.cleanFlagged ? "amber" : "green"} />
        <StatCard icon={BadgeCheck} label="Findings explained by a real defect" value={`${o.alarmPrecision}%`} hint={`${o.alarms - o.wrongAlarms} of ${o.alarms}`} tone="navy" />
        {w ? (
          <StatCard icon={Workflow} label="Workflows completed as expected" value={`${w.completionRate}%`} hint={`${w.completedAsExpected} of ${w.cases} through the real services`} tone="violet" />
        ) : (
          <StatCard icon={Clock} label="Detection per deposit" value={`${t.detectionP50} ms`} hint="median" tone="violet" />
        )}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Section title="Detection by planted defect" icon={ScanSearch} description="Each case is a generated PDF read by the local parser, then checked by the production engines" className="min-w-0" bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-120 text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Planted defect</th>
                  <th className="px-3 py-2.5 font-medium">Expected finding</th>
                  <th className="px-3 py-2.5 text-right font-medium">Caught</th>
                  <th className="px-5 py-2.5 text-right font-medium">Recall</th>
                </tr>
              </thead>
              <tbody>
                {defects.map((d) => (
                  <tr key={d.label} className="border-b last:border-b-0">
                    <td className="px-5 py-2.5">{LABEL_TEXT[d.label] ?? d.label}</td>
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{d.expected}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {d.detected} / {d.n}
                    </td>
                    <td className="px-5 py-2.5 text-right font-semibold tabular-nums">{d.recall}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t px-5 py-3 text-xs text-muted-foreground">
            Both sides of a duplicate: {o.partnersFlagged} of {o.partnerCases} copied-from deposits were flagged as the partner too.
          </p>
        </Section>

        <div className="min-w-0 space-y-6">
          <Section title="Extraction accuracy" icon={FileSearch} description="Local text parser against the values printed on each PDF">
            <ul className="space-y-2 text-sm">
              {Object.entries(results.detection.extractionAccuracy).map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3">
                  <span>{FIELD_TEXT[k] ?? k}</span>
                  <span className="font-semibold tabular-nums">{v}%</span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Processing time" icon={Clock}>
            <ul className="space-y-2 text-sm">
              <li className="flex justify-between gap-3">
                <span>Text extraction per document</span>
                <span className="tabular-nums">
                  p50 {t.extractionP50} ms · p95 {t.extractionP95} ms
                </span>
              </li>
              <li className="flex justify-between gap-3">
                <span>Detection per deposit</span>
                <span className="tabular-nums">
                  p50 {t.detectionP50} ms · p95 {t.detectionP95} ms
                </span>
              </li>
              {w && (
                <li className="flex justify-between gap-3">
                  <span>Full workflow per case</span>
                  <span className="tabular-nums">
                    p50 {(w.perCaseMs.p50 / 1000).toFixed(1)} s · p95 {(w.perCaseMs.p95 / 1000).toFixed(1)} s
                  </span>
                </li>
              )}
            </ul>
            {w && <p className="mt-3 text-xs text-muted-foreground">Workflow times are on a local single-connection database. Audit hash chain after the run: {w.auditChainIntact ? "intact" : "broken"}.</p>}
          </Section>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Section title="What the evaluation changed">
          <p className="text-sm leading-relaxed">
            An earlier run flagged 2 of 70 correct deposits as near-duplicates: unrelated ₹50 L FDRs opened at the same bank on the same day. Deposit amounts are standard, so same-day collisions are
            common. The rule now also needs the FDR numbers to be within three edits, and every planted near-duplicate is still caught.
          </p>
        </Section>
        <Section title="Limits and how to reproduce">
          <ul className="list-disc space-y-1.5 pl-4 text-sm leading-relaxed">
            <li>The dataset is synthetic, and the documents are clean machine-generated PDFs. Scanned or photographed documents (OCR) are not covered yet.</li>
            <li>Bank values come from the sandbox bank book, not a live Account Aggregator.</li>
            <li>
              The penalty and deposit rules are checked separately against the handbook: see the{" "}
              <Link href="/policy" className="font-medium text-primary hover:underline">
                rule register
              </Link>
              .
            </li>
            <li>
              Reproduce with <code className="rounded bg-muted px-1 font-mono text-xs">npm run eval</code>, or <code className="rounded bg-muted px-1 font-mono text-xs">npm run eval -- --workflow</code>{" "}
              with a throwaway <code className="rounded bg-muted px-1 font-mono text-xs">TEST_DATABASE_URL</code>. The full report is in <code className="font-mono text-xs">eval/REPORT.md</code>.
            </li>
          </ul>
        </Section>
      </div>

      {results.detection.misses.length > 0 && (
        <Section title="Misses and false alarms" className="mt-6">
          <EmptyState icon={ScanSearch} title={`${results.detection.misses.length} cases need a look`}>
            See eval/REPORT.md for the list.
          </EmptyState>
        </Section>
      )}
    </PublicShell>
  );
}
