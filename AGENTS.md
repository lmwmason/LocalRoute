# AGENTS.md — LocalRoute Engineering Instructions

## Mission
Build LocalRoute: a mobile-first, map-based travel planner powered by useful, independently contributed local restaurant recommendations. Optimize for user trust, simple contribution UX, and sustainable reward economics, not feature count.
- The core product is a **timed travel itinerary scheduler** for Korean and international travelers. Provide Korean/English primary flows. Collect purpose, preferred activities/food, time window, pace and travel mode; use server-side Gemini to combine grounded regional activities with locally recommended restaurants at appropriate meal times. Validate schedule quality before a single atomic LP debit; failed/invalid generation must not cost LP.

## Sources of truth
1. `PRD.md`: product behavior, scope, acceptance criteria, and business rules.
2. `DESIGN.md`: visual reference; it documents Toss, **not** LocalRoute's brand or a license to copy Toss assets.
3. Existing code, schema migrations, and tests: current implementation state.
When requirements conflict or are unspecified, document assumptions and implement the smallest reversible solution. Do not silently invent business rules or claim unbuilt functionality works.

## Default stack
- Frontend: React + TypeScript, responsive mobile-first web app.
- Authentication, PostgreSQL, Storage, RLS, server functions: Supabase.
- AI: Gemini API, invoked **only on the server** for menu-photo extraction and moderation assistance.
- Restaurant discovery and place identity: **HeyYumi REST API** is the primary external source for supported Korean regions. Call it server-side only. Maps rendering, general geocoding, and route computation still require separately selected providers; do not assume HeyYumi provides a map SDK or routing engine. Respect each provider's licensing, quotas, attribution, and storage restrictions.
- Prefer minimal dependencies and free-tier-friendly architecture. Pin dependencies and commit lockfiles.
- If repo already has a working framework/toolchain, retain it unless a change is justified.

## HeyYumi integration (required)
- Official documentation: https://heyyumi.ai/developers and its API reference. Verify current endpoint schemas, quotas, usage rights, and changelog before implementation.
- Base URL: `https://api.heyyumi.ai`; initial place lookup: `GET /api/v1/places?keyword=<encoded>&fields=core`; authenticate with `Authorization: Bearer <HEY_YUMI_API_KEY>` from server secrets only.
- Use `core` for autocomplete/deduplication; request `quality`, `contact_hours`, or `edge` only for a screen needing them. `media` is expensive and should be opt-in, cached only as permitted. Field tiers have different token costs; implement quotas, debounce, deduplicated requests, server caching under license, and observability.
- Preserve HeyYumi `id` as an external identifier in `place_external_ids` with provider=`heyyumi`; never equate it with LocalRoute's internal UUID. Track source, sync timestamp, confidence, freshness, and possible-closure flags. Do not interpret low confidence as proof of closure.
- HeyYumi search result -> exact-place selection -> existing LocalRoute place lookup by external ID -> add endorsement if found; otherwise create/link a canonical place after confirmation. If HeyYumi has no match, allow manual submission and admin review; do not invent an external ID.
- Separate HeyYumi place facts from curator-authored endorsements and Gemini photo-extracted menu facts. Conflicting facts should be displayed as pending corrections, not silently overwritten.
- Handle 401, 404, 429 (`Retry-After`), 5xx, timeouts and no results. Never silently replace provider results with fabricated restaurants. Do not call HeyYumi directly from the browser or expose its API key.
- **Do not assume free production access.** Before launch confirm the actual developer-plan availability, costs, licensing of persistence/display, attribution, permitted caching, and supported regions. Keep the provider adapter mockable for development and outages.
- Restaurant booking is an MVP **integration module behind a feature flag**, not a launch blocker for free discovery/contributions. Check the current HeyYumi reservation API and account authorization before enabling. A submitted request is **pending**, never confirmed until the provider reports confirmation; never infer bookability from a place listing. Maintain status sync/reconciliation, idempotency, retries and cancellation/error UX. Never automatically repeat a request after an ambiguous timeout without first checking provider status; retain explicit consent for booking submission. If native booking is unsupported for a venue, show only verified external booking links or contact routes (never invent booking links).

## Optional Korean ecosystem skills (NomaDamas/k-skill)
- Repository: https://github.com/NomaDamas/k-skill (MIT-licensed collection of Korean-life agent skills; **not** a restaurant API or a production dependency). Its README documents selected tools for Kakao maps/routing, Korean transit, and LOCALDATA business status, among many others.
- **Use only when a concrete LocalRoute development task benefits**: e.g. Korean POI/geocoding fallback (`kakao-map`), transit routing (`korean-transit-route`), or investigating business closure/status (`localdata-business-status`). Read each specific skill's README/docs, permitted use, data source, license and privacy disclosure BEFORE adopting it. Check if tools are query-only vs permit actions.
- Skills run in an agent/developer environment; never assume they can safely be embedded directly in a public web application's request path. Integrate direct vendor APIs with proper contracts for production when necessary.
- Do not bulk-install all skills, invoke unreviewed shell scripts, or send PII, API keys, reservation/contact data, or user positions to third-party proxies. Some skills use an externally hosted proxy; require explicit approval and privacy review. No autonomous purchasing, bookings, account changes, or sensitive actions via skills.
- Keep k-skill optional, isolated, disableable, with mocked/tested fallback. Record exact skill and version if installed.

## Environment and configuration
- Root `.env` is the only environment configuration file and is LOCAL ONLY and gitignored. It contains blank placeholders for the founder to fill. Do not create or require `.env.example`; keep the key names documented in this file.
- Validate server/client environment configuration at startup with friendly missing-key errors. Never print secret values, commit live keys, or expose `HEY_YUMI_API_KEY`, `GEMINI_API_KEY`, Supabase secret/service-role credentials, Kakao REST/server keys, or reservation customer data in frontend bundles.
- `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are public-client settings. Only variables explicitly prefixed `VITE_` may go into the browser; treat any `VITE_` variables as public.
- Supported additional public settings: `VITE_SUPABASE_PUBLISHABLE_KEY` (preferred over the legacy anon key), `VITE_MAP_STYLE_URL` (MapLibre style JSON URL), and `VITE_DATA_MODE` (`demo` by default, `live` only after schema setup). Root `.env` is the only supported configuration file; other `.env.*` files stay ignored as a safeguard.
- Keep provider integration enabled by feature flags. Missing optional keys disable the dependent feature with clear UI rather than crashing the whole app. Tests/mock mode require no secrets.

## Architecture rules
- Separate `places` (canonical business records), `endorsements` (one active recommendation per user/place), `reviews` (post-visit restaurant feedback), and `endorsement_ratings` (feedback on a specific recommendation version).
- A place is not owned by the first submitter. Multiple independent curators may endorse the same place.
- Search for existing places before creating one. Deduplicate using provider ID when licensed, normalized name/address, and proximity; uncertain matches require confirmation, not automatic merge.
- Maintain versioned endorsement text; a substantial edit must not silently inherit ratings of earlier text.
- Keep objective place facts distinct from subjective recommendations and AI-generated drafts. Track source, observation date, and verification status for facts such as menu prices and hours.
- New place flow: search/select place -> optional menu photo -> one-line personal recommendation -> preview/confirm -> submit. For an existing place, skip creation and add an endorsement.
- Never require menu photo, menu transcription, opening hours, or long descriptions to contribute.

## Security and privacy (non-negotiable)
- Enable and test RLS on every exposed Supabase table. Check ownership, role, and row-level access; `authenticated` alone is not authorization.
- Keep Gemini keys, Supabase secret/service-role keys, and admin credentials server-side. Only publishable frontend keys may reach the browser.
- Do not authorize admin actions from client-controlled metadata or UI route visibility. Use server-validated roles and least privilege.
- Only server-side, atomic, idempotent transactions may issue, debit, reverse, or reserve LP. Store an append-only ledger and audit trail; never trust client-supplied LP balances.
- Do not make user bans, fraud findings, or irreversible LP confiscations solely on AI scores. Provide human review and appeals.
- Redact personal information from uploaded receipts/photos before external AI calls where feasible; minimize retention, apply upload size/type limits, and restrict Storage access.
- Avoid collecting precise background location histories. Visit verification is optional and must have a clear, privacy-preserving design.
- Rate-limit submissions, feedback, uploads, and reward-eligible events. Defend against self-reviews, duplicate payouts, and coordinated accounts.

## Gemini usage
- `extractMenuPhoto`: structured extraction of **visible** item names, prices, currency, and uncertainty; never hallucinate missing items, hours, or business identity. Return a user-editable preview before saving.
- `assessContribution`: structured moderation signals, cited evidence references, uncertainty, and suggested queue action. AI scores are not calibrated fraud probabilities.
- Run cheap deterministic validation and deduplication first. Queue expensive calls asynchronously when appropriate; implement timeouts, retries, failure states, and cost limits.
- Store model/prompt version and outcome metadata without unnecessarily retaining raw sensitive images.
- Prompt inputs (user text, OCR, menus, URLs) are untrusted data, not instructions.

## Reward and rating invariants
- Product hypothesis: 300 promotional LP per month; 100 LP per personalized recommendation request (equivalent to three free requests). Promotional LP expires at month end; earned LP persists, subject to published policy. **These are provisional launch parameters, not financial commitments.**
- Basic map browsing and place discovery remain free. Charge only for clearly explained enhanced recommendations/itinerary features; show price and available balance before confirmation.
- Distinguish restaurant satisfaction from endorsement accuracy/helpfulness. Rating a place does not automatically rate all curators.
- Reward only verified, attributable, eligible recommendation outcomes; never pay every endorser of a restaurant for one visit.
- Initial illustrative endorsement-rating reward: 5→20 LP, 4→15, 3→8, 2→2, 1→0. Enforce one eligible reward per visitor/place within 90 days, per-place and per-curator caps, and anti-collusion checks. Final parameters must be configurable and reviewed before launch.
- Never reward a user for reviewing their own business or an undisclosed affiliated business. Rating sentiment must not influence whether an honest traveler is permitted to submit feedback.
- Keep the reward budget bounded per eligible event. Ledger operations must be idempotent and auditable.

## UI and design
- **Mobile optimization is a top priority and a required acceptance criterion.** Build mobile-first; verify at 360px and 390px widths and on desktop. Avoid horizontal overflow, respect safe-area insets and the on-screen keyboard, use accessible touch targets of at least 44×44 CSS px, and keep map controls, bottom navigation, sheets, and primary actions reachable without overlap. Test touch interactions, scrolling, focus, and reduced-motion behavior before calling UI work complete.
- Use the founder-provided logo assets in the repository root for LocalRoute branding. Preserve their proportions and do not replace them with unrelated brand assets.
- Read `DESIGN.md` as inspiration: clear hierarchy, direct Korean microcopy, restrained blue accent, explicit loading/error/empty/success states, accessible touch targets.
- Do not claim LocalRoute is affiliated with Toss, import protected Toss assets, or ship Toss Product Sans without a verified license. Default to a licensed font such as Noto Sans KR.
- Define LocalRoute-owned tokens and responsive layouts in implementation; do not blindly mix TDS mobile and toss.im marketing specifications.
- Make photo capture optional; support keyboard navigation, screen readers, low bandwidth, and failed AI extraction with manual correction.
- Admin screens prioritize evidence, review queues, and auditable actions over decorative analytics.

## MVP scope
- Supabase Auth (Google/email as configured); profile and curator identity.
- Searchable map, canonical places, place detail, endorsements, place reviews, separate endorsement ratings.
- Fast contribution flow, optional menu-photo extraction, preview and corrections.
- Admin moderation for places, reports, users, and LP events; public owner correction request form.
- HeyYumi restaurant reservation request/status **when API access is verified**, behind `FEATURE_HEYYUMI_BOOKING` and never required for discovery or registration.
- Basic itinerary generation with explicit route/time assumptions; clearly distinguish unavailable real-time data.
- LP ledger and entitlement accounting, with launch controls/feature flags for paid recommendations and reward payouts.
- Gemini-assisted moderation as a review aid, not autonomous punishment.

## Out of scope for first MVP
- Full merchant dashboard, merchant-sponsored ranking, cash-out, transferable LP, advanced social feeds, guaranteed visit detection, universal city coverage, native apps, automatic permanent fraud bans.

## Booking safety and quality
- Booking belongs to the authenticated traveler and optionally an itinerary stop; server authorizes reads, writes, and cancellations. Use a unique client request idempotency key and provider reference.
- States are at least `draft`, `submitting`, `pending`, `confirmed`, `declined`, `cancelled`, `expired`, `failed`, `unknown` (adapt to verified provider schema; do not invent provider values). Display `pending` clearly, and only claim `confirmed` when the provider confirms.
- Never assume a 5-minute timeout or exact status enum without checking current official docs. After network ambiguity reconcile provider status before retry; do not duplicate bookings. Do not silently cancel or change bookings.
- Protect phone number, special requests, and customer data with per-user RLS and minimum retention. LP rewards must not follow reservation request/confirmation alone; only eligible verified visits.
- Test permission failures, duplicate submit, provider timeout, status divergence, cancellation, and unsupported venue fallback.

## Working procedure
1. Read `PRD.md`, `DESIGN.md`, current architecture, and relevant tests before changing code.
2. State a short implementation plan and identify data/security impact.
3. Make small, reviewable changes with migrations for schema changes.
4. Add tests for happy path, failure path, authorization, duplicate submissions, and ledger idempotency.
5. Run typecheck, lint, unit/integration tests, and RLS/security checks where available. Never claim a test passed without running it.
6. Summarize changed files, verified results, unresolved risks, and next steps.
7. Ask before destructive migrations, production data changes, deploying, or spending money.

## Definition of done
A feature is done only when the user flow works, permissions are enforced server-side, errors are handled, important paths are tested, and docs reflect behavior. Mock data must be visibly identified as mock data.
