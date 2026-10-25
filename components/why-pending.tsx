import { Clock, UserRound } from "lucide-react";
import type { WhyPending } from "@/lib/whyPending";
import { cn } from "@/lib/utils";

export function WhyPendingBox({ w, title = "Why is this pending?" }: { w: WhyPending; title?: string }) {
  if (!w.open) return null;
  return (
    <section className={cn("rounded-xl border p-4", w.slaBreached ? "border-red-300 bg-red-50/60" : "border-amber-300 bg-amber-50/60")} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className={cn("inline-flex items-center gap-1 text-xs font-medium", w.slaBreached ? "text-red-800" : "text-amber-900")}>
          <Clock className="size-3.5" aria-hidden />
          {w.daysPending} day{w.daysPending === 1 ? "" : "s"} at this step{w.slaBreached ? " · SLA breached" : ""}
        </span>
      </div>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Blocking step</dt>
        <dd className="font-medium">{w.blockingStep}</dd>
        <dt className="text-muted-foreground">Owner</dt>
        <dd className="inline-flex items-center gap-1">
          <UserRound className="size-3.5" aria-hidden />
          {w.owner}
        </dd>
        <dt className="text-muted-foreground">Next action</dt>
        <dd>{w.nextAction}</dd>
      </dl>
      {w.evidence.length > 0 && (
        <ul className="mt-3 space-y-1 border-t border-black/5 pt-3 text-xs text-muted-foreground">
          {w.evidence.map((e) => (
            <li key={e}>• {e}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
