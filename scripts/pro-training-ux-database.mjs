import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {emptyRealIntake} from '../src/professional/menuPlan.ts';
import {trainingLine} from '../src/professional/studioModel.ts';
export async function testProTrainingUx(db){
 await db.exec('reset role');
 const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
 const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 const user=async()=>{await db.exec('reset role');const id=randomUUID();await db.query("insert into auth.users(id,phone,phone_confirmed_at)values($1,'989100000099',now())",[id]);return id;};
 const license=async org=>{await db.exec('reset role');return(await db.query('select * from pro_workspace_licenses where organization_id=$1',[org])).rows[0];};
 const admin=await user();await db.query('insert into admin_members(user_id)values($1)',[admin]);
 const legacyOwner=await user();await as(legacyOwner);const legacy=await rpc('pro_register',['آزمایشی قدیمی مصنوعی','training',true]);
 const original=await license(legacy);
 const expiredOwner=await user();await as(expiredOwner);const expired=await rpc('pro_register',['آزمایشی قدیمی منقضی','training',true]);
 const intake={...emptyRealIntake(),display_name:'مراجع مصنوعی',phone:'09111234567',birth_date:'1992-04-23',weight_kg:85,height_cm:180,gender:'male',pregnancy_status:'not_applicable',activity_level:'moderate',safety_confirmed:true};
 const historical=await rpc('pro_save_real_case',[expired,null,0,intake,randomUUID()]);
 await db.exec('reset role');await db.query("update pro_organizations set created_at=now()-interval '60 days' where id=$1",[expired]);
 await db.query("update pro_workspace_licenses set expires_at=(select created_at+interval '10 years' from pro_organizations where id=$1)where organization_id=$1",[expired]);
 await db.query("update pro_pilot_access set expires_at=(select created_at+interval '10 years' from pro_organizations where id=$1)where user_id=$2",[expired,expiredOwner]);
 const managedOwner=await user();await as(managedOwner);const managed=await rpc('pro_register',['مجوز دستی مصنوعی','training',true]);const managedOld=await license(managed);
 await as(admin);await rpc('admin_pro_set_license',[managed,managedOld.revision,'active',managedOld.expires_at,3,'مجوز دستی مصنوعی برای حفظ در تست',randomUUID()]);const managedBefore=await license(managed);
 const paidOwner=await user();await as(paidOwner);const paidOrg=await rpc('pro_register',['پرداخت قبلی مصنوعی','training',true]);
 await db.exec('reset role');const settings=(await db.query('select mode,checkout_enabled from billing_settings where id')).rows[0];
 async function checkout(actor,months,code='nutrition'){
  await db.exec('reset role');await db.query("update billing_settings set mode='live',checkout_enabled=true where id");
  const price=(await db.query('select (prices->>$1)::bigint amount from pro_offers where code=$2',[String(months),code])).rows[0].amount;
  const order=await rpc('pro_begin_checkout',[actor,code,months,price]);
  await db.query('update payment_orders set authority=$1 where id=$2',['S'+randomUUID().replaceAll('-',''),order.id]);
  const result=await rpc('billing_settle',[order.id,BigInt('0x'+randomUUID().replaceAll('-','').slice(0,20)).toString(),100]);
  return{order,result};
 }
 await checkout(paidOwner,3);const paidBefore=await license(paidOrg);
 await db.exec(await readFile(new URL('../supabase/migrations/20261108223703_055_pro_training_terms_directory.sql',import.meta.url),'utf8'));
 const corrected=await license(legacy);
 assert.equal(corrected.case_limit,3);assert.equal(corrected.revision,original.revision+1);
 assert.equal((await db.query("select l.expires_at=o.created_at+interval '1 month' ok from pro_workspace_licenses l join pro_organizations o on o.id=l.organization_id where o.id=$1",[legacy])).rows[0].ok,true);
 assert.deepEqual(await license(managed),managedBefore,'An explicit admin term must not be shortened');
 assert.deepEqual(await license(paidOrg),paidBefore,'An existing paid package must not be rewritten');
 assert.equal((await db.query('select count(*)::int n from pro_private.workspace_term_repairs where organization_id in($1,$2)',[legacy,expired])).rows[0].n,2);
 await as(expiredOwner);const oldStatus=await rpc('pro_workspace_status',[expired]);assert.equal(oldStatus.can_write,false);
 assert.equal((await rpc('pro_browse_case_directory',[expired,'',0,false])).rows[0].id,historical.id);
 await assert.rejects(()=>rpc('pro_save_real_case',[expired,null,0,intake,randomUUID()]),/PRO_SUBSCRIPTION_EXPIRED/);
 const freshOwner=await user();await as(freshOwner);const fresh=await rpc('pro_register',['آزمایشی جدید مصنوعی','training',true]);const freshBefore=await license(fresh);
 assert.equal(freshBefore.case_limit,3);
 assert.equal((await db.query("select abs(extract(epoch from l.expires_at)-extract(epoch from o.created_at+interval '1 month'))<2 ok from pro_workspace_licenses l join pro_organizations o on o.id=l.organization_id where o.id=$1",[fresh])).rows[0].ok,true);
 await as(freshOwner);assert.equal(await rpc('pro_register',['ثبت تکراری','training',true]),fresh);assert.deepEqual(await license(fresh),freshBefore,'Retry does not renew the trial or expand capacity');
 await as(freshOwner);const records=[];for(let i=0;i<3;i++)records.push(await rpc('pro_save_real_case',[fresh,null,0,{...intake,display_name:i===2?'شاگرد ۲':'مراجع '+i,phone:i===0?'09111234567':'98922000000'+i},randomUUID()]));
 await assert.rejects(()=>rpc('pro_save_real_case',[fresh,null,0,intake,randomUUID()]),/PRO_CASE_LIMIT/);
 for(const query of ['0911','۰۹۱۱','٠٩١١','+98 (911)','0098911','1234567']){const result=await rpc('pro_browse_case_directory',[fresh,query,0,false]);assert.equal(result.total,1,query);assert.equal(result.rows[0].id,records[0].id);}
 assert.equal((await rpc('pro_browse_case_directory',[fresh,'شاگرد 2',0,false])).total,1);
 assert.equal((await rpc('pro_browse_case_directory',[fresh,'',0,false])).total,3);
 const content={version:1,title:'تمرین مصنوعی',notes:'',reviewed:true,startDate:'2026-11-09',sections:[{title:'روز اول',lines:[trainingLine('حرکت مصنوعی')]}]};
 const key=randomUUID(),saved=await rpc('pro_save_authored_plan',[fresh,records[0].id,1,'training',content,key]);assert.equal(await rpc('pro_save_authored_plan',[fresh,records[0].id,1,'training',content,key]),saved);
 for(const date of ['2026-02-30','1405-08-18','2026-13-01',null,[]])await assert.rejects(()=>rpc('pro_save_authored_plan',[fresh,records[0].id,1,'training',{...content,startDate:date},randomUUID()]),/PRO_INVALID_PLAN/);
 const old=structuredClone(content);delete old.startDate;await rpc('pro_save_authored_plan',[fresh,records[0].id,1,'training',old,randomUUID()]);
 await assert.rejects(()=>db.query('select * from pro_private.workspace_term_repairs'),/permission denied/);
 await as(legacyOwner);await assert.rejects(()=>rpc('pro_browse_case_directory',[fresh,'',0,false]),/PRO_ACCESS_DENIED/);
 for(const months of [1,3,6,12]){
  const owner=await user();await as(owner);const workspace=await rpc('pro_register',['اشتراک مصنوعی '+months,'training',true]);
  const {order}=await checkout(owner,months);const first=await license(workspace);
  assert.equal(first.case_limit,100000);
  assert.equal((await db.query("select abs(extract(epoch from l.expires_at)-extract(epoch from o.verified_at+make_interval(months=>$3::integer)))<2 ok from pro_workspace_licenses l cross join payment_orders o where l.organization_id=$1 and o.id=$2",[workspace,order.id,months])).rows[0].ok,true);
  await rpc('billing_settle',[order.id,'999999999',100]);assert.deepEqual(await license(workspace),first,'Callback replay cannot extend a package twice');
  if(months===12)await db.query("update pro_workspace_licenses set expires_at=now()-interval '1 day' where organization_id=$1",[workspace]);
  const renewal=await checkout(owner,months),renewed=await license(workspace);
  const expected=months===12?"o.verified_at+make_interval(months=>$3::integer)":"$4::timestamptz+make_interval(months=>$3::integer)";
  const args=months===12?[workspace,renewal.order.id,months]:[workspace,renewal.order.id,months,first.expires_at];
  assert.equal((await db.query(`select abs(extract(epoch from l.expires_at)-extract(epoch from ${expected}))<2 ok from pro_workspace_licenses l cross join payment_orders o where l.organization_id=$1 and o.id=$2`,args)).rows[0].ok,true);
  assert(new Date(renewed.expires_at)>new Date(first.created_at||0));
 }
 await as(null,'anon');await assert.rejects(()=>rpc('pro_workspace_status',[fresh]),/permission denied/);await assert.rejects(()=>rpc('pro_browse_case_directory',[fresh,'',0,false]),/permission denied/);
 await db.exec('reset role');await db.query('update billing_settings set mode=$1,checkout_enabled=$2 where id',[settings.mode,settings.checkout_enabled]);
 console.log('PASS Pro training UX SQL: exact legacy free repair/audit, manual and paid term preservation, one-month/3-case trial, no retry extension, 1/3/6/12 paid terms and renewals, expired read-only access, ISO training snapshots and validation, normalized phone search and tenant/role boundaries');
}
