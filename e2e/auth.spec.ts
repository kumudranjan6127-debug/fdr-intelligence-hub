import { expect, test } from "@playwright/test";
import { DEMO_PASSWORD, signInAs, signInWithPassword } from "./helpers";

test.describe("sign-in", () => {
  test("a correct password opens the user's workspace", async ({ page }) => {
    await signInWithPassword(page, "dd.regulation@aicte.demo", DEMO_PASSWORD);
    await expect(page).toHaveURL(/\/officer$/);
  });

  test("a wrong password is refused with a generic message", async ({ page }) => {
    await signInWithPassword(page, "dd.regulation@aicte.demo", "not-the-password");
    await expect(page).toHaveURL(/error=invalid/);
    await expect(page.locator("form p[role=alert]")).toHaveText("Email or password is incorrect.");
  });

  test("five failures lock the account, even for the right password", async ({ page }) => {
    for (let i = 0; i < 5; i++) await signInWithPassword(page, "rules.admin@aicte.demo", "wrong");
    await signInWithPassword(page, "rules.admin@aicte.demo", DEMO_PASSWORD);
    await expect(page).toHaveURL(/error=locked/);
  });

  test("a forged or legacy cookie does not sign anyone in", async ({ page, context }) => {
    const forged = `${Buffer.from(JSON.stringify({ uid: "anyone", exp: 9_999_999_999_999 })).toString("base64url")}.forged`;
    await context.addCookies([
      { name: "fdr_session", value: forged, url: "http://localhost:3100" },
      { name: "fdr_uid", value: "anyone", url: "http://localhost:3100" },
    ]);
    await page.goto("/officer");
    await expect(page).toHaveURL(/\/login$/);
  });

  test("the sign-in page exposes no user ids, and demo accounts sign in with one click", async ({ page }) => {
    await page.goto("/login");
    expect(await page.locator('input[name="userId"]').count()).toBe(0);
    await signInAs(page, "Rakesh Tiwari");
    await expect(page).toHaveURL(/\/institution$/);
  });
});
