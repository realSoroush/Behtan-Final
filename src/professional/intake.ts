import type {
  ActivityLevel,
  Allergy,
  EatingDisorderStatus,
  Gender,
  Goal,
  MedicalCondition,
  PregnancyStatus,
  ProteinBudgetPreference,
  VegetarianStatus,
} from "@/types";
import { evaluateMedicalEligibility } from "../utils/medicalEligibility.ts";

export interface CaseIntake {
  gender: Gender;
  birth_date: string;
  height_cm: number;
  weight_kg: number;
  goal: Goal;
  activity_level: ActivityLevel;
  workout_days: number;
  training_type: "none" | "cardio" | "resistance" | "mixed";
  protein_budget: ProteinBudgetPreference;
  vegetarian_status: VegetarianStatus;
  allergies: Allergy[];
  medical_conditions: MedicalCondition[];
  pregnancy_status: PregnancyStatus;
  eating_disorder_status: EatingDisorderStatus;
  medications_present: boolean;
  injuries_present: boolean;
  safety_confirmed: boolean;
  screening_version: 1;
}
export interface CaseRecord {
  id: string;
  organization_id: string;
  case_code: string;
  created_at: string;
}
export interface IntakeRevision {
  revision: number;
  answers: CaseIntake;
  recorded_at: string;
  recorded_by: string;
}
export interface CaseAccess {
  can_edit: boolean;
  can_manage: boolean;
  has_processing: boolean;
}
export type PermissionPurpose =
  | "processing"
  | "relationship"
  | "progress_sharing";
export interface CasePermission {
  id: string;
  purpose: PermissionPurpose;
  decision: "grant" | "revoke";
  expires_at: string | null;
  sequence: number;
  occurred_at: string;
}
export interface CaseAssignment {
  practitioner_id: string;
  status: "active" | "revoked";
}
export function syntheticIntake(): CaseIntake {
  return {
    gender: "female",
    birth_date: "1992-04-23",
    height_cm: 155,
    weight_kg: 85,
    goal: "weight_loss",
    activity_level: "sedentary",
    workout_days: 0,
    training_type: "none",
    protein_budget: "economic",
    vegetarian_status: "none",
    allergies: [],
    medical_conditions: [],
    pregnancy_status: "not_pregnant",
    eating_disorder_status: "none",
    medications_present: false,
    injuries_present: false,
    safety_confirmed: false,
    screening_version: 1,
  };
}
export function intakeEligibility(a: CaseIntake, referenceDate?: Date) {
  return evaluateMedicalEligibility({
    gender: a.gender,
    birthDate: a.birth_date,
    heightCm: a.height_cm,
    weightKg: a.weight_kg,
    goal: a.goal,
    referenceDate,
    medical: {
      conditions: a.medical_conditions,
      injuries: a.injuries_present ? "reported" : "",
      medications: a.medications_present ? "reported" : "",
      pregnancyStatus: a.pregnancy_status,
      eatingDisorderStatus: a.eating_disorder_status,
      safetyAnswersConfirmed: a.safety_confirmed,
      safetyScreeningVersion: a.screening_version,
    },
  });
}
export function permissionState(
  events: CasePermission[],
  purpose: PermissionPurpose,
  now = Date.now(),
): "missing" | "granted" | "revoked" | "expired" {
  const last = events
    .filter((e) => e.purpose === purpose)
    .sort((a, b) => b.sequence - a.sequence)[0];
  if (!last) return "missing";
  if (last.decision === "revoke") return "revoked";
  return last.expires_at && Date.parse(last.expires_at) > now
    ? "granted"
    : "expired";
}

export function proNutritionDraftAllowed(a:CaseIntake,referenceDate=new Date()):boolean {
 const born=new Date(a.birth_date+'T12:00:00Z'),age=referenceDate.getUTCFullYear()-born.getUTCFullYear()-(referenceDate.getUTCMonth()<born.getUTCMonth()||(referenceDate.getUTCMonth()===born.getUTCMonth()&&referenceDate.getUTCDate()<born.getUTCDate())?1:0);
 return Number.isFinite(age)&&age>=18&&age<=70&&a.safety_confirmed&&a.pregnancy_status!=='pregnant'&&a.pregnancy_status!=='breastfeeding'
 &&a.eating_disorder_status==='none'&&!a.medical_conditions.some(c=>['kidney_disease','advanced_liver_disease','heart_disease','diabetes'].includes(c));
}
