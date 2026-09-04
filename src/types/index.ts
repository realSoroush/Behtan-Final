// ============================================================================
// CORE ENUMS / UNION TYPES
// ============================================================================

export type Gender = 'male' | 'female';
export type Goal = 'weight_loss' | 'weight_gain' | 'maintenance';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderate' | 'active';
export type DailyMovementPattern = 'mostly_seated' | 'mixed' | 'mostly_on_feet' | 'physical_job';
export type DailyStepsRange = 'under_4000' | '4000_7000' | '7000_10000' | 'over_10000' | 'unknown';
export type WorkoutDurationRange = 'under_30' | '30_60' | 'over_60';
export type WorkoutIntensity = 'light' | 'moderate' | 'vigorous';
export type WorkoutLocation = 'home' | 'gym' | 'none';
export type Motivation = 'health' | 'appearance' | 'confidence' | 'medical' | 'performance' | 'event';
export type WeightLossSpeed = 'mild' | 'standard' | 'fast';
export type BodyType = 'ectomorph' | 'mesomorph' | 'endomorph';
export type VegetarianStatus = 'none' | 'vegan' | 'lacto_ovo' | 'pescatarian' | 'raw';
export type Allergy = 'dairy' | 'gluten' | 'peanut' | 'tree_nut' | 'soy' | 'seafood';
export type MedicalCondition = 'diabetes' | 'fatty_liver' | 'pcos' | 'thyroid';

export type MealSlot =
  | 'breakfast'
  | 'morning_snack'
  | 'lunch'
  | 'afternoon_snack'
  | 'dinner'
  | 'night_snack';

export type SubscriptionTier = 'silver' | 'gold';

// ============================================================================
// SCHEDULE / MEDICAL / DIETARY (JSON columns)
// ============================================================================

export interface ScheduleJson {
  wakeTime: string;
  sleepTime: string;
  workStart: string;
  workEnd: string;
  workoutTime: string;
  mealTimes: Record<MealSlot, string>;
}


export interface ActivityProfileJson {
  version: 1;
  dailyMovement: DailyMovementPattern;
  dailySteps: DailyStepsRange;
  workoutDuration: WorkoutDurationRange | null;
  workoutIntensity: WorkoutIntensity | null;
  derivedLevel: ActivityLevel;
  derivedScore: number;
}

export interface MedicalConditionsJson {
  conditions: MedicalCondition[];
  injuries: string;
  medications: string;
}

export interface DietaryPreferencesJson {
  vegetarianStatus: VegetarianStatus;
  allergies: Allergy[];
}

// ============================================================================
// DATABASE MODELS
// ============================================================================

export type BodyFatSource = 'ai_visual' | 'measured';

export interface UserProfile {
  id: string;
  phone: string;
  gender: Gender | null;
  province: string | null;
  city: string | null;
  birth_date: string | null;
  height: number | null;
  weight: number | null;
  goal: Goal | null;
  activity_level: ActivityLevel | null;
  activity_profile_json: ActivityProfileJson | null;
  workout_location: WorkoutLocation | null;
  workout_days: number | null;
  motivation: Motivation | null;
  schedule_json: ScheduleJson | null;
  medical_conditions_json: MedicalConditionsJson | null;
  dietary_preferences_json: DietaryPreferencesJson | null;
  weight_loss_speed: WeightLossSpeed | null;
  body_fat_pct: number | null;
  /** Provenance matters: AI visual estimates are informational; measured values may drive Katch-McArdle automatically. */
  body_fat_source: BodyFatSource | null;
  body_type: BodyType | null;
  subscription_tier: SubscriptionTier | null;
  /** Next onboarding wizard step (1-11) to show when the user resumes. */
  onboarding_step: number;
  /** Full in-progress OnboardingData snapshot, cleared once onboarding completes. */
  onboarding_draft_json: OnboardingData | null;
  /** True only after the final onboarding write succeeds. */
  onboarding_completed: boolean;
  created_at: string;
}

// ============================================================================
// FOOD BUILDING BLOCKS — the atomic, database-backed layer
// ============================================================================

/** What role a food item plays inside a meal template. */
export type FoodRole = 'protein' | 'starch' | 'vegetable' | 'fat' | 'dairy' | 'fruit';

export type FoodQualityTag =
  | 'whole_grain'
  | 'refined_grain'
  | 'legume'
  | 'whole_fruit'
  | 'non_starchy_vegetable'
  | 'starchy_vegetable'
  | 'nuts_seeds'
  | 'unsaturated_fat'
  | 'protein_supplement'
  | 'whole_food';

/**
 * A single atomic food item with macros per declared unit.
 * This is the row shape for a future `food_items` Supabase table.
 * Every food a user ever sees traces back to one of these rows — never
 * an invented number.
 */
export interface FoodItem {
  id: string;
  name: string;              // "سینه مرغ پخته"
  role: FoodRole;
  emoji: string;
  /** Display unit, e.g. "عدد" for eggs, "گرم" for rice */
  unitLabel: string;
  /** Grams per one unit. For gram-based foods (rice, chicken) this is 100. */
  gramsPerUnit: number;
  /** Macros for exactly one unit (i.e., for gramsPerUnit grams). */
  kcalPerUnit: number;
  proteinPerUnit: number;
  carbsPerUnit: number;
  fatPerUnit: number;
  /** Dietary fiber is tracked separately from total carbohydrate. */
  fiberPerUnit: number;
  /** Transparent food-quality metadata used only by the secondary quality layer. */
  qualityTags: FoodQualityTag[];
  /** Contribution toward the daily fruit+vegetable target for one food unit. */
  fruitVegGramsPerUnit: number;
  allergyFlags: Allergy[];
  excludedForVegetarian: VegetarianStatus[];
  /** Meal contexts where this food may be OFFERED as a direct swap.
   * This does not limit specialist meal templates; it only keeps the swap UI
   * culturally/logically appropriate for the current meal. */
  swapAllowedMeals: MealSlot[];
  /** Similar foods share a group and are preferred over cross-group swaps. */
  swapGroup: string;
  /** Lower values rank earlier after safety/equivalence checks. */
  swapPriority: number;
}

/** Practical serving guardrails stored alongside each food in Supabase. */
export interface PortionRule {
  minUnits: number;
  typicalUnits: number;
  softMaxUnits: number;
  hardMaxUnits: number;
  step: number;
}

/**
 * The complete runtime nutrition catalog. Production obtains this from
 * Supabase; smoke tests use a frozen fixture generated from the same seed.
 */
export interface NutritionCatalog {
  foods: FoodItem[];
  substitutes: FoodSubstituteGroup[];
  mealTemplates: MealTemplate[];
  portionRules: Record<string, PortionRule>;
}

/**
 * Substitution edge: foodItemId can be swapped for any id in substituteIds.
 * Mirrors a future `food_substitutes(food_item_id, substitute_food_item_id)`
 * join table. Swapping preserves the same FoodRole so the meal's balance
 * barely shifts.
 */
export interface FoodSubstituteGroup {
  foodItemId: string;
  substituteIds: string[];
}

// ============================================================================
// MEAL TEMPLATES — the recipe layer (dynamic, not a fixed menu)
// ============================================================================

/**
 * One slot inside a meal template. Exactly one FoodItem (or its substitute)
 * fills this slot. `dynamicUnits: true` means the engine computes how many
 * units are needed to hit the slot's macro target (used for the protein
 * component). `dynamicUnits: false` means a fixed unit count regardless
 * of the user (used for bread, walnuts, salad dressing, etc.).
 */
export interface TemplateSlotFill {
  role: FoodRole;
  primaryFoodItemId: string;
  dynamicUnits: boolean;
  /** Only used when dynamicUnits is false. */
  fixedUnits?: number;
}

/**
 * A meal template describes the STRUCTURE of a meal (which roles appear,
 * which food fills each role by default) without baking in fixed macros.
 * The engine computes actual grams/macros per user at generation time.
 */
export interface MealTemplate {
  id: string;
  slot: MealSlot;
  displayName: string;
  slots: TemplateSlotFill[];
  isWorkoutDayOnly: boolean;
  isRestDayOnly: boolean;
  maxPerWeek?: number;
  /** Hide specialist fallback templates from unrestricted users. */
  restrictedDietOnly?: boolean;
  /** Optional diet-status gate for specialist templates (for example vegan-only). */
  vegetarianStatusesOnly?: VegetarianStatus[];
  goalTags: Goal[]; // which goals this template suits (empty = all goals)
}

// ============================================================================
// RESOLVED MEAL — what the engine outputs after filling a template for
// a specific user (this is what the UI renders)
// ============================================================================

export interface MealComponent {
  foodItem: FoodItem;
  units: number;          // computed or fixed unit count
  grams: number;           // units × gramsPerUnit, for display
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface Meal {
  slot: MealSlot;
  label: string;
  templateId: string;
  templateName: string;
  components: MealComponent[];
  totalKcal: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalFiber: number;
  consumed: boolean;
}

/**
 * A pre-calculated food swap. The replacement amount is solved against the
 * ORIGINAL component, not against the whole meal target. This prevents a
 * swap from silently deleting protein/carbs/fat just because the rest of the
 * meal happens to keep the total score acceptable.
 */
export interface FoodSwapOption {
  foodItem: FoodItem;
  replacementComponent: MealComponent;
  updatedMeal: Meal;
  isEquivalent: boolean;
  /** True when this option restores the exact component from the generated plan. */
  isOriginal?: boolean;
  reason?: string;
  score: number;
  kcalDeviationPct: number;
  proteinDeviationPct: number;
  carbDeviationPct: number;
  fatDeviationPct: number;
}

export interface DailyMealPlan {
  date: string;
  isWorkoutDay: boolean;
  targets: MacroTargets;
  meals: Meal[];
}

// ============================================================================
// COMPUTED / DERIVED MODELS
// ============================================================================


export interface FoodQualitySummary {
  fiberTargetGrams: number;
  fiberGrams: number;
  fiberAdequacyPct: number;
  fiberStatus: 'good' | 'needs_improvement' | 'poor';
  fruitVegTargetGrams: number;
  fruitVegGrams: number;
  fruitVegAdequacyPct: number;
  wholeGrainGrams: number;
  refinedGrainGrams: number;
  legumeGrams: number;
}

export interface MacroTargets {
  targetCalories: number;
  proteinGrams: number;
  fatGrams: number;
  carbGrams: number;
  proteinCal: number;
  fatCal: number;
  carbCal: number;
}

// ============================================================================
// AI BODY SCAN
// ============================================================================

export interface BodyScanResult {
  bodyFatPct: number;
  biologicalAge: number;
  bodyType: BodyType;
  estimatedMuscleMass: 'low' | 'average' | 'high';
  narrative: string;
  confidence: 'low' | 'medium' | 'high';
}

// ============================================================================
// ONBOARDING WIZARD STATE
// ============================================================================

export interface OnboardingData {
  gender: Gender | null;
  province: string;
  city: string;
  birthDate: string;
  height: number | null;
  weight: number | null;
  goal: Goal | null;
  activityLevel: ActivityLevel | null;
  dailyMovement: DailyMovementPattern | null;
  dailySteps: DailyStepsRange | null;
  workoutDuration: WorkoutDurationRange | null;
  workoutIntensity: WorkoutIntensity | null;
  workoutLocation: WorkoutLocation | null;
  workoutDays: number;
  motivation: Motivation | null;
  schedule: ScheduleJson;
  medicalConditions: MedicalCondition[];
  injuries: string;
  medications: string;
  vegetarianStatus: VegetarianStatus;
  allergies: Allergy[];
  weightLossSpeed: WeightLossSpeed;
  bodyScanImage: string | null;
  bodyScanSkipped: boolean;
  manualBodyType: BodyType | null;
  bodyScanResult: BodyScanResult | null;
  selectedTier: SubscriptionTier | null;
}

export const createEmptyOnboardingData = (): OnboardingData => ({
  gender: null,
  province: '',
  city: '',
  birthDate: '',
  height: null,
  weight: null,
  goal: null,
  activityLevel: null,
  dailyMovement: null,
  dailySteps: null,
  workoutDuration: null,
  workoutIntensity: null,
  workoutLocation: null,
  workoutDays: 3,
  motivation: null,
  schedule: {
    wakeTime: '07:00',
    sleepTime: '23:00',
    workStart: '09:00',
    workEnd: '17:00',
    workoutTime: '18:00',
    mealTimes: {
      breakfast: '08:00',
      morning_snack: '10:30',
      lunch: '13:00',
      afternoon_snack: '16:30',
      dinner: '19:30',
      night_snack: '22:00',
    },
  },
  medicalConditions: [],
  injuries: '',
  medications: '',
  vegetarianStatus: 'none',
  allergies: [],
  weightLossSpeed: 'standard',
  bodyScanImage: null,
  bodyScanSkipped: false,
  manualBodyType: null,
  bodyScanResult: null,
  selectedTier: null,
});
