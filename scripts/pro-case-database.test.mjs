import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
// Reuses the exact SQL/role harness of phase 1; also runs on native PG in CI.
export async function testCaseDatabase({ db, asUser, rpc, equal, denied }) {
  await db.exec("reset role");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261020_024_pro_case_records.sql",
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
  const createKey = randomUUID();
  const rec = await rpc("pro_create_case", [org, createKey]);
  equal(
    (await rpc("pro_create_case", [org, createKey])).id,
    rec.id,
    "Case creation retry",
  );
  await asUser(stranger);
  const other = (await rpc("pro_create_sandbox_organization", [randomUUID()]))
    .id;
  const otherCase = await rpc("pro_create_case", [other, randomUUID()]);
  equal(
    (await db.query("select id from pro_case_records")).rows.map((x) => x.id),
    [otherCase.id],
  );
  await denied(() => rpc("pro_case_access", [org, rec.id]));
  await denied(() => rpc("pro_case_permission_summary", [org, rec.id]));
  await denied(() => rpc("pro_create_case", [org, randomUUID()]));
  await db.exec("reset role");
  for (const [id, role] of [
    [doc, "practitioner"],
    [assistant, "assistant"],
  ])
    await db.query(
      "insert into pro_memberships(organization_id,user_id,roles) values($1,$2,$3)",
      [org, id, [role]],
    );
  await asUser(owner);
  equal(
    (await rpc("pro_case_access", [org, rec.id])).can_edit,
    false,
    "Owner is not clinician",
  );
  await rpc("pro_assign_case", [org, rec.id, doc, true, randomUUID()]);
  await denied(
    () => rpc("pro_assign_case", [org, otherCase.id, doc, true, randomUUID()]),
    /PRO_INVALID_REQUEST/,
  );
  await denied(
    () => rpc("pro_assign_case", [org, rec.id, assistant, true, randomUUID()]),
    /PRO_INVALID_PRACTITIONER/,
  );
  const expiry = new Date(Date.now() + 86400000).toISOString(),
    permissionKey = randomUUID();
  const grant = await rpc("pro_simulate_case_permission", [
    org,
    rec.id,
    "processing",
    "grant",
    expiry,
    permissionKey,
  ]);
  equal(
    (
      await rpc("pro_simulate_case_permission", [
        org,
        rec.id,
        "processing",
        "grant",
        expiry,
        permissionKey,
      ])
    ).id,
    grant.id,
    "Grant retry",
  );
  await denied(
    () =>
      rpc("pro_simulate_case_permission", [
        org,
        rec.id,
        "progress_sharing",
        "grant",
        expiry,
        permissionKey,
      ]),
    /PRO_REQUEST_CONFLICT/,
  );
  await denied(
    () =>
      rpc("pro_simulate_case_permission", [
        org,
        rec.id,
        "processing",
        "grant",
        new Date(Date.now() + 40 * 86400000).toISOString(),
        randomUUID(),
      ]),
    /PRO_INVALID_EXPIRY/,
  );
  const answers = {
    gender: "female",
    birth_date: "1992-04-23",
    height_cm: 155,
    weight_kg: 85,
    goal: "weight_loss",
    activity_level: "sedentary",
    workout_days: 0,
    training_type: "none",
    protein_budget: "economic",
    vegetarian_status: "none",
    allergies: [],
    medical_conditions: [],
    pregnancy_status: "not_pregnant",
    eating_disorder_status: "none",
    medications_present: false,
    injuries_present: false,
    safety_confirmed: true,
    screening_version: 1,
  };
  const save = (expected = 0, a = answers, key = randomUUID()) =>
    rpc("pro_save_intake", [org, rec.id, expected, JSON.stringify(a), key]);
  await denied(() => save(), /PRO_CLINICAL_ACCESS_DENIED/);
  await asUser(doc);
  equal(
    (await rpc("pro_case_access", [org, rec.id])).can_edit,
    false,
    "Role + assignment + permission do not simulate qualification",
  );
  await denied(() => save(), /PRO_CLINICAL_ACCESS_DENIED/);
  await db.exec("reset role");
  await db.query(
    "insert into pro_sandbox_capabilities(user_id,expires_at,granted_by) values($1,now()+interval '1 day',$2)",
    [doc, owner],
  );
  await asUser(doc);
  equal((await rpc("pro_case_access", [org, rec.id])).can_edit, true);
  const key = randomUUID();
  const first = await save(0, answers, key);
  equal(first.revision, 1);
  equal((await save(0, answers, key)).revision, 1, "Lost response replay");
  await denied(
    () => save(0, { ...answers, weight_kg: 84 }, key),
    /PRO_REQUEST_CONFLICT/,
  );
  await denied(
    () => save(0, { ...answers, weight_kg: 84 }),
    /PRO_STALE_REVISION/,
  );
  const second = await save(1, { ...answers, weight_kg: 84 });
  equal(second.revision, 2);
  equal(
    (
      await db.query(
        "select revision from pro_intake_revisions order by revision",
      )
    ).rows.map((x) => x.revision),
    [1, 2],
  );
  for (const patch of [
    { weight_kg: 0 },
    { height_cm: "155" },
    { workout_days: 2 },
    { birth_date: "2030-01-01" },
    { birth_date: "2026-02-31" },
    { medical_conditions: ["invented"] },
    { allergies: ["phone"] },
    { gender: null },
    { safety_confirmed: false },
    { phone: "+989111111111" },
    { targetCalories: 100 },
    { birth_date: "1900-01-01" },
    { medications_present: "false" },
    { screening_version: 2 },
    { allergies: null },
    { pregnancy_status: "not_applicable" },
  ])
    await denied(() => save(2, { ...answers, ...patch }), /PRO_INVALID_INTAKE/);
  await denied(
    () =>
      db.query(
        "insert into pro_intake_revisions(organization_id,record_id,revision,answers,processing_event_id,recorded_by,request_key,expected_revision) values($1,$2,3,$3,$4,$5,$6,2)",
        [org, rec.id, answers, grant.id, doc, randomUUID()],
      ),
    /permission denied/,
  );
  await denied(
    () => db.exec("update pro_intake_revisions set revision=999"),
    /permission denied/,
  );
  await denied(
    () =>
      db.query(
        "insert into pro_sandbox_capabilities(user_id,expires_at,granted_by) values($1,now()+interval '1 day',$1)",
        [doc],
      ),
    /permission denied/,
  );
  await denied(() =>
    rpc("pro_assign_case", [org, rec.id, doc, false, randomUUID()]),
  );
  await denied(() =>
    rpc("pro_simulate_case_permission", [
      org,
      rec.id,
      "processing",
      "grant",
      expiry,
      randomUUID(),
    ]),
  );
  await asUser(assistant);
  equal(
    (await db.query("select id from pro_case_records")).rows.map((x) => x.id),
    [rec.id],
    "Assistant sees reception only",
  );
  equal(
    (await db.query("select * from pro_intake_revisions")).rows.length,
    0,
    "Assistant cannot select health columns",
  );
  await denied(() => save(2), /PRO_CLINICAL_ACCESS_DENIED/);
  await denied(() =>
    rpc("pro_assign_case", [org, rec.id, assistant, true, randomUUID()]),
  );
  await asUser(owner);
  equal(
    (await db.query("select * from pro_intake_revisions")).rows.length,
    0,
    "Owner cannot read clinical history",
  );
  await rpc("pro_simulate_case_permission", [
    org,
    rec.id,
    "processing",
    "revoke",
    null,
    randomUUID(),
  ]);
  await rpc("pro_simulate_case_permission", [
    org,
    rec.id,
    "processing",
    "grant",
    expiry,
    permissionKey,
  ]);
  await asUser(doc);
  equal(
    (await db.query("select * from pro_intake_revisions")).rows.length,
    0,
    "Replayed old grant cannot resurrect revoked access",
  );
  await denied(() => save(0, answers, key), /PRO_CLINICAL_ACCESS_DENIED/);
  await asUser(owner);
  await rpc("pro_simulate_case_permission", [
    org,
    rec.id,
    "relationship",
    "grant",
    expiry,
    randomUUID(),
  ]);
  await rpc("pro_simulate_case_permission", [
    org,
    rec.id,
    "progress_sharing",
    "grant",
    expiry,
    randomUUID(),
  ]);
  await asUser(doc);
  equal(
    (await rpc("pro_case_access", [org, rec.id])).can_edit,
    false,
    "Other consent purposes do not authorize intake",
  );
  await asUser(owner);
  await rpc("pro_simulate_case_permission", [
    org,
    rec.id,
    "processing",
    "grant",
    expiry,
    randomUUID(),
  ]);
  await rpc("pro_assign_case", [org, rec.id, doc, false, randomUUID()]);
  await asUser(doc);
  equal(
    (await db.query("select * from pro_case_records")).rows.length,
    0,
    "Assignment revocation hides reception",
  );
  await denied(() => save(2), /PRO_CLINICAL_ACCESS_DENIED/);
  await asUser(owner);
  const assignKey = randomUUID();
  await rpc("pro_assign_case", [org, rec.id, doc, true, assignKey]);
  await rpc("pro_assign_case", [org, rec.id, doc, false, randomUUID()]);
  await rpc("pro_assign_case", [org, rec.id, doc, true, assignKey]);
  await asUser(doc);
  equal(
    (await db.query("select * from pro_intake_revisions")).rows.length,
    0,
    "Replayed assignment cannot undo later revocation",
  );
  await asUser(owner);
  await denied(
    () => rpc("pro_assign_case", [org, rec.id, doc, false, assignKey]),
    /PRO_REQUEST_CONFLICT/,
  );
  await rpc("pro_assign_case", [org, rec.id, doc, true, randomUUID()]);
  await db.exec("reset role");
  await db.query(
    "update pro_sandbox_capabilities set expires_at=now()-interval '1 hour' where user_id=$1",
    [doc],
  );
  await asUser(doc);
  equal(
    (await db.query("select * from pro_intake_revisions")).rows.length,
    0,
    "Capability expiry closes health read",
  );
  await db.exec("reset role");
  await db.query(
    "update pro_sandbox_capabilities set expires_at=now()+interval '1 day' where user_id=$1",
    [doc],
  );
  await db.query(
    "update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2",
    [org, doc],
  );
  await asUser(doc);
  await denied(() => save(2), /PRO_CLINICAL_ACCESS_DENIED/);
  await db.exec("reset role");
  await denied(
    () =>
      db.query(
        "insert into pro_intake_revisions(organization_id,record_id,revision,answers,processing_event_id,recorded_by,request_key,expected_revision) values($1,$2,1,$3,$4,$5,$6,0)",
        [
          other,
          otherCase.id,
          JSON.stringify(answers),
          grant.id,
          stranger,
          randomUUID(),
        ],
      ),
    /foreign key/,
  );
  await denied(
    () => db.exec("update pro_intake_revisions set answers='{}'"),
    /PRO_IMMUTABLE_AUDIT/,
  );
  await denied(
    () => db.exec("delete from pro_case_permission_events"),
    /PRO_IMMUTABLE_AUDIT/,
  );
  await denied(
    () => db.exec("delete from pro_case_audit_events"),
    /PRO_IMMUTABLE_AUDIT/,
  );
  await denied(
    () =>
      db.query(
        "insert into pro_case_assignments(organization_id,record_id,practitioner_id,assigned_by) values($1,$2,$3,$4)",
        [other, rec.id, stranger, owner],
      ),
    /foreign key/,
  );
  equal(
    (
      await db.query(
        "select count(*)::int as n from pro_practitioner_credentials where user_id=$1",
        [doc],
      )
    ).rows[0].n,
    0,
    "No simulated professional credential becomes real",
  );
  await denied(
    () => db.exec("delete from pro_sandbox_capability_events"),
    /PRO_IMMUTABLE_AUDIT/,
  );
  await asUser(owner);
  const summary = await rpc("pro_case_permission_summary", [org, rec.id]);
  equal(
    summary.length,
    3,
    "One latest event per purpose, independent of history size",
  );
  equal(summary.find((x) => x.purpose === "processing").decision, "grant");
  await db.exec("reset role");
  const newTables = [
    "pro_sandbox_capability_events",
    "pro_case_assignment_commands",
    "pro_case_records",
    "pro_sandbox_capabilities",
    "pro_case_assignments",
    "pro_case_permission_events",
    "pro_intake_revisions",
    "pro_case_audit_events",
  ];
  for (const table of newTables)
    equal(
      (
        await db.query(
          "select relrowsecurity from pg_class where oid=$1::regclass",
          [table],
        )
      ).rows[0].relrowsecurity,
      true,
      table,
    );
  if (process.env.PRO_TEST_DATABASE_URL) {
    const { Client } = await import("pg");
    await db.query(
      "update pro_memberships set status='active' where organization_id=$1 and user_id=$2",
      [org, doc],
    );
    const clients = [
      new Client({ connectionString: process.env.PRO_TEST_DATABASE_URL }),
      new Client({ connectionString: process.env.PRO_TEST_DATABASE_URL }),
    ];
    try {
      await Promise.all(clients.map((c) => c.connect()));
      for (const c of clients) {
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          doc,
        ]);
        await c.query("set role authenticated");
      }
      const results = await Promise.allSettled(
        clients.map((c, i) =>
          c.query(
            "select to_jsonb(public.pro_save_intake($1,$2,2,$3,$4)) as result",
            [
              org,
              rec.id,
              JSON.stringify({ ...answers, weight_kg: 83 - i }),
              randomUUID(),
            ],
          ),
        ),
      );
      equal(
        results.filter((r) => r.status === "fulfilled").length,
        1,
        "Concurrent different edits: one winner",
      );
      equal(
        results
          .filter((r) => r.status === "rejected")
          .map((r) => r.reason.message),
        ["PRO_STALE_REVISION"],
      );
      const sharedKey = randomUUID();
      const repeated = await Promise.all(
        clients.map((c) =>
          c.query(
            "select to_jsonb(public.pro_save_intake($1,$2,3,$3,$4)) as result",
            [
              org,
              rec.id,
              JSON.stringify({ ...answers, weight_kg: 81 }),
              sharedKey,
            ],
          ),
        ),
      );
      equal(
        repeated.map((r) => r.rows[0].result.revision),
        [4, 4],
        "Concurrent same-request retry writes one version",
      );
      await clients[1].query("reset role");
      await clients[1].query(
        "select set_config('request.jwt.claim.sub',$1,false)",
        [owner],
      );
      await clients[1].query("set role authenticated");
      const race = await Promise.allSettled([
        clients[0].query("select public.pro_save_intake($1,$2,4,$3,$4)", [
          org,
          rec.id,
          JSON.stringify({ ...answers, weight_kg: 80 }),
          randomUUID(),
        ]),
        clients[1].query(
          "select public.pro_simulate_case_permission($1,$2,'processing','revoke',null,$3)",
          [org, rec.id, randomUUID()],
        ),
      ]);
      equal(race[1].status, "fulfilled", "Revocation always completes");
      if (race[0].status === "rejected")
        equal(race[0].reason.message, "PRO_CLINICAL_ACCESS_DENIED");
      await asUser(doc);
      equal(
        (await db.query("select * from pro_intake_revisions")).rows.length,
        0,
        "No reads after concurrent revocation",
      );
      await denied(() => save(4), /PRO_CLINICAL_ACCESS_DENIED/);
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await db.exec("reset role");
    }
  }
}
