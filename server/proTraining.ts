import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import {
  buildTrainingPlan,
  parseTrainingInput,
  TrainingError,
} from "../src/training/engine.ts";
import type { TrainingPlan } from "../src/training/types.ts";
import type { RealIntake } from "../src/professional/menuPlan.ts";
import { ProServerError } from "./proPlanService.ts";
export interface TrainingDeps {
  verify(token: string): Promise<string>;
  context(
    args: Record<string, unknown>,
  ): Promise<{ answers?: RealIntake; id?: string; plan?: TrainingPlan }>;
  stage(
    args: Record<string, unknown>,
  ): Promise<{ id: string; plan: TrainingPlan }>;
}
export function trainingDependencies(): TrainingDeps {
  const url = process.env.VITE_SUPABASE_URL,
    anon = process.env.VITE_SUPABASE_ANON_KEY,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.PRO_TRAINING_ENABLED !== "true" || !url || !anon || !key)
    throw new ProServerError("PRO_TRAINING_NOT_CONFIGURED", 503);
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  };
  const admin = createClient(url, key, options),
    auth = createClient(url, anon, options);
  async function call<T>(
    name: string,
    args: Record<string, unknown>,
  ): Promise<T> {
    const { data, error } = await admin
      .rpc(name, args)
      .abortSignal(AbortSignal.timeout(12000))
      .retry(false);
    if (error) {
      const code = /PRO_[A-Z_]+/.exec(error.message)?.[0];
      throw new ProServerError(
        code ??
          (error.code === "PGRST202"
            ? "PRO_MIGRATION_REQUIRED"
            : "PRO_CONNECTION_ERROR"),
        code === "PRO_ACCESS_DENIED"
          ? 403
          : code === "PRO_GENERATION_LIMIT"
            ? 429
            : code
              ? 409
              : 503,
      );
    }
    return data as T;
  }
  return {
    verify: async (token) => {
      const { data, error } = await auth.auth.getUser(token);
      if (error || !data.user?.phone || !data.user.phone_confirmed_at)
        throw new ProServerError("PRO_AUTH_REQUIRED", 401);
      return data.user.id;
    },
    context: (a) => call("pro_training_context", a),
    stage: (a) => call("pro_stage_training", a),
  };
}
const uuid = (v: unknown) =>
  typeof v === "string" &&
  /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
    v,
  );
export async function processTrainingRequest(
  value: unknown,
  token: string,
  deps: TrainingDeps,
  now = new Date(),
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ProServerError("PRO_INVALID_REQUEST");
  const b = value as Record<string, unknown>;
  if (
    Object.keys(b).sort().join() !==
      ["org", "record", "revision", "key", "input"].sort().join() ||
    ![b.org, b.record, b.key].every(uuid) ||
    !Number.isSafeInteger(b.revision) ||
    Number(b.revision) < 1
  )
    throw new ProServerError("PRO_INVALID_REQUEST");
  try {
    const input = parseTrainingInput(b.input, true),
      actor = await deps.verify(token);
    const hash = createHash("sha256")
      .update(JSON.stringify({ revision: b.revision, input }))
      .digest("hex");
    const args = {
      p_actor: actor,
      p_org: b.org,
      p_record: b.record,
      p_revision: b.revision,
      p_key: b.key,
      p_hash: hash,
    };
    const ctx = await deps.context(args);
    if (ctx.plan && ctx.id) return { id: ctx.id, plan: ctx.plan };
    if (!ctx.answers) throw new ProServerError("PRO_CONNECTION_ERROR", 503);
    const plan = buildTrainingPlan(ctx.answers, input, Number(b.revision), now, true);
    return await deps.stage({ ...args, p_plan: plan });
  } catch (e) {
    if (e instanceof TrainingError) throw new ProServerError(e.code, 422);
    throw e;
  }
}
