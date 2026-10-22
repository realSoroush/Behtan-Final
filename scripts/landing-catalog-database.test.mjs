import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
try {
  // Apply the actual original table migration, with its minimal prerequisites.
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create table public.user_profiles (subscription_tier text);
    create function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;
    grant usage on schema public to anon,authenticated,service_role;
  `);
  await db.exec(await readFile(new URL('../supabase/migrations/20260907_013_subscription_plans.sql', import.meta.url), 'utf8'));
  await db.exec(await readFile(new URL('../supabase/migrations/20261022_031_public_subscription_catalog.sql', import.meta.url), 'utf8'));
  await db.exec("update public.subscription_plans set is_active=false where code='gold'");
  await db.exec('set role anon');
  let rows = (await db.query('select public.public_subscription_catalog() as offers')).rows[0].offers;
  assert.equal(rows.length,1);
  assert.equal(rows[0].code,'silver');
  assert.equal(rows[0].price_toman,149000);
  assert.ok(Array.isArray(rows[0].features));
  assert.deepEqual(Object.keys(rows[0]).sort(),['code','name','emoji','price_toman','price_note','duration_days','features','badge','theme','sort_order','is_active'].sort());
  for (const sql of ["select * from public.subscription_plans", "update public.subscription_plans set price_toman=0", "delete from public.subscription_plans"]) {
    await assert.rejects(db.query(sql), /permission denied/);
  }
  await db.exec("reset role; update public.subscription_plans set name='عنوان ویرایش‌شده', price_toman=0 where code='silver'; set role anon");
  rows=(await db.query('select public.public_subscription_catalog() as offers')).rows[0].offers;
  assert.equal(rows[0].name,'عنوان ویرایش‌شده');assert.equal(rows[0].price_toman,0);
  await db.exec('reset role; update public.subscription_plans set is_active=false; set role anon');
  assert.deepEqual((await db.query('select public.public_subscription_catalog() as offers')).rows[0].offers,[]);
  await db.exec('reset role; update public.subscription_plans set is_active=true; set role authenticated');
  assert.equal((await db.query('select public.public_subscription_catalog() as offers')).rows[0].offers.length,2);
  await assert.rejects(db.query('update public.subscription_plans set price_toman=0'), /permission denied/);
  console.log('✓ Public catalog SQL: anonymous read, active-only filtering, exact public fields, live admin changes, free and empty catalog, denied table reads/writes.');
} finally { await db.close(); }
