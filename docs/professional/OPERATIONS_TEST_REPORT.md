# Pro operations verification — 2026-10-21

Target baseline: GitHub main 67437eb020e5925b7b650a1a318c218f0a225486 (PR #12). The baseline blob hashes of modified files were compared with the GitHub tree and matched. No production mutation, deployment, real message or real payment was performed.

## Local passes

- 246 PGlite SQL assertions across existing and new suites. New coverage: server search/pagination, summary-only listings, tenant and practitioner scope, admin-only manual licensing/provisioning, confirmed-phone requirement, no duplicate workspace on retry, capacity, expired read-only access, suspension overriding pilot access, stale/idempotent changes, redacted events and cleanup preserving confirmed plans/drafts. Tables and server RPCs remain denied to ordinary clients.
- 54 server/HTTP assertions. The health adapter uses the actual Supabase SDK with mocked HTTP; it distinguishes missing configuration, wrong server key, missing migration, denied access and a healthy service probe without returning secrets. Failure telemetry tests verify metadata-only records. These are not live Supabase/PostgREST tests.
- 574 independently enumerated menu combinations, 14 UI-contract and 17 intake/medical permission assertions passed unchanged.
- 34 Pro Playwright scenarios and 12 admin Playwright scenarios passed on desktop/mobile. They run real React/Supabase clients with intercepted transport. Coverage includes search beyond the first page, expired read-only controls, service diagnostics, admin license edits and lost-response retries, stale protection, manual workspace provisioning and cleanup confirmation. Browser: separately installed Chromium 153, not the Playwright-matched revision; CI installs its matched browser. The direct Playwright download was unavailable locally.
- Production/auth/security/payments, admin, onboarding, protein, feasibility and routing regressions passed.
- B2C/Admin/Pro builds and server TypeScript passed; the API bundles for Node 24. No server secret references or server-only stage RPC names were present in the Pro client bundle. Existing bundle-size warnings remain.

## CI checks added but not run locally

Native PostgreSQL 17 adds a concurrent administrative-license change check. CI then creates a fresh disposable restore database, runs pg_dump/pg_restore from the same PostgreSQL container, and compares all synthetic table contents, sequences, RLS, policies, function definitions, effective grants and constraints using test:pro:recovery. Native PostgreSQL, real dump/restore and the updated GitHub workflow were not executed in this local environment. Their success must be checked on the PR before merge.

## Operating boundaries

The existing live generation error was not remotely reproduced: this environment cannot read the private Vercel project env, and the public endpoint fetch was inaccessible. Checking actual Production env and redeploying remains a manual action. The new diagnostic checks the deployed environment after authentication; no secret values are returned.

Manual organization licenses are not paid subscriptions/orders/revenue. No Pro purchase flow is added. Pilot-only workspaces retain old access until an explicit manual license is set. Expired active manual licenses allow read/download but deny writes; suspended licenses deny the organization's access. Capacity counts all cases, not archived/active patients.

Cleanup is bounded/idempotent, keeps published snapshots and matching confirmed drafts, removes only unpublished previews expired for over 24h and failure logs older than 90 days. Scheduling the job is a manual Supabase Cron action; this patch does not silently install it. Actual infrastructure backups, Storage-file backups and restore validation are external tasks documented in the runbook, not claimed as executed here.
