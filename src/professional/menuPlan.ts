import {professionalMenusFeasible} from '../utils/professionalMenuEnvelope.ts';
import type {
  MacroTargets,
  Meal,
  MealSlot,
  ProteinEnginePolicy,
} from "@/types";
import {
  generateDailyMealPlan,
  getProfessionalMealOptions,
  rebalanceProfessionalMenus,
  type MealPlanEngine,
} from "../utils/mealPlanEngine.ts";
import {
  calculateFullNutritionPlanWithTrace,
  type NutritionCalculationTrace,
} from "../utils/nutritionHelpers.ts";
import { proNutritionDraftAllowed, type CaseIntake } from "./intake.ts";
export interface RealIntake extends CaseIntake {
  display_name: string;
  phone: string;
  /** Specialist record only; never an engine allergen filter. */
  custom_allergy_notes?: string;
}
export interface MenuDay {
  workout: boolean;
  targets: MacroTargets;
  trace: NutritionCalculationTrace;
  slots: { slot: MealSlot; label: string; options: Meal[] }[];
}
export interface PrintedPlan {
  menu_contract?:'exact-v2';
  catalog_revision?: string;
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
  return professionalMenusFeasible(slots,t);
}
export const menuIdentity = (meal:Meal) => meal.components.map(c=>c.foodItem.id).sort().join('|');
export class ProMenuCountError extends Error {
  requested:number;
  shortages:{slot:MealSlot;label:string;available:number}[];
  constructor(requested:number,shortages:{slot:MealSlot;label:string;available:number}[]) {
    super('PRO_MENU_COUNT_UNAVAILABLE');this.requested=requested;this.shortages=shortages;
  }
}
/** Select whole option groups together. Greedy per-slot appends can exhaust
 * the day's tolerance before later slots receive their requested options. */
export function selectProfessionalMenus(pools:MenuDay['slots'],targets:MacroTargets,count:number, repair?:(slots:MenuDay['slots'])=>MenuDay['slots']|null):MenuDay['slots']|null {
  const daily=[targets.targetCalories,targets.proteinGrams,targets.carbGrams,targets.fatGrams];
  const vector=(meal:Meal)=>fields.map(f=>meal[f]);
  const bounds=(meals:Meal[])=>({min:fields.map(f=>Math.min(...meals.map(m=>m[f]))),max:fields.map(f=>Math.max(...meals.map(m=>m[f])))});
  const groups=pools.map(pool=>{
    const choices=[...new Map(pool.options.map(meal=>[menuIdentity(meal),meal])).values()];
    const found=new Map<string,{meals:Meal[];min:number[];max:number[]}>();
    for(const anchor of choices.slice(0,80)) {
      const meals=[anchor];
      while(meals.length<count) {
        let best:Meal|undefined,score=Infinity;
        for(const candidate of choices) {
          if(meals.includes(candidate))continue;
          const b=bounds([...meals,candidate]);
          const cost=b.min.reduce((s,x,i)=>s+(b.max[i]-x)/daily[i],0);
          if(cost<score){score=cost;best=candidate;}
        }
        if(!best)break;meals.push(best);
      }
      if(meals.length===count)found.set(meals.map(menuIdentity).sort().join(';'),{meals,...bounds(meals)});
    }
    if(choices.length<=12){
      const visit=(start:number,meals:Meal[])=>{
        if(meals.length===count){found.set(meals.map(menuIdentity).sort().join(';'),{meals,...bounds(meals)});return;}
        for(let i=start;i<=choices.length-(count-meals.length);i++)visit(i+1,[...meals,choices[i]]);
      };
      visit(0,[]);
    }
    return [...found.values()].sort((a,b)=>{
      const cost=(g:typeof a)=>g.min.reduce((n,v,i)=>n+(g.max[i]-v)/daily[i]+.1*Math.abs((g.max[i]+v)/2-vector(pool.options[0])[i])/daily[i],0);
      return cost(a)-cost(b);
    }).slice(0,120);
  });
  if(groups.some(g=>!g.length))return null;
  type State={chosen:number[];min:number[];max:number[];score:number};
  let beam:State[]=[{chosen:[],min:[0,0,0,0],max:[0,0,0,0],score:0}];
  for(let slot=0;slot<groups.length;slot++) {
    const rest=pools.slice(slot+1).map(p=>vector(p.options[0]));
    const reference=fields.map((_,i)=>rest.reduce((s,v)=>s+v[i],0));
    const next:State[]=[];
    for(const state of beam)for(const [index,group] of groups[slot].entries()) {
      const min=state.min.map((n,i)=>n+group.min[i]),max=state.max.map((n,i)=>n+group.max[i]);
      if(!repair && min.some((n,i)=>max[i]-n>daily[i]*(i===0?.09:.20)+1e-6))continue;
      const score=min.reduce((s,n,i)=>s+.2*(max[i]-n)/daily[i]+20*(Math.max(0,daily[i]*(i===0?.94:.9)-n-reference[i])+Math.max(0,max[i]+reference[i]-daily[i]*(i===0?1.03:1.1)))/daily[i]+Math.abs((max[i]+n)/2+reference[i]-daily[i])/daily[i],0);
      next.push({chosen:[...state.chosen,index],min,max,score});
      if(next.length>=20000){next.sort((a,b)=>a.score-b.score);next.length=2500;}
    }
    beam=next.sort((a,b)=>a.score-b.score).slice(0,2500);
    if(!beam.length)return null;
  }
  for(const state of beam) {
    const slots=pools.map((p,i)=>({...p,options:groups[i][state.chosen[i]].meals}));
    if(menuCombinationsFeasible(slots,targets))return slots;
  }
  const repairStates=beam.slice(0,3),seen=new Set<string>();
  for(const state of beam){const key=[state.chosen[0],state.chosen[state.chosen.length-1],...pools.flatMap((p,i)=>p.slot==='post_workout'?[state.chosen[i]]:[])].join(':');if(!seen.has(key)){seen.add(key);repairStates.push(state);}if(repairStates.length>=30)break;}
  if(repair)for(const state of repairStates){
    const fixed=repair(pools.map((p,i)=>({...p,options:groups[i][state.chosen[i]].meals})));
    if(fixed&&menuCombinationsFeasible(fixed,targets))return fixed;
  }
  return null;
}

export function generatePrintedPlan(
  a: RealIntake,
  revision: number,
  count: number,
  policy: ProteinEnginePolicy,
  date: string,
  notes = "",
  engine: Pick<MealPlanEngine, "generateDailyMealPlan" | "getProfessionalMealOptions"> & Partial<Pick<MealPlanEngine,"rebalanceProfessionalMenus">> = { generateDailyMealPlan, getProfessionalMealOptions,rebalanceProfessionalMenus },
): PrintedPlan {
  if (!Number.isInteger(count) || count < 1 || count > 5)
    throw new Error("تعداد منو باید بین ۱ تا ۵ باشد.");
  if (!a.display_name.trim() || a.display_name.trim().length > 80 || !revision)
    throw new Error("نام و اطلاعات پرونده را ابتدا ذخیره کنید.");
  const referenceDate = new Date(date + "T12:00:00");
  if (!proNutritionDraftAllowed(a, referenceDate))
    throw new Error(
      "برای این شرایط از تدوین اختصاصی متخصص استفاده کنید.",
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
    const base = engine.generateDailyMealPlan(
      targets,
      a.weight_kg,
      preferences,
      workout,
      date,
      { proteinBudgetPreference: a.protein_budget },
    );
    if (base.remainingTargetsUnmet)
      throw new Error("موتور نتوانست برنامه کامل و معتبر بسازد.");
    const pools = base.meals.map(m=>({slot:m.slot,label:m.label,options:count===1?[m]:[m,...engine.getProfessionalMealOptions(m,preferences,workout,targets,base.meals.reduce((n,meal)=>n+meal.totalKcal,0))]}));
    const slots = count===1 ? pools : selectProfessionalMenus(pools,targets,count,engine.rebalanceProfessionalMenus?slots=>engine.rebalanceProfessionalMenus!(slots,targets,base.meals,pools):undefined);
    if(!slots)throw new ProMenuCountError(count,pools.map(slot=>({slot:slot.slot,label:slot.label,available:slot.options.length})));
    if(!menuCombinationsFeasible(slots,targets))throw new Error('مجموع منوها با اهداف موتور سازگار نیست.');
    days.push({ workout, targets, trace, slots });
  }
  return {
    version: 1,
    menu_contract:'exact-v2',
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
