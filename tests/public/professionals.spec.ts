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
test.beforeEach(async({page})=>{
 await page.route('**/rest/v1/rpc/public_subscription_catalog',r=>r.fulfill({json:[]}));
 await page.route('**/rest/v1/marketing_settings*',r=>r.fulfill({json:{video_url:''}}));
 await page.route('**/rest/v1/marketing_testimonials*',r=>r.fulfill({json:[]}));
 await page.route('**/trustseal.enamad.ir/**',r=>r.abort());
});
test('public Pro offers load current prices, switch period and fit mobile',async({page})=>{
 await page.route('**/rest/v1/rpc/pro_offer_catalog',r=>r.fulfill({json:offers}));
 await page.goto('/professionals');
 await expect(page.locator('#pro-page')).toBeVisible();
 await expect(page.locator('#pro-page h1')).toContainText('کنترل کامل');
 await expect(page.locator('#pro-price-grid .pro-price')).toHaveCount(3);
 await expect(page.locator('#pro-price-grid .pro-price').first()).toContainText('۲٬۴۹۰٬۰۰۰');
 await page.locator('[data-pro-month="12"]').click();
 await expect(page.locator('#pro-price-grid .pro-price').last()).toContainText('۲۵٬۹۹۰٬۰۰۰');
 await expect(page.locator('#pro-price-grid .pro-price').last()).toContainText('۱۲ ماهه');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('pricing failure shows retry rather than stale or invented prices',async({page})=>{
 let fail=true;
 await page.route('**/rest/v1/rpc/pro_offer_catalog',r=>r.fulfill(fail?{status:503,json:{message:'offline'}}:{json:offers}));
 await page.goto('/professionals');
 await expect(page.locator('#pro-price-grid')).toContainText('دریافت اطلاعات ممکن نشد');
 await expect(page.locator('#pro-price-grid .pro-price')).toHaveCount(0);
 fail=false;await page.locator('#pro-price-grid').getByRole('button',{name:'تلاش دوباره'}).click();
 await expect(page.locator('#pro-price-grid .pro-price')).toHaveCount(3);
});
