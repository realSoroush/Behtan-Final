import { test, expect } from "@playwright/test";

const catalog = [
  {
    code: "monthly",
    name: "اشتراک آزمایشی",
    emoji: "",
    price_toman: 320000,
    price_note: "یک ماه",
    duration_days: 30,
    features: ["برنامهٔ غذایی شخصی", "جایگزینی غذا"],
    badge: "انتخاب شما",
    theme: "green",
    sort_order: 1,
    is_active: true,
  },
  {
    code: "free",
    name: "شروع",
    emoji: "",
    price_toman: 0,
    price_note: "آزمایشی",
    duration_days: 3,
    features: ["آشنایی با برنامه"],
    badge: null,
    theme: "silver",
    sort_order: 2,
    is_active: true,
  },
];

test.beforeEach(async ({ page }) => {
  await page.route("**/rest/v1/rpc/public_subscription_catalog", (route) =>
    route.fulfill({ json: catalog }),
  );
  await page.route("**/trustseal.enamad.ir/**", (route) => route.abort());
});

test("landing catalog, examples and keyboard tabs work without changing account data", async ({
  page,
}) => {
  const errors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (
      request.url().includes("/rest/v1/") &&
      !request.url().endsWith("/rpc/public_subscription_catalog") &&
      !["GET", "HEAD", "OPTIONS"].includes(request.method())
    )
      writes.push(request.url());
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "حالِ بهتر",
  );
  await expect(page.locator(".landing-plan")).toHaveCount(2);
  await expect(page.locator(".landing-plan").first()).toContainText("۳۲۰٬۰۰۰");
  await expect(page.locator(".landing-plan").last()).toContainText("رایگان");
  await expect(page.locator(".behtan-landing")).toHaveCSS(
    "font-family",
    /IRANSansX/,
  );
  await expect(page.locator("#hero-done")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.locator("#hero-done").click();
  await expect(page.locator("#hero-done")).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator("#hero-count")).toHaveText("۳ از ۵");
  const panel = page.getByRole("tabpanel");
  await expect(
    panel.getByRole("button", { name: "✓ ثبت شد · لغو ثبت" }),
  ).toHaveAttribute("aria-pressed", "true");
  await panel.getByRole("button").click();
  await expect(page.locator("#hero-done")).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await page.getByRole("tab", { name: "صبحانه" }).click();
  await expect(panel).toContainText("پنیر کم‌چرب");
  await page.getByRole("tab", { name: "صبحانه" }).press("ArrowLeft");
  await expect(page.getByRole("tab", { name: "ناهار" })).toBeFocused();
  await page.getByRole("tab", { name: "ناهار" }).press("End");
  await expect(page.getByRole("tab", { name: "شام" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: "افزایش وزن", exact: false }).click();
  await expect(page.locator(".goal-message")).toContainText("برای افزایش وزن");
  await page
    .getByText("آیا به‌تن جای پزشک یا متخصص تغذیه است؟", { exact: true })
    .click();
  await expect(page.locator("details[open]")).toContainText("خیر");
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("real auth handoff unmounts the wave and keeps the app theme", async ({
  page,
}) => {
  await page.goto("/");
  const theme = await page.evaluate(() => localStorage.getItem("behtan-theme"));
  await page
    .getByRole("button", { name: "ساخت برنامه شخصی ←", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/#auth$/);
  await expect(page.locator(".behtan-landing")).toHaveCount(0);
  await expect(page.locator(".wave-canvas")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("behtan-theme"))).toBe(
    theme,
  );
  await page.goBack();
  await expect(page.locator(".behtan-landing")).toBeVisible();
});

test("catalog errors can be retried without showing invented prices", async ({
  page,
}) => {
  let unavailable = true;
  await page.route("**/rest/v1/rpc/public_subscription_catalog", (route) =>
    route.fulfill(
      unavailable
        ? { status: 503, json: { message: "offline" } }
        : { json: catalog },
    ),
  );
  await page.goto("/");
  await expect(page.locator("#plans").getByRole("alert")).toContainText(
    "دریافت اشتراک‌ها انجام نشد",
  );
  await expect(page.locator(".landing-plan")).toHaveCount(0);
  unavailable = false;
  await page.getByRole("button", { name: "دریافت دوباره" }).click();
  await expect(page.locator(".landing-plan")).toHaveCount(2);
});

test("reduced motion and missing WebGL preserve usable content", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: unknown[]
    ) {
      if (type === "webgl" || type === "webgl2") return null;
      return Reflect.apply(getContext, this, [type, ...args]);
    } as typeof getContext;
  });
  await page.goto("/");
  await expect(page.locator('[data-renderer="canvas2d"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "پخش حرکت‌ها" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".product")).toHaveCSS("transform", "none");
  await expect(page.locator("#plans-title")).toBeVisible();
});

test("mobile navigation opens, closes and reaches the Pro page", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Mobile menu only");
  await page.goto("/");
  await page.getByRole("button", { name: "بازکردن منو" }).click();
  await expect(page.locator("#navlinks")).toBeVisible();
  await page
    .locator("#navlinks")
    .getByRole("link", { name: "اشتراک‌ها" })
    .click();
  await expect(
    page.getByRole("button", { name: "بازکردن منو" }),
  ).toHaveAttribute("aria-expanded", "false");
  await page.getByRole("button", { name: "بازکردن منو" }).click();
  await page
    .locator("#navlinks")
    .getByRole("link", { name: "پنل متخصصین" })
    .click();
  await expect(page).toHaveURL(/\/professionals$/);
});
