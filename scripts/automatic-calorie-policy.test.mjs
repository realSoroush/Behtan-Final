import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { calculateTargetCalories, calculateFullNutritionPlanWithTrace, calculateMacros } from '../src/utils/nutritionHelpers.ts';
import { MEDICAL_SAFETY_SCREENING_VERSION } from '../src/utils/medicalEligibility.ts';
import { getNextOnboardingStep, getVisibleOnboardingStep } from '../src/utils/onboardingProgress.ts';
for (const speed of [undefined, 'mild', 'standard', 'fast']) {
  for (const [tdee, loss, gain] of [[2000,1500,2500],[4000,3000,5000],[6000,4800,7200],[1400,1200,1750]]) {
    assert.equal(calculateTargetCalories(tdee,'weight_loss',speed),loss);
    assert.equal(calculateTargetCalories(tdee,'weight_gain',speed),gain);
    assert.equal(calculateTargetCalories(tdee,'maintenance',speed),tdee);
  }
}
const input = {weightKg:90,heightCm:180,birthDateISO:'1995-01-01',referenceDate:new Date('2026-09-01'),gender:'male',activityLevel:'moderate',trainingType:'resistance'};
for (const goal of ['weight_loss','weight_gain']) {
  const rest = calculateFullNutritionPlanWithTrace({...input,goal,isWorkoutDay:false});
  const workout = calculateFullNutritionPlanWithTrace({...input,goal,isWorkoutDay:true,weightLossSpeed:'fast'});
  assert.equal(rest.targets.targetCalories,workout.targets.targetCalories);
  assert.equal(workout.trace.workoutBonusKcal,0);
  assert.equal(workout.trace.weightLossSpeed,null);
  assert.equal(workout.trace.tdee + workout.trace.calorieAdjustmentKcal,workout.targets.targetCalories);
  assert.deepEqual(workout.targets,calculateMacros(workout.targets.targetCalories,90,goal,180,'resistance'));
}
assert.equal(getNextOnboardingStep(7,11),9);
assert.equal(getVisibleOnboardingStep(9),8);
assert.equal(getVisibleOnboardingStep(11),10);
const root = fileURLToPath(new URL('..',import.meta.url));
const compiled = await build({stdin:{contents:`
export { useOnboardingStore as store } from './src/hooks/useOnboardingStore';
export { Step6Medical } from './src/components/onboarding/Step6Medical';
export { createElement } from 'react';
export { renderToStaticMarkup } from 'react-dom/server';`,resolveDir:root},tsconfig:root+'/tsconfig.json',bundle:true,platform:'node',format:'cjs',write:false,logLevel:'silent'});
const module = {exports:{}};
new Function('module','exports','require',compiled.outputFiles[0].text)(module,module.exports,createRequire(import.meta.url));
const {store,Step6Medical,createElement,renderToStaticMarkup} = module.exports;
const draft = {...store.getState().data,gender:'male',birthDate:'1995-01-01',height:180,weight:140,goal:'weight_loss',pregnancyStatus:'not_pregnant',eatingDisorderStatus:'none',safetyAnswersConfirmed:true,safetyScreeningVersion:MEDICAL_SAFETY_SCREENING_VERSION,dailyMovement:'mostly_seated',dailySteps:'under_4000',workoutLocation:'none'};
store.getState().hydrateFromDraft('test',8,draft);
assert.equal(store.getState().currentStep,9,'Legacy speed drafts resume at scan');
store.getState().prevStep();
assert.equal(store.getState().currentStep,7);
let saved;
store.getState().setProgressSaver(async(step)=>{saved=step;});
assert.equal(await store.getState().nextStep(),true);
assert.equal(saved,9); assert.equal(store.getState().currentStep,9);
store.getState().prevStep();
store.getState().setProgressSaver(async()=>{throw Error('intentional test failure');});
const logError=console.error; console.error=()=>{};
try {assert.equal(await store.getState().nextStep(),false);} finally {console.error=logError;}
assert.equal(store.getState().currentStep,7);
const render = () => {Object.assign(store.getInitialState(),store.getState());return renderToStaticMarkup(createElement(Step6Medical));};
assert(!render().includes('برنامه با محدودیت ایمنی ساخته می‌شود'));
store.getState().updateData({eatingDisorderStatus:'active_or_treatment'});
assert(render().includes('برنامه خودکار برای شما صادر نمی‌شود'));
console.log('Automatic calories: rates, caps, floor, legacy values, workout targets, unchanged macros, skip/resume/save failure and medical hard-stop UI passed.');
