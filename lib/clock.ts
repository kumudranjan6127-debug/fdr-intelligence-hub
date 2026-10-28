// Demo clock: in demo mode a viewer can look at the portal as it will be N days from now, to watch
// maturity alerts, unclaimed deposits and SLA breaches appear. The offset lives in a per-browser cookie,
// so one judge moving time does not move it for anyone else. It changes what pages compute, never the
// timestamps of recorded events.

export const DEMO_CLOCK_COOKIE = "demo_clock";
export const MAX_OFFSET_DAYS = 3650;
const DAY_MS = 86_400_000;

/** Whole days, clamped to 0..MAX_OFFSET_DAYS. Anything unreadable is 0 (the real date). */
export function parseOffset(v: string | number | null | undefined): number {
  const n = typeof v === "number" ? v : Number.parseInt(String(v ?? ""), 10);
  if (!Number.isFinite(n)) return 0;
  return Math.min(MAX_OFFSET_DAYS, Math.max(0, Math.trunc(n)));
}

export function shiftedNow(offsetDays: number, real = new Date()): Date {
  return new Date(real.getTime() + parseOffset(offsetDays) * DAY_MS);
}

/** Offset in days that makes `target` (YYYY-MM-DD) today. Dates in the past give 0. */
export function offsetForDate(target: string, real = new Date()): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(target);
  if (!m) return 0;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const today = Date.UTC(real.getUTCFullYear(), real.getUTCMonth(), real.getUTCDate());
  return parseOffset(Math.round((t - today) / DAY_MS));
}
