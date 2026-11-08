import assert from'node:assert/strict';
import{readFile}from'node:fs/promises';
import{randomUUID}from'node:crypto';
import{CORRECTIVE_SEED}from'../src/professional/training/corrective/seed.ts';
import{emptyRealIntake,generatePrintedPlan}from'../src/professional/menuPlan.ts';
import{fromPrintedPlan,trainingLine}from'../src/professional/studioModel.ts';
import{DEFAULT_PROTEIN_ENGINE_POLICY as policy}from'../src/utils/proteinPolicy.ts';
export async function testProUxDatabase(db){
 await db.exec('reset role');
 for(const file of ['20261108113719_053_pro_studio_menu_counts.sql','20261108113727_054_pro_corrective_bank_metrics.sql'])await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 const admin=randomUUID(),owner=randomUUID(),other=randomUUID();
 for(const [i,id]of[admin,owner,other].entries())await db.query("insert into auth.users(id,phone,phone_confirmed_at)values($1,$2,now())",[id,'98910012345'+i]);
 await db.query('insert into admin_members(user_id)values($1)',[admin]);
 const as=async(id,role='authenticated')=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);};
 const rpc=async(name,args=[])=>(await db.query(`select public.${name}(${args.map((_,i)=>'$'+(i+1)).join(',')}) result`,args)).rows[0].result;
 await as(owner);await rpc('pro_save_specialist_profile',['متخصص مصنوعی','09111234567','physiotherapist','تهران','تهران','آدرس کاملاً مصنوعی']);const org=await rpc('pro_register',['محیط مصنوعی','clinic',true]);
 const intake={...emptyRealIntake(),display_name:'Synthetic',birth_date:'1992-04-23',weight_kg:85,height_cm:180,gender:'male',pregnancy_status:'not_applicable',activity_level:'moderate',safety_confirmed:true};
 const rec=await rpc('pro_save_real_case',[org,null,0,intake,randomUUID()]);
 const plan=generatePrintedPlan(intake,1,5,policy,'2026-10-21');
 await db.exec('reset role');assert.equal((await db.query('select pro_private.valid_printed_plan($1) ok',[plan])).rows[0].ok,true);
 const short=structuredClone(plan);short.days[0].slots[0].options.pop();assert.equal((await db.query('select pro_private.valid_printed_plan($1) ok',[short])).rows[0].ok,false);
 const legacy=structuredClone(short);delete legacy.menu_contract;legacy.requested_menus=4;for(const day of legacy.days)for(const slot of day.slots)slot.options=slot.options.slice(0,2);assert.equal((await db.query('select pro_private.valid_printed_plan($1) ok',[legacy])).rows[0].ok,true,'Historic partial plans stay readable/valid');
 await as(owner);const content=fromPrintedPlan(plan);content.reviewed=true;const key=randomUUID();
 const id=await rpc('pro_save_authored_plan',[org,rec.id,1,'nutrition',content,key]);assert.equal(await rpc('pro_save_authored_plan',[org,rec.id,1,'nutrition',content,key]),id);
 const stored=(await db.query('select content from pro_authored_plans where id=$1',[id])).rows[0].content;assert.deepEqual(stored,content);assert.equal(stored.sections[0].alternatives.length,4);
 for(const mutate of [c=>c.sections[0].alternatives.push(c.sections[0].alternatives[0]),c=>c.sections[0].alternatives[0].lines[0].food.grams=-1,c=>c.sections[0].alternatives[0].lines=[]]){const bad=structuredClone(content);mutate(bad);await assert.rejects(()=>rpc('pro_save_authored_plan',[org,rec.id,1,'nutrition',bad,randomUUID()]),/PRO_INVALID_PLAN/);}
 const bank=await rpc('pro_corrective_bank',[org]);assert.equal(bank.length,117);assert(bank.every(e=>e.status==='draft'));
 await assert.rejects(()=>rpc('admin_corrective_bank'),/ADMIN_REQUIRED/);await assert.rejects(()=>rpc('admin_pro_metrics',[null,null]),/ADMIN_REQUIRED/);await assert.rejects(()=>db.query('select * from pro_corrective_exercises'),/permission denied/);
 const custom={...structuredClone(CORRECTIVE_SEED[0]),id:'custom-'+randomUUID(),nameFa:'حرکت اختصاصی مصنوعی'};
 const own=await rpc('pro_save_corrective_exercise',[org,custom,0]);assert.equal(own.revision,1);assert.equal((await rpc('pro_save_corrective_exercise',[org,custom,0])).revision,1);
 await assert.rejects(()=>rpc('pro_save_corrective_exercise',[null,custom,0]),/ADMIN_REQUIRED/);
 await assert.rejects(()=>rpc('pro_save_corrective_exercise',[org,{...custom,status:'published'},1]),/PRO_INVALID_EXERCISE|PRO_REVIEW_REQUIRED/);
 await as(other);await assert.rejects(()=>rpc('pro_corrective_bank',[org]),/PRO_ACCESS_DENIED/);
 await rpc('pro_save_specialist_profile',['متخصص دیگر','09111234568','nutritionist','تهران','تهران','آدرس دیگر مصنوعی']);const org2=await rpc('pro_register',['محیط دوم','nutrition',true]);assert(!(await rpc('pro_corrective_bank',[org2])).some(row=>row.id===custom.id));await assert.rejects(()=>rpc('pro_save_corrective_exercise',[org2,{...custom,nameFa:'دسترسی جعلی'},1]),/PRO_ACCESS_DENIED/);
 await as(admin);const proposed=structuredClone(CORRECTIVE_SEED[0]);assert.equal((await rpc('admin_corrective_bank')).length,117);await assert.rejects(()=>rpc('pro_save_corrective_exercise',[null,{...proposed,status:'published'},1]),/PRO_INVALID_EXERCISE/);
 const reviewed={...proposed,nameFa:'عنوان بازبینی‌شده',status:'published',equipment:['bodyweight'],muscles:['synthetic target'],goals:['synthetic goal'],movementTypes:['synthetic control'],difficulty:'مبتدی',position:'ایستاده',start:'شروع مصنوعی برای تست',steps:['مرحله مصنوعی'],precautions:['احتیاط مصنوعی'],sourceUrls:['https://example.org/synthetic-only'],reviewer:'بازبین مصنوعی',reviewerQualification:'صلاحیت مصنوعی تست',reviewedAt:new Date().toISOString().slice(0,10)};
 const published=await rpc('pro_save_corrective_exercise',[null,reviewed,1]);assert.equal(published.revision,2);await assert.rejects(()=>rpc('pro_save_corrective_exercise',[null,{...reviewed,nameFa:'نسخه قدیمی'},1]),/PRO_STALE_REVISION/);
 const totals=await rpc('admin_pro_metrics',[null,null]);assert.equal(totals.nutrition_total,totals.nutrition_authored+totals.nutrition_automatic);assert.equal(totals.training_total,totals.training_authored+totals.training_automatic);assert.equal(totals.specialists_by_profession.reduce((n,r)=>n+r.count,0),totals.specialists);assert(!JSON.stringify(totals).includes(owner));await assert.rejects(()=>rpc('admin_pro_metrics',['2026-11-02','2026-11-01']),/INVALID_DATE_RANGE/);
 const empty=await rpc('admin_pro_metrics',['2000-01-01','2000-01-01']);for(const key of ['clients','nutrition_total','training_total','body_reports','specialists'])assert.equal(empty[key],0);

 // Exact Tehran date boundaries, not UTC date truncation. Seed only synthetic
 // documents in the disposable DB, without rewriting any stored history.
 await db.exec('reset role');
 for(const stamp of ['2001-01-14T20:30:00Z','2001-01-15T20:29:59.999Z','2001-01-15T20:30:00Z'])await db.query(
  "insert into pro_authored_plans(id,organization_id,record_id,intake_revision,display_name,kind,content,recorded_by,recorded_at)values($1,$2,$3,1,'Synthetic','nutrition',$4,$5,$6)",[randomUUID(),org,rec.id,content,owner,stamp]);
 await as(admin);const boundary=await rpc('admin_pro_metrics',['2001-01-15','2001-01-15']);assert.equal(boundary.nutrition_authored,2,'Start inclusive and next Tehran midnight exclusive');
 await as(owner);const line=trainingLine('حرکت زمان‌دار');line.exercise=structuredClone(CORRECTIVE_SEED[0]);line.training={group:'timed',kind:1,sets:2,reps:0,rest:30,seconds:20};const training={version:1,reviewed:true,title:'تمرین مصنوعی',notes:'',sections:[{title:'جلسه',lines:[line]}]};
 const tid=await rpc('pro_save_authored_plan',[org,rec.id,1,'training',training,randomUUID()]);const historic=(await db.query('select content from pro_authored_plans where id=$1',[tid])).rows[0].content;assert.equal(historic.sections[0].lines[0].exercise.nameFa,CORRECTIVE_SEED[0].nameFa,'Bank rename cannot rewrite saved prescription');
 training.sections[0].lines[0].training.seconds=null;await assert.rejects(()=>rpc('pro_save_authored_plan',[org,rec.id,1,'training',training,randomUUID()]),/PRO_INVALID_PLAN/);
 await as(null,'anon');await assert.rejects(()=>rpc('admin_pro_metrics',[null,null]),/permission denied/);await assert.rejects(()=>rpc('pro_corrective_bank',[org]),/permission denied/);await db.exec('reset role');
 console.log('PASS Pro UX SQL: exact menus and legacy contracts, alternatives immutable/replay/validation, 117 drafts, review publication gates/CAS, tenant-scoped private exercises, frozen exercise references, timed dose validation, admin-only additive metrics and date boundaries');
}
