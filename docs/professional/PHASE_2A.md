# Phase 2a — synthetic case records and intake permissions

Base: main `5bd9755` (merged PR #10). This slice repairs the existing nutrition feasibility regression and adds a usable **synthetic-only** case/intake flow to the existing Professional app. It does not release a clinical service, create patient Auth accounts, send SMS or grant B2C subscriptions.

## Delivered behavior

- Separate new case registry (`pro_case_records`); phase-1 `pro_sandbox_patients` are left intact. No automatic promotion or copying of legacy fixtures.
- Owner/assistant can create a generated reception case. No names, phones, images, external identifiers or medical fields exist on that reception row. Existing assignments determine practitioner reception visibility.
- Owner can explicitly assign an active member with practitioner role; owner is not automatically a clinician. Assignment commands carry scoped idempotency keys; replaying an earlier grant does not undo a later revocation.
- **Sandbox capability** is provisioned only by trusted infrastructure, expires, and has append-only review events. It is separate from `pro_practitioner_credentials`; no test permission can verify professional medical qualifications.
- Three independent, append-only simulated permission event streams: processing, relationship acceptance, progress sharing. Source is constrained to `synthetic_simulation` with notice version 1. They are not patient consent and cannot authorize real patient processing. Only processing simulation participates in the current intake gate; granting the other two does not authorize intake reads.
- Clinical intake read/write requires verified phone + valid pilot + active organization + active practitioner membership + valid sandbox capability + explicit active assignment + current unexpired processing simulation. Owner alone and assistant cannot select health payloads/history, including by direct REST SELECT.
- Bounded intake v1: gender, Gregorian birth-date storage/Persian date input, height/weight, goal, derived activity level, workout days/type, protein budget, diet pattern, allergy/medical enums, pregnancy/eating disorder status, medication/injury presence and safety confirmation/version. No arbitrary free text or trusted nutrition output is accepted. This is the basic intake slice, **not every B2C question**: detailed movement/steps, training duration/intensity, geographic and optional body-scan inputs remain future work.
- Database validates the exact allowed key set/types/enums/ranges, supported age 18–70, date, exercise consistency and safety confirmation. Store a hard-stop case for testing, but show the existing medical blocker; there is no generate/publish action. Future server generation must re-run the shared medical policy from authoritative stored inputs.
- Each save adds an immutable intake revision, processing evidence reference and audit record. Expected revision prevents silent overwrite. Idempotency binds organization + request key to actor/case/expected revision/JSON content. A lost response can retry the same request; changed input with reused key is rejected. Old history is read-only in UI and protected from UPDATE/DELETE in SQL.
- No intake payload is persisted in local/session storage. Only random request IDs for case creation are retained. Focus/visibility rechecks clear unauthorized health views. Stale write conflict requires refreshing the current version. Server validation failures keep inputs editable; ambiguous network failures retain the exact retry payload in memory.

## Tables and permissions (migration 024)

| Table | Patient payload? | Authenticated read | Write authority |
|---|---|---|---|
| pro_case_records | No, generated reception code only | owner/assistant or assigned practitioner | narrow creation RPC |
| pro_sandbox_capabilities | No, test access metadata | self + valid pilot | trusted infrastructure only |
| pro_sandbox_capability_events | No, test review history | self + valid pilot | DB trigger; immutable |
| pro_case_assignments | No, case/member mapping | reception-authorized roles | owner RPC |
| pro_case_assignment_commands | No, deduplication evidence | none | owner RPC; immutable |
| pro_case_permission_events | No, simulated purpose metadata | reception-authorized roles | owner simulation RPC; immutable |
| pro_intake_revisions | Yes, synthetic health answers | full clinical test gate | save RPC; immutable |
| pro_case_audit_events | No clinical payload | owner in org | transactional RPC audit; immutable |

Every new table has RLS and explicit grants. Composite tenant FKs include the referenced processing evidence, not only case and member IDs. Definer functions pin an empty search path. Private helper functions exposing consent internals are not callable by authenticated clients; policy helpers only answer actor-scoped access questions. No client or VITE service key is introduced.

All write RPCs lock the organization before validating current permissions. This serializes saves, simulated consent and assignments with existing membership changes. Expiry is checked in queries; JWT role claims are not authority. Native tests include concurrent edits/retry/revocation. Test capabilities are manually provisioned infrastructure and are not a complete professional verification/revocation workflow; real credential management is still a release dependency.

## Nutrition regression repair

Main's `test:protein` rejected the 125 kg / weight-gain / lacto-ovo / rest-day case. Target was 4288 kcal; normal template search settled at 4062 kcal (more than 5% under target), with otherwise near-target macros. Normal objective balanced per-meal realism and global fit, so it could settle just outside a hard acceptance boundary.

Only when the normal unlocked daily plan fails, one bounded retry prioritizes distance outside the **existing** calorie/macro feasibility envelope. It uses the same foods, portion candidate bounds, breakfast/meal mass rules and final feasibility assertion. Targets, protein factors, calorie adjustment and acceptance thresholds do not change. Locked consumed meals do not enter this new retry. The formerly rejected fixture resolves to 4075 kcal, P177.8/C608.3/F115 and passes the existing envelope. This is a feasible result, not a claim of optimality or clinical validation.

Tests verify determinism, unchanged target, practical portions/diet restrictions, and continued rejection of impossible targets. The original 60-case protein test remains unchanged and now passes; four extreme profiles still safely reject.

## Still deliberately absent

- Real patient contact registry, phone normalization/duplicate-number recovery and claim/linking.
- Patient-owned consent UX/evidence and approved legal wording; the simulation rows must never become live consent.
- Real practitioner qualification review UI/registry verification. Sandbox capability is not a credential.
- Full B2C-questionnaire reuse (this slice persists the bounded basic intake contract only).
- Server-authoritative draft generation, editing/approval/publication, immutable approved prescriptions and SMS outbox.
- Licensed organization billing/usage, patient multi-source routing and professional meal/progress tracking. Progress permission simulation has no progress data endpoint yet.

## Next slice / dependencies

P2b: real credential review and intake-contract completion behind live-release gates; define patient contact/identity and genuine processing authorization evidence. P3: extract server-authoritative nutrition engine with injected catalog/policy, supported edits and clinical hard stops. Do not enable real patients by changing a mode flag: the current schema deliberately constrains records/organizations to sandbox.
