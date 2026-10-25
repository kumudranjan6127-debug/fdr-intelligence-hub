"use client";

import { useActionState } from "react";
import { Play } from "lucide-react";
import { runMaturityAction, type MaturityActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/format";

export function MaturityJobButton() {
  const [state, action, pending] = useActionState<MaturityActionState, FormData>(runMaturityAction, null);
  return (
    <form action={action} className="flex flex-col items-end gap-1">
      <Button type="submit" variant="outline" disabled={pending}>
        <Play aria-hidden /> {pending ? "Running…" : "Run maturity job"}
      </Button>
      <span className="text-[11px] text-muted-foreground">Same as GET /api/cron/maturity (daily via Vercel Cron)</span>
      {state?.error && <p className="text-xs text-red-800">{state.error}</p>}
      {state?.ok && (
        <div className="max-w-md rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          <div className="font-medium">{state.ok}</div>
          {state.result && state.result.remindersCreated.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {state.result.remindersCreated.slice(0, 6).map((r) => (
                <li key={r.code + r.kind}>
                  {humanize(r.kind)} → {r.code}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </form>
  );
}
