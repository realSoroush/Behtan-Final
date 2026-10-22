import type { Meal, MealComponent } from '../types/index.ts';
import { parseFoodScanResult, foodScanTotals, type FoodScanResult } from '../../supabase/functions/_shared/foodScanContract.ts';
export { parseFoodScanResult, foodScanTotals, parseFoodGrams } from '../../supabase/functions/_shared/foodScanContract.ts';
export type { ScannedFood, FoodScanResult } from '../../supabase/functions/_shared/foodScanContract.ts';
export function scannedMeal(result: FoodScanResult, slot: Meal['slot'], label: string): Meal {
  const clean=parseFoodScanResult(result);
  if(!clean.foods.length)throw Error('ابتدا یک مادهٔ غذایی اضافه کن.');
  const components:MealComponent[]=clean.foods.map((f,i)=>({
    foodItem:{id:`scan_${i}`,name:f.name,role:'starch',emoji:'',unitLabel:'گرم',gramsPerUnit:100,kcalPerUnit:f.kcalPer100,proteinPerUnit:f.proteinPer100,carbsPerUnit:f.carbsPer100,fatPerUnit:f.fatPer100,fiberPerUnit:f.fiberPer100,qualityTags:[],fruitVegGramsPerUnit:0,allergyFlags:[],excludedForVegetarian:[],swapAllowedMeals:[],swapGroup:'scan',swapPriority:100},
    grams:f.grams,units:f.grams/100,kcal:f.kcalPer100*f.grams/100,protein:f.proteinPer100*f.grams/100,carbs:f.carbsPer100*f.grams/100,fat:f.fatPer100*f.grams/100,fiber:f.fiberPer100*f.grams/100,
  }));
  const t=foodScanTotals(clean.foods);
  return {slot,label,templateId:'custom_food_scan',templateName:'وعدهٔ دلخواه',components,totalKcal:t.kcal,totalProtein:t.protein,totalCarbs:t.carbs,totalFat:t.fat,totalFiber:t.fiber,consumed:true,source:'food_scan',estimated:true};
}
