import type {
  MacroTargets,
  Meal,
  MealSlot,
  ProteinEnginePolicy,
} from "@/types";
import {
  generateDailyMealPlan,
  getProfessionalMealOptions,
} from "../utils/mealPlanEngine.ts";
import {
  calculateFullNutritionPlanWithTrace,
  type NutritionCalculationTrace,
} from "../utils/nutritionHelpers.ts";
import { intakeEligibility, type CaseIntake } from "./intake.ts";
export interface RealIntake extends CaseIntake {
  display_name: string;
  phone: string;
}
export interface MenuDay {
  workout: boolean;
  targets: MacroTargets;
  trace: NutritionCalculationTrace;
  slots: { slot: MealSlot; label: string; options: Meal[] }[];
}
export interface PrintedPlan {
  version: 1;
  created_at: string;
  date: string;
  display_name: string;
  intake_revision: number;
  requested_menus: number;
  notes: string;
  days: MenuDay[];
}
export function emptyRealIntake(): RealIntake {
  return {
    display_name: "",
    phone: "",
    gender: "female",
    birth_date: "",
    height_cm: 0,
    weight_kg: 0,
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
    safety_confirmed: false,
    screening_version: 1,
  };
}
const fields = ["totalKcal", "totalProtein", "totalCarbs", "totalFat"] as const;
/** Bounds cover EVERY independent combination of the printed options. */
export function menuCombinationsFeasible(
  slots: MenuDay["slots"],
  t: MacroTargets,
): boolean {
  const targets = [t.targetCalories, t.proteinGrams, t.carbGrams, t.fatGrams];
  const bounds = fields.map((f) => ({
    min: slots.reduce((s, x) => s + Math.min(...x.options.map((m) => m[f])), 0),
    max: slots.reduce((s, x) => s + Math.max(...x.options.map((m) => m[f])), 0),
  }));
  const close = bounds
    .slice(1)
    .every(
      (b, i) =>
        b.min >= targets[i + 1] * 0.97 - 1e-6 &&
        b.max <= targets[i + 1] * 1.03 + 1e-6,
    );
  return bounds.every(
    (b, i) =>
      b.min >= targets[i] * (i === 0 ? (close ? 0.94 : 0.95) : 0.9) - 1e-6 &&
      b.max <= targets[i] * (i === 0 ? 1.03 : 1.1) + 1e-6,
  );
}
export function generatePrintedPlan(
  a: RealIntake,
  revision: number,
  count: number,
  policy: ProteinEnginePolicy,
  date: string,
  notes = "",
): PrintedPlan {
  if (!Number.isInteger(count) || count < 1 || count > 4)
    throw new Error("تعداد منو باید بین ۱ تا ۴ باشد.");
  if (!a.display_name.trim() || a.display_name.trim().length > 80 || !revision)
    throw new Error("نام و اطلاعات پرونده را ابتدا ذخیره کنید.");
  const referenceDate = new Date(date + "T12:00:00");
  const eligibility = intakeEligibility(a, referenceDate);
  if (!eligibility.canGenerateAutomaticPlan)
    throw new Error(
      "پرسش‌های ایمنی را کامل کنید؛ تولید برنامه برای اطلاعات فعلی مجاز نیست.",
    );
  const preferences = {
    vegetarianStatus: a.vegetarian_status,
    allergies: a.allergies,
  };
  const days: MenuDay[] = [];
  for (const workout of a.workout_days > 0 ? [false, true] : [false]) {
    const { targets, trace } = calculateFullNutritionPlanWithTrace({
      weightKg: a.weight_kg,
      heightCm: a.height_cm,
      birthDateISO: a.birth_date,
      gender: a.gender,
      activityLevel: a.activity_level,
      goal: a.goal,
      trainingType: a.training_type === "none" ? null : a.training_type,
      proteinBudgetPreference: a.protein_budget,
      proteinPolicy: policy,
      isWorkoutDay: workout,
      referenceDate,
    });
    const base = generateDailyMealPlan(
      targets,
      a.weight_kg,
      preferences,
      workout,
      date,
      { proteinBudgetPreference: a.protein_budget },
    );
    if (base.remainingTargetsUnmet)
      throw new Error("موتور نتوانست برنامه کامل و معتبر بسازد.");
    const slots = base.meals.map((m) => ({
      slot: m.slot,
      label: m.label,
      options: [m],
    }));
    for (const slot of slots) {
      if (count === 1) continue;
      for (const candidate of getProfessionalMealOptions(
        slot.options[0],
        preferences,
        workout,
      )) {
        if (slot.options.length >= count) break;
        if (slot.options.some((m) => m.templateId === candidate.templateId))
          continue;
        slot.options.push(candidate);
        if (!menuCombinationsFeasible(slots, targets)) slot.options.pop();
      }
    }
    if (!menuCombinationsFeasible(slots, targets))
      throw new Error("مجموع منوها با اهداف موتور سازگار نیست.");
    days.push({ workout, targets, trace, slots });
  }
  return {
    version: 1,
    created_at: new Date().toISOString(),
    date,
    display_name: a.display_name.trim(),
    intake_revision: revision,
    requested_menus: count,
    notes: notes.trim().slice(0, 2000),
    days,
  };
}
export const roundFa = (n: number) => Math.round(n).toLocaleString("fa-IR");
export function mealDescription(m: Meal): string {
  return m.components
    .map(
      (c) =>
        c.foodItem.name +
        " " +
        roundFa(c.grams) +
        " گرم" +
        (["گرم", "g", "gram"].includes(c.foodItem.unitLabel.trim())
          ? ""
          : " (" +
            Number(c.units.toFixed(2)).toLocaleString("fa-IR") +
            " " +
            c.foodItem.unitLabel +
            ")"),
    )
    .join(" + ");
}
