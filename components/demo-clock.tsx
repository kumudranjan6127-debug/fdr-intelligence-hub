"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useFormStatus } from "react-dom";
import { CalendarClock, FastForward, Loader2, RotateCcw } from "lucide-react";
import { setDemoClock } from "@/app/actions";
import { cn } from "@/lib/utils";

function useHere() {
  const path = usePathname();
  const q = useSearchParams().toString();
  return q ? `${path}?${q}` : path;
}

function Pending() {
  const { pending } = useFormStatus();
  return pending ? <Loader2 className="size-3.5 animate-spin" aria-label="Moving the clock" /> : null;
}

/** Strip shown on every page while the demo clock is ahead of the real date. */
export function DemoClockBar({ demoDate, realDate, offset, wide }: { demoDate: string; realDate: string; offset: number; wide?: boolean }) {
  const here = useHere();
  return (
    <div className="border-b border-violet-300 bg-violet-50 text-violet-950" role="status">
      <form action={setDemoClock} className={cn("mx-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2 text-sm sm:px-6", wide ? "max-w-350 lg:px-8" : "max-w-6xl")}>
        <input type="hidden" name="next" value={here} />
        <CalendarClock className="size-4 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold">Demo clock:</strong> you are viewing the portal as on <strong className="font-semibold">{demoDate}</strong> (+{offset} days). Today is
          really {realDate}; saved records keep their real dates.
        </span>
        <span className="ml-auto flex items-center gap-1.5">
          <Pending />
          {[30, 90].map((d) => (
            <button key={d} name="add" value={d} className="rounded-md border border-violet-300 bg-white px-2 py-0.5 text-xs font-semibold hover:bg-violet-100">
              +{d} days
            </button>
          ))}
          <button name="reset" value="1" className="inline-flex items-center gap-1 rounded-md bg-violet-700 px-2.5 py-0.5 text-xs font-semibold text-white hover:bg-violet-800">
            <RotateCcw className="size-3" aria-hidden />
            Back to today
          </button>
        </span>
      </form>
    </div>
  );
}

/** The full control, for the demo guide: jump by days, to a date, or back to today. */
export function DemoClockControl({ demoDate, realDate, offset, minDate }: { demoDate: string; realDate: string; offset: number; minDate: string }) {
  const here = useHere();
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-lg border bg-background p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Real date</div>
        <div className="mt-1 text-xl font-bold">{realDate}</div>
        <div className="text-xs text-muted-foreground">Today</div>
      </div>
      <div className={cn("rounded-lg border p-4", offset ? "border-violet-300 bg-violet-50" : "bg-background")}>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Portal date</div>
        <div className="mt-1 text-xl font-bold">{demoDate}</div>
        <div className="text-xs text-muted-foreground">{offset ? `${offset} days ahead` : "Same as the real date"}</div>
      </div>
      <form action={setDemoClock} className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <input type="hidden" name="next" value={here} />
        {[7, 30, 90, 365].map((d) => (
          <button key={d} name="add" value={d} className="inline-flex items-center gap-1 rounded-md border bg-card px-3 py-1.5 text-sm font-semibold hover:bg-muted">
            <FastForward className="size-3.5" aria-hidden />+{d} days
          </button>
        ))}
        <button name="reset" value="1" disabled={!offset} className="inline-flex items-center gap-1 rounded-md border px-3 py-1.5 text-sm font-semibold hover:bg-muted disabled:opacity-50">
          <RotateCcw className="size-3.5" aria-hidden />
          Back to today
        </button>
        <Pending />
      </form>
      <form action={setDemoClock} className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <input type="hidden" name="next" value={here} />
        <label htmlFor="demo-date" className="text-sm font-medium">
          Jump to a date
        </label>
        <input id="demo-date" type="date" name="date" min={minDate} required className="h-9 rounded-md border bg-background px-2 text-sm" />
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90">Go</button>
      </form>
    </div>
  );
}
