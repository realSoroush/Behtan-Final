import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { installTestNutritionCatalog } from "./setup-test-nutrition-catalog.mjs";
import { DEFAULT_PROTEIN_ENGINE_POLICY as policy } from "../src/utils/proteinPolicy.ts";
import {
  emptyRealIntake,
  generatePrintedPlan,
  menuCombinationsFeasible,
} from "../src/professional/menuPlan.ts";
import { printedPlanHtml } from "../src/professional/printPlan.ts";
installTestNutritionCatalog();
export const intake = {
  ...emptyRealIntake(),
  display_name: "مراجع آزمایشی",
  birth_date: "1992-04-23",
  height_cm: 165,
  weight_kg: 75,
  safety_confirmed: true,
};
let cases = 0;
for (const variant of [
  {},
  {
    gender: "male",
    pregnancy_status: "not_applicable",
    height_cm: 180,
    weight_kg: 85,
    activity_level: "moderate",
    workout_days: 3,
    training_type: "resistance",
  },
  { allergies: ["dairy"] },
  { vegetarian_status: "vegan" },
]) {
  const a = { ...intake, ...variant };
  const p = generatePrintedPlan(a, 1, 4, policy, "2026-10-21");
  assert.equal(p.days.length, a.workout_days ? 2 : 1);
  for (const day of p.days) {
    assert(menuCombinationsFeasible(day.slots, day.targets));
    for (const slot of day.slots) {
      assert(slot.options.length >= 1 && slot.options.length <= 4);
      assert.equal(
        new Set(slot.options.map((m) => m.templateId)).size,
        slot.options.length,
      );
      for (const meal of slot.options) {
        for (const c of meal.components) {
          assert(c.grams > 0);
          assert(!c.foodItem.allergyFlags.some((x) => a.allergies.includes(x)));
          assert(
            !c.foodItem.excludedForVegetarian.includes(a.vegetarian_status),
          );
        }
        for (const [key, component] of [
          ["totalKcal", "kcal"],
          ["totalProtein", "protein"],
          ["totalCarbs", "carbs"],
          ["totalFat", "fat"],
        ])
          assert(
            Math.abs(
              meal[key] - meal.components.reduce((s, c) => s + c[component], 0),
            ) < 1,
          );
      }
    }
    // Enumerate each independent choice, not just the choices used by generation.
    function visit(i, meals) {
      if (i === day.slots.length) {
        assert(
          menuCombinationsFeasible(
            meals.map((m) => ({ options: [m] })),
            day.targets,
          ),
        );
        cases++;
        return;
      }
      for (const meal of day.slots[i].options) visit(i + 1, [...meals, meal]);
    }
    visit(0, []);
  }
  console.log(
    "Menus",
    a.vegetarian_status,
    a.allergies.join(","),
    p.days
      .map((d) => d.slots.map((s) => s.options.length).join("/"))
      .join(" | "),
  );
}
for (const patch of [
  { safety_confirmed: false },
  { medical_conditions: ["kidney_disease"] },
  { birth_date: "2015-01-01" },
  { display_name: "" },
])
  assert.throws(() =>
    generatePrintedPlan({ ...intake, ...patch }, 1, 4, policy, "2026-10-21"),
  );
for (const count of [0, 5, 1.5])
  assert.throws(() =>
    generatePrintedPlan(intake, 1, count, policy, "2026-10-21"),
  );
const sample = generatePrintedPlan(
  { ...intake, workout_days: 3, training_type: "resistance" },
  1,
  4,
  policy,
  "2026-10-21",
  "از هر وعده فقط یک منو انتخاب شود.",
);
const escaped = printedPlanHtml(
  {
    ...sample,
    display_name: "<script>alert(1)</script>",
    notes: "<img src=x onerror=alert(1)>",
  },
  "http://127.0.0.1:5175",
);
assert(!escaped.includes("<script>"));
assert(escaped.includes("&lt;img"));
mkdirSync("output/pdf", { recursive: true });
writeFileSync("output/pdf/sample-plan.json", JSON.stringify(sample, null, 2));
writeFileSync(
  "output/pdf/sample-plan.html",
  printedPlanHtml(sample, "http://127.0.0.1:5175"),
);
console.log(
  "PASS: " +
    cases +
    " independently selected menu combinations; allergy/diet rules, safety stops, escaping, portions, arithmetic",
);
