// U8 — "Why is this pending?" For every open case: blocking step, owner, days pending, next action, evidence.
import type { CaseStatus, CaseType, Cell, ClearanceStatus, DocumentKind, InstrumentType, Role } from "@prisma/client";
import { daysBetween, fmtDate } from "./format";

export type WhyPending = {
  open: boolean;
  blockingStep: string;
  owner: string;
  ownerRole: Role | null;
  daysPending: number;
  slaBreached: boolean;
  nextAction: string;
  evidence: string[];
};

export type WhyPendingInput = {
  case: {
    type: CaseType;
    status: CaseStatus;
    statusChangedAt: Date;
    blockingReason: string | null;
    penaltyPct: number | null;
    penaltyRuleRef: string | null;
  };
  instrumentType: InstrumentType;
  clearances: { cell: Cell; status: ClearanceStatus; decidedAt: Date | null; decidedBy?: string | null; note?: string | null }[];
  documentKinds: DocumentKind[];
  openDiscrepancies: { severity: string; message: string }[];
  now: Date;
  slaDays: number;
};

const CELL_NAME: Record<Cell, string> = { FINANCE: "Finance", LEGAL: "Legal", GRIEVANCE: "Grievance" };

const RELEASE_DOCS: { kind: DocumentKind; label: string }[] = [
  { kind: "AFFIDAVIT_6", label: "Affidavit-6" },
  { kind: "LOA_EOA", label: "latest LoA / EoA" },
];

export function whyPending(i: WhyPendingInput): WhyPending {
  const c = i.case;
  const daysPending = Math.max(0, daysBetween(c.statusChangedAt, i.now));
  const evidence: string[] = [];
  const base = { daysPending, slaBreached: daysPending > i.slaDays, open: true };

  for (const d of i.openDiscrepancies.filter((d) => d.severity === "HIGH").slice(0, 3)) evidence.push(`Open discrepancy: ${d.message}`);
  if (c.type === "RELEASE") {
    for (const r of RELEASE_DOCS) if (!i.documentKinds.includes(r.kind)) evidence.push(`Missing document: ${r.label}`);
  } else if (!i.documentKinds.includes("FDR_COPY") && i.instrumentType === "FDR") {
    evidence.push("Missing document: FDR copy");
  }

  switch (c.status) {
    case "DRAFT":
      return { ...base, blockingStep: "Draft not submitted", owner: "Institution", ownerRole: "INSTITUTION", nextAction: "Complete and submit the application", evidence };
    case "SUBMITTED":
    case "COMPLETENESS_CHECK":
      return {
        ...base,
        blockingStep: "Completeness check",
        owner: "AICTE Regulation Bureau",
        ownerRole: "BUREAU",
        nextAction:
          c.type === "RELEASE"
            ? "Check release documents, then send to Finance / Legal / Grievance cells"
            : "Compare claimed vs extracted vs bank-confirmed values and accept, query, or reject",
        evidence,
      };
    case "RO_SCRUTINY":
      return { ...base, blockingStep: "Regional Office scrutiny", owner: "Regional Office", ownerRole: "RO", nextAction: "Confirm affidavit received and verify the instrument", evidence };
    case "CLARIFICATION_REQUIRED":
    case "RETURNED":
      return {
        ...base,
        blockingStep: "Awaiting institution's response",
        owner: "Institution",
        ownerRole: "INSTITUTION",
        nextAction: c.blockingReason ? `Respond to: “${c.blockingReason}”` : "Respond to the officer's query",
        evidence,
      };
    case "CLEARANCES_PENDING": {
      const pending = i.clearances.filter((x) => x.status !== "CLEARED");
      for (const x of i.clearances) {
        if (x.status === "CLEARED") evidence.unshift(`${CELL_NAME[x.cell]} cell cleared on ${fmtDate(x.decidedAt)}${x.decidedBy ? ` by ${x.decidedBy}` : ""}`);
        if (x.status === "OBJECTION") evidence.unshift(`${CELL_NAME[x.cell]} cell objection: ${x.note ?? "see note"}`);
      }
      const names = pending.map((x) => CELL_NAME[x.cell]).join(", ");
      const objection = pending.some((x) => x.status === "OBJECTION");
      return {
        ...base,
        blockingStep: objection ? `Objection raised by ${names} cell` : `Cell clearances pending: ${names}`,
        owner: `${names} cell${pending.length > 1 ? "s" : ""}`,
        ownerRole: "CELL",
        nextAction: objection ? "Resolve the objection with the institution, or reject" : `${names} cell to record clearance`,
        evidence,
      };
    }
    case "PENALTY_ASSESSMENT":
      return {
        ...base,
        blockingStep: "Decision by competent authority",
        owner: "Competent Authority",
        ownerRole: "AUTHORITY",
        nextAction: `Approve release with ${c.penaltyPct ?? 0}% deduction${c.penaltyRuleRef ? ` (${c.penaltyRuleRef})` : ""}`,
        evidence,
      };
    case "DECISION_RECORDED":
      return { ...base, blockingStep: "NOC not yet issued", owner: "Competent Authority", ownerRole: "AUTHORITY", nextAction: "Issue the lien-release NOC to the bank", evidence };
    case "NOC_ISSUED":
      return i.instrumentType === "FDR"
        ? { ...base, blockingStep: "Bank action", owner: "Bank branch", ownerRole: "BANK", nextAction: "Bank to verify NOC, lift lien, pay principal to Trust and interest to AICTE", evidence }
        : { ...base, blockingStep: "Refund remittance", owner: "AICTE Finance", ownerRole: "BUREAU", nextAction: "Remit principal to the Trust's account and record payment", evidence };
    case "BANK_CONFIRMED":
      return { ...base, blockingStep: "Closure", owner: "AICTE Regulation Bureau", ownerRole: "BUREAU", nextAction: "Close the case", evidence };
    case "ON_HOLD":
      return { ...base, blockingStep: "On hold", owner: "AICTE Regulation Bureau", ownerRole: "BUREAU", nextAction: c.blockingReason ?? "Resume when hold reason is resolved", evidence };
    default:
      return { ...base, open: false, slaBreached: false, blockingStep: "Not pending", owner: "—", ownerRole: null, nextAction: "No action — case is closed", evidence: [] };
  }
}
