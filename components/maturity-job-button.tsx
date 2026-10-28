"use client";

import { useActionState } from "react";
import { Eye, Loader2, Play } from "lucide-react";
import { runMaturityAction, type MaturityActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "./toaster";

/** With the demo clock ahead (`preview`), the job only reports what it would do on that date. */
export function MaturityJobButton({ preview = false }: { preview?: boolean }) {
  const [state, action, pending] = useActionState<MaturityActionState, FormData>(async (prev) => {
    const r = await runMaturityAction(prev);
    if (r?.error) toast("error", r.error);
    else if (r?.ok) toast("ok", r.ok);
    return r;
  }, null);
  const res = state?.ok ? state.result : undefined;
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : preview ? <Eye aria-hidden /> : <Play aria-hidden />}{" "}
        {pending ? "Running…" : preview ? "Preview maturity job" : "Run maturity job"}
      </Button>
      <span className="text-[11px] text-muted-foreground">{preview ? "At the demo date · nothing is saved" : "Same as GET /api/cron/maturity · daily via Vercel Cron"}</span>
      {res && res.remindersCreated.length > 0 && (
        <div className={cn("max-w-sm rounded-lg border px-3 py-2 text-xs", res.dryRun ? "border-violet-300 bg-violet-50 text-violet-950" : "border-emerald-300 bg-emerald-50 text-emerald-900")}>
          <div className="font-medium">
            {res.remindersCreated.length} reminders {res.dryRun ? "would go out (preview)" : "sent"}
            {res.dryRun && res.statusChanges.length > 0 ? ` · ${res.statusChanges.length} status changes` : ""}
          </div>
          <ul className="mt-1 space-y-0.5">
            {res.remindersCreated.slice(0, 5).map((r) => (
              <li key={r.code + r.kind}>
                {humanize(r.kind)} · <span className="font-mono">{r.code}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
