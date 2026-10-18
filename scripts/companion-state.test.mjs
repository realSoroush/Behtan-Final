import assert from 'node:assert/strict';
import {getDailyCompanion, getOnboardingCompanion} from '../src/components/companion/companionState.ts';

// Optimistic last-meal updates must never celebrate before persistence succeeds.
assert.equal(getDailyCompanion({total:6,consumed:6,saving:true,event:'recorded'}).mood,'thinking');
assert.equal(getDailyCompanion({total:6,consumed:6,error:true,event:'recorded'}).mood,'calm');
assert.equal(getDailyCompanion({total:6,consumed:2,event:'recorded'}).mood,'celebrate');
assert.equal(getDailyCompanion({total:6,consumed:6,event:'recorded'}).mood,'celebrate');
// Hydrating an existing day, or correcting a check-in, is not a fresh achievement.
assert.notEqual(getDailyCompanion({total:6,consumed:6}).mood,'celebrate');
assert.notEqual(getDailyCompanion({total:6,consumed:2}).mood,'celebrate');
assert.notEqual(getDailyCompanion({total:6,consumed:0}).mood,'celebrate');
assert.equal(getDailyCompanion({total:0,consumed:0}).action,undefined);
assert.equal(getDailyCompanion({total:0,consumed:0,planError:true}).title,'فعلاً برنامه‌ای آماده نیست.');
assert.equal(getDailyCompanion({total:6,consumed:6}).action,'مرور ثبت‌های امروز');
assert.equal(getDailyCompanion({total:6,consumed:2,event:'swapped'}).mood,'guide');
assert.equal(getDailyCompanion({total:6,consumed:2,error:true,event:'swapped'}).action,undefined);
for (const step of [1,2,3,4,5,6,7,9,10,11]) assert.ok(getOnboardingCompanion(step));
assert.equal(getOnboardingCompanion(6).mood,'calm');
assert.equal(getOnboardingCompanion(8),null);
console.log('✓ Companion: pending/error precedence, persisted achievements, hydration, end of day and onboarding states.');
