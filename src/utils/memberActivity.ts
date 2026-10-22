import type { DailyMealPlan, MacroTargets } from "../types/index.ts";
import { addPlanDays } from "./mealPresentation.ts";
export interface ActivityDay {
  date: string;
  meal_count: number | null;
  kcal: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  target_kcal: number | null;
  targets: MacroTargets | null;
  planned_meals: number | null;
}
export function activityDays(
  rows: ActivityDay[],
  today: string,
  length: number,
  current: DailyMealPlan | null,
) {
  const byDate = new Map(rows.map((r) => [r.date, r]));
  if (current) {
    const consumed = current.meals.filter((m) => m.consumed);
    byDate.set(today, {
      date: today,
      meal_count: consumed.length || null,
      kcal: consumed.length
        ? consumed.reduce((n, m) => n + m.totalKcal, 0)
        : null,
      protein: consumed.length
        ? consumed.reduce((n, m) => n + m.totalProtein, 0)
        : null,
      carbs: consumed.length
        ? consumed.reduce((n, m) => n + m.totalCarbs, 0)
        : null,
      fat: consumed.length
        ? consumed.reduce((n, m) => n + m.totalFat, 0)
        : null,
      target_kcal: current.targets.targetCalories,
      targets: current.targets,
      planned_meals: current.meals.length,
    });
  }
  return Array.from({ length }, (_, i) => {
    const date = addPlanDays(today, i - length + 1);
    return (
      byDate.get(date) ?? {
        date,
        meal_count: null,
        kcal: null,
        protein: null,
        carbs: null,
        fat: null,
        target_kcal: null,
        targets: null,
        planned_meals: null,
      }
    );
  });
}
export function activityTotals(days: ActivityDay[]) {
  const recorded = days.filter(
    (d) =>
      (d.meal_count ?? 0) > 0 &&
      d.kcal !== null &&
      Number.isFinite(Number(d.kcal)),
  );
  return {
    recorded: recorded.length,
    averageKcal: recorded.length
      ? recorded.reduce((n, d) => n + Number(d.kcal), 0) / recorded.length
      : null,
    protein: recorded.reduce((n, d) => n + Number(d.protein ?? 0), 0),
    carbs: recorded.reduce((n, d) => n + Number(d.carbs ?? 0), 0),
    fat: recorded.reduce((n, d) => n + Number(d.fat ?? 0), 0),
    completedDays: recorded.filter(
      (d) => d.planned_meals !== null && d.meal_count! >= d.planned_meals,
    ).length,
  };
}

/** Long ranges remain legible; missing logs never become zero-intake days. */
export function activityBuckets(days:ActivityDay[],size:number) {
 const buckets=[];
 for(let i=0;i<days.length;i+=size){const chunk=days.slice(i,i+size);const recorded=chunk.filter(d=>(d.meal_count??0)>0&&d.kcal!==null&&Number.isFinite(Number(d.kcal)));const targets=recorded.filter(d=>d.target_kcal!==null&&Number(d.target_kcal)>0);
 buckets.push({from:chunk[0].date,to:chunk[chunk.length-1].date,recorded:recorded.length,totalDays:chunk.length,kcal:recorded.length?recorded.reduce((sum,d)=>sum+Number(d.kcal),0)/recorded.length:null,target_kcal:targets.length?targets.reduce((sum,d)=>sum+Number(d.target_kcal),0)/targets.length:null,mealCount:recorded.reduce((sum,d)=>sum+Number(d.meal_count??0),0)});
 }
 return buckets;
}
