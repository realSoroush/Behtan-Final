import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { testMemberMealCommit } from "./member-authoritative-meals-database.mjs";
export async function testMarketDatabase({ db }) {
  await db.exec("reset role");
  await db.exec('alter default privileges in schema public revoke update on tables from authenticated');
  for (const name of [
    "20261022_031_public_subscription_catalog.sql",
    "20261022_032_member_planning_and_activity.sql",
    "20261022_033_food_scan_quota.sql",
    "20261023_034_body_scan_quota.sql",
    "20261024_035_member_release.sql",
    "20261024_036_menu_management.sql",
    "20261024_037_pro_self_service.sql",
    "20261024_038_food_preparation_labels.sql",
    "20261024_039_compute_limits.sql",
    "20261104134358_042_version_member_meal_schedule.sql",
    "20261104182716_045_member_review_and_meal_events.sql",
    "20261104205157_046_member_safety_sync.sql",
    "20261105094021_047_egg_sesame_allergen_safety.sql",
    "20261105171239_048_nutrition_context_snapshot.sql",
    "20261105172329_049_authoritative_member_meals.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + name, import.meta.url),
        "utf8",
      ),
    );
  const user = randomUUID(),
    other = randomUUID();
  await db.query(
    "insert into auth.users(id,phone,phone_confirmed_at) values($1,'989155550001',now()),($2,'989155550002',now())",
    [user, other],
  );
  await db.query(
    "insert into user_profiles(id,weight,height,onboarding_completed) values($1,80,178,true),($2,80,178,true)",
    [user, other],
  );
  const as = async (id) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  await as(user);
  await assert.rejects(
    () => db.query("select admin_member_menus()"),
    /ADMIN_REQUIRED/,
  );
  await assert.rejects(
    () => db.query("select admin_business_pulse()"),
    /ADMIN_REQUIRED/,
  );
  await assert.rejects(
    () =>
      db.query("select member_begin_order($1,'gold',1,30,$2,false)", [
        user,
        randomUUID(),
      ]),
    /permission denied/,
  );
  await db.exec("reset role");
  await db.query(
    "update billing_settings set mode='sandbox',checkout_enabled=true where id",
  );
  const store = async (uid) => {
    const rev = (await db.query("select revision from member_catalog_version"))
      .rows[0].revision;
    return (
      await db.query("select member_store_preflight($1,$2,'{}',true,(select to_jsonb(p) from user_profiles p where id=$1),'{\"input\":{\"days\":[0,2,4]}}') as id", [
        uid,
        rev,
      ])
    ).rows[0].id;
  };
  let pre = await store(user);
  await assert.rejects(
    () =>
      db.query("select member_begin_order($1,'silver',1,30,$2,false)", [
        user,
        pre,
      ]),
    /OFFER_CHANGED/,
  );
  const price = (
    await db.query(
      "select price_toman from subscription_plans where code='silver'",
    )
  ).rows[0].price_toman;
  await db.query("update user_profiles set weight=81 where id=$1", [user]);
  await assert.rejects(
    () =>
      db.query("select member_begin_order($1,'silver',$2,30,$3,false)", [
        user,
        price,
        pre,
      ]),
    /PREFLIGHT_REQUIRED/,
  );
  pre = await store(user);
  const order = (
    await db.query("select member_begin_order($1,'trial',0,3,$2,false) as o", [
      user,
      pre,
    ])
  ).rows[0].o;
  await db.query("select billing_settle($1,null,0)", [order.id]);
  await db.query("select billing_settle($1,null,0)", [order.id]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from user_subscriptions where source_order_id=$1",
        [order.id],
      )
    ).rows[0].n,
    1,
  );
  await testMemberMealCommit(db, user, other);
  const snapshot = async (known = null) => (await db.query(
    "select nutrition_context_snapshot($1) as result", [known],
  )).rows[0].result;
  await as(user);
  const paidSnapshot = await snapshot();
  assert.equal(paidSnapshot.policy_row.id, 'default');
  assert(paidSnapshot.food_rows.length > 0);
  assert.deepEqual(await snapshot(paidSnapshot.revision), { schema_version: 1, revision: paidSnapshot.revision });
  await as(other);
  await assert.rejects(() => snapshot(paidSnapshot.revision), /NUTRITION_CONTEXT_DENIED/);
  await db.exec('reset role; set role anon');
  await assert.rejects(() => snapshot(), /permission denied/);
  await db.exec('reset role; set role service_role');
  assert.deepEqual(await snapshot(), paidSnapshot, 'Member and server consume identical reference rows');
  await db.exec('reset role; begin');
  try {
    const t = paidSnapshot.template_rows.find(t => t.id === paidSnapshot.slot_rows[0].template_id);
    const ingredient = paidSnapshot.slot_rows.find(s => s.template_id === t.id);
    await db.query(`insert into meal_template_slots(template_id,position,role,primary_food_item_id,dynamic_units)
      select $1, n, $2, $3, true from generate_series(1000,2000) n`,
      [t.id, ingredient.role, ingredient.primary_food_item_id]);
    await db.query("update nutrition_protein_policy set reference_bmi=24 where id='default'");
    const expanded = await snapshot(paidSnapshot.revision);
    assert.notEqual(expanded.revision, paidSnapshot.revision);
    assert.equal(expanded.slot_rows.length, paidSnapshot.slot_rows.length + 1001);
    assert.equal(Number(expanded.policy_row.reference_bmi), 24);
    await db.query('update food_items set is_active=false where id=$1', [ingredient.primary_food_item_id]);
    const retired = await snapshot(expanded.revision);
    assert.notEqual(retired.revision, expanded.revision);
    assert(!retired.food_rows.some(f => f.id === ingredient.primary_food_item_id));
    assert(!retired.slot_rows.some(s => s.primary_food_item_id === ingredient.primary_food_item_id || s.template_id === t.id));
    assert(!retired.substitute_rows.some(s => [s.food_item_id, s.substitute_food_item_id].includes(ingredient.primary_food_item_id)));
  } finally { await db.exec('rollback'); }
  console.log('PASS nutrition context SQL: subscribed/service parity, denied anonymous and unpaid reads, 1,000+ slots, revision changes, retired-food exclusion');
  await db.query(
    "update user_subscriptions set revoked_at=now() where user_id=$1",
    [user],
  );
  await assert.rejects(
    () =>
      db.query("select member_begin_order($1,'trial',0,3,$2,false)", [
        user,
        pre,
      ]),
    /TRIAL_USED/,
  );
  const newPre = await store(other);
  const half = Math.ceil(Number(price) / 2);
  const nutrition = (
    await db.query(
      "select member_begin_order($1,'silver',$2,14,$3,false) as o",
      [other, half, newPre],
    )
  ).rows[0].o;
  assert.equal(Number(nutrition.price_toman), half);
  assert.equal(nutrition.duration_days, 14);
  await db.query(
    "update payment_orders set authority='S123456789012345678901234567890123' where id=$1",
    [nutrition.id],
  );
  await db.query("select billing_settle($1,'12345',100)", [nutrition.id]);
  const gold = (
    await db.query(
      "select price_toman from subscription_plans where code='gold'",
    )
  ).rows[0].price_toman;
  const upgrade = (
    await db.query("select member_begin_order($1,'gold',$2,14,$3,true) as o", [
      other,
      Math.max(0, Math.ceil(Number(gold) / 2) - half),
      newPre,
    ])
  ).rows[0].o;
  await assert.rejects(
    () => db.query("select billing_settle($1,null,null)", [upgrade.id]),
    /VERIFY_REQUIRED/,
  );
  await db.query(
    "update payment_orders set authority='S123456789012345678901234567890124' where id=$1",
    [upgrade.id],
  );
  await db.query("select billing_settle($1,'12346',100)", [upgrade.id]);
  assert.equal((await db.query('select count(*)::int n from member_training_plans where user_id=$1',[other])).rows[0].n,1,'Approved training is activated on settlement');
  assert.equal(
    (await db.query("select member_training_access($1) as a", [other])).rows[0]
      .a,
    true,
  );
  const ends = (
    await db.query(
      "select expires_at from user_subscriptions where source_order_id=$1",
      [upgrade.id],
    )
  ).rows[0].expires_at;
  assert.equal(
    new Date(ends).getTime(),
    new Date(upgrade.upgrade_expiry).getTime(),
  );
  await as(user);
  const org = (
    await db.query("select pro_register('متخصص تست','nutrition',true) as id")
  ).rows[0].id;
  assert(org);
  assert.equal(
    (await db.query("select pro_register('متخصص تست','nutrition',true) as id"))
      .rows[0].id,
    org,
  );
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select case_limit from pro_workspace_licenses where organization_id=$1",
        [org],
      )
    ).rows[0].case_limit,
    3,
  );
  await as(user);
  await assert.rejects(
    () => db.query("select * from member_preflights"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select * from product_events"),
    /permission denied/,
  );
  await assert.rejects(
    () =>
      db.query("select record_product_event($1,$2,'weight_80',null,'app')", [
        randomUUID(),
        randomUUID(),
      ]),
    /INVALID_EVENT/,
  );
  const mealChangeEvents = ["meal_change_unavailable", "meal_change_save_failed"];
  for (const event of ["meal_changed", "meal_changed_verified"]) {
    await assert.rejects(
      () => db.query("select record_product_event($1,$2,$3,null,'app')", [randomUUID(), randomUUID(), event]),
      /INVALID_EVENT/,
    );
  }
  for (const event of mealChangeEvents) {
    await db.query("select record_product_event($1,$2,$3,null,'app')", [randomUUID(), randomUUID(), event]);
  }
  await db.exec("reset role");
  const initialDiet = { vegetarianStatus: "none", allergies: [] };
  const updatedDiet = { ...initialDiet, allergies: ["celery"] };
  const diet = value => db.query("update user_profiles set dietary_preferences_json=$1 where id=$2", [value, other]);
  await diet(initialDiet);
  await as(other);
  const date = (await db.query("select current_date::text as d")).rows[0].d;
  const plan = { isWorkoutDay: false, targets: {}, meals: [{ slot: "lunch", templateId: "first" }] };
  const edited = { ...plan, meals: [{ slot: "lunch", templateId: "second" }] };
  const save = async (currentDiet, next, version, replace = false, edit = false) =>
    (await db.query("select save_member_meal_schedule_v3($1,'test',$2,$3,$4,$5) as days",
      [date, JSON.stringify([{ date, plan: next, expected_updated_at: version }]), currentDiet, replace, edit])).rows[0].days[0];
  const baseline = await save(initialDiet, plan, null);
  await db.exec("reset role");
  await diet(updatedDiet);
  await as(other);
  await assert.rejects(() => save(initialDiet, edited, baseline.updated_at, true, true), /MEAL_PROFILE_CHANGED/);
  await assert.rejects(() => db.query("select save_member_meal_schedule_v2($1,'test','[]',true)", [date]), /permission denied/);
  const changed = await save(updatedDiet, edited, baseline.updated_at, true, true);
  assert.equal(changed.plan.meals[0].templateId, "second");
  await assert.rejects(() => save(updatedDiet, plan, baseline.updated_at, true, true), /MEAL_SCHEDULE_CONFLICT/);
  await save(updatedDiet, edited, changed.updated_at, true, true);
  await as(user);
  const reviewKey = "c0ffee00";
  const readReviews = () => db.query("select review_key from member_weekly_review_acknowledgements");
  const acknowledge = (id, key = reviewKey) => db.query(
    "insert into member_weekly_review_acknowledgements values($1,$2) on conflict do nothing",
    [id, key],
  );
  await acknowledge(user);
  await acknowledge(user);
  assert.deepEqual((await readReviews()).rows, [{ review_key: reviewKey }]);
  await assert.rejects(() => acknowledge(other), /row-level/);
  await assert.rejects(() => acknowledge(user, "invalid"), /check constraint/);
  await assert.rejects(() => db.exec("update member_weekly_review_acknowledgements set review_key='ba5eba11'"), /permission denied/);
  await as(other);
  assert.deepEqual((await readReviews()).rows, []);
  await assert.rejects(() => acknowledge(user), /row-level/);
  await db.exec("reset role; set role anon");
  await assert.rejects(readReviews, /permission denied/);
  await assert.rejects(() => acknowledge(user), /permission denied/);
  await as(user);
  await db.query("select record_product_event($1,$2,'app_open',null,'app')", [
    randomUUID(),
    randomUUID(),
  ]);
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from user_subscriptions where user_id=$1 and plan_code like 'pro_%'",
        [user],
      )
    ).rows[0].n,
    0,
  );

  await db.exec("reset role");
  await db.query(
    "insert into admin_members(user_id) values($1) on conflict do nothing",
    [user],
  );
  await as(user);
  const menus = (await db.query("select admin_member_menus() as c")).rows[0].c;
  assert(menus.templates.length > 0);
  const food = menus.foods.find((f) => f.id === "chicken_breast");
  assert(food);
  await db.query(
    "select admin_save_member_menu('test_market_menu','منوی تست','lunch',null,$1,true)",
    [JSON.stringify([{ food: food.id, fixed: null }])],
  );
  const catalog = (await db.query("select admin_member_menus() as c")).rows[0]
    .c;
  const menu = catalog.templates.find((t) => t.id === "test_market_menu");
  assert(menu);
  await assert.rejects(
    () =>
      db.query(
        "select admin_save_member_menu('test_market_menu','نسخه کهنه','lunch',null,$1,true)",
        [JSON.stringify([{ food: food.id, fixed: null }])],
      ),
    /STALE_MENU/,
  );
  await assert.rejects(
    () =>
      db.query(
        "select admin_save_member_menu('test_bad_menu','ناسازگار','lunch',null,$1,true)",
        [JSON.stringify([{ food: food.id, fixed: 9999 }])],
      ),
    /INVALID_PORTION/,
  );
  const pulse = (await db.query("select admin_business_pulse(30) as p")).rows[0]
    .p;
  assert(pulse.events.some((e) => e.event === "app_open"));
  for (const event of [...mealChangeEvents, "meal_changed_verified"]) assert.equal(pulse.events.find(e => e.event === event)?.events, 1);
  await db.exec("reset role");
  for (let i = 0; i < 5; i++)
    assert.equal(
      (
        await db.query("select member_reserve_compute($1,'preflight') as a", [
          other,
        ])
      ).rows[0].a,
      true,
    );
  assert.equal(
    (
      await db.query("select member_reserve_compute($1,'preflight') as a", [
        other,
      ])
    ).rows[0].a,
    false,
  );
  const {intake}=await import('./pro-real-plan.test.mjs');
  const { display_name, phone, ...answers } = intake;
  const celeryIntake = { ...answers, allergies: ["celery"] };
  const validation = (await db.query(
    "select pro_private.valid_intake($1) as sandbox, pro_private.valid_real_intake($2) as real, pro_private.valid_intake($3) as out_of_bounds",
    [celeryIntake, { ...celeryIntake, display_name, phone }, { ...celeryIntake, height_cm: 99 }],
  )).rows[0];
  assert.deepEqual(validation, { sandbox: true, real: true, out_of_bounds: false });
  for (const allergy of ['egg', 'sesame']) {
    const a = { ...answers, allergies: [allergy] };
    const result = (await db.query('select pro_private.valid_intake($1) as sandbox, pro_private.valid_real_intake($2) as real', [a, {...a, display_name, phone}])).rows[0];
    assert.deepEqual(result, {sandbox:true, real:true});
  }
  const migration047 = await readFile(new URL('../supabase/migrations/20261105094021_047_egg_sesame_allergen_safety.sql', import.meta.url), 'utf8');
  await db.exec(migration047); // repeat-safe without rewriting historical snapshots
  const eggs = (await db.query("select id,allergy_flags,allergen_assessment from food_items where id in ('egg_whole','egg_white') order by id")).rows;
  assert.equal(eggs.length,2);
  for (const egg of eggs) { assert(egg.allergy_flags.includes('egg')); assert.equal(egg.allergen_assessment.egg,'contains'); }
  for (const assessment of [{egg:'safe'}, {other:'contains'}, {sesame:'assessed_absent'}]) {
    await assert.rejects(() => db.query("update food_items set allergen_assessment=$1,allergen_assessment_source=null where id='sangak_bread'", [assessment]), /food_items_allergen_assessment_check/);
  }
  assert.equal((await db.query("select public.valid_food_allergen_assessment($1,$2) as ok", [{sesame:'assessed_absent'},'synthetic-reviewed-source'])).rows[0].ok,true);
  await as(user);const trialCases=[];
  for(let i=0;i<3;i++)trialCases.push((await db.query('select pro_save_real_case($1,null,0,$2,$3) as c',[org,JSON.stringify({...intake,display_name:'پرونده '+i}),randomUUID()])).rows[0].c);
  await assert.rejects(()=>db.query('select pro_save_real_case($1,null,0,$2,$3)',[org,JSON.stringify({...intake,display_name:'پرونده چهارم'}),randomUUID()]),/PRO_CASE_LIMIT/);
  await db.exec('reset role');
  await db.query("update billing_settings set mode='live' where id");
  const proPrice = Number(
    (
      await db.query(
        "select prices->>'1' as p from pro_offers where code='nutrition'",
      )
    ).rows[0].p,
  );
  const proOrder = (
    await db.query("select pro_begin_checkout($1,'nutrition',1,$2) as o", [
      user,
      proPrice,
    ])
  ).rows[0].o;
  await assert.rejects(
    () => db.query("select billing_settle($1,null,null)", [proOrder.id]),
    /VERIFY_REQUIRED/,
  );
  await db.query(
    "update payment_orders set authority='S123456789012345678901234567890125' where id=$1",
    [proOrder.id],
  );
  await db.query("select billing_settle($1,'12347',100)", [proOrder.id]);
  await db.query("select billing_settle($1,'12347',100)", [proOrder.id]);
  const license = (
    await db.query(
      "select expires_at,case_limit from pro_workspace_licenses where organization_id=$1",
      [org],
    )
  ).rows[0];
  assert.equal(license.case_limit, 100000);
  assert(new Date(license.expires_at) < new Date(Date.now() + 40 * 86400000));
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from user_subscriptions where source_order_id=$1",
        [proOrder.id],
      )
    ).rows[0].n,
    0,
  );
  await as(other);
  await assert.rejects(
    () => db.query("select admin_member_experiences(0)"),
    /ADMIN_REQUIRED/,
  );
  await db.exec("reset role");
  await import('./market-regressions-database.mjs').then(m=>m.regressions({db,user,other,as,store,org}));
  await import('./market-v3-database.mjs').then(m=>m.v3Regressions({db,as,store}));
  await import('./pro-specialist-profile-database.test.mjs').then(m=>m.testSpecialistProfiles({db}));
  console.log(
    "PASS market SQL: migrations, admin gates, RPC privilege boundaries, catalog/profile-bound preflight, forged prices, half-price, single-use trial, verified/idempotent settlement, dynamic upgrade with original expiry, Pro trial provisioning, analytics minimization",
  );
}
