"use client";
// Minimal toast system. Lives in the root layout, so a message survives the re-render after a server action
// (the form that triggered it may unmount once the case moves to its next state).
import { useEffect, useState } from "react";
import { CheckCircle2, X, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Toast = { id: number; kind: "ok" | "error"; text: string };
const listeners = new Set<(t: Toast) => void>();
let seq = 0;

export function toast(kind: Toast["kind"], text: string) {
  const t = { id: ++seq, kind, text };
  listeners.forEach((l) => l(t));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    const add = (t: Toast) => {
      setItems((s) => [...s.slice(-3), t]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== t.id)), t.kind === "error" ? 8000 : 4500);
    };
    listeners.add(add);
    return () => void listeners.delete(add);
  }, []);
  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-end gap-2 sm:inset-x-auto sm:right-6" aria-live="polite">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.kind === "error" ? "alert" : "status"}
          className={cn(
            "pointer-events-auto flex w-full max-w-sm animate-in items-start gap-2.5 rounded-xl border bg-card p-3 text-sm shadow-lg fade-in slide-in-from-bottom-2",
            t.kind === "error" ? "border-red-300" : "border-emerald-300",
          )}
        >
          {t.kind === "error" ? <XCircle className="mt-0.5 size-4 shrink-0 text-red-600" aria-hidden /> : <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />}
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
