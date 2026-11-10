import type {MacroTargets,Meal,MealSlot} from '../types/index.ts';
export type ProfessionalMenuSlot={slot:MealSlot;label:string;options:Meal[]};
export const menuNutrients=['totalKcal','totalProtein','totalCarbs','totalFat'] as const;
export const menuTargetVector=(t:MacroTargets)=>[t.targetCalories,t.proteinGrams,t.carbGrams,t.fatGrams];
export function professionalMenuBounds(slots:ProfessionalMenuSlot[]){
 return menuNutrients.map(field=>({min:slots.reduce((n,s)=>n+Math.min(...s.options.map(m=>m[field])),0),max:slots.reduce((n,s)=>n+Math.max(...s.options.map(m=>m[field])),0)}));
}
/** Includes every independent choice of one option from every meal. */
export function professionalMenusFeasible(slots:ProfessionalMenuSlot[],t:MacroTargets):boolean{
 if(!slots.length||slots.some(s=>!s.options.length))return false;
 const target=menuTargetVector(t),bounds=professionalMenuBounds(slots);
 const close=bounds.slice(1).every((b,i)=>b.min>=target[i+1]*.97-1e-6&&b.max<=target[i+1]*1.03+1e-6);
 return bounds.every((b,i)=>b.min>=target[i]*(i===0?(close ? .94 : .95):.9)-1e-6&&b.max<=target[i]*(i===0?1.03:1.1)+1e-6);
}
export function professionalMenuViolation(slots:ProfessionalMenuSlot[],t:MacroTargets):number{
 const target=menuTargetVector(t),bounds=professionalMenuBounds(slots);
 const close=bounds.slice(1).every((b,i)=>b.min>=target[i+1]*.97-1e-6&&b.max<=target[i+1]*1.03+1e-6);
 return bounds.reduce((n,b,i)=>n+Math.max(0,target[i]*(i===0?(close ? .94 : .95):.9)-b.min)/Math.max(1,target[i])+Math.max(0,b.max-target[i]*(i===0?1.03:1.1))/Math.max(1,target[i]),0);
}
