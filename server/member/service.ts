import { intakeDependencies, processMemberIntake } from './mealIntake.ts';
import { mealScheduleDependencies, processMemberMealSchedule } from "./mealSchedule.ts";
import { createClient } from "@supabase/supabase-js";
import { readNutritionContext } from "../../src/utils/nutritionContext.ts";
import {
  createMealPlanEngine,
} from "../../src/utils/mealPlanEngine.ts";
import {
  memberNutrition,
  memberTrainingEligible,
} from "../../src/member/nutrition.ts";
import type { UserProfile } from "../../src/types/index.ts";
import { buildTrainingPlan } from "../../src/training/engine.ts";
import type { TrainingProfile } from "../../src/training/types.ts";
function canonical(value: unknown): string {
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
 return JSON.stringify(value);
}
function trainingProfile(profile: UserProfile): TrainingProfile {
  const medical = profile.medical_conditions_json;
  const p: TrainingProfile = {
        display_name: profile.display_name || "عضو به‌تن",
        gender: profile.gender!,
        birth_date: profile.birth_date!,
        height_cm: profile.height!,
        weight_kg: profile.weight!,
        goal: profile.goal!,
        workout_days: profile.workout_days ?? 0,
        medical_conditions: medical?.conditions ?? [],
        medications_present: Boolean(medical?.medications?.trim()),
        injuries_present: Boolean(medical?.injuries?.trim()),
        pregnancy_status: medical?.pregnancyStatus ?? "not_applicable",
        eating_disorder_status: medical?.eatingDisorderStatus ?? "none",
        safety_confirmed: medical?.safetyAnswersConfirmed === true,
        screening_version: 1,
      };

  return p;
}
export function memberService() {
  const url = process.env.VITE_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY,
    anon = process.env.VITE_SUPABASE_ANON_KEY;
  if (!url || !key || !anon || process.env.MEMBER_RELEASE_ENABLED !== "true")
    throw Error("سرویس نسخه جدید هنوز فعال نشده است.");
  const opts = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(15000),
        }),
    },
  };
  const admin = createClient(url, key, opts),
    auth = createClient(url, anon, opts);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const r = await admin.rpc(name, args);
    if (r.error) {if(r.error.message.includes("PROFILE_CHANGED"))throw Error("PROFILE_CHANGED");throw Error("ثبت درخواست معتبر ممکن نشد. دوباره تلاش کن.");}
    return r.data;
  };
  return async (token: string, action: string, input: unknown) => {
    const { data, error } = await auth.auth.getUser(token);
    if (error || !data.user?.phone_confirmed_at || !data.user.phone)
      throw Error("AUTH_REQUIRED");
    const user = data.user.id;
    if (action === "meal_intake") return processMemberIntake(user, input, intakeDependencies(admin));
    if (action === "meal_schedule") return processMemberMealSchedule(user, input, mealScheduleDependencies(admin, url));
    const profileResult = await admin
      .from("user_profiles")
      .select("*")
      .eq("id", user)
      .single();
    if (profileResult.error) throw Error("اطلاعات پروفایل کامل نیست.");
    const profile = profileResult.data as UserProfile;
    if (
      ["preflight", "training"].includes(action) &&
      (await rpc("member_reserve_compute", {
        p_user: user,
        p_action: action,
      })) !== true
    )
      throw Error("RATE_LIMITED");
    if (action === "preflight") {
      const trainingEligible = memberTrainingEligible(profile);
      if (
        input &&
        typeof input === "object" &&
        "training" in input &&
        input.training === true &&
        !trainingEligible
      )
        throw Error("TRAINING_REVIEW_REQUIRED");
      let trainingPlan = null;
      if(input && typeof input==='object' && 'training' in input && input.training===true){
        const trainingInput = 'trainingInput' in input ? input.trainingInput : null;
        trainingPlan = buildTrainingPlan(trainingProfile(profile), trainingInput, 1);
      }
      const { catalog, policy, revision } = await readNutritionContext(admin, AbortSignal.timeout(12000));
      const engine = createMealPlanEngine(catalog, revision);
      const plans = [false, true].map((workout) =>
        engine.generateDailyMealPlan(
          memberNutrition(profile, policy, workout).targets,
          profile.weight!,
          profile.dietary_preferences_json!,
          workout,
          new Date().toISOString().slice(0, 10),
          {
            proteinBudgetPreference:
              profile.protein_budget_preference ?? "performance",
          },
        ),
      );
      const id = await rpc("member_store_preflight", {
        p_user: user,
        p_revision: revision,
        p_plan: plans[0],
        p_training: trainingPlan !== null,
        p_profile: profile,
        p_training_plan: trainingPlan,
      });
      return { id, targets: plans[0].targets };
    }
    if (action === "training") {
      if ((await rpc("member_training_access", { p_user: user })) !== true)
        throw Error("TRAINING_LOCKED");
      const p = trainingProfile(profile);
      const plan = buildTrainingPlan(p, input, 1);
      await rpc("member_store_training", {
        p_user: user,
        p_plan: plan,
        p_hash: JSON.stringify({...p,workout_days:plan.input.days.length}),
        p_expected: profile,
      });
      return { plan };
    }
    if (action === "training_history") {
      if ((await rpc("member_training_access", { p_user: user })) !== true)
        throw Error("TRAINING_LOCKED");
      const r = await admin
        .from("member_training_plans")
        .select("plan,created_at,profile_hash")
        .eq("user_id", user)
        .maybeSingle();
      if (r.error) throw Error("دریافت تمرین انجام نشد.");
      const stored = r.data;
      if(stored && canonical(JSON.parse(stored.profile_hash))!==canonical(Object.fromEntries(Object.entries(profile).filter(([key])=>key!=='updated_at')))) return {plan:null,outdated:true};
      if(stored) return stored;
      // A paid order carries the exact plan approved before checkout. Recover it after redirects as well.
      const approved = await rpc('member_activate_training',{p_user:user});
      return approved ? {plan:approved} : {plan:null,needsPreparation:true};
    }
    throw Error("INVALID_REQUEST");
  };
}
