import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ProgressEntry } from '../../src/utils/progressJournal.ts';
import type { UserProfile } from '../../src/types/index.ts';
import { smoothedWeightReview } from '../../src/utils/weightReview.ts';
import { memberNutrition } from '../../src/member/nutrition.ts';
import { readNutritionContext } from '../../src/utils/nutritionContext.ts';
export async function processWeightReview(db: SupabaseClient, user: string, input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw Error('INVALID_REQUEST');
  const b = input as Record<string, unknown>;
  if (!['preview','apply'].includes(b.kind as string) || Object.keys(b).some(k => !['kind','reviewKey'].includes(k)) ||
      (b.kind === 'apply' && (typeof b.reviewKey !== 'string' || !/^[0-9a-f]{64}$/.test(b.reviewKey)))) throw Error('INVALID_REQUEST');
  const call = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(name, args).abortSignal(AbortSignal.timeout(12000)).retry(false);
    if (error) throw Error(error.code === 'PGRST202' ? 'MEAL_SCHEDULE_MIGRATION_REQUIRED' : error.message);
    return data;
  };
  if (b.kind === 'apply' && await call('member_weight_review_receipt', { p_user: user, p_key: b.reviewKey })) return { applied: true };
  const state = await call('member_weight_review_state', { p_user: user }) as { today: string; profile: UserProfile; entries: ProgressEntry[] };
  if (!state?.profile) throw Error('ACCESS_DENIED');
  const trend = smoothedWeightReview(state.entries, state.today);
  if (!trend || !trend.ready || trend.latest.median === state.profile.weight) {
    if (b.kind === 'apply') {
      if (await call('member_weight_review_receipt', { p_user: user, p_key: b.reviewKey })) return { applied: true };
      throw Error('STALE_CONTEXT');
    }
    return { proposal: null, trend };
  }
  const { policy, revision } = await readNutritionContext(db, AbortSignal.timeout(12000));
  let before, after;
  try {
    before = memberNutrition(state.profile, policy, false).targets;
    after = memberNutrition({ ...state.profile, weight: trend.latest.median }, policy, false).targets;
  } catch { throw Error('MEDICAL_REVIEW_REQUIRED'); }
  const reviewKey = createHash('sha256').update(JSON.stringify({ state, trend, revision })).digest('hex');
  const proposal = { reviewKey, weight: trend.latest.median, before, after, trend };
  if (b.kind === 'preview') return { proposal, trend };
  if (b.reviewKey !== reviewKey) {
    if (await call('member_weight_review_receipt', { p_user: user, p_key: b.reviewKey })) return { applied: true };
    throw Error('STALE_CONTEXT');
  }
  await call('member_apply_weight_review', { p_user: user, p_profile: state.profile, p_entries: state.entries,
    p_revision: revision, p_day: state.today, p_weight: proposal.weight, p_key: reviewKey, p_evidence: { ...proposal,
      source: { today: state.today, revision, policy, entries: state.entries,
        nutritionInputs: Object.fromEntries((['weight','height','birth_date','gender','goal','activity_level',
          'weight_loss_speed','body_fat_pct','body_fat_source','activity_profile_json','protein_budget_preference',
          'medical_conditions_json'] as const).map(key => [key, state.profile[key]])) } } });
  return { applied: true };
}
