import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { emptyRealIntake } from "../src/professional/menuPlan.ts";
import { buildTrainingPlan } from "../src/training/engine.ts";
export async function testModulesDatabase({ db, asUser, rpc, equal, denied }) {
  await db.exec("reset role");
  const before = (
    await db.query(
      "select tablename,policyname,qual,with_check from pg_policies where schemaname='public' and tablename not like 'pro_%' order by tablename,policyname",
    )
  ).rows;
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022_030_pro_modules_and_offers.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  equal(
    (
      await db.query(
        "select tablename,policyname,qual,with_check from pg_policies where schemaname='public' and tablename not like 'pro_%' order by tablename,policyname",
      )
    ).rows,
    before,
    "B2C RLS unchanged",
  );
  const admin = randomUUID(),
    owner = randomUUID(),
    other = randomUUID();
  for (const [i, id] of [admin, owner, other].entries()) {
    await db.query(
      "insert into auth.users(id,phone,phone_confirmed_at) values($1,$2,now())",
      [id, "98988776655" + i],
    );
    await db.query(
      "insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '1 day')",
      [id],
    );
  }
  await db.query("insert into admin_members(user_id) values($1)", [admin]);
  await asUser(owner);
  const org = (await rpc("pro_create_sandbox_organization", [randomUUID()])).id;
  const answers = {
    ...emptyRealIntake(),
    display_name: "مصنوعی ماژول",
    birth_date: "1992-04-23",
    height_cm: 165,
    weight_kg: 75,
    safety_confirmed: true,
    medical_conditions: ["thyroid"],
    medications_present: true,
  };
  const rec = (
    await rpc("pro_save_real_case", [org, null, 0, answers, randomUUID()])
  ).id;
  const child = await rpc("pro_save_real_case", [org,null,0,{...answers,display_name:"پرونده اختصاصی کودک مصنوعی",birth_date:"2024-01-01",height_cm:85,weight_kg:12},randomUUID()]);
  equal(child.revision,1,"Pro can store a child case for specialist authoring");
  equal((await rpc("pro_workspace_status", [org])).modules, {
    nutrition: true,
    training: true,
    body: true,
  });
  await denied(() => rpc("admin_pro_offers", []), /ADMIN_REQUIRED/);
  await denied(
    () => rpc("admin_pro_set_modules", [org, 0, false, true, randomUUID()]),
    /ADMIN_REQUIRED/,
  );
  await denied(
    () => db.query("update pro_offers set title='bad'"),
    /permission denied/,
  );
  await asUser(null, "anon");
  let offers = await rpc("pro_offer_catalog");
  equal(offers.length, 3);
  equal(offers.find((x) => x.code === "combined").prices["12"], 25990000);
  equal(offers.find((x) => x.code === "training").prices, {
    1: 2490000,
    3: 5990000,
    6: 9490000,
    12: 14990000,
  });
  await denied(() => rpc("admin_pro_offers"), /permission denied/);
  await asUser(admin);
  const offer = (await rpc("admin_pro_offers")).find(
    (x) => x.code === "training",
  );
  const prices = { ...offer.prices, 1: 2500000 },
    offerKey = randomUUID(),
    offerArgs = [
      "training",
      offer.revision,
      "عنوان جدید",
      offer.subtitle,
      offer.features,
      prices,
      true,
      offerKey,
    ];
  const updated = await rpc("admin_pro_save_offer", offerArgs);
  equal(updated.revision, 2);
  equal(
    (await rpc("admin_pro_save_offer", offerArgs)).revision,
    2,
    "lost response retry",
  );
  await denied(
    () =>
      rpc("admin_pro_save_offer", [...offerArgs.slice(0, -1), randomUUID()]),
    /PRO_STALE_REVISION/,
  );
  await denied(
    () =>
      rpc("admin_pro_save_offer", [
        "training",
        2,
        "عنوان",
        "",
        [],
        prices,
        true,
        randomUUID(),
      ]),
    /PRO_INVALID_REQUEST/,
  );
  await denied(
    () =>
      rpc("admin_pro_save_offer", [
        "training",
        2,
        "عنوان",
        "",
        ["امکان"],
        { ...prices, 1: -5 },
        true,
        randomUUID(),
      ]),
    /PRO_INVALID_REQUEST/,
  );
  await denied(
    () =>
      rpc("admin_pro_save_offer", [
        "training",
        2,
        "عنوان",
        "",
        ["امکان"],
        { ...prices, extra: 0 },
        true,
        randomUUID(),
      ]),
    /PRO_INVALID_REQUEST/,
  );
  const mod0 = await rpc("admin_pro_modules", [org]);
  const moduleArgs = [org, mod0.revision, false, true, randomUUID()];
  const mod1 = await rpc("admin_pro_set_modules", moduleArgs);
  equal(mod1.nutrition, false);
  equal(
    (await rpc("admin_pro_set_modules", moduleArgs)).revision,
    mod1.revision,
  );
  await denied(
    () =>
      rpc("admin_pro_set_modules", [
        org,
        mod1.revision,
        false,
        false,
        randomUUID(),
      ]),
    /PRO_INVALID_REQUEST/,
  );
  await denied(
    () =>
      rpc("admin_pro_set_modules", [
        org,
        mod0.revision,
        true,
        true,
        randomUUID(),
      ]),
    /PRO_STALE_REVISION/,
  );
  await asUser(owner);
  equal((await rpc("pro_workspace_status", [org])).modules, {
    nutrition: false,
    training: true,
    body: true,
  });
  const content = {
    version: 1,
    title: "برنامه اختصاصی",
    notes: "",
    reviewed: true,
    sections: [
      {
        title: "جلسه اول",
        lines: [{ name: "حرکت اختصاصی", details: "دستور بررسی‌شده متخصص" }],
      },
    ],
  };
  const key = randomUUID(),
    args = [org, rec, 1, "training", content, key];
  equal(await rpc("pro_save_authored_plan", args), key);
  equal(await rpc("pro_save_authored_plan", args), key);
  equal(
    (await db.query("select count(*)::int n from pro_authored_plans")).rows[0]
      .n,
    1,
  );
  await denied(
    () =>
      rpc("pro_save_authored_plan", [
        org,
        rec,
        1,
        "nutrition",
        content,
        randomUUID(),
      ]),
    /PRO_MODULE_DISABLED/,
  );
  await denied(
    () =>
      rpc("pro_save_authored_plan", [
        org,
        rec,
        1,
        "training",
        { ...content, reviewed: false },
        randomUUID(),
      ]),
    /PRO_INVALID_PLAN/,
  );
  await denied(
    () =>
      rpc("pro_save_authored_plan", [
        org,
        rec,
        1,
        "training",
        { ...content, sections: [{ title: "", lines: [] }] },
        randomUUID(),
      ]),
    /PRO_INVALID_PLAN/,
  );
  await denied(
    () =>
      rpc("pro_save_authored_plan", [
        org,
        rec,
        1,
        "training",
        { ...content, title: "changed" },
        key,
      ]),
    /PRO_REQUEST_CONFLICT/,
  );
  await denied(
    () =>
      rpc("pro_save_authored_plan", [
        org,
        rec,
        2,
        "training",
        content,
        randomUUID(),
      ]),
    /PRO_STALE_REVISION/,
  );
  await denied(
    () =>
      db.query("update pro_authored_plans set content=$1 where id=$2", [
        content,
        key,
      ]),
    /permission denied/,
  );
  await asUser(other);
  equal((await db.query("select * from pro_authored_plans")).rows.length, 0);
  await denied(() => rpc("pro_save_authored_plan", args), /PRO_ACCESS_DENIED/);
  // Service-role generation context must enforce entitlement even when UI is bypassed.
  await asUser(admin);
  let m = await rpc("admin_pro_modules", [org]);
  await rpc("admin_pro_set_modules", [
    org,
    m.revision,
    true,
    false,
    randomUUID(),
  ]);
  await asUser(owner);
  equal(
    (
      await db.query("select content from pro_authored_plans where id=$1", [
        key,
      ])
    ).rows[0].content,
    content,
    "history survives downgrade",
  );
  await asUser(null, "service_role");
  await denied(
    () =>
      rpc("pro_training_context", [
        owner,
        org,
        rec,
        1,
        randomUUID(),
        "b".repeat(64),
      ]),
    /PRO_MODULE_DISABLED/,
  );
  await asUser(owner);
  await denied(
    () =>
      rpc("pro_save_authored_plan", [
        org,
        rec,
        1,
        "training",
        content,
        randomUUID(),
      ]),
    /PRO_MODULE_DISABLED/,
  );
  // Nutrition module works and authored content cannot be rewritten once stored.
  const dietKey = randomUUID();
  equal(
    await rpc("pro_save_authored_plan", [
      org,
      rec,
      1,
      "nutrition",
      content,
      dietKey,
    ]),
    dietKey,
  );
  await db.exec("reset role");
  await denied(
    () =>
      db.query("update pro_authored_plans set content='{}' where id=$1", [key]),
    /PRO_IMMUTABLE/,
  );
  await asUser(admin);
  await rpc("admin_pro_set_license", [
    org,
    0,
    "suspended",
    new Date(Date.now() + 86400000).toISOString(),
    200,
    "تست تعلیق",
    randomUUID(),
  ]);
  await asUser(owner);
  equal(
    (await db.query("select * from pro_authored_plans")).rows.length,
    2,
    "suspension retains histories",
  );
  await denied(
    () =>
      rpc("pro_save_authored_plan", [
        org,
        rec,
        1,
        "nutrition",
        content,
        randomUUID(),
      ]),
    /PRO_SUBSCRIPTION_EXPIRED/,
  );
  // Existing idempotent response remains retrievable without a new mutation.
  equal(
    await rpc("pro_save_authored_plan", [
      org,
      rec,
      1,
      "nutrition",
      content,
      dietKey,
    ]),
    dietKey,
  );
  await asUser(null, "anon");
  equal(
    (await rpc("pro_offer_catalog")).find((x) => x.code === "training").title,
    "عنوان جدید",
  );
  console.log(
    "PASS Pro modules/catalog/authored SQL: public pricing, admin/CAS/retries, tenant isolation, module bypass, suspension, immutable history, B2C RLS",
  );
}
