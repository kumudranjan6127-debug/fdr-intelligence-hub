// Duplicate FDR detection. Three independent signals, each with its own code so officers see why:
//   DUPLICATE_DOCUMENT    the same file (SHA-256) backs another instrument
//   DUPLICATE_FDR_NUMBER  the same bank + FDR/transaction number on another live instrument
//   NEAR_DUPLICATE_FDR    same bank and either a one-character-off number, or identical principal + issue date
// Instruments in the same renewal chain are never duplicates of each other (banks may renew under one number).
import { normalize } from "./provenance";

type Tier = { claimed?: unknown; confirmed?: { value?: unknown } | null } | null | undefined;

export type DupCandidate = {
  id: string;
  code: string;
  type: string;
  institutionId: string;
  institutionName: string;
  bankName: unknown;
  fdrNumber: unknown;
  amount?: unknown;
  issueDate?: unknown;
  /** SHA-256 of the instrument's FDR copy / payment receipt files. */
  docHashes?: string[];
};

export type DuplicateFinding = {
  code: "DUPLICATE_DOCUMENT" | "DUPLICATE_FDR_NUMBER" | "NEAR_DUPLICATE_FDR";
  field: string;
  severity: "MED" | "HIGH";
  message: string;
  evidence: { duplicates: { instrumentId: string; code: string; institution: string; sameInstitution: boolean }[]; signal: string };
};

/** Bank-confirmed value when there is one, else the claim. */
function best(t: unknown): unknown {
  const v = t as Tier;
  return v?.confirmed?.value ?? v?.claimed ?? null;
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

function identity(c: DupCandidate) {
  return {
    no: normalize("fdrNumber", best(c.fdrNumber) as string | null),
    bank: normalize("bankName", best(c.bankName) as string | null),
    amount: normalize("amount", best(c.amount) as string | null),
    issue: normalize("issueDate", best(c.issueDate) as string | null),
  };
}

function ref(o: DupCandidate, me: DupCandidate) {
  return { instrumentId: o.id, code: o.code, institution: o.institutionName, sameInstitution: o.institutionId === me.institutionId };
}

function who(list: ReturnType<typeof ref>[]) {
  return list.map((d) => `${d.sameInstitution ? "this institution" : d.institution} (${d.code})`).join(", ");
}

export function findDuplicates(me: DupCandidate, others: DupCandidate[], chainIds: ReadonlySet<string> = new Set()): DuplicateFinding[] {
  const pool = others.filter((o) => o.id !== me.id && !chainIds.has(o.id));
  const mine = identity(me);
  const out: DuplicateFinding[] = [];

  const myHashes = new Set(me.docHashes ?? []);
  const sameDoc = pool.filter((o) => (o.docHashes ?? []).some((h) => myHashes.has(h))).map((o) => ref(o, me));
  if (sameDoc.length) {
    out.push({
      code: "DUPLICATE_DOCUMENT",
      field: "document",
      severity: "HIGH",
      message: `The uploaded document is byte-identical to the one on ${who(sameDoc)}`,
      evidence: { duplicates: sameDoc, signal: "sha256" },
    });
  }

  const sameType = pool.filter((o) => o.type === me.type);
  if (mine.no) {
    const exact = sameType.filter((o) => {
      const t = identity(o);
      return t.no === mine.no && (!mine.bank || !t.bank || t.bank === mine.bank);
    });
    if (exact.length) {
      const refs = exact.map((o) => ref(o, me));
      out.push({
        code: "DUPLICATE_FDR_NUMBER",
        field: "fdrNumber",
        // Another institution pledging the same deposit is the serious case; inside one institution it is usually a double entry.
        severity: refs.some((r) => !r.sameInstitution) ? "HIGH" : "MED",
        message: `${me.type === "FDR" ? "FDR" : "Transaction"} number ${String(best(me.fdrNumber))} is also on ${who(refs)}`,
        evidence: { duplicates: refs, signal: "bank+number" },
      });
    }

    const exactIds = new Set(exact.map((o) => o.id));
    const near = sameType.filter((o) => {
      if (exactIds.has(o.id)) return false;
      const t = identity(o);
      if (!mine.bank || t.bank !== mine.bank || !t.no) return false;
      const oneOff = t.no.length >= 6 && levenshtein(t.no, mine.no!) === 1;
      const sameTerms = !!mine.amount && !!mine.issue && t.amount === mine.amount && t.issue === mine.issue;
      return oneOff || sameTerms;
    });
    if (near.length) {
      const refs = near.map((o) => ref(o, me));
      out.push({
        code: "NEAR_DUPLICATE_FDR",
        field: "fdrNumber",
        severity: "MED",
        message: `Looks like the same deposit as ${who(refs)}: same bank with a one-character-off number or the same principal and issue date`,
        evidence: { duplicates: refs, signal: "fuzzy" },
      });
    }
  }
  return out;
}

/** Instrument ids a set of findings points at, so their own findings can be refreshed too. */
export function duplicatePartners(findings: { code: string; evidence: Record<string, unknown> }[]): string[] {
  const ids = findings
    .filter((f) => f.code === "DUPLICATE_DOCUMENT" || f.code === "DUPLICATE_FDR_NUMBER" || f.code === "NEAR_DUPLICATE_FDR")
    .flatMap((f) => ((f.evidence.duplicates as { instrumentId: string }[]) ?? []).map((d) => d.instrumentId));
  return [...new Set(ids)];
}
