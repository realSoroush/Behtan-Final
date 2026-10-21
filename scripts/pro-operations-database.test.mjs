import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {emptyRealIntake} from '../src/professional/menuPlan.ts';
export async function testOperationsDatabase({db,asUser,rpc,equal,denied}){
 await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/migrations/20261021_026_pro_operations.sql',import.meta.url),'utf8'));
 const admin=randomUUID(),owner=randomUUID(),staff=randomUUID(),stranger=randomUUID();
 for(const id of [admin,owner,staff,stranger]){await db.query("insert into auth.users(id,phone,phone_confirmed_at) values($1,'989001234567',now())",[id]);await db.query("insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '1 day')",[id]);}
 await db.query('insert into admin_members(user_id) values($1)',[admin]);
 await asUser(owner);const org=(await rpc('pro_create_sandbox_organization',[randomUUID()])).id;
 await db.exec('reset role');await db.query("insert into pro_memberships(organization_id,user_id,roles) values($1,$2,array['practitioner'])",[org,staff]);
 const a={...emptyRealIntake(),display_name:'پرونده هدف',birth_date:'1992-04-23',height_cm:165,weight_kg:75,safety_confirmed:true};
 await asUser(owner);
 const rec=(await rpc('pro_save_real_case',[org,null,0,a,randomUUID()])).id;
 for(let i=0;i<30;i++)await rpc('pro_save_real_case',[org,null,0,{...a,display_name:'پرونده '+i},randomUUID()]);
 const first=await rpc('pro_browse_cases',[org,'',0]);equal(first.rows.length,25,'bounded first page');equal(first.total,31);
 equal('answers' in first.rows[0],false,'list does not fetch health answers');
 equal((await rpc('pro_browse_cases',[org,'',1])).rows.length,6);
 equal((await rpc('pro_browse_cases',[org,'هدف',0])).rows[0].id,rec,'search across all pages');
 equal((await rpc('pro_browse_cases',[org,'%',0])).total,0,'search wildcards literal');
 await denied(()=>rpc('pro_browse_cases',[org,'',-1]),/PRO_INVALID_REQUEST/);
 await denied(()=>rpc('admin_pro_overview',['',0]),/ADMIN_REQUIRED/);
 for(const table of ['pro_workspace_licenses','pro_license_audit','pro_failure_events','pro_maintenance_runs','pro_admin_workspace_commands'])await denied(()=>db.query('select * from '+table),/permission denied/);
 const fallback=await rpc('pro_workspace_status',[org]);equal(fallback.can_write,true);equal(fallback.source,'pilot');
 await asUser(staff);equal((await rpc('pro_browse_cases',[org,'',0])).total,0,'unassigned staff cannot list owner cases');
 await asUser(stranger);await denied(()=>rpc('pro_browse_cases',[org,'',0]));
 await asUser(admin);
 equal((await rpc('admin_pro_overview',[org,0])).rows[0].case_count,31);
 const key=randomUUID(),future=new Date(Date.now()+3*86400000).toISOString(),past=new Date(Date.now()-86400000).toISOString();
 const grant=(expected,status='active',until=future,cap=31,k=randomUUID())=>rpc('admin_pro_set_license',[org,expected,status,until,cap,'آزمون مجوز',k]);
 const license=await grant(0,'active',future,31,key);equal(license.revision,1);
 equal((await grant(0,'active',future,31,key)).revision,1,'license lost-response retry');
 await denied(()=>grant(0),/PRO_STALE_REVISION/);
 await denied(()=>grant(0,'active',future,30,key),/PRO_REQUEST_CONFLICT/);
 equal((await rpc('admin_pro_events',[org,'audit',0])).total,1);
 await asUser(owner);await denied(()=>rpc('pro_save_real_case',[org,null,0,a,randomUUID()]),/PRO_CASE_LIMIT/);
 equal((await rpc('pro_workspace_status',[org])).case_limit,31);
 await asUser(admin);await grant(1,'suspended');
 await asUser(owner);await denied(()=>rpc('pro_workspace_status',[org]));
 equal((await db.query('select id from pro_real_cases where organization_id=$1',[org])).rows.length,0,'suspension overrides pilot');
 await asUser(admin);await grant(2,'active',past);
 await asUser(owner);equal((await rpc('pro_workspace_status',[org])).can_write,false,'expired license read-only');
 equal((await rpc('pro_browse_cases',[org,'',0])).total,31,'history remains accessible after expiry');
 await denied(()=>rpc('pro_save_real_case',[org,rec,1,{...a,weight_kg:76},randomUUID()]),/PRO_SUBSCRIPTION_EXPIRED/);
 const sample=JSON.parse(await readFile(new URL('../output/pdf/sample-plan.json',import.meta.url),'utf8'));sample.display_name=a.display_name;sample.intake_revision=1;
 const req={date:sample.date,count:sample.requested_menus,notes:sample.notes};
 const stage=async(k=randomUUID(),plan=sample)=>{await db.exec('reset role;set role service_role');return rpc('pro_stage_server_plan',[org,rec,1,owner,k,{...req,notes:plan.notes},plan]);};
 await denied(()=>stage(),/PRO_SUBSCRIPTION_EXPIRED/);
 await asUser(admin);await grant(3,'active',future,1000);
 const confirmed=await stage();const temp=await stage(randomUUID(),{...sample,notes:'پیش‌نمایش جدا'});
 await db.exec('reset role;set role service_role');
 await rpc('pro_publish_server_plan',[org,rec,1,owner,randomUUID(),confirmed.draft_id]);
 await asUser(owner);
 equal((await rpc('pro_browse_case_history',[org,rec,'plans',0])).total,1);
 equal((await rpc('pro_browse_case_history',[org,rec,'intakes',0])).total,1);
 await denied(()=>rpc('pro_report_failure',[randomUUID(),owner,org,'generate','PRO_GENERATION_FAILED']),/permission denied/);
 const event=randomUUID();
 await db.exec('reset role;set role service_role');
 await rpc('pro_report_failure',[event,owner,org,'generate','PRO_GENERATION_FAILED']);
 await rpc('pro_report_failure',[event,owner,org,'generate','PRO_GENERATION_FAILED']);
 await denied(()=>rpc('pro_report_failure',[randomUUID(),owner,org,'generate','patient name']),/PRO_INVALID_REQUEST/);
 await asUser(admin);equal((await rpc('admin_pro_events',[org,'failures',0])).total,1,'failure event idempotent and redacted');
 await db.exec('reset role');
 await db.query("update pro_server_plan_drafts set expires_at=now()-interval '2 days' where id=any($1::uuid[])",[[confirmed.draft_id,temp.draft_id]]);
 await db.query("update pro_failure_events set created_at=now()-interval '100 days' where id=$1",[event]);
 await asUser(owner);await denied(()=>rpc('admin_pro_cleanup',[randomUUID()]),/ADMIN_REQUIRED/);
 await asUser(admin);const cleanupKey=randomUUID();const cleaned=await rpc('admin_pro_cleanup',[cleanupKey]);equal(cleaned.drafts_deleted>=1,true);equal(cleaned.failures_deleted,1);
 equal(await rpc('admin_pro_cleanup',[cleanupKey]),cleaned,'cleanup retry');
 await db.exec('reset role');
 equal((await db.query('select count(*)::int n from pro_server_plan_drafts where id=$1',[temp.draft_id])).rows[0].n,0,'only old unpublished draft removed');
 equal((await db.query('select count(*)::int n from pro_server_plan_drafts where id=$1',[confirmed.draft_id])).rows[0].n,1,'confirmed draft retained for publish retries');
 equal((await db.query('select count(*)::int n from pro_real_plans where organization_id=$1',[org])).rows[0].n,1,'confirmed plan preserved');
 await denied(()=>db.query('update pro_license_audit set reason=reason'),/PRO_IMMUTABLE/);
 // Expire the pilot itself: manual organization access still permits entry.
 await db.query("update pro_pilot_access set expires_at=now()-interval '1 day' where user_id=$1",[owner]);
 await asUser(owner);equal(await rpc('pro_pilot_status',[]),true);

 await denied(()=>rpc('admin_pro_create_workspace',[stranger,'پنل جدید',future,100,'آزمون ایجاد',randomUUID()]),/ADMIN_REQUIRED/);
 await asUser(admin);const newKey=randomUUID();
 const created=await rpc('admin_pro_create_workspace',[stranger,'پنل جدید',future,100,'آزمون ایجاد',newKey]);
 equal(await rpc('admin_pro_create_workspace',[stranger,'پنل جدید',future,100,'آزمون ایجاد',newKey]),created,'admin provisioning response-loss retry');
 await denied(()=>rpc('admin_pro_create_workspace',[stranger,'پنل دیگر',future,100,'آزمون ایجاد',randomUUID()]),/PRO_WORKSPACE_EXISTS/);
 await denied(()=>rpc('admin_pro_create_workspace',[randomUUID(),'پنل دیگر',future,100,'آزمون ایجاد',randomUUID()]),/PRO_VERIFIED_USER_REQUIRED/);
 await db.exec('reset role');await db.query('delete from pro_pilot_access where user_id=$1',[stranger]);
 await asUser(stranger);equal(await rpc('pro_pilot_status',[]),true,'manually provisioned user needs no pilot');
 equal((await rpc('pro_workspace_status',[created])).can_write,true);
 if(process.env.PRO_TEST_DATABASE_URL){
  const {Client}=await import('pg');const clients=[new Client({connectionString:process.env.PRO_TEST_DATABASE_URL}),new Client({connectionString:process.env.PRO_TEST_DATABASE_URL})];
  try{for(const c of clients){await c.connect();await c.query("set role authenticated");await c.query("select set_config('request.jwt.claim.sub',$1,false)",[admin]);}
   const results=await Promise.allSettled(clients.map(c=>c.query('select admin_pro_set_license($1,4,\'active\',$2,1000,\'race test\',$3)',[org,future,randomUUID()])));
   equal(results.filter(r=>r.status==='fulfilled').length,1,'concurrent admin change one winner');
   equal(results.filter(r=>r.status==='rejected')[0].reason.message.includes('PRO_STALE_REVISION'),true);
  }finally{for(const c of clients)await c.end();}
 }
 await db.exec('reset role');
}
