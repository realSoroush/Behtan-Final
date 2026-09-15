/** Date-only conversion: UTC prevents browser timezone from moving the birthday. */
export interface JalaliDate { year: number; month: number; day: number }
const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian-nu-latn', {
  year: 'numeric', month: 'numeric', day: 'numeric', timeZone: 'UTC',
});
const DAY = 86400000;
function parts(date: Date): JalaliDate {
  const values = formatter.formatToParts(date);
  const get = (key: string) => Number(values.find(p => p.type === key)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}
export function isoToJalali(iso: string): JalaliDate | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(`${iso}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== iso) return null;
  return parts(date);
}
const starts = new Map<number, number>();
function yearStart(year: number): number {
  if (!Number.isInteger(year) || year < 1200 || year > 1601) throw new RangeError('Unsupported Persian year');
  const cached = starts.get(year);
  if (cached !== undefined) return cached;
  // Locate Nowruz using the runtime Persian calendar, rather than a leap-year shortcut.
  for (let day = 18; day <= 24; day++) {
    const time = Date.UTC(year + 621, 2, day);
    const p = parts(new Date(time));
    if (p.year === year && p.month === 1 && p.day === 1) {
      starts.set(year, time);
      return time;
    }
  }
  throw new RangeError('Persian calendar unavailable');
}
export function jalaliMonthLength(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) return 0;
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return (yearStart(year + 1) - yearStart(year)) / DAY === 366 ? 30 : 29;
}
export function jalaliToIso(year: number, month: number, day: number): string | null {
  if (![year, month, day].every(Number.isInteger) || year < 1200 || year > 1600 || month < 1 || month > 12 || day < 1 || day > jalaliMonthLength(year, month)) return null;
  const offset = month <= 6 ? (month - 1) * 31 : 186 + (month - 7) * 30;
  const iso = new Date(yearStart(year) + (offset + day - 1) * DAY).toISOString().slice(0, 10);
  const back = isoToJalali(iso);
  return back?.year === year && back.month === month && back.day === day ? iso : null;
}
