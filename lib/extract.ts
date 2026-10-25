// AI extraction of FDR fields. Results ALWAYS land in the `extracted` tier — never auto-accepted.
// With ANTHROPIC_API_KEY: Claude reads the PDF/image. Without it: a local text parser (labelled in UI).
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { rupeesToPaise } from "./format";
import type { FieldKey, FieldValue } from "./provenance";

export const CLAUDE_MODEL = "claude-opus-5-5";

export type ExtractedFields = Record<FieldKey, { value: FieldValue; confidence: number }>;

export type ExtractionResult = {
  engine: string;
  fields: ExtractedFields;
  notes: string | null;
};

const field = <T extends z.ZodType>(t: T) => z.object({ value: t.nullable(), confidence: z.number() });

const FdrSchema = z.object({
  bankName: field(z.string()),
  receiptNumber: field(z.string()),
  principalRupees: field(z.number()),
  depositDate: field(z.string()),
  maturityDate: field(z.string()),
  lienInFavourOfAICTE: field(z.boolean()),
  notes: z.string(),
});

const PROMPT = `You are reading a security-deposit instrument submitted to AICTE: either a bank Fixed Deposit Receipt (FDR) or an online deposit payment acknowledgement.
Extract only what is printed on the document. Do not infer or correct values.
- bankName: the issuing bank (or the collecting bank for an online payment).
- receiptNumber: the FDR / receipt / transaction number exactly as printed.
- principalRupees: principal amount in rupees as a number (no commas, not the maturity value).
- depositDate and maturityDate: ISO format YYYY-MM-DD.
- lienInFavourOfAICTE: true only if the document states a lien is marked in favour of the Member Secretary, AICTE; false if it states no lien; null if it says nothing.
Use null for anything not present. confidence is your 0–1 confidence that the value is read correctly.
In notes, mention anything suspicious (alterations, mismatched totals, missing seal) or "none".`;

async function extractWithClaude(bytes: Buffer, mime: string): Promise<ExtractionResult> {
  const client = new Anthropic();
  const data = bytes.toString("base64");
  const media: Anthropic.ContentBlockParam =
    mime === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data } }
      : { type: "image", source: { type: "base64", media_type: mime as "image/png" | "image/jpeg", data } };

  const res = await client.messages.parse({
    model: CLAUDE_MODEL,
    max_tokens: 16000,
    output_config: { effort: "medium", format: zodOutputFormat(FdrSchema) },
    messages: [{ role: "user", content: [media, { type: "text", text: PROMPT }] }],
  });
  if (res.stop_reason === "refusal") throw new Error("Model declined to read this document");
  const o = res.parsed_output;
  if (!o) throw new Error("Model returned no parseable output");
  const clamp = (c: number) => Math.max(0, Math.min(1, c));
  return {
    engine: CLAUDE_MODEL,
    notes: o.notes && o.notes.toLowerCase() !== "none" ? o.notes : null,
    fields: {
      bankName: { value: o.bankName.value, confidence: clamp(o.bankName.confidence) },
      fdrNumber: { value: o.receiptNumber.value, confidence: clamp(o.receiptNumber.confidence) },
      amount: {
        value: o.principalRupees.value === null ? null : rupeesToPaise(o.principalRupees.value),
        confidence: clamp(o.principalRupees.confidence),
      },
      issueDate: { value: o.depositDate.value, confidence: clamp(o.depositDate.confidence) },
      maturityDate: { value: o.maturityDate.value, confidence: clamp(o.maturityDate.confidence) },
      lienNoted: { value: o.lienInFavourOfAICTE.value, confidence: clamp(o.lienInFavourOfAICTE.confidence) },
    },
  };
}

const LABELS = ["Receipt No", "Deposit in favour of", "On behalf of", "Paid by", "Principal Amount", "Date of Deposit", "Date of Maturity", "Rate of Interest", "Lien", "Status", "Bank", "This deposit", "Authorised"];

function after(text: string, label: string): string | null {
  const others = LABELS.filter((l) => l !== label).map((l) => l.replace(/ /g, "\\s+")).join("|");
  const re = new RegExp(`${label.replace(/ /g, "\\s+")}\\s*:\\s*([\\s\\S]*?)(?=\\s+(?:${others})\\b|$)`, "i");
  const m = re.exec(text);
  return m ? m[1].trim() : null;
}

function isoFromDmy(s: string | null): string | null {
  const m = s && /(\d{2})-(\d{2})-(\d{4})/.exec(s);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Deterministic fallback for text-layer PDFs (no API key). Lower confidence by design. */
export function parseFdrText(text: string): ExtractionResult {
  const t = text.replace(/\bSPECIMEN\b/g, " ").replace(/\s+/g, " ");
  const bank = /^\s*(.*?\bBANK\b[A-Z .&-]*?)(?=\s+[A-Z][a-z])/.exec(t)?.[1] ?? after(t, "Bank");
  const rcpt = after(t, "Receipt No")?.split(" ")[0] ?? null;
  const amt = /Rs\.?\s*([\d,]+(?:\.\d+)?)/.exec(after(t, "Principal Amount") ?? "")?.[1] ?? null;
  const lienText = after(t, "Lien");
  const lien = lienText === null ? null : /not\s+marked/i.test(lienText) ? false : /marked/i.test(lienText) ? /aicte/i.test(lienText) : null;
  const titleCase = (s: string) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    engine: "local-text-parser",
    notes: "Read by the local text-layer parser (no ANTHROPIC_API_KEY set). Scanned images need the AI engine.",
    fields: {
      bankName: { value: bank ? titleCase(bank.trim()) : null, confidence: bank ? 0.7 : 0 },
      fdrNumber: { value: rcpt, confidence: rcpt ? 0.8 : 0 },
      amount: { value: amt ? rupeesToPaise(amt.replace(/,/g, "")) : null, confidence: amt ? 0.8 : 0 },
      issueDate: { value: isoFromDmy(after(t, "Date of Deposit")), confidence: 0.75 },
      maturityDate: { value: isoFromDmy(after(t, "Date of Maturity")), confidence: 0.75 },
      lienNoted: { value: lien, confidence: lien === null ? 0 : 0.7 },
    },
  };
}

async function extractLocally(bytes: Buffer, mime: string, reason?: string): Promise<ExtractionResult> {
  if (mime !== "application/pdf") {
    const empty = { value: null, confidence: 0 };
    return {
      engine: "local-text-parser",
      notes: `Image uploads need the AI engine${reason ? ` (${reason})` : ""}. Fields left for manual verification.`,
      fields: { bankName: empty, fdrNumber: empty, amount: empty, issueDate: empty, maturityDate: empty, lienNoted: empty },
    };
  }
  const { extractText, getDocumentProxy } = await import("unpdf");
  const doc = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(doc, { mergePages: true });
  const r = parseFdrText(text);
  if (reason) r.notes = `AI engine unavailable (${reason}); ${r.notes}`;
  return r;
}

export async function extractFdr(bytes: Buffer, mime: string): Promise<ExtractionResult> {
  if (!process.env.ANTHROPIC_API_KEY) return extractLocally(bytes, mime);
  try {
    return await extractWithClaude(bytes, mime);
  } catch (err) {
    const reason = err instanceof Anthropic.APIError ? `API ${err.status}` : err instanceof Error ? err.message : "error";
    console.error("Claude extraction failed, falling back to local parser:", err);
    return extractLocally(bytes, mime, reason);
  }
}
