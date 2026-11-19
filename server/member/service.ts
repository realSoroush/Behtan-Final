import { processWeightReview } from './weightReview.ts';
import { mealStructureFor } from '../../src/utils/mealSettings.ts';
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
import type { TrainingPlan } from "../../src/training/types.ts";
import { canReuseMemberTraining, eligibleMemberTrainingInput, trainingProfile } from "./trainingProfile.ts";
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
    if (action === "weight_review") return processWeightReview(admin, user, input);
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
      const nutrition = await readNutritionContext(admin, AbortSignal.timeout(12000));
      const { catalog, policy, revision } = nutrition;
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
            mealStructure: mealStructureFor(profile.meal_settings), proteinPrices: nutrition.proteinPrices,
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
      if (stored) {
        const plan = stored.plan as TrainingPlan;
        if (!canReuseMemberTraining(plan, stored.profile_hash, profile)) return { plan: null, outdated: true };
        return { plan, created_at: stored.created_at };
      }
      // A paid order carries the exact plan approved before checkout. Recover it after redirects as well.
      const approved = await rpc("member_activate_training", { p_user: user }) as TrainingPlan | null;
      if (!approved) return { plan: null, needsPreparation: true };
      if (!eligibleMemberTrainingInput(approved, profile)) return { plan: null, outdated: true };
      return { plan: approved };
    }
    throw Error("INVALID_REQUEST");
  };
}
