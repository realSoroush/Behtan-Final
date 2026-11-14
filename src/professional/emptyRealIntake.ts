import type { RealIntake } from './menuPlan.ts';

export function emptyRealIntake(): RealIntake {
  return {
    display_name: "",
    phone: "",
    gender: "female",
    birth_date: "",
    height_cm: 0,
    weight_kg: 0,
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
