import type { Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

/** Read-only lookups in the test database, for ids the UI does not print. */
export const testDb = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });

export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "Demo@26265";

/** One-click demo sign-in (DEMO_MODE=1). */
export async function signInAs(page: Page, name: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.getByRole("button", { name: new RegExp(name) }).first().click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

/** Email + password sign-in through the form. */
export async function signInWithPassword(page: Page, email: string, password: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL((u) => u.pathname !== "/login" || u.search.includes("error="));
}
