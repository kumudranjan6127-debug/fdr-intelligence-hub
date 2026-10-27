// Provenance & status badges. Colour is never the only signal — every badge carries a text label and icon.
import type { CaseStatus, InstrumentStatus } from "@prisma/client";
import { AlertTriangle, BadgeCheck, Building2, CircleDashed, FileSearch, FlaskConical, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { humanize } from "@/lib/format";
import type { FieldStatus } from "@/lib/provenance";
import { riskBand } from "@/lib/risk";

const pill = "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export const TIER_STYLE = {
  CLAIMED: { cls: "border-amber-300 bg-amber-50 text-amber-900", label: "Claimed", Icon: Building2, hint: "Typed by the institution" },
  EXTRACTED: { cls: "border-blue-300 bg-blue-50 text-blue-900", label: "Extracted", Icon: FileSearch, hint: "Read from the uploaded document by AI" },
  CONFIRMED: { cls: "border-emerald-300 bg-emerald-50 text-emerald-900", label: "Confirmed", Icon: Landmark, hint: "Confirmed by the bank (Mock AA sandbox)" },
  MISMATCH: { cls: "border-red-300 bg-red-50 text-red-900", label: "Mismatch", Icon: AlertTriangle, hint: "Sources disagree" },
  SANDBOX: { cls: "border-dashed border-slate-400 bg-slate-50 text-slate-700", label: "Sandbox match", Icon: FlaskConical, hint: "Matches the Mock AA sandbox. Not genuine bank evidence." },
} as const;

export function TierBadge({ tier, className }: { tier: keyof typeof TIER_STYLE; className?: string }) {
  const t = TIER_STYLE[tier];
  return (
    <span className={cn(pill, t.cls, className)} title={t.hint}>
      <t.Icon className="size-3" aria-hidden />
      {t.label}
    </span>
  );
}

/** Field-level verdict: what's the strongest thing we can say about this field? */
export function FieldStatusBadge({ status, sandbox }: { status: FieldStatus; sandbox?: boolean }) {
  switch (status) {
    case "CONFIRMED":
      return <TierBadge tier={sandbox ? "SANDBOX" : "CONFIRMED"} />;
    case "MISMATCH":
      return <TierBadge tier="MISMATCH" />;
    case "MATCH":
      return (
        <span className={cn(pill, TIER_STYLE.EXTRACTED.cls)} title="Document matches the claim; not yet bank-confirmed">
          <FileSearch className="size-3" aria-hidden />
          Doc matches
        </span>
      );
    default:
      return <TierBadge tier="CLAIMED" />;
  }
}

const INSTRUMENT_TONE: Partial<Record<InstrumentStatus, string>> = {
  ACTIVE: "border-emerald-300 bg-emerald-50 text-emerald-900",
  EXPIRING: "border-amber-300 bg-amber-50 text-amber-900",
  MATURED: "border-orange-300 bg-orange-50 text-orange-900",
  RELEASE_REQUESTED: "border-violet-300 bg-violet-50 text-violet-900",
  RELEASED: "border-slate-300 bg-slate-100 text-slate-700",
  RENEWED: "border-slate-300 bg-slate-100 text-slate-700",
  REPLACED: "border-slate-300 bg-slate-100 text-slate-700",
  REJECTED: "border-red-300 bg-red-50 text-red-900",
  SUBMITTED: "border-blue-300 bg-blue-50 text-blue-900",
  UNDER_SCRUTINY: "border-blue-300 bg-blue-50 text-blue-900",
};

export function InstrumentStatusBadge({ status }: { status: InstrumentStatus }) {
  return <span className={cn(pill, INSTRUMENT_TONE[status] ?? "border-slate-300 bg-slate-50 text-slate-700")}>{humanize(status)}</span>;
}

const CASE_TONE: Partial<Record<CaseStatus, string>> = {
  CLARIFICATION_REQUIRED: "border-amber-300 bg-amber-50 text-amber-900",
  CLEARANCES_PENDING: "border-violet-300 bg-violet-50 text-violet-900",
  PENALTY_ASSESSMENT: "border-violet-300 bg-violet-50 text-violet-900",
  DECISION_RECORDED: "border-violet-300 bg-violet-50 text-violet-900",
  NOC_ISSUED: "border-emerald-300 bg-emerald-50 text-emerald-900",
  CLOSED: "border-slate-300 bg-slate-100 text-slate-700",
  REJECTED: "border-red-300 bg-red-50 text-red-900",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <span className={cn(pill, CASE_TONE[status] ?? "border-blue-300 bg-blue-50 text-blue-900")}>{humanize(status)}</span>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const cls =
    severity === "HIGH" ? "border-red-300 bg-red-50 text-red-900" : severity === "MED" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-slate-300 bg-slate-50 text-slate-700";
  return (
    <span className={cn(pill, cls)}>
      {severity === "HIGH" ? <AlertTriangle className="size-3" aria-hidden /> : <CircleDashed className="size-3" aria-hidden />}
      {severity === "MED" ? "Medium" : humanize(severity)}
    </span>
  );
}

export function RiskBadge({ score }: { score: number }) {
  const band = riskBand(score);
  const cls = band === "HIGH" ? "border-red-300 bg-red-50 text-red-900" : band === "MEDIUM" ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900";
  return (
    <span className={cn(pill, cls)} title="Risk = 40·late renewals + 30·gap days/30 + 20·open discrepancies + 10·overdue cases (cap 100)">
      Risk {Math.round(score)} · {humanize(band)}
    </span>
  );
}

export function MockLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded border border-dashed border-slate-400 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
      <BadgeCheck className="size-3" aria-hidden />
      {children}
    </span>
  );
}
