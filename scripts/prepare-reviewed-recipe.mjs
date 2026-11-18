import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { reviewRecipe } from './review-nutrition-catalog.mjs';
import { buildNutritionCatalog } from '../src/utils/nutritionCatalog.ts';

const literal = value => "'" + JSON.stringify(value).replaceAll("'", "''") + "'::jsonb";
/** Emit an explicit transaction for human review; this command never publishes. */
export function prepareReviewedRecipe(candidate, approval, config) {
  const review = reviewRecipe(candidate, approval);
  if (review.status !== 'review_recorded') throw Error('A complete, unchanged recipe and matching specialist decision are required.');
  if (approval.date > new Date().toISOString().slice(0,10)) throw Error('A future approval cannot authorize release.');
  const id = candidate.id + '__' + candidate.version;
  const permitted = ['role','emoji','excluded_for_vegetarian','swap_allowed_meals','swap_group','portion_min_units','portion_typical_units',
    'portion_soft_max_units','portion_hard_max_units','portion_step','quality_tags','fruit_veg_grams_per_unit','slot','max_per_week'];
  if (!config || Object.keys(config).some(k => !permitted.includes(k)) || !Number.isInteger(config.max_per_week) || config.max_per_week < 1 || config.max_per_week > 7)
    throw Error('Explicit catalog configuration and a pilot repetition cap (1–7) are required.');
  const { slot, max_per_week, ...foodConfig } = config;
  if (!['lunch','dinner'].includes(slot)) throw Error('Reviewed mixed dishes currently support lunch or dinner.');
  const food = { ...foodConfig, id, name: candidate.name, unit_label: 'گرم', preparation_state: 'cooked', is_active: true,
    grams_per_unit: candidate.gramsPerUnit, kcal_per_unit: candidate.nutrition.kcal, protein_per_unit: candidate.nutrition.proteinGrams,
    carbs_per_unit: candidate.nutrition.carbGrams, fat_per_unit: candidate.nutrition.fatGrams, fiber_g_per_unit: candidate.nutrition.fiberGrams,
    allergy_flags: Object.entries(review.allergenAssessment).filter(([,v]) => v === 'contains' || v === 'may_contain').map(([k]) => k),
    allergen_assessment: review.allergenAssessment, allergen_assessment_source: candidate.source.url + ' · ' + approval.decisionRef,
    source_name: candidate.source.name, source_url: candidate.source.url, fiber_source_name: candidate.nutrition.source.name,
    fiber_source_url: candidate.nutrition.source.url, recipe_reference_version: candidate.version,
    recipe_batch_yield_grams: candidate.batch.cookedGrams, recipe_batch_servings: candidate.batch.servings };
  const template = { id: slot + '__' + id, slot, display_name: candidate.name, is_active: true, max_per_week };
  const item = { template_id: template.id, position: 0, role: food.role, primary_food_item_id: id, dynamic_units: true };
  buildNutritionCatalog({ foodRows: [food], templateRows: [template], slotRows: [item], substituteRows: [] });
  const insert = (table, row) => {
    const cols = Object.keys(row);
    return `insert into public.${table} (${cols.join(',')}) select ${cols.map(c => 'r.'+c).join(',')} from jsonb_populate_record(null::public.${table}, ${literal(row)}) r;`;
  };
  const evidence = { candidate, approval, fingerprint: review.fingerprint, micronutrients: review.micronutrients };
  return 'begin;\n' + insert('food_items', food) + '\n' + insert('meal_templates', template) + '\n' + insert('meal_template_slots', item) + '\n' +
    insert('nutrition_recipe_reviews', { food_id: id, fingerprint: review.fingerprint, evidence }) + '\ncommit;\n';
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values } = parseArgs({ options: { candidate: {type:'string'}, approval: {type:'string'}, config: {type:'string'} } });
    if (!values.candidate || !values.approval || !values.config) throw Error('Use --candidate recipe.json --approval approval.json --config catalog-config.json');
    const json = path => JSON.parse(readFileSync(path,'utf8'));
    process.stdout.write(prepareReviewedRecipe(json(values.candidate), json(values.approval), json(values.config)));
  } catch (error) { process.stderr.write(error.message+'\n'); process.exitCode=1; }
}
