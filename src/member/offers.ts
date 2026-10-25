import type { SubscriptionPlan } from "../types/index.ts";
export function periodOffer(
  plan: SubscriptionPlan,
  days: 14 | 30,
): SubscriptionPlan {
  return plan.code === "trial"
    ? { ...plan, priceToman: 0, durationDays: 3, priceNote: "۳ روز" }
    : {
        ...plan,
        priceToman:
          days === 14 ? Math.ceil(plan.priceToman / 2) : plan.priceToman,
        durationDays: days,
        priceNote: days === 14 ? "دو هفته" : "ماهانه",
      };
}
