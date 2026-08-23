/**
 * Small, framework-free onboarding checkpoint helper.
 * Kept separate so the critical "save before advance" rule is easy to test.
 */
export function getNextOnboardingStep(currentStep: number, totalSteps: number): number {
  if (!Number.isFinite(currentStep) || !Number.isFinite(totalSteps) || totalSteps < 1) {
    throw new Error('Invalid onboarding step configuration.');
  }

  const safeCurrent = Math.max(1, Math.min(Math.trunc(currentStep), Math.trunc(totalSteps)));
  return Math.min(safeCurrent + 1, Math.trunc(totalSteps));
}

export async function persistOnboardingBeforeAdvance<T>(params: {
  currentStep: number;
  totalSteps: number;
  draft: T;
  save: (nextStep: number, draft: T) => Promise<void>;
}): Promise<number> {
  const nextStep = getNextOnboardingStep(params.currentStep, params.totalSteps);

  if (nextStep === params.currentStep) {
    return params.currentStep;
  }

  // Deliberately await the database write. Callers must not navigate before
  // this resolves; a rejection means the UI stays on the current step.
  await params.save(nextStep, params.draft);
  return nextStep;
}
