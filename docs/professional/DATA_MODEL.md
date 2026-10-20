# Target data model and access contract

> Historical phase-1 baseline. Current phase-2a implementation and limits: [PHASE_2A.md](PHASE_2A.md); setup: [PHASE_2A_SETUP_FA.md](PHASE_2A_SETUP_FA.md); current verification: [PHASE_2A_TEST_REPORT.md](PHASE_2A_TEST_REPORT.md). The prior protein regression is repaired in this slice.

Status: architectural specification. Only the `pro_*` tables in migration 023 exist in this delivery. All tables below are subsequent-phase work unless marked P1. Do not build clients against unimplemented RPCs.

## Identity and tenants

| Entity | Fields / keys | Constraints and authority |
|---|---|---|
| `pro_organizations` (P1 sandbox) | uuid PK, mode, status, created_by, request_key, created_at | sandbox-only check in P1; unique creator/request; one sandbox per invited creator enforced under actor lock. Production organization lifecycle/licensing requires a later migration, not toggling a client flag. |
| `pro_memberships` (P1) | organization_id + user_id PK; roles[], status | owner/assistant/practitioner can coexist; identity immutable; org lock + last active owner protection. Client writes denied. |
| `pro_pilot_access` (P1) | user_id PK, expires_at | time-bounded infrastructure allowlist; independent of platform admin and billing. |
| `pro_practitioner_credentials` (P1 skeleton) | user_id PK, status, scope, expires_at, reviewed_at | no self-verification; clinical operations absent in P1. P2 adds verifying actor, registry/evidence and append-only review decisions. |
| clinical patient registry (P2) | id uuid, organization_id uuid, case_ref, normalized_phone nullable, contact_revision bigint, status | unique `(organization_id,id)` and `(organization_id,normalized_phone)` when phone not null; no global discovery. No FK from reception identity directly to B2C profiles. Reception metadata excludes health. |
| clinical intake revisions (P2) | organization_id, patient_id, revision bigint, normalized_answers jsonb, schema_version, recorded_by, processing_authorization_id, created_at | composite tenant FK; append-only revision, strict allowed keys/schema; constrained numeric/enum inputs validated server-side. No unbounded free-form payload accepted as authoritative. |
| care assignments (P2) | organization_id, patient_id, practitioner_id, status, effective/ended time | composite FKs to same org patient/member; assignment alone doesn't grant credential or consent. Changes audited and serialized. |
| patient links (P5) | organization_id, patient_id, auth_user_id, status, accepted_at, identity_revision | many organizations/practitioners per Auth user, one active link per org-patient; server-verified claim; immutable historical evidence. Wrong/recycled number recovery never silently reassigns an active link. |

P1 test data uses `pro_sandbox_patients` and `pro_sandbox_assignments`, not the clinical registry above. Generated labels contain no real phone/name/health values; they cannot be claimed by a patient. No synthetic rows are promoted into the clinical namespace.

## Permissions and consent (P2/P5)

Store immutable evidence/events rather than overwrite a boolean:

- `consent_evidence`: id, organization_id, patient_id, purpose (`processing`, `relationship`, `progress_sharing`), scope/version, source (`patient_self`, approved documented in-person flow), evidence_reference, actor, effective_from, expires_at. Evidence storage private; metadata not a public attachment URL.
- `consent_events`: consent_id, event_type (`granted`, `withdrawn`, `expired`, `superseded`), actor and time. Grant/supersession rules depend on purpose; a clinician cannot submit a patient's optional progress consent using their own authority.
- Effective permission evaluated from current rows/event state server-side for every request. Withdrawal is permanent for that grant, not undone by replaying an old grant request. New grant creates new evidence.
- Processing authorization before intake; patient acceptance before plan exposure; optional progress grant before specialist can read patient-entered follow-up. Do not conflate the three.

## Prescription aggregate (P3–P5)

| Entity | Fields | Invariant |
|---|---|---|
| care plans | id, organization_id, patient_id, author_id, current_draft_revision, state | aggregate lock; no cross-tenant references |
| draft revisions | plan_id, revision, based_on_revision, input_revision, structured components/quantities, server totals, engine/catalog/policy versions | edit requires expected_revision; bounded data; full server recompute; never trust client totals |
| approved versions | id, organization_id, plan_id, version, frozen_payload, canonical_digest, safety_result, created_at | append-only at DB level including trusted application service; unique plan/version and digest provenance; corrections create new row, no mutable pointer changing historical contents |
| approvals | approved_version_id, practitioner_id, credential_review_id, digest, approved_at | approved digest exactly equals reviewed frozen version; scope and effective credential valid at approval; stable evidence retained after later credential expiry |
| publications | id, organization_id, approved_version_id, patient_id, effective_from, valid_until, status | no silent mutation of prescription; immutable version FK; access status changes have audited events and reason |
| publication requests | organization_id, actor_id, operation, request_key, request_hash, result_publication_id | unique scoped key; same key/different hash conflict; replays return the same result only if still authorized |
| professional checkins | publication_id, approved_version_id, patient_link_id, plan_date, slot_id, patient_auth_id, status, actual_intake, revision | separate from B2C primary keys; active linked patient writes own data; checkin never modifies approved snapshot |

State transitions: draft → review-ready → approved → published. Editing review-ready returns to draft. Approved content is never editable; “correct” branches a new draft/version. Publications can expire or be withdrawn with evidence; a new publication never overwrites an old one. Draft generation failure produces no approved artifact. Approval and publish may be separate UX actions, but publication transaction rechecks every current permission and business rule.

## Licenses and delivery (P4–P7)

- Organization subscriptions: organization_id, plan/version, starts_at/ends_at, status, limits, settlement source, immutable settlement reference. Billing features and publication entitlements are server-owned. No clinician/browser can write effective license state.
- Usage ledger: organization_id, billable operation, scoped idempotency key, outcome, occurrence time; exact counting in publication transaction; retry is not another billable event. Corrections/refunds explicit events.
- Invitation: organization_id, patient_id/publication_id, token_hash, identity_revision, expires_at, attempts, accepted_at/revoked_at. Single-use claim. Resend revokes/rotates token; no names, calories or conditions in URL/SMS.
- Outbox: id, organization_id, publication_id, recipient/contact_revision, template/version, dedupe_key, status (`queued`, `leased`, `delivered`, `retry_wait`, `failed`, `cancelled`), attempt count, next_attempt_at, lease expiry, provider reference. Worker uses claim lease/`FOR UPDATE SKIP LOCKED`; attempt ledger retains status history. Before sending, recheck current recipient/invitation validity. Provider idempotency where supported; delivery reconciliation where provider outcome unknown. Promise no exactly-once external SMS when provider lacks idempotency; publication is exactly-once in our transaction.
- Professional audit: minimal actor/org/action/object/time/request correlation; successful state transitions atomic with evidence. Audit rejected attempts in a separate security channel without logging clinical payloads or invitation tokens. P1 event types cover sandbox creation only; full clinical/team/consent access audit remains future work.

## Authorization matrix (target; clinical columns not implemented in P1)

| Actor | Reception | Intake / draft / approve | Patient follow-up | Team/license |
|---|---|---|---|---|
| Owner without clinical qualification/assignment | org-scoped operational records | denied | denied | manage within owner capability; cannot verify own credentials |
| Assistant | permitted reception fields | denied | denied | no owner escalation |
| Verified assigned nutrition practitioner | assigned cases | allowed only with valid processing authority; edit/approve within supported scope | only valid optional grant | own membership/credential status |
| Practitioner without assignment or expired/revoked credential | no clinical access | denied | denied | own status only |
| Linked patient | own accepted relationships | only their published, authorized frozen versions | own log writes | no clinic administration |
| Platform admin | no routine clinical access | no default clinical authority | denied unless governed audited support process | verify credentials/ops in dedicated platform boundary |

UI visibility never authorizes a request. Tenant IDs, roles and patient IDs from requests are selectors, not proof. Every tenant table needs RLS, grants and composite FK tests. Trusted infrastructure services are minimized and audited; service-role leakage is a platform incident, not something RLS can contain.
