import type {
  EatingDisorderStatus,
  Gender,
  Goal,
  MedicalConditionsJson,
  OnboardingData,
  PregnancyStatus,
  UserProfile,
  WeightLossSpeed,
} from '@/types';
import { tryCalculateAge } from './nutritionHelpers.ts';

export const MEDICAL_SAFETY_SCREENING_VERSION = 1;
export const UNDERWEIGHT_BMI = 18.5;
export const EXTREME_LOW_BMI = 16;
export const HIGH_RISK_BMI = 40;
export const EXTREME_HIGH_BMI = 50;

export type MedicalEligibilityStatus =
  | 'needs_screening'
  | 'blocked'
  | 'eligible_with_caution'
  | 'eligible';

export type MedicalSafetyCode =
  | 'screening_incomplete'
  | 'invalid_physical_data'
  | 'unsupported_age'
  | 'pregnancy'
  | 'breastfeeding'
  | 'active_eating_disorder'
  | 'diabetes'
  | 'kidney_disease'
  | 'heart_disease'
  | 'advanced_liver_disease'
  | 'extreme_low_bmi'
  | 'underweight_weight_loss'
  | 'extreme_high_bmi'
  | 'high_risk_bmi'
  | 'eating_disorder_history'
  | 'medical_condition_present'
  | 'medication_review';

export interface MedicalSafetyMessage {
  code: MedicalSafetyCode;
  title: string;
  detail: string;
}

export interface MedicalEligibilityResult {
  status: MedicalEligibilityStatus;
  canGenerateAutomaticPlan: boolean;
  fastWeightLossAllowed: boolean;
  bmi: number | null;
  age: number | null;
  blockers: MedicalSafetyMessage[];
  cautions: MedicalSafetyMessage[];
}

interface MedicalEligibilityInput {
  gender: Gender | null;
  birthDate: string | null;
  heightCm: number | null;
  weightKg: number | null;
  goal: Goal | null;
  medical: MedicalConditionsJson | null;
  referenceDate?: Date;
}

const HARD_STOP_CONDITIONS: Readonly<Record<string, MedicalSafetyMessage>> = {
  diabetes: {
    code: 'diabetes',
    title: 'دیابت',
    detail: 'مقدار و زمان‌بندی کربوهیدرات باید با دارو یا انسولین هماهنگ شود؛ برنامه عمومی خودکار برای این وضعیت کافی نیست.',
  },
  kidney_disease: {
    code: 'kidney_disease',
    title: 'بیماری کلیه',
    detail: 'مقدار پروتئین، سدیم، پتاسیم و مایعات باید بر اساس وضعیت کلیه و آزمایش‌ها تنظیم شود.',
  },
  heart_disease: {
    code: 'heart_disease',
    title: 'بیماری قلبی یا نارسایی قلبی',
    detail: 'برنامه غذایی باید با داروها، فشار خون و محدودیت احتمالی سدیم یا مایعات هماهنگ شود.',
  },
  advanced_liver_disease: {
    code: 'advanced_liver_disease',
    title: 'بیماری پیشرفته کبدی',
    detail: 'نیاز انرژی و پروتئین در بیماری پیشرفته کبدی باید به‌صورت بالینی ارزیابی شود.',
  },
};

function makeResult(
  status: MedicalEligibilityStatus,
  bmi: number | null,
  age: number | null,
  blockers: MedicalSafetyMessage[],
  cautions: MedicalSafetyMessage[]
): MedicalEligibilityResult {
  return {
    status,
    canGenerateAutomaticPlan: status === 'eligible' || status === 'eligible_with_caution',
    fastWeightLossAllowed:
      (status === 'eligible' || status === 'eligible_with_caution') && cautions.length === 0,
    bmi,
    age,
    blockers,
    cautions,
  };
}

function isScreeningComplete(
  gender: Gender | null,
  medical: MedicalConditionsJson | null
): boolean {
  if (!medical) return false;
  if (medical.safetyScreeningVersion !== MEDICAL_SAFETY_SCREENING_VERSION) return false;
  if (medical.safetyAnswersConfirmed !== true) return false;
  if (!medical.eatingDisorderStatus) return false;
  if (gender === 'female') {
    return medical.pregnancyStatus === 'not_pregnant'
      || medical.pregnancyStatus === 'pregnant'
      || medical.pregnancyStatus === 'breastfeeding';
  }
  return medical.pregnancyStatus === 'not_applicable';
}

export function evaluateMedicalEligibility(input: MedicalEligibilityInput): MedicalEligibilityResult {
  const { gender, birthDate, heightCm, weightKg, goal, medical, referenceDate } = input;
  const validPhysicalData =
    Number.isFinite(heightCm) && Number.isFinite(weightKg) &&
    (heightCm ?? 0) > 0 && (weightKg ?? 0) > 0;
  const bmi = validPhysicalData
    ? (weightKg as number) / (((heightCm as number) / 100) ** 2)
    : null;
  const age = birthDate ? tryCalculateAge(birthDate, referenceDate) : null;

  if (!isScreeningComplete(gender, medical)) {
    return makeResult('needs_screening', bmi, age, [{
      code: 'screening_incomplete',
      title: 'ارزیابی ایمنی کامل نشده است',
      detail: 'پیش از ساخت برنامه غذایی باید چند سؤال پزشکی کوتاه پاسخ داده و تأیید شوند.',
    }], []);
  }

  const blockers: MedicalSafetyMessage[] = [];
  const cautions: MedicalSafetyMessage[] = [];

  if (!validPhysicalData || bmi === null) {
    blockers.push({
      code: 'invalid_physical_data',
      title: 'اطلاعات جسمی نامعتبر است',
      detail: 'قد و وزن معتبر برای ارزیابی ایمنی و ساخت برنامه لازم است.',
    });
  }

  if (age === null) {
    blockers.push({
      code: 'unsupported_age',
      title: 'سن خارج از محدوده پشتیبانی',
      detail: 'نسخه فعلی به‌تن فقط برای بزرگسالان ۱۸ تا ۷۰ سال طراحی شده است.',
    });
  }

  const pregnancyStatus: PregnancyStatus | null | undefined = medical?.pregnancyStatus;
  if (pregnancyStatus === 'pregnant') {
    blockers.push({
      code: 'pregnancy',
      title: 'بارداری',
      detail: 'در دوران بارداری، هدف انرژی و روند وزن باید توسط پزشک یا متخصص تغذیه تعیین شود.',
    });
  }
  if (pregnancyStatus === 'breastfeeding') {
    blockers.push({
      code: 'breastfeeding',
      title: 'شیردهی',
      detail: 'نیاز انرژی و مواد مغذی در دوران شیردهی فردی است و برنامه عمومی خودکار مناسب نیست.',
    });
  }

  const eatingDisorderStatus: EatingDisorderStatus | null | undefined = medical?.eatingDisorderStatus;
  if (eatingDisorderStatus === 'active_or_treatment') {
    blockers.push({
      code: 'active_eating_disorder',
      title: 'اختلال خوردن فعال یا تحت درمان',
      detail: 'محدودیت کالری و پیگیری وزن باید فقط در هماهنگی با تیم درمان انجام شود.',
    });
  } else if (eatingDisorderStatus === 'history') {
    cautions.push({
      code: 'eating_disorder_history',
      title: 'سابقه اختلال خوردن',
      detail: 'حالت کاهش وزن سریع غیرفعال شده است؛ در صورت بازگشت علائم، برنامه را متوقف و با متخصص صحبت کنید.',
    });
  }

  for (const condition of medical?.conditions ?? []) {
    const blocker = HARD_STOP_CONDITIONS[condition];
    if (blocker) blockers.push(blocker);
  }

  if (bmi !== null) {
    if (bmi < EXTREME_LOW_BMI) {
      blockers.push({
        code: 'extreme_low_bmi',
        title: 'وزن بسیار پایین نسبت به قد',
        detail: 'پیش از هر برنامه تغییر وزن، ارزیابی حضوری پزشک یا متخصص تغذیه لازم است.',
      });
    } else if (goal === 'weight_loss' && bmi < UNDERWEIGHT_BMI) {
      blockers.push({
        code: 'underweight_weight_loss',
        title: 'کاهش وزن برای این BMI ایمن نیست',
        detail: 'به‌تن برای فردی با BMI کمتر از ۱۸٫۵ برنامه کاهش وزن خودکار صادر نمی‌کند.',
      });
    } else if (bmi >= EXTREME_HIGH_BMI) {
      blockers.push({
        code: 'extreme_high_bmi',
        title: 'BMI در محدوده نیازمند ارزیابی بالینی',
        detail: 'در این محدوده، بیماری‌های همراه و داروها باید پیش از تعیین کسری کالری بررسی شوند.',
      });
    } else if (bmi >= HIGH_RISK_BMI) {
      cautions.push({
        code: 'high_risk_bmi',
        title: 'BMI بالا',
        detail: 'حالت کاهش وزن سریع غیرفعال شده و بررسی فشار خون، قند خون و وضعیت عمومی توسط پزشک توصیه می‌شود.',
      });
    }
  }

  const nonBlockingConditions = (medical?.conditions ?? []).filter(
    (condition) => !HARD_STOP_CONDITIONS[condition]
  );
  if (nonBlockingConditions.length > 0) {
    cautions.push({
      code: 'medical_condition_present',
      title: 'شرایط پزشکی ثبت‌شده',
      detail: 'برنامه محافظه‌کارانه‌تر می‌شود؛ پیگیری درمان و توصیه پزشک باید در اولویت بماند.',
    });
  }

  if ((medical?.medications ?? '').trim().length > 0) {
    cautions.push({
      code: 'medication_review',
      title: 'مصرف دارو',
      detail: 'حالت کاهش وزن سریع غیرفعال شده است. دارو را بدون نظر پزشک تغییر یا قطع نکنید.',
    });
  }

  if (blockers.length > 0) return makeResult('blocked', bmi, age, blockers, cautions);
  if (cautions.length > 0) return makeResult('eligible_with_caution', bmi, age, [], cautions);
  return makeResult('eligible', bmi, age, [], []);
}

function onboardingMedicalJson(data: OnboardingData): MedicalConditionsJson {
  return {
    conditions: data.medicalConditions,
    injuries: data.injuries,
    medications: data.medications,
    pregnancyStatus: data.gender === 'male' ? 'not_applicable' : data.pregnancyStatus,
    eatingDisorderStatus: data.eatingDisorderStatus,
    safetyScreeningVersion: data.safetyScreeningVersion,
    safetyAnswersConfirmed: data.safetyAnswersConfirmed,
  };
}

export function evaluateOnboardingMedicalEligibility(
  data: OnboardingData,
  referenceDate?: Date
): MedicalEligibilityResult {
  return evaluateMedicalEligibility({
    gender: data.gender,
    birthDate: data.birthDate,
    heightCm: data.height,
    weightKg: data.weight,
    goal: data.goal,
    medical: onboardingMedicalJson(data),
    referenceDate,
  });
}

export function evaluateProfileMedicalEligibility(
  profile: UserProfile,
  referenceDate?: Date
): MedicalEligibilityResult {
  return evaluateMedicalEligibility({
    gender: profile.gender,
    birthDate: profile.birth_date,
    heightCm: profile.height,
    weightKg: profile.weight,
    goal: profile.goal,
    medical: profile.medical_conditions_json,
    referenceDate,
  });
}

export function resolveSafeWeightLossSpeed(
  requested: WeightLossSpeed | null | undefined,
  eligibility: MedicalEligibilityResult
): WeightLossSpeed {
  const normalized = requested ?? 'standard';
  return normalized === 'fast' && !eligibility.fastWeightLossAllowed ? 'standard' : normalized;
}
