import type { Meal } from '../types/index.ts';
import { contentFingerprint } from './planProvenance.ts';
export interface PendingMealConfirmation { meal: Meal; date: string; identity: string }
/** A dialog cannot confirm a changed menu, another date, or another signed-in user. */
export function isCurrentMealConfirmation(pending:PendingMealConfirmation,current:Meal|undefined,date:string,identity:string) {
 return Boolean(current&&!current.consumed&&pending.date===date&&pending.identity===identity&&contentFingerprint(pending.meal)===contentFingerprint(current));
}
