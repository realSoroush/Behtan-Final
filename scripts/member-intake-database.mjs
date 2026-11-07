import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export async function createSyntheticIntakeMember(db) {
  const user=randomUUID(),order=randomUUID();
  await db.query("insert into auth.users(id,phone,phone_confirmed_at) values($1,'989100000000',now())",[user]);
  await db.query("insert into user_profiles(id,weight,height,onboarding_completed) values($1,85,178,true)",[user]);
  await db.query("insert into payment_orders(id,user_id,plan_code,plan_name,price_toman,duration_days,mode) select $1,$2,'trial','Synthetic test',0,3,mode from billing_settings where id",[order,user]);
  await db.query("insert into user_subscriptions(user_id,source_order_id,plan_code,mode,starts_at,expires_at) select $1,$2,'trial',mode,now()-interval '1 hour',now()+interval '1 day' from billing_settings where id",[user,order]);
  return user;
}
export async function testMemberIntake(db) {
  await db.exec('reset role');
  const user=await createSyntheticIntakeMember(db);
  const day=(await db.query("select ((now() at time zone 'Asia/Tehran')::date)::text d")).rows[0].d;
  const read=async()=> (await db.query('select member_read_meal_day($1,$2,null) state',[user,day])).rows[0].state;
  const snapshot={slot:'breakfast',templateId:'synthetic-history',consumed:true,components:[{}]};
  const args=(s,kind,options={})=>[user,day,options.id??randomUUID(),options.hash??'d'.repeat(64),s.profile,s.catalog_revision,s.intake_revision,s.schedule?.updated_at??null,kind,kind==='extra-remove'?null:'breakfast',['record','extra-add'].includes(kind)?snapshot:null,options.extra??null];
  const statement='select member_commit_intake($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) result';
  const call=async(a,connection=db)=>(await connection.query(statement,a)).rows[0].result;
  const before=await read(), operation=args(before,'record');
  const saved=await call(operation);
  assert.equal(saved.kind,'intake');assert.equal(saved.replayed,false);
  assert.deepEqual((await read()).checkins.breakfast,snapshot);assert(BigInt(saved.intakeRevision)>BigInt(before.intake_revision));
  assert.deepEqual(await call(operation),{...saved,replayed:true},'Lost response replays one committed effect');
  await assert.rejects(()=>call(args(before,'skip')),/STALE_INTAKE/);
  await assert.rejects(()=>call(args(before,'record',{id:operation[2],hash:'e'.repeat(64)})),/REQUEST_CONFLICT/);
  let s=await read();
  await assert.rejects(()=>call([...args(s,'skip').slice(0,7),'2020-01-01T00:00:00Z',...args(s,'skip').slice(8)]),/STALE_PLAN/);
  const staleProfile=args(s,'skip');staleProfile[4]={...s.profile,weight:333};
  await assert.rejects(()=>call(staleProfile),/STALE_CONTEXT/);
  const tomorrow=args(s,'skip');tomorrow[1]='2000-01-01';await assert.rejects(()=>call(tomorrow),/INVALID_MEAL_DATE/);
  await call(args(s,'skip'));const skipped=await read();assert(!skipped.checkins.breakfast);assert(skipped.skipped.includes('breakfast'));
  s=await read();await call(args(s,'undo-skip'));assert(!(await read()).skipped.includes('breakfast'));
  const extra=args(await read(),'extra-add');await call(extra);await call(extra);
  assert.equal((await read()).extra_food_ids.filter(id=>id===extra[2]).length,1);
  await call(args(await read(),'extra-remove',{extra:extra[2]}));
  await assert.rejects(async()=>call(args(await read(),'extra-remove',{extra:extra[2]})),/INTAKE_NOT_FOUND/);

  // Native PostgreSQL: real independent connections, not Promise.all on one client.
  if(process.env.PRO_TEST_DATABASE_URL){
    const {Client}=await import('pg');const second=new Client({connectionString:process.env.PRO_TEST_DATABASE_URL});await second.connect();
    try{
      const initial=await read();const a=args(initial,'record'), b=args(initial,'skip');
      const results=await Promise.allSettled([call(a),call(b,second)]);
      assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
      assert.match(results.find(r=>r.status==='rejected').reason.message,/STALE_INTAKE/);
      const repeat=args(await read(),'record');
      const both=await Promise.all([call(repeat),call(repeat,second)]);
      assert.equal(both.filter(r=>r.replayed).length,1);
      // An intake commit and plan commit observed from one state cannot both win.
      const current=await read(), intake=args(current,'skip');
      const planArgs=[user,day,randomUUID(),'f'.repeat(64),current.profile,current.catalog_revision,current.intake_revision,
        current.schedule?.updated_at??null,'synthetic',{meals:[{slot:'breakfast'}]},false,'a'.repeat(64)];
      const race=await Promise.allSettled([call(intake),second.query('select member_commit_meal_day($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)',planArgs)]);
      assert.equal(race.filter(r=>r.status==='fulfilled').length,1);
      assert.match(race.find(r=>r.status==='rejected').reason.message,/STALE_INTAKE|STALE_PLAN/);
    }finally{await second.end();}
  }
  await db.exec(await readFile(new URL('../supabase/migrations/20261107195535_052_close_legacy_member_writes.sql',import.meta.url),'utf8'));
  for(const role of ['anon','authenticated']){
    for(const table of ['daily_meal_checkins','member_skipped_meals','member_extra_foods','member_meal_schedule']){
      for(const permission of ['INSERT','UPDATE','DELETE'])
        assert.equal((await db.query('select has_table_privilege($1,$2,$3) allowed',[role,table,permission])).rows[0].allowed,false);
      for(const permission of ['INSERT','UPDATE'])
        assert.equal((await db.query('select has_any_column_privilege($1,$2,$3) allowed',[role,table,permission])).rows[0].allowed,false);
    }
    await db.exec('set role '+role);
    await assert.rejects(()=>call(operation),/permission denied/);
    await assert.rejects(()=>db.query('select save_member_meal_schedule_v3($1,\'test\',\'[]\',\'{}\',false,false)',[day]),/permission denied/);
    await db.exec('reset role');
  }
  console.log('PASS intake SQL: receipts, revision CAS, plan/profile/date conflicts, extra identity, ownership, closure'+(process.env.PRO_TEST_DATABASE_URL?', real two-connection intake/intake and intake/plan races':''));
}
