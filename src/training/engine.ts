import { EXERCISES } from "./catalog.ts";
import type {
  Equipment,
  Pattern,
  TrainingInput,
  TrainingPlan,
  TrainingLine,
  TrainingProfile,
} from "./types.ts";
import { evaluateMedicalEligibility } from "../utils/medicalEligibility.ts";
export const EQUIPMENT: Record<Equipment, string> = {
  dumbbells: "یک جفت دمبل قابل‌کنترل",
  long_band: "کش بلند مقاومتی سالم",
  stable_platform: "نیمکت محکم و ثابت (برای نشستن و تکیه دست)",
  chest_press: "دستگاه پرس سینه",
  leg_press: "دستگاه پرس پا",
  leg_curl: "دستگاه پشت پا نشسته",
  seated_row: "سیم‌کش پارویی",
  lat_pulldown: "سیم‌کش لت",
};
export const WEEKDAYS = [
  "شنبه",
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
];
export class TrainingError extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
    this.name = "TrainingError";
  }
}
const fail = (s: string): never => {
  throw new TrainingError(s);
};
function exact(x: Record<string, unknown>, fields: string[]) {
  if (Object.keys(x).sort().join() !== fields.sort().join())
    fail("TRAINING_INVALID_INPUT");
}
export function parseTrainingInput(value: unknown, professional = false): TrainingInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("TRAINING_INVALID_INPUT");
  const b = value as Record<string, unknown>;
  exact(b, [
    "version",
    "location",
    "experience",
    "goal",
    "days",
    "minutes",
    "equipment",
    "start_date",
    "screening",
  ]);
  if (
    b.version !== 1 ||
    !["home", "gym"].includes(String(b.location)) ||
    !["beginner", "returning", "regular"].includes(String(b.experience)) ||
    !["general", "muscle"].includes(String(b.goal)) ||
    (professional ? (!Number.isInteger(b.minutes) || Number(b.minutes)<15 || Number(b.minutes)>180) : ![45, 60].includes(Number(b.minutes))) ||
    typeof b.minutes !== "number"
  )
    return fail("TRAINING_INVALID_INPUT");
  if (
    !Array.isArray(b.days) ||
    (professional ? b.days.length<1 || b.days.length>7 : ![2, 3].includes(b.days.length)) ||
    b.days.some((x) => !Number.isInteger(x) || x < 0 || x > 6) ||
    new Set(b.days).size !== b.days.length
  )
    return fail("TRAINING_DAYS");
  const days = [...b.days].sort((a, b) => a - b) as number[];
  if (!professional && days.some((d, i) => (days[(i + 1) % days.length] - d + 7) % 7 < 2))
    return fail("TRAINING_RECOVERY");
  if (
    !Array.isArray(b.equipment) ||
    b.equipment.length > 8 ||
    new Set(b.equipment).size !== b.equipment.length ||
    b.equipment.some(
      (x) =>
        typeof x !== "string" ||
        !Object.prototype.hasOwnProperty.call(EQUIPMENT, x),
    )
  )
    return fail("TRAINING_INVALID_INPUT");
  if (
    b.location === "home" &&
    b.equipment.some(
      (x) => !["dumbbells", "long_band", "stable_platform"].includes(x),
    )
  )
    return fail("TRAINING_INVALID_INPUT");
  if (
    typeof b.start_date !== "string" ||
    !/^20\d{2}-\d{2}-\d{2}$/.test(b.start_date) ||
    !Number.isFinite(Date.parse(b.start_date + "T12:00:00Z")) ||
    new Date(b.start_date + "T12:00:00Z").toISOString().slice(0, 10) !==
      b.start_date
  )
    return fail("TRAINING_INVALID_INPUT");
  if (
    !b.screening ||
    typeof b.screening !== "object" ||
    Array.isArray(b.screening)
  )
    return fail("TRAINING_INVALID_INPUT");
  const s = b.screening as Record<string, unknown>;
  exact(s, ["confirmed", "symptoms", "pain", "restriction", "recent_surgery"]);
  if (Object.values(s).some((x) => typeof x !== "boolean"))
    return fail("TRAINING_INVALID_INPUT");
  return {
    version: 1,
    location: b.location,
    experience: b.experience,
    goal: b.goal,
    days,
    minutes: b.minutes,
    equipment: [...b.equipment].sort(),
    start_date: b.start_date,
    screening: {
      confirmed: s.confirmed,
      symptoms: s.symptoms,
      pain: s.pain,
      restriction: s.restriction,
      recent_surgery: s.recent_surgery,
    },
  } as TrainingInput;
}
export function trainingEligibility(
  a: TrainingProfile,
  input: TrainingInput,
  now: Date,
  professional = false,
): void {
  // Current date, never a caller-selected start date, determines age and safety.
  if (!Number.isFinite(now.getTime())) fail("TRAINING_INVALID_INPUT");
  if (!input.screening.confirmed || !a.safety_confirmed)
    fail("TRAINING_SCREENING_REQUIRED");
  if (professional) {
    // Pro can draft for stable conditions/medications; never synthesize a generic
    // workout for unresolved exertional symptoms, explicit restriction or recovery.
    const born = new Date(a.birth_date+'T12:00:00Z');
    const age = now.getUTCFullYear()-born.getUTCFullYear()-(now.getUTCMonth()<born.getUTCMonth()||(now.getUTCMonth()===born.getUTCMonth()&&now.getUTCDate()<born.getUTCDate())?1:0);
    if (!Number.isFinite(age) || age<18 || a.pregnancy_status==='pregnant' || a.pregnancy_status==='breastfeeding'
      || a.eating_disorder_status==='active_or_treatment' || input.screening.symptoms || input.screening.restriction || input.screening.recent_surgery || input.screening.pain || a.injuries_present)
      fail('TRAINING_SPECIALIST_AUTHORING');
    if (!Number.isFinite(a.height_cm)||!Number.isFinite(a.weight_kg)||a.height_cm<=0||a.weight_kg<=0) fail('TRAINING_INVALID_INPUT');
  }
  if (!professional && Object.entries(input.screening).some(([k, v]) => k !== "confirmed" && v))
    fail("TRAINING_REVIEW_REQUIRED");
  const birth = new Date(a.birth_date + "T12:00:00Z");
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  if (
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() &&
      now.getUTCDate() < birth.getUTCDate())
  )
    age--;
  if (
    !Number.isFinite(birth.getTime()) ||
    birth.toISOString().slice(0, 10) !== a.birth_date ||
    age < 18 ||
    (!professional && age > 64)
  )
    fail("TRAINING_SCOPE");
  if (
    !professional && !evaluateMedicalEligibility({
      gender: a.gender,
      birthDate: a.birth_date,
      heightCm: a.height_cm,
      weightKg: a.weight_kg,
      goal: a.goal,
      referenceDate: now,
      medical: {
        conditions: a.medical_conditions,
        injuries: a.injuries_present ? "reported" : "",
        medications: a.medications_present ? "reported" : "",
        pregnancyStatus: a.pregnancy_status,
        eatingDisorderStatus: a.eating_disorder_status,
        safetyAnswersConfirmed: a.safety_confirmed,
        safetyScreeningVersion: a.screening_version,
      },
    }).canGenerateAutomaticPlan
  )
    fail("TRAINING_REVIEW_REQUIRED");
  // V1 is a general-adult programme, not rehabilitation or condition-specific prescription.
  if (
    !professional && (a.medical_conditions.length ||
    a.medications_present ||
    a.injuries_present ||
    (a.gender === "female" && a.pregnancy_status !== "not_pregnant") ||
    a.eating_disorder_status !== "none")
  )
    fail("TRAINING_REVIEW_REQUIRED");
  if (
    !Number.isFinite(a.height_cm) ||
    !Number.isFinite(a.weight_kg) ||
    a.height_cm < 120 ||
    a.height_cm > 230 ||
    a.weight_kg < 35 ||
    a.weight_kg > 300
  )
    fail("TRAINING_INVALID_INPUT");
  if (
    input.equipment.includes("long_band") &&
    !input.equipment.some((e) =>
      ["dumbbells", "seated_row", "lat_pulldown", "stable_platform"].includes(
        e,
      ),
    )
  )
    fail("TRAINING_BAND_SEAT");
  if (
    !input.equipment.some((e) =>
      ["dumbbells", "long_band", "seated_row", "lat_pulldown"].includes(e),
    )
  )
    fail("TRAINING_PULL_EQUIPMENT");
  if (
    requiresSupportedPush(a) &&
    !input.equipment.includes("stable_platform") &&
    !input.equipment.includes("chest_press")
  )
    fail("TRAINING_SUPPORTED_PUSH");
}
function select(
  pattern: Pattern,
  input: TrainingInput,
  variant: number,
  conservative: boolean,
) {
  const ids: Partial<Record<Pattern, string[]>> = {
    squat:
      input.location === "gym"
        ? ["0739", "1760", "1004", "1685"]
        : conservative
          ? ["1685", "1760", "1004"]
          : ["1760", "1004", "1685"],
    hinge:
      input.location === "gym"
        ? ["0599", "1459", "3013", "1010"]
        : conservative
          ? ["3013", "1459", "1010"]
          : ["1459", "1010", "3013"],
    push:
      input.location === "gym"
        ? ["0577", "0493", "3211", "0662"]
        : conservative
          ? ["0493", "3211"]
          : ["0662", "0493", "3211"],
    pull:
      input.location === "gym"
        ? ["0180", "0818", "0293", "3144"]
        : ["0293", "3144"],
    core: ["0276"],
    calf: ["1373"],
    shoulder: ["0334", "0997", "0426"],
    arms: ["0313"],
  };
  const available = (ids[pattern] || [])
    .map((id) => EXERCISES.find((e) => e.id === id)!)
    .filter((e) => e.equipment.every((x) => input.equipment.includes(x)));
  if (!available.length) return fail("TRAINING_EQUIPMENT");
  // Alternate only between equivalent pulls; repeat fundamentals to support learning.
  return available[pattern === "pull" ? variant % available.length : 0];
}
/** Whether the engine uses the supported, lower-load starting template. */
export function usesConservativeTraining(a: TrainingProfile, input: TrainingInput) {
  return input.experience !== "regular" || requiresSupportedPush(a);
}

function requiresSupportedPush(a: TrainingProfile) {
  return a.weight_kg / (a.height_cm / 100) ** 2 >= 35;
}

function sessionSeconds(lines: TrainingLine[]) {
  return 8 * 60 + lines.reduce((seconds, line) => {
    const repSeconds = line.reps[1] * (line.per_side ? 2 : 1) * 3;
    return seconds + line.sets * repSeconds + (line.sets - 1) * line.rest_seconds + 60;
  }, 0);
}

/** Start with every required pattern, then add sets in a fixed priority order. */
function fitSession(required: TrainingLine[], optional: TrainingLine[], minutes: number, targetSets: number) {
  const budget = minutes * 60;
  const lines = [...required];
  if (sessionSeconds(lines) > budget) fail("TRAINING_TIME_BUDGET");

  for (let sets = 2; sets <= targetSets; sets++) {
    for (const line of lines) {
      if (line.exercise.pattern === "core" && sets > 2) continue;
      line.sets = sets;
      if (sessionSeconds(lines) > budget) {
        line.sets--;
        return lines;
      }
    }
  }

  // Accessories may use remaining time, without replacing the required work.
  for (const accessory of optional) {
    if (sessionSeconds([...lines, accessory]) > budget) break;
    lines.push(accessory);
    for (let sets = 2; sets <= targetSets; sets++) {
      accessory.sets = sets;
      if (sessionSeconds(lines) > budget) {
        accessory.sets--;
        return lines;
      }
    }
  }
  return lines;
}

export function buildTrainingPlan(
  a: TrainingProfile,
  raw: unknown,
  revision: number,
  now = new Date(),
  professional = false,
): TrainingPlan {
  const input = parseTrainingInput(raw, professional);
  trainingEligibility(a, input, now, professional);
  if (
    !Number.isInteger(revision) ||
    revision < 1 ||
    !a.display_name.trim() ||
    a.display_name.length > 80
  )
    fail("TRAINING_INVALID_INPUT");
  const conservative = usesConservativeTraining(a, input);
  const upper: Pattern[] = ["push", "pull"];
  const lower: Pattern[] = ["squat", "hinge", "calf", "core"];
  const fullBody: Pattern[] = ["squat", "push", "hinge", "pull", "core", "calf"];
  const split = professional && input.days.some(day => input.days.includes((day + 1) % 7));
  const start = new Date(input.start_date + "T12:00:00Z");
  const startDay = (start.getUTCDay() + 1) % 7;
  const scheduledDays = [...input.days].sort(
    (a, b) => ((a - startDay + 7) % 7) - ((b - startDay + 7) % 7),
  );
  const weeks = [1, 2, 3, 4].map((week) => ({
    week,
    sessions: scheduledDays.map((day, index) => {
      // Alternating upper/lower covers both in every split week, including two-day weeks.
      // Carry the alternation across weeks so consecutive sessions never share a split.
      const upperDay = ((week - 1) * scheduledDays.length + index) % 2 === 0;
      const patterns = split ? (upperDay ? upper : lower) : fullBody;
      const accessories: Pattern[] = [];
      if (split && upperDay) accessories.push("shoulder", "arms");
      if (!split && input.minutes >= 60 && input.goal === "muscle") accessories.push("shoulder");

      const createLine = (pattern: Pattern): TrainingLine => ({
        exercise: structuredClone(select(pattern, input, index, conservative)),
        sets: 1,
        reps: pattern === "core" ? [6, 10] : pattern === "calf" ? [10, 15] : [8, 12],
        per_side: pattern === "core",
        rest_seconds: ["core", "calf", "arms", "shoulder"].includes(pattern) ? 60 : 120,
        rir: week === 1 ? 4 : 3,
      });
      const availableAccessories = accessories.filter(pattern => EXERCISES.some(
        exercise => exercise.pattern === pattern && exercise.equipment.every(e => input.equipment.includes(e)),
      ));
      const targetSets = conservative ? (week === 1 ? 1 : 2) : (week < 3 ? 2 : 3);
      const lines = fitSession(patterns.map(createLine), availableAccessories.map(createLine), input.minutes, targetSets);
      const estimated_minutes = Math.ceil(sessionSeconds(lines) / 60);
      const sessionDate = new Date(start);
      sessionDate.setUTCDate(
        start.getUTCDate() + ((day - startDay + 7) % 7) + (week - 1) * 7,
      );
      return {
        day,
        date: sessionDate.toISOString().slice(0, 10),
        title: split ? (upperDay ? "تمرین بالاتنه" : "پایین‌تنه و میان‌تنه") : "تمرین تمام‌بدن " + String.fromCharCode(65 + index),
        estimated_minutes,
        lines,
      };
    }),
  }));
  return {
    version: 1,
    engine: "behtan-training-1.0",
    planning_revision: "weekly-coverage-v2",
    catalog: "basics-22-v1",
    created_at: now.toISOString(),
    display_name: a.display_name.trim(),
    intake_revision: revision,
    input,
    weeks,
    notes: [
      ...(professional ? ["این پیش‌نویس برای بازبینی متخصص است. بیماری و دارو به‌تنهایی موجب منع ساخت نشده‌اند؛ تناسب حرکات، حجم و شرایط مراجع باید بررسی شود."] : []),
      ...(a.workout_days !== input.days.length
        ? [
            "تعداد جلسات این برنامه با اطلاعات فعالیت پرونده متفاوت است؛ پیش از تنظیم برنامه غذایی روز تمرین، تعداد جلسات و نوع فعالیت پرونده را هماهنگ کن.",
          ]
        : []),
      "پیش از شروع، ۵ تا ۸ دقیقه راه‌رفتن آرام و حرکت سبک مفاصل؛ برای حرکت جدید یک ست تمرینی بسیار سبک انجام بده.",
      "ست‌های نوشته‌شده ست کاری‌اند. وزنه‌ای انتخاب کن که در پایان ست هنوز ۳ تا ۴ تکرار تمیز دیگر بتوانی انجام بدهی؛ تا ناتوانی ادامه نده.",
      "وزنه، ارتفاع سطح و دامنه را با توان فعلی تنظیم کن؛ اگر حداقل تکرار با کنترل ممکن نیست، مقاومت یا سختی حرکت را کمتر کن.",
      "بین جلسات تمام‌بدن دست‌کم یک روز بدون تمرین مقاومتی بگذار؛ جلسه ازدست‌رفته را با دو جلسه پشت سر هم جبران نکن.",
      "وقتی در دو جلسه متوالی همه ست‌ها به سقف تکرار رسیدند و هنوز دست‌کم ۳ تکرار ذخیره داشتی، کوچک‌ترین افزایش موجود تا حدود ۲ تا ۵ درصد را امتحان کن؛ افزایش بزرگ‌تر اجباری نیست.",
      "درد تیز، درد قفسه سینه، سرگیجه یا تنگی نفس غیرمعمول: تمرین را متوقف کن و ارزیابی مناسب بگیر. خستگی عضله با درد مفصل فرق دارد.",
      "این یک بلوک شروع چهار هفته‌ای است، نه برنامه بهینه بدنسازی حرفه‌ای. حجم بیشتر تنها بعد از بررسی تحمل و ریکاوری اضافه می‌شود.",
      "در کنار تمرین قدرتی، فعالیت هوازی را متناسب با توان و به‌تدریج افزایش بده؛ هدف عمومی WHO برای بزرگسالان ۱۵۰ تا ۳۰۰ دقیقه فعالیت متوسط در هفته است. این زمان در جلسات بالا محاسبه نشده است.",
    ],
    evidence: [
      "ACSM-2026-10.1249/MSS.0000000000003897",
      "WHO-2020-9789240015128",
      "EIM-preparticipation-screening",
    ],
  };
}
export function progressionAdvice(
  reps: number[],
  target: [number, number],
  rir: number,
  pain: boolean,
  priorAtTop: boolean,
): "stop" | "reduce" | "repeat" | "increase" {
  if (pain) return "stop";
  if (
    !reps.length ||
    reps.some((x) => !Number.isInteger(x) || x < 0) ||
    !Number.isFinite(rir) ||
    rir < 0 ||
    rir > 10
  )
    return "repeat";
  if (reps.some((x) => x < target[0]) || rir < 2) return "reduce";
  return priorAtTop && rir >= 3 && reps.every((x) => x >= target[1])
    ? "increase"
    : "repeat";
}
