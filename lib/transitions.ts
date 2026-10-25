// Server-side state machine. The API rejects any transition not listed here.
import type { CaseStatus, CaseType, InstrumentStatus, Role } from "@prisma/client";

export const CASE_TRANSITIONS: Record<CaseStatus, CaseStatus[]> = {
  DRAFT: ["SUBMITTED", "WITHDRAWN"],
  SUBMITTED: ["COMPLETENESS_CHECK", "RO_SCRUTINY", "CLARIFICATION_REQUIRED", "CLEARANCES_PENDING", "CLOSED", "REJECTED", "RETURNED", "WITHDRAWN", "ON_HOLD"],
  COMPLETENESS_CHECK: ["RO_SCRUTINY", "CLARIFICATION_REQUIRED", "CLEARANCES_PENDING", "CLOSED", "REJECTED", "RETURNED"],
  RO_SCRUTINY: ["CLARIFICATION_REQUIRED", "CLEARANCES_PENDING", "CLOSED", "REJECTED"],
  CLARIFICATION_REQUIRED: ["SUBMITTED", "WITHDRAWN", "REJECTED"],
  CLEARANCES_PENDING: ["PENALTY_ASSESSMENT", "CLARIFICATION_REQUIRED", "ON_HOLD", "REJECTED"],
  PENALTY_ASSESSMENT: ["DECISION_RECORDED", "REJECTED"],
  DECISION_RECORDED: ["NOC_ISSUED"],
  NOC_ISSUED: ["BANK_CONFIRMED"],
  BANK_CONFIRMED: ["CLOSED"],
  RETURNED: ["SUBMITTED", "WITHDRAWN"],
  ON_HOLD: ["SUBMITTED", "RO_SCRUTINY", "CLEARANCES_PENDING"],
  CLOSED: [],
  REJECTED: [],
  WITHDRAWN: [],
};

export const INSTRUMENT_TRANSITIONS: Record<InstrumentStatus, InstrumentStatus[]> = {
  DRAFT: ["SUBMITTED"],
  SUBMITTED: ["UNDER_SCRUTINY", "ACTIVE", "EXPIRING", "MATURED", "REJECTED"],
  UNDER_SCRUTINY: ["SUBMITTED", "ACTIVE", "EXPIRING", "MATURED", "REJECTED"],
  ACTIVE: ["EXPIRING", "MATURED", "RENEWED", "REPLACED", "RELEASE_REQUESTED"],
  EXPIRING: ["ACTIVE", "MATURED", "RENEWED", "REPLACED", "RELEASE_REQUESTED"],
  MATURED: ["RENEWED", "REPLACED", "RELEASE_REQUESTED"],
  RENEWED: [],
  REPLACED: [],
  RELEASE_REQUESTED: ["RELEASED", "MATURED", "ACTIVE", "EXPIRING"],
  RELEASED: ["CLOSED"],
  CLOSED: [],
  REJECTED: [],
};

export const OPEN_CASE_STATUSES: CaseStatus[] = [
  "DRAFT",
  "SUBMITTED",
  "COMPLETENESS_CHECK",
  "RO_SCRUTINY",
  "CLARIFICATION_REQUIRED",
  "CLEARANCES_PENDING",
  "PENALTY_ASSESSMENT",
  "DECISION_RECORDED",
  "NOC_ISSUED",
  "BANK_CONFIRMED",
  "RETURNED",
  "ON_HOLD",
];

export const OFFICER_ROLES: Role[] = ["RO", "BUREAU", "CELL", "AUTHORITY", "ADMIN"];
const SCRUTINY: Role[] = ["RO", "BUREAU", "ADMIN"];
const DECIDERS: Role[] = ["AUTHORITY", "ADMIN"];

export type CaseAction =
  | "START_SCRUTINY"
  | "ACCEPT"
  | "REQUEST_CLARIFICATION"
  | "REJECT"
  | "RESPOND"
  | "SEND_FOR_CLEARANCES"
  | "APPROVE_RELEASE"
  | "ISSUE_NOC"
  | "BANK_CONFIRM";

type ActionDef = {
  label: string;
  from: CaseStatus[];
  to: CaseStatus;
  roles: Role[];
  caseTypes: CaseType[];
  reasonRequired: boolean;
};

const ANY_SUBMISSION: CaseType[] = ["NEW_SUBMISSION", "RENEWAL", "REPLACEMENT"];

export const CASE_ACTIONS: Record<CaseAction, ActionDef> = {
  START_SCRUTINY: {
    label: "Start RO scrutiny",
    from: ["SUBMITTED", "COMPLETENESS_CHECK"],
    to: "RO_SCRUTINY",
    roles: SCRUTINY,
    caseTypes: ANY_SUBMISSION,
    reasonRequired: false,
  },
  ACCEPT: {
    label: "Accept & record",
    from: ["SUBMITTED", "COMPLETENESS_CHECK", "RO_SCRUTINY"],
    to: "CLOSED",
    roles: SCRUTINY,
    caseTypes: ANY_SUBMISSION,
    reasonRequired: false,
  },
  REQUEST_CLARIFICATION: {
    label: "Request clarification",
    from: ["SUBMITTED", "COMPLETENESS_CHECK", "RO_SCRUTINY", "CLEARANCES_PENDING"],
    to: "CLARIFICATION_REQUIRED",
    roles: [...SCRUTINY, "CELL"],
    caseTypes: [...ANY_SUBMISSION, "RELEASE"],
    reasonRequired: true,
  },
  REJECT: {
    label: "Reject",
    from: ["SUBMITTED", "COMPLETENESS_CHECK", "RO_SCRUTINY", "CLARIFICATION_REQUIRED", "CLEARANCES_PENDING", "PENALTY_ASSESSMENT"],
    to: "REJECTED",
    roles: [...SCRUTINY, "AUTHORITY"],
    caseTypes: [...ANY_SUBMISSION, "RELEASE"],
    reasonRequired: true,
  },
  RESPOND: {
    label: "Submit response",
    from: ["CLARIFICATION_REQUIRED", "RETURNED"],
    to: "SUBMITTED",
    roles: ["INSTITUTION"],
    caseTypes: [...ANY_SUBMISSION, "RELEASE"],
    reasonRequired: true,
  },
  SEND_FOR_CLEARANCES: {
    label: "Send to Finance / Legal / Grievance cells",
    from: ["SUBMITTED", "COMPLETENESS_CHECK", "RO_SCRUTINY"],
    to: "CLEARANCES_PENDING",
    roles: SCRUTINY,
    caseTypes: ["RELEASE"],
    reasonRequired: false,
  },
  APPROVE_RELEASE: {
    label: "Approve release",
    from: ["PENALTY_ASSESSMENT"],
    to: "DECISION_RECORDED",
    roles: DECIDERS,
    caseTypes: ["RELEASE"],
    reasonRequired: false,
  },
  ISSUE_NOC: {
    label: "Issue lien-release NOC",
    from: ["DECISION_RECORDED"],
    to: "NOC_ISSUED",
    roles: DECIDERS,
    caseTypes: ["RELEASE"],
    reasonRequired: false,
  },
  BANK_CONFIRM: {
    label: "Confirm lien lifted & principal paid",
    from: ["NOC_ISSUED"],
    to: "BANK_CONFIRMED",
    roles: ["BANK", "BUREAU", "ADMIN"],
    caseTypes: ["RELEASE"],
    reasonRequired: false,
  },
};

export class TransitionError extends Error {}

export function assertCaseTransition(from: CaseStatus, to: CaseStatus) {
  if (!CASE_TRANSITIONS[from].includes(to)) throw new TransitionError(`Case cannot move ${from} → ${to}`);
}

export function assertInstrumentTransition(from: InstrumentStatus, to: InstrumentStatus) {
  if (from === to) return;
  if (!INSTRUMENT_TRANSITIONS[from].includes(to)) throw new TransitionError(`Instrument cannot move ${from} → ${to}`);
}

export function canPerform(action: CaseAction, c: { status: CaseStatus; type: CaseType }, role: Role): boolean {
  const def = CASE_ACTIONS[action];
  return def.roles.includes(role) && def.from.includes(c.status) && def.caseTypes.includes(c.type) && CASE_TRANSITIONS[c.status].includes(def.to);
}

export function availableActions(c: { status: CaseStatus; type: CaseType }, role: Role): CaseAction[] {
  return (Object.keys(CASE_ACTIONS) as CaseAction[]).filter((a) => canPerform(a, c, role));
}

/** Date-driven status for an instrument that is in force. */
export function holdingStatus(maturityDay: string | null, now: Date, expiringWindowDays: number): InstrumentStatus {
  if (!maturityDay) return "ACTIVE";
  const days = Math.round((Date.parse(maturityDay) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000);
  if (days <= 0) return "MATURED";
  if (days <= expiringWindowDays) return "EXPIRING";
  return "ACTIVE";
}
