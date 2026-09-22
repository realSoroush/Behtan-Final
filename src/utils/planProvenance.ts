import {MEAL_POLICY_VERSION} from './mealExperience.ts';
import {AUTOMATIC_CALORIE_POLICY} from './nutritionHelpers.ts';
// Stable content identity for support/reproduction, NOT a signature or proof of
// integrity. Snapshots continue to be marked as browser-generated reports.
export function contentFingerprint(value: unknown): string {
  const canonical=(v:unknown):unknown=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?
    Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b)).map(([k,x])=>[k,canonical(x)])):v;
  const text=JSON.stringify(canonical(value))??'null';let h=2166136261;
  for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}
  return (h>>>0).toString(16).padStart(8,'0');
}
export function buildPlanProvenance(catalog:unknown,proteinPolicy:unknown){
  return {engineVersion:MEAL_POLICY_VERSION,caloriePolicy:{...AUTOMATIC_CALORIE_POLICY},
    catalogFingerprint:contentFingerprint(catalog),proteinPolicyFingerprint:contentFingerprint(proteinPolicy),
    origin:'browser_generated' as const};
}
