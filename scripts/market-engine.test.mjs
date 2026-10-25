import assert from "node:assert/strict";
import { installTestNutritionCatalog } from "./setup-test-nutrition-catalog.mjs";
import {
  memberNutrition,
  memberTrainingEligible,
  workoutForDate,
} from "../src/member/nutrition.ts";
import { buildTrainingPlan } from "../src/training/engine.ts";
import { DEFAULT_PROTEIN_ENGINE_POLICY as policy } from "../src/utils/proteinPolicy.ts";
import { generateDailyMealPlan } from "../src/utils/mealPlanEngine.ts";
import { periodOffer } from "../src/member/offers.ts";
import { componentAmount } from "../src/utils/mealPresentation.ts";
installTestNutritionCatalog();
const base = {
  weight: 80,
  height: 178,
  birth_date: "1990-05-15",
  gender: "male",
  activity_level: "moderate",
  goal: "weight_loss",
  weight_loss_speed: "standard",
  body_fat_pct: null,
  body_fat_source: null,
  activity_profile_json: null,
  protein_budget_preference: "balanced",
  medical_conditions_json: {
    conditions: [],
    injuries: "",
    medications: "",
    pregnancyStatus: "not_applicable",
    eatingDisorderStatus: "none",
    safetyScreeningVersion: 1,
    safetyAnswersConfirmed: true,
  },
};
const referenceDate = new Date("2026-10-24T12:00:00Z");
assert.equal(memberTrainingEligible(base, referenceDate), true);
assert.equal(
  memberTrainingEligible({ ...base, birth_date: "2008-10-25" }, referenceDate),
  false,
);
assert.equal(
  memberTrainingEligible({ ...base, birth_date: "2008-10-24" }, referenceDate),
  true,
);
assert.equal(
  memberTrainingEligible({ ...base, birth_date: "1961-10-25" }, referenceDate),
  true,
);
assert.equal(
  memberTrainingEligible({ ...base, birth_date: "1961-10-24" }, referenceDate),
  false,
);
assert.equal(
  memberTrainingEligible({ ...base, birth_date: "invalid" }, referenceDate),
  false,
);
const malePlan = buildTrainingPlan(
  {
    display_name: "عضو آزمایشی",
    gender: "male",
    birth_date: base.birth_date,
    height_cm: base.height,
    weight_kg: base.weight,
    goal: base.goal,
    workout_days: 2,
    medical_conditions: [],
    medications_present: false,
    injuries_present: false,
    pregnancy_status: "not_applicable",
    eating_disorder_status: "none",
    safety_confirmed: true,
    screening_version: 1,
  },
  {
    version: 1,
    location: "home",
    experience: "beginner",
    goal: "general",
    days: [0, 3],
    minutes: 45,
    equipment: ["dumbbells", "stable_platform"],
    start_date: "2026-10-24",
    screening: {
      confirmed: true,
      symptoms: false,
      pain: false,
      restriction: false,
      recent_surgery: false,
    },
  },
  1,
  referenceDate,
);
assert.equal(malePlan.weeks.length, 4);
for (const goal of ["weight_loss", "maintenance", "weight_gain"]) {
  const p = { ...base, goal };
  const rest = memberNutrition(p, policy, false).targets,
    workout = memberNutrition(p, policy, true).targets;
  assert.equal(
    workout.targetCalories - rest.targetCalories,
    goal === "maintenance" ? 150 : 0,
  );
  for (const flag of [false, true]) {
    const t = memberNutrition(p, policy, flag).targets;
    const plan = generateDailyMealPlan(
      t,
      p.weight,
      { vegetarianStatus: "none", allergies: [] },
      flag,
      "2026-10-24",
      { proteinBudgetPreference: "balanced" },
    );
    const kcal = plan.meals.reduce((n, m) => n + m.totalKcal, 0);
    assert(Math.abs(kcal - t.targetCalories) / t.targetCalories < 0.061);
    assert.equal(plan.meals.length, flag ? 7 : 6);
  }
}
assert.equal(workoutForDate("2026-10-24", [0, 2, 4], 3), true);
assert.equal(workoutForDate("2026-10-25", [0, 2, 4], 3), false);
assert.equal(workoutForDate("2026-10-24", [], 0), false);
assert.equal(
  periodOffer({ code: "silver", priceToman: 200001 }, 14).priceToman,
  100001,
);
assert.equal(
  periodOffer({ code: "silver", priceToman: 200001 }, 14).durationDays,
  14,
);
assert.equal(periodOffer({ code: "trial", priceToman: 0 }, 30).durationDays, 3);
assert.match(
  componentAmount({
    foodItem: { id: "soy_chunks", unitLabel: "گرم", preparationState: "dry" },
    grams: 50,
    units: 0.5,
  }),
  /خشک/,
);
assert.match(
  componentAmount({
    foodItem: {
      id: "white_rice_cooked",
      unitLabel: "گرم",
      preparationState: "cooked",
    },
    grams: 150,
    units: 1.5,
  }),
  /پس از پخت/,
);
console.log(
  "PASS shared daily/weekly goals; workout semantics; six/seven-meal arithmetic; schedule weekdays; half-price rounding and fixed trial; raw/cooked labels",
);

const {scannedMeal,parseFoodScanResult}=await import('../src/utils/foodScan.ts');
const dry={catalogId:'soy',preparationState:'dry',source:'manual',name:'سویا',grams:150,kcalPer100:345,proteinPer100:36,carbsPer100:30,fatPer100:9,fiberPer100:10};
const manual=scannedMeal({foods:[dry],confidence:'medium',note:'ثبت دستی'},'lunch','ناهار');
assert.equal(manual.source,'manual');assert.equal(manual.estimated,false);assert.equal(manual.components[0].foodItem.id,'soy');assert.equal(manual.components[0].foodItem.preparationState,'dry');assert.equal(manual.totalKcal,517.5);
assert.equal(parseFoodScanResult({foods:[{...dry,grams:125}],confidence:'low',note:''}).foods[0].grams,125);
const photo=scannedMeal({foods:[{...dry,source:'photo',catalogId:undefined,preparationState:undefined}],confidence:'low',note:''},'lunch','ناهار');assert.equal(photo.estimated,true);assert.equal(photo.source,'food_scan');
console.log('PASS manual food provenance, dry preparation basis, catalog identity, edited weight arithmetic and photo estimate distinction');

const {isMealSkipped}=await import('../src/member/mealStatus.ts');
assert.equal(isMealSkipped('breakfast',['breakfast'],'2026-10-24','2026-10-24'),true);
assert.equal(isMealSkipped('breakfast',['breakfast'],'2026-10-24','2026-10-25'),false);
assert.equal(isMealSkipped('lunch',['breakfast'],'2026-10-24','2026-10-24'),false);
console.log('PASS today skip does not hide tomorrow breakfast');
