// Mock AA sandbox — reads the mock bank's own book (BankDepositRecord). Labelled "Mock AA sandbox" in UI.
import { randomUUID } from "crypto";
import { db } from "../db";
import { daysBetween, paiseToRupees, toDay } from "../format";
import { normalize } from "../provenance";
import type { AAProvider, ConsentHandle, TermDepositFI } from "./index";

class MockAAProvider implements AAProvider {
  readonly name = "Mock AA sandbox";
  readonly isMock = true;

  async requestConsent(): Promise<ConsentHandle> {
    return { consentId: `mock-consent-${randomUUID().slice(0, 8)}`, status: "ACTIVE", fiTypes: ["TERM_DEPOSIT"], createdAt: new Date().toISOString() };
  }

  async fetchTermDeposit(_consent: ConsentHandle, req: { fipId: string; fdrNumber: string }): Promise<TermDepositFI | null> {
    const bank = await db.bank.findUnique({ where: { id: req.fipId } });
    if (!bank) return null;
    const want = normalize("fdrNumber", req.fdrNumber);
    const records = await db.bankDepositRecord.findMany({ where: { bankId: bank.id } });
    const r = records.find((x) => normalize("fdrNumber", x.fdrNumber) === want);
    if (!r) return null;
    return {
      type: "TERM_DEPOSIT",
      maskedAccNumber: `XXXXXX${r.fdrNumber.slice(-4)}`,
      linkedAccRef: r.fdrNumber,
      profile: { holders: [{ name: r.accountHolder }] },
      summary: {
        accountType: "FIXED",
        branch: `${bank.name} — main branch`,
        ifsc: `${bank.ifscPrefix}0000123`,
        openingDate: toDay(r.openingDate),
        maturityDate: toDay(r.maturityDate),
        principalAmount: String(paiseToRupees(r.principal.toString())),
        interestRate: r.interestRate.toString(),
        tenureDays: daysBetween(r.openingDate, r.maturityDate),
        status: r.status,
      },
      lien: { marked: r.lienMarked, holder: r.lienHolder, source: "BANK_PORTAL_MOCK" },
      fip: { id: bank.id, name: bank.name },
    };
  }
}

let provider: AAProvider | null = null;

export function getAAProvider(): AAProvider {
  return (provider ??= new MockAAProvider());
}
