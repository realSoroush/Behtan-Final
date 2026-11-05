export interface ProgressEntry {
  entry_date:string;
  weight_kg:number|null;
  adherence:'mostly'|'partly'|'little'|null;
  hunger:'comfortable'|'sometimes'|'often'|null;
  difficulty:'none'|'time'|'cost'|'taste'|'portions'|'other'|null;
}
export function parseWeight(value:string):number|null {
  const normalized=value.trim().replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[٫,]/g,'.');
  if(!normalized)return null;
  if(!/^\d{1,3}(\.\d)?$/.test(normalized))throw Error('وزن را با حداکثر یک رقم اعشار وارد کن.');
  const n=Number(normalized);if(n<25||n>350)throw Error('وزن باید بین ۲۵ تا ۳۵۰ کیلوگرم باشد.');return n;
}
export function weightTrend(entries:ProgressEntry[]) {
  const points=entries.filter(e=>validDay(e.entry_date)&&validWeight(e.weight_kg)).sort((a,b)=>a.entry_date.localeCompare(b.entry_date));
  return {points,change:points.length>1?Math.round((points[points.length-1].weight_kg!-points[0].weight_kg!)*10)/10:null};
}
export function reviewDue(entries:ProgressEntry[],today:string):boolean {
  const last=entries.filter(e=>e.adherence!==null||e.hunger!==null||e.difficulty!==null).sort((a,b)=>b.entry_date.localeCompare(a.entry_date))[0];
  return !last || (Date.parse(today+'T12:00:00Z')-Date.parse(last.entry_date+'T12:00:00Z'))/86400000>=7;
}

const DAY_MS = 86_400_000;
export const WEEKLY_REVIEW_VERSION = 'descriptive-review-v2';
const validDay = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
const validWeight = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 25 && value <= 350;


/** Two consecutive seven-day windows, each with at least three distinct readings. */
export function weeklyGoalReview(entries: ProgressEntry[], today: string, goal: 'weight_loss'|'weight_gain'|'maintenance') {
  if (!validDay(today)) return null;
  const anchor = Date.parse(today + 'T12:00:00Z');
  const relevant = entries.filter(entry => validDay(entry.entry_date) && entry.entry_date <= today &&
    anchor - Date.parse(entry.entry_date + 'T12:00:00Z') < 14 * DAY_MS);
  const duplicates = relevant.some((entry, i) => relevant.findIndex(other => other.entry_date === entry.entry_date) !== i);
  const invalid = relevant.some(entry => entry.weight_kg !== null && !validWeight(entry.weight_kg));
  const days = [...new Map(relevant.map(entry => [entry.entry_date, entry])).values()];
  const recent = days.filter(entry => {
    const age = (anchor - Date.parse(entry.entry_date + 'T12:00:00Z')) / DAY_MS;
    return age >= 0 && age < 14;
  }).sort((a, b) => b.entry_date.localeCompare(a.entry_date));
  const current = recent.filter(e => (anchor - Date.parse(e.entry_date + 'T12:00:00Z')) / DAY_MS < 7);
  const currentWeights = weightTrend(current).points;
  const previousWeights = weightTrend(recent.slice(current.length)).points;
  const feedback = current.find(e => e.adherence !== null && e.hunger !== null);
  if (currentWeights.length < 3 || previousWeights.length < 3 || !feedback) return null;

  const average = (rows: ProgressEntry[]) => rows.reduce((sum, row) => sum + row.weight_kg!, 0) / rows.length;
  const currentAverage = average(currentWeights);
  const previousAverage = average(previousWeights);
  const delta = currentAverage - previousAverage;
  // A display band for trends, not a prescribed rate of weight change.
  const stable = Math.abs(delta) < 0.25;
  const onTrack = goal === 'maintenance' ? stable
    : !stable && (goal === 'weight_loss' ? delta < 0 : delta > 0);
  // No clinically reviewed rate/uncertainty policy exists yet. Direction alone
  // must never certify an acceptable rate, including small changes. Keep this
  // descriptive until E07/E14 policy review, rather than inventing a cutoff.
  const recommendation: 'review_measurements' | 'review_hunger' | 'review_routine' | 'continue' | 'review_trend' = duplicates || invalid ? 'review_measurements'
    : feedback.hunger === 'often' ? 'review_hunger'
    : feedback.adherence !== 'mostly' || feedback.hunger === 'sometimes' || (feedback.difficulty && feedback.difficulty !== 'none') ? 'review_routine'
      : onTrack ? (goal === 'maintenance' ? 'continue' : 'review_measurements') : 'review_trend';

  return { currentAverage, previousAverage, recommendation,
    evidence: [WEEKLY_REVIEW_VERSION, goal, feedback, currentWeights, previousWeights, { duplicates, invalid }] };
}
