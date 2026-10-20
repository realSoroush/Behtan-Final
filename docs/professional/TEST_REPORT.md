# Phase 1 verification report — 2026-10-19

> Historical phase-1 baseline. Current phase-2a implementation and limits: [PHASE_2A.md](PHASE_2A.md); setup: [PHASE_2A_SETUP_FA.md](PHASE_2A_SETUP_FA.md); current verification: [PHASE_2A_TEST_REPORT.md](PHASE_2A_TEST_REPORT.md). The prior protein regression is repaired in this slice.

Base main: `61f0d1905542e2a2d827e6d4e4f925bc74e0aed4` (remote main rechecked after implementation).
Branch: `feature/pro-phase-1-foundation`. No push, deploy, production SQL, real patient intake or SMS was performed.

## Executed and passing

- `npm run test:pro`: **68 SQL assertions** on PGlite with non-superuser `authenticated` / `anon` roles, plus **14 UI contract assertions**. Fixtures load the existing schema, real catalog seed and migrations 016/018/019/020/021/022 before 023. Existing B2C policy definitions are compared before/after.
- SQL checks: cross-org reads and writes denied; guessed UUID hidden; composite FK cross-org assignment attacks denied; verified phone and expiring pilot allowlist required; platform-admin allowlist does not confer Pro access; direct table writes and self-verification/role escalation denied; assigned-only practitioner reception visibility; revoked assignments/memberships immediately filtered; org suspension; one sandbox/100-case quota; idempotent retries, request collision denial, last-owner protection, immutable audit; no fixture-created B2C profile/order/subscription/Auth identity.
- Browser: **10/10** scenarios using actual React/Supabase client with intercepted transport, 5 each on desktop and mobile viewport. Create workspace/case; lost committed response + reload + same idempotency key; workspace switch clears previous data; revoked pilot removes workspace; practitioner lacks reception action; verified session without pilot denied. Horizontal overflow checked. Light/dark desktop/mobile screenshots inspected internally; corrected the inherited theme-button padding that shrank its icon.
- `npm run build`, `npm run build:admin`, `npm run build:pro`: passed. Existing admin build retains a >500 kB warning; not a build failure. Professional JS approximately 369 kB / 106 kB gzip; no patient production performance claim follows from bundle size alone.
- `git diff --check`: passed. Patch application against unmodified base is separately checked when packaging.
- `npm audit --omit=dev --json`: reported 0 known production dependency advisories in the returned report. This is not a security audit or proof of absence of vulnerabilities.

Browser harness: Playwright 1.64.1, locally available Chromium headless 134 via explicit `PRO_BROWSER_EXECUTABLE`. CI installs the browser matching locked Playwright. Actual OTP/CAPTCHA/SMS/PostgREST/JWT endpoints are not exercised by the intercepted browser suite.

## B2C regression results

30 existing top-level test commands examined; **29 pass, 1 known baseline failure remains**. The production aggregator additionally runs auth/security/payments including the billing database tests.

| Command | Result |
|---|---|
| `test:companion` | PASS |
| `test:nutrition` | PASS |
| `test:onboarding` | PASS |
| `test:age` | PASS |
| `test:brand` | PASS |
| `test:portions` | PASS |
| `test:swap` | PASS |
| `test:menus` | PASS |
| `test:data` | PASS |
| `test:theme` | PASS |
| `test:diagnostics` | PASS |
| `test:quality` | PASS |
| `test:carousel` | PASS |
| `test:activity` | PASS |
| `test:allergies` | PASS |
| `test:routing` | PASS |
| `test:meal-progress` | PASS |
| `test:medical-safety` | PASS |
| `test:body-scan` | PASS |
| `test:landing` | PASS |
| `test:subscriptions` | PASS |
| `test:admin` | PASS |
| `test:experience` | PASS |
| `test:mobile-meals` | PASS |
| `test:production` | PASS |
| `test:protein` | FAIL |
| `test:protein-policy` | PASS |
| `test:protein-range` | PASS |
| `test:protein-budget` | PASS |
| `test:progress` | PASS |

### Existing failures investigated

1. `test:diagnostics` failed on unmodified main: `Expected 1532 kcal, got 1473`. The test still represented the old 22% adjustment. This branch changes only the test's golden expectations to the existing 25% policy: Mifflin TDEE 1964 → 1473 kcal; measured-body-fat TDEE 2024 → 1518 kcal, and adds TDEE assertions. The test then passes. No nutrition implementation or policy changes.
2. `test:protein` fails on both main and this branch: `Unexpected Protein v3 infeasible case: 125kg weight_gain lacto_ovo`. Reproduced independently in a detached checkout of `61f0d19`. The engine fails closed on feasibility; this delivery neither weakens portion limits nor changes the test to hide it. This remains a production-readiness blocker for the nutrition regression gate. It needs a dedicated engine/fixture feasibility investigation in P3 (or earlier as a separate fix).

## Not executed / still gated

- Native PostgreSQL 17 + two-connection races: harness and CI service added, **not executed in this host**, which has no native server. The explicit `--native` command refuses to silently fall back when `PRO_TEST_DATABASE_URL` is missing. CI uses an empty disposable `behtan_pro_test`; native tests add concurrent same-request creation and simultaneous owner-removal cases. Native privileges/trigger race behavior must be verified before merge/release; CI results are not claimed here.
- Actual staging Supabase/PostgREST Auth claims, CAPTCHA/domain setup, OTP and provider SMS. UI transport tests do not replace these checks.
- Live clinical consent, official server engine, immutable clinical approval/publication, patient claim, outbox, organization billing and clinical E2E: not implemented in Phase 1; planned with acceptance gates in ROADMAP.md.
- Penetration test, independent medical/legal approval, load test, monitoring, backup restore, incident response and production rollout: not completed and not implied by a passing sandbox suite.

## Changed surfaces

- Migration `20261019_023_pro_foundation.sql`: 7 new RLS tables, private authorization helpers, narrow sandbox RPCs, grants, last-owner/immutable-audit guards. Existing tables/policies/functions are not replaced. New restricted Auth FKs mean older global user-delete SQL is not a supported cleanup procedure for Pro-linked accounts.
- `src/professional/*`, `vite.pro.config.ts`: dedicated sandbox shell and Supabase API client, retry-key persistence (only UUIDs), scoped request handling, shared OTP/theme/error boundary. No B2C route or dashboard edits.
- Tests/config: `scripts/pro-*`, `tests/pro`, Playwright config, PostgreSQL CI workflow, existing diagnostics test expectation correction; development-only dependencies `pg`/Playwright and lockfile.
- `.env.example`, `.gitignore`, package scripts and architecture/data-model/roadmap/staging setup docs.

## Review decision

**Ready for code review and isolated sandbox evaluation; not ready for clinical release or automatic production merge.** Review native CI and the known baseline protein failure explicitly. Keep B2C/Admin deployments untouched. Next planned slice is P2a: clinical registry/intake separation, credential review and purpose-scoped consent with negative RLS tests before exposing health forms.
