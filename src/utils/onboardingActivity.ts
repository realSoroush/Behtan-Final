import type { ActivityLevel, OnboardingData } from '../types/index.ts';
import { estimateActivityLevel } from './activityLevel.ts';

type Answers = Partial<OnboardingData>;
export function hasDailyMovementAnswers(data: Answers): boolean {
  return ['mostly_seated', 'mixed', 'mostly_on_feet', 'physical_job'].includes(data.dailyMovement ?? '')
    && ['under_4000', '4000_7000', '7000_10000', 'over_10000', 'unknown'].includes(data.dailySteps ?? '');
}
export function hasWorkoutAnswers(data: Answers): boolean {
  if (data.workoutLocation === 'none') return true;
  return ['home', 'gym'].includes(data.workoutLocation ?? '')
    && Number.isInteger(data.workoutDays) && data.workoutDays! >= 1 && data.workoutDays! <= 7
    && ['resistance', 'cardio', 'mixed'].includes(data.trainingType ?? '')
    && ['under_30', '30_60', 'over_60'].includes(data.workoutDuration ?? '')
    && ['light', 'moderate', 'vigorous'].includes(data.workoutIntensity ?? '');
}
export function deriveOnboardingActivity(data: Answers): ActivityLevel | null {
  if (!hasDailyMovementAnswers(data) || !hasWorkoutAnswers(data)) return null;
  const doesWorkout = data.workoutLocation !== 'none';
  return estimateActivityLevel({
    dailyMovement: data.dailyMovement!,
    dailySteps: data.dailySteps!,
    workoutDays: doesWorkout ? data.workoutDays! : 0,
    workoutDuration: doesWorkout ? data.workoutDuration! : null,
    workoutIntensity: doesWorkout ? data.workoutIntensity! : null,
    doesWorkout,
  }).level;
}
/** Merge atomically so going back to daily movement never leaves a stale activity level. */
export function mergeActivityAnswers(data: OnboardingData, partial: Partial<OnboardingData>): OnboardingData {
  const next = { ...data, ...partial };
  if (next.workoutLocation === 'none') {
    next.workoutDays = 0;
    next.trainingType = null;
    next.workoutDuration = null;
    next.workoutIntensity = null;
  }
  next.activityLevel = deriveOnboardingActivity(next);
  return next;
}
/** Old step 5 was schedule; later step numbers have not changed. */
export function resolveActivityResumeStep(step: number, data: Answers): number {
  if (step > 4 && !hasDailyMovementAnswers(data)) return 4;
  if (step > 5 && !hasWorkoutAnswers(data)) return 5;
  return step;
}
