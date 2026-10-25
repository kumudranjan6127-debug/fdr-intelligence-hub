// U2 — Renewal chain X-ray: one bar per instrument on a shared time axis; gaps, drops and lien breaks called out.
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { ChainAnalysis } from "@/lib/chain";
import { daysBetween, fmtDate, formatLakh, toDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ChainTimeline({ analysis, focusId, today = new Date() }: { analysis: ChainAnalysis; focusId: string; today?: Date }) {
  const nodes = analysis.nodes.filter((n) => n.issueDate && n.maturityDate);
  if (nodes.length === 0) return <p className="text-sm text-muted-foreground">No dated instruments in this chain.</p>;

  const start = nodes.reduce((m, n) => (n.issueDate! < m ? n.issueDate! : m), nodes[0].issueDate!);
  const endDay = nodes.reduce((m, n) => (n.maturityDate! > m ? n.maturityDate! : m), toDay(today));
  const span = Math.max(1, daysBetween(start, endDay));
  const pct = (d: string) => (Math.max(0, daysBetween(start, d)) / span) * 100;
  const todayPct = pct(toDay(today));
  const checks = [
    { ok: analysis.gaps.length === 0, label: analysis.gaps.length ? `${analysis.totalGapDays} day${analysis.totalGapDays === 1 ? "" : "s"} without valid cover` : "Continuous cover" },
    { ok: analysis.amountDrops.length === 0, label: analysis.amountDrops.length ? `Amount dropped on ${analysis.amountDrops.length} renewal${analysis.amountDrops.length > 1 ? "s" : ""}` : "No amount drop" },
    { ok: analysis.lienBreaks.length === 0, label: analysis.lienBreaks.length ? `Lien missing on ${analysis.lienBreaks.length} instrument${analysis.lienBreaks.length > 1 ? "s" : ""}` : "Lien in favour of AICTE throughout" },
  ];

  return (
    <div className="space-y-4">
      <ul className="flex flex-wrap gap-2 text-xs">
        {checks.map((c) => (
          <li key={c.label} className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium", c.ok ? "border-emerald-300 bg-emerald-50 text-emerald-900" : "border-red-300 bg-red-50 text-red-900")}>
            {c.ok ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
            {c.label}
          </li>
        ))}
      </ul>

      <div className="relative rounded-lg border bg-muted/30 px-3 pb-8 pt-3" role="img" aria-label={`Renewal chain from ${fmtDate(start)} to ${fmtDate(endDay)}`}>
        <div className="absolute inset-y-2 z-10 w-px bg-primary/70" style={{ left: `calc(0.75rem + (100% - 1.5rem) * ${todayPct / 100})` }} aria-hidden>
          <span className="absolute -top-0.5 left-1 whitespace-nowrap text-[10px] font-medium text-primary">today</span>
        </div>
        <div className="space-y-2">
          {nodes.map((n, i) => {
            const left = pct(n.issueDate!);
            const width = Math.max(1.5, pct(n.maturityDate!) - left);
            const gap = analysis.gaps.find((g) => g.toId === n.id);
            const drop = analysis.amountDrops.find((d) => d.toId === n.id);
            const lienBad = analysis.lienBreaks.some((b) => b.id === n.id);
            const bad = !!(gap || drop || lienBad);
            return (
              <div key={n.id} className="relative h-9">
                {gap && (
                  <div
                    className="absolute inset-y-1 rounded-sm border border-red-400 bg-[repeating-linear-gradient(135deg,var(--color-red-200)_0_4px,transparent_4px_8px)]"
                    style={{ left: `${pct(gap.from)}%`, width: `${Math.max(0.8, pct(gap.to) - pct(gap.from))}%` }}
                    title={`${gap.days}-day coverage gap`}
                  >
                    <span className="absolute -bottom-4 left-0 whitespace-nowrap text-[10px] font-semibold text-red-700">{gap.days}-day gap</span>
                  </div>
                )}
                <Link
                  href={`/institution/instruments/${n.id}`}
                  className={cn(
                    "absolute inset-y-0 flex items-center overflow-hidden rounded-md border px-2 text-[11px] font-medium whitespace-nowrap",
                    bad ? "border-red-400 bg-red-50 text-red-900" : "border-primary/30 bg-primary/10 text-primary",
                    n.id === focusId && "ring-2 ring-primary",
                  )}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  title={`${n.code}: ${fmtDate(n.issueDate)} → ${fmtDate(n.maturityDate)}`}
                >
                  {i + 1}. {n.code} · {n.amountPaise !== null ? formatLakh(n.amountPaise) : "—"}
                  {drop ? " ↓" : ""}
                  {lienBad ? " · no lien" : ""}
                </Link>
              </div>
            );
          })}
        </div>
        <div className="absolute inset-x-3 bottom-1.5 flex justify-between text-[10px] text-muted-foreground">
          <span>{fmtDate(start)}</span>
          <span>{fmtDate(endDay)}</span>
        </div>
      </div>

      <ol className="space-y-1.5 text-sm">
        {analysis.nodes.map((n, i) => {
          const gap = analysis.gaps.find((g) => g.toId === n.id);
          const drop = analysis.amountDrops.find((d) => d.toId === n.id);
          const ov = analysis.overlaps.find((o) => o.toId === n.id);
          return (
            <li key={n.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="w-5 text-right text-xs text-muted-foreground">{i + 1}.</span>
              <Link href={`/institution/instruments/${n.id}`} className={cn("font-mono text-xs hover:underline", n.id === focusId && "font-semibold")}>
                {n.code}
              </Link>
              <span className="text-xs text-muted-foreground">
                {n.issueDate ? fmtDate(n.issueDate) : "—"} → {n.maturityDate ? fmtDate(n.maturityDate) : "—"} · {n.amountPaise !== null ? formatLakh(n.amountPaise) : "—"} · {n.status.toLowerCase().replace(/_/g, " ")}
              </span>
              {gap && <span className="text-xs font-medium text-red-700">⚠ starts {gap.days} days after predecessor matured</span>}
              {drop && (
                <span className="text-xs font-medium text-red-700">
                  ⚠ amount fell {formatLakh(drop.fromPaise)} → {formatLakh(drop.toPaise)}
                </span>
              )}
              {analysis.lienBreaks.some((b) => b.id === n.id) && <span className="text-xs font-medium text-red-700">⚠ no lien in favour of AICTE</span>}
              {ov && <span className="text-xs text-muted-foreground">overlaps predecessor by {ov.days} days</span>}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
