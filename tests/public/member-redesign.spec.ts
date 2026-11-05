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
  await page.clock.setFixedTime(new Date("2026-11-04T12:00:00Z"));
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
  const schedule: Record<string, { plan_date: string; plan: unknown; context_key: string; updated_at: string }> = {};
  const skipped = new Set<string>();
  let scheduleRevision = 0;
  const checkins: Record<string, unknown> = {};
  await page.route("**/rest/v1/**", async (r) => {
    const url = r.request().url(),
      body = r.request().postDataJSON();
    if (url.includes("/rpc/save_member_meal_schedule_v3")) {
      for (const day of body.p_days) {
        const existing = schedule[day.date];
        if (!body.p_replace && existing?.context_key === body.p_context) continue;
        if ((existing?.updated_at ?? null) !== day.expected_updated_at)
          return r.fulfill({ status: 400, json: { message: "MEAL_SCHEDULE_CONFLICT", code: "P0001" } });
        schedule[day.date] = { plan_date: day.date, plan: day.plan, context_key: body.p_context, updated_at: String(++scheduleRevision) };
      }
      return r.fulfill({ json: Object.values(schedule) });
    }
    if (url.includes("/member_meal_schedule"))
      return r.fulfill({ json: Object.values(schedule) });
    if (url.includes("/member_skipped_meals")) {
      if (r.request().method() === "POST") skipped.add(body.slot);
      if (r.request().method() === "DELETE") {
        const slot = new URL(url).searchParams.get("slot")?.replace(/^eq\./, "");
        if (slot) skipped.delete(slot);
      }
      return r.fulfill({ json: [...skipped].map(slot => ({ slot })) });
    }
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
 await page.getByRole('button',{name:'تغییر وعده',exact:true}).click();
 await page.getByRole('button',{name:'جایگزینی نان سنگک',exact:true}).click();
 const swap=page.getByRole('dialog',{name:'جایگزینی غذا'});
 const alternative=swap.locator('.swap-option-v2:not(:disabled)[aria-pressed=false]').first();
 await expect(alternative).toBeVisible();
 const selectedId=await alternative.getAttribute('data-food-id');
 const previous=await page.locator('#today-panel .food-piece').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-food-id')));
 await alternative.click();
 await expect(swap).toBeVisible();
 expect(await page.locator('#today-panel .food-piece').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-food-id')))).toEqual(previous);
 await swap.getByRole('button',{name:'تأیید جایگزینی'}).click();
 await expect(swap).toHaveCount(0);
 await expect(page.locator('#today-panel .food-piece[data-food-id="'+selectedId+'"]')).toHaveCount(1);
 await page.reload();
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
  if(i===5){await page.reload();await expect(card).toBeVisible();await expect.poll(foods).toBe(previous);}
 }
 expect(seen.size).toBeGreaterThan(1);
 await expect(card.locator('.meal-visual-surface')).toHaveCount(1);
 await expect(card.locator('.meal-visual-surface .meal-change-row')).toBeVisible();
});

test('rotation keeps the old meal on save failure and survives reload after acknowledgment', async ({ page }) => {
  const card = page.locator('#today-panel .member-meal-card');
  const change = card.getByRole('button', { name: 'تغییر وعده', exact: true });
  const foods = () => card.locator('.food-piece').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-food-id')).join('|'));
  const original = await foods();
  const events: unknown[] = [];
  await page.route('**/rpc/record_product_event', route => {
    const body = route.request().postDataJSON();
    if (body.p_event.startsWith('meal_chang')) {
      events.push({ event: body.p_event, step: body.p_step, source: body.p_source, keys: Object.keys(body).sort() });
    }
    return route.fulfill({ json: null });
  });
  let attempts = 0;
  let finish!: () => void;
  const release = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/rpc/save_member_meal_schedule_v3', async route => {
    if (!route.request().postDataJSON().p_meal_edit) return route.fallback();
    expect(route.request().postDataJSON().p_expected_diet).toEqual(profile.dietary_preferences_json);
    attempts++;
    if (attempts === 1) {
      await release;
      return route.fulfill({ status: 500, json: { message: 'Synthetic save failure' } });
    }
    return route.fallback();
  });
  await change.click();
  await expect.poll(() => attempts).toBe(1);
  await expect(change).toBeDisabled();
  expect(await foods()).toBe(original);
  expect(events).toEqual([]);
  finish();
  await expect(page.getByText('برنامه ذخیره نشد. دوباره تلاش کن.', { exact: true })).toBeVisible();
  expect(await foods()).toBe(original);
  await change.click();
  await expect.poll(foods).not.toBe(original);
  const saved = await foods();
  await expect.poll(() => events).toEqual(['meal_change_save_failed'].map(event => ({
    event, step: null, source: 'app', keys: ['p_event', 'p_id', 'p_session', 'p_source', 'p_step'],
  })));
  await page.reload();
  await expect.poll(foods).toBe(saved);
});


test('an empty ingredient replacement records one unavailable result without saving', async ({ page }) => {
  await page.unroute('**/src/hooks/useNutritionCatalog.ts*');
  await page.route('**/src/hooks/useNutritionCatalog.ts*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `import {configureNutritionCatalog} from '/src/utils/mealPlanEngine.ts';const catalog=${JSON.stringify({ ...catalog, substitutes: [] })};configureNutritionCatalog(catalog);export function useNutritionCatalog(){return {catalog,loading:false,error:null}}`,
  }));
  const events: string[] = [];
  await page.route('**/rpc/record_product_event', route => {
    const event = route.request().postDataJSON().p_event;
    if (event.startsWith('meal_chang')) events.push(event);
    return route.fulfill({ json: null });
  });
  await page.reload();
  await page.getByRole('button', { name: /نمایش وعده‌های امروز/ }).click();
  const first = page.getByRole('dialog', { name: 'وعده‌های امروز', exact: true }).locator('.member-meal-card').first();
  await first.getByRole('button', { name: /جزئیات/ }).click();
  await first.getByRole('button', { name: /جایگزینی/ }).first().click();
  await expect(page.getByRole('dialog', { name: 'جایگزینی غذا' }).locator('.swap-option-v2')).toHaveCount(0);
  await expect.poll(() => events).toEqual(['meal_change_unavailable']);
});

test('skipping requires confirmation and the skipped meal can be restored', async ({ page }) => {
  const card = page.locator('#today-panel .member-meal-card');
  const original = await card.getAttribute('data-meal-slot');
  const skip = card.getByRole('button', { name: 'این وعده را نخوردم' });
  const dialog = page.getByRole('dialog', { name: 'تأیید نخوردن وعده' });
  await skip.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'انصراف' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(card).toHaveAttribute('data-meal-slot', original!);
  await skip.click();
  await dialog.getByRole('button', { name: 'بله، نخوردم' }).click();
  await expect(card).not.toHaveAttribute('data-meal-slot', original!);
  await page.reload();
  await expect(card).not.toHaveAttribute('data-meal-slot', original!);
  await page.getByRole('button', { name: /نمایش وعده‌های امروز/ }).click();
  await page.getByRole('button', { name: 'بازگرداندن به وعده‌های پیش رو' }).click();
  await expect(card).toHaveAttribute('data-meal-slot', original!);
});

test('stale schedule writes keep the displayed meal and ask to reload', async ({ page }) => {
  const card = page.locator('#today-panel .member-meal-card');
  const before = await card.locator('h3').textContent();
  await page.route('**/rpc/save_member_meal_schedule_v3', route => {
    if (!route.request().postDataJSON().p_replace) return route.fallback();
    return route.fulfill({ status: 400, json: { message: 'MEAL_SCHEDULE_CONFLICT', code: 'P0001' } });
  });
  await card.getByRole('button', { name: 'تغییر وعده', exact: true }).click();
  await expect(page.getByRole('button', { name: 'بازکردن نسخهٔ تازه' })).toBeVisible();
  await expect(card.locator('h3')).toHaveText(before!);
});

test('abrupt weight change requests measurement review rather than continuation', async ({ page }) => {
  await page.route('**/rest/v1/user_progress_entries?*', route => route.fulfill({
    json: ['2026-10-23', '2026-10-25', '2026-10-27', '2026-10-30', '2026-11-01', '2026-11-03']
      .map((entry_date, index) => ({entry_date, weight_kg: index < 3 ? 100 : 90, adherence:'mostly', hunger:'comfortable', difficulty:'none'})),
  }));
  await page.getByRole('link', { name: 'روند من', exact: true }).click();
  const review = page.getByRole('region', { name: 'بازبینی هفتگی هدف' });
  await expect(review).toContainText('پیش از نتیجه‌گیری دربارهٔ روند');
  await expect(review).not.toContainText('روند وزن و تجربهٔ اجرای برنامه با ادامهٔ هدف فعلی سازگارند');
});

test('weekly review persists to the account and can retry a failed save', async ({ page }) => {
  await page.route('**/rest/v1/user_progress_entries?*', route => route.fulfill({
    json: ['2026-10-23', '2026-10-25', '2026-10-27', '2026-10-30', '2026-11-01', '2026-11-03']
      .map((entry_date, index) => ({
        entry_date, weight_kg: index < 3 ? 85 : 84.5,
        adherence: index === 5 ? 'mostly' : null,
        hunger: index === 5 ? 'often' : null,
        difficulty: null,
      })),
  }));
  let reviewKey: string | null = null;
  let attempts = 0;
  await page.route('**/rest/v1/member_weekly_review_acknowledgements?*', route => {
    if (route.request().method() === 'POST') {
      if (++attempts === 1) return route.fulfill({ status: 400, json: { message: 'Synthetic save failure' } });
      const body = route.request().postDataJSON();
      expect(body).toEqual({ user_id: profile.id, review_key: expect.stringMatching(/^[0-9a-f]{8}$/) });
      expect(route.request().headers().prefer).toContain('resolution=ignore-duplicates');
      reviewKey = body.review_key;
      return route.fulfill({ status: 201, body: '' });
    }
    const params = new URL(route.request().url()).searchParams;
    expect(params.get('user_id')).toBe(`eq.${profile.id}`);
    return route.fulfill({ json: reviewKey && params.get('review_key') === `eq.${reviewKey}` ? [{ review_key: reviewKey }] : [] });
  });
  await page.getByRole('link', { name: 'روند من', exact: true }).click();
  const review = page.getByRole('region', { name: 'بازبینی هفتگی هدف' });
  await expect(review).toContainText('گرسنگی مکرر ثبت شده');
  await review.getByRole('button', { name: 'مرور پیشنهاد' }).click();
  const dialog = page.getByRole('dialog', { name: 'تأیید مرور هفتگی' });
  await dialog.getByRole('button', { name: 'مرور شد' }).click();
  await expect(dialog.getByRole('alert')).toContainText('تأیید مرور ذخیره نشد');
  await expect(review).not.toContainText('پیشنهاد مرور شد.');
  await dialog.getByRole('button', { name: 'مرور شد' }).click();
  await expect(review).toContainText('پیشنهاد مرور شد.');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('link', { name: 'روند من', exact: true }).click();
  await expect(review).toContainText('پیشنهاد مرور شد.');
  expect(attempts).toBe(2);

  // An acknowledgement from the previous browser-only release is uploaded once.
  const storageKey = `behtan:weekly-review:${profile.id}`;
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value!), { key: storageKey, value: reviewKey });
  reviewKey = null;
  await page.reload();
  await page.getByRole('link', { name: 'روند من', exact: true }).click();
  await expect(review).toContainText('پیشنهاد مرور شد.');
  expect(attempts).toBe(3);
  expect(await page.evaluate(key => localStorage.getItem(key), storageKey)).toBeNull();
});

test('returning to progress reads updated evidence without reloading the app', async ({ page }) => {
  let enoughEntries = false;
  await page.route('**/rest/v1/user_progress_entries?*', route => route.fulfill({
    json: enoughEntries ? ['2026-10-23', '2026-10-25', '2026-10-27', '2026-10-30', '2026-11-01', '2026-11-03']
      .map(entry_date => ({ entry_date, weight_kg: 85, adherence: 'mostly', hunger: 'often', difficulty: null })) : [],
  }));
  await page.route('**/rest/v1/member_weekly_review_acknowledgements?*', route => route.fulfill({ json: [] }));
  await page.getByRole('link', { name: 'روند من', exact: true }).click();
  const review = page.getByRole('region', { name: 'بازبینی هفتگی هدف' });
  await expect(review).toContainText('حداقل سه ثبت وزن');
  await page.getByRole('link', { name: 'برنامهٔ امروز', exact: true }).click();
  enoughEntries = true;
  await page.getByRole('link', { name: 'روند من', exact: true }).click();
  await expect(review).toContainText('گرسنگی مکرر ثبت شده');
});

test('focusing the app refreshes a remotely updated diet before the next save', async ({ page }) => {
  let diet = profile.dietary_preferences_json;
  await page.unroute('**/src/hooks/useUserProfile.ts*');
  await page.route('**/rest/v1/user_profiles?*', route =>
    route.fulfill({ json: [{ ...profile, dietary_preferences_json: diet }] }));
  await page.reload();
  await expect(page.locator('#today-panel .member-meal-card')).toBeVisible();
  diet = { ...diet, allergies: ['celery'] };
  const freshSave = page.waitForRequest(request => request.url().includes('/rpc/save_member_meal_schedule_v3')
    && request.postDataJSON().p_expected_diet?.allergies.includes('celery'));
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await freshSave;
  await page.getByRole('link', { name: 'حساب من', exact: true }).click();
  await expect(page.getByRole('region', { name: 'حساسیت‌های غذایی' })).toContainText('کرفس');
});

test('account saves celery allergy while preserving existing food preferences', async ({ page }) => {
  const existing = { vegetarianStatus: 'pescatarian', allergies: ['dairy'] };
  let preferences = existing;
  await page.unroute('**/src/hooks/useUserProfile.ts*');
  await page.route('**/rest/v1/user_profiles?*', route => {
    if (route.request().method() === 'PATCH') {
      const params = new URL(route.request().url()).searchParams;
      expect(params.get('id')).toBe(`eq.${profile.id}`);
      expect(params.get('dietary_preferences_json')).toBe(`eq.${JSON.stringify(existing)}`);
      preferences = route.request().postDataJSON().dietary_preferences_json;
      expect(preferences).toEqual({ ...existing, allergies: ['dairy', 'celery'] });
      return route.fulfill({ json: [{ id: profile.id }] });
    }
    return route.fulfill({ json: [{ ...profile, dietary_preferences_json: preferences }] });
  });
  await page.reload();
  await page.getByRole('link', { name: 'حساب من', exact: true }).click();
  const allergies = page.getByRole('region', { name: 'حساسیت‌های غذایی' });
  await allergies.getByRole('button', { name: 'ویرایش حساسیت‌ها' }).click();
  const dialog = page.getByRole('dialog', { name: 'ویرایش حساسیت‌های غذایی' });
  await expect(dialog.getByRole('checkbox', { name: 'لبنیات' })).toBeChecked();
  await dialog.getByRole('checkbox', { name: 'کرفس' }).check();
  await dialog.getByRole('button', { name: 'ذخیرهٔ حساسیت‌ها' }).click();
  await expect(allergies).toContainText('لبنیات، کرفس');
  await page.reload();
  await page.getByRole('link', { name: 'حساب من', exact: true }).click();
  await expect(allergies).toContainText('لبنیات، کرفس');
});

test('allergy change keeps consumed history but undo and reopening expose only safe prescriptions', async ({ page }) => {
  await page.getByRole('button', { name: 'تغییر وعده', exact: true }).click();
  await expect(page.locator('#today-panel [data-food-id="sangak_bread"]').first()).toBeVisible();
  let eaten: any;
  page.on('request', request => {
    if (request.method() === 'POST' && request.url().includes('/daily_meal_checkins')) eaten = request.postDataJSON().meal_snapshot;
  });
  await page.getByRole('button', { name: 'علامت‌گذاری وعده به‌عنوان مصرف‌شده' }).click();
  await page.getByRole('dialog', { name: 'تأیید ثبت وعده' }).getByRole('button', { name: 'بله، ثبت کن' }).click();
  await expect(page.locator('.meal-receipt')).toBeVisible();
  expect(eaten.components.some((c: any) => c.foodItem.allergyFlags.includes('gluten'))).toBe(true);
  const changed = { ...profile, dietary_preferences_json: { vegetarianStatus: 'none', allergies: ['gluten'] } };
  await page.route('**/src/hooks/useUserProfile.ts*', route => route.fulfill({ contentType: 'text/javascript',
    body: `const profile=${JSON.stringify(changed)};export function useUserProfile(){return {profile,loading:false,error:null,refetch:async()=>{}}}` }));
  const savedPlans: any[] = [];
  page.on('request', request => {
    if (request.url().includes('/rpc/save_member_meal_schedule_v3')) savedPlans.push(...request.postDataJSON().p_days.map((d: any) => d.plan));
  });
  await page.reload();
  await expect(page.locator('#today-panel .member-meal-card')).toBeVisible();
  await page.getByRole('button', { name: /نمایش وعده‌های امروز/ }).click();
  const day = page.getByRole('dialog', { name: 'وعده‌های امروز', exact: true });
  const historical = day.locator(`[data-meal-slot="${eaten.slot}"]`);
  await expect(historical.locator('.day-meal-undo')).toBeVisible();
  await expect(historical).toContainText(eaten.components[0].foodItem.name);
  await historical.locator('.day-meal-undo').click();
  await expect(historical.locator('.day-meal-undo')).toHaveCount(0);
  const forbidden = raw.FOOD_ITEMS.filter((f: any) => f.allergyFlags.includes('gluten')).map((f: any) => f.id);
  for (const id of forbidden) await expect(historical.locator(`[data-food-id="${id}"]`)).toHaveCount(0);
  await day.getByRole('button', { name: 'بستن', exact: true }).click();
  await expect.poll(() => savedPlans.length).toBeGreaterThan(0);
  for (const plan of savedPlans) {
    expect(plan.meals.every((m: any) => !m.consumed && !m.source)).toBe(true);
    expect(plan.meals.every((m: any) => m.components.every((c: any) => !c.foodItem.allergyFlags.includes('gluten')))).toBe(true);
  }
  await page.reload();
  await expect(page.locator('#today-panel .member-meal-card')).toBeVisible();
  for (const id of forbidden) await expect(page.locator(`#today-panel [data-food-id="${id}"]`)).toHaveCount(0);
});
