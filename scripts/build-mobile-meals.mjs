import {readFileSync,writeFileSync} from 'node:fs';
const path=new URL('./fixtures/nutrition-catalog.fixture.json',import.meta.url);
const x=JSON.parse(readFileSync(path));const q=s=>`'${s.replaceAll("'","''")}'`;
const before=x.FOOD_ITEMS.find(f=>f.id==='medjool_date')??x.FOOD_ITEMS.find(f=>f.id==='dates_small');
const small={...before,id:'dates_small',name:'خرمای معمولی کوچک',gramsPerUnit:8.3,kcalPerUnit:23.41,proteinPerUnit:.2,carbsPerUnit:6.23,fatPerUnit:.03,fiberPerUnit:.66,fruitVegGramsPerUnit:8.3,swapGroup:'dried_fruit'};
x.FOOD_ITEMS=x.FOOD_ITEMS.filter(f=>!['medjool_date','dates_small'].includes(f.id));x.FOOD_ITEMS.push(small);
delete x.PORTION_RULES.medjool_date;x.PORTION_RULES.dates_small={minUnits:1,typicalUnits:2,softMaxUnits:3,hardMaxUnits:4,step:1};
for(const f of x.FOOD_ITEMS)if(['apple','banana'].includes(f.id))f.swapGroup='fresh_fruit';
for(const t of x.MEAL_TEMPLATES)for(const s of t.slots)if(s.primaryFoodItemId==='medjool_date')s.primaryFoodItemId='dates_small';
for(const g of x.FOOD_SUBSTITUTES){if(g.foodItemId==='medjool_date')g.foodItemId='dates_small';g.substituteIds=g.substituteIds.map(id=>id==='medjool_date'?'dates_small':id);}
// Explicit menu edits. Keep a dairy-free mixed-egg alternative for dietary restrictions.
const mixed=x.MEAL_TEMPLATES.find(t=>t.id==='bk_mixed_eggs_sangak');
const dairyFree={...structuredClone(mixed),id:'bk_mixed_eggs_dairy_free',restrictedDietOnly:true,displayName:'تخم‌مرغ و سفیده با نان سنگک'};
dairyFree.slots=dairyFree.slots.filter(s=>s.primaryFoodItemId!=='low_fat_cheese');
mixed.displayName='تخم‌مرغ، پنیر و نان سنگک';
if(!mixed.slots.some(s=>s.primaryFoodItemId==='low_fat_cheese'))mixed.slots.splice(2,0,{role:'dairy',primaryFoodItemId:'low_fat_cheese',dynamicUnits:true});
const remove=['as_potato_chicken','as_whey_nuts','as_potato_lentil','as_pea_potato','as_potato_dates','as_banana_dates','as_banana_dates_avocado','as_toast_dates','balanced_afternoon_snack_banana_whole_toast'];
x.MEAL_TEMPLATES=x.MEAL_TEMPLATES.filter(t=>!remove.includes(t.id));
const make=(id,slot,name,foods,fixed)=>({id,slot,displayName:name,slots:foods.map((id,i)=>({role:x.FOOD_ITEMS.find(f=>f.id===id).role,primaryFoodItemId:id,dynamicUnits:!fixed,...(fixed?{fixedUnits:fixed[i]}:{})})),isWorkoutDayOnly:slot==='post_workout',isRestDayOnly:false,goalTags:[]});
const additions=[dairyFree,
{...make('as_restricted_fruit_avocado','afternoon_snack','کاسهٔ میوه و آووکادو',['apple','banana','avocado_half']),restrictedDietOnly:true},
make('as_fruit_salad','afternoon_snack','سالاد میوهٔ سیب و موز',['apple','banana']),
make('as_apple_oats','afternoon_snack','جو دوسر پخته با آب و سیب',['oats_dry','apple']),
make('as_cheese_walnut_sangak','afternoon_snack','نان، پنیر و گردو با خیار و گوجه',['sangak_bread','low_fat_cheese','walnut','fresh_cucumber_tomato']),
make('as_yogurt_banana_walnut','afternoon_snack','ماست، موز و گردو',['low_fat_yogurt','banana','walnut']),
make('as_milk_small_dates','afternoon_snack','شیر کم‌چرب و خرمای کوچک',['low_fat_milk','dates_small']),
make('pw_whey_water','post_workout','یک اسکوپ وی با یک لیوان آب',['whey_protein'],[1]),
make('pw_chicken_potato','post_workout','مرغ پخته و سیب‌زمینی آب‌پز',['chicken_breast','boiled_potato'],[.75,1]),
make('pw_plant_bowl','post_workout','عدسی و سویا',['lentils_cooked','soy_chunks'],[1.5,.25]),
make('pw_pea_water','post_workout','یک اسکوپ پروتئین نخود با آب',['pea_protein'],[1])];
for(const t of additions){x.MEAL_TEMPLATES=x.MEAL_TEMPLATES.filter(a=>a.id!==t.id);x.MEAL_TEMPLATES.push(t);}
let sql=`begin;
alter table public.meal_templates drop constraint if exists meal_templates_slot_check;
alter table public.meal_templates add constraint meal_templates_slot_check check(slot in ('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack','post_workout'));
alter table public.daily_meal_checkins drop constraint if exists daily_meal_checkins_meal_slot_check;
alter table public.daily_meal_checkins add constraint daily_meal_checkins_meal_slot_check check(meal_slot in ('breakfast','morning_snack','lunch','afternoon_snack','dinner','night_snack','post_workout'));
-- Small-date proxy: USDA Deglet Noor, 8.3 g edible portion; not a laboratory value for all Iranian cultivars.
insert into public.food_items(id,name,role,emoji,unit_label,grams_per_unit,kcal_per_unit,protein_per_unit,carbs_per_unit,fat_per_unit,fiber_g_per_unit,quality_tags,fruit_veg_grams_per_unit,allergy_flags,excluded_for_vegetarian,portion_min_units,portion_typical_units,portion_soft_max_units,portion_hard_max_units,portion_step,swap_allowed_meals,swap_group,swap_priority,source_name,source_url)
values('dates_small','خرمای معمولی کوچک','fruit','🌴','عدد',8.3,23.41,.2,6.23,.03,.66,array['whole_fruit','whole_food'],8.3,'{}','{}',1,2,3,4,1,array['breakfast','morning_snack','afternoon_snack','night_snack'],'dried_fruit',30,'USDA Deglet Noor proxy (8.3g); Iranian variety may differ','https://www.uhhospitals.org/health-information/health-and-wellness-library/article/nutritionfacts-v1/dates-deglet-noor-1-date') on conflict(id) do nothing;
update public.meal_template_slots set primary_food_item_id='dates_small' where primary_food_item_id='medjool_date';
insert into public.food_substitutes(food_item_id,substitute_food_item_id)
select case when food_item_id='medjool_date' then 'dates_small' else food_item_id end,case when substitute_food_item_id='medjool_date' then 'dates_small' else substitute_food_item_id end from public.food_substitutes where food_item_id='medjool_date' or substitute_food_item_id='medjool_date' on conflict do nothing;
update public.food_substitutes set is_active=false where food_item_id='medjool_date' or substitute_food_item_id='medjool_date';
update public.food_items set is_active=false where id='medjool_date';
update public.food_items set swap_group='fresh_fruit' where id in ('apple','banana');
update public.meal_templates set is_active=false where id in (${remove.map(q).join(',')});
`;
for(const t of [mixed,...additions]){
 sql+=`insert into public.meal_templates(id,slot,display_name,is_workout_day_only,is_rest_day_only,restricted_diet_only,goal_tags,is_active,sort_order) values(${q(t.id)},${q(t.slot)},${q(t.displayName)},${t.isWorkoutDayOnly},false,${!!t.restrictedDietOnly},'{}',true,210) on conflict(id) do update set display_name=excluded.display_name,is_active=true;\n`;
 sql+=`delete from public.meal_template_slots where template_id=${q(t.id)};\n`;
 t.slots.forEach((s,i)=>{sql+=`insert into public.meal_template_slots(template_id,position,role,primary_food_item_id,dynamic_units,fixed_units) values(${q(t.id)},${i},${q(s.role)},${q(s.primaryFoodItemId)},${s.dynamicUnits},${s.fixedUnits??'null'});\n`;});
}
sql+='commit;\n';
writeFileSync(new URL('../supabase/migrations/20260923_020_mobile_meal_catalog.sql',import.meta.url),sql);
writeFileSync(path,JSON.stringify(x,null,2)+'\n');
