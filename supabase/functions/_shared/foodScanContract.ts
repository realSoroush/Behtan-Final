export interface ScannedFood {
  name: string;
  grams: number;
  kcalPer100: number;
  proteinPer100: number;
  carbsPer100: number;
  fatPer100: number;
  fiberPer100: number;
}
export interface FoodScanResult { foods: ScannedFood[]; confidence: 'low'|'medium'; note: string }
const bounded = (n: unknown, max: number) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= max;
export function parseFoodScanResult(value: unknown): FoodScanResult {
  if (!value || typeof value !== 'object') throw Error('پاسخ تحلیل معتبر نیست.');
  const v = value as FoodScanResult;
  if (!Array.isArray(v.foods) || v.foods.length > 12 || !['low','medium'].includes(v.confidence) || typeof v.note !== 'string' || v.note.length > 400) throw Error('پاسخ تحلیل معتبر نیست.');
  const foods = v.foods.map(f => {
    if (!f || typeof f.name !== 'string' || !f.name.trim() || f.name.length > 80 || !bounded(f.grams,2000) || f.grams < 1 || !bounded(f.kcalPer100,950) || !bounded(f.proteinPer100,100) || !bounded(f.carbsPer100,100) || !bounded(f.fatPer100,100) || !bounded(f.fiberPer100,100) || f.proteinPer100+f.carbsPer100+f.fatPer100 > 105 || f.fiberPer100 > f.carbsPer100) throw Error('مقدارهای تحلیل معتبر نیستند. دوباره عکس بگیر.');
    const macroEnergy=4*f.proteinPer100+4*f.carbsPer100+9*f.fatPer100;
    if (Math.abs(f.kcalPer100-macroEnergy)>Math.max(30,macroEnergy*.35)) throw Error('انرژی و مواد مغذی تحلیل هماهنگ نیستند.');
    return {name:f.name.trim(),grams:f.grams,kcalPer100:f.kcalPer100,proteinPer100:f.proteinPer100,carbsPer100:f.carbsPer100,fatPer100:f.fatPer100,fiberPer100:f.fiberPer100};
  });
  if (foods.reduce((s,f)=>s+f.grams,0)>5000) throw Error('مقدار کل غذا بیش از محدودهٔ قابل ثبت است.');
  return {foods,confidence:v.confidence,note:v.note.trim()};
}
export function foodScanTotals(foods: ScannedFood[]) {
  return foods.reduce((s,f)=>({kcal:s.kcal+f.kcalPer100*f.grams/100,protein:s.protein+f.proteinPer100*f.grams/100,carbs:s.carbs+f.carbsPer100*f.grams/100,fat:s.fat+f.fatPer100*f.grams/100,fiber:s.fiber+f.fiberPer100*f.grams/100}),{kcal:0,protein:0,carbs:0,fat:0,fiber:0});
}
export function parseFoodGrams(text: string): number | null {
  const normalized=text.replace(/[۰-۹]/g,c=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c))).replace(/[٠-٩]/g,c=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace('٫','.').trim();
  if(!/^\d+(\.\d{1,2})?$/.test(normalized))return null;
  const value=Number(normalized);return value>=1&&value<=2000?value:null;
}
