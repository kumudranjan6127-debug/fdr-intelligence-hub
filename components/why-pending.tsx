import { ArrowRight, Clock, Flag, UserRound } from "lucide-react";
import type { WhyPending } from "@/lib/whyPending";
import { cn } from "@/lib/utils";

export function WhyPendingBox({ w, title = "Why is this pending?" }: { w: WhyPending; title?: string }) {
  if (!w.open) return null;
  const breached = w.slaBreached;
  return (
    <section className={cn("card-surface relative overflow-hidden", breached ? "border-red-200" : "border-amber-200")} aria-label={title}>
      <span className={cn("absolute inset-y-0 left-0 w-1", breached ? "bg-red-500" : "bg-amber-400")} aria-hidden />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
        <h2 className="text-[15px] font-semibold tracking-tight">{title}</h2>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", breached ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900")}>
          <Clock className="size-3.5" aria-hidden />
          {w.daysPending === 0 ? "Since today" : `${w.daysPending} day${w.daysPending === 1 ? "" : "s"} at this step`}
          {breached ? " · SLA breached" : ""}
        </span>
      </div>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Flag className="size-3.5" aria-hidden /> Blocking step
          </div>
          <div className="mt-1 text-sm font-semibold">{w.blockingStep}</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <UserRound className="size-3.5" aria-hidden /> Owner
          </div>
          <div className="mt-1 text-sm font-semibold">{w.owner}</div>
        </div>
        <div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <ArrowRight className="size-3.5" aria-hidden /> Next action
          </div>
          <div className="mt-1 text-sm">{w.nextAction}</div>
        </div>
      </div>
      {w.evidence.length > 0 && (
        <ul className="space-y-1 border-t bg-muted/30 px-5 py-3 text-xs text-muted-foreground">
          {w.evidence.map((e) => (
            <li key={e} className="flex gap-1.5">
              <span aria-hidden>•</span>
              {e}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
