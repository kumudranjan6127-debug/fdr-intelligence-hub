// Generates specimen FDR / receipt / affidavit PDFs for the demo. Banks are fictional and every page is
// stamped SPECIMEN so no output can pass as a real bank document.
import { PDFDocument, StandardFonts, rgb, degrees } from "pdf-lib";
import { paiseToRupees } from "./format";

export type FdrSpec = {
  bankName: string;
  branch: string;
  ifsc: string;
  fdrNumber: string;
  amountPaise: string;
  issueDate: string; // YYYY-MM-DD
  maturityDate: string;
  interestRate: string;
  depositor: string;
  lienMarked: boolean;
};

const ddmmyyyy = (d: string) => `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}`;

function inr(paise: string): string {
  const r = paiseToRupees(paise) ?? 0;
  return `Rs. ${new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2 }).format(r)}`;
}

function words(paise: string): string {
  const r = Math.round(paiseToRupees(paise) ?? 0);
  if (r % 10_000_000 === 0) return `${r / 10_000_000} Crore`;
  if (r % 100_000 === 0) return `${r / 100_000} Lakh`;
  return `${r}`;
}

async function base(title: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setProducer("FDR Intelligence Hub — specimen generator");
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("SPECIMEN", { x: 120, y: 300, size: 96, font: bold, color: rgb(0.92, 0.92, 0.92), rotate: degrees(35) });
  return { pdf, page, font, bold };
}

export async function makeFdrPdf(s: FdrSpec): Promise<Uint8Array> {
  const { pdf, page, font, bold } = await base(`FDR ${s.fdrNumber}`);
  const navy = rgb(0.08, 0.16, 0.36);
  page.drawRectangle({ x: 0, y: 762, width: 595, height: 80, color: navy });
  page.drawText(s.bankName.toUpperCase(), { x: 40, y: 806, size: 20, font: bold, color: rgb(1, 1, 1) });
  page.drawText(`${s.branch}  |  IFSC: ${s.ifsc}`, { x: 40, y: 784, size: 10, font, color: rgb(0.85, 0.88, 0.95) });

  page.drawText("FIXED DEPOSIT RECEIPT", { x: 40, y: 720, size: 16, font: bold, color: navy });
  page.drawText("Specimen generated for the SIH26265 demo. Fictional bank - not a real bank document.", {
    x: 40,
    y: 702,
    size: 8,
    font,
    color: rgb(0.6, 0.1, 0.1),
  });

  const rows: [string, string][] = [
    ["Receipt No", s.fdrNumber],
    ["Deposit in favour of", "Member Secretary, All India Council for Technical Education (AICTE)"],
    ["On behalf of", s.depositor],
    ["Principal Amount", `${inr(s.amountPaise)} (Rupees ${words(s.amountPaise)} Only)`],
    ["Date of Deposit", ddmmyyyy(s.issueDate)],
    ["Date of Maturity", ddmmyyyy(s.maturityDate)],
    ["Rate of Interest", `${s.interestRate}% p.a. (interest accrues to AICTE)`],
    ["Lien", s.lienMarked ? "Marked in favour of Member Secretary, AICTE" : "Not marked"],
  ];
  let y = 660;
  for (const [k, v] of rows) {
    page.drawText(`${k}:`, { x: 40, y, size: 11, font: bold });
    page.drawText(v, { x: 190, y, size: 11, font });
    page.drawLine({ start: { x: 40, y: y - 8 }, end: { x: 555, y: y - 8 }, thickness: 0.4, color: rgb(0.85, 0.85, 0.85) });
    y -= 30;
  }
  page.drawText("This deposit shall not be encashed, pre-closed or pledged without a No Objection Certificate", { x: 40, y: y - 10, size: 9, font });
  page.drawText("from the Member Secretary, AICTE.", { x: 40, y: y - 22, size: 9, font });
  page.drawText("Authorised Signatory", { x: 420, y: 140, size: 10, font: bold });
  page.drawText(`for ${s.bankName}`, { x: 420, y: 126, size: 9, font });
  return pdf.save();
}

export type ReceiptSpec = { txnRef: string; amountPaise: string; date: string; termEnd: string; payer: string; gateway: string };

export async function makeOnlineReceiptPdf(s: ReceiptSpec): Promise<Uint8Array> {
  const { pdf, page, font, bold } = await base(`Receipt ${s.txnRef}`);
  page.drawText("AICTE PORTAL - SECURITY DEPOSIT PAYMENT ACKNOWLEDGEMENT", { x: 40, y: 790, size: 13, font: bold });
  page.drawText("Specimen generated for the SIH26265 demo - not an official AICTE receipt.", { x: 40, y: 772, size: 8, font, color: rgb(0.6, 0.1, 0.1) });
  const rows: [string, string][] = [
    ["Bank", s.gateway],
    ["Receipt No", s.txnRef],
    ["Paid by", s.payer],
    ["Principal Amount", `${inr(s.amountPaise)} (Rupees ${words(s.amountPaise)} Only)`],
    ["Date of Deposit", ddmmyyyy(s.date)],
    ["Date of Maturity", `${ddmmyyyy(s.termEnd)} (end of 10-year holding term)`],
    ["Status", "Deposit Received"],
  ];
  let y = 730;
  for (const [k, v] of rows) {
    page.drawText(`${k}:`, { x: 40, y, size: 11, font: bold });
    page.drawText(v, { x: 190, y, size: 11, font });
    y -= 28;
  }
  return pdf.save();
}

export async function makeAffidavitPdf(kind: "AFFIDAVIT_3" | "AFFIDAVIT_6", institution: string, date: string): Promise<Uint8Array> {
  const { pdf, page, font, bold } = await base(kind);
  const title = kind === "AFFIDAVIT_3" ? "AFFIDAVIT - SECURITY DEPOSIT (Affidavit-3)" : "AFFIDAVIT FOR RELEASE OF SECURITY DEPOSIT (Affidavit-6)";
  page.drawText(title, { x: 40, y: 790, size: 13, font: bold });
  page.drawText("Specimen generated for the SIH26265 demo.", { x: 40, y: 772, size: 8, font, color: rgb(0.6, 0.1, 0.1) });
  const body =
    kind === "AFFIDAVIT_3"
      ? [
          `I, the Chairman/Secretary of the Trust/Society running ${institution},`,
          "solemnly affirm that the security deposit has been created in favour of the Member Secretary,",
          "AICTE for the full term, that it shall not be encashed without AICTE's NOC, and that interest",
          "accruing on it belongs to AICTE.",
        ]
      : [
          `I, the Chairman/Secretary of the Trust/Society running ${institution},`,
          "solemnly affirm that the institution has complied with AICTE norms during the holding term,",
          "and undertake to refund the released amount to AICTE if any violation is found after release.",
        ];
  body.forEach((line, i) => page.drawText(line, { x: 40, y: 730 - i * 18, size: 11, font }));
  page.drawText(`Date: ${ddmmyyyy(date)}`, { x: 40, y: 600, size: 11, font });
  page.drawText("Deponent", { x: 450, y: 560, size: 11, font: bold });
  return pdf.save();
}
