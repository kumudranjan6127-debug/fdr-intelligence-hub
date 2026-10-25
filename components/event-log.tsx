import type { Event, User } from "@prisma/client";
import { fmtDateTime, humanize, shortHash } from "@/lib/format";
import { ROLE_LABEL } from "./app-shell";

type Ev = Event & { actor: Pick<User, "name"> | null };

function describe(e: Ev): string {
  const a = e.after as Record<string, unknown> | null;
  const b = e.before as Record<string, unknown> | null;
  if (b?.status && a?.status) return `${humanize(String(b.status))} → ${humanize(String(a.status))}`;
  if (a?.kind && a?.sha256) return `${humanize(String(a.kind))} · ${String(a.filename ?? "")}`;
  if (a?.noc) return String(a.noc);
  if (a?.message) return String(a.message);
  if (a?.engine) return `engine ${String(a.engine)}`;
  if (a?.cell) return humanize(String(a.cell));
  return "";
}

export function EventLog({ events }: { events: Ev[] }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">No events yet.</p>;
  return (
    <ol className="relative space-y-3 border-l pl-4 text-sm">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full border-2 border-background bg-primary/70" aria-hidden />
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{humanize(e.action.replace(/^CASE_/, ""))}</span>
            <span className="text-xs text-muted-foreground">{describe(e)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            {fmtDateTime(e.createdAt)} · {e.actor?.name ?? "System job"} ({ROLE_LABEL[e.actorRole]}) · <span className="font-mono" title={e.sha256}>#{shortHash(e.sha256, 8)}</span>
          </div>
          {e.reason && <div className="mt-0.5 text-xs italic text-muted-foreground">“{e.reason}”</div>}
        </li>
      ))}
    </ol>
  );
}
