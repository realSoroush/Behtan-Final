import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {supabasePlanDependencies} from '../server/proPlanSupabase.ts';
import {processPlanRequest} from '../server/proPlanService.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/nutrition-catalog.fixture.json',import.meta.url),'utf8'));
const f = fixture;
const foods = f.FOOD_ITEMS.map((x) => {
  const r = f.PORTION_RULES[x.id];
  return {
    id: x.id,
    name: x.name,
    role: x.role,
    emoji: x.emoji,
    is_active: true,
    unit_label: x.unitLabel,
    grams_per_unit: x.gramsPerUnit,
    kcal_per_unit: x.kcalPerUnit,
    protein_per_unit: x.proteinPerUnit,
    carbs_per_unit: x.carbsPerUnit,
    fat_per_unit: x.fatPerUnit,
    fiber_g_per_unit: x.fiberPerUnit,
    quality_tags: x.qualityTags,
    fruit_veg_grams_per_unit: x.fruitVegGramsPerUnit,
    allergy_flags: x.allergyFlags,
    excluded_for_vegetarian: x.excludedForVegetarian,
    swap_allowed_meals: x.swapAllowedMeals,
    swap_group: x.swapGroup,
    swap_priority: x.swapPriority,
    portion_min_units: r.minUnits,
    portion_typical_units: r.typicalUnits,
    portion_soft_max_units: r.softMaxUnits,
    portion_hard_max_units: r.hardMaxUnits,
    portion_step: r.step,
  };
});
const templates = f.MEAL_TEMPLATES.map((t) => ({
  id: t.id,
  slot: t.slot,
  display_name: t.displayName,
  is_workout_day_only: t.isWorkoutDayOnly,
  is_rest_day_only: t.isRestDayOnly,
  max_per_week: t.maxPerWeek,
  restricted_diet_only: t.restrictedDietOnly,
  vegetarian_statuses_only: t.vegetarianStatusesOnly,
  goal_tags: t.goalTags,
  is_active: true,
}));
const slots = f.MEAL_TEMPLATES.flatMap((t) =>
  t.slots.map((s, i) => ({
    template_id: t.id,
    position: i,
    role: s.role,
    primary_food_item_id: s.primaryFoodItemId,
    dynamic_units: s.dynamicUnits,
    fixed_units: s.fixedUnits ?? null,
  })),
);
const policy = {
  id: "default",
  maintenance_no_rt_min: 1.2,
  maintenance_rt_min: 1.4,
  weight_loss_no_rt_min: 1.3,
  weight_loss_rt_min: 1.6,
  weight_gain_no_rt_min: 1.4,
  weight_gain_rt_min: 1.6,
  maintenance_no_rt: 1.4,
  maintenance_rt: 1.6,
  weight_loss_no_rt: 1.6,
  weight_loss_rt: 2,
  weight_gain_no_rt: 1.6,
  weight_gain_rt: 1.7,
  budget_economic_position: 0,
  budget_balanced_position: 0.5,
  budget_performance_position: 1,
  obesity_bmi_threshold: 30,
  reference_bmi: 25,
  excess_weight_fraction: 0.4,
  max_protein_g_per_day: 220,
  max_protein_calorie_fraction: 0.35,
  fat_calorie_fraction: 0.25,
};

const actor=randomUUID(),org=randomUUID(),record=randomUUID();
const answers={display_name:'Adapter fixture',phone:'',gender:'female',birth_date:'1992-04-23',height_cm:165,weight_kg:75,goal:'weight_loss',activity_level:'sedentary',workout_days:0,training_type:'none',protein_budget:'economic',vegetarian_status:'none',allergies:[],medical_conditions:[],pregnancy_status:'not_pregnant',eating_disorder_status:'none',medications_present:false,injuries_present:false,safety_confirmed:true,screening_version:1};
const originalFetch=globalThis.fetch,environment={...process.env};let permitted=true,credential=true,missingPolicy=false,writable=true,nutrition=true,referenceReads=0,stageCalls=0;
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
try{
 Object.assign(process.env,{VITE_SUPABASE_URL:'https://adapter-test.supabase.co',VITE_SUPABASE_ANON_KEY:'public-fixture',SUPABASE_SERVICE_ROLE_KEY:'server-fixture',PRO_SERVER_PLANS_ENABLED:'true'});
 globalThis.fetch=async(input,init)=>{
 const url=new URL(String(input)),name=url.pathname.split('/').at(-1),headers=new Headers(init.headers);
 if(name==='user')return json({id:actor,phone:'989000000000',phone_confirmed_at:'2026-01-01',app_metadata:{},user_metadata:{},aud:'authenticated',created_at:'2026-01-01'});
 if(name==='pro_real_cases'){assert.equal(headers.get('Authorization'),'Bearer fixture-user');return permitted?json({answers,revision:1,archived_at:null}):json({code:'PGRST116',message:'not found'},406);}
 if(name==='pro_workspace_status')return json({can_write:writable,modules:{nutrition}});
 if(name==='pro_stage_server_plan'){stageCalls++;return json({draft_id:randomUUID(),plan:JSON.parse(init.body).p_plan});}
 referenceReads++;assert.equal(headers.get('apikey'),'server-fixture','Pro reference reads must not use B2C user credentials');
 if(!credential)return json({code:'42501',message:'permission denied'},403);
 if(name==='nutrition_protein_policy')return missingPolicy?json({code:'PGRST116',message:'0 rows'},406):json(policy);
 const data={food_items:foods,food_substitutes:f.FOOD_SUBSTITUTES.flatMap(g=>g.substituteIds.map(id=>({food_item_id:g.foodItemId,substitute_food_item_id:id,is_active:true}))),meal_templates:templates,meal_template_slots:slots}[name];
 assert(data,'unexpected endpoint '+name);return json(data);
 };
 const body={action:'generate',org,record,revision:1,key:randomUUID(),date:'2026-10-26',count:1,notes:''};
 const result=await processPlanRequest(body,'fixture-user',supabasePlanDependencies());assert(result.plan.days.length);assert.equal(stageCalls,1);
 const catalog=await processPlanRequest({action:'catalog',org,record,revision:1,key:randomUUID()},'fixture-user',supabasePlanDependencies());assert.equal(catalog.foods.length,foods.length);
 permitted=false;const before=referenceReads;await assert.rejects(()=>processPlanRequest(body,'fixture-user',supabasePlanDependencies()),e=>e.code==='PRO_ACCESS_DENIED');assert.equal(referenceReads,before,'denied case never reads reference data');permitted=true;
 writable=false;let reads=referenceReads;await assert.rejects(()=>processPlanRequest(body,'fixture-user',supabasePlanDependencies()),e=>e.code==='PRO_SUBSCRIPTION_EXPIRED');assert.equal(referenceReads,reads);writable=true;
 nutrition=false;await assert.rejects(()=>processPlanRequest(body,'fixture-user',supabasePlanDependencies()),e=>e.code==='PRO_MODULE_DISABLED');assert.equal(referenceReads,reads);nutrition=true;
 missingPolicy=true;await assert.rejects(()=>processPlanRequest(body,'fixture-user',supabasePlanDependencies()),e=>e.code==='PRO_CATALOG_UNAVAILABLE');missingPolicy=false;
 credential=false;await assert.rejects(()=>processPlanRequest(body,'fixture-user',supabasePlanDependencies()),e=>e.code==='PRO_SERVER_CREDENTIAL_INVALID');
 console.log('PASS real Supabase SDK adapter: Pro-only generation and catalog, user JWT case isolation, no reference reads after denial, missing policy and invalid server key classified correctly');
}finally{globalThis.fetch=originalFetch;for(const key of Object.keys(process.env))if(!(key in environment))delete process.env[key];Object.assign(process.env,environment);}
