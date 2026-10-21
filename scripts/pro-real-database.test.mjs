import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { emptyRealIntake } from "../src/professional/menuPlan.ts";
export async function testRealDatabase({ db, asUser, rpc, equal, denied }) {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261021_025_pro_real_cases_and_names.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const owner = randomUUID(),
    doc = randomUUID(),
    assistant = randomUUID(),
    stranger = randomUUID();
  for (const id of [owner, doc, assistant, stranger]) {
    await db.query(
      "insert into auth.users(id,phone,phone_confirmed_at) values($1,'989000000000',now())",
      [id],
    );
    await db.query(
      "insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '1 day')",
      [id],
    );
  }
  await asUser(owner);
  const org = (await rpc("pro_create_sandbox_organization", [randomUUID()])).id;
  await db.exec("reset role");
  for (const [id, role] of [
    [doc, "practitioner"],
    [assistant, "assistant"],
  ])
    await db.query(
      "insert into pro_memberships(organization_id,user_id,roles) values($1,$2,$3)",
      [org, id, [role]],
    );
  const a = {
    ...emptyRealIntake(),
    display_name: "آزمون پرونده",
    birth_date: "1992-04-23",
    height_cm: 165,
    weight_kg: 75,
    safety_confirmed: true,
  };
  const key = randomUUID();
  await asUser(owner);
  const saved = await rpc("pro_save_real_case", [org, null, 0, a, key]);
  equal(
    (await rpc("pro_save_real_case", [org, null, 0, a, key])).id,
    saved.id,
    "create response lost retry",
  );
  await denied(
    () =>
      rpc("pro_save_real_case", [
        org,
        null,
        0,
        { ...a, display_name: "نام دیگر" },
        key,
      ]),
    /PRO_REQUEST_CONFLICT/,
  );
  for (const invalid of [
    { ...a, display_name: "" },
    { ...a, phone: "invalid" },
    { ...a, safety_confirmed: false },
    { ...a, weight_kg: 0 },
    { ...a, extra: true },
    { ...a, display_name: null },
  ])
    await denied(
      () => rpc("pro_save_real_case", [org, null, 0, invalid, randomUUID()]),
      /PRO_INVALID_INTAKE/,
    );
  equal(
    (await db.query("select count(*)::int n from pro_real_cases")).rows[0].n,
    1,
    "no invalid or duplicate records",
  );
  const changed = { ...a, weight_kg: 76 };
  const updateKey = randomUUID();
  await rpc("pro_save_real_case", [org, saved.id, 1, changed, updateKey]);
  await rpc("pro_save_real_case", [org, saved.id, 1, changed, updateKey]);
  equal(
    (await db.query("select count(*)::int n from pro_real_intake_versions"))
      .rows[0].n,
    2,
    "update retry is immutable",
  );
  await denied(
    () => rpc("pro_save_real_case", [org, saved.id, 1, a, randomUUID()]),
    /PRO_STALE_REVISION/,
  );
  await denied(
    () => db.query("update pro_real_cases set revision=99"),
    /permission denied/,
  );
  await denied(
    () => db.query("delete from pro_real_intake_versions"),
    /permission denied/,
  );
  await asUser(doc);
  equal(
    (await db.query("select id from pro_real_cases")).rows,
    [],
    "unassigned practitioner hidden",
  );
  const own = await rpc("pro_save_real_case", [org, null, 0, a, randomUUID()]);
  equal(
    (await db.query("select id from pro_real_cases")).rows.map((r) => r.id),
    [own.id],
  );
  await denied(
    () => rpc("pro_save_real_case", [org, saved.id, 2, a, randomUUID()]),
    /PRO_ACCESS_DENIED/,
  );
  await asUser(assistant);
  equal(
    (await db.query("select id from pro_real_cases")).rows,
    [],
    "assistant cannot read intake",
  );
  await denied(() =>
    rpc("pro_save_real_case", [org, null, 0, a, randomUUID()]),
  );
  await asUser(stranger);
  const other = (await rpc("pro_create_sandbox_organization", [randomUUID()]))
    .id;
  await denied(() =>
    rpc("pro_save_real_case", [org, null, 0, a, randomUUID()]),
  );
  equal(
    (await db.query("select record_id from pro_real_intake_versions")).rows,
    [],
    "tenant history isolation",
  );
  await asUser(owner);
  await denied(() =>
    rpc("pro_save_real_case", [other, saved.id, 2, a, randomUUID()]),
  );
  const sample = JSON.parse(
    await readFile(
      new URL("../output/pdf/sample-plan.json", import.meta.url),
      "utf8",
    ),
  );
  sample.display_name = a.display_name;
  sample.intake_revision = 2;
  const pkey = randomUUID();
  const request = {date:sample.date,count:sample.requested_menus,notes:sample.notes};
  const stage = async (actor, rec, rev, plan, key=randomUUID(), req=request) => {
    await db.exec('reset role; set role service_role');
    return rpc('pro_stage_server_plan',[org,rec,rev,actor,key,req,plan]);
  };
  const publish = async (actor, rec, rev, draft, key=randomUUID()) => {
    await db.exec('reset role; set role service_role');
    return rpc('pro_publish_server_plan',[org,rec,rev,actor,key,draft]);
  };
  // Reproduce the review's adversarial request: direct client snapshots are denied.
  const tampered = structuredClone(sample);
  tampered.days[0].targets.targetCalories = 1;
  tampered.days[0].slots[0].options[0].totalKcal = 999999;
  await denied(() => rpc('pro_save_real_plan',[org,saved.id,2,tampered,pkey]), /permission denied/);
  await denied(() => rpc('pro_stage_server_plan',[org,saved.id,2,owner,pkey,request,sample]), /permission denied/);
  await denied(() => rpc('pro_publish_server_plan',[org,saved.id,2,owner,pkey,randomUUID()]), /permission denied/);
  await denied(() => db.query('select * from pro_server_plan_drafts'), /permission denied/);
  const staged = await stage(owner,saved.id,2,sample,pkey);
  equal((await stage(owner,saved.id,2,sample,pkey)).draft_id,staged.draft_id,'generation response loss same draft');
  await denied(() => stage(owner,saved.id,2,sample,pkey,{...request,notes:'changed'}), /PRO_INVALID_PLAN|PRO_REQUEST_CONFLICT/);
  const commitKey=randomUUID();
  const pid = await publish(owner,saved.id,2,staged.draft_id,commitKey);
  equal(await publish(owner,saved.id,2,staged.draft_id,commitKey),pid,'server commit retry');
  await denied(() => publish(doc,saved.id,2,staged.draft_id), /PRO_ACCESS_DENIED/);
  await denied(() => publish(stranger,saved.id,2,staged.draft_id), /PRO_ACCESS_DENIED/);
  await denied(() => publish(owner,saved.id,2,randomUUID()), /PRO_INVALID_PLAN/);
  await denied(() => stage(owner,saved.id,1,sample), /PRO_STALE_REVISION/);
  for (const invalid of [
    {...sample,display_name:'wrong name'}, {...sample,requested_menus:null},
    {...sample,version:null}, {...sample,notes:null}, {...sample,requested_menus:1.5},
    {},null,{...sample,days:[]},{...sample,requested_menus:5},
    {...sample,days:[{targets:{},workout:false,slots:[]}]}
  ]) await denied(() => stage(owner,saved.id,2,invalid), /PRO_INVALID_PLAN/);
  const expiring = await stage(owner,saved.id,2,sample);
  await db.exec('reset role');
  await db.query("update pro_server_plan_drafts set expires_at=now()-interval '1 minute' where id=$1",[expiring.draft_id]);
  await denied(() => publish(owner,saved.id,2,expiring.draft_id), /PRO_DRAFT_EXPIRED/);
  await db.exec('reset role');
  await db.query("update pro_server_plan_drafts set expires_at=now()-interval '1 minute' where id=$1",[staged.draft_id]);
  equal(await publish(owner,saved.id,2,staged.draft_id,commitKey),pid,'committed retry after draft expiry');
  const staleDraft = await stage(owner,saved.id,2,sample);
  await asUser(owner);
  await rpc('pro_save_real_case',[org,saved.id,2,{...changed,weight_kg:77},randomUUID()]);
  await denied(() => publish(owner,saved.id,2,staleDraft.draft_id), /PRO_STALE_REVISION/);
  equal(await publish(owner,saved.id,2,staged.draft_id,commitKey),pid,'committed retry after newer intake');
  await asUser(stranger);
  equal(
    (await db.query("select id from pro_real_plans")).rows,
    [],
    "tenant plan isolation",
  );
  await db.exec("reset role");
  await db.query(
    "update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2",
    [org, doc],
  );
  await asUser(doc);
  equal(
    (await db.query("select id from pro_real_cases")).rows,
    [],
    "revoked clinician loses access",
  );
  await denied(() =>
    rpc("pro_save_real_case", [org, own.id, 1, a, randomUUID()]),
  );
  await db.exec("reset role");
  await denied(
    () => db.query("update pro_real_plans set plan=plan where id=$1", [pid]),
    /PRO_IMMUTABLE/,
  );
  await db.query(
    "insert into user_profiles(id,display_name) values($1,'سروش')",
    [owner],
  );
  equal(
    (
      await db.query("select display_name from user_profiles where id=$1", [
        owner,
      ])
    ).rows[0].display_name,
    "سروش",
    "B2C name persisted",
  );
  await db.query("insert into user_profiles(id) values($1)", [stranger]);
  equal(
    (
      await db.query("select display_name from user_profiles where id=$1", [
        stranger,
      ])
    ).rows[0].display_name,
    null,
    "legacy name remains optional",
  );
  await db.exec("set role anon");
  await denied(
    () => db.query("select * from pro_real_cases"),
    /permission denied/,
  );
  await denied(
    () => rpc("pro_save_real_case", [org, null, 0, a, randomUUID()]),
    /permission denied/,
  );
  await db.exec("reset role");
}
