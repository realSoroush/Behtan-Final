import assert from 'node:assert/strict';
import {
  getNextOnboardingStep,
  persistOnboardingBeforeAdvance,
} from '../src/utils/onboardingProgress.ts';

assert.equal(getNextOnboardingStep(1, 11), 2);
assert.equal(getNextOnboardingStep(10, 11), 11);
assert.equal(getNextOnboardingStep(11, 11), 11);
assert.equal(getNextOnboardingStep(0, 11), 2);
assert.equal(getNextOnboardingStep(999, 11), 11);

const draft = { goal: 'weight_loss', weight: 110 };
let saved = false;
let savedStep = null;
let savedDraft = null;

const next = await persistOnboardingBeforeAdvance({
  currentStep: 4,
  totalSteps: 11,
  draft,
  save: async (step, payload) => {
    // Make sure the helper really awaits an asynchronous persistence boundary.
    await new Promise((resolve) => setTimeout(resolve, 10));
    saved = true;
    savedStep = step;
    savedDraft = payload;
  },
});

assert.equal(saved, true);
assert.equal(savedStep, 5);
assert.equal(savedDraft, draft);
assert.equal(next, 5);

let failureReached = false;
await assert.rejects(
  persistOnboardingBeforeAdvance({
    currentStep: 7,
    totalSteps: 11,
    draft,
    save: async () => {
      failureReached = true;
      throw new Error('database unavailable');
    },
  }),
  /database unavailable/
);
assert.equal(failureReached, true);

console.log('✅ Behtan onboarding persistence smoke test passed');
console.log('   Save-before-advance sequencing: OK');
console.log('   Failed save blocks advance: OK');
console.log('   Step clamping: OK');
