import { AlertTriangle, Building2, Check, FileSearch, Landmark } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { InstrumentStatusBadge, LienBadge, TrustBadge } from "@/components/badges";
import { ProvenanceBar } from "@/components/provenance-table";
import { fmtDate, formatINR, formatLakh } from "@/lib/format";
import type { Trust } from "@/lib/registry";
import { riskBand } from "@/lib/risk";
import { cn } from "@/lib/utils";
import type { InstrumentStatus } from "@prisma/client";
import type { TierFields } from "@/lib/provenance";

type Step = { n: number; title: string; body: string; Icon: LucideIcon };
const STEPS: Step[] = [
  { n: 0, title: "Claimed", body: "Declared by the institution on the form", Icon: Building2 },
  { n: 1, title: "Document matched", body: "AI read the receipt and it matches the form", Icon: FileSearch },
  { n: 2, title: "Bank-checked", body: "The bank's record matches (sandbox in this prototype)", Icon: Landmark },
];

function rung(t: Trust) {
  return t === "CONFIRMED" || t === "SANDBOX" ? 2 : t === "EXTRACTED" ? 1 : 0;
}

/** The deposit's climb up the trust ladder, with a "now" marker. A mismatch stops the climb. */
export function TrustSteps({ trust }: { trust: Trust }) {
  const blocked = trust === "MISMATCH";
  const now = blocked ? 1 : rung(trust);
  return (
    <div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {STEPS.map((s) => {
          const done = s.n < now || (s.n === now && !blocked);
          const here = s.n === now && !blocked;
          const stuck = blocked && s.n === now;
          return (
            <li
              key={s.n}
              className={cn(
                "relative rounded-lg border px-3 py-2.5",
                stuck ? "border-red-300 bg-red-50 text-red-900" : here ? "border-gov-blue bg-navy-soft ring-1 ring-gov-blue" : done ? "border-emerald-200 bg-emerald-50/60" : "bg-background text-muted-foreground",
              )}
            >
              {here && <span className="absolute -top-2 right-2 rounded-full bg-gov-blue px-1.5 py-px text-[10px] font-bold text-white">NOW</span>}
              {stuck && <span className="absolute -top-2 right-2 rounded-full bg-red-600 px-1.5 py-px text-[10px] font-bold text-white">STUCK</span>}
              <div className="flex items-center gap-1.5 text-sm font-semibold">
                {done && !here ? <Check className="size-3.5 text-emerald-700" aria-hidden /> : <s.Icon className="size-3.5" aria-hidden />}
                {s.n} · {s.title}
              </div>
              <div className="mt-0.5 text-xs">{s.body}</div>
            </li>
          );
        })}
      </ol>
      {trust === "MISMATCH" && (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-800 ring-1 ring-red-200">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          The sources disagree, so the deposit cannot climb until an officer resolves the mismatch.
        </p>
      )}
    </div>
  );
}

/** Semicircle gauge for the institution risk score (0–100). */
export function RiskGauge({ score }: { score: number }) {
  const band = riskBand(score);
  const color = band === "HIGH" ? "var(--color-red-600)" : band === "MEDIUM" ? "var(--color-amber-500)" : "var(--color-emerald-600)";
  const len = Math.PI * 40;
  return (
    <svg viewBox="0 0 100 58" className="w-36" role="img" aria-label={`Risk score ${Math.round(score)} of 100, ${band.toLowerCase()}`}>
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--color-muted)" strokeWidth="9" strokeLinecap="round" />
      <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${(Math.min(100, score) / 100) * len} ${len}`} />
      <text x="50" y="48" textAnchor="middle" className="fill-foreground text-[20px] font-bold">
        {Math.round(score)}
      </text>
    </svg>
  );
}

type Breakdown = { lateRenewals?: number; gapDays?: number; openDiscrepancies?: number; overdueCases?: number } | null;

export function PassportHero({
  type,
  status,
  trust,
  fields,
  amountPaise,
  requiredPaise,
  bank,
  fdrNumber,
  institution,
  issueDate,
  maturityDate,
  daysToMaturity,
  lien,
  lienConfirmed,
  submittedAt,
  risk,
  breakdown,
  showRisk,
}: {
  type: "FDR" | "ONLINE_DEPOSIT";
  status: InstrumentStatus;
  trust: Trust;
  fields: TierFields;
  amountPaise: string;
  requiredPaise: string;
  bank: string;
  fdrNumber: string;
  institution: string;
  issueDate: string | null;
  maturityDate: string | null;
  daysToMaturity: number | null;
  lien: boolean | null;
  lienConfirmed: boolean;
  submittedAt: Date | null;
  risk: number;
  breakdown: Breakdown;
  showRisk: boolean;
}) {
  const b = breakdown ?? {};
  const reasons = [
    [b.lateRenewals, 40, "late renewal"],
    [b.gapDays, 1, "coverage-gap day"],
    [b.openDiscrepancies, 20, "open discrepancy"],
    [b.overdueCases, 10, "overdue case"],
  ].filter(([n]) => Number(n) > 0) as [number, number, string][];
  return (
    <div className="mb-6 space-y-3">
      <section className={cn("card-surface grid border-t-4 border-t-gov-blue", showRisk && "lg:grid-cols-[minmax(0,1fr)_300px]")}>
        <div className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <InstrumentStatusBadge status={status} />
            <TrustBadge trust={trust} />
            <span className="text-xs text-muted-foreground">{type === "FDR" ? "Fixed Deposit Receipt · lien to AICTE" : "Online deposit to the AICTE account"}</span>
          </div>
          <div className="mt-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Deposit amount</div>
          <div className="text-4xl font-bold tabular-nums tracking-tight text-navy">{formatINR(amountPaise)}</div>
          <div className="text-sm text-muted-foreground">
            {formatLakh(amountPaise)} held · required {formatLakh(requiredPaise)} for this institution
          </div>
          <dl className="mt-4 grid gap-3 border-t pt-4 text-sm sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Institution</dt>
              <dd className="truncate font-medium text-primary">{institution}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Bank</dt>
              <dd className="truncate font-medium">{bank}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{type === "FDR" ? "FDR number" : "Transaction ref"}</dt>
              <dd className="truncate font-mono text-sm">{fdrNumber}</dd>
            </div>
          </dl>
          <div className="mt-4">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Trust ladder</div>
            <TrustSteps trust={trust} />
          </div>
        </div>
        {showRisk && (
          <aside className="border-t p-5 sm:p-6 lg:border-l lg:border-t-0" aria-label="Risk assessment">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Institution risk</div>
            <div className="mt-2 flex items-center gap-3">
              <RiskGauge score={risk} />
              <span
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1",
                  riskBand(risk) === "HIGH" ? "bg-red-50 text-red-800 ring-red-200" : riskBand(risk) === "MEDIUM" ? "bg-amber-50 text-amber-900 ring-amber-200" : "bg-emerald-50 text-emerald-800 ring-emerald-200",
                )}
              >
                {riskBand(risk).charAt(0) + riskBand(risk).slice(1).toLowerCase()} risk
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">Each factor adds points; the score is capped at 100.</p>
            <ul className="mt-3 space-y-1.5">
              {reasons.length === 0 ? (
                <li className="rounded-md border bg-background px-2.5 py-1.5 text-xs">No risk factors on record</li>
              ) : (
                reasons.map(([n, w, label]) => (
                  <li key={label} className="flex items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-xs">
                    <span className="w-9 font-bold tabular-nums text-red-700">+{Math.round(n * w)}</span>
                    <span>
                      {n} {label}
                      {n === 1 ? "" : "s"}
                    </span>
                  </li>
                ))
              )}
            </ul>
          </aside>
        )}
      </section>

      <dl className="card-surface grid grid-cols-2 divide-x divide-y sm:grid-cols-3 sm:divide-y-0 lg:grid-cols-6">
        {[
          ["Issue date", fmtDate(issueDate), null],
          [
            "Maturity",
            fmtDate(maturityDate),
            daysToMaturity === null ? null : daysToMaturity < 0 ? (
              <span className="text-xs font-medium text-red-700">{-daysToMaturity} days ago</span>
            ) : (
              <span className={cn("text-xs", daysToMaturity <= 90 ? "font-medium text-amber-800" : "text-muted-foreground")}>in {daysToMaturity} days</span>
            ),
          ],
          ["Lien", <LienBadge key="l" lien={lien} confirmed={lienConfirmed} />, null],
          ["Submitted", fmtDate(submittedAt), null],
          ["Who vouched", <ProvenanceBar key="p" fields={fields} type={type} />, null],
          ["Required deposit", formatINR(requiredPaise), null],
        ].map(([k, v, extra], i) => (
          <div key={i} className={cn("min-w-0 px-4 py-3", k === "Who vouched" && "col-span-2 sm:col-span-1")}>
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{k}</dt>
            <dd className="mt-1 text-sm font-medium">{v}</dd>
            {extra && <dd>{extra}</dd>}
          </div>
        ))}
      </dl>
    </div>
  );
}
