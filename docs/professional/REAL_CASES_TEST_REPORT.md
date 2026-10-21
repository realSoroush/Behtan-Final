# Behtan Pro real cases v2 — verification

Replacement for v1, based on the pre-v1 phase-2a tree. No production DB, Vercel deployment or remote Git mutation was performed.

## Observed passes

- 195 SQL assertions on PGlite with actual database roles/RLS, including legacy suites. Client-supplied forged 1-kcal target / 999999-kcal meal is rejected at the old RPC. Authenticated callers cannot stage or publish server drafts. Server-role-only stage/publish validates actor access, case/revision, draft ownership/expiry, retries and immutable confirmed snapshots. Native PostgreSQL is configured in CI but not run locally here.
- 40 server/service/real HTTP-boundary assertions. Generation uses the shared engine with a synthetic food catalog. Token/tenant dependencies are controlled doubles; this is not a live Supabase integration. Request answers/targets/plan/actor injection is rejected, medical blockers and stale revisions are enforced, and save accepts only an opaque server draft ID. Missing server enablement fails closed.
- 574 independently enumerated menu combinations across ordinary, resistance-training, dairy-allergy and vegan cases, satisfying unchanged calorie/macro bounds.
- 28 Playwright browser scenarios, 14 each desktop/mobile. React and Supabase client run in a browser with intercepted Supabase and generator transports. Tests cover create/edit/history/print, response-loss retries, restrictions/revocation, layout overflow, network loss during focus and periodic refresh, retained unsaved edits and recovery. Local Chromium executable was used; CI installs the version matched to Playwright.
- 14 UI-contract and 17 intake/medical permission assertions.
- Existing test:production (auth/security/payment), test:onboarding, test:protein, test:feasibility, test:medical-safety, test:meal-progress, test:admin, test:routing, test:body-scan, test:activity and test:mobile-meals passed.
- B2C/Admin/Pro production builds passed, including Pro with feature enabled. Server TypeScript passes; Node-24 server API entry bundles with esbuild. Client bundle scan did not contain service-role env references or server-only RPC names. Existing bundle-size warnings remain.

## Architecture checks

The browser only submits case/revision IDs, menu count/date/notes and retry keys. The server verifies the OTP user's token through Supabase Auth, reads the intake using that user's RLS, reads and validates the actual catalog/protein-policy rows, and runs the shared synchronous engine. Catalog installation and generation have no intervening await, preventing request interleaving of the existing module-scoped catalog. The generated preview is stored through a service-role-only RPC. Publish resolves that stored preview under the organization lock, rechecks current access and revision, and inserts the immutable confirmed snapshot. No client-calculated snapshot can use the previous direct RPC.

Transient network/5xx failures in case access polling and parent workspace refresh preserve state. Explicit revoked/denied access still clears confidential views. The form is memory-only: closing/reloading the page is not offline persistence. No names or health data are put into browser storage by the new form.

## Limits

No actual OTP, live Supabase/PostgREST, native PostgreSQL concurrency run, live SMS, Vercel function deployment or real patient test was performed. CI and post-deployment smoke tests are required to validate those boundaries. Preview rows expire but automatic data-retention cleanup is not installed. Clinical qualification/consent workflows and patient linking remain outside this reduced PDF-workflow scope. Dependency versions are unchanged; this is not a dependency security certification.
