import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { emptyRealIntake } from "../../src/professional/menuPlan.ts";
import { buildTrainingPlan } from "../../src/training/engine.ts";
export async function testTrainingDatabase({ db, asUser, rpc, equal, denied }) {
  await db.exec("reset role");
  const before = (
    await db.query(
      "select tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname",
    )
  ).rows;
  await db.exec(
    await readFile(
      new URL(
        "../../supabase/migrations/20261022_029_pro_training.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  equal(
    (
      await db.query(
        "select tablename,policyname,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname",
      )
    ).rows,
    before,
  );
  const owner = randomUUID(),
    other = randomUUID(),
    unverified = randomUUID();
  for (const [i, id] of [owner, other, unverified].entries()) {
    await db.query(
      "insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,$3)",
      [
        id,
        "989" + String(Math.random()).slice(2, 11),
        i === 2 ? null : new Date().toISOString(),
      ],
    );
    await db.query(
      "insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '1 day')",
      [id],
    );
  }
  await asUser(owner);
  const org = (await rpc("pro_create_sandbox_organization", [randomUUID()])).id;
  const a = {
    ...emptyRealIntake(),
    display_name: "تمرین مصنوعی",
    birth_date: "1992-04-23",
    height_cm: 165,
    weight_kg: 75,
    safety_confirmed: true,
  };
  const rec = (await rpc("pro_save_real_case", [org, null, 0, a, randomUUID()]))
    .id;
  await asUser(other);
  const org2 = (await rpc("pro_create_sandbox_organization", [randomUUID()]))
    .id;
  const rec2 = (
    await rpc("pro_save_real_case", [org2, null, 0, a, randomUUID()])
  ).id;
  const cfg = {
    version: 1,
    location: "home",
    experience: "beginner",
    goal: "general",
    days: [0, 3],
    minutes: 45,
    equipment: ["dumbbells"],
    start_date: "2026-10-24",
    screening: {
      confirmed: true,
      symptoms: false,
      pain: false,
      restriction: false,
      recent_surgery: false,
    },
  };
  const plan = buildTrainingPlan(a, cfg, 1, new Date("2026-10-22T12:00:00Z")),
    key = randomUUID(),
    hash = "a".repeat(64);
  const args = [owner, org, rec, 1, key, hash];
  await asUser(owner);
  await denied(() => rpc("pro_training_context", args), /permission denied/);
  await denied(
    () => rpc("pro_stage_training", [...args, plan]),
    /permission denied/,
  );
  await denied(
    () =>
      db.query("insert into pro_training_plans(id) values($1)", [randomUUID()]),
    /permission denied/,
  );
  await db.exec("reset role;set role anon");
  await denied(
    () => rpc("pro_training_history", [org, rec, 0]),
    /permission denied/,
  );
  await db.exec("reset role;set role service_role");
  equal(
    (await rpc("pro_training_context", args)).answers.display_name,
    a.display_name,
  );
  await denied(() =>
    rpc("pro_training_context", [other, org, rec, 1, randomUUID(), hash]),
  );
  await denied(() =>
    rpc("pro_training_context", [owner, org, rec2, 1, randomUUID(), hash]),
  );
  await denied(() =>
    rpc("pro_training_context", [unverified, org, rec, 1, randomUUID(), hash]),
  );
  await denied(
    () => rpc("pro_stage_training", [...args, { ...plan, engine: "forged" }]),
    /PRO_INVALID_PLAN/,
  );
  const result = await rpc("pro_stage_training", [...args, plan]);
  equal(result.id, key);
  equal(result.plan, plan);
  equal((await rpc("pro_stage_training", [...args, plan])).id, key);
  await denied(
    () =>
      rpc("pro_stage_training", [...args.slice(0, 5), "b".repeat(64), plan]),
    /PRO_REQUEST_CONFLICT/,
  );
  await denied(
    () => rpc("pro_training_context", [owner, org, rec, 2, key, hash]),
    /PRO_REQUEST_CONFLICT/,
  );
  await db.exec("reset role");
  await db.query(
    "insert into pro_training_plans(id,organization_id,record_id,actor_id,intake_revision,request_hash,plan) select gen_random_uuid(),$1,$2,$3,1,$4,$5 from generate_series(1,60)",
    [org2, rec2, other, hash, plan],
  );
  await db.exec("set role service_role");
  await denied(
    () =>
      rpc("pro_stage_training", [
        other,
        org2,
        rec2,
        1,
        randomUUID(),
        hash,
        plan,
      ]),
    /PRO_GENERATION_LIMIT/,
  );
  await asUser(owner);
  equal((await rpc("pro_training_history", [org, rec, 0])).total, 1);
  await denied(() => rpc("pro_training_history", [org2, rec2, 0]));
  await rpc("pro_approve_training", [org, key]);
  await rpc("pro_approve_training", [org, key]);
  equal(
    Boolean(
      (await rpc("pro_training_history", [org, rec, 0])).rows[0].approved_at,
    ),
    true,
  );
  await asUser(other);
  await denied(() => rpc("pro_approve_training", [org, key]));
  await db.exec("reset role");
  await denied(
    () =>
      db.query("update pro_training_plans set plan=$1 where id=$2", [{}, key]),
    /PRO_IMMUTABLE/,
  );
  await denied(
    () =>
      db.query("delete from pro_training_approvals where plan_id=$1", [key]),
    /PRO_IMMUTABLE/,
  );
  await db.query(
    "update pro_organizations set status='suspended' where id=$1",
    [org],
  );
  await asUser(owner);
  equal((await rpc("pro_training_history", [org, rec, 0])).rows[0].plan, plan);
  await db.exec("reset role;set role service_role");
  equal((await rpc("pro_training_context", args)).id, key); // Retry still retrieves same result.
  await denied(
    () => rpc("pro_training_context", [owner, org, rec, 1, randomUUID(), hash]),
    /PRO_SUBSCRIPTION_EXPIRED/,
  );
  await db.exec("reset role");
  await db.query("update pro_organizations set status='active' where id=$1", [
    org,
  ]);
  await asUser(owner);
  await rpc("pro_save_real_case", [
    org,
    rec,
    1,
    { ...a, weight_kg: 76 },
    randomUUID(),
  ]);
  await db.exec("reset role;set role service_role");
  await denied(
    () =>
      rpc("pro_stage_training", [owner, org, rec, 1, randomUUID(), hash, plan]),
    /PRO_STALE_REVISION/,
  );
  const plan2 = buildTrainingPlan(a, cfg, 2, new Date("2026-10-22T12:00:00Z")),
    key2 = randomUUID();
  await rpc("pro_stage_training", [owner, org, rec, 2, key2, hash, plan2]);
  await asUser(owner);
  await rpc("pro_save_real_case", [
    org,
    rec,
    2,
    { ...a, weight_kg: 77 },
    randomUUID(),
  ]);
  await denied(
    () => rpc("pro_approve_training", [org, key2]),
    /PRO_STALE_REVISION/,
  );
  await rpc("pro_set_case_archived", [org, rec, 0, true, randomUUID()]);
  equal((await rpc("pro_training_history", [org, rec, 0])).total, 2);
  await db.exec("reset role;set role service_role");
  await denied(
    () => rpc("pro_training_context", [owner, org, rec, 3, randomUUID(), hash]),
    /PRO_CASE_ARCHIVED/,
  );
  await db.exec("reset role");
  await db.query(
    "insert into pro_memberships(organization_id,user_id,roles,status) values($1,$2,array['owner'],'active')",
    [org, other],
  );
  await db.query(
    "update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2",
    [org, owner],
  );
  await asUser(owner);
  await denied(() => rpc("pro_training_history", [org, rec, 0]));
  await db.exec("reset role;set role service_role");
  await denied(() => rpc("pro_training_context", args));
  await db.exec("reset role");
  equal(
    (
      await db.query(
        "select count(*)::int as n from pg_class where relname in('pro_training_plans','pro_training_approvals') and relrowsecurity",
      )
    ).rows[0].n,
    2,
  );
}
