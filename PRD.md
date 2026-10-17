# PRD — LocalRoute

**Status:** Draft for MVP implementation  
**Date:** 2026-10-17  
**Product:** LocalRoute — local restaurant recommendations and map-based travel planning  
**Language:** Korean and English for primary traveler flows, itinerary inputs/results and uncertainty notices  
**Owner:** Founder / product team

## 1. Product summary
LocalRoute is a travel itinerary scheduler built around a map of independently recommended local restaurants. It helps Korean and international travelers combine local food with enjoyable regional activities and places, using Gemini to propose a practical timed schedule. Local contributors can add restaurants quickly and earn platform points (LP) when their useful recommendations lead to eligible, verified visits and helpfulness ratings.

**Product promise:** Find local places, understand why someone recommends them, and turn them into a trip without tedious research.

## 2. Problem and hypotheses
- Travelers face repetitive, noisy restaurant search and difficulty turning scattered suggestions into feasible routes.
- Existing place ratings do not tell travelers whether an individual recommendation is accurate for their needs.
- Locals will contribute if registration takes very little effort and rewards reflect usefulness rather than volume.
- These are hypotheses requiring validation, not proven market facts.

## 3. Success metrics and guardrails
### Primary metrics
- Completed, approved endorsements per active curator.
- Median time to submit an endorsement (target hypothesis: under 30 seconds **for an already indexed place**, excluding external AI latency).
- Percentage of personalized recommendations saved/selected by travelers.
- Verified post-visit endorsement feedback rate.
- Duplicate-place creation rate and moderation overturn rate.
### Guardrails
- Cost per accepted contribution and per Gemini analysis.
- Fraud-related payout reversals; appeals upheld.
- Reward issuance versus recommendation LP debits and promotional LP budget.
- Menu extraction correction rate; factual information complaints.
- Privacy incidents, user reports, and false-positive moderation flags.

## 4. User roles
- **Traveler:** browse map, save places, create itinerary, request enhanced recommendations, submit eligible post-visit feedback.
- **Local curator:** all traveler capabilities; submit/edit endorsements and optional place/menu facts; view earnings and quality feedback.
- **Moderator:** review submissions, evidence, reports, and reward anomalies; actions are audited.
- **Super admin:** configure policies, manage permissions, review escalations and LP adjustments.
- **Business owner:** MVP uses a public correction-request form; verified owner portal is deferred. Owners cannot edit community ratings or buy organic ranking.
One account may be both traveler and curator. Roles are server-validated.

## 5. Core objects
| Object | Meaning |
|---|---|
| Place | Canonical restaurant record; one per physical business/location |
| Place fact | Name, address, hours, menu, price, photo; source, timestamp, verification state |
| Endorsement | Curator's specific recommendation for a place; one active per curator/place |
| Endorsement version | Snapshot of the recommendation text at a point in time |
| Place review | Traveler's satisfaction with the restaurant itself |
| Endorsement rating | Traveler's assessment of a particular recommendation's accuracy/usefulness |
| Recommendation event | Paid/entitled AI recommendation request and resulting attributed recommendations |
| Verified visit | Evidence-backed eligible visit event; verification method and confidence tracked |
| LP ledger entry | Immutable record of credit/debit/reservation/reversal/expiry |
| Moderation case | Signals, evidence, human decisions, appeal state, and audit trail |

## 6. Core user journeys
### 6.1 Discover restaurants and plan trip
#### Scheduler requirements (founder clarification, 2026-10-17)
- Collect region, date, local start/end time, party/travel context, purpose, preferred activities and food, food restrictions, travel mode and preferred pace before planning. Keep common choices easy and optional details skippable.
- Use Gemini on the server to propose a schedule mixing independently recommended restaurants with verified regional attractions/activities. Select exact places only from supplied provider/canonical candidates; never invent a business, attraction, URL, hours or live availability.
- Give meals explicit time windows and leave dwell/transport buffers. Validate all selected IDs, time bounds, overlap, meal coverage, and plausible transfer time before accepting the model output. Explain unknown hours and estimated travel times. A technically valid draft is not a guarantee that venues are open or bookable.
- Korean/English selection applies to the form, result descriptions, timings and uncertainty notices; keep proper place names and provide verified addresses for navigation.
- Enhanced planning uses LP. Display price and separate expiring promotional/earned balances before consent. Reserve entitlement atomically; charge exactly once only after a validated result is durably saved. Failure/invalid output releases the reservation without a debit. Concurrent retries must not duplicate charges or results. Keep launch controls disabled until the published deliverable/refund policy is reviewed.
- Quality is a release criterion: grounded places, preferences reflected, sensible geography/order, meals at sensible times, an editable schedule, and honest uncertainty. Missing enough reliable candidates must produce an actionable failure rather than a paid fabricated itinerary.

1. Traveler opens free map and searches a city/area/category.
2. Place cards show verified facts, local endorsement summaries, place satisfaction and recommendation helpfulness **separately**.
3. Traveler saves restaurants to an itinerary.
4. Enhanced itinerary/recommendation request shows LP cost **before** confirmation.
5. Service generates suggested stops based on preferences, travel mode, distance and known hours. It must flag unknown hours and unsupported routing estimates; do not fabricate availability or travel time.
6. Traveler can edit stop order, save itinerary, and open navigation.

### 6.2 Recommend an existing restaurant — primary flow
The same contribution flow supports locally recommended attractions, cultural venues and experiences. Prefer these endorsements in itinerary candidate selection; label provider-only alternatives explicitly.
1. Tap `맛집 추천하기`.
2. Search by business name and select exact map result.
3. If place exists, do **not** duplicate it. Open endorsement editor directly.
4. Upload a required real photograph of the selected place. The contributor confirms authorship, place identity and publication rights; no AI-generated or unrelated substitute photos. Menu photography and extraction remain optional and separate.
5. Enter a one-sentence, first-hand reason or useful tip (required); optional tags.
6. Preview and submit; show `pending`, `published`, or `needs changes` state.
7. No LP awarded solely for writing a positive review. Any onboarding incentive must be separately budgeted and fraud-protected.

### 6.3 Recommend a new restaurant
1. Search name; show nearby existing-place candidates before allowing creation.
2. Choose an authoritative map location or manually pin with confirmation if provider coverage is missing.
3. Enter required identity data: name, exact location and an actual photograph of that place. Restaurant, café, attraction, cultural venue and experience categories are supported. Menu/hours remain optional.
4. Optionally upload menu photo; extract visible items and prices via Gemini and let contributor correct errors.
5. Enter required one-line endorsement; submit both place and endorsement.
6. New place enters moderation/deduplication queue. Endorsement publication waits for canonical place resolution.
7. If duplicate later found, merge under admin control while preserving attribution and audit history.

Photo acceptance: require a JPEG/PNG/WebP photograph up to 5MB, validate decoded pixels on the server, strip EXIF and store a bounded JPEG in private LocalRoute Storage. Link it atomically to its authenticated author's exact contribution/selected place. Require explicit human photo review before publishing new photographed contributions. Display no substitute photograph if one is missing. Unsubmitted uploads expire after 24 hours; rejected photographs are removed after 30 days by a scheduled server cleanup task. Do not claim a photo's authenticity has been independently verified solely because it passed file validation or the author attested to it.

Account locality: signup collects only a city/district home region, supports international regions, and requires email verification. Private home regions can be edited; publishing a self-declared locality label with recommendations is a separate, optional consent. No street address, GPS history or unearned “verified resident” badge.

Store city and optional district/township separately and allow `auto`, city-wide or local-area scope. Example: 충주시 살미면 defaults to 충주시; 서울특별시 성동구 may default to the district. Widen automatic scope if the actual published candidate count is insufficient for the requested pool and disclose that boundary. Catalog counts must not be described as real-world restaurant density. An explicit user-selected boundary is not silently broadened.

### 6.4 Evaluate after visiting
1. Traveler receives an optional feedback prompt after an eligible visit, not automatically for mere map views.
2. Rate **place satisfaction** (1–5) and, if an attributable endorsement was shown/selected, **endorsement accuracy/helpfulness** (1–5).
3. Optional tags: accurate description, helpful menu tip, price mismatch, atmosphere mismatch, etc.
4. Store endorsement version and attribution. Ratings without sufficient visit evidence may be visible under a separate trust state but must not trigger LP payouts.
5. No requirement to leave a positive rating; explain that verified feedback may affect curator rewards without pressuring the traveler.

### 6.5 Owner correction
1. Public form lets a business representative request factual corrections with supporting evidence and contact channel.
2. Request enters moderator queue; no automatic owner control over community content.
3. Moderator approves/rejects with reason and history.
4. Full verified owner portal and analytics are post-MVP.

### 6.6 Reserve a recommended restaurant (HeyYumi; gated MVP module)
1. On place detail/itinerary show `예약하기` only when HeyYumi explicitly supports a booking channel for that particular place and the account has a permitted API integration; otherwise provide a verified external booking page/contact where available, with no fabricated URL.
2. Traveler chooses date, local time, party size and required contact details. Show consent and exactly what data will be shared; only submit on explicit confirmation.
3. Backend creates one idempotent reservation intent and invokes the **verified current HeyYumi reservation endpoint**. UI displays `요청 중` / `예약 요청됨`, **not** `예약 확정`, until a confirmed provider response or status lookup.
4. Backend reconciles pending and unknown states safely using provider reference; show status changes and expiration/rejection and allow permitted cancellation only if provider supports it. Never auto-resubmit after ambiguous timeouts without reconciliation.
5. Attach confirmed bookings to itinerary stops. Reservations are auxiliary evidence, **not proof of a physical visit and not an LP payout trigger**.
6. If HeyYumi booking access is unavailable, disable native booking without disrupting search, map, or endorsements. All contracts/availability/status fields must be checked against developer documentation before implementation.

## 7. Standard place information and smart menu capture
### Minimum place identity
- `name`, precise `location`/address (verified or marked provisional), dedupe status.
### Optional structured fields
- Category, menu item/price/currency, opening hours, phone, website, dietary notes, accessibility, photos.
- Every fact tracks source (`provider`, `contributor`, `owner`, `AI extraction`), observed date, and verification state.
### Menu photo pipeline
1. Validate upload MIME/size, remove sensitive metadata, store with scoped permissions.
2. Gemini extracts only text visually supported by image; JSON schema with `items[{name,price,currency,confidence}]`, `unreadable_regions`, and `notes`.
3. User sees editable preview and confirms; ambiguous prices remain unset.
4. Persist extracted data with image date and verification state; do not auto-publish unverified menu facts as authoritative.
5. On Gemini error or timeout, user can skip menu and complete recommendation.
### Design target
One-name search + optional photo + one-sentence endorsement; minimal typing. Do not make photo or long-form text mandatory.

## 8. Rating and ranking
- **Place rating:** visitor's experience of restaurant; never conflated with endorsement rating.
- **Endorsement rating:** whether a *specific version* of a curator's statement was accurate/useful.
- Show rating count and verified status; do not rank by raw average alone. Use a conservative prior/confidence adjustment and fraud filters.
- Substantial edits create a new endorsement version; prior ratings remain attached to their original version.
- Ranking must not depend on business payment; any sponsored placement is distinctly labeled and separate from organic rankings.

## 9. LP economy — configurable pilot policy
### Spending
- Monthly promotional allowance: **300 LP**, provisioned once per calendar month in configured timezone; expires at month end.
- Enhanced recommendation request: **100 LP**, equivalent to three promotional requests/month if user has no earned LP.
- Earned LP is tracked separately from expiring promotional LP; promotional balance is spent first.
- Map browsing, basic place details, and ordinary saving are free.
- Define exactly what one 100 LP request returns (number of places, itinerary output, reroll/refund rules) before public launch.
### Earning
- Receipt-free visit verification: do not require a receipt for feedback or make receipt scanning the default verification flow. A voluntary arrival check is only supporting evidence; a reservation confirmation, a place photograph, a claimed visit or proximity alone never triggers LP. Verified partner QR/merchant acknowledgement and human review are possible verification channels; label unavailable integrations honestly. Keep feedback available when stronger proof is absent, marked unverified and without an automatic reward.
- Rewards are tied to **attributable, eligible, independently verified** recommendation outcomes, not mere place creation or exposure.
- Illustrative payout per eligible endorsement rating: 5→20 LP, 4→15, 3→8, 2→2, 1→0.
- One eligible reward per traveler/place per rolling 90 days; proposed caps: 300 LP/place/month and 1,000 LP/curator/month. Caps are configurable pilot settings, not finalized economics.
- Only the actual attributable endorsement(s) can receive a share; total reward for one eligible visit is bounded by that event's payout budget. Do not pay every endorser of a restaurant.
- Owner/self-affiliated recommendations are not reward eligible; suspicious feedback is queued.
- Payout only after verification; ledger is append-only, atomic, idempotent, and auditable. Disputes/reversals create new ledger entries.
### Financial caveat
LP is an in-product, non-transferable utility credit in MVP: **no cash redemption or guaranteed monetary value**. Model the cost of promotional issuance, Gemini usage, and possible future perks before launch. The payout table, monthly caps, and exchange rate are provisional and require pilot data.

## 10. Trust, moderation, and fraud prevention
### Deterministic checks first
- Duplicate place matching, rate limits, repeat photos/text hashes, ownership conflicts, repeated reward events, and abnormal account clusters.
- Never equate shared IP/device or writing style alone with fraud.
### Gemini assistance
- Menu image parsing and separate contribution assessment calls.
- Moderation structured output: risk tier, observed signals, supporting evidence references, uncertainty, suggested action, model/prompt version.
- AI must not assert verified physical visits or make final punitive decisions.
### Outcomes
- Low risk: standard checks and eligible publication after required validation.
- Medium risk: additional evidence or moderator review.
- High risk: human review, temporary reward hold; no automatic ban/forfeiture.
- Confirmed violations: documented human decision, proportional response, appeal process.
### Privacy
- Minimize precise location, receipts, and personal data; strip photo EXIF; limit retention and access; provide deletion/reporting flows.

## 11. Admin dashboard
### MVP routes
- `/admin`: operational queue and metrics.
- `/admin/places`: approve/reject/merge places and fact changes.
- `/admin/endorsements`: review contributions and edits.
- `/admin/reports`: reports, suspicious feedback, appeals.
- `/admin/rewards`: ledger inspection, holds, auditable adjustments.
- `/admin/users`: role/discipline management with strong authorization.
### Required capabilities
- Evidence-first case details, clear decision reason, action history, filters, status transitions, and human override.
- Restricted server actions and RLS; no client-side-only admin authorization.
- Metrics must distinguish confirmed fraud from AI-flagged cases.

## 12. Proposed technical architecture
- React + TypeScript frontend (mobile-first responsive web).
- Supabase Auth for sessions; PostgreSQL for domain data; Storage for photos; RLS for access; Edge Functions/server endpoints for privileged operations.
- Gemini server-side for structured menu extraction and moderation.
- **HeyYumi REST API** is the primary external restaurant search/identity/enrichment and, when authorized for the venue, reservation provider in supported Korean regions. Map tiles/display, geocoding fallback, and routing are separate providers selected based on licensing, coverage, and cost.
- Queue or durable job table for asynchronous AI analysis and reward verification; retries must be idempotent.

### HeyYumi REST API contract and cost controls
- Official reference: https://heyyumi.ai/developers ; production base `https://api.heyyumi.ai`.
- Server-only `GET /api/v1/places?keyword=<encoded>&fields=core` using `Authorization: Bearer <HEY_YUMI_API_KEY>`; never expose the key to clients.
- On a typed restaurant name, debounce and query HeyYumi; show candidates with location/address and require user confirmation. Resolve each result by `(provider='heyyumi', external_id=HeyYumi.id)` before creating a new LocalRoute `places` row. Existing record => endorsement-only flow; new external record => linked canonical place; no match => manual entry and moderation.
- Default `core` fields include place identity/location, confidence, last-seen and possible-closure flags. Fetch `quality` (price/menu summary/ratings), `contact_hours` (hours/contact), or `edge` (rich menu/attributes) only when needed. `media` is a higher-cost tier and is not needed for the basic submission flow.
- Published documentation describes tier-based token usage (core 1, contact_hours 2, quality 2, edge 4, media 8 tokens per request at highest requested tier), rate limits and venue caps. Treat these as subject to change; confirm account-specific terms before deployment.
- Provider facts remain attributed, dated, and separate from user-authored recommendations and Gemini-extracted menu photos. Avoid automatically overwriting verified local corrections with older provider data. A provider confidence score is a matching signal, not proof of truth or business closure.
- Implement backend adapter, quota budgets, debounced search, permissible cache, telemetry, timeouts, 429 backoff and error/no-result fallback. Confirm commercial rights, persistence, caching, attribution, coverage and actual paid plan access before public launch. Do not assume a free API production tier.
- HeyYumi is **not** the map renderer, route planner, Gemini moderation service, or LocalRoute LP authority. Native reservation submission/status is a gated MVP module. Consult current HeyYumi reservation docs for precise payload and status mapping. Never claim live table availability from search results, and never present pending as confirmed.

### Suggested tables (initial)
`profiles`, `user_roles`, `places`, `place_facts`, `place_external_ids`, `place_media`, `menus`, `menu_items`, `endorsements`, `endorsement_versions`, `place_reviews`, `endorsement_ratings`, `itineraries`, `itinerary_stops`, `recommendation_events`, `recommendation_attributions`, `visit_verifications`, `lp_wallets` (derived/cached), `lp_ledger`, `monthly_lp_grants`, `moderation_cases`, `moderation_evidence`, `owner_correction_requests`, `reservations`, `reservation_status_events`, `audit_logs`.

### Constraints
- Unique active endorsement per `(user_id, place_id)`; history retained through versions.
- Place deduplication should allow manual override; geospatial/name similarity alone is not enough to merge businesses.
- Foreign keys for attribution: recommendation event → endorsement version → verified visit → rating → reward ledger event.
- All privileged writes must be server-authorized; ledger idempotency keys unique.

### Optional k-skill integration for Korean workflows
- Reference: https://github.com/NomaDamas/k-skill (MIT-licensed agent skill collection, not HeyYumi replacement).
- Relevant candidates include `kakao-map` for Korean map/geocode/drive-route development assistance, `korean-transit-route` for transit, and `localdata-business-status` for official business-operation status cross-checking. Evaluate individual skill documentation and actual data rights before use.
- Skills are optional dev/agent tools, not automatically deployable public app APIs. Some use third-party proxy services; check privacy and terms. Never forward personal booking details or sensitive keys through unknown proxies. If production needs the underlying service, integrate the official API directly with a replaceable adapter and legal review.
- Do not auto-install the entire skills collection or grant blanket execution/access.

### Environment, feature flags, and secrets
- Use only root `.env` with blank placeholders filled locally. Do not generate or require `.env.example`. `.env` and `.env.local` must remain gitignored; document required variable names in `AGENTS.md`.
- Required for real auth/storage: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; backend `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (only if required by privileged server operations). Never use secret keys in a browser.
- Restaurant provider: `HEY_YUMI_API_KEY`; AI: `GEMINI_API_KEY`. Optional map/navigation provider keys are separate; do not assume HeyYumi offers map tiles or route computation.
- Feature flags `FEATURE_HEYYUMI_BOOKING`, `FEATURE_GEMINI_MENU_EXTRACTION`, `FEATURE_GEMINI_MODERATION`, `FEATURE_LP_REWARDS` permit graceful degradation. Unconfigured optional integrations must be shown as disabled or mock, not represented as working services.
- Reservation customer details and API keys are never logged; no automatic booking without explicit traveler confirmation.

## 13. Screens and UX requirements
- Home/map, search, place detail, curator endorsement cards, save/itinerary, contribution wizard, menu photo preview, post-visit dual rating, profile/LP history, login, admin dashboard, owner correction form, reservation details and status screen.
- Korean-first microcopy, short labels, clear primary CTA, visible loading/error/success states, accessible touch targets, keyboard navigation, responsive layout.
- `DESIGN.md` is a Toss reference. Adapt principles into LocalRoute-owned tokens; avoid copying proprietary brand assets or unlicensed fonts. Use licensed Noto Sans KR by default.

## 14. MVP acceptance criteria
1. User can search a place through HeyYumi, select a result, and publish a distinct endorsement without duplicating a linked LocalRoute place; no-match fallback works.
2. User can submit a new place with name, confirmed location, and one-line endorsement; menu photo optional.
3. Uploaded menu photo returns an editable item/price preview; AI failure never blocks submission.
4. Two curators can endorse one place; one curator cannot create duplicate active endorsements for the same place.
5. Restaurant satisfaction and endorsement helpfulness are stored and shown separately with counts.
6. Enhanced recommendation shows LP price and confirms an idempotent debit; insufficient balance prevents charge.
7. Promotional and earned LP balances obey expiry rules and ledger integrity; duplicate callbacks cannot double-pay.
8. Non-admin users cannot access protected admin data or mutate reward balances, including via direct API calls.
9. Gemini flags are reviewable with evidence; AI-only flags cannot directly ban users or confiscate LP.
10. Owner correction requests cannot alter place records without moderator approval.
11. Itinerary clearly distinguishes verified hours/routes from assumptions or unknown values.
12. All material state transitions have tested failure/permission paths and an audit trail.
13. For a provider-supported venue, a logged-in traveler can explicitly submit exactly one idempotent reservation intent and read provider-confirmed state; `pending` is never displayed as `confirmed`.
14. For unsupported venues, booking gracefully falls back only to verified external booking URLs/contact routes; no made-up availability or endpoints.
15. The app starts in mock/development mode without any real API secrets; missing keys produce actionable integration-disabled notices rather than frontend leaks or crashes.

## 15. Phases
### Phase 0 — validation and decisions
- Verify HeyYumi API key availability, developer pricing, permitted use/display/storage/caching, quota, supported regions, and a representative set of live search results before committing to a production dependency.
- Select map/POI/routing provider and verify data rights/cost.
- Define visit verification method, recommendation attribution, and refund/reroll rules.
- Validate LP unit economics and minimum viable supply in one pilot area.
### Phase 1 — core MVP
- Email ownership verification is mandatory at signup. Email-link signup/sign-in must not create an authenticated app session before the recipient opens the verification link. Protected writes and LP planning require a server-validated, email-confirmed user. Handle resend, expired links and delivery failures. Enable Supabase email confirmations before live launch; do not claim dashboard configuration has been verified from local source alone.
- Auth, places, map, fast contribution, endorsements, optional Gemini menu extraction, admin review, basic itinerary. Add HeyYumi reservation module behind a feature flag once API contract/access is validated; do not block Phase 1 on booking.
### Phase 2 — trusted feedback and LP pilot
- Separate ratings, attribution events, visit verification, ledger, monthly credits, payout caps, anti-abuse checks; gated rollout.
### Phase 3 — moderation automation and growth
- Gemini risk triage, moderation analytics, better ranking, localization and growth loops.
### Later
- Verified owner portal, partner tools, additional cities, advanced itinerary features.

## 16. Open decisions (must resolve before monetized launch)
1. What exactly does one 100 LP request return? How many recommendations, rerolls, and refunds?
2. How is a visit verified without invasive tracking or excessive friction? What happens if proof is unavailable?
3. How is attribution assigned when multiple endorsements inform one recommendation?
4. What are fair payout budgets, caps, and cooldowns based on pilot data?
5. Which map/POI provider is legally and financially viable for the target market?
6. What are photo retention and user deletion policies?
7. What is the policy for users who are owners, employees, or otherwise affiliated with restaurants?
8. Does the subscribed HeyYumi plan permit create/read/cancel booking operations and what are its actual status schema, geographic/restaurant coverage, and data-processing terms?

## 17. Non-goals and product principles
- No pay-to-rank organic recommendations.
- No requirement that local users write long reviews.
- No automatic claim that AI detects lies or proves visits.
- No cash-equivalent LP or promises of real-world perks in MVP.
- No full owner dashboard until verified demand.
- Favor truthful uncertainty, user correction, and reversible moderation over aggressive automation.
