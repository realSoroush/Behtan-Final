import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import {
  buildTrainingPlan,
  parseTrainingInput,
  progressionAdvice,
} from "../../src/training/engine.ts";
import { canReuseMemberTraining, trainingProfile } from "../../server/member/trainingProfile.ts";
import { EXERCISES } from "../../src/training/catalog.ts";
import { trainingHtml } from "../../src/training/print.ts";
import { emptyRealIntake } from "../../src/professional/menuPlan.ts";
export const answers = {
  ...emptyRealIntake(),
  display_name: "مراجع مصنوعی",
  birth_date: "1992-04-23",
  height_cm: 165,
  weight_kg: 75,
  safety_confirmed: true,
};
export const input = {
  version: 1,
  location: "home",
  experience: "beginner",
  goal: "general",
  days: [0, 3],
  minutes: 45,
  equipment: ["dumbbells", "stable_platform"],
  start_date: "2026-10-24",
  screening: {
    confirmed: true,
    symptoms: false,
    pain: false,
    restriction: false,
    recent_surgery: false,
  },
};
const now = new Date("2026-10-22T12:00:00Z");
let plans = 0,
  checks = 0;
const eq = (a, b) => {
  assert.deepEqual(a, b);
  checks++;
};
const rejects = (fn, code) => {
  assert.throws(fn, new RegExp(code));
  checks++;
};
const sets = [
  ["dumbbells"],
  ["long_band", "stable_platform"],
  ["dumbbells", "long_band", "stable_platform"],
  ["chest_press", "leg_press", "leg_curl", "seated_row"],
  ["dumbbells", "chest_press", "leg_press", "lat_pulldown"],
];
for (const experience of ["beginner", "returning", "regular"])
  for (const goal of ["general", "muscle"])
    for (const days of [
      [0, 3],
      [0, 2, 4],
      [1, 4],
      [1, 3, 5],
    ])
      for (const minutes of [45, 60])
        for (const equipment of sets)
          for (const bmiHigh of [false, true]) {
            const a = { ...answers, weight_kg: bmiHigh ? 110 : 75 };
            const cfg = {
              ...input,
              experience,
              goal,
              days,
              minutes,
              equipment,
              location: equipment.some((x) =>
                ["chest_press", "leg_press"].includes(x),
              )
                ? "gym"
                : "home",
            };
            const unsupported =
              bmiHigh &&
              !equipment.some((x) =>
                ["stable_platform", "chest_press"].includes(x),
              );
            if (unsupported) {
              rejects(
                () => buildTrainingPlan(a, cfg, 1, now),
                "TRAINING_SUPPORTED_PUSH",
              );
              continue;
            }
            const p = buildTrainingPlan(a, cfg, 1, now);
            plans++;
            for (const session of p.weeks.flatMap((w) => w.sessions)) {
              assert.equal(
                (new Date(session.date + "T12:00:00Z").getUTCDay() + 1) % 7,
                session.day,
              );
              checks++;
            }
            eq(p.weeks.length, 4);
            eq(p, buildTrainingPlan(a, cfg, 1, now));
            for (const w of p.weeks)
              for (const session of w.sessions) {
                assert(session.estimated_minutes <= minutes);
                checks++;
                eq(
                  new Set(session.lines.map((l) => l.exercise.id)).size,
                  session.lines.length,
                );
                for (const pattern of [
                  "squat",
                  "hinge",
                  "push",
                  "pull",
                  "core",
                  "calf",
                ]) {
                  assert(
                    session.lines.some((l) => l.exercise.pattern === pattern),
                  );
                  checks++;
                }
                for (const line of session.lines) {
                  assert(
                    line.exercise.equipment.every((e) => equipment.includes(e)),
                  );
                  assert(line.sets >= 1 && line.sets <= 3);
                  assert(line.rir >= 3);
                  assert(line.reps[1] <= 15);
                  checks += 4;
                }
              }
          }
for (const patch of [
  { days: [0, 1] },
  { days: [0, 6] },
  { days: [0, 2, 6] },
  { days: [0, 0] },
  { days: [0, 2, 4, 6] },
])
  rejects(() => parseTrainingInput({ ...input, ...patch }), "TRAINING_");
for (const patch of [
  { minutes: "45" },
  { minutes: NaN },
  { equipment: ["machine"] },
  { equipment: ["dumbbells", "dumbbells"] },
  { start_date: "2026-02-30" },
  { screening: { ...input.screening, confirmed: 1 } },
  { injected: "yes" },
])
  rejects(
    () => parseTrainingInput({ ...input, ...patch }),
    "TRAINING_INVALID_INPUT",
  );
for (const field of ["symptoms", "pain", "restriction", "recent_surgery"])
  rejects(
    () =>
      buildTrainingPlan(
        answers,
        { ...input, screening: { ...input.screening, [field]: true } },
        1,
        now,
      ),
    "TRAINING_REVIEW_REQUIRED",
  );
rejects(
  () =>
    buildTrainingPlan(
      answers,
      { ...input, screening: { ...input.screening, confirmed: false } },
      1,
      now,
    ),
  "TRAINING_SCREENING_REQUIRED",
);
rejects(
  () => buildTrainingPlan(answers, { ...input, equipment: [] }, 1, now),
  "TRAINING_PULL_EQUIPMENT",
);
for (const patch of [
  { birth_date: "2010-01-01" },
  { birth_date: "1940-01-01" },
  { birth_date: "" },
])
  rejects(
    () => buildTrainingPlan({ ...answers, ...patch }, input, 1, now),
    "TRAINING_SCOPE",
  );
for (const patch of [
  { medical_conditions: ["diabetes"] },
  { medications_present: true },
  { injuries_present: true },
  { pregnancy_status: "pregnant" },
  { eating_disorder_status: "current" },
])
  rejects(
    () => buildTrainingPlan({ ...answers, ...patch }, input, 1, now),
    "TRAINING_REVIEW_REQUIRED",
  );
// Caller-selected start date cannot bypass present age.
rejects(
  () =>
    buildTrainingPlan(
      { ...answers, birth_date: "2010-01-01" },
      { ...input, start_date: "2050-01-01" },
      1,
      now,
    ),
  "TRAINING_SCOPE",
);
eq(progressionAdvice([12, 12], [8, 12], 3, false, true), "increase");
eq(progressionAdvice([12, 12], [8, 12], 3, false, false), "repeat");
eq(progressionAdvice([7, 8], [8, 12], 3, false, true), "reduce");
eq(progressionAdvice([12, 12], [8, 12], 1, false, true), "reduce");
eq(progressionAdvice([12, 12], [8, 12], 3, true, true), "stop");
eq(new Set(EXERCISES.map((e) => e.id)).size, 22);
for (const e of EXERCISES) {
  for (const path of [e.poster, e.animation, "/training/qr/" + e.id + ".png"]) {
    assert(
      (await stat(new URL("../../public" + path, import.meta.url))).size > 0,
    );
    checks++;
  }
}
const p = buildTrainingPlan(
  { ...answers, display_name: "<img src=x onerror=alert(1)>" },
  input,
  1,
  now,
);
const html = trainingHtml(p, "https://pro.behtan.fit");
assert(!html.includes("<img src=x"));
assert(html.includes("&lt;img"));
assert(!html.includes("undefined"));
checks += 3;
const manifest = JSON.parse(
  await readFile(
    new URL("../../docs/training/media-manifest.json", import.meta.url),
    "utf8",
  ),
);
eq(manifest.length, 44);
// Every Pro weekday combination, rotating the start date through the week.
for (let mask = 1; mask < 128; mask++) {
  const days = Array.from({ length: 7 }, (_, day) => day).filter(day => mask & (1 << day));
  const split = days.some(day => days.includes((day + 1) % 7));
  for (let offset = 0; offset < 7; offset++) {
    const start_date = `2026-10-${24 + offset}`;
    const plan = buildTrainingPlan(answers, { ...input, days, start_date }, 1, now, true);
    for (const week of plan.weeks) {
      assert.equal(week.sessions.length, days.length);
      const patterns = new Set(week.sessions.flatMap(session => session.lines.map(line => line.exercise.pattern)));
      for (const pattern of ["push", "pull", "squat", "hinge", "calf", "core"]) {
        assert(patterns.has(pattern), `Week ${week.week} with weekdays ${days} lost ${pattern}`);
      }
    }
    const sessions = plan.weeks.flatMap(week => week.sessions);
    for (let index = 1; index < sessions.length; index++) {
      const previous = sessions[index - 1];
      const current = sessions[index];
      if (Date.parse(current.date) - Date.parse(previous.date) === 86400000) {
        assert(split);
        assert.notEqual(previous.title, current.title, "Adjacent Pro sessions must alternate, even across weeks");
      }
    }
  }
}

// More time never removes previously assigned work, including around 45 and 60 minutes.
for (const days of [[0, 3], [0, 1], [0, 1, 3, 4, 6]]) {
  for (const experience of ["beginner", "regular"]) {
    const equipment = ["dumbbells", "stable_platform"];
    let previous;
    for (let minutes = 19; minutes <= 180; minutes++) {
      const plan = buildTrainingPlan(answers, { ...input, days, minutes, experience, goal: "muscle", equipment }, 1, now, true);
      const sessions = plan.weeks.flatMap(week => week.sessions);
      sessions.forEach((session, index) => {
        assert(session.estimated_minutes <= minutes);
        const lines = new Map(session.lines.map(line => [line.exercise.id, line.sets]));
        for (const line of previous?.[index].lines ?? []) {
          assert(lines.get(line.exercise.id) >= line.sets, `${minutes} minutes removed work`);
        }
      });
      previous = sessions;
    }
  }
}
rejects(() => buildTrainingPlan(answers, { ...input, minutes: 15 }, 1, now, true), "TRAINING_TIME_BUDGET");

const member = {
  display_name: "Synthetic",
  gender: "male",
  birth_date: "1992-04-23",
  height: 165,
  weight: 75,
  goal: "maintenance",
  workout_days: input.days.length,
  workout_weekdays: input.days,
  medical_conditions_json: {
    conditions: [],
    medications: "",
    injuries: "",
    pregnancyStatus: "not_applicable",
    eatingDisorderStatus: "none",
    safetyAnswersConfirmed: true,
    safetyScreeningVersion: 1,
  },
};
const legacySnapshot = JSON.stringify({ ...member, meal_settings: null });
const regularInput = { ...input, experience: "regular" };
const storedPlan = buildTrainingPlan(trainingProfile(member), regularInput, 1, now);
delete storedPlan.planning_revision; // Old on-disk plans remain readable as-is.
const canReuse = (patch = {}, snapshot = legacySnapshot, plan = storedPlan) =>
  canReuseMemberTraining(plan, snapshot, { ...member, ...patch }, now);
assert(canReuse({ weight: 76, meal_settings: { regularMeals: 4, includePostWorkout: false }, protein_budget_preference: "economic" }));
assert(canReuse({ workout_weekdays: [3, 0], display_name: "نام جدید" }));
assert(!canReuse({ weight: 100 }), "Crossing the conservative template boundary requires rebuilding");
assert(!canReuse({ workout_weekdays: [1, 4] }));
assert(!canReuse({ workout_days: 3 }));
assert(!canReuse({ medical_conditions_json: { ...member.medical_conditions_json, injuries: "Reported" } }));
assert(!canReuse({ medical_conditions_json: { ...member.medical_conditions_json, safetyAnswersConfirmed: false } }));
assert(!canReuse({}, "invalid snapshot"));
const unsupported = buildTrainingPlan(trainingProfile(member), { ...input, equipment: ["dumbbells"] }, 1, now);
assert(!canReuse({ weight: 100 }, legacySnapshot, unsupported), "A newly required supported push invalidates the old plan");
console.log("PASS weekly coverage across every Pro schedule, monotonic set budgets, and compatible legacy member plans");

console.log(
  `PASS training engine: ${plans} valid programme combinations; ${checks} assertions; equipment, recovery, scope, deterministic plans, escaping, media`,
);
