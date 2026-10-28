// The registry, notifications and the judge's demo guide in a real browser.
import { expect, test } from "@playwright/test";
import { signInAs, testDb } from "./helpers";

test.afterAll(() => testDb.$disconnect());

test("the FDR registry reads a plain-words query and exports what it shows as CSV", async ({ page }) => {
  await signInAs(page, "Arjun Mehta");
  await page.goto("/registry");
  await page.getByLabel("Search the registry in plain words").fill("matured and not renewed");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Understood as:")).toBeVisible();
  await expect(page.getByText("Matured", { exact: true }).first()).toBeVisible();
  const shown = await page.locator("tbody tr").count();
  expect(shown).toBeGreaterThan(0);
  const csv = await page.request.get(`/api/registry?q=${encodeURIComponent("matured and not renewed")}`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect((await csv.text()).trim().split("\r\n")).toHaveLength(shown + 1);
});

test("institutions cannot open the registry or its export", async ({ page }) => {
  await signInAs(page, "Rakesh Tiwari");
  await page.goto("/registry");
  await expect(page).toHaveURL(/\/institution$/);
  expect((await page.request.get("/api/registry")).status()).toBe(404);
});

test("notifications list reminders and case updates for the signed-in user", async ({ page }) => {
  await signInAs(page, "Arjun Mehta");
  await page.getByRole("link", { name: /^Notifications/ }).first().click();
  await expect(page.getByRole("heading", { name: "Notifications" })).toBeVisible();
  await expect(page.locator("main ol li").first()).toBeVisible();
});

test("the demo guide signs a judge in and opens the scenario's screen", async ({ page }) => {
  await page.context().clearCookies();
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "Judge's demo guide" })).toBeVisible();
  await page.getByRole("button", { name: /Sign in & open/ }).nth(5).click();
  await expect(page).toHaveURL(/\/registry\?q=/);
  await expect(page.getByRole("heading", { name: "FDR registry" })).toBeVisible();
});
