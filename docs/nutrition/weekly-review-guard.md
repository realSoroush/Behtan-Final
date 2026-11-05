# E14 immediate guard / E17 regression

Base: 1f75c5b (same base as PR A; independent branch).

F02 reproduced before fix: 14 synthetic daily readings with weekly averages 100 and 90 kg returned `continue`. The new assertion failed on main, then passed after fix.

Until a clinically reviewed rate and uncertainty policy is approved, favorable direction does not certify a rate of weight change. Both small and large directional changes now request measurement review. No guessed kg/week or percent/week cutoff was introduced. The original 0.25 kg display-only stable band is retained; stable maintenance with valid data can still return `continue`. Hunger/adherence feedback retain priority. No energy target or stored weight is changed by this guard.

Dates are validated exactly, future entries excluded, non-finite/out-of-range readings excluded (using the existing 25–350 kg input bounds), duplicates/invalid relevant readings prevent `continue`. Fewer than three valid distinct readings in either week still yields no review. Evidence includes `descriptive-review-v2`, invalidating acknowledgements from the prior algorithm.

Tests: failing F02 regression then pass; existing progress tests including PGlite DB; new loss/gain/maintenance, small change, stable maintenance, invalid numbers, duplicate/future/invalid date and evidence version cases; TypeScript. Browser and real PostgreSQL/PostgREST are not claimed executed. Advanced trend smoothing, uncertainty, planning/reference weight and adaptive targets remain open in E14/E07.

No migration/environment/server/Studio change. Review PR and CI, then deploy member through existing Vercel pipeline. Verify weekly review 100→90 does not recommend continuing and requires a new acknowledgement. Rollback code only; keep all progress and acknowledgement rows.

E01–E18 status remains as in the initial audit; this PR changes only E14 immediate guard and E17 regression coverage. E14 is partially complete, not the advanced adaptation task. Suggested merge order: PR A intake/validators, then this independent guard, then allergen rollout.
