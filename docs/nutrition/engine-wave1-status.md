# Engine safety rollout — 2026-11-05

> این سند سابقهٔ همان مرحله است. برای وضعیت امروز، شواهد CI، مراحل اعمال‌شده و کار بعدی، [وضعیت جاری موتور](engine-status.md) را بخوانید.


Audit and implementation base: `1f75c5b08aaa512d74e0faf4cd46adb8d3705505` (origin/main fetched before work). No newer commits existed. Separate branches are based on this commit; no production writes or merges are authorized by this document.

## Initial reconciliation of the 18 tasks

| Task | Status on fetched main | Evidence / remaining work |
|---|---|---|
| E01 | Still present | Hydrated locked meal persists into prescription; removing checkin marks it unconsumed. |
| E02 | Partially implemented | Auth/subscription/preflight exist. Interactive member edits still trust client JSON. |
| E03 | Partially implemented | Schedule CAS/extra-food idempotency exist. No atomic day/intake revision. |
| E04 | Partially implemented | Seven allergens incl. celery supported. Egg/sesame and unknown state absent. |
| E05 | Still present | Executed regressions accept invalid numbers, inconsistent totals, duplicate slots. |
| E06 | Still present | Global catalog and independent browser reads; cross-request race not demonstrated. |
| E07 | Still present | BMI discontinuity reproduced; policy coefficients await qualified review. |
| E08 | Partially implemented | Source URLs and two sourced recipes exist; no complete versioned ingredient/yield model. |
| E09 | Partially implemented | Bounded search/repair exist. No oracle/frontier diagnostics. |
| E10 | Partially implemented | Rebalancing, equivalence, CAS persistence exist. No intake-bound proposal transaction. |
| E11 | Still present | Fixed six slots plus post-workout. |
| E12 | Partially implemented | Previous-day variety exists; maxPerWeek/goalTags not enforced; no actual basket price objective. |
| E13 | Partially implemented | Fiber/fruit/vegetable quality exists; unknown coverage and micronutrients absent. |
| E14 | Partially implemented | Two-window review exists; direction alone can return continue for 100→90 kg. |
| E15 | Partially implemented | Tenant checks, specialist identity and historical PDF exist; shared semantic/version contract incomplete. |
| E16 | Needs further evidence | No live Iran/network/load/restore drill performed. Existing infrastructure retained. |
| E17 | Partially implemented | Existing suites pass on base; new failure cases were not covered. |
| E18 | Partially implemented | Two sourced menus exist; full reviewed publication workflow absent. |

## PR A — intake/prescription and snapshot boundaries (E01, E05, E17)

- Preserve actual intake in checkins. Generate an independent current-context prescription underneath consumed slots; retain locked-intake optimization for the remaining slots. Undo exposes this independent prescription.
- Remove obsolete hydrated locks after undo. Never store manual/scan intake or a `consumed` flag as the active prescription.
- Legacy intake-bearing schedules are regenerated underneath intact checkins. Invalid current-context numeric snapshots block edits and show a support message; original rows remain untouched.
- Shared runtime validators check finite/nonnegative values, positive servings, slot allowlist/uniqueness, component/meal sums, recorded food basis and executable baseline arrays. Tolerances describe current engine rounding, not relaxed diet targets. No forced 4/4/9 equivalence.
- Direct catalog validation now rejects NaN/Infinity in nutrition/portion metadata and nonpositive fixed units.
- Existing authenticated RPC/CAS retained. This is not a server-authoritative edit boundary: E02/E03 and full live-catalog/medical/portion verification remain open. Pro authored documents retain their separate contract (E15).
- If no independent safe prescription can be generated, generation fails closed; existing intake remains stored. A richer per-slot “needs selection” recovery UI remains for E02/E10.

### Verification

Before fix: 12 regression groups failed (invalid grams, inconsistent totals, duplicate/unknown slots, intake as prescription); direct catalog NaN validation also failed. The new tests pass after fix, including F03 allergy change + undo + JSON reopen and custom intake.

Base checks passed: meal-progress; progress + PGlite DB; member-redesign + PGlite; allergy-separation. Build and remaining regression results are recorded in the PR.

Browser tests added: allergy change, preserved historical consumed meal, undo, prescription-only saves and reload. Local Chromium could not start: `socket() failed: Operation not permitted` before page navigation. Desktop/mobile browser assertions are NOT reported as passed; CI must run them before merge. Browser fixtures emulate REST; this does not establish real multi-device transaction correctness.

No DB migration/env/server command required for PR A. Deploy existing Vercel member/admin/Pro builds after review and successful CI. Rollback: revert this code PR; do not delete intake or schedule tables. Immutable stored intake is never migrated by this PR.

Executed after PR A changes: TypeScript; member, admin and Pro builds; engine safety regression; food-scan; member-redesign/PGlite; meal-progress; mobile-meals (24 combinations); nutrition (576 attempts, 491 accepted, 85 rejected); swap; meal rotation (84 rotations/reloads); market including 395 PGlite assertions. No native PostgreSQL/PostgREST or real device run occurred. The fixture acceptance count is unchanged, not a production success metric.

F01 remains reproducible at 190→171g for 95→95.1kg and is explicitly deferred to E07 policy review. CI browser execution is a merge prerequisite, including the existing refresh/custom-intake paths and new allergy/undo path.
