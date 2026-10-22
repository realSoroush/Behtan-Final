export const views = ["front", "side", "back"] as const;
export type View = (typeof views)[number];
export const viewLabels: Record<View, string> = {
  front: "روبه‌رو",
  side: "نیم‌رخ",
  back: "پشت",
};
export const issueLabels = {
  framing: "تمام بدن در کادر نیست",
  lighting: "نور برای بررسی کافی نیست",
  loose_clothing: "لباس آزاد مرز بدن را می‌پوشاند",
  pose: "حالت ایستادن برای مقایسه مناسب نیست",
  multiple_people: "بیش از یک نفر در تصویر است",
  not_body: "تصویر بدن قابل بررسی نیست",
};
export type PhotoAssessment = {
  view: View;
  usable: boolean;
  issues: (keyof typeof issueLabels)[];
};
export type Measurements = {
  waist_cm?: number;
  hip_cm?: number;
  body_fat_pct?: number;
  body_fat_method?: "bia" | "dexa" | "caliper";
};
export interface BodyReport {
  version: 1;
  created_at: string;
  intake_revision: number;
  height_cm: number;
  weight_kg: number;
  bmi: number;
  measurements: Measurements;
  waist_height_ratio: number | null;
  waist_hip_ratio: number | null;
  fat_mass_kg: number | null;
  fat_free_mass_kg: number | null;
  photos: PhotoAssessment[];
  processor: "openai";
  model: string;
  consent_version: 1;
  photo_count: number;
}
export interface StoredBodyReport {
  id: string;
  intake_revision: number;
  created_at: string;
  report: BodyReport;
  approved_at: string | null;
}
export function validateMeasurements(x: unknown): Measurements {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("PRO_INVALID_REQUEST");
  const m = x as Record<string, unknown>;
  if (
    Object.keys(m).some(
      (k) =>
        !["waist_cm", "hip_cm", "body_fat_pct", "body_fat_method"].includes(k),
    )
  )
    throw new Error("PRO_INVALID_REQUEST");
  for (const [k, min, max] of [
    ["waist_cm", 30, 250],
    ["hip_cm", 40, 250],
    ["body_fat_pct", 3, 70],
  ] as const)
    if (
      m[k] !== undefined &&
      (typeof m[k] !== "number" ||
        !Number.isFinite(m[k]) ||
        m[k] < min ||
        m[k] > max)
    )
      throw new Error("PRO_INVALID_REQUEST");
  if (
    m.body_fat_pct !== undefined &&
    !["bia", "dexa", "caliper"].includes(String(m.body_fat_method))
  )
    throw new Error("PRO_SCAN_METHOD_REQUIRED");
  if (
    m.body_fat_method !== undefined &&
    (m.body_fat_pct === undefined ||
      !["bia", "dexa", "caliper"].includes(String(m.body_fat_method)))
  )
    throw new Error("PRO_INVALID_REQUEST");
  return m as Measurements;
}
export function makeBodyReport(
  height: number,
  weight: number,
  revision: number,
  m: Measurements,
  photos: PhotoAssessment[],
  model: string,
): BodyReport {
  if (
    !Number.isFinite(height) ||
    !Number.isFinite(weight) ||
    height < 100 ||
    height > 250 ||
    weight < 25 ||
    weight > 400
  )
    throw new Error("PRO_INVALID_REQUEST");
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    version: 1,
    created_at: new Date().toISOString(),
    intake_revision: revision,
    height_cm: height,
    weight_kg: weight,
    bmi: round(weight / (height / 100) ** 2),
    measurements: m,
    waist_height_ratio: m.waist_cm ? round(m.waist_cm / height) : null,
    waist_hip_ratio:
      m.waist_cm && m.hip_cm ? round(m.waist_cm / m.hip_cm) : null,
    fat_mass_kg:
      m.body_fat_pct !== undefined
        ? round((weight * m.body_fat_pct) / 100)
        : null,
    fat_free_mass_kg:
      m.body_fat_pct !== undefined
        ? round(weight * (1 - m.body_fat_pct / 100))
        : null,
    photos,
    processor: "openai",
    model,
    consent_version: 1,
    photo_count: photos.length,
  };
}
