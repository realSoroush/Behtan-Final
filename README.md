# به‌تن (Behtan) — Persian Smart Nutrition App

A modern, RTL-first, Persian-language health and diet SPA built with React + TypeScript + Supabase. All nutrition calculations are **100% deterministic math** — no AI hallucinations for calorie or macro data. AI is strictly limited to vision-based body composition analysis in the onboarding flow.

---

## ✨ Features

| Feature | Detail |
|---|---|
| 🔐 Phone OTP Auth | Supabase Auth via SMS — Iranian phone numbers (+98) |
| 📋 11-Step Onboarding | Animated RTL wizard collecting all user data |
| 🧮 Deterministic Nutrition Math | Katch-McArdle (if body fat known) or Mifflin-St Jeor BMR → TDEE → Macros |
| 🤖 AI Body Scan (optional) | Gemini 2.5 Flash Vision via Supabase Edge Function — **API key never in browser** |
| 🍽️ Meal Plan Engine | Template-matching algorithm, allergy/vegetarian filtering, 6 meals/day |
| 🔄 Food Swap | جایگزینی غذا — swap any item with macro-equivalent from same category |
| 🏋️ Workout Day Toggle | Dynamic +150 kcal adjustment for exercise days |
| 🌙 Dark Mode | System-preference aware, toggle-ready |
| 🇮🇷 Full RTL | `dir="rtl"`, Vazirmatn font, Persian digit rendering |

---

## 🗂️ Project Structure

```
behtan-app/
├── src/
│   ├── types/index.ts              # All TypeScript types/interfaces
│   ├── lib/
│   │   ├── supabaseClient.ts       # Supabase client (uses env vars)
│   │   └── geminiClient.ts         # AI client — scoped to body scan ONLY
│   ├── utils/
│   │   ├── nutritionHelpers.ts     # Pure BMR/TDEE/macro math — no AI
│   │   └── mealPlanEngine.ts       # Deterministic meal allocation + swap
│   ├── hooks/
│   │   ├── useAuth.ts              # Phone OTP auth state
│   │   ├── useOnboardingStore.ts   # Zustand store for 11-step wizard
│   │   ├── useUserProfile.ts       # Supabase profile CRUD
│   │   └── useFoodExchanges.ts     # Fetches food_exchanges table
│   ├── components/
│   │   ├── PhoneAuth.tsx           # Login screen
│   │   ├── ui/                     # Button, Card, Input, StepHeader
│   │   ├── onboarding/             # Step1–Step11 + OnboardingWizard shell
│   │   └── dashboard/              # DashboardPage, MacroSummary, MealCard, etc.
│   ├── App.tsx                     # Root router (auth → onboarding → dashboard)
│   └── main.tsx                    # React entry point
├── supabase/
│   ├── schema.sql                  # Table definitions + RLS policies
│   ├── seed_food_exchanges.sql     # Starter food data (expand for production)
│   └── functions/body-scan/        # Deno edge function — Gemini proxy
├── .env.example                    # Copy to .env and fill in credentials
└── README.md
```

---

## 🚀 Quick Start

### 1. Clone and install

```bash
git clone <your-repo>
cd behtan-app
npm install
```

### 2. Set up Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** and run both SQL files in order:
   ```sql
   -- 1. Create tables + RLS
   -- paste contents of supabase/schema.sql

   -- 2. Seed food data
   -- paste contents of supabase/seed_food_exchanges.sql
   ```
3. Enable **Phone Auth** under Authentication → Providers → Phone. Configure your SMS provider (Twilio, MessageBird, etc.)

### 3. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env`:
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

Both values are in your Supabase project under **Settings → API**.

### 4. Deploy the Gemini Edge Function

```bash
# Install Supabase CLI if needed
npm install -g supabase

# Link to your project
supabase login
supabase link --project-ref your-project-ref

# Set the Gemini API key as a server-side secret (NEVER in .env)
supabase secrets set GEMINI_API_KEY=your-gemini-api-key-here

# Deploy the edge function
supabase functions deploy body-scan --no-verify-jwt=false
```

Get a Gemini API key at [aistudio.google.com](https://aistudio.google.com/app/apikey).

### 5. Run the dev server

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

---

## 🧮 Nutrition Math Reference

All calculations live in `src/utils/nutritionHelpers.ts`. They are pure functions — same input always produces the same output, no network calls.

### BMR

**Katch-McArdle** (preferred when body fat % is known from AI scan or manual selection):
```
LBM = weight_kg × (1 - body_fat_pct / 100)
BMR = 370 + (21.6 × LBM)
```

**Mifflin-St Jeor** (fallback when body fat is unknown):
```
Men:   BMR = (10 × kg) + (6.25 × cm) − (5 × age) + 5
Women: BMR = (10 × kg) + (6.25 × cm) − (5 × age) − 161
```

### TDEE

```
Sedentary  → BMR × 1.200
Moderate   → BMR × 1.550
Active     → BMR × 1.725
```

### Target Calories

```
Weight Loss (Mild)     → TDEE − 300
Weight Loss (Standard) → TDEE − 500
Weight Loss (Fast)     → TDEE − 500  (+ mandatory exercise — UI note)
Maintenance            → TDEE ± 0
Weight Gain            → TDEE + 300
Workout Day Bonus      → +150 kcal (carbs-biased, handled by engine)
Safety Floor           → min 1200 kcal/day
```

### Macros

```
Protein  = 2.2 g × body_weight_kg
Fat      = 25% of target calories (hard cap: 30%)
Carbs    = (target_kcal − protein_kcal − fat_kcal) ÷ 4
```

---

## 🍽️ Meal Plan Engine

`src/utils/mealPlanEngine.ts` — **zero AI involvement**.

### Pipeline

1. **Pre-filter** `food_exchanges` rows by user allergies + vegetarian tier
2. **Distribute** daily calories across 6 slots using fixed percentages:

   | Slot | % of daily calories |
   |---|---|
   | صبحانه (Breakfast) | 20% |
   | میان‌وعده صبح (Morning snack) | 10% |
   | ناهار (Lunch) | 30% |
   | میان‌وعده عصر (Afternoon snack) | 10% |
   | شام (Dinner) | 25% |
   | میان‌وعده شب (Night snack) | 5% |

3. **Allocate** foods to each slot using a deterministic category template (starch, protein, vegetable, fat…)
4. **Pair** every `mixed_dish` item (Ghormeh Sabzi, Kebab, etc.) with a `starch` item automatically
5. **Swap** replaces any item with the closest-calorie alternative from the same category

### Allergy filtering

| Allergy | Excluded categories | Excluded name fragments |
|---|---|---|
| dairy | dairy_skim, dairy_low_fat, dairy_whole | شیر، ماست، پنیر، کره |
| gluten | — | نان، گندم، جو |
| peanut | — | بادام زمینی |
| soy | — | سویا |
| seafood | — | ماهی، میگو، صدف |

---

## 🤖 AI Boundary

AI usage is strictly limited to one path:

```
Onboarding Step 9 (photo upload)
        ↓
Supabase Edge Function: body-scan
        ↓  (Gemini 2.5 Flash Vision — server-side)
BodyScanResult { bodyFatPct, biologicalAge, bodyType, narrative }
        ↓
Step 10 displays results
        ↓
BMR uses bodyFatPct for Katch-McArdle (more accurate than Mifflin)
```

**AI is explicitly NOT used for:**
- Calorie calculations
- Macro calculations  
- Food selection or naming
- Meal plan generation
- Any nutrition data

If the AI response fails validation (out-of-range numbers, wrong shape), the app falls back to the user's manual body type selection — no garbage data ever reaches the nutrition engine.

---

## 🗄️ Database Schema

### `food_exchanges`
Reference nutrition table. Clients have read-only access (RLS). Managed via service role / admin panel.

| Column | Type | Notes |
|---|---|---|
| id | text PK | e.g. `st_1`, `ml_1` |
| category | text | 13 categories (starch, meat_lean, …) |
| name | text | Persian food name |
| amount | text | Persian display string |
| weightGrams | int4 | Exact weight |
| kcal, carbs, protein, fat, fiber, sugar | int4 | Per-exchange macros |
| gi_level | text | Low / Medium / High |

### `user_profiles`
One row per authenticated user. Full RLS — users can only read/write their own row.

---

## 📦 Production Checklist

- [ ] Replace Supabase anon key with environment-specific keys
- [ ] Configure SMS provider in Supabase (Twilio recommended for Iran)
- [ ] Expand `food_exchanges` seed data (starter set is illustrative — use a verified nutritionist-reviewed database)
- [ ] Add Sentry or similar error tracking
- [ ] Configure Supabase Edge Function rate limiting
- [ ] Add payment integration for Silver/Gold tiers (Zarinpal recommended for Iran)
- [ ] Set up Supabase database backups
- [ ] Review and tighten RLS policies before go-live
- [ ] Add `robots.txt` and SEO meta tags

---

## 🛠️ Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React 18 + TypeScript + Vite |
| Styling | Tailwind CSS v3 + Vazirmatn font |
| Animation | Framer Motion (RTL slide transitions) |
| Icons | Lucide React |
| State | Zustand (onboarding store) + React hooks |
| Backend | Supabase (Postgres + Auth + Edge Functions) |
| AI | Google Gemini 2.5 Flash Vision (body scan only) |

---

## 📝 License

MIT
