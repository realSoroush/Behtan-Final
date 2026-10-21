import { createClient } from '@supabase/supabase-js';
import { ProServerError } from './proPlanService.ts';
export async function proHealth(token:string){
 const url=process.env.VITE_SUPABASE_URL, key=process.env.VITE_SUPABASE_ANON_KEY;
 if(!url||!key)throw new ProServerError('PRO_SERVER_NOT_CONFIGURED',503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});
 const user=await db.auth.getUser(token);
 if(user.error||!user.data.user?.phone_confirmed_at)throw new ProServerError('PRO_AUTH_REQUIRED',401);
 const access=await db.rpc('pro_pilot_status');
 if(access.error)throw new ProServerError('PRO_CONNECTION_ERROR',503);
 if(!access.data)throw new ProServerError('PRO_ACCESS_DENIED',403);
 const missing=[];
 if(process.env.PRO_SERVER_PLANS_ENABLED!=='true')missing.push('PRO_SERVER_PLANS_ENABLED');
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY)missing.push('SUPABASE_SERVICE_ROLE_KEY');
 if(missing.length)return {ready:false,missing,scope:'configuration-only'};
 const server=createClient(url,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
 const probe=await server.rpc('pro_service_status').abortSignal(AbortSignal.timeout(5000));
 if(probe.error){
  if(probe.status===401||probe.status===403)throw new ProServerError('PRO_SERVER_CREDENTIAL_INVALID',503);
  if(probe.error.code==='PGRST202')throw new ProServerError('PRO_MIGRATION_REQUIRED',503);
  throw new ProServerError('PRO_CONNECTION_ERROR',503);
 }
 if(probe.data!=='operations-v1')throw new ProServerError('PRO_MIGRATION_REQUIRED',503);
 return {ready:true,missing:[],scope:'server-and-migration'};
}
