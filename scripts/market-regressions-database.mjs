import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function regressions({db,user,other,as,store,org}){
 await db.exec('reset role');
 const revision=(await db.query('select revision from member_catalog_version')).rows[0].revision;
 const oldProfile=(await db.query('select to_jsonb(p) as p from user_profiles p where id=$1',[other])).rows[0].p;
 await db.query('update user_profiles set weight=120 where id=$1',[other]);
 await assert.rejects(()=>db.query("select member_store_preflight($1,$2,'{}',false,$3,null)",[other,revision,JSON.stringify(oldProfile)]),/PROFILE_CHANGED/);
 // Server-owned leases: failure releases the allowance, success stores once and blocks the next five days.
 const first=randomUUID(),second=randomUUID();
 assert.equal((await db.query('select member_begin_body_scan($1,$2) a',[other,first])).rows[0].a,true);
 assert.equal((await db.query('select member_begin_body_scan($1,$2) a',[other,randomUUID()])).rows[0].a,false);
 await db.query('select member_finish_body_scan($1,$2,null)',[other,first]);
 assert.equal((await db.query('select member_begin_body_scan($1,$2) a',[other,second])).rows[0].a,true);
 const result={bodyFatPct:25,biologicalAge:30,bodyType:'endomorph',estimatedMuscleMass:'average',confidence:'low',narrative:'برآورد تصویری آزمایشی'};
 await db.query('select member_finish_body_scan($1,$2,$3)',[other,second,JSON.stringify(result)]);
 await db.query('select member_finish_body_scan($1,$2,null)',[other,second]);
 assert.equal((await db.query('select member_begin_body_scan($1,$2) a',[other,randomUUID()])).rows[0].a,false);
 await as(other);
 assert.deepEqual((await db.query('select result from member_body_reports')).rows.map(r=>r.result),[result]);
 await assert.rejects(()=>db.query('select member_finish_body_scan($1,$2,null)',[other,second]),/permission denied/);
 await as(user);assert.equal((await db.query('select * from member_body_reports')).rows.length,0);
 await db.exec('reset role');
 // Trial is not a successful monetary payment, and is not a paid conversion.
 const trialUser=randomUUID();await db.query("insert into auth.users(id,phone,phone_confirmed_at) values($1,'989155550003',now())",[trialUser]);
 await db.query('insert into user_profiles(id,weight,height,onboarding_completed) values($1,80,178,true)',[trialUser]);
 const pre=await store(trialUser);
 const trial=(await db.query("select member_begin_order($1,'trial',0,3,$2,false) o",[trialUser,pre])).rows[0].o;
 await as(user);const before=(await db.query('select admin_business_pulse(30) p')).rows[0].p;
 await db.exec('reset role');await db.query('select billing_settle($1,null,0)',[trial.id]);
 await as(user);const after=(await db.query('select admin_business_pulse(30) p')).rows[0].p;
 assert.equal(after.payments.successful,before.payments.successful);assert.equal(after.payments.trials,before.payments.trials+1);
 const funnel=(await db.query('select admin_member_funnel(30) f')).rows[0].f;assert.equal(funnel.paid,0);assert.equal(funnel.trial,1);
 await db.exec('reset role');
 // Reject changes to an unexpired paid Pro package rather than dropping old benefits.
 await assert.rejects(()=>db.query("select pro_begin_checkout($1,'combined',1,(select (prices->>'1')::bigint from pro_offers where code='combined'))",[user]),/PRO_PLAN_CHANGE_REQUIRES_SUPPORT/);
 assert.equal((await db.query('select nutrition from pro_module_access where organization_id=$1',[org])).rows[0].nutrition,true);
 // Sandbox settlement must not create a workspace or commercial license.
 await as(other);await db.query("select pro_register('متخصص آزمایشی','training',false)");await db.exec('reset role');
 await db.query("update billing_settings set mode='sandbox' where id");
 const sandbox=(await db.query("select pro_begin_checkout($1,'combined',1,(select (prices->>'1')::bigint from pro_offers where code='combined')) o",[other])).rows[0].o;
 await db.query("update payment_orders set authority='S123456789012345678901234567890126' where id=$1",[sandbox.id]);
 await db.query("select billing_settle($1,'12348',100)",[sandbox.id]);await db.query("update billing_settings set mode='live' where id");
 assert.equal((await db.query('select organization_id from pro_applications where user_id=$1',[other])).rows[0].organization_id,null);
 // Atomic eaten/skip transitions are date-scoped and independent extras never replace the planned meal.
 const meal={slot:'breakfast',label:'صبحانه',templateId:'test',templateName:'تست',components:[],totalKcal:200,totalProtein:10,totalCarbs:20,totalFat:8};
 await db.query("insert into daily_meal_checkins(user_id,plan_date,meal_slot,template_id,meal_snapshot) values($1,current_date,'breakfast','test',$2)",[trialUser,JSON.stringify(meal)]);
 await db.query("insert into member_skipped_meals values($1,current_date,'breakfast')",[trialUser]);
 assert.equal((await db.query('select count(*)::int n from daily_meal_checkins where user_id=$1',[trialUser])).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from member_skipped_meals where user_id=$1 and plan_date=current_date+1',[trialUser])).rows[0].n,0);
 await db.query("insert into daily_meal_checkins(user_id,plan_date,meal_slot,template_id,meal_snapshot) values($1,current_date,'breakfast','test',$2)",[trialUser,JSON.stringify(meal)]);
 assert.equal((await db.query('select count(*)::int n from member_skipped_meals where user_id=$1',[trialUser])).rows[0].n,0);
 await as(trialUser);
 for(let i=0;i<2;i++)await db.query("insert into member_extra_foods(id,user_id,plan_date,meal_slot,meal_snapshot) values($1,$2,current_date,'breakfast',$3)",[randomUUID(),trialUser,JSON.stringify(meal)]);
 assert.equal((await db.query('select * from member_extra_foods')).rows.length,2);
 assert.equal((await db.query('select * from daily_meal_checkins')).rows.length,1);
 await as(other);assert.equal((await db.query('select * from member_extra_foods')).rows.length,0);
 await db.exec('reset role');
 console.log('PASS regressions: stale profile rejected before storage; durable scan success/failure/reopen/owner access; free trial excluded from paid metrics; active Pro benefits protected; sandbox never provisions live access; dated skip/eaten transitions; multiple independent extra foods and RLS');
}
