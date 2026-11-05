import { createClient } from '@supabase/supabase-js';
import { readNutritionContext, NutritionContextError } from '../src/utils/nutritionContext.ts';
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
      if(status===401 || ((status===403 || error.code==='42501') && !error.message.includes('PRO_')))throw new ProServerError('PRO_SERVER_CREDENTIAL_INVALID',503);
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
      // Called only after verifyToken + RLS readCase + current Pro entitlement.
      // Nutrition catalog is shared reference data, not a patient's B2C account.
      // B2C billing policies intentionally remain unchanged.
      void token;
      try {
        return await readNutritionContext(admin, AbortSignal.timeout(12000));
      } catch (error) {
        if (error instanceof NutritionContextError) {
          if (error.status === 401 || error.status === 403) throw new ProServerError('PRO_SERVER_CREDENTIAL_INVALID', 503);
          if (error.code === 'PGRST202') throw new ProServerError('PRO_MIGRATION_REQUIRED', 503);
        }
        throw new ProServerError('PRO_CATALOG_UNAVAILABLE', 503);
      }
    },
    stage: x => call<ServerDraft>('pro_stage_server_plan', {
      p_org:x.org,p_record:x.record,p_revision:x.revision,p_actor:x.actor,p_key:x.key,p_request:x.request,p_plan:x.plan,
    }),
    publish: x => call<string>('pro_publish_server_plan', {
      p_org:x.org,p_record:x.record,p_revision:x.revision,p_actor:x.actor,p_key:x.key,p_draft:x.draft,
    }),
  };
}
