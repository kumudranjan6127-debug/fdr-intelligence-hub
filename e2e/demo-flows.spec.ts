// The five demo flows (README "Demo script") in a real browser, in order, on a freshly seeded database.
import { expect, test } from "@playwright/test";
import { signInAs, testDb } from "./helpers";

test.describe.configure({ mode: "serial" });
test.afterAll(() => testDb.$disconnect());

let newInstrumentId = "";

test("1 · an institution submits and sees the AI-extracted mismatch", async ({ page }) => {
  await signInAs(page, "Rakesh Tiwari");
  await page.goto("/institution/submit");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.fill("#bank", "Bharat Union Bank");
  await page.fill("#no", "BUB2026160022");
  await page.fill("#amt", "5000000");
  await page.fill("#iss", "2026-10-21");
  await page.fill("#mat", "2029-10-21");
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByRole("button", { name: /FDR ₹45 L/ }).click();
  await expect(page.getByText(/Extracted by/).first()).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText("₹45,00,000").first()).toBeVisible();
  await page.getByRole("button", { name: /Review/ }).click();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: /Submit to AICTE/ }).click();
  await page.waitForURL(/\/institution\/instruments\//, { timeout: 90_000 });
  newInstrumentId = page.url().split("/instruments/")[1].split("?")[0];
  await expect(page.getByRole("heading", { name: /FDR Passport/ })).toBeVisible();
});

test("2 · the officer identifies the discrepancy, fetches bank confirmation and asks for clarification", async ({ page }) => {
  const kase = await testDb.case.findFirstOrThrow({ where: { instrumentId: newInstrumentId } });
  await signInAs(page, "Arjun Mehta");
  await expect(page.getByRole("link", { name: kase.code })).toBeVisible();
  await page.goto(`/officer/cases/${kase.id}`);
  await expect(page.getByText(/institution claimed ₹50,00,000 but the document reads ₹45,00,000/).first()).toBeVisible();
  await page.getByRole("button", { name: "Fetch bank confirmation" }).click();
  await expect(page.getByText(/confirmed tier updated/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Sandbox · not bank evidence/).first()).toBeVisible();
  await page.fill("#reason", "Principal on the FDR copy and at the bank is ₹45,00,000; you claimed ₹50,00,000.");
  await page.getByRole("button", { name: "Request clarification" }).click();
  await expect(page.getByText(/Request clarification: recorded/)).toBeVisible();
  await expect.poll(async () => (await testDb.case.findUniqueOrThrow({ where: { id: kase.id } })).status).toBe("CLARIFICATION_REQUIRED");
});

test("3 · the renewal chain X-ray shows the gap, the amount drop and the missing lien", async ({ page }) => {
  await signInAs(page, "Arjun Mehta");
  await page.goto("/dashboard");
  const alert = (institution: RegExp, finding: string | RegExp) => page.getByRole("link").filter({ hasText: institution }).filter({ hasText: finding });
  await expect(alert(/Shivneri/, /47-day gap/)).toBeVisible();
  await expect(alert(/Narmada/, "₹50 L → ₹45 L")).toBeVisible();
  await expect(alert(/Kaveri/, "Lien missing")).toBeVisible();
  await alert(/Shivneri/, /47-day gap/).click();
  await expect(page.getByText("Renewal chain X-ray")).toBeVisible();
  await expect(page.getByText(/47 days without valid cover/)).toBeVisible();
});

test("4 · the maturity job sends reminders, and a second run sends none", async ({ page }) => {
  await signInAs(page, "Arjun Mehta");
  await page.goto("/dashboard");
  const before = await testDb.reminder.count();
  await page.getByRole("button", { name: /Run maturity job/ }).click();
  await expect(page.getByText(/reminders sent/).first()).toBeVisible({ timeout: 120_000 });
  const after = await testDb.reminder.count();
  expect(after).toBeGreaterThan(before);
  await page.reload();
  await page.getByRole("button", { name: /Run maturity job/ }).click();
  await expect(page.getByText(/reminders sent/).first()).toBeVisible({ timeout: 120_000 });
  expect(await testDb.reminder.count()).toBe(after);
});

test("5 · release: legal clears, the authority approves and issues a NOC, anyone verifies it, the bank confirms", async ({ page }) => {
  const k = await testDb.case.findFirstOrThrow({ where: { type: "RELEASE", status: "CLEARANCES_PENDING" } });

  await signInAs(page, "Rohini Kulkarni");
  await page.goto(`/officer/cases/${k.id}`);
  await page.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.getByText("Penalty assessed", { exact: true }).first()).toBeVisible();

  await signInAs(page, "Raghavan");
  await page.goto(`/officer/cases/${k.id}`);
  await page.getByRole("button", { name: "Approve release" }).click();
  await page.getByRole("button", { name: "Issue lien-release NOC" }).click();
  await expect(page.getByText(/^NOC-2026-/).first()).toBeVisible();
  const noc = await testDb.noc.findFirstOrThrow({ where: { caseId: k.id }, orderBy: { issuedAt: "desc" } });

  await page.goto(`/noc/${noc.code}`);
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Download PDF" }).click();
  expect((await download).suggestedFilename()).toBe(`${noc.code}.pdf`);
  const pdf = await page.request.get(`/api/noc/${noc.code}/pdf`);
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");

  await page.context().clearCookies();
  expect((await page.request.get(`/api/noc/${noc.code}/pdf`)).status()).toBe(404);
  await page.goto(`/verify/${noc.code}`);
  await expect(page.getByText("Valid NOC")).toBeVisible();
  await expect(page.getByText(/not a genuine bank confirmation/)).toBeVisible();
  await page.getByRole("button", { name: /Flip one byte/ }).click();
  await expect(page.getByText(/Hash mismatch/)).toBeVisible();

  const revoked = await testDb.noc.findFirstOrThrow({ where: { revokedAt: { not: null } } });
  await page.goto(`/verify/${revoked.code}`);
  await expect(page.getByText(/Revoked NOC/)).toBeVisible();

  await signInAs(page, "Suresh Iyer");
  const confirm = page.getByRole("button", { name: /Confirm lien lifted/ });
  await expect(confirm.first()).toBeVisible();
  await confirm.first().click();
  await expect(page.getByText(/Confirm lien lifted & principal paid: recorded/)).toBeVisible();
  await expect.poll(async () => (await testDb.case.findUniqueOrThrow({ where: { id: k.id } })).status).toBe("CLOSED");
});

test("audit trail re-verifies the whole hash chain", async ({ page }) => {
  await signInAs(page, "Arjun Mehta");
  await page.goto("/audit");
  await expect(page.getByText(/Hash chain intact — all \d+ events re-verified/)).toBeVisible();
});
