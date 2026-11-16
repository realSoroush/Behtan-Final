import type { MacroTargets, Meal } from '../types/index.ts';
import { professionalMenusFeasible, type ProfessionalMenuSlot } from './professionalMenuEnvelope.ts';
import { professionalMenuIdentity, professionalRecipeAllowed } from './professionalMenuPolicy.ts';

type Result = { kind: 'found'; slots: ProfessionalMenuSlot[] } | { kind: 'pool-infeasible' | 'search-limit' };

/** Enumerate distinct groups in the supplied, finite pools. A negative
 * result covers exactly these portions and recipes. Each visited option
 * consumes budget, even if it is rejected for a duplicate identity. */
export function exhaustiveMenuSearch(
  pools: ProfessionalMenuSlot[], targets: MacroTargets, count: number, maxVisits = 4096,
): Result {
  if (!pools.length || count < 1 || !Number.isInteger(count)) return { kind: 'pool-infeasible' };
  const options = pools.map(pool => pool.options
    .filter(meal => meal.slot === pool.slot && professionalRecipeAllowed(meal.components.map(c => c.foodItem)))
    .map(meal => ({ meal, identity: professionalMenuIdentity(meal) })));
  if (options.some(slot => new Set(slot.map(option => option.identity)).size < count ||
    new Set(slot.map(option => option.meal.templateId)).size < count)) return { kind: 'pool-infeasible' };

  let visits = 0;
  const chosen: ProfessionalMenuSlot[] = [];
  const visitSlot = (slotIndex: number): Result => {
    if (slotIndex === pools.length) {
      return professionalMenusFeasible(chosen, targets) ? { kind: 'found', slots: chosen.slice() } : { kind: 'pool-infeasible' };
    }
    const available = options[slotIndex];
    const group: Meal[] = [];
    const identities = new Set<string>();
    const templates = new Set<string>();
    const visitGroup = (start: number): Result => {
      if (group.length === count) {
        chosen.push({ ...pools[slotIndex], options: group.slice() });
        const result = visitSlot(slotIndex + 1);
        chosen.pop();
        return result;
      }
      for (let i = start; i <= available.length - (count - group.length); i++) {
        if (visits >= maxVisits) return { kind: 'search-limit' };
        visits++;
        const { meal, identity } = available[i];
        if (identities.has(identity) || templates.has(meal.templateId)) continue;
        group.push(meal);
        identities.add(identity);
        templates.add(meal.templateId);
        const result = visitGroup(i + 1);
        group.pop();
        identities.delete(identity);
        templates.delete(meal.templateId);
        if (result.kind !== 'pool-infeasible') return result;
      }
      return { kind: 'pool-infeasible' };
    };
    return visitGroup(0);
  };
  return visitSlot(0);
}
