import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { emptyRealIntake } from '../src/professional/menuPlan.ts';

export async function testGenerationAccess({ db, asUser, rpc, equal, denied }) {
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/migrations/20261115090000_057_pro_generation_access.sql', import.meta.url), 'utf8'));

  const owner = randomUUID(), foreignOwner = randomUUID();
  const assigned = randomUUID(), colleague = randomUUID(), reception = randomUUID(), member = randomUUID();
  for (const id of [owner, foreignOwner, assigned, colleague, reception, member]) {
    await db.query("insert into auth.users(id,phone,phone_confirmed_at) values($1,'989000000000',now())", [id]);
    if (id !== member) await db.query("insert into pro_pilot_access(user_id,expires_at) values($1,now()+interval '1 day')", [id]);
  }
  const makeOrg = async id => {
    await asUser(id);
    return (await rpc('pro_create_sandbox_organization', [randomUUID()])).id;
  };
  const org = await makeOrg(owner), other = await makeOrg(foreignOwner);
  await db.exec('reset role');
  for (const [id, role] of [[assigned,'practitioner'],[colleague,'practitioner'],[reception,'assistant']])
    await db.query('insert into pro_memberships(organization_id,user_id,roles) values($1,$2,$3)', [org,id,[role]]);

  const intake = {
    ...emptyRealIntake(), display_name:'پرونده آزمایشی', birth_date:'1992-04-23',
    height_cm:165, weight_kg:75, safety_confirmed:true,
  };
  await asUser(assigned);
  const { id: record } = await rpc('pro_save_real_case', [org,null,0,intake,randomUUID()]);
  await asUser(foreignOwner);
  const { id: otherRecord } = await rpc('pro_save_real_case', [other,null,0,intake,randomUUID()]);
  const plan = JSON.parse(await readFile(new URL('../output/pdf/sample-plan.json', import.meta.url), 'utf8'));
  Object.assign(plan, { display_name:intake.display_name, intake_revision:1 });
  const request = { date:plan.date, count:plan.requested_menus, notes:plan.notes };
  const key = randomUUID();
  const args = [org, record, 1, assigned, key, request];
  const prepare = async (values = args) => {
    await asUser(null,'service_role');
    return rpc('pro_prepare_server_plan',values);
  };
  const stage = async (values = args) => {
    await asUser(null,'service_role');
    return rpc('pro_stage_server_plan',[...values,plan]);
  };
  await denied(() => rpc('pro_prepare_server_plan',args), /permission denied/);
  await denied(() => prepare([null,null,null,assigned,null,null]), /PRO_ACCESS_DENIED/);
  equal(await prepare(), { revision:1, answers:intake });
  await denied(() => prepare([org,otherRecord,...args.slice(2)]));
  for (const actor of [colleague,reception,member,foreignOwner])
    await denied(() => prepare([org,record,1,actor,key,request]));
  const staged = await stage();
  equal(await prepare(), { draft:staged }, 'Lost response uses the committed draft');
  await denied(() => prepare([...args.slice(0,5),{...request,notes:'other'}]), /PRO_REQUEST_CONFLICT/);
  await denied(() => prepare([org,record,1,owner,key,request]), /PRO_REQUEST_CONFLICT/);
  await asUser(null,'service_role');
  await denied(() => db.query('select pro_private.pro_stage_server_plan($1,$2,$3,$4,$5,$6,$7)', [...args,plan]), /permission denied/);
  const published = await rpc('pro_publish_server_plan',[org,record,1,assigned,randomUUID(),staged.draft_id]);
  await db.exec('reset role');
  const report = randomUUID();
  await db.query(`insert into pro_body_report_jobs(id,organization_id,record_id,actor_id,intake_revision,request_hash,state,lease,report)
    values($1,$2,$3,$4,1,repeat('c',64),'complete',$5,'{"version":1}'::jsonb)`, [report,org,record,assigned,randomUUID()]);

  for (const [actor, mayRead] of [[assigned,true],[owner,true],[colleague,false],[reception,false],[foreignOwner,false],[member,false]]) {
    await asUser(actor);
    for (const [table,column] of [['pro_real_cases','id'],['pro_real_intake_versions','record_id'],['pro_real_plans','record_id']])
      equal((await db.query(`select 1 from public.${table} where ${column}=$1`,[record])).rows.length, Number(mayRead), table);
    if (mayRead) {
      equal((await rpc('pro_body_reports',[org,record]))[0].id, report);
    } else {
      await denied(() => rpc('pro_body_reports',[org,record]), /PRO_ACCESS_DENIED/);
      await denied(() => rpc('pro_browse_case_history',[org,record,'plans',0]));
      await denied(() => rpc('pro_save_real_case',[org,record,1,intake,randomUUID()]));
    }
  }
  await asUser(null, 'anon');
  await denied(() => db.query('select id from pro_real_cases'), /permission denied/);
  await denied(() => rpc('pro_body_reports',[org,record]), /permission denied/);

  // A license expires, a module is disabled, or membership changes between
  // preflight and commit. Read access is distinct from permission to write.
  equal(await prepare([org,record,1,assigned,randomUUID(),request]), { revision:1, answers:intake });
  await db.exec('reset role');
  await db.query("insert into pro_workspace_licenses(organization_id,status,expires_at,case_limit,updated_by) values($1,'active',now()-interval '1 hour',20,$2)",[org,owner]);
  await denied(() => stage(), /PRO_SUBSCRIPTION_EXPIRED/);
  await asUser(assigned);
  equal((await rpc('pro_browse_case_history',[org,record,'plans',0])).rows[0].id,published);
  await db.exec('reset role');
  await db.query("update pro_workspace_licenses set expires_at=now()+interval '1 day' where organization_id=$1",[org]);
  await db.query('insert into pro_module_access(organization_id,nutrition,training) values($1,false,true) on conflict(organization_id) do update set nutrition=false,training=true',[org]);
  await denied(() => stage(), /PRO_MODULE_DISABLED/);
  await db.exec('reset role');
  await db.query('update pro_module_access set nutrition=true where organization_id=$1',[org]);
  await asUser(owner);
  await rpc('pro_set_case_archived',[org,record,0,true,randomUUID()]);
  await denied(() => stage(), /PRO_CASE_ARCHIVED/);
  await asUser(owner);
  await rpc('pro_set_case_archived',[org,record,1,false,randomUUID()]);
  await db.exec('reset role');
  await db.query("update pro_memberships set status='revoked' where organization_id=$1 and user_id=$2",[org,assigned]);
  await denied(() => prepare());
  await denied(() => stage());
  await asUser(assigned);
  equal((await db.query('select id from pro_real_plans where id=$1',[published])).rows,[]);
  await denied(() => rpc('pro_body_reports',[org,record]));
  console.log('PASS Pro generation tenant isolation, role permissions, revocation, expiry, replay and staging checks');
}
