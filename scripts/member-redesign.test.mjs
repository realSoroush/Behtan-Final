import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  foodVisual,
  plateLayout,
  sumPlanIngredients,
  withSwapBaseline,
  swapBaselineComponent,
  nextMealIndex,
  addPlanDays,
  isPresentablePlan,
} from "../src/utils/mealPresentation.ts";
import { activityDays, activityTotals, activityBuckets } from "../src/utils/memberActivity.ts";
import { installTestNutritionCatalog } from "./setup-test-nutrition-catalog.mjs";
import {
  generateDailyMealPlan,
  getSwapOptionsForMeal,
} from "../src/utils/mealPlanEngine.ts";
import { calculateMacros } from "../src/utils/nutritionHelpers.ts";
import { historyOfMeals } from "../src/utils/mealExperience.ts";
const catalog = installTestNutritionCatalog();
for (const food of catalog.foods)
  assert.notEqual(foodVisual(food), "generic", food.id);
assert.equal(foodVisual({ id: "new-food" }), "generic");
assert.equal(foodVisual({ id: "chicken_breast" }), "chicken");
assert.equal(foodVisual({ id: "lean_beef" }), "beef");
assert.equal(foodVisual({ id: "grilled_fish" }), "fish");
assert.equal(addPlanDays("2026-12-31", 1), "2027-01-01");
assert.equal(addPlanDays("2024-02-28", 1), "2024-02-29");
const prefs = { vegetarianStatus: "none", allergies: [] };
const targets = calculateMacros(2100, 85, "weight_loss", 178);
let plan = generateDailyMealPlan(targets, 85, prefs, false, "2026-10-22-v0", {
  proteinBudgetPreference: "balanced",
});
assert(isPresentablePlan(plan));
assert.equal(nextMealIndex(plan.meals), 0);
assert.equal(
  nextMealIndex(plan.meals.map((m, i) => ({ ...m, consumed: i === 0 }))),
  1,
);
assert.equal(
  nextMealIndex(plan.meals.map((m) => ({ ...m, consumed: true }))),
  -1,
);
assert.equal(isPresentablePlan({ meals: [] }), false);
const savedBaseline=JSON.parse(JSON.stringify(withSwapBaseline({...plan,meals:plan.meals.map((m,i)=>i===0?{...m,components:[...m.components].reverse()}:m)},plan)));
assert.equal(swapBaselineComponent(savedBaseline,plan.meals[0].slot,0).foodItem.id,plan.meals[0].components[0].foodItem.id,'Reloading a saved swap keeps the initial equivalence baseline');
let testedSwaps = 0;
for (const meal of plan.meals)
  for (let i = 0; i < meal.components.length; i++)
    for (const option of getSwapOptionsForMeal(meal, i, prefs))
      if (option.isEquivalent) {
        assert.equal(
          option.updatedMeal.components[i].foodItem.id,
          option.foodItem.id,
        );
        assert.equal(
          foodVisual(option.updatedMeal.components[i].foodItem),
          foodVisual(option.foodItem),
        );
        testedSwaps++;
      }
for (let i = 1; i < 7; i++) {
  const next = generateDailyMealPlan(
    targets,
    85,
    prefs,
    false,
    addPlanDays("2026-10-22", i) + "-v0",
    {
      previousDay: historyOfMeals(plan.meals),
      proteinBudgetPreference: "balanced",
    },
  );
  assert(isPresentablePlan(next));
  plan = next;
}
const logged = {
  date: "2026-10-20",
  meal_count: 2,
  kcal: 500,
  protein: 40,
  carbs: 50,
  fat: 15,
  target_kcal: 2100,
  targets,
  planned_meals: 6,
};
let days = activityDays([logged], "2026-10-22", 7, null);
assert.equal(days.length, 7);
assert.equal(days.filter((d) => d.kcal === null).length, 6);
assert.equal(activityTotals(days).averageKcal, 500);
assert.equal(activityTotals(days).completedDays, 0);
days = activityDays([], "2026-10-22", 7, {
  ...plan,
  meals: plan.meals.map((m) => ({ ...m, consumed: false })),
});
assert.equal(activityTotals(days).averageKcal, null);
days = activityDays([], "2026-10-22", 7, {
  ...plan,
  meals: plan.meals.map((m) => ({ ...m, consumed: true })),
});
assert.equal(activityTotals(days).completedDays, 1);
assert.equal(activityTotals(days).recorded, 1);

// Layout remains inside its plate and preserves component indexes for click labels.
for(const meal of plan.meals){const points=plateLayout(meal.components);assert.equal(points.length,meal.components.length);for(const point of points){assert(Number.isFinite(point.x)&&Number.isFinite(point.y));assert(point.x>=70&&point.x<=330);assert(point.y>=70&&point.y<=330);}}
const summed=sumPlanIngredients([plan,plan]);for(const entry of summed){const original=plan.meals.flatMap(m=>m.components).filter(c=>c.foodItem.id===entry.id);assert(Math.abs(entry.grams-original.reduce((n,c)=>n+c.grams,0)*2)<1e-8);}
const missing=activityDays([logged],'2026-10-22',30,null);const groups=activityBuckets(missing,5);assert.equal(groups.length,6);assert.equal(groups.filter(g=>g.kcal!==null).length,1);assert.equal(groups.find(g=>g.kcal!==null).kcal,500);assert.equal(groups.reduce((n,g)=>n+g.totalDays,0),30);
const db = new PGlite();
try {
  await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create function public.billing_has_access() returns boolean language sql stable as $$ select current_setting('request.billing',true)='yes' $$;
 create table public.daily_plan_snapshots(user_id uuid,plan_date date,snapshot jsonb);
 create table public.daily_meal_checkins(user_id uuid,plan_date date,meal_snapshot jsonb);
 grant usage on schema public,auth to authenticated,anon;
 insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022_032_member_planning_and_activity.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const today = (
    await db.query("select to_char(current_date,'YYYY-MM-DD') as date")
  ).rows[0].date;
  const dayPlan = { ...plan, date: today };
  const user1 = "11111111-1111-4111-8111-111111111111",
    user2 = "22222222-2222-4222-8222-222222222222";
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('request.billing','yes',false)",
    [user1],
  );
  await db.exec("set role authenticated");
  const reserve = async (date, key, p, replace = false) =>
    (
      await db.query(
        "select public.save_member_meal_schedule($1,$2,$3::jsonb,$4) as days",
        [today, key, JSON.stringify([{ date, plan: p }]), replace],
      )
    ).rows[0].days;
  let saved = await reserve(today, "context-a", dayPlan);
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].plan, dayPlan);
  const swapped = { ...dayPlan, isWorkoutDay: true };
  assert.equal(
    (await reserve(today, "context-a", swapped))[0].plan.isWorkoutDay,
    dayPlan.isWorkoutDay,
    "Concurrent prepare preserves same-context reservation",
  );
  assert.equal(
    (await reserve(today, "context-a", swapped, true))[0].plan.isWorkoutDay,
    true,
    "Explicit workout/swap replaces saved plan",
  );
  assert.equal(
    (await reserve(today, "context-b", dayPlan))[0].plan.isWorkoutDay,
    dayPlan.isWorkoutDay,
    "New profile/catalog context replaces old plan",
  );
  await assert.rejects(
    db.query("update public.member_meal_schedule set context_key='bad'"),
    /permission denied/,
  );
  await assert.rejects(
    reserve(addPlanDays(today, 7), "context-b", dayPlan),
    /INVALID_PLAN/,
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user2,
  ]);
  await db.exec("set role authenticated");
  assert.equal(
    (await db.query("select * from public.member_meal_schedule")).rows.length,
    0,
    "Second user cannot read first user schedule",
  );
  await db.exec("reset role");
  await db.query(
    "insert into public.daily_plan_snapshots values($1,$2,$3::jsonb),($4,$2,$3::jsonb)",
    [user1, today, JSON.stringify({ targets, plan: dayPlan }), user2],
  );
  await db.query(
    "insert into public.daily_meal_checkins values($1,$2,$3::jsonb),($4,$2,$5::jsonb)",
    [
      user1,
      today,
      JSON.stringify(dayPlan.meals[0]),
      user2,
      JSON.stringify({ ...dayPlan.meals[0], totalKcal: 99999 }),
    ],
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    user1,
  ]);
  await db.exec("set role authenticated");
  const activity = (
    await db.query("select public.member_meal_activity($1,$1) as days", [today])
  ).rows[0].days;
  assert.equal(activity.length, 1);
  assert.equal(activity[0].meal_count, 1);
  assert.equal(
    Number(activity[0].kcal),
    dayPlan.meals[0].totalKcal,
    "Analytics is own logged food, not another user or planned total",
  );
  await db.exec("reset role");
  await db.query("select set_config('request.billing','no',false)");
  await db.exec("set role authenticated");
  await assert.rejects(reserve(today, "context-b", dayPlan), /ACCESS_DENIED/);
  await db.exec("reset role;set role anon");
  await assert.rejects(
    db.query("select public.member_meal_activity($1,$1)", [today]),
    /permission denied/,
  );
  await assert.rejects(
    reserve(today, "context-b", dayPlan),
    /permission denied/,
  );
  console.log(
    `✓ Member redesign: ${catalog.foods.length} food glyph mappings, ${testedSwaps} real swaps, 7 engine days, date rollover, next meal, missing/partial analytics, SQL reservations/context changes, identity isolation and denied unauthorized writes.`,
  );
} finally {
  await db.close();
}
