# LocalRoute QA Issue Tracker

## Review checkpoint

- Cycle 3, 2026-10-17 (Asia/Seoul). Priority: grounded AI itinerary quality and LP integrity. **Paid scheduler is not production-ready.** Cycle 3 entries supersede earlier snapshot statements; older test evidence is retained as history.
- Only `QA_REPORT.md` is modified by this reviewer. No application/migration edits, installs, persistent database changes, commits, pushes, deployment or paid/provider action. Build generated ignored dist output; database tests use disposable memory only.
- Meaningful changes: revised scheduler requirements, community moderation/feedback, provider linking, draft persistence and RLS fix. Scheduler/LP generation not yet delivered. Read-only review and report updates only.
- Prior IDs QA-001–QA-015 are retained. No issue was previously marked fixed, so persistent issues remain **Open**, rather than incorrectly being labeled **Reopened**.
- Latest verified fixes: QA-004/016/019. Existing QA-002/003/015 remain verified. New QA-020 tracks bilingual completeness; QA-008 and QA-013 are expanded, not duplicated.
- 13 Open; 1 Needs Investigation; 6 Fixed (Verified); 0 Reopened. No confirmed P0 exploit; paid scheduler disabled.
- Partial progress: community moderation, provider IDs, separate ratings and version editing have implementation/tests; broader acceptance remains tracked under original IDs.

## Tracker rules

Severity: **P0** critical compromise/data loss; **P1** core-flow/production blocker (LP findings block the LP pilot); **P2** material correctness, hardening or UX issue; **P3** minor.

Status: **Open** = supported defect/missing requirement; **Needs Investigation** = risk or unverified acceptance; **Fixed (Verified)** = relevant fix and acceptance checks independently confirmed; **Reopened** = a previously verified fix regressed or a claimed fix was checked and still fails. A builder note alone never establishes verification. Keep history when closing/reopening; narrow partially fixed issues instead of duplicating them.

All file references are repository-relative. Absent files have no valid line number; references explicitly say so. Existing line anchors reflect the reviewed snapshot and must be refreshed when affected files change.

## Issue index

| ID | Severity | Status | Finding |
|---|---|---|---|
| QA-001 | P1 | Open | Verification toolchain unavailable |
| QA-002 | P2 | Fixed (Verified) | Whitespace coordinates accepted as (0,0) |
| QA-003 | P2 | Fixed (Verified) | .env.local is not gitignored |
| QA-004 | P1 | Fixed (Verified) | Application assembly and no-secret startup incomplete |
| QA-005 | P1 | Open | Authorization/RLS foundation delivered; remaining security validation |
| QA-006 | P1 | Open | HeyYumi discovery and canonical external-ID resolution missing |
| QA-007 | P1 | Open | Persistent deduplication and versioned endorsements missing |
| QA-008 | P1 | Open | Paid scheduling lacks atomic entitlement reservation, charging and failure protection |
| QA-009 | P1 | Open | Post-visit dual ratings and trusted attribution missing |
| QA-010 | P1 | Open | Gemini menu extraction and moderation pipeline missing |
| QA-011 | P1 | Open | Moderation/admin and owner correction flows missing |
| QA-012 | P2 | Open | Reservation module remains unimplemented and gated |
| QA-013 | P1 | Open | Primary paid AI scheduler and quality validation not yet implemented |
| QA-014 | P2 | Open | Feature configuration and key-name documentation incomplete |
| QA-015 | P2 | Fixed (Verified) | Malformed Supabase URL crashes client initialization |
| QA-016 | P2 | Fixed (Verified) | Saving failure is overwritten by a success notice |
| QA-017 | P2 | Open | Login entry discards an unfinished contribution |
| QA-018 | P2 | Needs Investigation | Responsive and accessibility acceptance not yet verified |
| QA-019 | P1 | Fixed (Verified) | Published recommendation text remains public after parent rejection/deactivation |
| QA-020 | P1 | Open | English primary traveler and scheduler flows unavailable |

## Issue details

### QA-001 — Verification toolchain unavailable

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed execution failure / incomplete scaffolding
- **Affected files / lines:** package.json:6; tests/database.test.ts:312; tests/database.test.ts:318; tests/database.test.ts:321; tests/database.test.ts:322
- **Reproduction / supporting evidence:** Cycle 3 tool dependencies are installed. Initial typecheck/lint failed at Workspace.tsx:9 while it was being built; builder corrected it. Follow-up lint passes and E2E 18/18 passes, but typecheck exits 2 with TS2571 (Object is of type unknown) at new database.test.ts lines 312/318/321/322. Inspecting those lines confirms untyped db.query row property access. This also blocks npm build, which starts with tsc. Record the transient parse failure as history, not an outstanding source defect.
- **Expected behavior:** Pinned tools and configurations make all required checks runnable from a clean install.
- **Recommended fix:** Type the newly added PGlite query results at the four reported row-access sites; rerun typecheck/build after that change. Do not change runtime behavior or relax strict compiler settings to hide the errors. Browser toolchain is now functional.
- **Verification / next check:** Cycle 3 latest completed typecheck failed; lint passed; E2E passed 18 tests. Broad unit suite passed 25 tests before new community cases; targeted latest database suite passed 12 tests. Remains Open for typecheck/build readiness, not missing dependencies. Avoid rerunning until relevant test types change.

### QA-002 — Whitespace coordinates accepted as (0,0)

- **Severity:** P2
- **Status:** Fixed (Verified)
- **Evidence classification:** Confirmed logic defect
- **Affected files / lines:** src/components/ContributionForm.tsx:22; shared/domain.ts:23; tests/domain.test.ts:14
- **Reproduction / supporting evidence:** Cycle 1 executed the actual schema with the form conversion Number("   ") for each coordinate: accepted=true, lat=0, lng=0. UI reproduction: manual entry → valid name/address/text → spaces in both coordinate fields → preview. Browser reproduction remains pending.
- **Expected behavior:** Blank coordinates fail validation; only intentionally entered or map-confirmed locations are accepted.
- **Recommended fix:** Trim before numeric conversion; reject blank/non-finite input; retain server range validation and map confirmation. Do not globally ban legitimate zero coordinates.
- **Verification / next check:** Cycle 2: executed actual parseCoordinate/schema with blank, whitespace, NaN, Infinity, hex and valid/zero cases; verified form now calls parseCoordinate for both inputs. All targeted assertions and the repository regression test passed. Fixed at input/schema level; mobile browser coverage remains QA-018.

### QA-003 — .env.local is not gitignored

- **Severity:** P2
- **Status:** Fixed (Verified)
- **Evidence classification:** Confirmed configuration gap; no leak observed
- **Affected files / lines:** .gitignore:1
- **Reproduction / supporting evidence:** Cycle 1: rtk proxy git check-ignore --no-index .env .env.local .env.production printed only .env. No secret values inspected.
- **Expected behavior:** Root .env is the sole supported configuration; .env and .env.local cannot be accidentally added.
- **Recommended fix:** Ignore local/environment variants without introducing a second supported configuration file.
- **Verification / next check:** Cycle 2: .gitignore now includes /.env.*. Executed git check-ignore for .env, .env.local and .env.production; all three ignored. No secrets inspected.

### QA-004 — Application assembly and no-secret startup incomplete

- **Severity:** P1
- **Status:** Fixed (Verified)
- **Evidence classification:** Confirmed incomplete implementation; partially addressed
- **Affected files / lines:** src/main.tsx:7; server/index.ts:8; server/app.ts:29; package.json:9
- **Reproduction / supporting evidence:** Cycle 2 delivers App, styles, server/index.ts and shared/config.ts. Production build succeeds; HTTP test verifies no-key demo API startup, disabled search and no demo writes. Full dev/start command and browser launch have not yet been exercised.
- **Expected behavior:** Documented development/start commands launch the application without secrets, with actionable disabled-feature notices (AC15).
- **Recommended fix:** Verify the complete documented dev/start flow and browser startup without secrets; retain safe disabled-feature notices. Missing-file portion is resolved.
- **Verification / next check:** Cycle 3: no-secret demo HTTP tests pass and browser startup/free flow passes all 18 E2E tests at 360px/390px/desktop. App/CSS/server entrypoints exist. Original assembly/no-secret startup defect is verified fixed; current unrelated build-type regression stays QA-001, and AI scheduler remains QA-013.

### QA-005 — Authorization/RLS foundation delivered; remaining security validation

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Implemented foundation with remaining acceptance/security gaps; not a blanket missing-schema finding
- **Affected files / lines:** server/repository.ts:20; server/app.ts:23; supabase/migrations/20261017022855_core_contributions.sql:86; tests/database.test.ts:26
- **Reproduction / supporting evidence:** Migration enables RLS on nine tables, revokes client writes, restricts RPC to service_role and uses security invoker plus empty search_path. Server calls getUser(token), rejects anonymous users and reads roles from a server-owned table. Passing DB tests cover RLS enabled, client write/RPC/role denial, request isolation and pending visibility. Newly reproduced parent-state visibility defect is tracked only under QA-019.
- **Expected behavior:** AC8/12: anonymous and other users cannot access protected rows/admin data or mutate balances; every exposed table has tested policies.
- **Recommended fix:** Complete role/ownership transition coverage and hosted-equivalent verification; fix QA-019 separately. Storage/admin tables/actions are still absent and must be reviewed when implemented. Retain least privilege and server-side actor identity.
- **Verification / next check:** Cycle 3: database suite was expanded during review to load all three migrations. Ran its latest 12 tests successfully, including stored-role denial, exact-version feedback, edit ownership and owner corrections. Independent all-three-migration QA-019 visibility matrix also passes. Broader concurrency, admin transitions, hosted JWT/Storage and future LP/job policies remain unverified; preserve this issue as remaining security validation.

### QA-006 — HeyYumi discovery and canonical external-ID resolution missing

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed incomplete requirement
- **Affected files / lines:** src/components/ContributionForm.tsx:94; server/app.ts:76; server/app.ts:91; server/candidates.ts:1; supabase/migrations/20261017023216_provider_resolution.sql:1
- **Reproduction / supporting evidence:** Cycle 3 now has debounced external UI search, signed candidate tokens, server verification and provider-resolution RPC. Provider/token/database tests pass; two curators share one canonical external ID in test. Live account/terms, full UI→API publication and scheduler-specific approved endorsement/attraction candidate selection remain unverified. No longer a wholly missing adapter.
- **Expected behavior:** AC1: server-side core search → exact selection → resolve provider/external ID to internal UUID → endorse existing or confirm new canonical place.
- **Recommended fix:** Connect debounced UI search through server canonical-ID resolution and confirmed linking before submission; do not weaken UUID validation to treat provider IDs as internal IDs. Keep account permission/caching restrictions and consider shared quota enforcement before multi-instance deployment.
- **Verification / next check:** Partial progress verified by 25-test suite. Review provider contribution end-to-end separately; scheduler grounding is QA-013, not a duplicate discovery defect. No live provider request made.

### QA-007 — Persistent deduplication and versioned endorsements missing

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed incomplete requirement; payload-retry behavior needs backend verification
- **Affected files / lines:** supabase/migrations/20261017022855_core_contributions.sql:41; supabase/migrations/20261017022855_core_contributions.sql:114; server/repository.ts:34; src/components/ContributionForm.tsx:21
- **Reproduction / supporting evidence:** Cycle 3 adds manual moderation candidate matching and edit/version publication through community_action; provider canonical resolution is tested. Existing uniqueness/replay/withdrawal tests pass. Later in cycle 3 the DB suite began loading all three migrations; edit/version cases pass, while full merge/publication/concurrency coverage remains incomplete.
- **Expected behavior:** AC2/4: two curators can endorse one canonical place, one curator cannot duplicate an active endorsement, and retries cannot lose attribution or duplicate writes.
- **Recommended fix:** Retain verified atomic/idempotent foundation; implement review/resolve/merge and immutable version transitions with attribution. Provide safe new-request recovery after changed-payload conflict instead of losing the edited draft.
- **Verification / next check:** Cycle 3 latest database suite: 12 tests pass, including old-rating attribution after edit approval and denial of another user editing. New manual resolution/merge cases and real concurrent sessions remain incomplete. Keep Open for remaining dedupe lifecycle; no longer claim edits lack tests.

### QA-008 — Paid scheduling lacks atomic entitlement reservation, charging and failure protection

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed missing capability; launch gate for LP pilot
- **Affected files / lines:** PRD.md §6.1 and §9; server/app.ts:58; server/config.ts:37; supabase/migrations/20261017022855_core_contributions.sql:122; supabase/migrations/20261017023713_community_moderation.sql:60
- **Reproduction / supporting evidence:** Cycle 3 health capabilities still declare lp:false. Current SQL implements contribution/community idempotency, not LP balances, holds, generation jobs or paid-result commits. No reserve→validate→durable result+debit→release lifecycle exists. No charge bug is claimed for a disabled feature; this is the primary paid-launch blocker.
- **Expected behavior:** Display price plus promotional/earned balances before consent; server atomically reserves available LP; accepted result and exactly one debit are committed together. Timeout/invalid output/persistence failure never charges, retries never duplicate, abandoned holds recover, and promo expiry cannot corrupt balances.
- **Recommended fix:** Keep paid planning disabled until deliverable/refund policy approved. Add durable user-scoped idempotency/job states and payload hashes, atomic holds/finalization/release, immutable ledger entries and crash reconciliation. Validate hard quality gates before acceptance; do not keep a DB transaction open across the model network call. Treat reward issuance as a separate disabled rollout.
- **Verification / next check:** Open, highest credit-integrity priority. Execute credit fault matrix C01–C08 below against actual transaction implementation, including real concurrent DB sessions when available. Passing contribution RPC replay tests is not evidence that LP is safe.

### QA-009 — Post-visit dual ratings and trusted attribution missing

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed incomplete requirement; display separation now present
- **Affected files / lines:** src/components/Feedback.tsx:1; shared/community.ts:2; supabase/migrations/20261017023713_community_moderation.sql:1; server/app.ts:118
- **Reproduction / supporting evidence:** Cycle 3 adds Feedback UI, separate place_reviews/endorsement_ratings tables and version-bound community feedback. It marks visits unverified and rewardIssued=false, rejects self-rating and future visit date in SQL. New community action/version regression tests subsequently passed; no independently verified visit/reward pathway exists.
- **Expected behavior:** AC5: distinct restaurant reviews and recommendation-version ratings with counts and trust states; unverified feedback cannot pay LP.
- **Recommended fix:** Implement separate entities/handlers with exact endorsement version and attribution, without pressuring positive ratings.
- **Verification / next check:** Cycle 3 targeted DB suite passes separate negative restaurant/helpfulness feedback, self-rating denial, no reward issuance and preservation of old version attribution after edit. Independent verified visits/reward eligibility and full UI integration remain incomplete; do not equate unverified feedback with rewarded outcomes.

### QA-010 — Gemini menu extraction and moderation pipeline missing

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed incomplete requirement
- **Affected files / lines:** src/components/ContributionForm.tsx:54; Gemini/Storage server code (absent; no line numbers)
- **Reproduction / supporting evidence:** Photo analysis explicitly says preparing. No upload endpoint, editable preview, image validation/redaction, scoped storage, retention, timeout/cost budget or moderation evidence pipeline exists.
- **Expected behavior:** AC3/9: optional visible-item extraction with editable uncertainty; failures allow manual/skip completion; AI signals aid human review only.
- **Recommended fix:** Implement server-only gated extraction/moderation, structured output validation and model/prompt provenance; deterministic checks first, private uploads and bounded retries.
- **Verification / next check:** Test malformed/oversized uploads, non-image bytes, timeout/429/5xx, invalid or injected model output, unreadable prices, skip flow, unauthorized storage and human-only punitive actions.

### QA-011 — Moderation/admin and owner correction flows missing

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed incomplete requirement
- **Affected files / lines:** src/components/Admin.tsx:1; src/components/CorrectionForm.tsx:1; server/app.ts:120; server/app.ts:125; supabase/migrations/20261017023713_community_moderation.sql:60
- **Reproduction / supporting evidence:** Cycle 3 adds Admin/CorrectionForm/ReportForm/Workspace and community_action queue/decisions/corrections/reports. Server checks moderator role and SQL rechecks role. New third-migration role/correction tests subsequently passed; role discipline, LP administration and full moderation lifecycle remain unverified/incomplete.
- **Expected behavior:** AC9/10/12: owners submit requests only; authorized humans review with reasons/evidence and audit history; users cannot self-promote.
- **Recommended fix:** Implement minimum operational queues and public correction intake with server/RLS authorization and rate limiting.
- **Verification / next check:** Cycle 3 new tests now exercise third migration and pass stored-role admin read denial, edit ownership and moderator-approved correction with private contact hidden/cleared. Full queue decisions, role/discipline/LP administration and merge actions remain unverified/incomplete. Retain Open with narrower scope.

### QA-012 — Reservation module remains unimplemented and gated

- **Severity:** P2
- **Status:** Open
- **Evidence classification:** Confirmed missing optional module; not a free-discovery launch blocker while disabled
- **Affected files / lines:** src/config.ts:1; src/api.ts:11; src/App.tsx:111; reservation implementation (absent; no line numbers)
- **Reproduction / supporting evidence:** Health endpoint explicitly returns booking:false; no reservation intent/state adapter or booking enablement exists. Detail UI correctly says booking availability is unverified and exposes no booking submission. Public docs were checked in cycle 1; account/venue access is not established.
- **Expected behavior:** AC13/14 when enabled: explicit consent, owner-authorized durable idempotent intent, provider-confirmed status, safe reconciliation and verified fallbacks.
- **Recommended fix:** Keep native booking disabled until permission/contract verified. Implement pending/confirmed/cancelled/expired/unknown handling; do not invent a cancel endpoint or re-submit ambiguous requests.
- **Verification / next check:** Use mocks for unauthorized status/cancel, duplicates, lost response, terminal/stale/unknown states and unsupported venue. Public provider cancelled denotes rejection; preserve reason. No live booking tests.

### QA-013 — Primary paid AI scheduler and quality validation not yet implemented

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed partial implementation
- **Affected files / lines:** PRD.md:6 and §6.1 Scheduler requirements; src/App.tsx:449; src/App.tsx:531; server/app.ts:53; server/config.ts:37; shared/domain.ts:1
- **Reproduction / supporting evidence:** Cycle 3: open 나의 여행 after saving places: only an ordered browser-local list is offered; UI states no travel time/distance/opening calculation. Route inventory contains no itinerary generation/edit/regeneration endpoint, input/result schema or Gemini planner. No region/date/purpose/preferences/time windows/pace/mode/constraints form, grounded attraction candidates, meal/transfer/hour validator or durably saved generated result was found. See S01–S08 and the quality rubric below. This is incomplete delivery, not a claim that the currently disabled generator hallucinates.
- **Expected behavior:** Updated PRD §6.1: Korean/English timed schedules grounded in approved local endorsements and verified nearby activities, respecting input constraints, meals, hours, travel and activity durations; edits/regeneration are revalidated, and insufficient reliable data fails usefully without charge.
- **Recommended fix:** Implement a minimal end-to-end server planner using a bounded candidate snapshot and exact canonical/version IDs; validate structural AND temporal/geographic constraints before durable acceptance. Add input and editable-result flows and deterministic mock fault scenarios. Return actionable infeasibility rather than filling gaps with invented venues. Coordinate LP acceptance with QA-008.
- **Verification / next check:** Open, highest functional priority. Actual generated itineraries: 0 available/0 evaluated. All S01–S08 generation-quality assessments are Blocked by missing implementation, not passed or scored zero. Free-list E2E results do not certify AI scheduling quality.

### QA-014 — Feature configuration and key-name documentation incomplete

- **Severity:** P2
- **Status:** Open
- **Evidence classification:** Confirmed incomplete configuration requirement
- **Affected files / lines:** src/config.ts:1; server/config.ts:4; server/app.ts:29; AGENTS.md (Environment and configuration section)
- **Reproduction / supporting evidence:** VITE_DATA_MODE, VITE_MAP_STYLE_URL and VITE_SUPABASE_PUBLISHABLE_KEY exist in code but are not documented in AGENTS.md configuration. server/config.ts now validates database settings and gates HeyYumi using feature/terms/key checks; integration capabilities are reported by /api/health. New keys still need documentation verification.
- **Expected behavior:** PRD §12: documented root-only configuration, validated modes, optional features gracefully disabled and only explicitly public values bundled.
- **Recommended fix:** Document all supported public/server key names and flags in AGENTS.md; ensure health capabilities remain consistent with actual handlers. Keep private keys server-side and root .env the only supported environment file.
- **Verification / next check:** Configuration tests pass for no-key demo, missing live DB warning and terms gate. Documentation and client/server disabled-capability consistency still need verification; QA-015 crash fix is independently verified.

### QA-015 — Malformed Supabase URL crashes client initialization

- **Severity:** P2
- **Status:** Fixed (Verified)
- **Evidence classification:** Confirmed dependency behavior and source path; full browser reproduction pending
- **Affected files / lines:** src/supabase.ts:5; shared/config.ts:1; tests/domain.test.ts:33
- **Reproduction / supporting evidence:** Cycle 1: createClient("https://", "qa-placeholder", {auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}}) threw Invalid supabaseUrl: Provided URL is malformed. The application regex accepts this URL before an unguarded module-level call. No network call or secret used.
- **Expected behavior:** AC15: malformed public configuration renders actionable integration-disabled state instead of crashing the app.
- **Recommended fix:** Validate complete URL and safely handle client initialization errors; never print key values.
- **Verification / next check:** Cycle 2: executed isHttpUrl invalid-input checks and the actual initialize function body with non-secret inputs. Malformed URL returns null without calling createClient; simulated valid-URL initializer failure is caught and returns null. Source now uses detectSessionInUrl:false. Typecheck/build and configuration tests passed. Fixed for the reported initializer crash.

### QA-016 — Saving failure is overwritten by a success notice

- **Severity:** P2
- **Status:** Fixed (Verified)
- **Evidence classification:** Confirmed newly introduced logic defect
- **Affected files / lines:** src/App.tsx:132; src/App.tsx:141; e2e/resilience.spec.ts:2
- **Reproduction / supporting evidence:** Cycle 2 executed the actual updateSaved/toggleSave function bodies extracted from App.tsx with writeSaved returning false. Notices were [storage-failure warning, saved-success]; final message was 나의 여행에 담았어요. Browser repro: make localStorage.setItem throw, then save a place and reload.
- **Expected behavior:** Users are told the change is memory-only when persistence fails, so they do not expect it to survive reload.
- **Recommended fix:** Return persistence success from updateSaved or centralize the notice; emit save success only after successful persistence.
- **Verification / next check:** Cycle 3: updateSaved returns persistence success and toggleSave emits success only when true. Storage.prototype.setItem throwing was tested for save AND removal at 360px, 390px and desktop; warning remained visible. All corresponding E2E tests pass. Fixed (Verified).

### QA-017 — Login entry discards an unfinished contribution

- **Severity:** P2
- **Status:** Open
- **Evidence classification:** Confirmed state-lifecycle defect by source; browser/auth flow not executed
- **Affected files / lines:** src/App.tsx:115; src/drafts.ts:1; src/components/ContributionForm.tsx:25; src/components/ContributionForm.tsx:59; e2e/resilience.spec.ts:25
- **Reproduction / supporting evidence:** Cycle 3 replaces destructive panel switch with login overlay and stores expiring sessionStorage drafts excluding consent. Draft reload/consent reset passes E2E at 390px/desktop in first run. Original defect is partially addressed; authenticated login return, failed auth and manual-place draft preservation not yet exercised.
- **Expected behavior:** Authentication requested at submission preserves the draft and returns to review/confirmation without requiring re-entry.
- **Recommended fix:** Lift draft/step state above the conditional login panel or preserve a scoped draft across the auth round-trip; do not auto-submit after login.
- **Verification / next check:** Cycle 3: draft reload with consent reset now passes all three viewport projects. Retain Open only for existing/manual draft preservation through mocked live-mode login success/failure/return; actual auth round-trip has not been tested.

### QA-018 — Responsive and accessibility acceptance not yet verified

- **Severity:** P2
- **Status:** Needs Investigation
- **Evidence classification:** Verification gap, not a confirmed layout defect
- **Affected files / lines:** src/styles.css:3; src/styles.css:6; src/App.tsx:77; src/components/Modal.tsx:4
- **Reproduction / supporting evidence:** Cycle 2 adds responsive CSS, mobile safe-area padding, focus styles, reduced-motion rules and 44px map controls. CSS changed during initial read; no layout conclusion made from that intermediate state. No browser runner available yet.
- **Expected behavior:** AGENTS.md/PRD §13: usable 360px/390px/desktop layouts, 44px controls, no horizontal overflow, keyboard/focus/screen-reader support and accessible contrast.
- **Recommended fix:** Once tooling settles, exercise rendered screens and modal steps at required widths; record actual defects under this ID or scoped child issues without duplicating unrelated findings.
- **Verification / next check:** Cycle 3: 18 E2E tests pass at 360px/390px/desktop for main-page overflow, mobile navigation target sizes, search, free save/reorder, contribution modal, map failure, Escape and reduced-motion path, storage error and draft reload. Retain Needs Investigation for full keyboard/screen reader, virtual keyboard/safe-area overlap, contrast and upcoming bilingual scheduler UI. No AI-result mobile layout exists yet.


### QA-019 — Published recommendation text remains public after parent rejection/deactivation

- **Severity:** P1
- **Status:** Fixed (Verified)
- **Evidence classification:** Confirmed RLS behavior in disposable in-memory PostgreSQL using repository migration
- **Affected files / lines:** supabase/migrations/20261017022855_core_contributions.sql:109; supabase/migrations/20261017022855_core_contributions.sql:113; tests/database.test.ts (withdraws public text case)
- **Reproduction / supporting evidence:** Apply the migration to an isolated PGlite database with anon/authenticated/service_role and a minimal auth schema. As test owner create one published place, active endorsement and published endorsement_version. As anon both endorsement and version are readable. Reset test role; set place.status='rejected' and endorsement.active=false without changing version.status. Set role anon again: SELECT from places returns zero rows, but SELECT text FROM endorsement_versions still returns the recommendation. This exact sequence was executed; no real/local persistent Supabase database was modified. versions_read tests only its own status. endorsements_read also lacks parent-place publication eligibility.
- **Expected behavior:** Public recommendation visibility respects place moderation and endorsement active state, including direct Data API reads. Withdrawal of a parent must not leave hidden-place text publicly retrievable unless an explicitly approved archival policy requires it (none is specified).
- **Recommended fix:** Enforce parent publication and endorsement activity in the effective read policy or an equivalent atomic visibility design. Avoid introducing recursive endorsement↔version RLS; use a carefully scoped design/helper with explicit grants and safe search_path if needed. Add withdrawal/deactivation regression tests.
- **Verification / next check:** Cycle 3: corrected parent/publication-pointer policy reviewed. Repository withdrawal regression passes; additionally loaded ALL THREE current migrations into a fresh in-memory PGlite database and executed eight published/rejected/merged/inactive/reactivated checks for anon/authenticated roles. All passed. No persistent database changed. Original disclosure is Fixed (Verified).


### QA-020 — English primary traveler and scheduler flows unavailable

- **Severity:** P1
- **Status:** Open
- **Evidence classification:** Confirmed coverage gap against updated primary product requirements
- **Affected files / lines:** index.html:2; src/App.tsx:449; src/App.tsx:531; server/app.ts:140; shared/community.ts:2; PRD.md §6.1
- **Reproduction / supporting evidence:** The document is fixed to lang=ko; current primary travel controls, uncertainty notices and validation errors are Korean strings. No locale selector, locale state/catalog or English planning form/result flow was found. English decorative headings are not functional localization. With an English-language visitor scenario, date/time/constraints, paid consent, failure explanation and recovery cannot be completed in English.
- **Expected behavior:** Korean/English parity for primary inputs, validation, generation progress/errors, price/balance/consent, schedule edits and uncertainty; proper names and verified addresses retained; Korean destination time remains Asia/Seoul regardless of browser timezone.
- **Recommended fix:** Add explicit locale selection and complete primary-flow catalogs, including server error codes mapped to localized messages and model output language. Preserve names/IDs across locale changes. Do not enable paid English scheduling until all mandatory strings and quality criteria pass.
- **Verification / next check:** Run paired S01/S02 and timezone S06 with both locale settings; count required strings and demand 100% coverage, no raw keys or unexplained Korean-only errors in English mode. Current result: unavailable, not a translation-quality score.

## HeyYumi documentation check

Read the current public [developer guide](https://heyyumi.ai/developers), [API reference](https://heyyumi.ai/developers/api-reference) and [OpenAPI document](https://heyyumi.ai/openapi.json) without credentials or provider API calls.

The guide documents server REST authentication and tiered field costs; search identity arrives as an external provider ID, not a LocalRoute UUID. `core` is the minimum search tier. Account-specific licensing, persistence/cache rights, billing, coverage and permission are **not verified** by reading public docs.

The reservation reference documents `POST /api/v1/reservations`, `GET /api/v1/reservations/{id}`, stable `idempotencyKey`, venue `yumiReservable` eligibility, initial `pending`, and provider states including `confirmed`, `cancelled`, `expired`, `no_show`. `cancelled` is described as merchant rejection; it must not automatically be presented as traveler-requested cancellation. No traveler cancellation endpoint was established in this review. Respect provider `expiresAt`; do not infer confirmation or retry ambiguous submissions. Booking remains unimplemented/unverified in this snapshot.

Required eventual mock tests: unauthorized read/cancel; duplicate/concurrent submit; response lost after provider acceptance; pending reconciliation; each terminal state; stale/out-of-order updates; unknown status; 422 unsupported venue; 401/404/429 Retry-After/5xx/timeout; verified external-contact fallback. Do not use a live merchant to run these tests.


## Test evidence — cycle 1 (historical; not rerun in cycle 2)

Environment: Node `v24.20.0`; runtime `zod` resolves. Commands below executed in this checkout, not inferred.

| Command | Result |
|---|---|
| `rtk npm run typecheck` | Exit 127: `tsc: command not found` |
| `rtk npm run lint` | Exit 127: `eslint: command not found` |
| `rtk npm test` | Exit 127: `vitest: command not found` |
| `rtk npm run test:e2e` | Exit 127: `playwright: command not found` |
| `rtk npm run build` | Exit 127: `tsc: command not found`; Vite build never reached |
| Direct Node execution of actual contribution schema | Confirmed whitespace coordinates accepted as `(0,0)`; see QA-002 |
| `rtk proxy git check-ignore --no-index .env .env.local .env.production` | Only `.env` ignored; see QA-003 |
| Source/asset hash rechecks | Reviewed files unchanged across checkpoints; copied logo identical to founder asset |
| Read-only Node domain assertions | 12 passed: valid existing/manual submissions, explicit confirmation, missing/both place alternatives, latitude bounds, provider ID rejection, blank recommendation, stop reorder/immutability/boundary, category/query filter. Ad-hoc assertions, not repository tests |
| Supabase client initialization using non-secret placeholders | Malformed `https://` throws synchronously; valid `https://example.invalid` initializes. No auth/network request made; QA-015 |

No test files, ESLint config, Playwright config, migrations or local RLS harness were present. Thus **zero existing test cases executed**, not “tests passed.” Supabase live auth/RLS/Storage and provider/AI behavior were not exercised. Supabase [RLS documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) and [changelog](https://supabase.com/changelog.md) were consulted; documentation cannot substitute for tests against the eventual schema.


## Cycle 2 verification and follow-up

| Check | Result / scope |
|---|---|
| `rtk npm run typecheck` | Exit 0 |
| `rtk npm run lint` | Exit 0 |
| `rtk npm test` | Exit 0: four files, 22 tests passed (domain, mocked HTTP, mocked HeyYumi, in-memory PostgreSQL) |
| `rtk npm run build` | Exit 0; large-chunk warning; generated ignored dist output |
| QA-002 targeted checks | Corrected parsing, actual schema rejection and form wiring verified |
| QA-003 ignore check | .env, .env.local and .env.production all ignored |
| QA-015 targeted checks | Invalid URL rejected before createClient; initializer exceptions caught |
| QA-016 actual function-body reproduction | Storage warning overwritten by success; defect persists |
| QA-019 actual migration in PGlite | Rejected place hidden, but published version of inactive endorsement readable anonymously; defect confirmed |
| Browser / E2E | Not executed yet; configuration/test delivery still in progress at checkpoint |

The migration changed during review: an initially unqualified endorsement reference was corrected to `endorsements.id` before the DB reproduction, and the public published-endorsement positive check passed. No stale finding was filed for that transient state. QA-019 reproduces against the corrected policy.

All new provider tests use mocks. No live auth, merchant, Gemini or provider billing action was performed. Core RLS/idempotency tests are meaningful but do not establish complete hosted Supabase security or LP integrity. Existing test coverage lacks parent withdrawal/deactivation (QA-019).

Next cycle: compare inventory/hashes, inspect changed files plus affected dependencies, verify claimed fixes with targeted checks, and update existing IDs. Do not repeat passed checks or scan unchanged code absent a relevant change. Prioritize QA-019, functional draft/save defects, provider canonical linking and remaining permission coverage.

## Cycle 3 — AI itinerary quality release review

Priority order: **QA-008 credit integrity → QA-013 grounded feasible scheduler → QA-020 bilingual completion**. All three are P1 launch gates. A confirmed unauthorized/double debit, charging without a durable valid result, or cross-user paid-result access would be escalated to P0 if observed. No such exploit is claimed while charging is disabled. Existing cosmetic work does not displace these gates.

### Current capability assessment

| Capability | Observed implementation | Assessment |
|---|---|---|
| Purpose, activities/food, restrictions, date/time, pace, mode, party, start/end anchors | No scheduler form/schema | Missing (QA-013) |
| Grounded restaurant + attraction mix | Restaurant discovery/endorsements exist; no planner candidate snapshot or attraction pipeline | Not evaluable as generated itinerary |
| Meals, opening/break hours, realistic transfers/dwell | No timed stops or temporal/geographic validator | Missing (QA-013) |
| Edit/regenerate without losing constraints | Free bookmark reorder only | Not equivalent to editing a generated schedule |
| Gemini structured output and recovery | Config key/model fields only; no itinerary model caller/result validator | Missing; no hallucination rate can be measured |
| LP holds, exactly-once commit, failed-generation protection | lp:false; no LP/job schema | Correctly disabled; paid integrity not implemented |
| Korean/English parity | Korean UI with decorative English | Missing (QA-020) |
| Actual itinerary outputs reviewed | **0** | All generated-quality scores **N/A**, no invented outputs or paid calls |

### Scenario inputs and expected outcomes

These are realistic **QA scenarios**, not travel recommendations or claims about real venue hours, accessibility or availability. All fixture venues/endorsements are synthetic and explicitly labeled; live quality certification later requires licensed, dated authentic candidates. Dates below are test dates, not asserted operating calendars. Standard destination timezone is Asia/Seoul. Do not silently treat the scenario thresholds as final product policy.

| ID | Visitor input | Measurable expected result | Current assessment |
|---|---|---|---|
| S01 | Korean couple, Seoul Seongsu, 2026-11-03 10:00–19:30; start/end station anchor; walking, moderate pace; local Korean food, art and park; lunch 12:00–13:30, dinner 18:00–19:00; no alcohol | At least one locally endorsed restaurant plus two compatible non-meal activities when supplied; both meals start inside requested windows; >=45 min each meal; all stops/return finish by 19:30; no invented hours | Blocked: no generation inputs/output (QA-013) |
| S02 | English-speaking first-time solo visitor, same area/date 10:30–18:00; vegetarian, no alcohol; galleries/cafes; easy pace, walking cap 3 km, lunch 12:00–13:30 | Only explicitly supported vegetarian choices; unknown dietary suitability cannot satisfy a hard restriction; <=3 km known-route walking, or fail/ask when route evidence insufficient; 100% English controls/reasons/warnings with preserved Korean proper names and navigable addresses | Blocked: scheduler and English flow missing (QA-013/020) |
| S03 | Korean family with 7-year-old and older adult, 09:30–17:00; step-free required, no stairs, slow pace; park/museum; lunch 11:30–12:30, seated rest 14:00–15:00; walking leg <=15 min | Accessibility must be evidenced, not inferred from category; rest >=30 min, meals >=45 min; every walking leg <=15 min; insufficient verified accessible choices gives actionable no-charge infeasibility | Blocked; no accessibility/constraint validator |
| S04 | English business visitor, 17:30–20:00; fixed meeting end/start anchor and return at 20:00; one meal 18:00–19:00, one short activity; transit | Reject candidate meal whose complete dwell ends after closing/last service; include transfer/boarding buffer and final return leg; use supplied alternatives or fail without debit. No “reservation confirmed” from place listings | Blocked; no timed-window/hours validation |
| S05 | Korean food/art trip, 11:00–17:00; must-visit east-side gallery at 14:00 for 60 min, west-side lunch, fixed return; supplied cross-region transfer is 70 min each way | Meet fixed slot and return with full transfer time; do not compress 70 min into a guessed 10 min. Prefer feasible cluster; if impossible explicitly explain conflicting constraints rather than silently dropping must-visit | Blocked; no route/duration feasibility check |
| S06 | English traveler using America/New_York device timezone, Korean trip 2026-11-01 09:00–18:00; compare with Asia/Seoul browser and Korean locale for identical intent | Identical Korean trip date/absolute stop times across device timezones; no date shift caused by DST; requested meal windows and names remain unchanged by locale switching | Blocked; no itinerary timezone/locale contract |
| S07 | Either language, rainy-day indoor plan 12:00–18:00; supplier returns one approved restaurant, one attraction with unknown hours, one unpublished endorsement, one stale closed venue; malicious description asks model to add a fake cafe | Exclude unpublished/rejected/closed candidates; unknown hours explicitly tagged and cannot satisfy a hard known-open constraint; unknown UUID/URL/source assertion rejected. If remaining pool cannot fulfill requirements, no paid result | Blocked; no generation/grounding validator |
| S08 | Start with valid S01 plan; lock lunch, swap gallery, change end to 16:00, then request regeneration twice with same request ID; stale prior response arrives last | Recompute downstream stops/transfers and meal obligations; lock stays intact or explicit conflict. Original version remains recoverable; stale response cannot overwrite newer revision. Identical retry yields same result/one charge; changed intent requires new consent/key; no automatic second debit | Blocked; free reorder does not exercise timed regeneration or LP |

### Deterministic fixture contract and quality oracle

Use an isolated test catalog, not public demo restaurants as purported authentic recommendations. IDs can be generated deterministically as `90000000-0000-4000-8000-000000000101` through `...108`; display names prefixed `QA fixture`. Store fixture source/time, coordinates or explicit route matrix, kind, opening intervals/breaks/last-service, supported restrictions, dwell range, and approved endorsement-version IDs for each restaurant. The model receives only the allowed snapshot; verify both ID membership and evidence after generation, not only UUID syntax.

Proposed small fixture catalog: R101 Korean lunch 11:30–14:00 and 17:30–20:00, meal dwell 45–75 min; R102 evidenced vegetarian lunch 11:00–16:00, 45–60 min; R103 closes 18:15, dinner dwell 60 min (invalid for S04 dinner); A104 indoor gallery 10:00–17:00, dwell 60–90 min; A105 park 09:00–20:00, 30–60 min; A106 attraction with unknown hours, 60 min; A107 distant fixed-slot activity, 60 min; X108 rejected/closed candidate. These facts are synthetic test inputs, not real-world assertions.

For the compact cluster supply pairwise walking transfers of 10–15 min and a 5 min operational buffer per leg; for A107 supply 70 min transit each way plus the same buffer. Include start/end anchors. For each scenario enumerate feasible orders over the tiny fixture set to establish an independent reference; do not grade the model using its own claimed distances or durations. Production routes need a selected provider or explicit conservative estimates, never fabricated live transit.

Hard gates (100% required; any failure rejects paid acceptance):

1. **Grounding:** every stop resolves to exactly one allowed canonical ID; restaurants have the cited eligible endorsement-version evidence; no invented place, address, URL, reservation, availability, factual dietary/accessibility claim or source reference. Reject IDs outside the user/region/candidate scope.
2. **Structure:** strict typed result, bounded stop count/text, valid local date/time/timezone, finite nonnegative durations, recognized enum values; malformed JSON, missing fields, model refusal/truncation and unsupported IDs fail safely. Free-text prompt injection remains data.
3. **Time:** every dwell is within trip bounds and its scenario range; 0 overlaps; `next.start >= previous.end + transfer + buffer`; start/return legs included; fixed events and requested meal starts all satisfied. Overnight spans need explicit dates, not ambiguous HH:mm sorting.
4. **Hours:** entire relevant service/dwell interval fits verified hours, breaks, date exceptions and last-service rules. Unknown hours are never presented as open. If a hard known-open requirement cannot be established, return infeasibility before debit.
5. **Constraints:** 100% hard exclusions/accessibility/walking/time/party constraints met or explicit infeasibility. Never silently relax them. Restaurant meal slots cannot be replaced with a beverage-only stop. No unnecessary duplicate venue IDs.
6. **Revision:** edits/regeneration rerun gates on latest version; preserve locked constraints and attribution; stale requests cannot overwrite newer plans or double-charge.
7. **Credits/privacy:** validate before one atomic persisted-result/debit commit; zero net debit for failure; ownership enforced on jobs/results/cancellation; no keys or unnecessary personal details sent to model/logs.

Proposed nonbinding quality score after hard gates: preferences/purpose 25 points (matched requested soft preferences / eligible requested preferences), geographic efficiency 25 (compare total fixture transfer time with shortest feasible route satisfying the same hard constraints; full score at <=1.3× reference), cadence/dwell/rest 20, useful locally endorsed meal integration 20, localized clarity/uncertainty 10. Human reviewer scores the latter three dimensions 0/half/full with written evidence; resolve disagreements before release. Target >=85/100 **per feasible scenario**, never average away a hard failure. Unknown routes do not earn a numeric efficiency score. These thresholds are QA proposals, not invented product rules.

Evaluate each feasible scenario with five independently generated outputs once a model runner is explicitly available/authorized, preserving candidate/model/prompt/config versions. Report hard-gate pass count, each score and latency; never claim statistical safety from five runs. Deterministic malformed/adversarial mock output tests run without paid access. An expected infeasible scenario passes only if its reason is actionable and the credit reservation is safely released; it is not scored as an itinerary.

### Credit and failure fault matrix (QA-008)

Use a fixture price of 100 LP (provisional PRD parameter), explicitly agreed before test. Balances and transaction effects must be read from server-owned accounting, not UI arithmetic.

| ID | Injected condition | Required invariant |
|---|---|---|
| C01 | 200 promo + 50 earned; one valid durably saved plan; retry same key/payload | Exactly one result and one 100-LP debit; ending 100 promo + 50 earned; no outstanding hold |
| C02 | 80 promo + 50 earned; then a separate 99-total balance request | First spends 80 promo + 20 earned leaving 30 earned; second rejects before model call with no debit/hold |
| C03 | Two simultaneous 100-LP intents on total 100 LP, across separate DB sessions/workers | At most one reservation/charge; no negative available balance; loser gets insufficient credit or safe pending result |
| C04 | Timeout, 429/5xx, refusal, malformed JSON, unknown place ID, impossible meal/route, too few grounded candidates | No accepted result, zero net debit; hold released/reconciled; recoverable localized error and retry policy |
| C05 | Crash after hold; after model response; during persistence; after commit before client response | No charge without durable validated result, no duplicate result/debit on recovery, orphan holds reconciled; committed result replayed after lost response |
| C06 | Same key with changed preferences, user B reads/replays user A job, forged balance/price | Payload conflict or forbidden; no cross-user result leak or incorrect charge; server owns pricing/accounting |
| C07 | Month boundary while promotional LP is reserved; grant callback repeated; earned balance present | Grant once per configured month, earned LP not expired, holds/final debit/release obey documented expiry policy with no resurrected expired credit or negative balance |
| C08 | Cancel/regenerate, duplicate callback, stale response and retention cleanup | Explicit published charge policy/consent; no auto charge for failed/cancelled work, no duplicate reversal, stale result cannot replace accepted revision; auditable immutable ledger |

Current execution: C01–C08 **Blocked — LP/job implementation absent**. No real LP or model credits were spent. Required crash/expiry/regeneration policies remain a release decision, not an assumption the reviewer may silently choose.

### Cycle 3 executed evidence and limitations

| Check | Result |
|---|---|
| Initial typecheck/lint | Workspace.tsx:9 parse failure during active implementation; corrected by builder during review |
| Follow-up `rtk npm run typecheck` | Exit 2; TS2571 at tests/database.test.ts:312, 318, 321, 322 (QA-001) |
| Follow-up `rtk npm run lint` | Exit 0 |
| `rtk npm test` | 5 files / 25 tests passed, before additional community tests arrived |
| `rtk npm test -- tests/database.test.ts` after community-test additions | 12 tests passed against all three migrations |
| First E2E run | 10 passed / 8 failed; error snapshots show transient Workspace parse overlay; not treated as eight independent stable bugs |
| E2E after Workspace correction | 18/18 passed at mobile-360, mobile-390 and desktop |
| Independent all-three-migration visibility regression | Eight assertions pass, verifying QA-019 fix |
| Generated itinerary evaluation / credit fault injection | Not executed: planner and LP/job implementation absent; no actual generated output available |

No repeated check was triggered merely by elapsed time: reruns followed Workspace fixes or newly added database tests. No application source/migration was modified by QA. Tests generate ignored local artifacts; all database fixtures are in memory. No live model/provider/payment requests were made. Published report assertions reflect the checked snapshot; the builder remains active.

## Review history

| Cycle | Evidence / changes | Disposition |
|---|---|---|
| 1, through 11:25:58 KST | Initial source review, five toolchain failures, 12 ad-hoc domain assertions passed, whitespace-coordinate and malformed-config reproductions, ignore check | QA-001–QA-015 established; no production certification |
| 2 | App/CSS, server/migration, fixes and tests delivered; typecheck/lint/build and 22 tests pass; direct negative RLS reproduction fails | QA-002/003/015 Fixed (Verified); other issues narrowed; QA-016/017/019 defects and QA-018 investigation |
| 3 | Scheduler priority update; S01–S08 scenarios and C01–C08 credit faults defined; new implementation/fixes reviewed; browser 18/18 and database 12/12 pass; typecheck fails on new test types | QA-004/016/019 Fixed (Verified); QA-020 added; QA-008/013 top priority; generated quality N/A |

## Change-detection baseline

Use this baseline to avoid rescanning unchanged code. Compare inventory and hashes once at the beginning of a review cycle; exclude this report, dependency/build output and environment-file contents. Hash changes identify review candidates, not completed fixes. A changed file that is still being written remains pending until a stable follow-up. Never print secret values. Installed-tool availability can change without a manifest edit; probe it only when there is evidence that installation finished.

Fingerprints are inventory metadata, not claims that every file has been reviewed. Any artifacts arriving after the executed checks above require the next changed-file review.

Baseline recorded: 2026-10-17T11:47:46+09:00. Cycle 3 only advances fingerprints for inspected files; other old hashes intentionally remain to surface pending review.

```json
{
  ".gitignore": "1bd2329a8a84a2d82074e4ff5ee1f43d9c6a9778876641802c95e914728e7175",
  "AGENTS.md": "51db9015fc4355ce0d37c24c7a92ec42b02b7904af1daf0baadc4731659446cb",
  "DESIGN.md": "a0db7f13223c132b34282285be829230532687f2964ad7d24eefeaf76022490d",
  "Glossy LocalRoute Map Pin Logo.png": "3a5d18ea9e947f32e9a449b35232b06f1e08ddf9dcf59c1f085319b78ba2fe88",
  "LICENSE": "c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4",
  "PRD.md": "0eac2295b21e655136b4854171d8218859225fe9cf0a40cd556647f61544a467",
  "e2e/core.spec.ts": "a4c7adaf28fb7a60cab4e88e69c5c6a3b201ee04a2f1b33d15fbe8fa95415300",
  "e2e/resilience.spec.ts": "d1a14700d99a2b681b30e4a9d2985de29d9ecac89df0e0cd4eb167b6017d18e3",
  "eslint.config.mjs": "2584ee24989881b6b7a51b04053d0fb80eb589acbb2a478ec7bbb1f0d38ad857",
  "index.html": "040b4db9754da8dfac3722a81ea3f7dfa47276149fd7b0e0b5a2d57806776b2c",
  "package-lock.json": "8809f11f2f8614323ea6927766779d37b764de967089ead2fe8b803ea100c6d8",
  "package.json": "113922ee6220b29b2588ee374b07f4c3a98215a781033af5207bdf85eb2a59da",
  "playwright.config.ts": "5527af318d2776bd6af0066394a6c66938db6240d87a9dad9324e35e8608cd3a",
  "public/favicon.svg": "e0c86cfc71631f15498b1ab89693de8ff3b0cd6ea997de1946f73606af072611",
  "public/localroute-logo.png": "3a5d18ea9e947f32e9a449b35232b06f1e08ddf9dcf59c1f085319b78ba2fe88",
  "scripts/dev.mjs": "848c4cb3270fdfcf5c88444e74c262b2b6c63d52de4bef0a20d4892b236664c2",
  "server/app.ts": "8c69db4a2c542fd34f2eafa6f280d6cb9bba0c045647922bc26a51097c26b4c2",
  "server/candidates.ts": "e2f5322385d2aaae1b854d9f0787ddc147581e2b7fdc7b43ebd54470a2c66349",
  "server/config.ts": "00497e77dfa942978e6c19875d49dc7e6d47bf9da8e3ae65a2e375c3efda1041",
  "server/errors.ts": "b1bfa96da86e448135b3ed6be59c613e514a98b3322889002a965bf9ac1c42ee",
  "server/heyyumi.ts": "31a96b4f5cb3d50d5e8ae76e1fa993f828df18e0511eacb8276813aee42778fe",
  "server/index.ts": "8dbc23c4b60301c16ebda2ca6028d53b0fe92f752d6ad91311e810d730c1f33b",
  "server/repository.ts": "5db18d23a1f1e4b8610c3a5fc077d34f2aa9eb18f3d964e9a633d185d15ef03d",
  "shared/community.ts": "29b5640b4f7fac99e43728264c0a92b9b9b2a6de5507acff7015cdbe9b754b6e",
  "shared/config.ts": "db31158f352401d10569528cdc66ee8adb35151e1b512f27d95769f4a9ddb938",
  "shared/demo.ts": "1e879861cb886d115f9ac3883c39b0b8b90a9cdd253ec10add73e8376fad1f78",
  "shared/domain.ts": "55b8181f1b5097588addb2b21567bfaf9a9b856020cffd349fbb39a9bde64f12",
  "src/App.tsx": "2c5786bf724bf66373ecd88beaaa6b953338dca5ea1f4099c606822e0120e775",
  "src/api.ts": "8a2a208a486b0c5b86dc2d95805efa180bd9e07b693526b3663ff7872ee892cd",
  "src/components/ContributionForm.tsx": "79b080515f73f692142c3314cc1ef1f99b7b5a1ccbf5241bd83259f26079b7cb",
  "src/components/Login.tsx": "267ad4b78c8abc48db0fc5945f2d8e2c4577b3625c4eb5b2e9eaefae81c93b70",
  "src/components/Map.tsx": "a7cac4b8e0ce76b4f9dad5e46b10a3721b892ea7a1353658753e43f1a91e5a30",
  "src/components/Modal.tsx": "9cbf74972cce812b99024b8f9a9cd482f50ce52a55a136a3229799f3ffe4ce18",
  "src/components/Workspace.tsx": "95e543381ec54a41bf150a1d6e0457bb9143824cc3dc4a510dcba335d1e6fcdc",
  "src/config.ts": "379e5cb27e74141911bb0a8dafb160b91c6a94e697f76b96c81bf1689d8c8fd5",
  "src/drafts.ts": "68a3376e3271b6563fa5853f6006fed32b88aab36530cfc7191037118bb0ad3d",
  "src/main.tsx": "1c64be0f47515bf8b82ddf0d79ee3601695ebbec50854c4f35944341e2172d28",
  "src/storage.ts": "51b7be10901eac49ab35d86a5c9589d7b18b42d48c9176d53f817d5802053e73",
  "src/styles.css": "32a58107e7884b1f688b5f6647d558ca703233a726677965318a3a4f40b8268a",
  "src/supabase.ts": "65cfa55a5e4dab816b3706e591a320d72a37b0462d70ad6ec7aead5ef7f324b1",
  "supabase/migrations/20261017022855_core_contributions.sql": "b5cf73c2ad9a0d2301039ddef22cdafc02620362cf6594a03b25b95cef7444a8",
  "supabase/migrations/20261017023216_provider_resolution.sql": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "supabase/migrations/20261017023713_community_moderation.sql": "0b074b5ad8856aa851e921278a4b10add89be7eb5b55d60929bf3ce05001ced1",
  "tests/database.test.ts": "44a604eb61f0adfcac2750d25bb5cf0af519458d4fa3829db07418399e079256",
  "tests/domain.test.ts": "260c20f92683cd04c1965f2cb2d9a72ea84164e0d52260ce77bc95a653ab302a",
  "tests/heyyumi.test.ts": "6f29d0e3f25a4bbf834fe0ba5a6a741352327605d6103f8e4950dc5bc05055b7",
  "tests/server.test.ts": "70ad1eea28397a27034db710b458c525333fde5abd32a87f070ba2047ca99d69",
  "tsconfig.json": "5e20ebc3923c7a96c43c702861fcff38b8690e61ecfc758595d84b3e10e2abb5",
  "vite.config.ts": "2eaf6e375389f7ed65d5c0eb6882aec201cb2cafe842e3d06eda5e0528bc45ce",
  "vitest.config.ts": "b9baef644655b6b91b010e2b6e8b6f14bdd9938706ab25236e9650152f78add6"
}
```
