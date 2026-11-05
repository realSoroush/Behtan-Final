# E04 immediate rollout — egg/sesame, with explicit unknown data

Base: main 1f75c5b. This is the immediate E04 phase plus E17 regression, not a claim that all allergy/recipe data are reviewed.

## Behavior

- Egg/sesame choices in onboarding, existing-member profile and Pro intake (admin uses the shared options).
- Migration 047 expands food CHECK and private Pro validators, adds explicit assessment metadata and tags whole eggs/whites. Empty metadata remains unknown. No invented sesame-free or egg-free certifications.
- Engine generation, specialist menu options and swaps share the same filter. For egg/sesame, an empty flag list does NOT allow the food: only explicit `assessed_absent` with a recorded source permits it. Declared presence always rejects, even with contradictory absence metadata.
- `contains`, `may_contain`, `unknown` and missing metadata reject. Unknown allergy codes reject. Existing seven-allergen legacy semantics are retained pending the reviewed-data migration E08; wheat/gluten/lactose taxonomy and full recipe-derived assessment remain open.
- **Release consequence:** existing production foods have no reviewed absence metadata for the new allergens. Users selecting egg/sesame may be unable to generate automatically. This is deliberate; do not fill `assessed_absent` in bulk to remove that stop. Have a qualified reviewer assess ingredient/brand/cross-contact evidence first. UI explains the limitation before selection/save. Lack of a feasible automatic plan must not trigger payment.
- A stored prescription/old browser does not become server-authoritative through this patch; E02/E03 and complete historical revalidation remain necessary. Merge intake/prescription PR first to protect undo.

FDA primary reference for allergen categories (not a claim of Iranian legal compliance): https://www.fda.gov/food/nutrition-food-labeling-and-critical-foods/food-allergies . No new clinical thresholds or nutrient values are introduced.

## Verification

Before fix, the main fixture's whole egg lacked an egg flag (failing assertion reproduced). New tests cover both egg forms; unknown and all four assessment states; presence taking precedence; generation failing closed; Pro choices and swaps rejecting unknowns; synthetic reviewed catalog generating valid egg/sesame-excluding menus; invalid metadata rejection.

PGlite market suite applies migration 047 twice and verifies food flags, malformed assessments, required absence source and real/sandbox Pro intake acceptance. Existing native CI market path applies the same SQL/assertions on PostgreSQL 17. Local native PostgreSQL/PostgREST and browser execution were not performed; PGlite is not a substitute. A full native/REST concurrency test belongs to E02/E03. Production has not been changed.

## Apply only after PR review / approval

1. Merge and deploy intake/prescription PR (#34) and weight guard (#35) after their CI gates. Keep allergen PR unmerged until 047 is reviewed/applied. Test on a disposable/preview DB first. No env secret changes.
2. Windows PowerShell, E:\Behtan-Final — fetch and inspect the allergen branch without overwriting local changes:

```powershell
Set-Location E:\Behtan-Final
git status --short
git fetch origin
git worktree add ..\Behtan-Allergen-Review origin/fix/egg-sesame-allergen-safety
Set-Location ..\Behtan-Allergen-Review
npm ci
node --experimental-strip-types scripts/allergen-safety.test.mjs
npm run test:market
Get-Content .\supabase\migrations\20261105094021_047_egg_sesame_allergen_safety.sql
```

3. After explicit production approval, transfer only the reviewed migration (Docker is not required on Windows):

```powershell
scp .\supabase\migrations\20261105094021_047_egg_sesame_allergen_safety.sql root@95.38.186.191:/opt/behtan/migration/
```

4. Iran server SSH — use the existing backup process before applying. This transaction changes schema/catalog only, not personal histories. The following is an instruction for the operator, not an action executed by this audit:

```bash
cd /opt/behtan/supabase
docker compose exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  < /opt/behtan/migration/20261105094021_047_egg_sesame_allergen_safety.sql
```

Alternatively, paste exactly the migration into the **Iran self-hosted Studio SQL Editor**, after review/backup. Do not run it on the old Supabase Cloud project by mistake. Do not run historical migrations again.

5. Studio read-only verification:

```sql
select id, allergy_flags, allergen_assessment
from public.food_items where id in ('egg_whole','egg_white');
select public.valid_food_allergen_assessment('{"sesame":"unknown"}',null) as unknown_valid,
       public.valid_food_allergen_assessment('{"sesame":"assessed_absent"}',null) as unsourced_absence_invalid;
```

Expected: both eggs declared `egg`; `unknown_valid=true`, `unsourced_absence_invalid=false`. These check metadata validity, not that a food is safe.

6. Merge the allergen PR after migration/CI/approval; deploy member, admin and Pro in Vercel (existing settings). Hard reload / update PWA. Test both new choices, unknown-data rejection, existing unaffected profiles, paid preflight stop before checkout and Pro case save. Check served builds, not just branch status.

Rollback: revert app code if necessary; keep additive columns/new allergen flags and historical intake. Do not remove constraints/flags or rewrite profiles to hide the new sensitivity. An old cached client cannot be certified safe for a newly supported allergy; keep affected automatic generation stopped while recovering.

## Status after this immediate phase

E04: partially implemented (new categories/unknown guard done; full legacy taxonomy, recipe assessment and qualified publication review pending). E17: added tests, broader native/browser evaluation pending. E01/E05/E14 are tracked by separate PRs. E02/E03/E06–E13/E15/E16/E18 remain as in the audit; no advanced-wave implementation claimed.
