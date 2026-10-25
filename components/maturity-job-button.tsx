"use client";

import { useActionState } from "react";
import { Loader2, Play } from "lucide-react";
import { runMaturityAction, type MaturityActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/format";
import { toast } from "./toaster";

export function MaturityJobButton() {
  const [state, action, pending] = useActionState<MaturityActionState, FormData>(async (prev) => {
    const r = await runMaturityAction(prev);
    if (r?.error) toast("error", r.error);
    else if (r?.ok) toast("ok", r.ok);
    return r;
  }, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1.5">
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? <Loader2 className="animate-spin" aria-hidden /> : <Play aria-hidden />} {pending ? "Running…" : "Run maturity job"}
      </Button>
      <span className="text-[11px] text-muted-foreground">Same as GET /api/cron/maturity · daily via Vercel Cron</span>
      {state?.ok && state.result && state.result.remindersCreated.length > 0 && (
        <div className="max-w-sm rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <div className="font-medium">{state.result.remindersCreated.length} reminders sent</div>
          <ul className="mt-1 space-y-0.5">
            {state.result.remindersCreated.slice(0, 5).map((r) => (
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
