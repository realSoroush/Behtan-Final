import assert from 'node:assert/strict';
import {
  calculateAge,
  MAX_SUPPORTED_AGE,
  MIN_SUPPORTED_AGE,
  tryCalculateAge,
} from '../src/utils/nutritionHelpers.ts';

const referenceDate = new Date(2026, 7, 23); // 2026-08-23 local calendar date

assert.equal(MIN_SUPPORTED_AGE, 18);
assert.equal(MAX_SUPPORTED_AGE, 70);

// Inclusive boundaries.
assert.equal(calculateAge('2008-08-23', referenceDate), 18);
assert.equal(calculateAge('1956-08-23', referenceDate), 70);

// One day too young / one day too old must be rejected.
assert.throws(() => calculateAge('2008-08-24', referenceDate), /between 18 and 70/);
assert.throws(() => calculateAge('1955-08-23', referenceDate), /between 18 and 70/);

// Malformed / impossible dates must never be accepted.
assert.throws(() => calculateAge('not-a-date', referenceDate), /Invalid birth date/);
assert.throws(() => calculateAge('2000-02-31', referenceDate), /Invalid birth date/);

// UI-safe wrapper must return null instead of throwing and crashing render.
assert.equal(tryCalculateAge('2008-08-24', referenceDate), null);
assert.equal(tryCalculateAge('not-a-date', referenceDate), null);
assert.equal(tryCalculateAge('1990-05-15', referenceDate), 36);

console.log('✅ Behtan age-validation smoke test passed');
console.log('   Allowed age range: 18–70 inclusive');
console.log('   Invalid dates do not throw in UI-safe mode: OK');
console.log('   Underage/overage values are rejected: OK');
