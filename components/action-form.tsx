"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  className?: string;
  hidden?: Record<string, string>;
};

/** Server-action form that shows the action's error or success message inline. */
export function ActionForm({ action, children, className, hidden }: Props) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form action={formAction} className={cn("space-y-2", className)}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">
          {state.error}
        </p>
      )}
      {state?.ok && (
        <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900">
          {state.ok}
        </p>
      )}
    </form>
  );
}

export function SubmitButton({ children, variant, className, name, value }: { children: React.ReactNode; variant?: "default" | "outline" | "destructive" | "secondary"; className?: string; name?: string; value?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} disabled={pending} className={className} name={name} value={value}>
      {pending ? "Working…" : children}
    </Button>
  );
}
