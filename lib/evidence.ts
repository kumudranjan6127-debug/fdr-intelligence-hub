// Independent-evidence controls: a sandbox (mock) confirmation must never pass for genuine bank evidence.
// Every Confirmed value carries its source; this module classifies sources and gates what sandbox data may unlock.
import { FIELD_KEYS, type FieldKey, type TierFields } from "./provenance";

/** Fields that carry bank evidence for an instrument type (online deposits have no lien). */
export function evidenceKeys(type: string): FieldKey[] {
  return FIELD_KEYS.filter((k) => !(type === "ONLINE_DEPOSIT" && k === "lienNoted"));
}

/** Sources produced by the Mock AA sandbox and the mocked bank portal. Live sources (Phase 4) are anything else. */
export const SANDBOX_SOURCES = new Set(["AA_MOCK", "BANK_PORTAL_MOCK"]);

export function isSandboxSource(source: string | null | undefined): boolean {
  return !source || SANDBOX_SOURCES.has(source);
}

export function sourceLabel(source: string): string {
  if (source === "AA_MOCK") return "Mock AA sandbox";
  if (source === "BANK_PORTAL_MOCK") return "Mock bank portal";
  if (source === "AA_LIVE") return "Account Aggregator";
  if (source === "BANK_PORTAL") return "Bank portal";
  return source;
}

/**
 * BANK_CONFIRMED: every field is confirmed by a live source and matches the claim.
 * SANDBOX_ONLY: something was confirmed, but at least one confirmation came from the sandbox.
 * NONE: nothing confirmed.
 */
export type EvidenceLevel = "BANK_CONFIRMED" | "SANDBOX_ONLY" | "NONE";

export function evidenceLevel(fields: TierFields, keys: readonly FieldKey[]): EvidenceLevel {
  const confirmed = keys.map((k) => fields[k].confirmed).filter((c) => c && c.value !== null);
  if (confirmed.length === 0) return "NONE";
  if (confirmed.some((c) => isSandboxSource(c!.source))) return "SANDBOX_ONLY";
  return confirmed.length === keys.length && keys.every((k) => fields[k].status === "CONFIRMED") ? "BANK_CONFIRMED" : "SANDBOX_ONLY";
}

export type BankEvidence = { level: EvidenceLevel; sources: string[]; note: string };

export function bankEvidence(fields: TierFields, keys: readonly FieldKey[]): BankEvidence {
  const level = evidenceLevel(fields, keys);
  const sources = [...new Set(keys.map((k) => fields[k].confirmed?.source).filter((s): s is string => !!s))].sort();
  const note =
    level === "BANK_CONFIRMED"
      ? "All fields confirmed by the bank through a live channel."
      : level === "SANDBOX_ONLY"
        ? "Bank values come from the Mock AA sandbox. This is not a genuine bank confirmation."
        : "No bank confirmation on record.";
  return { level, sources, note };
}

/** Outside demo mode a NOC may only rest on genuine bank evidence. */
export function canIssueNocOn(level: EvidenceLevel, demoMode: boolean): boolean {
  return level === "BANK_CONFIRMED" || demoMode;
}

/** One line for letters and the public verify page. NOCs issued before evidence controls carry no record. */
export function bankEvidenceText(e: BankEvidence | undefined): string {
  if (!e) return "Not recorded on this NOC";
  const via = e.sources.map(sourceLabel).join(", ");
  return via ? `${e.note} (${via})` : e.note;
}
