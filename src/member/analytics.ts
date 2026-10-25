import {createUuid} from "../utils/createUuid";
import { supabase } from "../lib/supabaseClient";
export type ProductEvent =
  | "app_open"
  | "onboarding_step"
  | "onboarding_complete"
  | "paywall_view"
  | "preflight_ok"
  | "preflight_failed"
  | "checkout_started"
  | "meal_recorded"
  | "meal_undone"
  | "meal_skipped"
  | "meal_changed"
  | "food_manual"
  | "food_scan"
  | "progress_saved"
  | "training_view"
  | "training_generated"
  | "pro_signup";
let session = "";
try {
  session = sessionStorage.getItem("behtan.session") ?? createUuid();
  sessionStorage.setItem("behtan.session", session);
} catch {
  session = createUuid();
}
// Allowlisted scalar dimensions only: never health values, names, phones, text, photos or JWTs.
export function track(
  event: ProductEvent,
  dimensions: { step?: number; source?: string } = {},
) {
  void supabase
    .rpc("record_product_event", {
      p_id: createUuid(),
      p_session: session,
      p_event: event,
      p_step: dimensions.step ?? null,
      p_source: dimensions.source ?? "app",
    })
    .then(
      () => {},
      () => {},
    );
}
