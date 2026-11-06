import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { processMemberMealSchedule, type MemberDayState, type MealScheduleDependencies } from "../../server/member/mealSchedule";
import { DEFAULT_PROTEIN_ENGINE_POLICY } from "../../src/utils/proteinPolicy";
import type { DailyMealPlan, UserProfile } from "../../src/types";
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
const apiRoute = '**/api/member';
const fixtures = new WeakMap<Page, {
  profile: UserProfile;
  catalog: typeof catalog;
  revision: string;
  intakeRevision: number;
  saved: DailyMealPlan[];
  dayReads: number;
  weekReads: number;
  dispatch: (input: unknown) => Promise<unknown>;
}>();

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
      body: `import {DEFAULT_PROTEIN_ENGINE_POLICY as policy} from '/src/utils/proteinPolicy.ts';const catalog=${JSON.stringify(catalog)};export function useNutritionCatalog(){return {catalog,policy,revision:'1',loading:false,error:null}}`,
    }),
  );

  await page.addInitScript(({ id }) => {
    localStorage.setItem("sb-pro-test-auth-token", JSON.stringify({
      access_token: "synthetic-test-token", refresh_token: "synthetic-test-refresh",
      expires_at: 4_000_000_000, user: { id },
    }));
  }, profile);
  const fixture = { profile: profile as unknown as UserProfile, catalog, revision: '1', intakeRevision: 0, dayReads: 0, weekReads: 0,
    saved: [] as DailyMealPlan[], dispatch: (input: unknown): Promise<unknown> => processMemberMealSchedule(profile.id, input, deps) };
  fixtures.set(page, fixture);
  const schedule: Record<string, NonNullable<MemberDayState["schedule"]>> = {};
  const operations = new Map<string, NonNullable<MemberDayState['operation']>>();
  const skipped = new Set<string>();
  let scheduleRevision = 0;
  const checkins: Record<string, { meal_snapshot: unknown }> = {};
  const extras = new Map<string, unknown>();
  const deps: MealScheduleDependencies = {
    read: async (actor, date, requestId) => {
      expect(actor).toBe(profile.id);
      const today = date === '2026-11-04';
      const previous = new Date(Date.parse(date) - 86400000).toISOString().slice(0, 10);
      return {
        profile: fixture.profile, catalog_revision: fixture.revision,
        intake_revision: today ? String(fixture.intakeRevision) : '0',
        schedule: schedule[date] ?? null, previous_plan: schedule[previous]?.plan,
        checkins: today ? Object.fromEntries(Object.entries(checkins).map(([slot, row]) => [slot, row.meal_snapshot])) : {},
        skipped: today ? [...skipped] as MemberDayState['skipped'] : [],
        extras: today ? [...extras.values()] : [], extra_food_ids: today ? [...extras.keys()] : [],
        operation: requestId ? operations.get(requestId) ?? null : null,
      };
    },
    loadContext: async () => ({ revision: fixture.revision, catalog: fixture.catalog, policy: DEFAULT_PROTEIN_ENGINE_POLICY }),
    reserve: async () => true,
    commit: async args => {
      const date = String(args.p_day);
      if ((schedule[date]?.updated_at ?? null) !== args.p_expected_updated_at) throw Error('STALE_PLAN');
      const updated_at = new Date(Date.parse(date) + ++scheduleRevision).toISOString();
      schedule[date] = { plan: args.p_plan, updated_at, context_key: String(args.p_context),
        server_context_key: String(args.p_server_context_key), server_verified: true };
      const result = { plan_date: date, ...schedule[date], intake_revision: args.p_intake_revision };
      fixture.saved.push(args.p_plan as DailyMealPlan);
      operations.set(String(args.p_request_id), { hash: String(args.p_request_hash), result });
      return result;
    },
  };
  await page.route(apiRoute, async route => {
    const { action, input } = route.request().postDataJSON();
    expect(action).toBe('meal_schedule');
    expect(route.request().headers()['authorization']).toBe('Bearer synthetic-test-token');
    expect(input.plan).toBeUndefined();
    if (input.kind === 'read') fixture.dayReads++;
    try { return await route.fulfill({ json: await fixture.dispatch(input) }); }
    catch (error) {
      const code = (error as Error).message;
      return route.fulfill({ status: code.startsWith('STALE_') ? 409 : 422, json: { error: code } });
    }
  });
  await page.route("**/rest/v1/**", async (r) => {
    const url = r.request().url(), body = r.request().postDataJSON();
    if (url.includes("/rpc/save_member_meal_schedule_v3")) throw Error("Browser sent a legacy plan write");
    if (url.includes("/member_meal_schedule")) {
      fixture.weekReads++;
      return r.fulfill({ json: Object.entries(schedule).filter(([date]) => date !== '2026-11-04')
        .map(([plan_date, row]) => ({ plan_date, ...row })) });
    }
    if (url.includes("/member_extra_foods")) {
      fixture.intakeRevision++;
      if (r.request().method() === "POST") extras.set(body.id, body.meal_snapshot);
      else if (r.request().method() === "DELETE") {
        const id = new URL(url).searchParams.get("id")?.replace(/^eq\./, "");
        if (id) extras.delete(id);
      }
      return r.fulfill({ json: null });
    }
    if (url.includes("/member_skipped_meals")) {
      fixture.intakeRevision++;
      if (r.request().method() === "POST") { skipped.add(body.slot); delete checkins[body.slot]; }
      if (r.request().method() === "DELETE") {
        const slot = new URL(url).searchParams.get("slot")?.replace(/^eq\./, "");
        if (slot) skipped.delete(slot);
      }
      return r.fulfill({ json: [...skipped].map(slot => ({ slot })) });
    }
    if (url.includes("/daily_meal_checkins")) {
      fixture.intakeRevision++;
      if (r.request().method() === "POST") { checkins[body.meal_slot] = body; skipped.delete(body.meal_slot); }
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
test('today and normal rotation avoid schedule re-downloads; week loads on demand', async ({ page }) => {
  const fixture = fixtures.get(page)!;
  expect(fixture.weekReads).toBe(0);
  expect(fixture.dayReads).toBe(1);
  const card = page.locator('#today-panel .member-meal-card');
  const before = await card.locator('h3').textContent();
  await card.getByRole('button', { name: 'تغییر وعده', exact: true }).click();
  await expect(card.locator('h3')).not.toHaveText(before!);
  expect(fixture.dayReads).toBe(1);
  expect(fixture.weekReads).toBe(0);

  let finish!: () => void;
  const release = new Promise<void>(resolve => { finish = resolve; });
  await page.route('**/rest/v1/member_meal_schedule?*', async route => {
    await release;
    return route.fallback();
  });
  try {
    await page.getByRole('button', { name: /نمایش وعده‌های امروز/ }).click();
    await page.getByRole('button', { name: /نمایش وعده‌های هفته/ }).click();
    const dialog = page.getByRole('dialog', { name: 'برنامهٔ هفت روز آینده' });
    await expect(dialog.getByRole('status')).toHaveText('در حال دریافت برنامهٔ هفته…');
    await expect(dialog.locator('.app-loading__skeleton')).toBeVisible();
    await expect(card).toBeVisible();
    finish();
    await expect(dialog.getByRole('button', { name: /آماده‌سازی و ذخیرهٔ برنامه/ })).toBeVisible();
    expect(fixture.weekReads).toBe(1);
  } finally { finish(); }
});

test("next meal only, today/week controls, actual food SVG and accessible spotlight", async ({
  page,
}) => {
  test.setTimeout(60_000);
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
  let releaseFirstDay!: () => void;
  const delayed = new Promise<void>(resolve => { releaseFirstDay = resolve; });
  await page.route(apiRoute, async route => {
    const { input } = route.request().postDataJSON();
    if (input.kind === 'generate' && input.date === '2026-11-05') await delayed;
    return route.fallback();
  });
  try {
    await page.getByRole("button", { name: "آماده‌سازی و ذخیرهٔ برنامهٔ هفته" }).click();
    const progress = page.getByRole('progressbar');
    await expect(progress).toHaveAttribute('value', '0');
    await expect(progress).toHaveAttribute('max', '6');
  } finally { releaseFirstDay(); }
  await expect(page.locator(".week-dates .is-ready")).toHaveCount(7, { timeout: 40_000 });
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

test('rotation preserves the displayed plan during transport failure and reuses one intent', async ({ page }) => {
  const card = page.locator('#today-panel .member-meal-card');
  const change = card.getByRole('button', { name: 'تغییر وعده', exact: true });
  const foods = () => card.locator('.food-piece').evaluateAll(nodes => nodes.map(n => n.getAttribute('data-food-id')).join('|'));
  const original = await foods();
  const input: unknown[] = [];
  const fixture = fixtures.get(page)!;
  const prior = fixture.saved.length;
  let finish!: () => void;
  const release = new Promise<void>(resolve => { finish = resolve; });
  await page.route(apiRoute, async route => {
    const request = route.request().postDataJSON().input;
    if (request.kind !== 'rotate') return route.fallback();
    input.push(request);
    if (input.length === 1) {
      await fixture.dispatch(request);
      await release;
      return route.abort('failed');
    }
    return route.fallback();
  });
  await change.click();
  await expect.poll(() => input.length).toBe(1);
  await expect(change).toBeDisabled();
  expect(await foods()).toBe(original);
  finish();
  await expect.poll(foods).not.toBe(original);
  expect(input).toHaveLength(2);
  expect(input[0]).toEqual(input[1]);
  expect(fixture.saved).toHaveLength(prior + 1);
  const saved = await foods();
  await page.reload();
  await expect.poll(foods).toBe(saved);
});

test('a stale intake snapshot rejects a swap and reopening uses the new revision', async ({ page }) => {
  const fixture = fixtures.get(page)!;
  const card = page.locator('#today-panel .member-meal-card');
  await card.getByRole('button', { name: 'تغییر وعده', exact: true }).click();
  await card.getByRole('button', { name: 'جایگزینی نان سنگک', exact: true }).click();
  const swap = page.getByRole('dialog', { name: 'جایگزینی غذا' });
  await swap.locator('.swap-option-v2').first().click();
  const count = fixture.saved.length;
  fixture.intakeRevision++;
  await swap.getByRole('button', { name: 'تأیید جایگزینی' }).click();
  await expect(page.getByRole('button', { name: 'بازکردن نسخهٔ تازه' })).toBeVisible();
  expect(fixture.saved).toHaveLength(count);
  await page.getByRole('button', { name: 'بازکردن نسخهٔ تازه' }).click();
  await card.getByRole('button', { name: 'جایگزینی نان سنگک', exact: true }).click();
  await swap.locator('.swap-option-v2').first().click();
  await swap.getByRole('button', { name: 'تأیید جایگزینی' }).click();
  await expect(swap).toHaveCount(0);
  expect(fixture.saved).toHaveLength(count + 1);
});

test('an empty ingredient replacement records one unavailable result without saving', async ({ page }) => {
  const fixture = fixtures.get(page)!;
  fixture.revision = '2';
  fixture.catalog = { ...catalog, substitutes: [] };
  await page.unroute('**/src/hooks/useNutritionCatalog.ts*');
  await page.route('**/src/hooks/useNutritionCatalog.ts*', route => route.fulfill({
    contentType: 'text/javascript',
    body: `import {DEFAULT_PROTEIN_ENGINE_POLICY as policy} from '/src/utils/proteinPolicy.ts';const catalog=${JSON.stringify({ ...catalog, substitutes: [] })};export function useNutritionCatalog(){return {catalog,policy,revision:'2',loading:false,error:null}}`,
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
  await page.route(apiRoute, route => {
    if (route.request().postDataJSON().input.kind !== 'rotate') return route.fallback();
    return route.fulfill({ status: 409, json: { error: 'STALE_PLAN' } });
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
  const fixture = fixtures.get(page)!;
  fixture.profile = { ...fixture.profile, dietary_preferences_json: diet as UserProfile['dietary_preferences_json'] };
  const prior = fixture.saved.length;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(() => fixture.saved.length).toBeGreaterThan(prior);
  await page.getByRole('link', { name: 'حساب من', exact: true }).click();
  await expect(page.getByRole('region', { name: 'حساسیت‌های غذایی' })).toContainText('کرفس');
});

test('new egg and sesame choices persist with an explicit unknown-data warning', async ({ page }) => {
  let preferences = { vegetarianStatus: 'none', allergies: [] as string[] };
  await page.unroute('**/src/hooks/useUserProfile.ts*');
  await page.route('**/rest/v1/user_profiles?*', route => {
    if (route.request().method() === 'PATCH') {
      preferences = route.request().postDataJSON().dietary_preferences_json;
      expect(preferences.allergies).toEqual(['egg', 'sesame']);
      return route.fulfill({ json: [{ id: profile.id }] });
    }
    return route.fulfill({ json: [{ ...profile, dietary_preferences_json: preferences }] });
  });
  await page.reload();
  await page.getByRole('link', { name: 'حساب من', exact: true }).click();
  const region = page.getByRole('region', { name: 'حساسیت‌های غذایی' });
  await region.getByRole('button', { name: 'ویرایش حساسیت‌ها' }).click();
  const dialog = page.getByRole('dialog', { name: 'ویرایش حساسیت‌های غذایی' });
  await dialog.getByRole('checkbox', { name: 'تخم‌مرغ', exact: true }).check();
  await dialog.getByRole('checkbox', { name: 'کنجد', exact: true }).check();
  await expect(dialog).toContainText('اگر دادهٔ کافی نباشد، ساخت خودکار متوقف می‌شود');
  await dialog.getByRole('button', { name: 'ذخیرهٔ حساسیت‌ها' }).click();
  await expect(region).toContainText('تخم‌مرغ، کنجد');
  await page.reload();
  await page.getByRole('link', { name: 'حساب من', exact: true }).click();
  await expect(region).toContainText('تخم‌مرغ، کنجد');
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
  const fixture = fixtures.get(page)!;
  fixture.profile = changed as unknown as UserProfile;
  const firstNew = fixture.saved.length;
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
  await expect.poll(() => fixture.saved.length).toBeGreaterThan(firstNew);
  for (const plan of fixture.saved.slice(firstNew)) {
    expect(plan.meals.every((m: any) => !m.consumed && !m.source)).toBe(true);
    expect(plan.meals.every((m: any) => m.components.every((c: any) => !c.foodItem.allergyFlags.includes('gluten')))).toBe(true);
  }
  await page.reload();
  await expect(page.locator('#today-panel .member-meal-card')).toBeVisible();
  for (const id of forbidden) await expect(page.locator(`#today-panel [data-food-id="${id}"]`)).toHaveCount(0);
});
