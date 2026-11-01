import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { emptyRealIntake } from '../src/professional/menuPlan.ts';

export async function testSpecialistProfiles({ db }) {
  await db.exec('reset role');
  const before = (await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by 1,2")).rows;
  await db.exec(await readFile(new URL('../supabase/migrations/20261101083339_040_pro_specialist_profile.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/verify_pro_specialist_profile.sql', import.meta.url), 'utf8'));
  const after = (await db.query("select tablename,policyname,qual,with_check from pg_policies where schemaname='public' and tablename<>'pro_specialist_profiles' order by 1,2")).rows;
  assert.deepEqual(after, before, 'Existing RLS policies unchanged');
  const author = randomUUID(), viewer = randomUUID(), outsider = randomUUID(), unverified = randomUUID();
  for (const [i, id] of [author, viewer, outsider, unverified].entries()) await db.query('insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,$3)', [id, '98915555444' + i, id === unverified ? null : new Date()]);
  const as = async (id, role = 'authenticated') => {
    await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']); await db.exec('set role ' + role);
  };
  const rpc = async (name, args = []) => (await db.query(`select public.${name}(${args.map((_, i) => '$' + (i + 1)).join(',')}) result`, args)).rows[0].result;
  const details = ['متخصص اصلی', '۰۹۱۱ ۱۲۳-۴۵۶۷', 'nutritionist', 'مازندران', 'ساری', 'خیابان فرهنگ، واحد ۴۰۱'];
  await as(author);
  assert.equal((await rpc('pro_specialist_profile')).completed, false);
  const saved = await rpc('pro_save_specialist_profile', details);
  assert.equal(saved.completed, true); assert.equal(saved.contact_phone, '09111234567');
  assert.deepEqual(await rpc('pro_specialist_profile'), saved, 'Profile persists across reads');
  assert.equal((await rpc('pro_save_specialist_profile', details)).full_name, details[0], 'Retry is an upsert');
  for (const [index, value] of [[0,' '],[1,'abc'],[1,null],[2,'administrator'],[2,null],[3,' '],[4,null],[5,'x']]) {
    const invalid = [...details]; invalid[index] = value;
    await assert.rejects(() => rpc('pro_save_specialist_profile', invalid), /PRO_INVALID_PROFILE/);
  }
  assert.equal((await rpc('pro_specialist_profile')).full_name, details[0], 'Invalid writes do not replace a complete profile');
  for (const sql of ["update public.pro_specialist_profiles set full_name='forged'", 'delete from public.pro_specialist_profiles', "insert into public.pro_specialist_profiles(user_id) values(auth.uid())"]) await assert.rejects(() => db.exec(sql), /permission denied/);
  const org = await rpc('pro_register', ['متخصص اصلی', 'nutrition', true]);
  const intake = { ...emptyRealIntake(), display_name: 'مراجع آزمایشی پروفایل', birth_date: '1992-04-23', height_cm: 165, weight_kg: 75, safety_confirmed: true };
  const record = (await rpc('pro_save_real_case', [org, null, 0, intake, randomUUID()])).id;
  const content = { version: 1, reviewed: true, title: 'برنامه آزمایشی', notes: '', sections: [{ title: 'جلسه', lines: [{ name: 'حرکت', details: 'طبق دستور متخصص' }] }] };
  const plan = await rpc('pro_save_authored_plan', [org, record, 1, 'training', content, randomUUID()]);
  await as(viewer); await rpc('pro_save_specialist_profile', ['همکار مشاهده‌کننده', '01133334444', 'fitness_coach', 'تهران', 'تهران', 'آدرس همکار تست']);
  assert.deepEqual((await db.query('select user_id from public.pro_specialist_profiles')).rows.map(r => r.user_id), [viewer], 'No cross-user profile directory');
  await assert.rejects(() => rpc('pro_plan_specialist', [org, 'authored', plan]), /PRO_ACCESS_DENIED/);
  await db.exec('reset role');
  await db.query("insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '1 day')", [viewer]);
  await db.query("insert into pro_memberships(organization_id,user_id,roles) values($1,$2,array['owner'])", [org, viewer]);
  await as(viewer);
  assert.equal((await rpc('pro_plan_specialist', [org, 'authored', plan])).full_name, 'متخصص اصلی', 'PDF uses actual author, not viewer');
  await assert.rejects(() => rpc('pro_plan_specialist', [randomUUID(), 'authored', plan]), /PRO_ACCESS_DENIED/);
  await assert.rejects(() => rpc('pro_plan_specialist', [org, 'authored', randomUUID()]), /PRO_ACCESS_DENIED/);
  await assert.rejects(() => rpc('pro_plan_specialist', [org, 'not-a-plan-kind', plan]), /PRO_INVALID_REQUEST/);
  // Exercise both engine plan branches using existing synthetic snapshots, without changing them.
  await db.exec('reset role');
  for (const [kind, table, authorColumn] of [['nutrition','pro_real_plans','recorded_by'],['training','pro_training_plans','actor_id']]) {
    const candidate = (await db.query(`select id,organization_id,${authorColumn} as author from public.${table} order by id limit 1`)).rows[0];
    assert(candidate, kind + ' synthetic plan exists');
    await db.query("insert into public.pro_specialist_profiles values($1,'متخصص موتور','09111234567','nutritionist','مازندران','ساری','آدرس متخصص موتور',now()) on conflict(user_id) do nothing", [candidate.author]);
    await db.query("insert into pro_memberships(organization_id,user_id,roles) values($1,$2,array['owner']) on conflict(organization_id,user_id) do update set status='active',roles=array['owner']", [candidate.organization_id,viewer]);
    // Training is attributed to the approver when approval exists.
    if (kind === 'training') await db.query("insert into public.pro_specialist_profiles select approved_by,'متخصص تأییدکننده','09111234567','fitness_coach','مازندران','ساری','آدرس متخصص تأییدکننده',now() from public.pro_training_approvals where plan_id=$1 on conflict(user_id) do nothing", [candidate.id]);
    await as(viewer);
    assert(await rpc('pro_plan_specialist', [candidate.organization_id, kind, candidate.id]), kind + ' author resolved');
    await db.exec('reset role');
  }
  await as(unverified);
  await assert.rejects(() => rpc('pro_specialist_profile'), /PRO_AUTH_REQUIRED/);
  await assert.rejects(() => rpc('pro_save_specialist_profile', details), /PRO_AUTH_REQUIRED/);
  await as(null, 'anon');
  await assert.rejects(() => rpc('pro_specialist_profile'), /permission denied/);
  await assert.rejects(() => rpc('pro_save_specialist_profile', details), /permission denied/);
  await assert.rejects(() => rpc('pro_plan_specialist', [org, 'authored', plan]), /permission denied/);
  await as(outsider);
  assert.equal((await db.query('select * from public.pro_specialist_profiles')).rows.length, 0);
  await db.exec('reset role');
  assert.equal((await db.query('select phone from auth.users where id=$1', [author])).rows[0].phone, '989155554440', 'Auth OTP phone unchanged');
  console.log('PASS specialist SQL: OTP, normalization, required fields, retry, grants, self-only RLS, real document author, cross-tenant denial, existing policies unchanged');
}
