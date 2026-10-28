// Protection gap: how much of the deposit AICTE requires is not actually protecting it today.
// An institution is protected only by live instruments (active, not past maturity) that a bank has
// checked and that carry no mismatch or open discrepancy. Everything short of its requirement is the gap.
import type { RegistryRow } from "./registry";


export type ProtectionGap = {
  requiredPaise: bigint;
  protectedPaise: bigint;
  gapPaise: bigint;
  underCovered: number;
  institutions: number;
  /** Amounts behind the gap. They can overlap (an instrument may be both unchecked and flagged). */
  reasons: { key: "matured" | "unchecked" | "flagged" | "shortfall"; label: string; paise: bigint; count: number; href: string }[];
};

const isLive = (r: RegistryRow) => (r.status === "ACTIVE" || r.status === "EXPIRING") && (r.daysToMaturity === null || r.daysToMaturity >= 0);
const isChecked = (r: RegistryRow) => r.trust === "CONFIRMED" || r.trust === "SANDBOX";
const isFlagged = (r: RegistryRow) => r.trust === "MISMATCH" || r.openDiscrepancies > 0;

export function protects(r: RegistryRow): boolean {
  return isLive(r) && isChecked(r) && !isFlagged(r);
}

export function protectionGap(rows: RegistryRow[]): ProtectionGap {
  const byInst = new Map<string, RegistryRow[]>();
  for (const r of rows) byInst.set(r.institutionId, [...(byInst.get(r.institutionId) ?? []), r]);

  let requiredPaise = 0n;
  let protectedPaise = 0n;
  let gapPaise = 0n;
  let underCovered = 0;
  let shortfallOnly = 0n;
  let shortfallCount = 0;
  for (const list of byInst.values()) {
    const required = list.reduce((m, r) => (r.requiredPaise > m ? r.requiredPaise : m), 0n);
    const prot = list.filter(protects).reduce((a, r) => a + r.amountPaise, 0n);
    const held = list.filter(isLive).reduce((a, r) => a + r.amountPaise, 0n);
    requiredPaise += required;
    protectedPaise += prot < required ? prot : required;
    if (prot < required) {
      gapPaise += required - prot;
      underCovered++;
    }
    if (held < required) {
      shortfallOnly += required - held;
      shortfallCount++;
    }
  }

  const sum = (f: (r: RegistryRow) => boolean) => {
    const hit = rows.filter(f);
    return { paise: hit.reduce((a, r) => a + r.amountPaise, 0n), count: hit.length };
  };
  const matured = sum((r) => r.status === "MATURED" || ((r.status === "ACTIVE" || r.status === "EXPIRING") && r.daysToMaturity !== null && r.daysToMaturity < 0));
  const unchecked = sum((r) => isLive(r) && !isChecked(r) && !isFlagged(r));
  const flagged = sum((r) => isLive(r) && isFlagged(r));

  return {
    requiredPaise,
    protectedPaise,
    gapPaise,
    underCovered,
    institutions: byInst.size,
    reasons: [
      { key: "matured", label: "Matured, not renewed", ...matured, href: "/registry?cat=matured" },
      { key: "unchecked", label: "Not yet bank-checked", ...unchecked, href: "/registry?q=not+bank+verified" },
      { key: "flagged", label: "Mismatch or open discrepancy", ...flagged, href: "/registry?q=flagged" },
      { key: "shortfall", label: "Held below the required deposit", paise: shortfallOnly, count: shortfallCount, href: "/registry" },
    ],
  };
}
