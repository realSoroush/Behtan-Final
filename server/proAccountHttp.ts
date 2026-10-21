import {randomUUID} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {createClient} from '@supabase/supabase-js';
export type AccountInput={phone:string;name:string;expires:string;limit:number;reason:string;key:string};
export interface AccountDependencies{authenticate:(token:string)=>Promise<string>;lookup:(actor:string,phone:string)=>Promise<string|null>;create:(phone:string)=>Promise<string>;provision:(actor:string,user:string,input:AccountInput)=>Promise<string>}
export class AccountError extends Error{status:number;constructor(code:string,status=400){super(code);this.status=status;}}
const uuid=(s:unknown)=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
export function accountInput(body:unknown):AccountInput{
 if(!body||typeof body!=='object'||Array.isArray(body))throw new AccountError('PRO_INVALID_REQUEST');const b=body as Record<string,unknown>;
 if(Object.keys(b).some(k=>!['phone','name','expires','limit','reason','key'].includes(k)))throw new AccountError('PRO_INVALID_REQUEST');
 if(typeof b.phone!=='string'||b.phone.length>24||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.length>500||!uuid(b.key)||!Number.isInteger(b.limit)||Number(b.limit)<1||Number(b.limit)>100000||typeof b.expires!=='string')throw new AccountError('PRO_INVALID_REQUEST');
 let phone=b.phone.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[\s+()-]/g,'');if(phone.startsWith('0098'))phone=phone.slice(2);if(/^09\d{9}$/.test(phone))phone='98'+phone.slice(1);
 const expiry=Date.parse(b.expires);if(!/^989\d{9}$/.test(phone)||!Number.isFinite(expiry)||expiry<=Date.now()||expiry>Date.now()+3660*86400000)throw new AccountError('PRO_INVALID_REQUEST');
 return {phone,name:b.name.trim(),expires:new Date(expiry).toISOString(),limit:Number(b.limit),reason:b.reason.trim(),key:String(b.key)};
}
export async function provisionAccount(input:AccountInput,token:string,deps:AccountDependencies){
 const actor=await deps.authenticate(token);let user=await deps.lookup(actor,input.phone);
 if(!user){try{user=await deps.create(input.phone);}catch{user=await deps.lookup(actor,input.phone);if(!user)throw new AccountError('PRO_ACCOUNT_CREATE_FAILED',503);}}
 const organization=await deps.provision(actor,user,input);return {organization_id:organization,user_id:user};
}
export function accountDependencies():AccountDependencies{
 const url=process.env.VITE_SUPABASE_URL,anon=process.env.VITE_SUPABASE_ANON_KEY,key=process.env.SUPABASE_SERVICE_ROLE_KEY;
 if(!url||!anon||!key||process.env.PRO_ADMIN_ACCOUNTS_ENABLED!=='true')throw new AccountError('PRO_ADMIN_NOT_CONFIGURED',503);
 const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const call=async<T>(name:string,args:Record<string,unknown>)=>{const r=await client.rpc(name,args).abortSignal(AbortSignal.timeout(10000));if(r.error){if(/PRO_WORKSPACE_EXISTS|PRO_REQUEST_CONFLICT|PRO_INVALID_REQUEST|ADMIN_REQUIRED/.test(r.error.message))throw new AccountError(r.error.message.includes('PRO_WORKSPACE_EXISTS')?'PRO_WORKSPACE_EXISTS':r.error.message.includes('ADMIN_REQUIRED')?'ADMIN_REQUIRED':'PRO_REQUEST_CONFLICT',409);throw new AccountError(r.error.code==='PGRST202'?'PRO_MIGRATION_REQUIRED':'PRO_CONNECTION_ERROR',503);}return r.data as T;};
 return {
  async authenticate(token){const userClient=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:`Bearer ${token}`}}});const r=await userClient.auth.getUser(token);if(r.error||!r.data.user?.phone||!r.data.user.phone_confirmed_at)throw new AccountError('PRO_AUTH_REQUIRED',401);const a=await userClient.rpc('admin_allowed');if(a.error||a.data!==true)throw new AccountError('ADMIN_REQUIRED',403);return r.data.user.id;},
  lookup:(actor,phone)=>call<string|null>('admin_pro_lookup_phone',{p_actor:actor,p_phone:phone}),
  async create(phone){const r=await client.auth.admin.createUser({phone:'+'+phone,phone_confirm:false});if(r.error||!r.data.user)throw new AccountError('PRO_ACCOUNT_CREATE_FAILED',503);return r.data.user.id;},
  provision:(actor,user,x)=>call<string>('admin_pro_provision_phone',{p_actor:actor,p_user:user,p_name:x.name,p_expires:x.expires,p_limit:x.limit,p_reason:x.reason,p_key:x.key}),
 };
}
export function createProAccountHandler(factory=accountDependencies){return async(req:IncomingMessage&{body?:unknown},res:ServerResponse)=>{
 const id=randomUUID();res.setHeader('Content-Type','application/json; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('X-Request-Id',id);res.setHeader('X-Content-Type-Options','nosniff');
 try{
  if(req.method!=='POST'){res.setHeader('Allow','POST');throw new AccountError('PRO_METHOD_NOT_ALLOWED',405);}if(req.headers['sec-fetch-site']==='cross-site')throw new AccountError('ADMIN_REQUIRED',403);
  const token=req.headers.authorization?.match(/^Bearer (\S+)$/i)?.[1];if(!token)throw new AccountError('PRO_AUTH_REQUIRED',401);
  if(!req.headers['content-type']?.startsWith('application/json'))throw new AccountError('PRO_INVALID_REQUEST',415);
  if(Number(req.headers['content-length']||0)>4096)throw new AccountError('PRO_REQUEST_TOO_LARGE',413);
  let body=req.body;if(body===undefined){let bytes=0;const chunks:Buffer[]=[];for await(const c of req){const b=Buffer.from(c);bytes+=b.length;if(bytes>4096)throw new AccountError('PRO_REQUEST_TOO_LARGE',413);chunks.push(b);}body=Buffer.concat(chunks).toString();}
  if(typeof body==='string'){if(Buffer.byteLength(body)>4096)throw new AccountError('PRO_REQUEST_TOO_LARGE',413);try{body=JSON.parse(body);}catch{throw new AccountError('PRO_INVALID_REQUEST');}}
  if(Buffer.byteLength(JSON.stringify(body)??'')>4096)throw new AccountError('PRO_REQUEST_TOO_LARGE',413);
  const input=accountInput(body);const result=await provisionAccount(input,token,factory());res.statusCode=200;res.end(JSON.stringify(result));
 }catch(e){const code=e instanceof AccountError?e.message:'PRO_CONNECTION_ERROR';console.error(JSON.stringify({event:'pro_account_failed',request_id:id,code}));res.statusCode=e instanceof AccountError?e.status:503;res.end(JSON.stringify({error:code}));}
};}
