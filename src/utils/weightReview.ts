import type { ProgressEntry } from './progressJournal.ts';
export const WEIGHT_REVIEW_VERSION = 'median-reference-v1';
const DAY = 86400000;
/** A descriptive sample range, never a clinical rate or confidence interval. */
export function smoothedWeightReview(entries: readonly ProgressEntry[], today: string) {
  const anchor = Date.parse(today + 'T12:00:00Z');
  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!validDate(today)) return null;
  const rows = entries.filter(e => validDate(e.entry_date) && e.entry_date <= today &&
    anchor - Date.parse(e.entry_date + 'T12:00:00Z') < 14 * DAY).sort((a,b) => a.entry_date.localeCompare(b.entry_date));
  if (new Set(rows.map(e => e.entry_date)).size !== rows.length || rows.some(e => e.weight_kg !== null &&
      (!Number.isFinite(e.weight_kg) || e.weight_kg < 25 || e.weight_kg > 350))) return null;
  const current = rows.filter(e => anchor - Date.parse(e.entry_date + 'T12:00:00Z') < 7 * DAY);
  const previous = rows.filter(e => anchor - Date.parse(e.entry_date + 'T12:00:00Z') >= 7 * DAY);
  const summary = (list: ProgressEntry[]) => {
    const values = list.flatMap(e => e.weight_kg === null ? [] : [e.weight_kg]).sort((a,b) => a-b);
    if (values.length < 3) return null;
    const mid = Math.floor(values.length / 2);
    return { median: Math.round((values.length % 2 ? values[mid] : (values[mid-1] + values[mid])/2)*10)/10,
      min: values[0], max: values[values.length-1], count: values.length };
  };
  const latest = summary(current), prior = summary(previous);
  const feedback = [...current].reverse().find(e => e.adherence && e.hunger);
  if (!latest || !prior || !feedback || !current.some(e => e.weight_kg !== null && anchor - Date.parse(e.entry_date + 'T12:00:00Z') <= 2 * DAY)) return null;
  const ready = feedback.adherence === 'mostly' && feedback.hunger === 'comfortable' && feedback.difficulty === 'none';
  return { version: WEIGHT_REVIEW_VERSION, latest, prior, ready, feedback,
    direction: latest.min > prior.max ? 'up' : latest.max < prior.min ? 'down' : 'overlap' };
}
