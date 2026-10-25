// MVP auth: a cookie holding the seeded user's id ("sign in as"). Real auth is Phase 2.
// UI hides what a role can't do; every server action re-checks the role here.
import "server-only";
import type { Role } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "./db";
import { AuthError } from "./errors";

export { AuthError };

export const SESSION_COOKIE = "fdr_uid";

export async function currentUser() {
  const id = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!id) return null;
  return db.user.findUnique({ where: { id }, include: { institution: true, bank: true } });
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
