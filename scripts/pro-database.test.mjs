import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
// Native mode is ONLY for a disposable empty database with this exact name.
if (process.argv.includes("--native") && !process.env.PRO_TEST_DATABASE_URL)
  throw new Error("PRO_TEST_DATABASE_URL is required for native tests");
let db;
if (process.env.PRO_TEST_DATABASE_URL) {
  const { Client } = await import("pg");
  const client = new Client({
    connectionString: process.env.PRO_TEST_DATABASE_URL,
  });
  await client.connect();
  const { rows } = await client.query(
    "select current_database() as name, (select count(*)::int from pg_tables where schemaname in ('public','auth')) as tables",
  );
  assert.equal(
    rows[0].name,
    "behtan_pro_test",
    "Refusing to test another database",
  );
  assert.equal(rows[0].tables, 0, "Refusing to overwrite an existing database");
  db = {
    query: (s, p) => client.query(s, p),
    exec: (s) => client.query(s),
    close: () => client.end(),
  };
} else db = new PGlite();
let checks = 0;
const equal = (a, b, label) => {
  assert.deepEqual(a, b, label);
  checks++;
};
const denied = async (fn, regex = /permission denied|PRO_ACCESS_DENIED/) => {
  await assert.rejects(fn, regex);
  checks++;
};
try {
  await db.exec(`do $$begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end$$;
  create schema auth;
  create table auth.users(id uuid primary key,phone text,email text,phone_confirmed_at timestamptz,created_at timestamptz default now(),last_sign_in_at timestamptz);
  create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
  grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;`);
  const schema = await readFile(
    new URL("../supabase/schema.sql", import.meta.url),
    "utf8",
  );
  await db.exec(
    schema.replace('create extension if not exists "uuid-ossp";', ""),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/seed_nutrition_catalog.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const migration of [
    "20260915_016_admin_console.sql",
    "20260921_018_progress_journal.sql",
    "20260921_019_plan_revision_history.sql",
    "20260923_020_mobile_meal_catalog.sql",
    "20260923_021_member_profile_history.sql",
    "20261015_022_admin_test_scenarios.sql",
  ]) {
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${migration}`, import.meta.url),
        "utf8",
      ),
    );
  }
  const baselinePolicies = (
    await db.query(
      "select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname",
    )
  ).rows;
  // Simulate Supabase defaults: a migration must revoke inherited API grants.
  await db.exec(
    "alter default privileges in schema public grant all on tables to anon,authenticated;",
  );
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261019_023_pro_foundation.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  equal(
    (
      await db.query(
        "select schemaname,tablename,policyname,qual,with_check from pg_policies where schemaname='public' and tablename not like 'pro_%' order by tablename,policyname",
      )
    ).rows,
    baselinePolicies,
    "B2C policies unchanged",
  );
  const ids = {
    a: randomUUID(),
    b: randomUUID(),
    assistant: randomUUID(),
    practitioner: randomUUID(),
    outsider: randomUUID(),
    unverified: randomUUID(),
    expired: randomUUID(),
  };
  for (const [name, id] of Object.entries(ids))
    await db.query(
      "insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,$3)",
      [id, "989111111111", name === "unverified" ? null : new Date()],
    );
  for (const [name, id] of Object.entries(ids))
    if (name !== "outsider")
      await db.query(
        "insert into pro_pilot_access(user_id,expires_at) values($1,now()+case when $2='expired' then interval '-1 day' else interval '1 day' end)",
        [id, name],
      );
  const asUser = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id || "",
    ]);
    await db.exec(`set role ${role}`);
  };
  const rpc = async (name, args = []) =>
    (
      await db.query(
        `select to_jsonb(public.${name}(${args.map((_, i) => `$${i + 1}`).join(",")})) as result`,
        args,
      )
    ).rows[0].result;
  const rows = async (table) =>
    (await db.query(`select * from public.${table}`)).rows;
  await db.query("insert into admin_members(user_id) values($1)", [
    ids.outsider,
  ]);
  for (const name of ["outsider", "unverified", "expired"]) {
    await asUser(ids[name]);
    equal(await rpc("pro_pilot_status"), false, name);
    await denied(() => rpc("pro_create_sandbox_organization", [randomUUID()]));
    equal((await rows("pro_organizations")).length, 0, "No metadata leak");
  }
  await asUser(null, "anon");
  await denied(() => rpc("pro_pilot_status"));
  await denied(() => rows("pro_organizations"));
  await asUser(ids.a);
  equal(await rpc("pro_pilot_status"), true);
  const key = randomUUID();
  const a = await rpc("pro_create_sandbox_organization", [key]);
  equal(
    (await rpc("pro_create_sandbox_organization", [key])).id,
    a.id,
    "Org retry",
  );
  await denied(
    () => rpc("pro_create_sandbox_organization", [randomUUID()]),
    /PRO_SANDBOX_LIMIT/,
  );
  await denied(
    () => rpc("pro_create_sandbox_organization", [null]),
    /PRO_INVALID_REQUEST/,
  );
  await denied(() =>
    db.exec(
      "insert into pro_organizations(created_by,request_key) values(auth.uid(),gen_random_uuid())",
    ),
  );
  await denied(() =>
    db.query(
      "update pro_memberships set roles=array['owner','practitioner'] where user_id=$1",
      [ids.a],
    ),
  );
  await denied(() => db.exec("select * from pro_pilot_access"));
  await denied(() =>
    db.query(
      "insert into pro_practitioner_credentials(user_id,status,scope,expires_at,reviewed_at) values($1,'verified','nutrition',now()+interval '1 day',now())",
      [ids.a],
    ),
  );
  const pkey = randomUUID();
  const p = await rpc("pro_create_sandbox_patient", [a.id, pkey]);
  equal(
    (await rpc("pro_create_sandbox_patient", [a.id, pkey])).id,
    p.id,
    "Patient retry",
  );
  equal(
    (await rows("pro_audit_events")).length,
    2,
    "No duplicate audit on retry",
  );
  equal((await rows("pro_sandbox_patients")).length, 1);
  await asUser(ids.b);
  const b = await rpc("pro_create_sandbox_organization", [randomUUID()]);
  const pb = await rpc("pro_create_sandbox_patient", [b.id, randomUUID()]);
  equal(
    (await rows("pro_organizations")).map((o) => o.id),
    [b.id],
    "Tenant isolation",
  );
  equal(
    (await rows("pro_sandbox_patients")).map((o) => o.id),
    [pb.id],
  );
  await denied(() => rpc("pro_create_sandbox_patient", [a.id, randomUUID()]));
  equal(
    (await db.query("select * from pro_sandbox_patients where id=$1", [p.id]))
      .rows.length,
    0,
    "Guessed IDs hidden",
  );
  equal((await rows("pro_memberships")).length, 1);
  equal((await rows("pro_audit_events")).length, 2);
  await db.exec("reset role");
  for (const [name, role] of [
    ["assistant", "assistant"],
    ["practitioner", "practitioner"],
  ])
    await db.query(
      "insert into pro_memberships(organization_id,user_id,roles) values($1,$2,$3)",
      [a.id, ids[name], [role]],
    );
  await denied(
    () =>
      db.query(
        "insert into pro_sandbox_assignments(organization_id,patient_id,practitioner_id) values($1,$2,$3)",
        [a.id, pb.id, ids.practitioner],
      ),
    /foreign key/,
  );
  await denied(
    () =>
      db.query(
        "insert into pro_sandbox_assignments(organization_id,patient_id,practitioner_id) values($1,$2,$3)",
        [a.id, p.id, ids.b],
      ),
    /foreign key/,
  );
  await denied(
    () =>
      db.query(
        "update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2",
        [a.id, ids.a],
      ),
    /PRO_LAST_OWNER/,
  );
  await denied(
    () =>
      db.query(
        "delete from pro_memberships where organization_id=$1 and user_id=$2",
        [a.id, ids.a],
      ),
    /PRO_LAST_OWNER/,
  );
  await denied(
    () =>
      db.query(
        "update pro_memberships set organization_id=$1 where organization_id=$2",
        [b.id, a.id],
      ),
    /PRO_MEMBERSHIP_ID_IMMUTABLE/,
  );
  await asUser(ids.practitioner);
  equal(
    (await rows("pro_sandbox_patients")).length,
    0,
    "Unassigned practitioner",
  );
  await denied(() => rpc("pro_create_sandbox_patient", [a.id, randomUUID()]));
  await db.exec("reset role");
  await db.query(
    "insert into pro_sandbox_assignments(organization_id,patient_id,practitioner_id) values($1,$2,$3)",
    [a.id, p.id, ids.practitioner],
  );
  await asUser(ids.practitioner);
  equal(
    (await rows("pro_sandbox_patients")).map((x) => x.id),
    [p.id],
    "Assigned reception only",
  );
  equal(
    (await rows("pro_audit_events")).length,
    0,
    "No team audit for practitioners",
  );
  equal(
    (await rows("pro_memberships")).map((x) => x.user_id),
    [ids.practitioner],
    "Own membership only",
  );
  await db.exec("reset role");
  await db.query(
    "update pro_sandbox_assignments set status='revoked' where patient_id=$1",
    [p.id],
  );
  await asUser(ids.practitioner);
  equal(
    (await rows("pro_sandbox_patients")).length,
    0,
    "Revoked assignment effective without JWT refresh",
  );
  await asUser(ids.assistant);
  equal((await rows("pro_sandbox_patients")).length, 1);
  await denied(
    () => rpc("pro_create_sandbox_patient", [a.id, pkey]),
    /PRO_REQUEST_CONFLICT/,
  );
  await rpc("pro_create_sandbox_patient", [a.id, randomUUID()]);
  equal((await rows("pro_sandbox_patients")).length, 2);
  equal(
    (await rows("pro_memberships")).length,
    1,
    "Assistant cannot enumerate team",
  );
  equal((await rows("pro_practitioner_credentials")).length, 0);
  await denied(() => db.exec("delete from pro_sandbox_patients"));
  await db.exec("reset role");
  await db.query(
    "update pro_memberships set status='revoked' where user_id=$1",
    [ids.assistant],
  );
  await asUser(ids.assistant);
  equal(
    (await rows("pro_sandbox_patients")).length,
    0,
    "Membership revocation immediate",
  );
  await denied(() => rpc("pro_create_sandbox_patient", [a.id, randomUUID()]));
  await db.exec("reset role");
  await db.query(
    "update pro_organizations set status='suspended' where id=$1",
    [a.id],
  );
  await asUser(ids.a);
  equal((await rows("pro_organizations")).length, 0, "Suspended org invisible");
  await denied(() => rpc("pro_create_sandbox_organization", [key]));
  await denied(() => rpc("pro_create_sandbox_patient", [a.id, randomUUID()]));
  await db.exec("reset role");
  await db.query("update pro_organizations set status='active' where id=$1", [
    a.id,
  ]);
  await denied(
    () => db.exec("update pro_audit_events set subject_id=gen_random_uuid()"),
    /PRO_IMMUTABLE_AUDIT/,
  );
  await denied(
    () => db.exec("delete from pro_audit_events"),
    /PRO_IMMUTABLE_AUDIT/,
  );
  await db.query("update pro_memberships set roles=array['owner','practitioner'] where organization_id=$1 and user_id=$2", [a.id,ids.practitioner]);
  await db.query("update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2", [a.id,ids.a]);
  await asUser(ids.a);
  await denied(() => rpc("pro_create_sandbox_organization", [key]));
  await db.exec("reset role");
  await db.query("update pro_memberships set status='active' where organization_id=$1 and user_id=$2", [a.id,ids.a]);
  await db.query("update pro_memberships set roles=array['practitioner'] where organization_id=$1 and user_id=$2", [a.id,ids.practitioner]);
  // Hard cap / transaction rollback: rejected writes produce no orphan audit.
  for (let i = 2; i < 100; i++)
    await db.query(
      "insert into pro_sandbox_patients(organization_id,request_key,created_by) values($1,$2,$3)",
      [a.id, randomUUID(), ids.a],
    );
  await asUser(ids.a);
  const before = (await rows("pro_audit_events")).length;
  await denied(
    () => rpc("pro_create_sandbox_patient", [a.id, randomUUID()]),
    /PRO_SANDBOX_LIMIT/,
  );
  equal((await rows("pro_sandbox_patients")).length, 100);
  equal((await rows("pro_audit_events")).length, before);
  await db.exec("reset role");
  // No synthetic client escaped into established B2C storage/payments.
  for (const table of ["user_profiles", "payment_orders", "user_subscriptions"])
    equal((await rows(table)).length, 0, table);
  equal(
    (await db.query("select count(*)::int as n from auth.users")).rows[0].n,
    Object.keys(ids).length,
  );
  const tables = [
    "pro_pilot_access",
    "pro_organizations",
    "pro_memberships",
    "pro_practitioner_credentials",
    "pro_sandbox_patients",
    "pro_sandbox_assignments",
    "pro_audit_events",
  ];
  for (const table of tables)
    equal(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          [`public.${table}`],
        )
      ).rows[0].relrowsecurity,
      true,
      table,
    );
  if (process.env.PRO_TEST_DATABASE_URL) {
    const { Client } = await import("pg");
    const clients = [
      new Client({ connectionString: process.env.PRO_TEST_DATABASE_URL }),
      new Client({ connectionString: process.env.PRO_TEST_DATABASE_URL }),
    ];
    try {
      await Promise.all(clients.map((c) => c.connect()));
      for (const c of clients) {
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids.b,
        ]);
        await c.query("set role authenticated");
      }
      const concurrentKey = randomUUID();
      const results = await Promise.all(
        clients.map((c) =>
          c.query(
            "select to_jsonb(public.pro_create_sandbox_patient($1,$2)) as result",
            [b.id, concurrentKey],
          ),
        ),
      );
      equal(
        results[0].rows[0].result.id,
        results[1].rows[0].result.id,
        "Concurrent retry produces one case",
      );
      equal(
        (
          await db.query(
            "select count(*)::int as n from pro_sandbox_patients where organization_id=$1 and request_key=$2",
            [b.id, concurrentKey],
          )
        ).rows[0].n,
        1,
      );
      await db.query(
        "update pro_memberships set roles=array['owner','practitioner'] where organization_id=$1 and user_id=$2",
        [a.id, ids.practitioner],
      );
      for (const c of clients) await c.query("reset role");
      const revocations = await Promise.allSettled(
        clients.map((c, i) =>
          c.query(
            "update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2",
            [a.id, i ? ids.practitioner : ids.a],
          ),
        ),
      );
      equal(
        revocations.filter((r) => r.status === "fulfilled").length,
        1,
        "Concurrent owner removal cannot orphan org",
      );
      equal(
        revocations
          .filter((r) => r.status === "rejected")
          .map((r) => r.reason.message),
        ["PRO_LAST_OWNER"],
      );
      equal(
        (
          await db.query(
            "select count(*)::int as n from pro_memberships where organization_id=$1 and status='active' and 'owner'=any(roles)",
            [a.id],
          )
        ).rows[0].n,
        1,
      );
    } finally {
      await Promise.all(clients.map((c) => c.end()));
    }
  }
  const { testCaseDatabase } = await import('./pro-case-database.test.mjs');
  await testCaseDatabase({ db, asUser, rpc, equal, denied });
  const { testRealDatabase } = await import('./pro-real-database.test.mjs');
  await testRealDatabase({ db, asUser, rpc, equal, denied });
  const {testOperationsDatabase}=await import('./pro-operations-database.test.mjs');
  await testOperationsDatabase({db,asUser,rpc,equal,denied});
  const {testManagementDatabase}=await import('./pro-management-database.test.mjs');
  await testManagementDatabase({db,asUser,rpc,equal,denied});
  const {testBodyDatabase}=await import('./pro-body-database.test.mjs');
  await testBodyDatabase({db,asUser,rpc,equal,denied});
  const {testTrainingDatabase}=await import('./training/database.test.mjs');
  await testTrainingDatabase({db,asUser,rpc,equal,denied});
  console.log(
    `PASS: ${checks} Professional database assertions (${process.env.PRO_TEST_DATABASE_URL ? "native PostgreSQL" : "PGlite"}); tenant isolation, grants, RLS, OTP, retries, assignments, revocation, caps, B2C separation`,
  );
} finally {
  await db.close();
}
