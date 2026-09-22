// Reproducible data transformation: existing food IDs/nutrients only.
import {readFileSync,writeFileSync} from 'node:fs';
const spec=JSON.parse(readFileSync(new URL('./snack-template-spec.json',import.meta.url)));
const fixtureURL=new URL('./fixtures/nutrition-catalog.fixture.json',import.meta.url);
const fixture=JSON.parse(readFileSync(fixtureURL));
const q=s=>`'${s.replaceAll("'","''")}'`;
let sql='-- New snack structures using existing catalog nutrients. No food values changed.\nbegin;\n';
for(const slot of ['morning_snack','afternoon_snack'])for(const s of spec){
 const id=`balanced_${slot}_${s.key}`;
 const slots=s.foods.map(id=>{const food=fixture.FOOD_ITEMS.find(f=>f.id===id);if(!food)throw Error(id);return {role:food.role,primaryFoodItemId:id,dynamicUnits:true};});
 const template={id,slot,displayName:s.name,slots,isWorkoutDayOnly:false,isRestDayOnly:false,goalTags:[]};
 fixture.MEAL_TEMPLATES=fixture.MEAL_TEMPLATES.filter(t=>t.id!==id);fixture.MEAL_TEMPLATES.push(template);
 sql+=`insert into public.meal_templates(id,slot,display_name,is_workout_day_only,is_rest_day_only,goal_tags,is_active,sort_order) values(${q(id)},${q(slot)},${q(s.name)},false,false,'{}',true,200) on conflict(id) do nothing;\n`;
 slots.forEach((f,i)=>sql+=`insert into public.meal_template_slots(template_id,position,role,primary_food_item_id,dynamic_units,fixed_units) values(${q(id)},${i},${q(f.role)},${q(f.primaryFoodItemId)},true,null) on conflict(template_id,position) do nothing;\n`);
}
sql+='commit;\n';
writeFileSync(new URL('../supabase/migrations/20260921_017_balanced_snacks.sql',import.meta.url),sql);
const seedURL=new URL('../supabase/seed_nutrition_catalog.sql',import.meta.url);
const marker='-- Balanced snack extension (generated from scripts/snack-template-spec.json)';
const seed=readFileSync(seedURL,'utf8').split(marker)[0].trimEnd();
writeFileSync(seedURL,seed+'\n\n'+marker+'\n'+sql);
writeFileSync(fixtureURL,JSON.stringify(fixture,null,2)+'\n');
