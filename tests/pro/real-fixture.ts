import { generatePrintedPlan } from '../../src/professional/menuPlan.ts';
import { installTestNutritionCatalog } from '../../scripts/setup-test-nutrition-catalog.mjs';
import { DEFAULT_PROTEIN_ENGINE_POLICY } from '../../src/utils/proteinPolicy.ts';
import type { Page } from "@playwright/test";
import { readFileSync } from "node:fs";
const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../scripts/fixtures/nutrition-catalog.fixture.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export const user = "10000000-0000-4000-8000-000000000001",
  org = "20000000-0000-4000-8000-000000000001",
  record = "30000000-0000-4000-8000-000000000001";
const f = fixture as any;
const foods = f.FOOD_ITEMS.map((x: any) => {
  const r = f.PORTION_RULES[x.id];
  return {
    id: x.id,
    name: x.name,
    role: x.role,
    emoji: x.emoji,
    is_active: true,
    unit_label: x.unitLabel,
    grams_per_unit: x.gramsPerUnit,
    kcal_per_unit: x.kcalPerUnit,
    protein_per_unit: x.proteinPerUnit,
    carbs_per_unit: x.carbsPerUnit,
    fat_per_unit: x.fatPerUnit,
    fiber_g_per_unit: x.fiberPerUnit,
    quality_tags: x.qualityTags,
    fruit_veg_grams_per_unit: x.fruitVegGramsPerUnit,
    allergy_flags: x.allergyFlags,
    excluded_for_vegetarian: x.excludedForVegetarian,
    swap_allowed_meals: x.swapAllowedMeals,
    swap_group: x.swapGroup,
    swap_priority: x.swapPriority,
    portion_min_units: r.minUnits,
    portion_typical_units: r.typicalUnits,
    portion_soft_max_units: r.softMaxUnits,
    portion_hard_max_units: r.hardMaxUnits,
    portion_step: r.step,
  };
});
const templates = f.MEAL_TEMPLATES.map((t: any) => ({
  id: t.id,
  slot: t.slot,
  display_name: t.displayName,
  is_workout_day_only: t.isWorkoutDayOnly,
  is_rest_day_only: t.isRestDayOnly,
  max_per_week: t.maxPerWeek,
  restricted_diet_only: t.restrictedDietOnly,
  vegetarian_statuses_only: t.vegetarianStatusesOnly,
  goal_tags: t.goalTags,
  is_active: true,
}));
const slots = f.MEAL_TEMPLATES.flatMap((t: any) =>
  t.slots.map((s: any, i: number) => ({
    template_id: t.id,
    position: i,
    role: s.role,
    primary_food_item_id: s.primaryFoodItemId,
    dynamic_units: s.dynamicUnits,
    fixed_units: s.fixedUnits ?? null,
  })),
);
const policy = {
  id: "default",
  maintenance_no_rt_min: 1.2,
  maintenance_rt_min: 1.4,
  weight_loss_no_rt_min: 1.3,
  weight_loss_rt_min: 1.6,
  weight_gain_no_rt_min: 1.4,
  weight_gain_rt_min: 1.6,
  maintenance_no_rt: 1.4,
  maintenance_rt: 1.6,
  weight_loss_no_rt: 1.6,
  weight_loss_rt: 2,
  weight_gain_no_rt: 1.6,
  weight_gain_rt: 1.7,
  budget_economic_position: 0,
  budget_balanced_position: 0.5,
  budget_performance_position: 1,
  obesity_bmi_threshold: 30,
  reference_bmi: 25,
  excess_weight_fraction: 0.4,
  max_protein_g_per_day: 220,
  max_protein_calorie_fraction: 0.35,
  fat_calorie_fraction: 0.25,
};
export const base = {
  display_name: "مراجع تست",
  phone: "",
  gender: "female",
  birth_date: "1992-04-23",
  height_cm: 165,
  weight_kg: 75,
  goal: "weight_loss",
  activity_level: "sedentary",
  workout_days: 0,
  training_type: "none",
  protein_budget: "economic",
  vegetarian_status: "none",
  allergies: [],
  medical_conditions: [],
  pregnancy_status: "not_pregnant",
  eating_disorder_status: "none",
  medications_present: false,
  injuries_present: false,
  safety_confirmed: true,
  screening_version: 1,
};
export async function setup(
  page: Page,
  { existing = false, role = "owner", allowed = true, emptyOrg = false } = {},
) {
  const cases: any[] = existing
    ? [
        {
          id: record,
          organization_id: org,
          answers: { ...base },
          display_name: base.display_name,
          phone: "",
          revision: 1,
          updated_at: "2026-10-21T10:00:00Z",
        },
      ]
    : [];
  const versions: any[] = existing
    ? [
        {
          revision: 1,
          answers: { ...base },
          recorded_at: "2026-10-21T10:00:00Z",
        },
      ]
    : [];
  const plans: any[] = [];
  const requests: any[] = [];
  const committed = new Map();
  let writable = true;
  let renewal: {id:string;created_at:string}|null=null;
  let offline = false, failPlan = false, failGeneration = false;
  const draftMap = new Map<string, any>();
  const planMap = new Map<string, any>();
  let fail = false,
    invalid = false,
    stale = false,
    active = allowed;
  const organizations: any[] = emptyOrg
    ? []
    : [{ id: org, name: "فضای کاری تست", mode: "sandbox", status: "active" }];
  await page.addInitScript(
    ({ user }) => {
      const exp = Math.floor(Date.now() / 1000) + 3600;
      localStorage.setItem(
        "sb-pro-test-auth-token",
        JSON.stringify({
          access_token:
            "eyJhbGciOiJIUzI1NiJ9." +
            btoa(JSON.stringify({ sub: user, exp })) +
            ".test",
          refresh_token: "synthetic",
          expires_at: exp,
          token_type: "bearer",
          user: { id: user, phone: "989000000000" },
        }),
      );
      window.print = () => {};
    },
    { user },
  );
  await page.route("https://pro-test.supabase.co/**", async (route) => {
    const req = route.request(),
      u = new URL(req.url()),
      path = u.pathname;
    if (offline) { await route.abort('failed'); return; }
    const b = req.postDataJSON();
    let data: any = [];
    if (path.endsWith("/pro_pilot_status")) data = active;
    else if (path.endsWith("/pro_organizations"))
      data = active ? organizations : [];
    else if (path.endsWith("/pro_create_sandbox_organization")) {
      organizations.push({
        id: org,
        name: "فضای کاری تست",
        mode: "sandbox",
        status: "active",
      });
      data = organizations[0];
    } else if (path.endsWith("/pro_memberships"))
      data = [
        {
          organization_id: org,
          user_id: user,
          roles: [role],
          status: "active",
        },
      ];
    else if(path.endsWith('/pro_workspace_status')) {
      if(!active){await route.fulfill({status:403,json:{message:'PRO_ACCESS_DENIED'}});return;}
      data={can_write:writable,source:'pilot',expires_at:'2026-11-19T00:00:00Z',case_limit:null,case_count:cases.length};
    } else if(path.endsWith('/pro_browse_case_directory')) {
      const found=cases.filter(c=>Boolean(c.archived_at)===Boolean(b.p_archived)&&(!b.p_search||(c.display_name+' '+c.phone).includes(b.p_search)));
      data={rows:found.slice(b.p_page*25,b.p_page*25+25),total:found.length};
    } else if(path.endsWith('/pro_duplicate_cases')){data=[];
    } else if(path.endsWith('/pro_set_case_archived')){const c=cases.find(c=>c.id===b.p_record);c.archived_at=b.p_archived?'2026-10-21T12:00:00Z':null;c.archive_revision=(c.archive_revision??0)+1;data={archived_at:c.archived_at,archive_revision:c.archive_revision};
    } else if(path.endsWith('/pro_subscription_details')){data={can_write:writable,source:'admin',expires_at:'2026-11-19T00:00:00Z',case_limit:200,case_count:cases.length,can_request_renewal:true,history:[],renewal};
    } else if(path.endsWith('/pro_request_renewal')){renewal={id:b.p_key,created_at:'2026-10-21T12:00:00Z'};data=b.p_key;
    } else if(path.endsWith('/pro_browse_case_history')) {
      const items=b.p_kind==='intakes'?versions:plans;
      data={rows:items.slice(b.p_page*10,b.p_page*10+10),total:items.length};
    }
    else if (path.endsWith("/pro_real_cases")) {
      if (u.searchParams.has("id")) {
        if (!active) {
          await route.fulfill({
            status: 403,
            json: { message: "PRO_ACCESS_DENIED" },
          });
          return;
        }
        data = cases[0];
      } else data = active ? cases : [];
    } else if (path.endsWith("/pro_real_intake_versions")) data = versions;
    else if (path.endsWith("/pro_real_plans")) data = plans;
    else if (path.endsWith("/pro_save_real_case")) {
      requests.push(b);
      if (invalid) {
        invalid = false;
        await route.fulfill({
          status: 400,
          json: { message: "PRO_INVALID_INTAKE" },
        });
        return;
      }
      if (stale) {
        await route.fulfill({
          status: 409,
          json: { message: "PRO_STALE_REVISION" },
        });
        return;
      }
      if (!committed.has(b.p_key)) {
        const rev = (cases[0]?.revision || 0) + 1;
        const c = {
          id: record,
          organization_id: org,
          display_name: b.p_answers.display_name,
          phone: b.p_answers.phone,
          answers: b.p_answers,
          revision: rev,
          updated_at: "2026-10-21T11:00:00Z",
        };
        cases.splice(0, 1, c);
        versions.unshift({
          revision: rev,
          answers: b.p_answers,
          recorded_at: c.updated_at,
        });
        committed.set(b.p_key, { id: record, revision: rev });
      }
      if (fail) {
        fail = false;
        await route.abort("failed");
        return;
      }
      data = committed.get(b.p_key);
    } else if (path.endsWith("/pro_save_real_plan")) {
      const id = "40000000-0000-4000-8000-000000000001";
      plans.unshift({
        id,
        intake_revision: b.p_revision,
        plan: b.p_plan,
        recorded_at: "2026-10-21T12:00:00Z",
      });
      data = id;
    } else if (path.endsWith("/food_items")) data = foods;
    else if (path.endsWith("/food_substitutes"))
      data = f.FOOD_SUBSTITUTES.flatMap((g: any) =>
        g.substituteIds.map((id: string) => ({
          food_item_id: g.foodItemId,
          substitute_food_item_id: id,
          is_active: true,
        })),
      );
    else if (path.endsWith("/meal_templates")) data = templates;
    else if (path.endsWith("/meal_template_slots")) data = slots;
    else if (path.endsWith("/nutrition_protein_policy")) data = policy;
    await route.fulfill({ json: data });
  });
  await page.route('**/api/pro-plan', async route => {
    if (offline) { await route.abort('failed'); return; }
    if(route.request().method()==='GET'){await route.fulfill({json:{ready:true,missing:[],scope:'configuration-only'}});return;}
    const b = route.request().postDataJSON();
    if (!active) { await route.fulfill({status:403,json:{error:'PRO_ACCESS_DENIED'}}); return; }
    if (b.action === 'generate') {
      if (!draftMap.has(b.key)) {
        installTestNutritionCatalog();
        draftMap.set(b.key, {draft_id:crypto.randomUUID(),plan:generatePrintedPlan(cases[0].answers,cases[0].revision,b.count,DEFAULT_PROTEIN_ENGINE_POLICY,b.date,b.notes)});
      }
      if (failGeneration) { failGeneration=false; await route.abort('failed'); return; }
      await route.fulfill({json:draftMap.get(b.key)});
    } else {
      const draft=[...draftMap.values()].find(d=>d.draft_id===b.draft);
      if (!draft) { await route.fulfill({status:400,json:{error:'PRO_INVALID_PLAN'}}); return; }
      if (!planMap.has(b.key)) {
        const id=crypto.randomUUID();
        plans.unshift({id,intake_revision:b.revision,plan:draft.plan,recorded_at:'2026-10-21T12:00:00Z'});
        planMap.set(b.key,id);
      }
      if (failPlan) { failPlan=false; await route.abort('failed'); return; }
      await route.fulfill({json:{id:planMap.get(b.key)}});
    }
  });
  return {
    cases,
    expire: () => {writable=false;},
    draftMap,
    network: (value: boolean) => { offline = !value; },
    failPlanNext: () => { failPlan = true; },
    failGenerationNext: () => { failGeneration = true; },
    versions,
    plans,
    requests,
    failNext: () => {
      fail = true;
    },
    invalidNext: () => {
      invalid = true;
    },
    staleNext: () => {
      stale = true;
    },
    revoke: () => {
      active = false;
    },
  };
}
export async function fillNew(page: Page) {
  await page.getByRole("button", { name: "پرونده جدید", exact: true }).click();
  await page
    .getByRole("textbox", { name: "نام مراجع", exact: true })
    .fill("مراجع تست");
  await page.getByLabel("قد (سانتی‌متر)", { exact: true }).fill("165");
  await page
    .getByRole("spinbutton", { name: "وزن (کیلوگرم)", exact: true })
    .fill("75");
  for(const [name,label] of [['سال تولد','۱۳۷۱'],['ماه تولد','اردیبهشت'],['روز تولد','۳']]){await page.getByRole('combobox',{name,exact:true}).click();await page.getByRole('option',{name:label,exact:true}).click();}
  await page.getByRole("tab", { name: "ایمنی پزشکی" }).click();
  await page
    .getByText("پاسخ‌های ثبت‌شده را با مراجع بررسی کردم.", { exact: true })
    .check();
}
