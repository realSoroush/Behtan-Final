import { createHash } from 'node:crypto';
import type { MealSlot } from '../../src/types/index.ts';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { MemberIntakeRequest, MemberIntakeReceipt } from '../../src/member/intake.ts';
import { MEAL_SLOTS, isMealSnapshot } from '../../src/utils/mealValidation.ts';
import { memberProfileContext } from '../../src/utils/memberScheduleContext.ts';
import type { MemberDayState } from './mealSchedule.ts';

type Dependencies = {
  read(user: string, day: string, requestId: string): Promise<MemberDayState>;
  commit(input: Record<string, unknown>): Promise<MemberIntakeReceipt>;
};

const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

function parseIntakeRequest(input: unknown): MemberIntakeRequest {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('INVALID_REQUEST');
  const b = input as Record<string, unknown>;
  if (typeof b.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(b.date) ||
      !Number.isFinite(Date.parse(b.date + 'T12:00:00Z')) ||
      new Date(b.date + 'T12:00:00Z').toISOString().slice(0, 10) !== b.date) throw Error('INVALID_MEAL_DATE');
  if (!uuid(b.requestId) || typeof b.catalogRevision !== 'string' || !/^[1-9]\d{0,18}$/.test(b.catalogRevision) ||
      typeof b.profileContext !== 'string' || !/^[0-9a-f]{8}$/.test(b.profileContext) ||
      typeof b.intakeRevision !== 'string' || !/^(0|[1-9]\d{0,18})$/.test(b.intakeRevision) ||
      (b.expectedUpdatedAt !== null && (typeof b.expectedUpdatedAt !== 'string' || b.expectedUpdatedAt.length > 40 ||
        !Number.isFinite(Date.parse(b.expectedUpdatedAt))))) throw Error('INVALID_REQUEST');
  const base = { date: b.date, requestId: b.requestId, catalogRevision: b.catalogRevision,
    profileContext: b.profileContext, intakeRevision: b.intakeRevision, expectedUpdatedAt: b.expectedUpdatedAt };
  const allowed = ['date', 'kind', 'requestId', 'catalogRevision', 'profileContext', 'intakeRevision', 'expectedUpdatedAt'];
  if (b.kind === 'extra-remove') {
    if (!uuid(b.id) || Object.keys(b).some(key => ![...allowed, 'id'].includes(key))) throw Error('INVALID_REQUEST');
    return { ...base, kind: b.kind, id: b.id };
  }
  if (!MEAL_SLOTS.includes(b.slot as MealSlot)) throw Error('INVALID_REQUEST');
  const slot = b.slot as MealSlot;
  if (b.kind === 'record' || b.kind === 'extra-add') {
    if (Object.keys(b).some(key => ![...allowed, 'slot', 'meal'].includes(key)) ||
        !isMealSnapshot(b.meal, slot) || (b.kind === 'extra-add' && !b.meal.source)) throw Error('INVALID_INTAKE');
    return { ...base, kind: b.kind, slot, meal: { ...b.meal, consumed: true } };
  }
  if (!['undo-record', 'skip', 'undo-skip'].includes(String(b.kind)) ||
      Object.keys(b).some(key => ![...allowed, 'slot'].includes(key))) throw Error('INVALID_REQUEST');
  return { ...base, kind: b.kind as 'undo-record' | 'skip' | 'undo-skip', slot };
}

export async function processMemberIntake(user: string, input: unknown, deps: Dependencies): Promise<MemberIntakeReceipt> {
  const request = parseIntakeRequest(input);
  const { date, requestId, intakeRevision, expectedUpdatedAt, catalogRevision, profileContext, ...intent } = request;
  // The key identifies the factual action. Reopening the same extra-food action
  // with a newly read revision returns its original outcome, without another insert.
  const hash = createHash('sha256').update(JSON.stringify(['member-intake-v1', date, intent])).digest('hex');
  const state = await deps.read(user, date, requestId);
  if (state.operation) {
    if (state.operation.hash !== hash) throw Error('REQUEST_CONFLICT');
    return { ...state.operation.result as MemberIntakeReceipt, replayed: true };
  }
  if (state.catalog_revision !== catalogRevision || memberProfileContext(state.profile) !== profileContext) throw Error('STALE_CONTEXT');
  if (state.intake_revision !== intakeRevision) throw Error('STALE_INTAKE');
  if ((state.schedule?.updated_at ?? null) !== expectedUpdatedAt) throw Error('STALE_PLAN');

  return deps.commit({
    p_user: user, p_day: date, p_request_id: requestId, p_request_hash: hash,
    p_profile: state.profile, p_catalog_revision: catalogRevision, p_intake_revision: intakeRevision,
    p_expected_updated_at: expectedUpdatedAt, p_kind: request.kind,
    p_slot: 'slot' in request ? request.slot : null,
    p_meal: 'meal' in request ? request.meal : null,
    p_extra_id: request.kind === 'extra-remove' ? request.id : null,
  });
}

export function intakeDependencies(db: SupabaseClient): Dependencies {
  const call = async <T>(name: string, args: Record<string, unknown>): Promise<T> => {
    // A deadlock during compatibility with an old direct writer rolls back the
    // whole RPC. One retry keeps the same operation key and version preconditions.
    for (let attempt = 0; attempt < 2; attempt++) {
      const signal = AbortSignal.timeout(12000);
      const { data, error } = await db.rpc(name, args).abortSignal(signal).retry(false);
      if (!error) return data as T;
      if (error.code === '40P01' && attempt === 0) continue;
      if (signal.aborted || error.code === '57014') throw Error('TIMEOUT');
      throw Error(error.code === 'PGRST202' ? 'MEAL_SCHEDULE_MIGRATION_REQUIRED' : error.message);
    }
    throw Error('TIMEOUT');
  };
  return {
    read: (p_user, p_day, p_request_id) => call('member_read_meal_day', { p_user, p_day, p_request_id }),
    commit: args => call('member_commit_intake', args),
  };
}
