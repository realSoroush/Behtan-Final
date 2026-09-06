# به‌تن (Behtan)

Persian RTL nutrition-planning SPA built with React, TypeScript, Vite and Supabase.
Nutrition targets, meal generation, portion limits and food swaps are deterministic;
AI is limited to the optional Body Scan path.

## Current MVP architecture

- **Auth:** adapter-based Phone OTP; current driver is Supabase Auth with a provider-agnostic Send SMS Hook
- **Profiles/onboarding:** `user_profiles` with RLS; onboarding progress is saved to Supabase on every Next
- **Nutrition catalog:** Supabase is the production source of truth
  - `food_items`
  - `food_substitutes`
  - `meal_templates`
  - `meal_template_slots`
- **Nutrition engine:** deterministic TypeScript engine with calorie/macro, allergy/diet, portion-realism and swap guardrails
- **Body Scan:** ephemeral browser image -> authenticated Supabase Edge Function -> Gemini; raw photos are not persisted and no AI is used for meal math

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

Required client environment variables:

```text
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## Supabase database

For a new database, use `supabase/schema.sql`, then seed the nutrition catalog:

```text
supabase/seed_nutrition_catalog.sql
```

For an existing Behtan database, apply migrations in order:

```text
supabase/migrations/20260825_001_nutrition_catalog.sql
supabase/migrations/20260825_002_security_auth_cleanup.sql
...
supabase/migrations/20260906_012_body_scan_privacy.sql
```

Verification queries:

```text
supabase/verify_nutrition_catalog.sql
supabase/verify_security_cleanup.sql
```

The removed legacy `food_exchanges` export is preserved for future data harvesting at:

```text
supabase/archive/food_exchanges_legacy_backup.sql
```

It is **not** read by production code.

## Phone OTP requirement

Before deploying the secure auth code:

1. Enable **Authentication -> Providers -> Phone** in Supabase.
2. Deploy `supabase/functions/send-sms` and configure it as the **Send SMS HTTP Hook**.
3. Configure your Iranian SMS panel only through server-side `SMS_PROVIDER_*` secrets.
4. Confirm that a real Iranian `+98` number receives and verifies an OTP.

Provider/API details live behind `SmsProvider`; see `PHONE_AUTH_ABSTRACTION_NOTES.md`.

Do not reintroduce synthetic-email or phone-derived passwords.

## Body Scan deployment

1. Apply `supabase/migrations/20260906_012_body_scan_privacy.sql`. It adds consent metadata and removes any legacy Base64 photo from onboarding drafts.
   Run `supabase/verify_body_scan_privacy.sql` afterward; all three count queries must return zero.
2. Set `GEMINI_API_KEY` as a Supabase Edge Function secret.
3. If a Vercel preview origin is used, add it to the comma-separated `BODY_SCAN_ALLOWED_ORIGINS` Edge Function secret.
4. Deploy with JWT verification enabled: `supabase functions deploy body-scan`.

The camera requires HTTPS (localhost is allowed for development). Behtan stores only the validated estimate and consent metadata, never the raw image.

## Tests

```bash
npm run test:data
npm run test:security
npm run test:auth
npm run test:swap
npm run test:menus
npm run test:portions
npm run test:nutrition
npm run test:onboarding
npm run test:age
npm run test:brand
npm run test:body-scan
npm run build
```

## Production data rules

- Browser clients can read only active nutrition catalog rows after authentication.
- Browser clients cannot insert/update/delete nutrition catalog data.
- A user can read/update only their own `user_profiles` row.
- Catalog edits are performed in Supabase Dashboard or trusted server/service-role tooling.
- `.env` and service-role keys must never be committed or exposed to Vite/browser code.
