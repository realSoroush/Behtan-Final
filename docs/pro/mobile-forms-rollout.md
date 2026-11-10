# Pro form and mobile usability rollout

## Apply

1. Apply `supabase/migrations/20261109194909_056_pro_record_allergy_notes.sql` through the existing migration process before deploying this PR.
2. Merge the PR and confirm member, Pro and admin deployments.
3. No environment variables, catalog imports or Edge Function deployments change.

Migration 056 changes only the existing private `valid_real_intake` validator. It accepts an optional `custom_allergy_notes` string up to 1,000 characters. Old records remain valid; no historical case or plan is rewritten. Existing RPC permissions, tenant checks, revision CAS and replay behavior remain in force. Applying it twice is safe.

Deploying UI before 056 will reject a save containing the new field. For rollback, deploy the previous frontend but keep the backward-compatible validator; reverting the validator could reject already-saved records containing the field.

## Behavior

- Pro intake shows four touch-friendly steps, moves focus to the selected section, and exposes manual allergy notes only in real specialist case forms and their immutable history. The note is explicitly record-only, displayed again at nutrition generation/editing, and never becomes an engine allergen.
- Budget labels become «میزان بودجه موردنظر» / «بدون محدودیت مالی» in Pro/member/admin questionnaires and member summaries. Existing economic/balanced/performance keys and calculation policy stay compatible. This is a preference, not a guarantee of a priced grocery basket.
- The first diet option is «بدون محدودیت». Current engine filters support vegetarian patterns and enumerated allergens; they do not implement ketogenic macro constraints, fasting windows or Mediterranean food-frequency rules. Those three unsupported patterns are intentionally not offered.
- Training experience labels are «مبتدی، آماتور، پیشرفته»; existing input keys and engine progression policies are retained. This label change does not add an elite athletic training engine.
- Both studios offer focus-aware jump buttons for editing, adding from the bank and previewing. Catalog destinations, add feedback, empty search results, touch sizes and mobile save controls are clearer. Training retains separate daily sections, «حرکت بعدی» and «حرکات روز دوم…» through seven days, including the existing save/archive/PDF contract.
- Remaining native Gregorian date inputs are replaced with the shared Persian date editor: nutrition program date, admin licenses/metrics/scenarios/member-plan selection/subscription expiry, and corrective review date. Subscription time stays a separate local-time field. Wire/storage dates remain ISO. Admin date captions/tooltips are Persian too. Raw technical JSON inspection retains its original data values.

## Validation

- PGlite full market/Pro suite tests optional-note bounds/types, old records, real save/read/revision history, request replay and no historical mutation; the same suite runs on native PostgreSQL in CI.
- Nutrition tests compare full generated days with/without manual allergy notes, alongside existing allergen/diet/portion rules (32,768 independent menu combinations).
- Existing home-training tests cover per-day isolation, seven-day bounds, Persian leap dates, immutable snapshots and PDF output.
- Browser tests run on desktop and mobile: notes save/reload, budget labels, Persian nutrition date to exact ISO save, editor/catalog/preview navigation, catalog no-match feedback, overflow and existing end-to-end flows. Admin metrics tests select Persian dates and assert exact ISO range arguments.
- Local Chromium cannot launch in this host (socket permission); browser verification is performed in GitHub Actions. Review its final result before merge.

## Exact Pro nutrition menus (PR 50)

Case generation retains the four-menu default and honors every selected count from 1 to 5 in every meal, including the separate workout day. There is no automatic reduction or one-menu fallback. Errors and request IDs remain next to the generation button.

The Pro-only solver now searches compatible recipe groups and re-solves their portions together. It can revisit a slot's recipe choices when portion changes alone cannot fit. Candidate recipes use catalog foods, approved substitutions and one context-approved complementary protein; post-workout whole-meal alternatives can use approved main-meal protein/starch substitutes. Original fixed ingredients remain fixed. Distinctness uses the actual food composition, never a renamed template or a different weight of the same foods.

Gram-measured foods can use 5 g prescription increments as well as their existing catalog servings. Countable/household portions, hard minimum/maximum servings, breakfast egg/bread guardrails and post-workout supplement/volume caps retain their existing limits. Per-option calorie screening now considers the intended slot allocation and available daily headroom, rather than treating one unusually small reference meal as a ceiling for all alternatives.

The final daily constraint is unchanged: EVERY independent choice of one menu from each meal must meet the existing calorie/macro envelope. The same calculation is shared by selection and repair; native PostgreSQL independently validates persisted snapshots. B2C daily generation, allergy assessment and medical eligibility gates are unchanged. Truly sparse or unassessed unsafe catalogs still fail explicitly rather than inventing or duplicating meals.

Regression coverage: seven profile types × all five requested counts, 735 complete menus, 109,375 independently selected combinations, fixed/min/max portions, snapshot arithmetic, authored import/PDF and deterministic output. Browser coverage generates 2–5 menus with the real engine for the previously failing low-energy case and saves the exact five-menu result. The rare-shortage error preserves the requested count.

Deploy the PR's Pro code/API together through the regular Vercel deployment. This solver update requires no migration, environment change, food import or Edge Function deployment. Existing saved plans keep their immutable contents.

## Production smoke

Use a test case: add a manual allergy note, reconfirm screening, save and reopen it; inspect its old revision. Generate a nutrition plan on a Persian-selected date and compare stored/printed date. On mobile build two training days, move between catalog/editor/preview, save and reopen the archive/PDF. Check the subscription expiry time remains unchanged when its date changes.
