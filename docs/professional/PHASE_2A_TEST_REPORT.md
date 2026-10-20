# Phase 2a — verification report / 2026-10-20

Base: `5bd9755c8363a30d4a324e831fc7689707ef41d7` (remote main rechecked before packaging).
Branch: `feature/pro-phase-2-records`. No remote code push, deployment, production SQL or real patient data processing performed.

## Executed

| Check | Actual result |
|---|---|
| `npm run test:pro` | **141 SQL assertions** (PGlite), **14 UI contract assertions**, **17 intake/medical-policy/permission assertions**, all pass |
| Browser | **30/30** pass: 15 scenarios each on desktop/mobile viewport, including the original phase-1 flows |
| `test:protein` | original test unchanged; 56/60 feasible, 4 extreme cases safely reject; pass |
| `test:feasibility` | prior failing fixture, deterministic output, unchanged target, practical portions/diet and impossible-target rejection; pass |
| Existing regressions + new feasibility test | **31/31 top-level commands** pass; `test:production` also executes auth/security/payments/billing DB checks |
| Builds | B2C, Admin, Pro pass; Pro tested with sandbox flag enabled as well as default disabled |
| Visual QA | desktop light and mobile dark form/history states inspected; no horizontal overflow in browser acceptance path |
| Patch | final package checked for clean application against the unmodified base; whitespace check included |

SQL tests load the existing schema/catalog and prior migrations, execute phase-1 tests and then migration 024. Access is tested as non-superuser `authenticated`/`anon`, not merely as database owner. Cases include separate tenants, composite processing-evidence FKs, direct write denial, owner/assistant health read denial, role/assignment/test-capability/processing requirements, expiry/revocation, request conflicts, stale revisions, same-request retry, old-grant/assignment replay after revocation, immutable revision/permission/audit protection, strict invalid payload rejection, unrelated consent purposes and absence of real professional credentials for simulated capabilities.

Browser tests use real React/Supabase client code with intercepted synthetic HTTP transport. They validate forms and user flows, not the real PostgREST or SMS provider. New cases: create reception record, explicitly assign/grant processing, edit/save, read old version, network loss after commit/retry, stale write refusal/reload, editable validation error, assistant denial, revoked processing hiding health/history, existing medical hard-stop indication, focus and periodic access checks. Random request IDs only are stored for creation; no medical answers are written to browser storage by the new flow.

Local browser: Playwright from the lockfile with Chromium headless 134 selected by `PRO_BROWSER_EXECUTABLE`. CI installs the browser matched to Playwright. These are viewport checks, not real iPhone/Safari device validation. Case editor is loaded as a separate chunk; enabled Pro entry ~505 kB / 151 kB gzip and editor ~27 kB / 10 kB gzip. Admin/Pro retain a >500 kB warning; builds pass. Load/performance budgets on actual phones still require measurement.

## Regression command detail

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
| `test:protein` | PASS |
| `test:protein-policy` | PASS |
| `test:protein-range` | PASS |
| `test:protein-budget` | PASS |
| `test:meal-progress` | PASS |
| `test:medical-safety` | PASS |
| `test:body-scan` | PASS |
| `test:landing` | PASS |
| `test:subscriptions` | PASS |
| `test:production` | PASS |
| `test:admin` | PASS |
| `test:experience` | PASS |
| `test:progress` | PASS |
| `test:mobile-meals` | PASS |
| `test:feasibility` | PASS |

## Not claimed / remaining release gates

- Native PostgreSQL **for this new migration** was not executed in this host. Phase 1 had already passed native PG in PR #10 CI; that is not proof for 024. The same native harness now runs both phases and adds concurrent different edits (one winner/stale loser), same-key retries (one version), and save-versus-permission-revocation. Review the new PR's native result before migration/deploy.
- Actual Supabase/PostgREST/JWT, current production OTP/CAPTCHA/SMS integrations were not exercised here. No real patient identity/consent or clinical engine endpoint exists in this slice.
- Real credential verification, legally approved processing authorization, full B2C questionnaire parity, invitation/phone recovery, licensed billing, immutable **approved prescriptions**, notification outbox, patient routing and tracking remain later work. Current immutable objects are intake revisions and permission/audit events, not prescriptions.
- History UI fetches up to 100 latest intake revisions; complete pagination/export is not yet implemented. Intake and permission commands use organization locks (safe coarse serialization for this test slice); clinical-scale throughput/load testing and finer aggregate locks require subsequent work.
- There is still no authorization to process real patients just because the sandbox is deployed on the shared Supabase. Synthetic capability/consent rows are explicitly separate and must never be converted to real credentials/consents.

## Safe review and rollout

Read `PHASE_2A_SETUP_FA.md`: apply patch on a new branch, review CI, backup, run only 024 once against the chosen existing project, provision a time-bounded synthetic capability through infrastructure and add practitioner test role, then deploy Pro. Owner must explicitly assign the case and simulate processing. Existing phase-1 fixtures and B2C tables/policies are left intact. The shared nutrition repair reaches B2C on deployment but changes search only for formerly infeasible unlocked plans; targets and safety/portion thresholds remain unchanged.
