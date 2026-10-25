// U3 — Account Aggregator bank verification. RBI's AA framework lists Term Deposits as an FI type.
// The MVP uses a mock provider that returns the same JSON shape; Phase 4 swaps in a Setu/Finvu sandbox.
import type { Confirmed, FieldKey } from "../provenance";
import { rupeesToPaise } from "../format";

export type TermDepositFI = {
  type: "TERM_DEPOSIT";
  maskedAccNumber: string;
  linkedAccRef: string;
  profile: { holders: { name: string }[] };
  summary: {
    accountType: "FIXED";
    branch: string;
    ifsc: string;
    openingDate: string;
    maturityDate: string;
    principalAmount: string; // rupees, as in ReBIT FI schema
    interestRate: string;
    tenureDays: number;
    status: string;
  };
  /** Lien isn't part of the AA term-deposit summary — it comes from the bank portal (also mocked). */
  lien: { marked: boolean; holder: string | null; source: "BANK_PORTAL_MOCK" };
  fip: { id: string; name: string };
};

export type ConsentHandle = { consentId: string; status: "ACTIVE"; fiTypes: ["TERM_DEPOSIT"]; createdAt: string };

export interface AAProvider {
  readonly name: string;
  readonly isMock: boolean;
  requestConsent(req: { fipId: string; fdrNumber: string; purpose: string }): Promise<ConsentHandle>;
  fetchTermDeposit(consent: ConsentHandle, req: { fipId: string; fdrNumber: string }): Promise<TermDepositFI | null>;
}

/** Map an FI payload to the `confirmed` tier of each field. */
export function confirmedFromFI(fi: TermDepositFI, consentId: string): Partial<Record<FieldKey, Confirmed>> {
  const at = new Date().toISOString();
  const c = (value: Confirmed["value"], source = "AA_MOCK"): Confirmed => ({ value, source, fetchedAt: at, ref: consentId });
  return {
    bankName: c(fi.fip.name),
    fdrNumber: c(fi.linkedAccRef),
    amount: c(rupeesToPaise(fi.summary.principalAmount)),
    issueDate: c(fi.summary.openingDate),
    maturityDate: c(fi.summary.maturityDate),
    lienNoted: c(fi.lien.marked && /aicte|all india council/i.test(fi.lien.holder ?? ""), "BANK_PORTAL_MOCK"),
  };
}

export { getAAProvider } from "./mock";
