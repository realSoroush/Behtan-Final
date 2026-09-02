import type {
  ActivityLevel,
  DailyMovementPattern,
  DailyStepsRange,
  WorkoutDurationRange,
  WorkoutIntensity,
} from '@/types';

export interface ActivityLevelInput {
  dailyMovement: DailyMovementPattern;
  dailySteps: DailyStepsRange;
  workoutDays: number;
  workoutDuration: WorkoutDurationRange | null;
  workoutIntensity: WorkoutIntensity | null;
  doesWorkout: boolean;
}

export interface ActivityLevelEstimate {
  level: ActivityLevel;
  score: number;
  movementScore: number;
  exerciseScore: number;
}

const MOVEMENT_SCORES: Record<DailyMovementPattern, number> = {
  mostly_seated: 0,
  mixed: 1,
  mostly_on_feet: 2,
  physical_job: 3,
};

const STEP_SCORES: Record<Exclude<DailyStepsRange, 'unknown'>, number> = {
  under_4000: 0,
  '4000_7000': 1,
  '7000_10000': 2,
  over_10000: 3,
};

const DURATION_FACTORS: Record<WorkoutDurationRange, number> = {
  under_30: 0.75,
  '30_60': 1,
  over_60: 1.2,
};

const INTENSITY_FACTORS: Record<WorkoutIntensity, number> = {
  light: 0.75,
  moderate: 1,
  vigorous: 1.25,
};

function workoutDayLoad(days: number): number {
  const safeDays = Math.max(0, Math.min(7, Math.round(days)));
  if (safeDays === 0) return 0;
  if (safeDays === 1) return 0.25;
  if (safeDays === 2) return 0.45;
  if (safeDays === 3) return 0.7;
  if (safeDays === 4) return 0.9;
  if (safeDays === 5) return 1.1;
  if (safeDays === 6) return 1.25;
  return 1.35;
}

/**
 * Converts concrete behaviour into the four activity buckets used by the
 * existing Nutrition v2 TDEE formula. The formula itself is intentionally
 * unchanged; this function only replaces self-classification with a more
 * reproducible estimate.
 *
 * Daily movement/steps carry most of the score. Structured exercise can lift
 * a user by roughly one activity band, but cannot turn a very sedentary week
 * into an extreme multiplier on its own.
 */
export function estimateActivityLevel(input: ActivityLevelInput): ActivityLevelEstimate {
  const movementScore = MOVEMENT_SCORES[input.dailyMovement];

  const effectiveMovementScore = input.dailySteps === 'unknown'
    ? movementScore
    : (STEP_SCORES[input.dailySteps] * 0.65) + (movementScore * 0.35);

  let exerciseScore = 0;
  if (
    input.doesWorkout &&
    input.workoutDays > 0 &&
    input.workoutDuration &&
    input.workoutIntensity
  ) {
    exerciseScore = workoutDayLoad(input.workoutDays)
      * DURATION_FACTORS[input.workoutDuration]
      * INTENSITY_FACTORS[input.workoutIntensity];
    exerciseScore = Math.min(1.6, exerciseScore);
  }

  const score = Number((effectiveMovementScore + exerciseScore).toFixed(3));

  let level: ActivityLevel;
  if (input.dailyMovement === 'physical_job') {
    level = 'active';
  } else if (score <= 0.6) {
    level = 'sedentary';
  } else if (score <= 1.6) {
    level = 'lightly_active';
  } else if (score <= 2.9) {
    level = 'moderate';
  } else {
    level = 'active';
  }

  return {
    level,
    score,
    movementScore: Number(effectiveMovementScore.toFixed(3)),
    exerciseScore: Number(exerciseScore.toFixed(3)),
  };
}

export const ACTIVITY_LEVEL_META: Record<ActivityLevel, {
  label: string;
  multiplier: number;
  description: string;
}> = {
  sedentary: {
    label: 'کم‌تحرک',
    multiplier: 1.2,
    description: 'بیشتر روز کم‌تحرک است و فعالیت ساختاریافته کمی دارید.',
  },
  lightly_active: {
    label: 'کمی فعال',
    multiplier: 1.375,
    description: 'تحرک روزانه یا تمرین سبک و منظم دارید.',
  },
  moderate: {
    label: 'فعالیت متوسط',
    multiplier: 1.55,
    description: 'ترکیب قابل‌توجهی از تحرک روزانه و ورزش منظم دارید.',
  },
  active: {
    label: 'فعال',
    multiplier: 1.725,
    description: 'تحرک روزانه بالا، کار فیزیکی یا تمرین پرتکرار دارید.',
  },
};
