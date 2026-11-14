import type { TrainingType, WorkoutDurationRange, WorkoutIntensity, WorkoutLocation } from '@/types';

export const LOCATIONS: { value: WorkoutLocation; icon: string; label: string }[] = [
  { value: 'home', icon: '🏠', label: 'در خانه' },
  { value: 'gym', icon: '🏋️', label: 'باشگاه' },
  { value: 'none', icon: '🚫', label: 'ورزش نمی‌کنم' },
];

export const TRAINING_TYPE_OPTIONS: { value: TrainingType; icon: string; label: string; description: string }[] = [
  { value: 'resistance', icon: '🏋️', label: 'قدرتی / مقاومتی', description: 'وزنه، دستگاه، تمرین با مقاومت یا تمرین قدرتی با وزن بدن' },
  { value: 'cardio', icon: '🏃', label: 'هوازی', description: 'دویدن، دوچرخه، شنا یا تمرینی که محور اصلی آن استقامت قلبی‌تنفسی است' },
  { value: 'mixed', icon: '⚡', label: 'ترکیبی', description: 'در هفته هم تمرین مقاومتی دارید و هم تمرین هوازی' },
];

export const DURATION_OPTIONS: { value: WorkoutDurationRange; label: string; description: string }[] = [
  { value: 'under_30', label: 'کمتر از ۳۰ دقیقه', description: 'جلسه کوتاه' },
  { value: '30_60', label: '۳۰ تا ۶۰ دقیقه', description: 'جلسه معمول' },
  { value: 'over_60', label: 'بیشتر از ۶۰ دقیقه', description: 'جلسه طولانی' },
];

export const INTENSITY_OPTIONS: { value: WorkoutIntensity; label: string; description: string }[] = [
  { value: 'light', label: 'سبک', description: 'تنفس تقریباً عادی؛ مثل پیاده‌روی آرام یا کشش' },
  { value: 'moderate', label: 'متوسط', description: 'تنفس تندتر ولی هنوز می‌توانید صحبت کنید' },
  { value: 'vigorous', label: 'شدید', description: 'تنفس سنگین و صحبت‌کردن هنگام تمرین سخت است' },
];
