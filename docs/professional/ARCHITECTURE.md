> Current PDF-workflow update: real-cases-v2 plus operations (Migration 026) uses server generation and immutable confirmed snapshots. Manual organization licenses add capacity and read-only expiry; explicit suspension denies access. The reduced PDF path permits owners and assigned practitioners. Earlier sandbox-only/clinical-credential descriptions below apply to the older synthetic path. See OPERATIONS_SETUP_FA.md and RECOVERY_RUNBOOK_FA.md for deployment and operating boundaries. Pro paid checkout and patient linking are not implemented by this update.

# Behtan Professional — architecture baseline / 2026-10-19

> Historical phase-1 baseline. Current phase-2a implementation and limits: [PHASE_2A.md](PHASE_2A.md); setup: [PHASE_2A_SETUP_FA.md](PHASE_2A_SETUP_FA.md); current verification: [PHASE_2A_TEST_REPORT.md](PHASE_2A_TEST_REPORT.md). The prior protein regression is repaired in this slice.

## Authority and scope

Reviewed repository: `realSoroush/Behtan-Final`, main `61f0d19` (PR #9).
Input: `BEHTAN_PRO_MVP_PRD_v0.1_Vazirmatn(1).html`, v0.1. The founder's Production-Ready V1 instructions supersede its MVP framing and interview/sales gates. Interviews and purchase commitments are not prerequisites. Clinical authority, lawful processing, security review and explicit live-release approval remain prerequisites. No assertion of jurisdictional compliance is made by this architecture.

This branch delivers **Phase 1: isolated sandbox foundation**, not a complete or clinically released V1. Patient intake, clinical consent, engine generation, plan approval, patient claim, SMS and license billing are deliberately not exposed yet. A sandbox flag is not a substitute for consent or medical authorization.

## Repository gap analysis

| Area | Existing evidence | Gap / decision |
|---|---|---|
| Nutrition | `src/utils/mealPlanEngine.ts`, `nutritionHelpers.ts`; shared catalog and policy calculations; browser generation; mutable `ACTIVE_CATALOG` configuration | Extract an injected per-request engine context, retaining current B2C adapter. A server endpoint must re-read authoritative policy/catalog, validate inputs and recompute output. Never trust posted calorie/macronutrient totals. |
| Safety | `src/utils/medicalEligibility.ts` screening, supported ages and hard stops | Use the same versioned policy server-side. Practitioner status must not bypass hard stops. Recheck at generation AND publication. Clinician edit bounds require clinical approval before implementation/live release. |
| Identity | `src/services/auth/supabaseAuthAdapter.ts`, `PhoneAuth`, Supabase Auth | Reuse OTP, not custom password accounts. Server reads `auth.users.phone_confirmed_at`; neither client role nor editable user metadata is authority. Same Auth backend across origins does not mean automatic subdomain browser SSO. Add pro origin to CAPTCHA/auth configuration in staging. |
| Routing | `src/App.tsx` onboarding → eligibility → B2C billing → dashboard | Later add explicit source resolution before the B2C paywall. Professional plan access is not a fake `user_subscriptions` grant. Preserve independent B2C onboarding and billing. |
| Persistence | migrations 016/019, `daily_plan_snapshots`, `daily_plan_revisions`; browser-reported snapshots | Useful reporting, not clinician-signed immutable records. Create separate approved versions, approvals/publications and pro checkins. Do not reuse client-supplied snapshots as official prescription. |
| Provenance | `src/utils/planProvenance.ts` browser origin, FNV fingerprint | New server provenance: engine/catalog/policy versions, input snapshot, canonical SHA-256 digest. Integrity digest is not a legally valid electronic signature. |
| Catalog/policies | existing catalog and policy RLS includes restrictive personal billing access | Preserve these policies. A trusted authorized generation service reads shared catalog; patients read frozen approved snapshots. Do not weaken catalog RLS or mint B2C entitlements. |
| Admin | `src/admin`, migration 016 platform allowlist, migration 022 synthetic scenarios | Platform administrator is not clinic owner. Dedicated pro entry and tenant memberships. Platform verification endpoint is separate, audited and inaccessible to self-service clinic users. |
| Data isolation | current user-level ownership/RLS | New org-scoped keys and composite FKs; reception and clinical payload in separate tables. No default organization-wide clinical visibility. |
| Subscriptions | personal `payment_orders` / subscriptions and Zarinpal settlement | Add organization license/usage tables independently. License expiry stops new clinical work; published access respects its own validity/contract. No reuse of consumer order status as org authority. |
| Progress | B2C journal/checkins, profile history and mobile dashboard | New professional checkins reference publication/version; practitioner reads need active assignment + valid patient consent. No automatic multi-plan macro merge. |
| Notifications | existing OTP SMS/payment infrastructure | Separate clinical notification outbox with leases, retry/backoff, terminal failures, deduplication and reconciliation. Never tie publication success to SMS delivery success. |
| Operations | local Supabase template differs from deployed OTP config; no existing CI workflow | Migration replay/staging verification, native Postgres CI, separate pro build, release gates, operational monitoring and restore exercise required. Local config is not proof of live service settings. |

## Committed decisions

1. One product, Auth project and nutrition core; separate consumer, professional and platform-admin entries. Phase 1 adds `vite.pro.config.ts` and `/src/professional/main.tsx`; it never changes consumer routing or dashboard.
2. New exposed tables use `public.pro_*`, all with RLS, explicit privileges and narrow RPC writes. Definer helpers live in unexposed `pro_private`, pin empty `search_path` and reference qualified tables. Service credentials stay server-only. `anon` cannot use Professional RPCs. Table owners/superusers and trusted service_role are privileged infrastructure, not tenant callers; RLS is not a defense against a stolen service key.
3. Multiple roles per active membership: owner, assistant, practitioner. Owner handles operations/reception, not clinical authority. Verified nutrition scope + unexpired credential + active organization/member + active explicit assignment + valid processing authorization are all required for clinical access. A role name never proves credential validity. Phase 1 stores credential status but exposes no clinical actions.
4. Reception identity/contact data will be separate from intake/health data. The Phase 1 `pro_sandbox_patients` table is a test fixture namespace with generated case IDs only; it is **not** the future clinical patient registry and will not be promoted into it. No input field accepts patient names/phone/health data.
5. All tenant-owned relationships use `(organization_id, id)` FKs. A UUID is an identifier, never a capability. Patient record exists before Auth and may have a unique normalized phone per organization. No global phone lookup or cross-clinic “already exists” response. Normalization must handle Persian/Arabic digits and reject ambiguous/shared identifiers in Phase 2.
6. Link/claim only against server-verified matching phone + explicit acceptance. Invitation token is random, hashed at rest, short-lived, rotated on resend, opaque and carries no health data. Authentication is not consent. Recycled phone/change-number needs an approved verification/recovery policy; automatic linking by phone alone is prohibited.
7. Store clinical processing evidence (version, source, actor, time, scope), relationship acceptance and progress-sharing consent separately. Progress consent optional, revocable, expiring and enforced at query time, never just JWT claims. Revocation immediately prevents future provider reads. Retention/legal obligations may prevent deleting already approved clinical history; policy to be approved before live release.
8. Official draft is a server result. Edits carry `expected_revision`; stale writes fail with a conflict and never silently overwrite. Review digest matches the exact approved version. Approved versions are append-only, with corrections as new versions and lineage to the previous version. No browser regeneration, food swapping or automatic target updates on published clinical content. Patient logging never edits prescription.
9. Approve/publish is a transactional state machine. Publication checks credential/assignment/consent/license/eligibility/version inside the transaction; writes version/approval/access/outbox once using scoped idempotency keys and request hashes. Concurrent modifications serialize on the aggregate; mismatched reuse returns conflict. Publication and notification delivery are distinct statuses.
10. Patient program list combines independent B2C source and authorized published pro sources, with explicit selection and source label. Consumption belongs to a particular version. No professional subscription purchase required for eligible approved-plan access. Expiration/revocation states have a readable reason and no silent fallback/regeneration.
11. No public self-service pro access in Phase 1. A time-bounded `pro_pilot_access` allowlist + verified phone + org membership is enforced in SQL on every read/write. UI flag is only discoverability. One sandbox per invited owner, at most 100 generated fixtures per org. Revoke/suspend in DB; no JWT refresh required. Audit immutable for application roles; no raw medical contents in logs.
12. No production deployment from this branch. Synthetic data only; enable panel in a separate staging project. This is an architectural baseline; subsequent decisions that change these invariants require a documented ADR and regression tests.

## Target data ownership (following phases)

| Aggregate | Planned entities | Main invariant |
|---|---|---|
| Workspace | organizations, memberships, credential reviews, license/usage | owner ≠ prescriber; tenant isolation; last-owner protection |
| Patient | reception records, clinical intake revisions, assignments, patient links | reception ≠ health; explicit case assignment; global Auth identity can link to many orgs |
| Permissions | consent evidence/events, relationship acceptance, revocations | scope + purpose + version + effective time; no clinician self-granted patient progress consent |
| Prescription | plans, draft revisions, approved versions, approvals, publications | optimistic concurrency; immutable approved payload and server validation |
| Delivery | invitations, notification outbox/attempts, reconciliation | publish once; retry delivery separately; wrong-number recovery |
| Follow-up | publication-scoped checkins and progress sharing | patient writes own data; practitioner reads only currently authorized scope |
| Evidence | professional audit, provenance, access logs | append-only; minimum data; governed retention and access |

## Baseline regression finding

The unmodified main fails `test:protein` for a 125 kg weight-gain lacto-ovo profile with `MealPlanFeasibilityError`. The same failure reproduces on this branch; no engine behavior changed. Treat it as a pre-existing production-readiness issue, not a reason to relax portion limits or suppress the test. In addition, the diagnostics test still asserted the old 22% targets; this branch updates only its golden expectations to the existing 25% policy (1473/1518 kcal), with TDEE assertions.

## Release gates and unresolved policy decisions

These do not block sandbox engineering; they block real patient processing/release:

- Who verifies credentials, against which registry, jurisdiction, allowed professional scope, revalidation interval and revocation process? Clinical owner must approve editing limits and safe minimums; do not infer them from the coach's job title.
- Legal review: controller/processor responsibilities, consent copy/evidence, privacy notice, professional terms, hosting/transfers, support access, retention and lawful deletion. Choose actual hosting region and legal basis, not assumed “HIPAA/GDPR compliant” labels.
- Confirm default plan validity, continued access after license expiry, revocation meaning, critical result escalation and patient support/recovery. No hard-coded 30-day contractual claim yet.
- Threat model and independent review for tenant boundaries, Auth/session, invitations, webhook verification, service-role containment, audit access and backups; incident response and restore test.
- Staging live-stack tests: actual PostgREST/JWT, OTP/CAPTCHA, controlled SMS delivery, provider retry, payment/license webhooks and concurrency. PGlite + intercepted browser transport do not prove these integrations.
- Commercial validation: competitive research, synthetic scenarios and first real usage instrumentation now; retention, practitioner workload, paid conversion and willingness to pay in a controlled launch later. No invented specialist interviews or sales commitments.

## Competitive observations (primary sources, accessed 2026-10-19)

Healthie's invitation documentation describes provider assignment, expiring invitations, and separate provider portals when a client sees multiple practices. Nutrium documents client access to meal plans and tracking with provider-configured feature permissions. These support (as a design inference, not clinical validation) explicit assignments, separate source selection and granular progress permissions. They do not establish demand or regulatory suitability for Behtan's market.

- https://help.gethealthie.com/article/160-overview-inviting-a-client-to-healthie
- https://help.nutrium.com/en/articles/3372169-what-are-the-features-of-the-nutrium-mobile-app-for-nutrition-clients
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/functions/auth
- https://www.postgresql.org/docs/current/ddl-constraints.html
