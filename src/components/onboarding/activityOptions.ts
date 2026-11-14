import type { DailyMovementPattern, DailyStepsRange } from '@/types';

export const MOVEMENT_OPTIONS: { value: DailyMovementPattern; icon: string; label: string; description: string }[] = [
  { value: 'mostly_seated', icon: '🪑', label: 'بیشتر روز نشسته‌ام', description: 'کار یا مطالعه پشت‌میز، رفت‌وآمد روزانه کم' },
  { value: 'mixed', icon: '🚶', label: 'نشستن و حرکت ترکیبی', description: 'بخشی از روز نشسته و بخشی در حال راه‌رفتن یا ایستادن' },
  { value: 'mostly_on_feet', icon: '🧍', label: 'بیشتر روز سرپا هستم', description: 'فروش، آموزش، خدمات یا رفت‌وآمد زیاد در طول روز' },
  { value: 'physical_job', icon: '🏗️', label: 'کار روزانه فیزیکی دارم', description: 'حمل بار، کار بدنی یا تحرک زیاد در بیشتر ساعات روز' },
];

export const STEP_OPTIONS: { value: DailyStepsRange; label: string }[] = [
  { value: 'under_4000', label: 'کمتر از ۴هزار' },
  { value: '4000_7000', label: '۴ تا ۷هزار' },
  { value: '7000_10000', label: '۷ تا ۱۰هزار' },
  { value: 'over_10000', label: 'بیشتر از ۱۰هزار' },
  { value: 'unknown', label: 'نمی‌دانم' },
];
