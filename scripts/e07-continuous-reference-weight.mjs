import { DEFAULT_PROTEIN_ENGINE_POLICY } from '../src/utils/proteinPolicy.ts';

export const CONTINUOUS_REFERENCE_WEIGHT_MODEL = 'continuous-lower-envelope-v1';

// Greatest nondecreasing curve at or below the current curve. The flat
// interval joins actual weight to the existing adjusted-weight branch.
// This model is used for offline review with validated policy coefficients.
export function continuousReferenceWeightKg(weightKg, heightCm, policy = DEFAULT_PROTEIN_ENGINE_POLICY) {
  if (!Number.isFinite(heightCm) || heightCm <= 0) return weightKg;
  const heightSquared = (heightCm / 100) ** 2;
  const referenceKg = policy.referenceBmi * heightSquared;
  const thresholdKg = policy.obesityBmiThreshold * heightSquared;
  const adjustedKg = referenceKg + policy.excessWeightFraction * (Math.max(weightKg, thresholdKg) - referenceKg);
  return Math.min(weightKg, adjustedKg);
}
