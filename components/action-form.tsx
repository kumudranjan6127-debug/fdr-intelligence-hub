"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import type { ActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "./toaster";

type Props = {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  children?: React.ReactNode;
  className?: string;
  hidden?: Record<string, string>;
};

/** Server-action form: result shows as a toast (survives re-render) and errors also inline. */
export function ActionForm({ action, children, className, hidden }: Props) {
  const [state, formAction] = useActionState(async (prev: ActionState, fd: FormData) => {
    const r = await action(prev, fd);
    if (r?.error) toast("error", r.error);
    else if (r?.ok) toast("ok", r.ok);
    return r;
  }, null);
  return (
    <form action={formAction} className={cn("space-y-2", className)}>
      {hidden && Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
      {children}
      {state?.error && (
        <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">
          {state.error}
        </p>
      )}
    </form>
  );
}

type SubmitProps = {
  children: React.ReactNode;
  variant?: "default" | "outline" | "destructive" | "secondary";
  size?: "default" | "sm" | "lg";
  className?: string;
  name?: string;
  value?: string;
};

export function SubmitButton({ children, variant, size, className, name, value }: SubmitProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} size={size} disabled={pending} className={className} name={name} value={value}>
      {pending && <Loader2 className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
