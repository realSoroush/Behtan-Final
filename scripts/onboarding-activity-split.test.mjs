import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { createEmptyOnboardingData } from '../src/types/index.ts';
import { hasDailyMovementAnswers, hasWorkoutAnswers, deriveOnboardingActivity, mergeActivityAnswers, resolveActivityResumeStep } from '../src/utils/onboardingActivity.ts';
import { estimateActivityLevel } from '../src/utils/activityLevel.ts';
const empty = createEmptyOnboardingData();
let daily = mergeActivityAnswers(empty, { dailyMovement: 'mostly_seated', dailySteps: 'under_4000' });
assert(hasDailyMovementAnswers(daily));
assert.equal(hasWorkoutAnswers(daily), false);
assert.equal(daily.activityLevel, null, 'Do not assume no exercise before the workout step');
assert.equal(daily.motivation, null, 'No motivation answer is required');
const none = mergeActivityAnswers(daily, { workoutLocation: 'none' });
assert(hasWorkoutAnswers(none)); assert.equal(none.activityLevel, 'sedentary');
assert.equal(none.workoutDays, 0); assert.equal(none.trainingType, null);
let sport = mergeActivityAnswers(daily, { workoutLocation:'gym',workoutDays:3,trainingType:'resistance',workoutDuration:'30_60',workoutIntensity:'moderate' });
assert.equal(sport.activityLevel, 'lightly_active');
assert.equal(deriveOnboardingActivity(sport), estimateActivityLevel({ ...sport, doesWorkout:true }).level);
for (const key of ['trainingType','workoutDuration','workoutIntensity']) assert.equal(hasWorkoutAnswers({ ...sport, [key]:null }),false);
for (const days of [0,8,1.5]) assert.equal(hasWorkoutAnswers({ ...sport, workoutDays:days }),false);
const backEdited = mergeActivityAnswers(sport, { dailyMovement:'mostly_on_feet',dailySteps:'7000_10000' });
assert.notEqual(backEdited.activityLevel,sport.activityLevel);
assert.equal(backEdited.trainingType,'resistance', 'Going back preserves workout answers');
const stopped = mergeActivityAnswers(sport, { workoutLocation:'none' });
for(const key of ['trainingType','workoutDuration','workoutIntensity']) assert.equal(stopped[key],null);
assert.equal(stopped.workoutDays,0);
assert.equal(resolveActivityResumeStep(5,daily),5);
assert.equal(resolveActivityResumeStep(11,daily),5);
assert.equal(resolveActivityResumeStep(9,empty),4);
assert.equal(resolveActivityResumeStep(9,sport),9);
assert.equal(resolveActivityResumeStep(6,{...sport,motivation:null}),6);

// Exercise the actual store and render the two real screens (no browser or network).
const root = fileURLToPath(new URL('..',import.meta.url));
const compiled = await build({ stdin: { contents: `
export { useOnboardingStore as store } from './src/hooks/useOnboardingStore';
export { Step4Activity } from './src/components/onboarding/Step4Activity';
export { Step5Workout } from './src/components/onboarding/Step5Workout';
export { createElement } from 'react';
export { renderToStaticMarkup } from 'react-dom/server';`, resolveDir:root },
 tsconfig:root+'/tsconfig.json',bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent' });
const module = { exports:{} };
new Function('module','exports','require',compiled.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
const {store,Step4Activity,Step5Workout,createElement,renderToStaticMarkup} = module.exports;
// SSR uses the initial snapshot; refresh that test-only object before rendering.
const render = (component) => {
  Object.assign(store.getInitialState(), store.getState());
  return renderToStaticMarkup(createElement(component));
};
store.getState().hydrateFromDraft('test-user',4,daily);
let html = render(Step4Activity);
assert(html.includes('میانگین قدم روزانه'));
assert(!html.includes('ورزش ساختاریافته'));assert(!html.includes('انگیزه اصلی'));
let saved;
store.getState().setProgressSaver(async(step,draft)=>{ saved={step,draft}; });
assert.equal(await store.getState().nextStep(),true);
assert.equal(saved.step,5);assert.equal(saved.draft.dailyMovement,'mostly_seated');
store.getState().hydrateFromDraft('test-user',5,saved.draft);
assert.equal(store.getState().currentStep,5);
html=render(Step5Workout);
assert(html.includes('ورزش ساختاریافته'));assert(!html.includes('ریتم خواب'));assert(!html.includes('انگیزه اصلی'));
store.getState().updateData(sport);
html=render(Step5Workout);
assert(html.includes('نوع اصلی تمرین'));assert(html.includes('مدت معمول هر جلسه'));assert(html.includes('شدت معمول تمرین'));
assert(html.includes('border-primary-200 dark:border-primary-900/60 dark:bg-primary-950/20'));
assert(!html.includes('bg-primary-50/70'));
assert.equal(await store.getState().nextStep(),true);assert.equal(saved.step,6);
store.getState().prevStep();assert.equal(store.getState().currentStep,5);
assert.equal(store.getState().data.trainingType,'resistance');
store.getState().hydrateFromDraft('test-user',10,{...sport,trainingType:null});assert.equal(store.getState().currentStep,5);
store.getState().hydrateFromDraft('test-user',8,{...sport,dailySteps:null});assert.equal(store.getState().currentStep,4);
store.getState().setProgressSaver(async()=>{throw new Error('offline');});
const oldError=console.error;console.error=()=>{};
try{assert.equal(await store.getState().nextStep(),false);}finally{console.error=oldError;}
assert.equal(store.getState().currentStep,4,'Failed save must not advance');
console.log('✅ Split onboarding: daily/workout UI, no motivation/schedule questions, activity recalculation, no-workout reset, saved resume, back navigation and failed-save guard');
