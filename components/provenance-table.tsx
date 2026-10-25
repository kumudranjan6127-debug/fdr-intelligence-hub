import { FIELD_KEYS, FIELD_LABELS, valuesEqual, type FieldKey, type FieldValue, type TierFields } from "@/lib/provenance";
import { fmtDate, fmtDateTime, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { FieldStatusBadge, TierBadge } from "./badges";

export function showValue(key: FieldKey, v: FieldValue): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "amount") return formatINR(String(v));
  if (key === "issueDate" || key === "maturityDate") return fmtDate(String(v));
  if (key === "lienNoted") return v === true || v === "true" ? "Yes — lien marked" : "No lien";
  return String(v);
}

/** Side-by-side Claimed vs Extracted vs Confirmed with mismatch highlights (U1). */
export function ProvenanceTable({ fields, type }: { fields: TierFields; type: "FDR" | "ONLINE_DEPOSIT" }) {
  const keys = FIELD_KEYS.filter((k) => !(type === "ONLINE_DEPOSIT" && k === "lienNoted"));
  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead className="bg-muted/60 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">
              <TierBadge tier="CLAIMED" /> <span className="sr-only">by institution</span>
            </th>
            <th className="px-3 py-2 font-medium">
              <TierBadge tier="EXTRACTED" /> <span className="sr-only">from document</span>
            </th>
            <th className="px-3 py-2 font-medium">
              <TierBadge tier="CONFIRMED" /> <span className="sr-only">by bank</span>
            </th>
            <th className="px-3 py-2 font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => {
            const f = fields[k];
            const exBad = !!f.extracted && f.extracted.value !== null && !valuesEqual(k, f.claimed, f.extracted.value);
            const coBad = !!f.confirmed && f.confirmed.value !== null && !valuesEqual(k, f.claimed, f.confirmed.value);
            return (
              <tr key={k} className={cn("border-t align-top", f.status === "MISMATCH" && "bg-red-50/40")}>
                <th scope="row" className="px-3 py-2.5 text-left font-medium">
                  {FIELD_LABELS[k]}
                </th>
                <td className={cn("px-3 py-2.5", (exBad || coBad) && "font-semibold text-red-800")}>{showValue(k, f.claimed)}</td>
                <td className={cn("px-3 py-2.5", exBad && "bg-red-100/70 font-semibold text-red-800")}>
                  {f.extracted ? (
                    <>
                      <div>{showValue(k, f.extracted.value)}</div>
                      <div className="text-[11px] font-normal text-muted-foreground">
                        {Math.round(f.extracted.confidence * 100)}% confidence{f.extracted.engine ? ` · ${f.extracted.engine}` : ""}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not extracted</span>
                  )}
                </td>
                <td className={cn("px-3 py-2.5", coBad && "bg-red-100/70 font-semibold text-red-800")}>
                  {f.confirmed ? (
                    <>
                      <div>{showValue(k, f.confirmed.value)}</div>
                      <div className="text-[11px] font-normal text-muted-foreground">
                        {f.confirmed.source === "BANK_PORTAL_MOCK" ? "Mock bank portal" : "Mock AA sandbox"} · {fmtDateTime(f.confirmed.fetchedAt)}
                      </div>
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not confirmed</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <FieldStatusBadge status={f.status} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Compact one-line provenance summary for cards. */
export function ProvenanceSummary({ fields, type }: { fields: TierFields; type: "FDR" | "ONLINE_DEPOSIT" }) {
  const keys = FIELD_KEYS.filter((k) => !(type === "ONLINE_DEPOSIT" && k === "lienNoted"));
  const c = { CONFIRMED: 0, MATCH: 0, MISMATCH: 0, UNVERIFIED: 0 };
  for (const k of keys) c[fields[k].status]++;
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <span>
        <strong className="text-emerald-800">{c.CONFIRMED}</strong> bank-confirmed
      </span>
      <span>
        <strong className="text-blue-800">{c.MATCH}</strong> doc-matched
      </span>
      <span>
        <strong className="text-amber-800">{c.UNVERIFIED}</strong> claim only
      </span>
      {c.MISMATCH > 0 && (
        <span>
          <strong className="text-red-700">{c.MISMATCH}</strong> mismatch
        </span>
      )}
      <span className="sr-only">of {keys.length} fields</span>
    </div>
  );
}
