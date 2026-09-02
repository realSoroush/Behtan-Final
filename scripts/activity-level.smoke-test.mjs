import { estimateActivityLevel } from '../src/utils/activityLevel.ts';

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const estimate = (overrides) => estimateActivityLevel({
  dailyMovement: 'mostly_seated',
  dailySteps: 'under_4000',
  workoutDays: 0,
  workoutDuration: null,
  workoutIntensity: null,
  doesWorkout: false,
  ...overrides,
});

assert(estimate({}).level === 'sedentary', 'Desk-bound + <4k steps + no workout must be sedentary');

assert(
  estimate({
    workoutDays: 3,
    workoutDuration: '30_60',
    workoutIntensity: 'moderate',
    doesWorkout: true,
  }).level === 'lightly_active',
  'Sedentary lifestyle + 3 moderate sessions should not be overclassified'
);

assert(
  estimate({
    dailyMovement: 'mixed',
    dailySteps: '4000_7000',
    workoutDays: 3,
    workoutDuration: '30_60',
    workoutIntensity: 'moderate',
    doesWorkout: true,
  }).level === 'moderate',
  'Mixed movement + 4-7k steps + 3 sessions should be moderate'
);

assert(
  estimate({
    dailyMovement: 'mostly_on_feet',
    dailySteps: '7000_10000',
    workoutDays: 5,
    workoutDuration: '30_60',
    workoutIntensity: 'moderate',
    doesWorkout: true,
  }).level === 'active',
  'On-feet lifestyle + 7-10k steps + 5 sessions should be active'
);

assert(
  estimate({
    dailyMovement: 'physical_job',
    dailySteps: 'unknown',
  }).level === 'active',
  'Physical job should classify as active even when step count is unknown'
);

assert(
  estimate({
    dailyMovement: 'mixed',
    dailySteps: 'unknown',
  }).level === 'lightly_active',
  'Unknown steps must safely fall back to daily movement pattern'
);

console.log('✅ Behtan behavioural activity-level smoke test passed');
console.log('   Sedentary desk-bound case: sedentary');
console.log('   Sedentary + 3 moderate workouts: lightly_active');
console.log('   Mixed + 4-7k steps + 3 workouts: moderate');
console.log('   On-feet + 7-10k steps + 5 workouts: active');
console.log('   Physical job + unknown steps: active');
console.log('   Unknown steps fallback: deterministic');
