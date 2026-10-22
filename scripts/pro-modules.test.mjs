import assert from "node:assert/strict";
import {
  buildTrainingPlan,
  parseTrainingInput,
} from "../src/training/engine.ts";
import { emptyRealIntake } from "../src/professional/menuPlan.ts";
import {
  proNutritionDraftAllowed,
  intakeEligibility,
} from "../src/professional/intake.ts";
import { authoredHtml } from "../src/professional/authoredPlan.ts";
const now = new Date("2026-10-22T12:00:00Z"),
  a = {
    ...emptyRealIntake(),
    display_name: "مصنوعی",
    birth_date: "1992-04-23",
    height_cm: 165,
    weight_kg: 75,
    safety_confirmed: true,
  };
const cfg = {
  version: 1,
  location: "home",
  experience: "beginner",
  goal: "general",
  days: [0, 3],
  minutes: 45,
  equipment: ["dumbbells"],
  start_date: "2026-10-24",
  screening: {
    confirmed: true,
    symptoms: false,
    pain: false,
    restriction: false,
    recent_surgery: false,
  },
};
let checks = 0;
for (let count = 1; count <= 7; count++)
  for (const experience of ["beginner", "returning", "regular"])
    for (const minutes of [30, 45, 60, 90]) {
      const input = {
        ...cfg,
        experience,
        minutes,
        days: Array.from({ length: count }, (_, i) => i),
      };
      const p = buildTrainingPlan(
        { ...a, medical_conditions: ["thyroid"], medications_present: true },
        input,
        1,
        now,
        true,
      );
      assert.equal(p.weeks.length, 4);
      assert(p.weeks.every((w) => w.sessions.length === count));
      assert(
        p.weeks
          .flatMap((w) => w.sessions)
          .every((s) => s.estimated_minutes <= minutes),
      );
      checks += 3;
    }
for(const equipment of [['long_band','stable_platform'],['chest_press','leg_press','leg_curl','lat_pulldown','seated_row']])for(let n=1;n<=7;n++){
 const p=buildTrainingPlan(a,{...cfg,location:equipment.includes('chest_press')?'gym':'home',experience:'regular',goal:'muscle',days:Array.from({length:n},(_,i)=>i),minutes:60,equipment},1,now,true);
 assert(p.weeks.every(w=>w.sessions.length===n));
 assert(p.weeks.flatMap(w=>w.sessions).every(s=>new Set(s.lines.map(l=>l.exercise.id)).size===s.lines.length));checks+=2;
}
assert.throws(
  () => parseTrainingInput({ ...cfg, days: [0, 1, 2, 3] }),
  /TRAINING_DAYS/,
);
checks++;
assert.throws(
  () =>
    buildTrainingPlan({ ...a, medical_conditions: ["thyroid"] }, cfg, 1, now),
  /TRAINING_REVIEW_REQUIRED/,
);
checks++;
for (const k of ["symptoms", "restriction", "pain", "recent_surgery"]) {
  assert.throws(
    () =>
      buildTrainingPlan(
        a,
        { ...cfg, screening: { ...cfg.screening, [k]: true } },
        1,
        now,
        true,
      ),
    /TRAINING_SPECIALIST_AUTHORING/,
  );
  checks++;
}
assert.throws(
  () =>
    buildTrainingPlan({ ...a, birth_date: "2015-01-01" }, cfg, 1, now, true),
  /TRAINING_SPECIALIST_AUTHORING/,
);
checks++;
assert(
  proNutritionDraftAllowed(
    { ...a, medical_conditions: ["thyroid"], medications_present: true },
    now,
  ),
);
checks++;
assert.equal(
  proNutritionDraftAllowed(
    { ...a, medical_conditions: ["kidney_disease"] },
    now,
  ),
  false,
);
checks++;
assert.equal(
  intakeEligibility({ ...a, medical_conditions: ["kidney_disease"] }, now)
    .canGenerateAutomaticPlan,
  false,
);
checks++;
const doc = {
  version: 1,
  title: "<script>bad</script>",
  notes: "<img onerror=bad>",
  reviewed: true,
  sections: [
    { title: "جلسه", lines: [{ name: "<svg onload=bad>", details: "A & B" }] },
  ],
};
const html = authoredHtml(doc, "<b>name</b>", "training", "https://behtan.fit");
assert(!html.includes("<script>"));
assert(!html.includes("<svg"));
assert(html.includes("&lt;script&gt;"));
assert(html.includes("A &amp; B"));
checks += 4;
console.log(
  `PASS Pro professional mode: ${checks} assertions; 1–7 days, time budgets, stable conditions, unchanged B2C gates, specialist authoring, HTML escaping`,
);
