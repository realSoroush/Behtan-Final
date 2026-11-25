import { createClient } from '@supabase/supabase-js';
import { ProServerError } from './proPlanService.ts';
import { PRO_PLAN_TIMEOUT, proDeadlineFetch } from './proPlanDeadline.ts';
export async function proHealth(
 token:string, deadline = AbortSignal.timeout(10_000),
 observe?: (phase: string, duration: number) => void,
){
 const measure = async <T>(phase: string, work: () => PromiseLike<T>) => {
  const start = performance.now();
  try { return await work(); }
  finally { observe?.(phase, Math.round(performance.now() - start)); }
 };
 const url=process.env.VITE_SUPABASE_URL, key=process.env.VITE_SUPABASE_ANON_KEY;
 if(!url||!key)throw new ProServerError('PRO_SERVER_NOT_CONFIGURED',503);
 const fetch=proDeadlineFetch(deadline, 5000);
 const ensureResponse=()=>{if(deadline.aborted)throw new ProServerError(PRO_PLAN_TIMEOUT,504);};
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch,headers:{Authorization:`Bearer ${token}`}}});
 const user=await measure('auth', () => db.auth.getUser(token));
 ensureResponse();
 if(user.error?.name==='AuthRetryableFetchError' || Number(user.error?.status) >= 500)
  throw new ProServerError('PRO_CONNECTION_ERROR',503);
 if(user.error||!user.data.user?.phone_confirmed_at)throw new ProServerError('PRO_AUTH_REQUIRED',401);
 const access=await measure('access', () => db.rpc('pro_pilot_status').abortSignal(deadline).retry(false));
 ensureResponse();
 if(access.error)throw new ProServerError('PRO_CONNECTION_ERROR',503);
 if(!access.data)throw new ProServerError('PRO_ACCESS_DENIED',403);
 const missing=[];
 if(process.env.PRO_SERVER_PLANS_ENABLED!=='true')missing.push('PRO_SERVER_PLANS_ENABLED');
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)missing.push('SUPABASE_SERVICE_ROLE_KEY');
 if(missing.length)return {ready:false,missing,scope:'configuration-only'};
 const server=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch}});
 const probe=await measure('service', () => server.rpc('pro_service_status').abortSignal(deadline).retry(false));
 ensureResponse();
 if(probe.error){
  if(probe.status===401||probe.status===403)throw new ProServerError('PRO_SERVER_CREDENTIAL_INVALID',503);
  if(probe.error.code==='PGRST202')throw new ProServerError('PRO_MIGRATION_REQUIRED',503);
  throw new ProServerError('PRO_CONNECTION_ERROR',503);
 }
 if(probe.data!=='operations-v2')throw new ProServerError('PRO_MIGRATION_REQUIRED',503);
 // An empty scope must be denied before any case lookup can return data.
 const guard=await measure('generation-access', () => server.rpc('pro_prepare_server_plan',{
  p_org:null,p_record:null,p_revision:null,p_actor:user.data.user.id,p_key:null,p_request:null,
 }).abortSignal(deadline).retry(false));
 ensureResponse();
 if(guard.error?.code==='PGRST202')return {ready:true,missing:[],scope:'server-and-migration',generationAccess:'legacy'};
 if(guard.error?.code==='42501'&&guard.error.message==='PRO_ACCESS_DENIED')
  return {ready:true,missing:[],scope:'server-and-migration',generationAccess:'057'};
 if(guard.status===401||guard.status===403)throw new ProServerError('PRO_SERVER_CREDENTIAL_INVALID',503);
 throw new ProServerError('PRO_CONNECTION_ERROR',503);
}
