import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
const raw = JSON.parse(
  readFileSync(
    new URL(
      "../../scripts/fixtures/nutrition-catalog.fixture.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const catalog = {
  foods: raw.FOOD_ITEMS,
  substitutes: raw.FOOD_SUBSTITUTES,
  mealTemplates: raw.MEAL_TEMPLATES,
  portionRules: raw.PORTION_RULES,
};
const profile = {
  id: "11111111-1111-4111-8111-111111111111",
  display_name: "کاربر آزمایشی",
  phone: "989000000001",
  birth_date: "1992-04-23",
  gender: "male",
  height: 178,
  weight: 85,
  goal: "weight_loss",
  activity_level: "moderate",
  protein_budget_preference: "balanced",
  weight_loss_speed: "standard",
  dietary_preferences_json: { vegetarianStatus: "none", allergies: [] },
  medical_conditions_json: {
    conditions: [],
    injuries: "",
    medications: "",
    pregnancyStatus: "not_applicable",
    eatingDisorderStatus: "none",
    safetyScreeningVersion: 1,
    safetyAnswersConfirmed: true,
  },
  activity_profile_json: {
    version: 2,
    derivedLevel: "moderate",
    trainingType: "resistance",
  },
  body_fat_pct: null,
  body_fat_source: null,
};
test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/src/hooks/useAuth.ts*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `export function useAuth(){return {user:{id:${JSON.stringify(profile.id)}},signOut:async()=>{},loading:false}}`,
    }),
  );
  await page.route("**/src/hooks/useUserProfile.ts*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `const profile=${JSON.stringify(profile)};export function useUserProfile(){return {profile,loading:false,error:null}}`,
    }),
  );
  await page.route("**/src/hooks/useNutritionCatalog.ts*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `import {configureNutritionCatalog} from '/src/utils/mealPlanEngine.ts';const catalog=${JSON.stringify(catalog)};configureNutritionCatalog(catalog);export function useNutritionCatalog(){return {catalog,loading:false,error:null}}`,
    }),
  );
  await page.route("**/src/hooks/useProteinEnginePolicy.ts*", (r) =>
    r.fulfill({
      contentType: "text/javascript",
      body: `import {DEFAULT_PROTEIN_ENGINE_POLICY as policy} from '/src/utils/proteinPolicy.ts';export function useProteinEnginePolicy(){return {policy,loading:false,error:null}}`,
    }),
  );
  const schedule: Record<string, unknown> = {};
  const checkins: Record<string, unknown> = {};
  await page.route("**/rest/v1/**", async (r) => {
    const url = r.request().url(),
      body = r.request().postDataJSON();
    if (url.includes("/rpc/save_member_meal_schedule")) {
      for (const day of body.p_days)
        if (!schedule[day.date] || body.p_replace)
          schedule[day.date] = { plan_date: day.date, plan: day.plan };
      return r.fulfill({ json: Object.values(schedule) });
    }
    if (url.includes("/member_meal_schedule"))
      return r.fulfill({ json: Object.values(schedule) });
    if (url.includes("/daily_meal_checkins")) {
      if (r.request().method() === "POST") checkins[body.meal_slot] = body;
      if (r.request().method() === "DELETE") {
        const slot=new URL(url).searchParams.get('meal_slot')?.replace(/^eq\./,'');
        if(slot)delete checkins[slot];
      }
      return r.fulfill({ json: Object.values(checkins) });
    }
    if (
      url.includes("/rpc/previous_day_meals") ||
      url.includes("/rpc/member_meal_activity") ||
      url.includes("/user_progress_entries")
    )
      return r.fulfill({ json: [] });
    return r.fulfill({ json: null });
  });
  await page.goto("/tests/public/member-harness.html");
  await expect(page.locator("#today-panel .member-meal-card")).toHaveCount(1);
});
test("next meal only, today/week controls, actual food SVG and accessible spotlight", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await expect(page.locator(".energy-dial")).toBeVisible();
  await page.getByRole("button", { name: /بزرگ‌نمایی بشقاب/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.locator("[data-food-id]").count()).toBeGreaterThan(0);
  await dialog.locator(".plate-food-picker button").last().click();
  await expect(dialog.locator(".ingredient-focus")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: /نمایش وعده‌های امروز/ }).click();
  await expect(page.getByRole("dialog").locator(".member-meal-card")).toHaveCount(6);
  await expect(page.locator("#today-panel .member-meal-card")).toHaveCount(1);
  await page.getByRole("button", { name: /نمایش وعده‌های هفته/ }).click();
  await page
    .getByRole("button", { name: "آماده‌سازی و ذخیرهٔ برنامهٔ هفته" })
    .click();
  await expect(page.locator(".week-dates .is-ready")).toHaveCount(7);
  await page.locator(".week-dates button").nth(1).click();
  await expect(page.locator(".week-meal")).toHaveCount(6);
  await page.getByRole("dialog").getByRole("switch").click();
  await expect(page.locator(".week-meal")).toHaveCount(7);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
test("recording advances the next card and progress has missing-data state", async ({
  page,
}) => {
  const firstSlot = await page
    .locator('#today-panel [id^="meal-"]')
    .getAttribute("id");
  await page
    .getByRole("button", { name: "علامت‌گذاری وعده به‌عنوان مصرف‌شده" })
    .click();
  await page.getByRole('dialog',{name:'تأیید ثبت وعده'}).getByRole('button',{name:'بله، ثبت کن'}).click();
  await expect(page.locator("#today-panel .member-meal-card")).toHaveCount(1);
  await expect(page.locator('#today-panel [id^="meal-"]')).not.toHaveAttribute(
    "id",
    firstSlot!,
  );
  await page.getByRole("link", { name: "روند من", exact: true }).click();
  await expect(page.locator(".member-analytics")).toBeVisible();
  await expect(page.locator(".member-stat-grid")).toContainText(
    "۱ روز دارای ثبت",
  );
  await page.getByRole("button", { name: "ماه", exact: true }).click();
  await expect(page.locator(".activity-bars>button")).toHaveCount(6);
});

test("today details stay inline and swapping uses one dialog",async({page})=>{
 await page.getByRole('button',{name:/نمایش وعده‌های امروز/}).click();
 const day=page.getByRole('dialog',{name:'وعده‌های امروز',exact:true});
 const first=day.locator('.member-meal-card').first();
 await first.getByRole('button',{name:/جزئیات/}).click();
 await expect(first.locator('.meal-ingredient-list')).toBeVisible();
 await expect(page.locator('dialog[open]')).toHaveCount(1);
 await first.getByRole('button',{name:/جایگزینی/}).first().click();
 await expect(page.getByRole('dialog',{name:'جایگزینی غذا'})).toBeVisible();
 await expect(page.locator('dialog[open]')).toHaveCount(1);
 await page.keyboard.press('Escape');
 await expect(page.locator('dialog[open]')).toHaveCount(0);
 await expect.poll(()=>page.evaluate(()=>document.body.style.overflow)).not.toBe('hidden');
});

test("recording requires confirmation and cancellation leaves the meal unchanged",async({page})=>{
 let writes=0;
 page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/daily_meal_checkins'))writes++;});
 const slot=await page.locator('#today-panel [id^="meal-"]').getAttribute('id');
 await page.getByRole('button',{name:'علامت‌گذاری وعده به‌عنوان مصرف‌شده'}).click();
 const confirmation=page.getByRole('dialog',{name:'تأیید ثبت وعده'});
 await expect(confirmation).toBeVisible();
 await expect(page.locator('#today-panel [id^="meal-"]')).toHaveAttribute('id',slot!);
 await expect(page.locator('.meal-receipt')).toHaveCount(0);
 expect(writes).toBe(0);
 await confirmation.getByRole('button',{name:'هنوز نخوردم'}).click();
 await expect(confirmation).toHaveCount(0);
 expect(writes).toBe(0);
 await expect(page.locator('#today-panel [id^="meal-"]')).toHaveAttribute('id',slot!);
 await page.getByRole('button',{name:'علامت‌گذاری وعده به‌عنوان مصرف‌شده'}).click();
 await confirmation.getByRole('button',{name:'بله، ثبت کن'}).click();
 await expect(page.locator('.meal-receipt')).toBeVisible();
 expect(writes).toBe(1);
 await page.getByRole('button',{name:'برگردان',exact:true}).click();
 await expect(page.locator('#today-panel [id^="meal-"]')).toHaveAttribute('id',slot!);
 await expect(page.locator('.meal-receipt')).toHaveCount(0);
});

test('a collapsed recorded meal can be restored from the today sheet',async({page})=>{
 await page.getByRole('button',{name:'علامت‌گذاری وعده به‌عنوان مصرف‌شده'}).click();
 await page.getByRole('dialog',{name:'تأیید ثبت وعده'}).getByRole('button',{name:'بله، ثبت کن'}).click();
 await expect(page.locator('.meal-receipt')).toBeVisible();
 await page.getByRole('button',{name:/نمایش وعده‌های امروز/}).click();
 const day=page.getByRole('dialog').filter({has:page.locator('.day-meal-list')});
 const undo=day.locator('.day-meal-undo').first();
 await expect(undo).toBeVisible();
 await undo.click();
 await expect(day.locator('.day-meal-undo')).toHaveCount(0);
 await day.getByRole('button',{name:'بستن',exact:true}).click();
 await page.reload();
 await page.getByRole('button',{name:/نمایش وعده‌های امروز/}).click();
 await expect(page.locator('.day-meal-undo')).toHaveCount(0);
});

test("swapping previews a selection before applying it to the plate",async({page})=>{
 await page.getByRole('button',{name:/بزرگ‌نمایی بشقاب/}).click();
 await page.getByRole('button',{name:/جایگزینی این ماده/}).click();
 const swap=page.getByRole('dialog',{name:'جایگزینی غذا'});
 const alternative=swap.locator('.swap-option-v2:not(:disabled)[aria-pressed=false]').first();
 if(await alternative.count()===0){await expect(swap.getByRole('button',{name:'تأیید جایگزینی'})).toBeDisabled();return;}
 const selectedId=await alternative.getAttribute('data-food-id');
 const previous=await page.locator('#today-panel .food-piece').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-food-id')));
 await alternative.click();
 await expect(swap).toBeVisible();
 expect(await page.locator('#today-panel .food-piece').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-food-id')))).toEqual(previous);
 await swap.getByRole('button',{name:'تأیید جایگزینی'}).click();
 await expect(swap).toHaveCount(0);
 await expect(page.locator('#today-panel .food-piece[data-food-id="'+selectedId+'"]')).toHaveCount(1);
});

test("three-day selection never records a future meal",async({page})=>{
 await expect(page.locator('.companion-days button')).toHaveCount(3);
 await page.locator('.companion-days button').nth(1).click();
 await expect(page.locator('#today-panel .member-meal-card')).toHaveCount(1);
 await expect(page.getByRole('heading',{name:'انرژی این روز'})).toBeVisible();
 await expect(page.locator('#today-panel .meal-consume-button')).toBeDisabled();
 await page.locator('.companion-days button').first().click();
 await expect(page.getByRole('heading',{name:'انرژی امروز'})).toBeVisible();
 await expect(page.locator('#today-panel .meal-consume-button')).toBeEnabled();
});

test('photo result can be corrected and saved as a custom lunch',async({page})=>{
 await page.route('**/functions/v1/food-scan',r=>r.fulfill({json:{confidence:'medium',note:'نتیجهٔ تخمینی برای تست',foods:[{name:'برنج پخته',grams:125,kcalPer100:130,proteinPer100:2.7,carbsPer100:28,fatPer100:.3,fiberPer100:.4}]}}));
 await page.getByRole('button',{name:/غذات رو چک کن/}).click();
 await page.locator('input[type=file]').first().setInputFiles('public/behtan-logo.png');
 await page.locator('.scan-consent input').check();
 await page.getByRole('button',{name:'ارسال برای بررسی',exact:true}).click();
 await page.getByRole('textbox',{name:'وزن برنج پخته'}).fill('۱۵۰');
 await expect(page.locator('.scan-totals')).toContainText('۱۹۵');
 await page.getByRole('combobox',{name:'وعدهٔ ثبت غذا'}).click();
 await page.getByRole('option',{name:'ناهار',exact:true}).click();
 // This scenario replaces lunch; independent extra food is a separate flow.
 await page.getByRole('checkbox',{name:'غذای اضافه؛ وعدهٔ قبلی حفظ شود',exact:true}).uncheck();
 await page.getByRole('button',{name:'این غذا رو خوردم',exact:true}).click();
 await expect(page.locator('.meal-receipt')).toHaveCount(0);
 await page.getByRole('dialog',{name:'تأیید ثبت وعده'}).getByRole('button',{name:'بله، ثبت کن'}).click();
 await expect(page.locator('.meal-receipt')).toContainText('وعدهٔ دلخواه');
 await page.reload();
 await page.getByRole('button',{name:/نمایش وعده‌های امروز/}).click();
 await expect(page.getByRole('dialog').locator('.member-meal-card').filter({hasText:'وعدهٔ دلخواه'})).toContainText('۱۹۵');
});

test('meal rotation keeps working across consecutive clicks without hiding the card',async({page})=>{
 const card=page.locator('#today-panel .member-meal-card');
 const foods=()=>card.locator('.food-piece').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-food-id')).sort().join('|'));
 let previous=await foods();const seen=new Set([previous]);
 for(let i=0;i<12;i++){
  await card.getByRole('button',{name:'تغییر وعده',exact:true}).click();
  await expect.poll(foods).not.toBe(previous);
  await expect(card).toBeVisible();
  await expect(page.getByText('با محدودیت‌های فعلی، منوی متفاوت مناسبی برای این وعده پیدا نشد.',{exact:true})).toHaveCount(0);
  previous=await foods();seen.add(previous);
  if(i===5){await page.reload();await expect(card).toBeVisible();previous=await foods();}
 }
 expect(seen.size).toBeGreaterThan(1);
 await expect(card.locator('.meal-visual-surface')).toHaveCount(1);
 await expect(card.locator('.meal-visual-surface .meal-change-row')).toBeVisible();
});
