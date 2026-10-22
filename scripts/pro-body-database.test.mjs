import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { emptyRealIntake } from "../src/professional/menuPlan.ts";
import { makeBodyReport } from "../src/professional/body/contracts.ts";
export async function testBodyDatabase({ db, asUser, rpc, equal, denied }) {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022_028_pro_read_access_and_body_reports.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const owner = randomUUID(),
    other = randomUUID(),
    admin = randomUUID();
  for (const id of [owner, other, admin]) {
    await db.query(
      "insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,now())",
      [id, "989" + String(Math.random()).slice(2, 11)],
    );
    await db.query(
      "insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '1 day')",
      [id],
    );
  }
  await db.query("insert into admin_members(user_id) values($1)", [admin]);
  await asUser(owner);
  const org = (await rpc("pro_create_sandbox_organization", [randomUUID()])).id;
  const a = {
    ...emptyRealIntake(),
    display_name: "مراجع تصویر مصنوعی",
    birth_date: "1992-04-23",
    height_cm: 165,
    weight_kg: 75,
    safety_confirmed: true,
  };
  const rec = (await rpc("pro_save_real_case", [org, null, 0, a, randomUUID()]))
    .id;
  const sample = JSON.parse(
    await readFile(
      new URL("../output/pdf/sample-plan.json", import.meta.url),
      "utf8",
    ),
  );
  sample.display_name = a.display_name;
  sample.intake_revision = 1;
  await db.exec("reset role;set role service_role");
  const draft = await rpc("pro_stage_server_plan", [
    org,
    rec,
    1,
    owner,
    randomUUID(),
    { date: sample.date, count: sample.requested_menus, notes: sample.notes },
    sample,
  ]);
  const plan = await rpc("pro_publish_server_plan", [
    org,
    rec,
    1,
    owner,
    randomUUID(),
    draft.draft_id,
  ]);
  const job = randomUUID(),
    lease = randomUUID(),
    hash = "a".repeat(64);
  const reserve = () =>
    rpc("pro_reserve_body_report", [owner, org, rec, 1, job, hash, lease]);
  equal((await reserve()).answers.height_cm, 165);
  await denied(reserve, /PRO_SCAN_PROCESSING/);
  await denied(() =>
    rpc("pro_reserve_body_report", [
      other,
      org,
      rec,
      1,
      randomUUID(),
      hash,
      randomUUID(),
    ]),
  );
  const report = makeBodyReport(
    165,
    75,
    1,
    { waist_cm: 90 },
    [{ view: "front", usable: true, issues: [] }],
    "test-model",
  );
  await denied(
    () =>
      rpc("pro_finish_body_report", [owner, org, job, randomUUID(), report]),
    /PRO_REQUEST_CONFLICT/,
  );
  await rpc("pro_finish_body_report", [owner, org, job, lease, report]);
  equal(
    (await reserve()).report,
    report,
    "lost response returns same report without a second AI call",
  );
  await denied(
    () =>
      rpc("pro_reserve_body_report", [
        owner,
        org,
        rec,
        1,
        job,
        "b".repeat(64),
        lease,
      ]),
    /PRO_REQUEST_CONFLICT/,
  );
  await asUser(other);
  await denied(() => rpc("pro_body_reports", [org, rec]));
  await denied(() => rpc("pro_plan_body_report", [org, plan]));
  await denied(() => rpc("pro_approve_body_report", [org, job]));
  await denied(() => rpc("pro_attach_body_report", [org, plan, job]));
  await asUser(owner);
  equal((await rpc("pro_body_reports", [org, rec])).length, 1);
  equal(await rpc("pro_plan_body_report", [org, plan]), null);
  await denied(
    () => rpc("pro_attach_body_report", [org, plan, job]),
    /PRO_SCAN_REVIEW_REQUIRED/,
  );
  await rpc("pro_approve_body_report", [org, job]);
  await rpc("pro_approve_body_report", [org, job]);
  await rpc("pro_attach_body_report", [org, plan, job]);
  await rpc("pro_attach_body_report", [org, plan, job]);
  equal(await rpc("pro_plan_body_report", [org, plan]), report);
  await db.exec("reset role;set role service_role");
  const retryJob = randomUUID();
  for (let attempt = 0; attempt < 3; attempt++) {
    const retryLease = randomUUID();
    await rpc("pro_reserve_body_report", [
      owner,
      org,
      rec,
      1,
      retryJob,
      hash,
      retryLease,
    ]);
    await rpc("pro_finish_body_report", [
      owner,
      org,
      retryJob,
      retryLease,
      null,
    ]);
  }
  await denied(
    () =>
      rpc("pro_reserve_body_report", [
        owner,
        org,
        rec,
        1,
        retryJob,
        hash,
        randomUUID(),
      ]),
    /PRO_SCAN_LIMIT/,
  );
  await rpc("pro_report_failure", [
    randomUUID(),
    owner,
    org,
    "scan",
    "PRO_SCAN_PROVIDER_ERROR",
  ]);
  await asUser(admin);
  equal(
    (await rpc("admin_pro_events", [org, "failures", 0])).rows[0].operation,
    "scan",
    "scan failures share the admin metadata log",
  );
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
      rpc("pro_reserve_body_report", [
        owner,
        org,
        rec,
        1,
        randomUUID(),
        hash,
        randomUUID(),
      ]),
    /PRO_STALE_REVISION/,
  );
  await asUser(owner);
  for (const table of [
    "pro_body_report_jobs",
    "pro_body_report_approvals",
    "pro_plan_body_reports",
  ])
    await denied(() => db.query("select * from " + table), /permission denied/);
  await denied(() => reserve(), /permission denied/);
  await db.exec("reset role");
  await db.query(
    "update pro_pilot_access set expires_at=now()-interval '1 day' where user_id=$1",
    [owner],
  );
  await asUser(owner);
  equal(
    (await rpc("pro_workspace_status", [org])).can_write,
    false,
    "expired pilot is read-only",
  );
  equal(
    (await rpc("pro_browse_case_directory", [org, "", 0, false])).total,
    1,
    "expired pilot retains history",
  );
  await asUser(admin);
  await rpc("admin_pro_set_license", [
    org,
    0,
    "suspended",
    new Date(Date.now() + 86400000).toISOString(),
    100,
    "تست تعلیق",
    randomUUID(),
  ]);
  await asUser(owner);
  equal((await rpc("pro_workspace_status", [org])).can_write, false);
  equal((await rpc("pro_browse_case_directory", [org, "", 0, false])).total, 1);
  equal(
    (await rpc("pro_browse_case_history", [org, rec, "plans", 0])).total,
    1,
  );
  equal(
    await rpc("pro_plan_body_report", [org, plan]),
    report,
    "suspension retains PDF appendix",
  );
  equal((await rpc("pro_body_reports", [org, rec])).length, 1);
  await denied(
    () =>
      rpc("pro_save_real_case", [
        org,
        rec,
        2,
        { ...a, weight_kg: 77 },
        randomUUID(),
      ]),
    /PRO_SUBSCRIPTION_EXPIRED/,
  );
  await denied(
    () => rpc("pro_save_real_case", [org, null, 0, a, randomUUID()]),
    /PRO_SUBSCRIPTION_EXPIRED/,
  );
  equal(
    typeof (await rpc("pro_request_renewal", [org, randomUUID()])),
    "string",
  );
  await db.exec("reset role;set role service_role");
  await denied(
    () =>
      rpc("pro_reserve_body_report", [
        owner,
        org,
        rec,
        2,
        randomUUID(),
        hash,
        randomUUID(),
      ]),
    /PRO_SUBSCRIPTION_EXPIRED/,
  );
  await db.exec("reset role");
  await db.query(
    "update pro_organizations set status='suspended' where id=$1",
    [org],
  );
  await asUser(owner);
  equal((await rpc("pro_workspace_status", [org])).can_write, false);
  equal(
    (await rpc("pro_browse_case_history", [org, rec, "plans", 0])).total,
    1,
    "org suspension is read-only too",
  );
  await db.exec("reset role");
  await denied(
    () =>
      db.query("update pro_body_report_jobs set report='{}' where id=$1", [
        job,
      ]),
    /PRO_IMMUTABLE/,
  );
  await denied(
    () => db.query("update pro_plan_body_reports set attached_at=now()"),
    /PRO_IMMUTABLE/,
  );
  await denied(
    () => db.query("delete from pro_body_report_approvals"),
    /PRO_IMMUTABLE/,
  );
  await db.query(
    "insert into pro_memberships(organization_id,user_id,roles) values($1,$2,array['owner'])",
    [org, other],
  );
  await db.query(
    "update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2",
    [org, owner],
  );
  await asUser(owner);
  await denied(() => rpc("pro_body_reports", [org, rec]));
  await denied(() => rpc("pro_plan_body_report", [org, plan]));
  await denied(() => rpc("pro_browse_case_directory", [org, "", 0, false]));
  await db.exec("reset role");
}
