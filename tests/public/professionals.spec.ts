import { test, expect } from "@playwright/test";
const offers = [
  {
    code: "training",
    title: "برنامه‌سازی تمرینی",
    subtitle: "فقط تمرین",
    features: ["خروجی PDF فارسی", "گزارش بدن"],
    prices: { "1": 2490000, "3": 5990000, "6": 9490000, "12": 14990000 },
    revision: 1,
  },
  {
    code: "nutrition",
    title: "برنامه‌سازی تغذیه",
    subtitle: "فقط تغذیه",
    features: ["منوهای غذایی"],
    prices: { "1": 2790000, "3": 6490000, "6": 10490000, "12": 16490000 },
    revision: 1,
  },
  {
    code: "combined",
    title: "تمرین + تغذیه",
    subtitle: "هر دو",
    features: ["پرونده مشترک"],
    prices: { "1": 3990000, "3": 9490000, "6": 15490000, "12": 25990000 },
    revision: 1,
  },
];
test("public Pro offers load current prices, switch period and fit mobile", async ({
  page,
}, info) => {
  await page.route("**/rest/v1/rpc/pro_offer_catalog", (r) =>
    r.fulfill({ json: offers }),
  );
  await page.goto("/professionals");
  await expect(
    page.getByRole("heading", { name: "پنل شما. انتخاب شما." }),
  ).toBeVisible();
  await expect(page.locator(".professionals-plan")).toHaveCount(3);
  await expect(page.locator(".professionals-plan").first()).toContainText(
    "۲٬۴۹۰٬۰۰۰",
  );
  await page.getByRole("combobox", { name: "مدت اشتراک متخصصین" }).click();
  await page.getByRole("option", { name: "یک ساله", exact: true }).click();
  await expect(page.locator(".professionals-plan").last()).toContainText(
    "۲۵٬۹۹۰٬۰۰۰",
  );
  await expect(page.locator(".professionals-plan").last()).toContainText(
    "تومان / یک ساله",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator("#pro-pricing")
    .screenshot({ path: info.outputPath("professionals-pricing.png") });
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page
    .locator("#pro-pricing")
    .screenshot({ path: info.outputPath("professionals-pricing-dark.png") });
});
test("pricing failure shows retry rather than stale or invented prices", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/rest/v1/rpc/pro_offer_catalog", (r) =>
    r.fulfill(
      fail ? { status: 503, json: { message: "offline" } } : { json: offers },
    ),
  );
  await page.goto("/professionals");
  await expect(page.getByRole("alert")).toContainText(
    "دریافت تعرفه‌ها انجام نشد",
  );
  await expect(page.locator(".professionals-plan")).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "دریافت مجدد" }).click();
  await expect(page.locator(".professionals-plan")).toHaveCount(3);
});
