import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { processMemberMealSchedule } from '../server/member/mealSchedule.ts';
import { TEST_NUTRITION_CATALOG as catalog } from './setup-test-nutrition-catalog.mjs';
import { DEFAULT_PROTEIN_ENGINE_POLICY as policy } from '../src/utils/proteinPolicy.ts';
import { createMealPlanEngine } from '../src/utils/mealPlanEngine.ts';
import { memberProfileContext } from '../src/utils/memberScheduleContext.ts';
import { isPrescriptionPlan } from '../src/utils/mealValidation.ts';

const user = randomUUID();
const date = '2026-11-05';
const state = {
  profile: {
    id: user, weight: 85, height: 178, birth_date: '1992-04-23', gender: 'male', goal: 'weight_loss',
    activity_level: 'moderate', protein_budget_preference: 'balanced', workout_days: 0,
    dietary_preferences_json: { vegetarianStatus: 'none', allergies: [] },
    medical_conditions_json: { conditions: [], medications: '', injuries: '', pregnancyStatus: 'not_applicable',
      eatingDisorderStatus: 'none', safetyScreeningVersion: 1, safetyAnswersConfirmed: true },
  },
  catalog_revision: '8', extra_food_ids: [], intake_revision: '0', schedule: null, previous_plan: null, checkins: {}, skipped: [], extras: [], operation: null,
};
let reads = 0, writes = 0;
const deps = {
  async read(actor, day) {
    reads++;
    assert.equal(actor, user);
    assert.equal(day, date);
    return state;
  },
  async loadContext() { return { revision: '8', catalog, policy }; },
  async reserve(actor) { assert.equal(actor, user); return true; },
  async commit(input) {
    writes++;
    assert.equal(input.p_user, user);
    assert.equal(input.p_intake_revision, state.intake_revision);
    assert.equal(input.p_catalog_revision, '8');
    assert(isPrescriptionPlan(input.p_plan));
    return input;
  },
};
const start = { kind: 'generate', date, requestId: randomUUID(), catalogRevision: '8', intakeRevision: '0',
  expectedUpdatedAt: null, workout: false, regenerate: false };
for (const injected of [{ targets: {} }, { user: randomUUID() }, { plan: {} }, { date: '2026-02-31' }]) {
  await assert.rejects(() => processMemberMealSchedule(user, { ...start, ...injected }, deps), /INVALID_REQUEST|INVALID_MEAL_DATE/);
}
assert.equal(reads, 0);
await assert.rejects(() => processMemberMealSchedule(user, { ...start, intakeRevision: '1' }, deps), /STALE_INTAKE/);
await assert.rejects(() => processMemberMealSchedule(user, { ...start, expectedUpdatedAt: '2026-11-04T09:00:00Z' }, deps), /STALE_PLAN/);
await assert.rejects(() => processMemberMealSchedule(user, { ...start, catalogRevision: '7' }, deps), /STALE_CONTEXT/);
assert.equal(writes, 0);
const original = await processMemberMealSchedule(user, start, deps);
assert.equal(original.p_plan.nutritionContext.revision, '8');
assert(original.p_plan.meals.length >= 6);
state.operation = { hash: original.p_request_hash, result: original };
state.intake_revision = '1';
assert.deepEqual(await processMemberMealSchedule(user, start, deps), original);
await assert.rejects(() => processMemberMealSchedule(user, { ...start, workout: true }, deps), /REQUEST_CONFLICT/);
assert.equal(writes, 1);
state.operation = null;

const base = original.p_plan;
const expectedUpdatedAt = '2026-11-05T08:00:00Z';
state.schedule = { plan: base, updated_at: expectedUpdatedAt, context_key: original.p_context, server_context_key: original.p_server_context_key, server_verified: false };
const edit = { date, requestId: randomUUID(), catalogRevision: '8', intakeRevision: '1', expectedUpdatedAt };
await assert.rejects(() => processMemberMealSchedule(user, { ...edit, kind: 'rotate', slot: 'breakfast' }, deps), /STALE_CONTEXT/);
state.schedule.server_verified = true;
state.schedule.server_context_key = 'stale';
await assert.rejects(() => processMemberMealSchedule(user, { ...edit, kind: 'rotate', slot: 'breakfast' }, deps), /STALE_CONTEXT/);
state.schedule.server_context_key = original.p_server_context_key;
const read = { kind: 'read', date };
const snapshot = await processMemberMealSchedule(user, read, deps);
assert.equal(snapshot.catalogRevision, '8');
assert.equal(snapshot.profileContext, memberProfileContext(state.profile));
assert.equal(snapshot.schedule.server_verified, true);
assert.deepEqual(snapshot.extraFoodIds, []);
assert(!('profile' in snapshot));
state.catalog_revision = '9';
assert.equal((await processMemberMealSchedule(user, read, deps)).schedule.server_verified, false);
state.catalog_revision = '8';
const engine = createMealPlanEngine(catalog);
let swap;
for (const [mealIndex, meal] of base.meals.entries()) {
  for (const [componentIndex] of meal.components.entries()) {
    const option = engine.getMemberSwapOptions(base, mealIndex, componentIndex, state.profile.dietary_preferences_json, { skippedSlots: [], extraMeals: [] })[0];
    if (option) {
      swap = { ...edit, kind: 'swap', slot: meal.slot, componentIndex, foodId: option.foodItem.id, units: option.replacementComponent.units };
      break;
    }
  }
  if (swap) break;
}
assert(swap, 'fixture must provide a real option');
await assert.rejects(() => processMemberMealSchedule(user, { ...swap, units: swap.units * 100 }, deps), /NO_FEASIBLE_PLAN/);
const changed = await processMemberMealSchedule(user, swap, deps);
assert.equal(changed.p_plan.meals.find(m => m.slot === swap.slot).components[swap.componentIndex].foodItem.id, swap.foodId);
const recorded = base.meals.find(m => m.slot === swap.slot);
state.checkins[swap.slot] = { ...recorded, consumed: true };
await assert.rejects(() => processMemberMealSchedule(user, { ...swap, requestId: randomUUID() }, deps), /MEAL_NOT_EDITABLE/);
state.checkins = {};
let rotated;
for (const meal of base.meals) {
  try {
    rotated = await processMemberMealSchedule(user, { ...edit, kind: 'rotate', slot: meal.slot }, deps);
    assert.notEqual(rotated.p_plan.meals.find(m => m.slot === meal.slot).templateId, meal.templateId);
    break;
  } catch (error) {
    if (error.message !== 'NO_FEASIBLE_PLAN') throw error;
  }
}
assert(rotated, 'fixture must allow a real rotation');
state.profile.medical_conditions_json.conditions = ['kidney_disease'];
await assert.rejects(() => processMemberMealSchedule(user, { ...start, requestId: randomUUID(),
  expectedUpdatedAt, intakeRevision: '1' }, deps), /MEDICAL_REVIEW_REQUIRED/);
state.profile.medical_conditions_json.conditions = [];
state.profile.dietary_preferences_json.allergies = ['egg', 'sesame'];
await assert.rejects(() => processMemberMealSchedule(user, { ...start, requestId: randomUUID(),
  expectedUpdatedAt, intakeRevision: '1' }, deps), /NO_FEASIBLE_PLAN/);
assert.equal(writes, 3);
console.log('PASS server meal intents: forged plans/targets rejected, trusted generate/rotate/swap, exact serving, consumption lock, medical/allergen safety and idempotent response');
