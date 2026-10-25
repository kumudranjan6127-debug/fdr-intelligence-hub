// U6 — Institution risk score: 40·lateRenewals + 30·gapDays/30 + 20·openDiscrepancies + 10·overdueCases (cap 100)

export type RiskInputs = {
  lateRenewals: number;
  gapDays: number;
  openDiscrepancies: number;
  overdueCases: number;
};

export type RiskBreakdown = RiskInputs & {
  parts: { lateRenewals: number; gapDays: number; openDiscrepancies: number; overdueCases: number };
  score: number;
};

export function riskScore(i: RiskInputs): RiskBreakdown {
  const parts = {
    lateRenewals: 40 * i.lateRenewals,
    gapDays: (30 * i.gapDays) / 30,
    openDiscrepancies: 20 * i.openDiscrepancies,
    overdueCases: 10 * i.overdueCases,
  };
  const raw = parts.lateRenewals + parts.gapDays + parts.openDiscrepancies + parts.overdueCases;
  return { ...i, parts, score: Math.round(Math.min(100, raw) * 10) / 10 };
}

export function riskBand(score: number): "LOW" | "MEDIUM" | "HIGH" {
  if (score >= 60) return "HIGH";
  if (score >= 25) return "MEDIUM";
  return "LOW";
}
