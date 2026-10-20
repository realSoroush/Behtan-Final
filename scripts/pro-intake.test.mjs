import assert from "node:assert/strict";
import {
  syntheticIntake,
  intakeEligibility,
  permissionState,
} from "../src/professional/intake.ts";
const a = { ...syntheticIntake(), safety_confirmed: true };
const reference = new Date("2026-10-20T12:00:00Z");
assert.equal(intakeEligibility(a, reference).canGenerateAutomaticPlan, true);
assert.equal(
  intakeEligibility({ ...a, safety_confirmed: false }, reference).status,
  "needs_screening",
);
for (const c of [
  "diabetes",
  "kidney_disease",
  "heart_disease",
  "advanced_liver_disease",
])
  assert.equal(
    intakeEligibility({ ...a, medical_conditions: [c] }, reference)
      .canGenerateAutomaticPlan,
    false,
  );
for (const pregnancy_status of ["pregnant", "breastfeeding"])
  assert.equal(
    intakeEligibility({ ...a, pregnancy_status }, reference)
      .canGenerateAutomaticPlan,
    false,
  );
assert.equal(
  intakeEligibility(
    { ...a, eating_disorder_status: "active_or_treatment" },
    reference,
  ).canGenerateAutomaticPlan,
  false,
);
assert.equal(
  intakeEligibility({ ...a, birth_date: "2010-01-01" }, reference)
    .canGenerateAutomaticPlan,
  false,
);
assert.equal(
  intakeEligibility({ ...a, weight_kg: 200 }, reference)
    .canGenerateAutomaticPlan,
  false,
);
assert.equal(
  intakeEligibility({ ...a, weight_kg: 40 }, reference)
    .canGenerateAutomaticPlan,
  false,
);
const now = Date.parse("2026-10-20T12:00:00Z");
const grant = {
  id: "g",
  purpose: "processing",
  decision: "grant",
  expires_at: "2026-10-21T12:00:00Z",
  sequence: 1,
  occurred_at: "2026-10-20T12:00:00Z",
};
const revoked = {
  ...grant,
  id: "r",
  decision: "revoke",
  expires_at: null,
  sequence: 2,
};
assert.equal(permissionState([], "processing", now), "missing");
assert.equal(permissionState([grant], "processing", now), "granted");
assert.equal(permissionState([revoked, grant], "processing", now), "revoked");
assert.equal(permissionState([grant], "processing", now + 86400001), "expired");
assert.equal(permissionState([grant], "progress_sharing", now), "missing");
console.log(
  "PASS: 17 intake/medical hard-stop and purpose-specific permission assertions",
);
