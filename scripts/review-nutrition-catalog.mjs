import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { ALLERGENS, ASSESSMENT_STATUSES } from '../src/utils/allergens.ts';

const MICRONUTRIENTS = { calcium: 'mg', iron: 'mg', sodium: 'mg', potassium: 'mg', vitamin_d: 'µg' };
const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const positive = value => Number.isFinite(value) && value > 0;
const nonnegative = value => Number.isFinite(value) && value >= 0;
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

function hasSource(source) {
  if (!isObject(source) || !nonempty(source.name) || !nonempty(source.locator) || !nonempty(source.url)) return false;
  try {
    const url = new URL(source.url);
    return url.protocol === 'https:' && Boolean(url.hostname) && !url.username && !url.password;
  } catch {
    return false;
  }
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (!isObject(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
}

export function catalogEvidenceGaps(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.some(row =>
    !isObject(row) || !nonempty(row.id) || typeof row.is_active !== 'boolean'
  ) || new Set(rows.map(row => row.id)).size !== rows.length) {
    throw new Error('Expected a nonempty food_items export with unique IDs and Boolean is_active fields.');
  }
  return rows.filter(row => row.is_active).map(row => ({
    id: row.id,
    allergensWithoutRecordedAssessment: ALLERGENS.filter(allergen => {
      const status = row.allergen_assessment?.[allergen];
      return !(Array.isArray(row.allergy_flags) && row.allergy_flags.includes(allergen)) && (!ASSESSMENT_STATUSES.includes(status) ||
        status === 'unknown' || (status === 'assessed_absent' && !nonempty(row.allergen_assessment_source)));
    }),
    recipeReference: row.recipe_reference_version ?? null,
    recipeBatchYieldRecorded: positive(Number(row.recipe_batch_yield_grams)) && positive(Number(row.recipe_batch_servings)),
  }));
}

function allergenStatus(entry) {
  if (entry.ingredients === 'contains') return 'contains';
  if (entry.crossContact === 'possible') return 'may_contain';
  if (entry.ingredients === 'absent' && entry.crossContact === 'controlled') return 'assessed_absent';
  return 'unknown';
}

export function reviewRecipe(candidate, approval = null) {
  if (!isObject(candidate)) throw new Error('Expected a recipe candidate object.');
  const blockers = [];
  const require = (condition, issue) => { if (!condition) blockers.push(issue); };
  const fingerprint = createHash('sha256').update(JSON.stringify(stable(candidate))).digest('hex');

  require(candidate.schemaVersion === 1, 'schemaVersion');
  require(typeof candidate.id === 'string' && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(candidate.id), 'id');
  require(typeof candidate.version === 'string' && /^[a-z0-9][a-z0-9.-]{0,63}$/.test(candidate.version), 'version');
  require(nonempty(candidate.name), 'name');
  require(hasSource(candidate.source), 'source');
  require(positive(candidate.gramsPerUnit) && candidate.preparationState === 'cooked', 'cooked serving basis');
  require(Array.isArray(candidate.ingredients) && candidate.ingredients.length > 0 &&
    candidate.ingredients.every(ingredient => isObject(ingredient) && nonempty(ingredient.name) &&
      positive(ingredient.grams) && ['raw', 'dry', 'cooked', 'ready'].includes(ingredient.preparationState)),
  'ingredient weights and states');
  const batch = candidate.batch;
  require(Number.isSafeInteger(batch?.cookedGrams) && positive(batch.cookedGrams) && positive(candidate.gramsPerUnit) && batch.cookedGrams >= candidate.gramsPerUnit &&
    Number.isSafeInteger(batch?.servings) && batch.servings > 0 &&
    ['measured', 'published'].includes(batch.method) && hasSource(batch.source), 'cooked batch yield evidence');
  require(['kcal', 'proteinGrams', 'carbGrams', 'fatGrams', 'fiberGrams'].every(key => nonnegative(candidate.nutrition?.[key])) &&
    hasSource(candidate.nutrition?.source), 'sourced calories and macros per cooked unit');

  const assessment = Object.fromEntries(ALLERGENS.map(allergen => {
    const entry = candidate.allergens?.[allergen];
    const ingredientEvidence = ['contains', 'absent', 'unknown'].includes(entry?.ingredients);
    const crossContactEvidence = ['possible', 'controlled', 'unknown'].includes(entry?.crossContact);
    const status = ingredientEvidence && crossContactEvidence ? allergenStatus(entry) : 'unknown';
    const sources = hasSource(entry?.ingredientSource) && hasSource(entry?.crossContactSource);
    require(status !== 'unknown' && entry.ingredients !== 'unknown' && entry.crossContact !== 'unknown' && sources,
      `allergen evidence: ${allergen}`);
    return [allergen, sources ? status : 'unknown'];
  }));
  const micronutrients = Object.fromEntries(Object.entries(MICRONUTRIENTS).map(([name, unit]) => {
    const entry = candidate.micronutrients?.[name];
    if (entry === null) return [name, { amount: null, unit }];
    const sourced = nonnegative(entry?.amount) && entry.unit === unit && hasSource(entry.source);
    require(sourced, `micronutrient evidence or explicit null: ${name}`);
    return [name, { amount: sourced ? entry.amount : null, unit }];
  }));

  const status = blockers.length ? 'incomplete' : approval === null ? 'awaiting_review' :
    approval?.fingerprint === fingerprint && nonempty(approval.reviewer) && nonempty(approval.decisionRef) &&
    approval.decision === 'approved_for_pilot' && date(approval.date) ? 'review_recorded' : 'approval_mismatch';
  return { id: candidate.id, version: candidate.version, status, fingerprint, blockers, allergenAssessment: assessment, micronutrients };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { values: { catalog, candidate, approval } } = parseArgs({ options: {
      catalog: { type: 'string' }, candidate: { type: 'string' }, approval: { type: 'string' },
    } });
    if (Boolean(catalog) === Boolean(candidate) || (approval && !candidate)) {
      throw new Error('Use --catalog FILE or --candidate FILE [--approval FILE].');
    }
    const read = file => JSON.parse(readFileSync(file, 'utf8'));
    const report = catalog ? catalogEvidenceGaps(read(catalog)) : reviewRecipe(read(candidate), approval ? read(approval) : null);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    if (report.status === 'incomplete' || report.status === 'approval_mismatch' || (approval && report.status !== 'review_recorded')) {
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
