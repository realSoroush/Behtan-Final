import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
export async function v3Regressions({db,as,store}){
 await db.exec('reset role');const user=randomUUID();
 await db.query("insert into auth.users(id,phone,phone_confirmed_at) values($1,'989155550019',now())",[user]);await db.query('insert into user_profiles(id,weight,height,onboarding_completed) values($1,80,178,true)',[user]);
 const first=await store(user),price=Number((await db.query("select price_toman p from subscription_plans where code='gold'")).rows[0].p);
 const order=(await db.query("select member_begin_order($1,'gold',$2,30,$3,false) o",[user,price,first])).rows[0].o;
 await db.query("update payment_orders set status='pending',authority='S123456789012345678901234567890198' where id=$1",[order.id]);
 await db.query('update user_profiles set weight=120 where id=$1',[user]);const next=await store(user);
 await assert.rejects(()=>db.query("select member_begin_order($1,'gold',$2,30,$3,false)",[user,price,next]),/PENDING_ORDER_REVIEW_REQUIRED/);
 // The bank may have already taken the money: settlement is durable, and rebuild is available without a second purchase.
 await db.query("select billing_settle($1,'99551',100)",[order.id]);assert.equal((await db.query('select member_training_access($1) a',[user])).rows[0].a,true);
 assert.equal((await db.query('select member_activate_training($1) p',[user])).rows[0].p,null);
 const current=(await db.query('select to_jsonb(p) p from user_profiles p where id=$1',[user])).rows[0].p;
 await db.query('update user_profiles set weight=121 where id=$1',[user]);
 await assert.rejects(()=>db.query("select member_store_training($1,$2,'legacy',$3)",[user,JSON.stringify({input:{days:[0,2,4]}}),JSON.stringify(current)]),/PROFILE_CHANGED/);
 const expected=(await db.query('select to_jsonb(p) p from user_profiles p where id=$1',[user])).rows[0].p;
 await db.query("select member_store_training($1,$2,'legacy',$3)",[user,JSON.stringify({input:{days:[0,2,4]}}),JSON.stringify(expected)]);
 const hash=(await db.query('select profile_hash from member_training_plans where user_id=$1',[user])).rows[0].profile_hash;
 assert.deepEqual(JSON.parse(hash).workout_weekdays,[0,2,4]);await db.query('update user_profiles set workout_weekdays=array[1,3,5] where id=$1',[user]);
 assert.notDeepEqual(JSON.parse(hash),(await db.query("select to_jsonb(p)-'updated_at' p from user_profiles p where id=$1",[user])).rows[0].p);
 await as(user);
 await db.query("insert into member_skipped_meals values($1,current_date,'breakfast') on conflict(user_id,plan_date,slot) do update set slot=excluded.slot",[user]);
 await db.query("insert into member_skipped_meals values($1,current_date,'breakfast') on conflict(user_id,plan_date,slot) do update set slot=excluded.slot",[user]);
 const operation=randomUUID();const meal=JSON.stringify({slot:'lunch',components:[],totalKcal:100});
 for(let attempt=0;attempt<2;attempt++)await db.query("insert into member_extra_foods(id,user_id,plan_date,meal_slot,meal_snapshot) values($1,$2,current_date,'lunch',$3) on conflict(id) do nothing",[operation,user,meal]);
 assert.equal((await db.query('select count(*)::int n from member_extra_foods where id=$1',[operation])).rows[0].n,1);
 await db.exec('reset role');await as(user);await db.query('delete from member_skipped_meals where user_id=$1',[user]);await db.exec('reset role');
 // No browser events exist for this customer; a real paid order must still appear in the authoritative cohort report.
 await db.query('insert into admin_members(user_id) values($1)',[user]);await as(user);
 const f=(await db.query('select admin_member_funnel(30) f')).rows[0].f;assert(f.paid>=1);assert(f.checkout>=f.paid);
 await db.exec('reset role');console.log('PASS V3 SQL: incompatible pending checkout blocked; paid access preserved for rebuild; stale training write rejected; exact weekdays invalidate plans; real authenticated skip upsert; paid conversion independent of browser event delivery');
}
