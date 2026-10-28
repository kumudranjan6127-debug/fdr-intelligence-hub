import "server-only";
import { cookies } from "next/headers";
import { isDemoMode } from "./auth";
import { DEMO_CLOCK_COOKIE, parseOffset, shiftedNow } from "./clock";

/** Days the viewer has moved the demo clock forward (always 0 outside demo mode). */
export async function demoOffsetDays(): Promise<number> {
  if (!isDemoMode()) return 0;
  return parseOffset((await cookies()).get(DEMO_CLOCK_COOKIE)?.value);
}

/** "Now" for computing what a page shows: the real time, plus the demo-clock offset in demo mode. */
export async function appNow(): Promise<Date> {
  return shiftedNow(await demoOffsetDays());
}
