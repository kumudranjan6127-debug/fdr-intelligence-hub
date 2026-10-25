// U1 — Three-tier provenance. Every instrument field carries what the institution claimed,
// what the AI read from the document (with confidence), and what an authorized source confirmed.
//
// Value conventions: amount = paise string, dates = "YYYY-MM-DD", lienNoted = boolean, others = string.

export const FIELD_KEYS = ["bankName", "fdrNumber", "amount", "issueDate", "maturityDate", "lienNoted"] as const;
export type FieldKey = (typeof FIELD_KEYS)[number];
export type FieldValue = string | boolean | null;

export const FIELD_LABELS: Record<FieldKey, string> = {
  bankName: "Bank",
  fdrNumber: "FDR / transaction no.",
  amount: "Principal amount",
  issueDate: "Issue / deposit date",
  maturityDate: "Maturity date",
  lienNoted: "Lien in favour of AICTE",
};

export type Extracted = {
  value: FieldValue;
  confidence: number;
  documentId: string | null;
  bbox: number[] | null;
  engine?: string;
};

export type Confirmed = {
  value: FieldValue;
  source: string; // e.g. "AA_MOCK" | "BANK_PORTAL_MOCK"
  fetchedAt: string;
  ref?: string;
};

export type FieldStatus = "UNVERIFIED" | "MATCH" | "MISMATCH" | "CONFIRMED";

export type TierField = {
  claimed: FieldValue;
  extracted: Extracted | null;
  confirmed: Confirmed | null;
  status: FieldStatus;
};

export type TierFields = Record<FieldKey, TierField>;

const BANK_STOPWORDS = /\b(bank|ltd|limited|the|of|india|co|cooperative|co-operative)\b/g;

export function normalize(key: FieldKey, v: FieldValue): string | null {
  if (v === null || v === undefined || v === "") return null;
  switch (key) {
    case "amount":
      return String(v).replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
    case "issueDate":
    case "maturityDate":
      return String(v).slice(0, 10);
    case "lienNoted":
      return typeof v === "boolean" ? String(v) : String(/^(true|yes|y|1)$/i.test(String(v)));
    case "fdrNumber":
      return String(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
    case "bankName":
      return String(v).toLowerCase().replace(/\(.*?\)/g, "").replace(BANK_STOPWORDS, "").replace(/[^a-z0-9]/g, "");
  }
}

export function valuesEqual(key: FieldKey, a: FieldValue, b: FieldValue): boolean {
  const na = normalize(key, a);
  const nb = normalize(key, b);
  if (na === null || nb === null) return na === nb;
  return na === nb;
}

export function computeStatus(key: FieldKey, f: Omit<TierField, "status">): FieldStatus {
  if (f.confirmed && f.confirmed.value !== null) {
    return valuesEqual(key, f.claimed, f.confirmed.value) ? "CONFIRMED" : "MISMATCH";
  }
  if (f.extracted && f.extracted.value !== null) {
    return valuesEqual(key, f.claimed, f.extracted.value) ? "MATCH" : "MISMATCH";
  }
  return "UNVERIFIED";
}

export function makeField(
  key: FieldKey,
  claimed: FieldValue,
  extracted: Extracted | null = null,
  confirmed: Confirmed | null = null,
): TierField {
  const f = { claimed, extracted, confirmed };
  return { ...f, status: computeStatus(key, f) };
}

export function withExtracted(key: FieldKey, f: TierField, extracted: Extracted | null): TierField {
  return makeField(key, f.claimed, extracted, f.confirmed);
}

export function withConfirmed(key: FieldKey, f: TierField, confirmed: Confirmed | null): TierField {
  return makeField(key, f.claimed, f.extracted, confirmed);
}

/** Value used for record-keeping: bank-confirmed beats institution's claim. */
export function effectiveValue(f: TierField): FieldValue {
  return f.confirmed?.value ?? f.claimed;
}

/** Most independent evidence available: confirmed > extracted > claimed. Used by rule checks. */
export function bestEvidence(f: TierField): { value: FieldValue; tier: "CONFIRMED" | "EXTRACTED" | "CLAIMED" } {
  if (f.confirmed && f.confirmed.value !== null) return { value: f.confirmed.value, tier: "CONFIRMED" };
  if (f.extracted && f.extracted.value !== null) return { value: f.extracted.value, tier: "EXTRACTED" };
  return { value: f.claimed, tier: "CLAIMED" };
}

export function asTierField(json: unknown): TierField {
  const j = (json ?? {}) as Partial<TierField>;
  return {
    claimed: j.claimed ?? null,
    extracted: j.extracted ?? null,
    confirmed: j.confirmed ?? null,
    status: j.status ?? "UNVERIFIED",
  };
}

type InstrumentFieldColumns = Record<FieldKey, unknown>;

export function tierFieldsOf(i: InstrumentFieldColumns): TierFields {
  return Object.fromEntries(FIELD_KEYS.map((k) => [k, asTierField(i[k])])) as TierFields;
}

export function provenanceSummary(fields: TierFields) {
  const counts: Record<FieldStatus, number> = { UNVERIFIED: 0, MATCH: 0, MISMATCH: 0, CONFIRMED: 0 };
  for (const k of FIELD_KEYS) counts[fields[k].status]++;
  return counts;
}
