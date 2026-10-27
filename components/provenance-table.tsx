import { FIELD_KEYS, FIELD_LABELS, valuesEqual, type FieldKey, type FieldValue, type TierFields } from "@/lib/provenance";
import { fmtDate, fmtDateTime, formatINR } from "@/lib/format";
import { cn } from "@/lib/utils";
import { isSandboxSource, sourceLabel } from "@/lib/evidence";
import { FieldStatusBadge, TierBadge } from "./badges";

export function showValue(key: FieldKey, v: FieldValue): string {
  if (v === null || v === undefined || v === "") return "—";
  if (key === "amount") return formatINR(String(v));
  if (key === "issueDate" || key === "maturityDate") return fmtDate(String(v));
  if (key === "lienNoted") return v === true || v === "true" ? "Yes, lien marked" : "No lien";
  return String(v);
}

function keysFor(type: "FDR" | "ONLINE_DEPOSIT") {
  return FIELD_KEYS.filter((k) => !(type === "ONLINE_DEPOSIT" && k === "lienNoted"));
}

/** Side-by-side Claimed vs Extracted vs Confirmed with mismatch highlights (U1). Renders flush — wrap in a Section. */
export function ProvenanceTable({ fields, type }: { fields: TierFields; type: "FDR" | "ONLINE_DEPOSIT" }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-160 text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <th className="w-[19%] px-5 py-2.5 font-medium">Field</th>
            <th className="px-3 py-2.5 font-medium">
              <TierBadge tier="CLAIMED" />
              <div className="mt-1 text-[11px] font-normal">by the institution</div>
            </th>
            <th className="px-3 py-2.5 font-medium">
              <TierBadge tier="EXTRACTED" />
              <div className="mt-1 text-[11px] font-normal">read from the document</div>
            </th>
            <th className="px-3 py-2.5 font-medium">
              <TierBadge tier="CONFIRMED" />
              <div className="mt-1 text-[11px] font-normal">by the bank</div>
            </th>
            <th className="px-5 py-2.5 text-right font-medium">Verdict</th>
          </tr>
        </thead>
        <tbody>
          {keysFor(type).map((k) => {
            const f = fields[k];
            const exBad = !!f.extracted && f.extracted.value !== null && !valuesEqual(k, f.claimed, f.extracted.value);
            const coBad = !!f.confirmed && f.confirmed.value !== null && !valuesEqual(k, f.claimed, f.confirmed.value);
            return (
              <tr key={k} className={cn("border-b align-top last:border-b-0", f.status === "MISMATCH" && "bg-red-50/50")}>
                <th scope="row" className="px-5 py-3 text-left font-medium">
                  {FIELD_LABELS[k]}
                </th>
                <td className={cn("px-3 py-3", (exBad || coBad) && "font-semibold text-red-800")}>{showValue(k, f.claimed)}</td>
                <td className="px-3 py-3">
                  {f.extracted ? (
                    <div className={cn(exBad && "inline-block rounded-md bg-red-100 px-1.5 py-0.5 -mx-1.5 font-semibold text-red-800")}>
                      {showValue(k, f.extracted.value)}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">Not extracted</span>
                  )}
                  {f.extracted && (
                    <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="inline-block h-1 w-10 overflow-hidden rounded-full bg-muted" aria-hidden>
                        <span className="block h-full bg-blue-500" style={{ width: `${Math.round(f.extracted.confidence * 100)}%` }} />
                      </span>
                      {Math.round(f.extracted.confidence * 100)}% · {f.extracted.engine ?? "AI"}
                    </div>
                  )}
                </td>
                <td className="px-3 py-3">
                  {f.confirmed ? (
                    <>
                      <div className={cn(coBad && "inline-block rounded-md bg-red-100 px-1.5 py-0.5 -mx-1.5 font-semibold text-red-800")}>{showValue(k, f.confirmed.value)}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">
                        {sourceLabel(f.confirmed.source)} · {fmtDateTime(f.confirmed.fetchedAt)}
                      </div>
                      {isSandboxSource(f.confirmed.source) && (
                        <div className="mt-1 inline-flex rounded border border-dashed border-slate-400 px-1 text-[10px] font-medium uppercase tracking-wide text-slate-600">Sandbox · not bank evidence</div>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Not confirmed</span>
                  )}
                </td>
                <td className="px-5 py-3 text-right">
                  <FieldStatusBadge status={f.status} sandbox={isSandboxSource(f.confirmed?.source)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Segmented bar: how much of this instrument is bank-confirmed vs only claimed. */
export function ProvenanceBar({ fields, type }: { fields: TierFields; type: "FDR" | "ONLINE_DEPOSIT" }) {
  const keys = keysFor(type);
  const c = { CONFIRMED: 0, SANDBOX: 0, MATCH: 0, UNVERIFIED: 0, MISMATCH: 0 };
  for (const k of keys) c[fields[k].status === "CONFIRMED" && isSandboxSource(fields[k].confirmed?.source) ? "SANDBOX" : fields[k].status]++;
  const segs = [
    { n: c.CONFIRMED, cls: "bg-emerald-500", label: "bank-confirmed" },
    { n: c.SANDBOX, cls: "bg-emerald-300", label: "sandbox-confirmed" },
    { n: c.MATCH, cls: "bg-blue-500", label: "doc-matched" },
    { n: c.UNVERIFIED, cls: "bg-amber-400", label: "claim only" },
    { n: c.MISMATCH, cls: "bg-red-500", label: "mismatch" },
  ].filter((s) => s.n > 0);
  return (
    <div>
      <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={segs.map((s) => `${s.n} ${s.label}`).join(", ")}>
        {segs.map((s) => (
          <span key={s.label} className={s.cls} style={{ flex: s.n }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
        {segs.map((s) => (
          <span key={s.label} className={cn(s.label === "mismatch" && "font-medium text-red-700")}>
            <span className={cn("mr-1 inline-block size-1.5 rounded-full align-middle", s.cls)} aria-hidden />
            {s.n} {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
