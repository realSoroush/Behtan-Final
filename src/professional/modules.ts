export type ProModules = { nutrition: boolean; training: boolean; body: true };
export interface ProOffer {
  code: "nutrition" | "training" | "combined";
  title: string;
  subtitle: string;
  features: string[];
  prices: Record<string, number>;
  revision: number;
  active?: boolean;
}
export const DURATIONS = [
  { months: 1, label: "یک ماهه" },
  { months: 3, label: "سه ماهه" },
  { months: 6, label: "شش ماهه" },
  { months: 12, label: "یک ساله" },
];
export const offerPrice = (offer: ProOffer, months: number) =>
  offer.prices[String(months)];
