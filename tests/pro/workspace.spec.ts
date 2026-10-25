import { expect, test } from "@playwright/test";
import { setup } from "./real-fixture";
test("invited owner creates workspace", async ({ page }) => {
  await setup(page, { emptyOrg: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "ساخت فضای کاری", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "پرونده جدید", exact: true }),
  ).toBeVisible();
});
test("new account sees self-service onboarding without workspace data", async ({ page }) => {
  await setup(page, { allowed: false });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "فضای کاری خودت را بساز", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "پرونده جدید", exact: true }),
  ).toHaveCount(0);
});
test("assistant cannot open nutritional intake", async ({ page }) => {
  await setup(page, { role: "assistant" });
  await page.goto("/");
  await expect(
    page.getByText(
      "دسترسی ساخت و مشاهده برنامه برای نقش مالک یا کارشناس فضای کاری فعال است.",
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "پرونده جدید", exact: true }),
  ).toHaveCount(0);
});
test("revocation clears displayed client details on focus", async ({
  page,
}) => {
  const s = await setup(page, { existing: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "نام مراجع", exact: true }),
  ).toHaveValue("مراجع تست");
  s.revoke();
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(
    page.getByText("دسترسی این حساب به پنل فعال نیست.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "فضای کاری خودت را بساز", exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "نام مراجع", exact: true }),
  ).toHaveCount(0);
});
test("mobile and desktop have no horizontal overflow", async ({ page }) => {
  await setup(page, { existing: true });
  await page.goto("/");
  await page
    .getByRole("button", { name: "بازکردن پرونده", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "نام مراجع", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
