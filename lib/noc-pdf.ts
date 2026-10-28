// U4 — the NOC as a downloadable PDF. It is a rendering of the anchored NOC record, not the record itself:
// the QR leads to /verify/:code, which re-hashes the stored payload. Editing this PDF changes nothing there.
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { bankEvidenceText } from "./evidence";
import { fmtDate, fmtDateTime, formatINR, humanize } from "./format";
import type { NocPayload } from "./services/noc";

export type NocPdfInput = {
  payload: NocPayload;
  sha256: string;
  verifyUrl: string;
  /** PNG bytes of the QR code that encodes verifyUrl. */
  qrPng: Uint8Array;
  revoked?: { at: Date; reason: string | null } | null;
};

const W = 595;
const H = 842;
const M = 50;
const navy = rgb(0.08, 0.16, 0.36);
const grey = rgb(0.4, 0.43, 0.5);
const red = rgb(0.7, 0.1, 0.1);
const amber = rgb(0.55, 0.35, 0.02);

/** Standard PDF fonts only cover WinAnsi; map what we use and drop anything else. */
export function pdfSafe(text: string, font: PDFFont): string {
  const allowed = new Set(font.getCharacterSet());
  return text
    .replace(/₹\s?/g, "Rs. ")
    .replace(/ | /g, " ")
    .split("")
    .map((ch) => (allowed.has(ch.codePointAt(0)!) ? ch : "?"))
    .join("");
}

export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderNocPdf({ payload: p, sha256, verifyUrl, qrPng, revoked }: NocPdfInput): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`NOC ${p.code}`);
  pdf.setSubject(`Release of lien · case ${p.caseCode}`);
  pdf.setProducer("FDR Intelligence Hub (SIH26265 prototype)");
  pdf.setKeywords([p.code, `sha256:${sha256}`]);
  // Dates come from the record, so the same NOC always renders to the same bytes.
  pdf.setCreationDate(new Date(p.issuedAt));
  pdf.setModificationDate(revoked ? revoked.at : new Date(p.issuedAt));

  const page = pdf.addPage([W, H]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const mono = await pdf.embedFont(StandardFonts.Courier);
  const qr = await pdf.embedPng(qrPng);

  const text = (page_: PDFPage, s: string, x: number, y: number, size: number, f = font, color = rgb(0, 0, 0)) =>
    page_.drawText(pdfSafe(s, f), { x, y, size, font: f, color });
  let y = H;
  const para = (s: string, size = 10.5, f = font, color = rgb(0, 0, 0), width = W - 2 * M, gap = 4) => {
    for (const l of wrapText(pdfSafe(s, f), f, size, width)) {
      text(page, l, M, y, size, f, color);
      y -= size + gap;
    }
  };

  // Watermarks first, so the letter prints over them.
  page.drawText("PROTOTYPE", { x: 110, y: 260, size: 90, font: bold, color: rgb(0.94, 0.94, 0.95), rotate: degrees(35) });
  if (revoked) page.drawText("REVOKED", { x: 150, y: 420, size: 96, font: bold, color: rgb(0.98, 0.85, 0.85), rotate: degrees(35) });

  // Tricolour strip.
  page.drawRectangle({ x: 0, y: H - 6, width: W / 3, height: 6, color: rgb(1, 0.6, 0.2) });
  page.drawRectangle({ x: W / 3, y: H - 6, width: W / 3, height: 6, color: rgb(0.93, 0.93, 0.93) });
  page.drawRectangle({ x: (2 * W) / 3, y: H - 6, width: W / 3, height: 6, color: rgb(0.07, 0.53, 0.03) });

  const qrSize = 96;
  page.drawImage(qr, { x: W - M - qrSize, y: H - 40 - qrSize, width: qrSize, height: qrSize });
  text(page, "Scan to verify", W - M - qrSize + 16, H - 52 - qrSize, 8, font, grey);

  y = H - 50;
  text(page, "ALL INDIA COUNCIL FOR TECHNICAL EDUCATION · REGULATION BUREAU", M, y, 8.5, bold, grey);
  y -= 22;
  text(page, "No Objection Certificate - Release of Lien", M, y, 16, bold, navy);
  y -= 18;
  text(page, p.code, M, y, 11, mono);
  y -= 14;
  text(page, "Prototype letter · SIH26265 demo · fictional parties", M, y, 8, font, red);
  y = Math.min(y, H - 60 - qrSize) - 18;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.82) });
  y -= 22;

  if (revoked) {
    const msg = `REVOKED on ${fmtDateTime(revoked.at)}${revoked.reason ? ` - ${revoked.reason}` : ""}. This NOC must not be acted on.`;
    const lines = wrapText(pdfSafe(msg, bold), bold, 10, W - 2 * M - 16);
    const h = lines.length * 14 + 10;
    page.drawRectangle({ x: M, y: y - h + 12, width: W - 2 * M, height: h, color: rgb(1, 0.93, 0.93), borderColor: red, borderWidth: 0.8 });
    for (const l of lines) {
      text(page, l, M + 8, y - 2, 10, bold, red);
      y -= 14;
    }
    y -= 16;
  }

  para(`Date: ${fmtDate(p.issuedAt)}`);
  para(`To: ${p.addressedTo}`);
  y -= 6;
  para(
    `Subject: Release of lien on ${p.instrument.type === "FDR" ? "Fixed Deposit Receipt" : "security deposit"} no. ${p.instrument.fdrNumber ?? "-"} held in favour of the Member Secretary, AICTE - ${p.institution.name} (Permanent ID ${p.institution.permanentId}).`,
    10.5,
    bold,
  );
  y -= 6;
  para(
    `The competent authority has approved the release of the above security deposit under APH 2024-27 §6.46 (case ${p.caseCode}). AICTE has no objection to the lien being lifted and the deposit being closed as below:`,
  );
  y -= 8;

  const rows: [string, string, typeof amber | null][] = [
    ["Principal", formatINR(p.instrument.principalPaise), null],
    ["Deduction", `${p.deduction.pct}% · ${formatINR(p.deduction.amountPaise)}${p.deduction.ruleRef ? ` (${p.deduction.ruleRef})` : ""}`, null],
    ["Payable to the Trust / Society", formatINR(p.payableToTrustPaise), null],
    ["Interest", p.interest, null],
    ["Bank evidence", bankEvidenceText(p.bankEvidence), p.bankEvidence?.level === "BANK_CONFIRMED" ? null : amber],
  ];
  const labelW = 170;
  for (const [k, v, color] of rows) {
    const f = k.startsWith("Payable") ? bold : font;
    const lines = wrapText(pdfSafe(v, f), f, 10, W - 2 * M - labelW);
    text(page, k, M, y, 10, font, grey);
    for (const [i, l] of lines.entries()) text(page, l, M + labelW, y - i * 13, 10, f, color ?? rgb(0, 0, 0));
    y -= lines.length * 13 + 6;
    page.drawLine({ start: { x: M, y: y + 2 }, end: { x: W - M, y: y + 2 }, thickness: 0.4, color: rgb(0.88, 0.88, 0.9) });
    y -= 10;
  }

  y -= 4;
  text(page, "Documents relied on (SHA-256):", M, y, 9.5, bold);
  y -= 14;
  for (const d of p.documents) {
    text(page, humanize(d.kind), M, y, 8.5, font, grey);
    text(page, d.sha256, M + 90, y, 7.5, mono);
    y -= 12;
  }

  y -= 30;
  text(page, p.issuer.name, M, y, 11, bold);
  y -= 14;
  para(`${p.issuer.designation}, ${p.issuer.office}`, 9.5, font, grey);

  // Footer: what the hash does and does not prove.
  let fy = 92;
  page.drawLine({ start: { x: M, y: fy + 14 }, end: { x: W - M, y: fy + 14 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.82) });
  text(page, "SHA-256 of the NOC record:", M, fy, 8, bold, grey);
  text(page, sha256, M + 112, fy, 7.5, mono);
  fy -= 12;
  text(page, `Verify: ${verifyUrl}`, M, fy, 8, font, navy);
  fy -= 12;
  const note =
    "This PDF is a printable copy. The authoritative record is the anchored NOC (database anchoring in this prototype; ledger anchoring is roadmap Phase 3). A matching hash proves the record is unchanged since issue; it does not by itself prove the underlying FDR is genuine.";
  for (const l of wrapText(pdfSafe(note, font), font, 7.5, W - 2 * M)) {
    text(page, l, M, fy, 7.5, font, grey);
    fy -= 10;
  }

  return pdf.save();
}
