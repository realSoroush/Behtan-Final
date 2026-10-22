import type {
  Gender,
  Goal,
  MedicalCondition,
  PregnancyStatus,
  EatingDisorderStatus,
} from "../types/index.ts";
// Shared engine contract; B2C and Pro adapt their stored profiles to these fields.
export interface TrainingProfile {
  display_name: string;
  gender: Gender;
  birth_date: string;
  height_cm: number;
  weight_kg: number;
  goal: Goal;
  workout_days: number;
  medical_conditions: MedicalCondition[];
  medications_present: boolean;
  injuries_present: boolean;
  pregnancy_status: PregnancyStatus;
  eating_disorder_status: EatingDisorderStatus;
  safety_confirmed: boolean;
  screening_version: 1;
}
export type Equipment =
  | "dumbbells"
  | "long_band"
  | "stable_platform"
  | "chest_press"
  | "leg_press"
  | "leg_curl"
  | "seated_row"
  | "lat_pulldown";
export type Pattern =
  | "squat"
  | "hinge"
  | "push"
  | "pull"
  | "core"
  | "calf"
  | "shoulder"
  | "arms";
export interface Exercise {
  id: string;
  name: string;
  sourceName: string;
  pattern: Pattern;
  equipment: Equipment[];
  muscles: string[];
  cues: string[];
  poster: string;
  animation: string;
}
export interface TrainingInput {
  version: 1;
  location: "home" | "gym";
  experience: "beginner" | "returning" | "regular";
  goal: "general" | "muscle";
  days: number[];
  minutes: number;
  equipment: Equipment[];
  start_date: string;
  screening: {
    confirmed: boolean;
    symptoms: boolean;
    pain: boolean;
    restriction: boolean;
    recent_surgery: boolean;
  };
}
export interface TrainingLine {
  exercise: Exercise;
  sets: number;
  reps: [number, number];
  per_side: boolean;
  rest_seconds: number;
  rir: number;
}
export interface TrainingSession {
  day: number;
  date: string;
  title: string;
  estimated_minutes: number;
  lines: TrainingLine[];
}
export interface TrainingWeek {
  week: number;
  sessions: TrainingSession[];
}
export interface TrainingPlan {
  version: 1;
  engine: "behtan-training-1.0";
  catalog: "basics-22-v1";
  created_at: string;
  display_name: string;
  intake_revision: number;
  input: TrainingInput;
  weeks: TrainingWeek[];
  notes: string[];
  evidence: string[];
}
export interface TrainingSnapshot {
  id: string;
  intake_revision: number;
  created_at: string;
  plan: TrainingPlan;
  approved_at: string | null;
}
