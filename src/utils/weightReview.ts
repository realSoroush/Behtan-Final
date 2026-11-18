import type { ProgressEntry } from './progressJournal.ts';
export const WEIGHT_REVIEW_VERSION = 'latest-confirmed-reference-v2';
/** Use the latest recorded measurement; frequency and optional feedback never gate a preview. */
export function latestWeightReview(entries: readonly ProgressEntry[], today: string) {
  const validDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0,10) === s;
  if (!validDate(today)) return null;
  const rows = entries.filter(e => validDate(e.entry_date) && e.entry_date <= today && e.weight_kg !== null)
    .sort((a,b) => b.entry_date.localeCompare(a.entry_date));
  if (!rows.length || new Set(rows.map(e => e.entry_date)).size !== rows.length) return null;
  const latest = rows[0];
  if (!Number.isFinite(latest.weight_kg) || latest.weight_kg! < 25 || latest.weight_kg! > 350) return null;
  return { version: WEIGHT_REVIEW_VERSION, entryDate: latest.entry_date, weight: latest.weight_kg! };
}
