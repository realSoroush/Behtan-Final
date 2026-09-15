import { useEffect, useRef, useState } from 'react';
import { isoToJalali, jalaliMonthLength, jalaliToIso } from '@/utils/jalaliDate';
import { MIN_SUPPORTED_AGE, MAX_SUPPORTED_AGE } from '@/utils/nutritionHelpers';

const months = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const fa = (n: number) => n.toLocaleString('fa-IR', { useGrouping: false });
const read = (iso: string) => {
  const date = isoToJalali(iso);
  return date && date.year >= 1200 && date.year <= 1600
    ? date : { year: 0, month: 0, day: 0 };
};

export function JalaliBirthDate({ value, onChange, invalid }: {
  value: string; onChange: (iso: string) => void; invalid: boolean;
}) {
  const [draft, setDraft] = useState(() => read(value));
  const emitted = useRef(value);
  useEffect(() => {
    // Keep partial selections, but hydrate dates restored from the saved onboarding draft.
    if (value !== emitted.current) {
      setDraft(read(value));
      emitted.current = value;
    }
  }, [value]);
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const currentYear = isoToJalali(today)!.year;
  const latestYear = currentYear - MIN_SUPPORTED_AGE;
  const earliestYear = currentYear - MAX_SUPPORTED_AGE - 1;
  const years = Array.from({ length: latestYear - earliestYear + 1 }, (_, i) => latestYear - i);
  if (draft.year && !years.includes(draft.year)) years.push(draft.year);
  const dayCount = draft.month ? jalaliMonthLength(draft.year || currentYear, draft.month) : 31;

  const change = (key: 'year' | 'month' | 'day', value: number) => {
    const next = { ...draft, [key]: value };
    if (next.month && next.day > jalaliMonthLength(next.year || currentYear, next.month)) next.day = 0;
    setDraft(next);
    const iso = next.year && next.month && next.day ? jalaliToIso(next.year, next.month, next.day) ?? '' : '';
    emitted.current = iso;
    onChange(iso);
  };
  const classes = `w-full min-w-0 bg-neutral-50 dark:bg-neutral-800 border rounded-2xl py-3.5 px-2 outline-none focus:ring-2 transition-all ${invalid ? 'border-red-400 focus:ring-red-400/30' : 'border-neutral-200 dark:border-neutral-700 focus:ring-primary-500'}`;
  return (
    <fieldset dir="rtl" aria-describedby={invalid ? 'birth-date-error' : undefined}>
      <legend className="text-sm font-semibold text-neutral-700 dark:text-neutral-300 mb-2">تاریخ تولد (شمسی)</legend>
      <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-2">
        <label className="min-w-0"><span className="sr-only">روز تولد</span>
          <select className={classes} value={draft.day} onChange={e => change('day', Number(e.target.value))} aria-invalid={invalid}>
            <option value={0}>روز</option>
            {Array.from({ length: dayCount }, (_, i) => i + 1).map(day => <option key={day} value={day}>{fa(day)}</option>)}
          </select>
        </label>
        <label className="min-w-0"><span className="sr-only">ماه تولد</span>
          <select className={classes} value={draft.month} onChange={e => change('month', Number(e.target.value))} aria-invalid={invalid}>
            <option value={0}>ماه</option>
            {months.map((month, i) => <option key={month} value={i + 1}>{month}</option>)}
          </select>
        </label>
        <label className="min-w-0"><span className="sr-only">سال تولد</span>
          <select className={classes} value={draft.year} onChange={e => change('year', Number(e.target.value))} aria-invalid={invalid}>
            <option value={0}>سال</option>
            {years.map(year => <option key={year} value={year}>{fa(year)}</option>)}
          </select>
        </label>
      </div>
    </fieldset>
  );
}
