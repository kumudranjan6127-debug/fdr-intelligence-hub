// Password hashing and signed session tokens. Pure functions (node:crypto only) so they are unit-tested;
// lib/session.ts wires them to cookies.
import { createHash, createHmac, randomBytes, scryptSync, timingSafeEqual } from "crypto";

const SCRYPT = { N: 16384, r: 8, p: 1, keyLen: 64 };

/** `scrypt$N$r$p$salt$hash` (base64url parts). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, SCRYPT.keyLen, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), hash.toString("base64url")].join("$");
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  const parts = stored?.split("$");
  if (!parts || parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, N, r, p, salt, hash] = parts;
  const expected = Buffer.from(hash, "base64url");
  const actual = scryptSync(password, Buffer.from(salt, "base64url"), expected.length, { N: Number(N), r: Number(r), p: Number(p) });
  return timingSafeEqual(actual, expected);
}

export type SessionPayload = { uid: string; exp: number };

/** `base64url(json).base64url(hmac)`; the HMAC covers the payload, so the user id cannot be swapped. */
export function signSession(payload: SessionPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function readSession(token: string | undefined, secret: string, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const [body, mac] = token.split(".");
  if (!body || !mac) return null;
  const expected = createHmac("sha256", secret).update(body).digest();
  const given = Buffer.from(mac, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as SessionPayload;
    return typeof p.uid === "string" && typeof p.exp === "number" && p.exp > now ? p : null;
  } catch {
    return null;
  }
}

/** SESSION_SECRET when set; otherwise derived from the database URL, which is already a server-only secret. */
export function sessionSecret(env: Record<string, string | undefined> = process.env): string {
  if (env.SESSION_SECRET) return env.SESSION_SECRET;
  const db = env.DATABASE_URL_UNPOOLED ?? env.DATABASE_URL;
  if (!db) throw new Error("SESSION_SECRET (or DATABASE_URL) must be set to sign sessions");
  return createHash("sha256").update(`fdr-session-v1:${db}`).digest("base64url");
}

/** One-click demo sign-in is allowed only when DEMO_MODE=1. Password sign-in always works. */
export function isDemoMode(env: Record<string, string | undefined> = process.env): boolean {
  return env.DEMO_MODE === "1";
}

/** Password the seed gives every demo account. Shown on the sign-in page only in demo mode. */
export function demoPassword(env: Record<string, string | undefined> = process.env): string {
  return env.DEMO_PASSWORD ?? "Demo@26265";
}

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_MINUTES = 15;
export const SESSION_HOURS = 12;
