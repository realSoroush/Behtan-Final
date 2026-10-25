import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/prepare-local-dev.mjs"], {
  stdio: "pipe",
});
const db = new PGlite();
try {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,phone text,email text,phone_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;",
  );
  let sql = await readFile(
    ".local-supabase/supabase/migrations/202610240001_local_baseline.sql",
    "utf8",
  );
  sql = sql.replace('create extension if not exists "uuid-ossp";', "");
  await db.exec(sql);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from subscription_plans where is_active",
      )
    ).rows[0].n,
    3,
  );
  assert.equal(
    (await db.query("select mode,checkout_enabled from billing_settings"))
      .rows[0].mode,
    "sandbox",
  );
  assert(
    (
      await db.query(
        "select count(*)::int n from meal_templates where is_active",
      )
    ).rows[0].n > 10,
  );
  console.log(
    "PASS complete generated local bootstrap schema, seeds, all migrations, sandbox settings and three active plans in isolated PostgreSQL-compatible engine",
  );
} finally {
  await db.close();
}
