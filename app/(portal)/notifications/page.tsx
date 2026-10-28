import Link from "next/link";
import { AlertTriangle, Bell, CheckCircle2, Clock, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/app-shell";
import { EmptyState } from "@/components/ui-kit";
import { fmtDateTime } from "@/lib/format";
import { notificationsFor, type Notice } from "@/lib/services/notifications";
import { homeFor, requirePageUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const TONE: Record<Notice["tone"], { Icon: LucideIcon; cls: string; label: string }> = {
  danger: { Icon: AlertTriangle, cls: "bg-red-50 text-red-700 ring-red-200", label: "Urgent" },
  warn: { Icon: Clock, cls: "bg-amber-50 text-amber-800 ring-amber-200", label: "Action needed" },
  ok: { Icon: CheckCircle2, cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", label: "Done" },
  info: { Icon: Info, cls: "bg-blue-50 text-blue-700 ring-blue-200", label: "Update" },
};

const FILTERS = [
  ["all", "All"],
  ["reminder", "Reminders"],
  ["event", "Case updates"],
] as const;

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const user = await requirePageUser();
  const { show = "all" } = await searchParams;
  const all = await notificationsFor(user, 60);
  const list = show === "all" ? all : all.filter((n) => n.kind === show);
  const week = Date.now() - 7 * 86_400_000;
  const month = Date.now() - 30 * 86_400_000;
  const groups = [
    { label: "Last 7 days", items: list.filter((n) => n.at.getTime() > week) },
    { label: "Earlier this month", items: list.filter((n) => n.at.getTime() <= week && n.at.getTime() > month) },
    { label: "Older", items: list.filter((n) => n.at.getTime() <= month) },
  ].filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        crumbs={[{ label: "Home", href: homeFor(user.role) }, { label: "Notifications" }]}
        title="Notifications"
        subtitle="Maturity reminders from the daily job, and what other people did on your deposits. In-app only in this prototype; email and SMS are roadmap P6."
      />
      <div className="mb-4 flex flex-wrap items-center gap-2" role="group" aria-label="Filter notifications">
        {FILTERS.map(([key, label]) => {
          const n = key === "all" ? all.length : all.filter((x) => x.kind === key).length;
          return (
            <Link
              key={key}
              href={key === "all" ? "/notifications" : `/notifications?show=${key}`}
              aria-current={show === key ? "true" : undefined}
              className={cn("rounded-full border px-3 py-1 text-sm font-medium", show === key ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
            >
              {label} <span className="opacity-70">{n}</span>
            </Link>
          );
        })}
      </div>

      {list.length === 0 ? (
        <div className="card-surface">
          <EmptyState icon={Bell} title="Nothing here yet">Reminders appear 90, 30 and 7 days before a deposit matures, and when a case you follow moves.</EmptyState>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.label} aria-label={g.label}>
              <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                {g.label} <span className="font-medium">· {g.items.length}</span>
              </h2>
              <ol className="card-surface divide-y overflow-hidden">
                {g.items.map((n) => {
                  const tone = TONE[n.tone];
                  const body = (
                    <div className="flex items-start gap-3.5 px-4 py-3.5 sm:px-5">
                      <span className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ring-1", tone.cls)}>
                        <tone.Icon className="size-4" aria-hidden />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                          <span className="font-semibold uppercase tracking-wide">{n.kind === "reminder" ? "Reminder" : tone.label}</span>
                          {n.at.getTime() > week && <span className="rounded-full bg-red-600 px-1.5 py-px text-[10px] font-bold text-white">New</span>}
                        </div>
                        <div className="mt-0.5 font-medium">{n.title}</div>
                        {n.detail && <div className="mt-0.5 truncate text-sm text-muted-foreground">{n.detail}</div>}
                      </div>
                      <time className="shrink-0 text-xs text-muted-foreground" dateTime={n.at.toISOString()}>
                        {fmtDateTime(n.at)}
                      </time>
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.href ? (
                        <Link href={n.href} className="block hover:bg-muted/50">
                          {body}
                        </Link>
                      ) : (
                        body
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
