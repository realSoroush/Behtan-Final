import type { Goal } from '@/types';

interface GoalOption {
  value: Goal;
  icon: string;
  label: string;
  description: string;
}

export const GOALS: GoalOption[] = [
  {
    value: 'weight_loss',
    icon: '🔥',
    label: 'کاهش وزن',
    description: 'می‌خواهم چربی بسوزانم و سبک‌تر شوم',
  },
  {
    value: 'weight_gain',
    icon: '💪',
    label: 'افزایش وزن / حجم',
    description: 'می‌خواهم عضله بسازم و وزن اضافه کنم',
  },
  {
    value: 'maintenance',
    icon: '⚖️',
    label: 'حفظ وزن فعلی',
    description: 'وزنم مناسب است، فقط سالم بمانم',
  },
];
