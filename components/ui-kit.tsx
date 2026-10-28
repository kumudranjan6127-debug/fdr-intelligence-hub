// Small layout primitives shared by every portal page.
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function Section({
  title,
  icon: Icon,
  description,
  action,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  icon?: LucideIcon;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("card-surface min-w-0", className)}>
      {(title || action) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5">
          <div className="min-w-0">
            {title && (
              <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
                {Icon && <Icon className="size-4 text-primary" aria-hidden />}
                {title}
              </h2>
            )}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

const TONES = {
  navy: "bg-primary/10 text-primary",
  amber: "bg-amber-100 text-amber-800",
  orange: "bg-orange-100 text-orange-800",
  green: "bg-emerald-100 text-emerald-800",
  violet: "bg-violet-100 text-violet-800",
  slate: "bg-slate-100 text-slate-700",
  red: "bg-red-100 text-red-800",
} as const;

export function StatCard({ label, value, hint, icon: Icon, tone = "navy" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon: LucideIcon; tone?: keyof typeof TONES }) {
  return (
    <div className="card-surface flex flex-col items-start gap-2.5 p-3.5 sm:flex-row sm:gap-3.5 sm:p-4">
      <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg sm:size-10", TONES[tone])}>
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}

export function KeyValues({ items, className }: { items: [React.ReactNode, React.ReactNode][]; className?: string }) {
  return (
    <dl className={cn("grid grid-cols-[minmax(0,auto)_1fr] gap-x-4 gap-y-2.5 text-sm", className)}>
      {items.map(([k, v], i) => (
        <div key={i} className="contents">
          <dt className="text-muted-foreground">{k}</dt>
          <dd className="min-w-0 break-words font-medium">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function EmptyState({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <div className="text-sm font-medium">{title}</div>
      {children && <div className="max-w-sm text-xs text-muted-foreground">{children}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-muted", className)} />;
}
