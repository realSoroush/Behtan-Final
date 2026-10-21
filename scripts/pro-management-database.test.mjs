import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';import {emptyRealIntake} from '../src/professional/menuPlan.ts';
export async function testManagementDatabase({db,asUser,rpc,equal,denied}){
 await db.exec('reset role');await db.exec(await readFile(new URL('../supabase/migrations/20261021_027_pro_account_management.sql',import.meta.url),'utf8'));
 const admin=randomUUID(),owner=randomUUID(),other=randomUUID(),pending=randomUUID();const future=new Date(Date.now()+5*86400000).toISOString();
 for(const [id,phone,confirmed] of [[admin,'989001000001',true],[owner,'989001000002',true],[other,'989001000003',true],[pending,'989001000004',false]]){await db.query('insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,$3)',[id,phone,confirmed?new Date().toISOString():null]);await db.query("insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '2 days')",[id]);}
 await db.query('insert into admin_members(user_id) values($1)',[admin]);await asUser(owner);const org=(await rpc('pro_create_sandbox_organization',[randomUUID()])).id;
 const answers={...emptyRealIntake(),display_name:'مراجع مدیریت',phone:'09120000000',birth_date:'1992-04-23',height_cm:165,weight_kg:75,safety_confirmed:true};const rec=(await rpc('pro_save_real_case',[org,null,0,answers,randomUUID()])).id;

 const sample=JSON.parse(await readFile(new URL('../output/pdf/sample-plan.json',import.meta.url),'utf8'));sample.display_name=answers.display_name;sample.intake_revision=1;
 const request={date:sample.date,count:sample.requested_menus,notes:sample.notes};
 await db.exec('reset role;set role service_role');const draft=await rpc('pro_stage_server_plan',[org,rec,1,owner,randomUUID(),request,sample]);
 await rpc('pro_publish_server_plan',[org,rec,1,owner,randomUUID(),draft.draft_id]);await asUser(owner);
 equal((await rpc('pro_browse_case_directory',[org,'',0,false])).total,1);equal((await rpc('pro_duplicate_cases',[org,'+989120000000'])).length,1);equal((await rpc('pro_duplicate_cases',[org,'۰۹۱۲۰۰۰۰۰۰۰'])).length,1);equal((await rpc('pro_duplicate_cases',[org,''])).length,0);
 const key=randomUUID();const archived=await rpc('pro_set_case_archived',[org,rec,0,true,key]);equal(archived.archive_revision,1);equal(await rpc('pro_set_case_archived',[org,rec,0,true,key]),archived,'archive retry preserves original response');

 await db.exec('reset role;set role service_role');await denied(()=>rpc('pro_stage_server_plan',[org,rec,1,owner,randomUUID(),request,sample]),/PRO_CASE_ARCHIVED/);await asUser(owner);
 equal((await rpc('pro_browse_case_history',[org,rec,'plans',0])).rows[0].plan,sample,'archive preserves exact confirmed program');
 equal((await rpc('pro_browse_case_directory',[org,'',0,false])).total,0);equal((await rpc('pro_browse_case_directory',[org,'',0,true])).total,1);equal((await rpc('pro_browse_case_history',[org,rec,'intakes',0])).total,1,'archive preserves intake history');
 await denied(()=>rpc('pro_set_case_archived',[org,rec,0,false,randomUUID()]),/PRO_STALE_REVISION/);await denied(()=>rpc('pro_set_case_archived',[org,rec,0,false,key]),/PRO_REQUEST_CONFLICT/);
 await denied(()=>rpc('pro_save_real_case',[org,rec,1,{...answers,weight_kg:76},randomUUID()]),/PRO_CASE_ARCHIVED/);
 await rpc('pro_set_case_archived',[org,rec,1,false,randomUUID()]);equal((await rpc('pro_save_real_case',[org,rec,1,{...answers,weight_kg:76},randomUUID()])).revision,2);
 const renewed=await rpc('pro_request_renewal',[org,randomUUID()]);equal(await rpc('pro_request_renewal',[org,randomUUID()]),renewed,'one pending request per org');equal((await rpc('pro_subscription_details',[org])).renewal.id,renewed);
 await asUser(other);await denied(()=>rpc('pro_duplicate_cases',[org,'09120000000']));await denied(()=>rpc('pro_browse_case_directory',[org,'',0,true]));await denied(()=>rpc('pro_set_case_archived',[org,rec,2,true,randomUUID()]));await denied(()=>rpc('pro_subscription_details',[org]));await denied(()=>rpc('pro_request_renewal',[org,randomUUID()]));await denied(()=>rpc('admin_pro_renewals',[null]),/ADMIN_REQUIRED/);
 for(const table of ['pro_case_archive_events','pro_renewal_requests'])await denied(()=>db.query('select * from '+table),/permission denied/);
 await denied(()=>rpc('admin_pro_lookup_phone',[admin,'989001000004']),/permission denied/);
 await asUser(admin);equal((await rpc('admin_pro_renewals',[org]))[0].id,renewed);await rpc('admin_pro_resolve_renewal',[renewed]);equal((await rpc('admin_pro_renewals',[org])).length,0);
 await db.exec('reset role;set role service_role');await denied(()=>rpc('admin_pro_lookup_phone',[other,'989001000004']),/ADMIN_REQUIRED/);equal(await rpc('admin_pro_lookup_phone',[admin,'989001000004']),pending);
 const provisionKey=randomUUID();const created=await rpc('admin_pro_provision_phone',[admin,pending,'پنل آماده ورود',future,20,'آزمون حساب',provisionKey]);equal(await rpc('admin_pro_provision_phone',[admin,pending,'پنل آماده ورود',future,20,'آزمون حساب',provisionKey]),created);
 await asUser(pending);equal(await rpc('pro_pilot_status',[]),false,'provisioned unconfirmed phone cannot enter');
 await db.exec('reset role');equal((await db.query('select phone_confirmed_at from auth.users where id=$1',[pending])).rows[0].phone_confirmed_at,null,'provisioning never confirms phone');await db.query('update auth.users set phone_confirmed_at=now() where id=$1',[pending]);
 await asUser(pending);equal((await rpc('pro_workspace_status',[created])).can_write,true,'same account gains membership access after OTP');
 await db.exec('reset role');await denied(()=>db.query('update pro_case_archive_events set request=request'),/PRO_IMMUTABLE/);
}
