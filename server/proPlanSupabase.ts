import { createClient } from '@supabase/supabase-js';
import { buildNutritionCatalog, type FoodItemRow, type FoodSubstituteRow, type MealTemplateRow, type MealTemplateSlotRow } from '../src/utils/nutritionCatalog.ts';
import { buildProteinEnginePolicy, type ProteinEnginePolicyRow } from '../src/utils/proteinPolicy.ts';
import type { RealIntake } from '../src/professional/menuPlan.ts';
import { ProServerError, type PlanDependencies, type ServerDraft } from './proPlanService.ts';

function databaseError(error: { message: string; code?: string }, status = 0): never {
  const known = /PRO_(ACCESS_DENIED|STALE_REVISION|REQUEST_CONFLICT|MODULE_DISABLED|INVALID_PLAN|DRAFT_EXPIRED|GENERATION_LIMIT|SUBSCRIPTION_EXPIRED|CASE_LIMIT)/.exec(error.message)?.[0];
  if(error.code==='PGRST202')throw new ProServerError('PRO_MIGRATION_REQUIRED',503);
  if (known) throw new ProServerError(known, known === 'PRO_ACCESS_DENIED' ? 403 : known === 'PRO_GENERATION_LIMIT' ? 429 : 409);
  if (status === 401) throw new ProServerError('PRO_AUTH_REQUIRED', 401);
  if (status === 403 || error.code === '42501' || error.code === 'PGRST116') throw new ProServerError('PRO_ACCESS_DENIED', 403);
  throw new ProServerError('PRO_CONNECTION_ERROR', 503);
}
export function supabasePlanDependencies(): PlanDependencies {
  const url = process.env.VITE_SUPABASE_URL;
  const anon = process.env.VITE_SUPABASE_ANON_KEY;
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.PRO_SERVER_PLANS_ENABLED !== 'true' || !url || !anon || !secret)
    throw new ProServerError('PRO_SERVER_NOT_CONFIGURED', 503);
  const options = { auth: { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false } };
  const admin = createClient(url, secret, options);
  const userClient = (token: string) => createClient(url, anon, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } });
  const call = async <T>(name: string, args: Record<string,unknown>): Promise<T> => {
    const { data, error, status } = await admin.rpc(name, args).abortSignal(AbortSignal.timeout(12000)).retry(false);
    if (error) {
      if(status===401)throw new ProServerError('PRO_SERVER_CREDENTIAL_INVALID',503);
      databaseError(error,status);
    }
    return data as T;
  };
  return {
    async reportFailure(x) { await admin.rpc('pro_report_failure',{p_id:x.id,p_actor:x.actor,p_org:x.org,p_operation:x.operation,p_code:x.code}).abortSignal(AbortSignal.timeout(2000)); },
    async verifyToken(token) {
      const { data, error } = await userClient(token).auth.getUser(token);
      if (error) {
        if ('status' in error && Number(error.status) >= 500) throw new ProServerError('PRO_CONNECTION_ERROR',503);
        if (error.name === 'AuthRetryableFetchError') throw new ProServerError('PRO_CONNECTION_ERROR',503);
        throw new ProServerError('PRO_AUTH_REQUIRED',401);
      }
      if (!data.user?.id || !data.user.phone || !data.user.phone_confirmed_at) throw new ProServerError('PRO_AUTH_REQUIRED',401);
      return data.user.id;
    },
    async readCase(token, org, record) {
      const { data, error, status } = await userClient(token).from('pro_real_cases').select('answers,revision,archived_at')
        .eq('organization_id', org).eq('id',record).single();
      if (error) databaseError(error,status);
      if (!data) throw new ProServerError('PRO_ACCESS_DENIED',403);
      if(data.archived_at)throw new ProServerError('PRO_CASE_ARCHIVED',409);
      const access=await userClient(token).rpc('pro_workspace_status',{p_org:org});
      if(access.error)databaseError(access.error,access.status);
      if(access.data?.modules?.nutrition===false)throw new ProServerError('PRO_MODULE_DISABLED',403);
      if(!access.data?.can_write)throw new ProServerError('PRO_SUBSCRIPTION_EXPIRED',403);
      return data as { answers:RealIntake; revision:number };
    },
    async loadNutrition(token) {
      const db = userClient(token);
      // Explicit ranges avoid PostgREST's default 1,000-row truncation.
      async function rows(table: string, order: string) {
        const result: unknown[] = [];
        for (let start = 0; start < 50000; start += 500) {
          const { data, error, status } = await db.from(table).select('*').order(order).order(table === 'food_substitutes' ? 'substitute_food_item_id' : order).range(start,start+499);
          if (error) databaseError(error,status);
          result.push(...(data ?? []));
          if (!data || data.length < 500) return result;
        }
        throw new ProServerError('PRO_CATALOG_LIMIT',503);
      }
      const [foodRows, substituteRows, templateRows, slotRows, policy] = await Promise.all([
        rows('food_items','id'), rows('food_substitutes','food_item_id'), rows('meal_templates','id'),
        rows('meal_template_slots','id'), db.from('nutrition_protein_policy').select('*').eq('id','default').single(),
      ]);
      if (policy.error) databaseError(policy.error,policy.status);
      return {
        catalog:buildNutritionCatalog({ foodRows:foodRows as FoodItemRow[], substituteRows:substituteRows as FoodSubstituteRow[], templateRows:templateRows as MealTemplateRow[], slotRows:slotRows as MealTemplateSlotRow[] }),
        policy:buildProteinEnginePolicy(policy.data as ProteinEnginePolicyRow),
      };
    },
    stage: x => call<ServerDraft>('pro_stage_server_plan', {
      p_org:x.org,p_record:x.record,p_revision:x.revision,p_actor:x.actor,p_key:x.key,p_request:x.request,p_plan:x.plan,
    }),
    publish: x => call<string>('pro_publish_server_plan', {
      p_org:x.org,p_record:x.record,p_revision:x.revision,p_actor:x.actor,p_key:x.key,p_draft:x.draft,
    }),
  };
}
