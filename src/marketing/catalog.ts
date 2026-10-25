export type Offer = {
  code: string;
  title: string;
  subtitle: string;
  features: string[];
  prices: Record<string, number>;
};
export type MemberOffer = {
  code: string;
  name: string;
  features: string[];
  price_toman: number;
  duration_days: number;
};
const strings = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === "string");
const money = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
export function parsePro(value: unknown): Offer[] {
  if (!Array.isArray(value)) throw Error("INVALID_CATALOG");
  return value.map((v) => {
    if (
      !v ||
      typeof v.code !== "string" ||
      typeof v.title !== "string" ||
      typeof v.subtitle !== "string" ||
      !strings(v.features) ||
      !v.prices ||
      ![1, 3, 6, 12].every((m) => money(v.prices[m]))
    )
      throw Error("INVALID_CATALOG");
    return v as Offer;
  });
}
export function parseMember(value: unknown): MemberOffer[] {
  if (!Array.isArray(value)) throw Error("INVALID_CATALOG");
  return value.map((v) => {
    if (
      !v ||
      typeof v.code !== "string" ||
      typeof v.name !== "string" ||
      !strings(v.features) ||
      !money(v.price_toman) ||
      !Number.isInteger(v.duration_days) ||
      v.duration_days < 1
    )
      throw Error("INVALID_CATALOG");
    return v as MemberOffer;
  });
}
