import type { AuthoredContent, AuthoredLine, AuthoredSection } from './authoredPlan.ts';
import type { FoodItem } from '../types/index.ts';
import type { PrintedPlan } from './menuPlan.ts';

export type GroupKind = 1 | 2 | 3;
export interface TrainingPrescription { group: string; kind: GroupKind; sets: number; reps: number; rest: number }
export interface NutritionTotals { kcal: number; protein: number; carbs: number; fat: number }
/** A per-unit catalog snapshot: historical plans must not change when the catalog changes. */
export interface FoodSnapshot extends NutritionTotals { id: string; grams: number; gramsPerUnit: number; basis: string }
export const groupLabel = (kind: number) => ['', 'تک‌حرکت', 'سوپرست', 'تریپل‌ست'][kind] || 'تک‌حرکت';
export const dayLabel = (key: string) => ({ daily: 'برنامه روزانه', rest: 'روز استراحت', workout: 'روز تمرین' }[key] || key);
export const normalizedSearch = (s: string) => s.normalize('NFKC').replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/[\u200c\sـ]+/g, '').toLowerCase();
export const fa = (n: number) => Number.isFinite(n) ? Number(n.toFixed(1)).toLocaleString('fa-IR') : '—';
export function lineDescription(line: AuthoredLine): string {
  if (line.food) {
    const f = line.food, t = foodTotals(f);
    return `${fa(f.grams)} گرم · ${f.basis}\n${fa(t.kcal)} کالری · پروتئین ${fa(t.protein)} · کربوهیدرات ${fa(t.carbs)} · چربی ${fa(t.fat)} گرم${line.details ? '\n' + line.details : ''}`;
  }
  if (line.training) {
    const t = line.training;
    return `${groupLabel(t.kind)} · ${t.sets} ست × ${t.reps} تکرار · ${t.rest} ثانیه استراحت${line.details ? '\n' + line.details : ''}`;
  }
  return line.details;
}
export function foodTotals(f: FoodSnapshot): NutritionTotals {
  const factor = f.grams / f.gramsPerUnit;
  return { kcal: f.kcal * factor, protein: f.protein * factor, carbs: f.carbs * factor, fat: f.fat * factor };
}
export function nutritionTotals(sections: AuthoredSection[]): NutritionTotals {
  return sections.flatMap(s => s.lines).reduce((total, line) => {
    if (line.food) { const n = foodTotals(line.food); for (const k of ['kcal', 'protein', 'carbs', 'fat'] as const) total[k] += n[k]; }
    return total;
  }, { kcal: 0, protein: 0, carbs: 0, fat: 0 });
}
export function foodLine(food: FoodItem, grams = 100): AuthoredLine {
  return { name: food.name, details: '', food: {
    id: food.id, grams, gramsPerUnit: food.gramsPerUnit,
    basis: ({ raw: 'خام', cooked: 'پخته', dry: 'خشک', ready: 'آماده مصرف' } as Record<string, string>)[food.preparationState || 'ready'],
    kcal: food.kcalPerUnit, protein: food.proteinPerUnit, carbs: food.carbsPerUnit, fat: food.fatPerUnit,
  } };
}
export function fromPrintedPlan(plan: PrintedPlan): AuthoredContent {
  const targets: Record<string, NutritionTotals> = {};
  return { version: 1, title: 'برنامه غذایی اختصاصی', notes: plan.notes, reviewed: false,
    nutritionTargets: targets,
    // Each slot contains alternatives; import ONE menu, never sum alternatives as food to eat together.
    sections: plan.days.flatMap(day => {
      const key = day.workout ? 'workout' : 'rest';
      targets[key] = { kcal: day.targets.targetCalories, protein: day.targets.proteinGrams, carbs: day.targets.carbGrams, fat: day.targets.fatGrams };
      return day.slots.map(slot => ({ title: slot.label, nutritionDay: key, lines: (slot.options[0]?.components || []).map(c => foodLine(c.foodItem, c.grams)) }));
    }),
  };
}
export function trainingLine(name = '', kind: GroupKind = 1, group: string = crypto.randomUUID()): AuthoredLine {
  return { name, details: '', training: { group, kind, sets: 3, reps: 12, rest: 60 } };
}
/** Existing text-only records remain readable, including their free-form instructions. */
export function prepareContent(content: AuthoredContent, kind: 'training' | 'nutrition'): AuthoredContent {
  const copy = structuredClone(content);
  if (kind === 'training') for (const section of copy.sections) for (const line of section.lines) {
    if (!line.training) {
      const match = /^(\d+) ست · (\d+) تکرار · (\d+) ثانیه استراحت(?:\n([\s\S]*))?$/.exec(line.details);
      line.training = { group: crypto.randomUUID(), kind: 1, sets: match ? +match[1] : 3, reps: match ? +match[2] : 12, rest: match ? +match[3] : 60 };
      if (match) line.details = match[4] || '';
    }
  }
  return copy;
}
export function trainingGroups(section: AuthoredSection) {
  const groups: { id: string; kind: GroupKind; indices: number[] }[] = [];
  section.lines.forEach((line, i) => {
    const id = line.training?.group || 'legacy-' + i, last = groups[groups.length - 1];
    if (last?.id === id) last.indices.push(i);
    else groups.push({ id, kind: line.training?.kind || 1, indices: [i] });
  });
  return groups;
}
export function validateAuthored(content: AuthoredContent, kind: 'training' | 'nutrition'): string {
  if (!content.title.trim() || content.title.length > 160 || content.notes.length > 4000) return 'عنوان و توضیحات برنامه را بررسی کنید.';
  if (!content.sections.length || content.sections.length > 28) return 'برنامه باید بین ۱ تا ۲۸ بخش داشته باشد.';
  for (const s of content.sections) {
    if (!s.title.trim() || s.title.length > 100 || !s.lines.length || s.lines.length > 30) return 'عنوان و سطرهای همه جلسات یا وعده‌ها را کامل کنید.';
    for (const l of s.lines) {
      if (!l.name.trim() || l.name.length > 300 || l.details.length > 2000) return 'نام و توضیحات همه سطرها را کامل کنید.';
      if (l.training) {
        const t = l.training;
        if (![1, 2, 3].includes(t.kind) || !Number.isInteger(t.sets) || t.sets < 1 || t.sets > 20 || !Number.isInteger(t.reps) || t.reps < 1 || t.reps > 300 || !Number.isInteger(t.rest) || t.rest < 0 || t.rest > 1800) return 'ست، تکرار یا زمان استراحت نامعتبر است.';
      }
      if (l.food) {
        const f = l.food;
        if (!Number.isFinite(f.grams) || f.grams <= 0 || f.grams > 5000 || !Number.isFinite(f.gramsPerUnit) || f.gramsPerUnit <= 0 || ['kcal', 'protein', 'carbs', 'fat'].some(k => !Number.isFinite(f[k as keyof NutritionTotals]) || f[k as keyof NutritionTotals] < 0)) return 'وزن یا مقادیر ماده غذایی نامعتبر است.';
      }
    }
    if (kind === 'training') {
      const ids = new Set<string>();
      for (const g of trainingGroups(s)) {
        if (ids.has(g.id) || g.indices.length !== g.kind || g.indices.some(i => s.lines[i].training?.kind !== g.kind)) return 'سوپرست یا تریپل‌ست ناقص است؛ گروه را کامل کنید.';
        ids.add(g.id);
      }
    }
  }
  if (new TextEncoder().encode(JSON.stringify(content)).length >= 140000) return 'حجم برنامه زیاد است؛ تعداد سطرها یا توضیحات را کاهش دهید.';
  return '';
}
export function moveItem<T>(items: T[], from: number, to: number) {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return;
  items.splice(to, 0, items.splice(from, 1)[0]);
}
