import { paymentHandler, type Database, type Order, type Subscription } from './core.ts';
import { gatewayCall, type Mode } from './gateway.ts';
import { evaluateProfileMedicalEligibility } from '../../../src/utils/medicalEligibility.ts';
import type { UserProfile } from '../../../src/types/index.ts';

const required=(name:string)=>{const value=Deno.env.get(name);if(!value)throw new Error(`Missing ${name}`);return value;};
const base=required('SUPABASE_URL');
const service=required('SUPABASE_SERVICE_ROLE_KEY');
const merchant=required('ZARINPAL_MERCHANT_ID');
const site=new URL(Deno.env.get('PAYMENT_SITE_URL') ?? 'https://behtan.fit').origin;
if (!site.startsWith('https://')) throw new Error('PAYMENT_SITE_URL must use HTTPS');

async function rest<T>(path:string, method='GET', body?:unknown):Promise<T> {
  const response=await fetch(`${base}/rest/v1/${path}`,{method,signal:AbortSignal.timeout(10000),
    headers:{apikey:service,Authorization:`Bearer ${service}`,'Content-Type':'application/json'},
    ...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await response.text();
  if (!response.ok) throw new Error(text);
  return (text ? JSON.parse(text) : null) as T;
}
const db:Database={
  settings:async()=>{const [b]=await rest<{mode:Mode;checkout_enabled:boolean}[]>('billing_settings?id=eq.true');if(!b)throw new Error('NO_SETTINGS');return b;},
  orders:query=>rest<Order[]>(`payment_orders?select=*&${query}`),
  subscriptions:user=>rest<Subscription[]>(`user_subscriptions?select=*&user_id=eq.${user}&order=starts_at.asc`),
  update:async(id,fields)=>{await rest(`payment_orders?id=eq.${id}`,'PATCH',fields);},
  rpc:<T>(name:string,args:Record<string,unknown>)=>rest<T>(`rpc/${name}`,'POST',args),
};
Deno.serve(paymentHandler({db,site,reconcileSecret:Deno.env.get('PAYMENT_RECONCILE_SECRET') ?? '',
  gateway:(mode,method,body)=>gatewayCall(mode,merchant,method,body),
  authenticate:async token=>{
    if(!token)return null;
    const response=await fetch(`${base}/auth/v1/user`,{signal:AbortSignal.timeout(10000),headers:{apikey:service,Authorization:`Bearer ${token}`}});
    return response.ok ? await response.json() : null;
  },
  eligible:async id=>{
    const [profile]=await rest<UserProfile[]>(`user_profiles?id=eq.${id}&select=*`);
    return profile?.onboarding_completed===true && evaluateProfileMedicalEligibility(profile).canGenerateAutomaticPlan;
  },
}));
