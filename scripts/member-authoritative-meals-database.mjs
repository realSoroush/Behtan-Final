import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function testMemberMealCommit(db, user, unpaid) {
  const day = (await db.query("select ((now() at time zone 'Asia/Tehran')::date)::text as d")).rows[0].d;
  const read = async (actor = user, date = day) => (await db.query(
    'select member_read_meal_day($1,$2,null) as state', [actor, date],
  )).rows[0].state;
  const plan = { isWorkoutDay: false, targets: {}, meals: [{ slot: 'breakfast', templateId: 'server-test' }] };
  const revision = (await db.query('select revision::text from member_catalog_version')).rows[0].revision;
  const commit = async ({ date = day, key, hash = 'a'.repeat(64), profile, catalogRevision = revision, intakeRevision, version = null }) =>
    (await db.query('select member_commit_meal_day($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true,$11) as result',
      [user, date, key, hash, profile, catalogRevision, intakeRevision, version, 'server-test', plan, 'c'.repeat(64)])).rows[0].result;

  await assert.rejects(() => read(unpaid), /ACCESS_DENIED/);
  const yesterday = (await db.query("select ((now() at time zone 'Asia/Tehran')::date - 1)::text as d")).rows[0].d;
  await assert.rejects(() => read(user, yesterday), /INVALID_MEAL_DATE/);
  await db.exec('set role authenticated');
  await assert.rejects(() => read(), /permission denied/);
  await assert.rejects(() => db.query('select * from member_meal_schedule_operations'), /permission denied/);
  await db.exec('reset role; begin');

  const denied = async (call, error) => {
    await db.exec('savepoint denied_operation');
    try { await assert.rejects(call, error); }
    finally { await db.exec('rollback to denied_operation; release denied_operation'); }
  };

  try {
    const original = await read();
    const request = { key: randomUUID(), profile: original.profile, intakeRevision: original.intake_revision };
    await db.query(`insert into daily_meal_checkins(user_id,plan_date,meal_slot,template_id,meal_snapshot)
      values($1,$2,'breakfast','test','{"slot":"breakfast"}')`, [user, day]);
    await denied(() => commit(request), /STALE_INTAKE/);
    const eaten = await read();
    assert(eaten.checkins.breakfast);
    await db.query("insert into member_skipped_meals values($1,$2,'breakfast')", [user, day]);
    const skipped = await read();
    assert(!skipped.checkins.breakfast);
    assert.deepEqual(skipped.skipped, ['breakfast']);
    assert.notEqual(skipped.intake_revision, eaten.intake_revision);
    await db.query(`insert into member_extra_foods(id,user_id,plan_date,meal_slot,meal_snapshot)
      values($1,$2,$3,'lunch','{"slot":"lunch"}')`, [randomUUID(), user, day]);
    const latest = await read();
    assert.notEqual(latest.intake_revision, skipped.intake_revision);
    await denied(() => commit({ ...request, intakeRevision: latest.intake_revision, catalogRevision: '0' }), /STALE_CONTEXT/);
    const fresh = { ...request, intakeRevision: latest.intake_revision };
    const saved = await commit(fresh);
    assert.equal((await read()).schedule.server_verified, true);
    assert.deepEqual(await commit(fresh), saved, 'Lost response replay returns the committed result');
    await denied(() => commit({ ...fresh, hash: 'b'.repeat(64) }), /REQUEST_CONFLICT/);
    await denied(() => commit({ ...fresh, key: randomUUID() }), /STALE_PLAN/);
    await db.query('update user_profiles set weight=82 where id=$1', [user]);
    await denied(() => commit({ ...fresh, key: randomUUID(), version: saved.updated_at }), /STALE_CONTEXT/);

    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
    await db.exec('set local role authenticated');
    await db.query("select save_member_meal_schedule_v3($1,'legacy',$2,$3,true,false)",
      [day, JSON.stringify([{ date: day, plan, expected_updated_at: saved.updated_at }]), original.profile.dietary_preferences_json]);
    await db.exec('reset role');
    assert.equal((await read()).schedule.server_verified, false, 'Legacy overwrite invalidates the service trust marker');
  } finally { await db.exec('rollback; reset role'); }

  if (process.env.PRO_TEST_DATABASE_URL) {
    const { Client } = await import('pg');
    const second = new Client({ connectionString: process.env.PRO_TEST_DATABASE_URL });
    await second.connect();
    try {
      const concurrentDay = (await db.query("select ((now() at time zone 'Asia/Tehran')::date + 6)::text as d")).rows[0].d;
      const before = await read(user, concurrentDay);
      await second.query('begin');
      await second.query("insert into member_skipped_meals values($1,$2,'lunch')", [user, concurrentDay]);
      const race = assert.rejects(() => commit({ date: concurrentDay, key: randomUUID(),
        profile: before.profile, intakeRevision: before.intake_revision }), /STALE_INTAKE/);
      await second.query('commit');
      await race;
      const after = await read(user, concurrentDay);
      assert.deepEqual(after.skipped, ['lunch']);
      assert.equal(after.schedule, null);
      await db.query('delete from member_skipped_meals where user_id=$1 and plan_date=$2', [user, concurrentDay]);
      await db.query('delete from member_meal_day_revisions where user_id=$1 and plan_date=$2', [user, concurrentDay]);
      console.log('PASS native PostgreSQL two connections: concurrent intake prevents stale server commit');
    } finally { await second.end(); }
  }
  console.log('PASS member meal SQL: service-only, unpaid denial, intake/profile/catalog/plan CAS, lost response replay and legacy marker invalidation');
}
