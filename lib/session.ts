// Sessions: an HMAC-signed cookie (lib/auth.ts) naming the user, issued after a password check or, with
// DEMO_MODE=1, a one-click demo sign-in. UI hides what a role can't do; every server action re-checks the role here.
import "server-only";
import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_HOURS, readSession, sessionSecret, signSession } from "./auth";
import { db } from "./db";
import { AuthError } from "./errors";

export { AuthError };

export const SESSION_COOKIE = "fdr_session";

export async function currentUser() {
  const session = readSession((await cookies()).get(SESSION_COOKIE)?.value, sessionSecret());
  if (!session) return null;
  return db.user.findUnique({ where: { id: session.uid }, include: { institution: true, bank: true } });
}

export async function startSession(userId: string) {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  (await cookies()).set(SESSION_COOKIE, signSession({ uid: userId, exp }, sessionSecret()), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    expires: new Date(exp),
  });
}

export async function endSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

export type SessionUser = NonNullable<Awaited<ReturnType<typeof currentUser>>>;

export function homeFor(role: Role): string {
  if (role === "INSTITUTION") return "/institution";
  if (role === "BANK") return "/bank";
  return "/officer";
}

/** For pages: redirect when not signed in or wrong role. */
export async function requirePageUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) redirect("/login");
  if (roles && !roles.includes(u.role)) redirect(homeFor(u.role));
  return u;
}


/** For server actions / route handlers: throw on missing or wrong role. */
export async function requireRole(roles: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new AuthError("Not signed in");
  if (!roles.includes(u.role)) throw new AuthError(`Role ${u.role} may not perform this action`);
  return u;
}
