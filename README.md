# LocalRoute

[![React](https://img.shields.io/badge/React-Mobile%20web-149ECA?logo=react&logoColor=white)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Frontend%20%26%20server-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-Auth%20%26%20Postgres-3FCF8E?logo=supabase&logoColor=white)](https://supabase.com/)
[![Gemini](https://img.shields.io/badge/Gemini-Server--side%20AI-8E75B2?logo=googlegemini&logoColor=white)](https://ai.google.dev/)
[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-D22128?logo=apache&logoColor=white)](./LICENSE)

<img src="./public/localroute-logo.png" alt="LocalRoute logo" width="160">

LocalRoute is a mobile-first travel planner that combines local restaurant
recommendations with nearby activities in an editable, timed itinerary. Travelers
choose where and when to go, what they enjoy, and how they want to travel. The
server builds a schedule from identified places, checks its timing, and makes
uncertain opening hours and transport information visible.

The app supports Korean and English. Contributors can recommend a real place
with an exact location, a photograph they took, and a short personal note.
Operator-curated listings and examples are labeled separately from independent
local recommendations.

The repository contains the main parts of the service:

- **Travel planner** — a preference wizard, server-side Gemini generation,
  schedule validation, stop editing and replacement, regeneration, maps, and
  read-only itinerary sharing.
- **Place discovery** — searchable maps, place details, saved places, and
  server-side HeyYumi place lookup with canonical place matching.
- **Contributions** — place photographs, optional menu photographs, editable AI
  menu extraction, recommendations, and separate place and recommendation ratings.
- **Accounts and credits** — Supabase email-link authentication, confirmation
  recovery, recorded consent, private booking profiles, and an atomic LP ledger.
- **Reservations** — a gated HeyYumi booking module with customer review,
  separate consent, request recovery, and explicit pending or unknown states.
- **Moderation and operations** — review tools, evidence-based AI assistance,
  upload processing, database migrations, and mocked provider tests.

## Planning flow

1. **Choose a destination** — select a supported region and travel dates, then
   set the daily time window, purpose, activities, food preferences, pace, and
   transport mode.
2. **Review the cost** — the current policy charges **10 LP per travel day**,
   including both the start and end dates, for trips of one to five days. The
   total is shown before confirmation.
3. **Build a grounded itinerary** — the server selects from identified places
   and checks the schedule's dates, meal windows, geography, opening information,
   and travel gaps. Missing information stays unverified.
4. **Save before charging** — a valid itinerary must be saved before the final
   atomic LP debit. Failed or invalid generation costs 0 LP; repeated requests
   reuse their request identity to prevent duplicate charges.
5. **Adjust the trip** — change visit times, replace or reorder stops, pin
   places, and review any new validation warnings.
6. **Share or request a booking** — create an expiring read-only share link, or
   open a supported venue's reservation form. Booking forms start with the stop's
   date and visit time in Korea Standard Time and remain editable. A request is
   submitted only after reviewing the details and giving separate consent.

Provider route times are estimates at the time of lookup. Planned travel buffers
are labeled separately. Neither an itinerary nor a reservation request guarantees
opening hours, accessibility, seat availability, or arrival time.

## Tech stack

- **Frontend:** React 19, TypeScript, Vite, React Router, and Noto Sans KR.
- **Maps:** MapLibre GL with an OpenFreeMap style by default; Leaflet and
  OpenStreetMap provide a fallback when the primary renderer is unavailable.
- **Server:** Node.js, Express, TypeScript, and Zod request validation.
- **Database and identity:** Supabase Auth, PostgreSQL, private Storage, RLS,
  and server-authorized database functions.
- **Place discovery:** HeyYumi for supported restaurant data; Kakao for region
  lookup and activity discovery.
- **Routing:** server-side Kakao/Kakao Mobility adapters with call budgets,
  timeouts, structured results, and explicit unsupported or unavailable states.
- **AI:** server-side Gemini for itinerary generation, visible menu-text
  extraction, and moderation assistance.
- **Image processing:** browser upload preparation and server-side Sharp
  validation, conversion, and metadata removal.
- **Testing:** Vitest, Playwright, Supertest, and disposable PGlite databases for
  PostgreSQL permission, transaction, and RLS tests.
- **Deployment:** a Vite frontend and an Express API adapter for Vercel.

## Getting started

### Local development

Use **Node.js 22.12 or newer** and npm. Install the pinned dependencies from the
committed lockfile:

```bash
npm ci
npm run dev
```

The development command starts both services:

| Service | Address               |
| ------- | --------------------- |
| Web app | http://127.0.0.1:5173 |
| API     | http://127.0.0.1:3001 |

Without configuration, the app starts in **demo mode** and does not require
provider secrets. Demo places, recommendations, and ratings are fictional and
labeled accordingly. Map tiles still require an internet connection; the place
list remains usable when the map fails.

Demo contribution drafts use the current tab's session storage. Guest saved
places use browser local storage. Unsubmitted image files are not persisted in
browser storage and may need to be selected again after a reload or email-link
redirect.

To run the services separately:

```bash
npm run dev:web
npm run dev:api
```

### Environment configuration

For local development, use only the gitignored **root `.env`**. Do not create an
`.env.example` or a second environment file, and do not commit credentials.
Variables prefixed with `VITE_` are public browser configuration; provider keys
and Supabase secret/service-role keys must never use that prefix.

| Variable                                                                             | Purpose                                                               |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| `VITE_DATA_MODE`                                                                     | `demo` by default; `live` uses the configured backend data.           |
| `VITE_SUPABASE_URL`                                                                  | Public Supabase project URL.                                          |
| `VITE_SUPABASE_PUBLISHABLE_KEY`                                                      | Preferred public browser key.                                         |
| `VITE_SUPABASE_ANON_KEY`                                                             | Legacy public anon key, used when the publishable key is absent.      |
| `SUPABASE_URL`                                                                       | Server Supabase URL for the same project.                             |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`                                  | Server-only credentials for authorized operations.                    |
| `VITE_MAP_STYLE_URL`                                                                 | Optional MapLibre style URL; defaults to OpenFreeMap Liberty.         |
| `HEY_YUMI_API_KEY`                                                                   | Server-only HeyYumi key.                                              |
| `FEATURE_HEYYUMI_SEARCH`, `HEYYUMI_TERMS_VERIFIED`                                   | Enable place search after verifying provider access and usage rights. |
| `HEYYUMI_REQUESTS_PER_HOUR`                                                          | Per-process HeyYumi call budget.                                      |
| `FEATURE_HEYYUMI_BOOKING`                                                            | Gate supported-venue reservation integration.                         |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                                     | Server-only Gemini connection settings.                               |
| `FEATURE_STARTER_ITINERARIES`                                                        | Allow source-backed operator candidates for initial planning.         |
| `FEATURE_AI_PLANNING`, `PLANNING_POLICY_APPROVED`, `GEMINI_DATA_PROCESSING_APPROVED` | Gate itinerary generation and approved AI processing.                 |
| `FEATURE_GEMINI_MENU_EXTRACTION`, `FEATURE_GEMINI_MODERATION`                        | Gate menu extraction and review assistance.                           |
| `AI_REQUESTS_PER_HOUR`                                                               | Per-process AI call budget.                                           |
| `KAKAO_REST_API_KEY`, `KAKAO_MOBILITY_API_KEY`                                       | Server-only discovery and routing keys.                               |
| `FEATURE_KAKAO_DISCOVERY`, `FEATURE_KAKAO_DESTINATIONS`, `KAKAO_TERMS_VERIFIED`      | Gate activity discovery and real destination lookup.                  |
| `FEATURE_KAKAO_ROUTING`, `KAKAO_ROUTING_TERMS_VERIFIED`, `ROUTING_REQUESTS_PER_HOUR` | Gate route lookup and its call budget.                                |
| `FEATURE_LP_REWARDS`                                                                 | Gate eligible reward issuance.                                        |
| `APP_BASE_URL`, `APP_TIMEZONE`                                                       | Application origin and timezone settings.                             |

The only supported runtime database is the LocalRoute Supabase project
`pjdawapasozsrpnrtsfx` at `https://pjdawapasozsrpnrtsfx.supabase.co`. A different
project URL is rejected. In-memory databases are disposable test fixtures only.

Optional integrations stay disabled when their configuration or approval is
missing. Feature flags do not replace provider authorization, billing checks,
license verification, or the database's entitlement policy. In-memory call
budgets apply to individual server instances and are not global spending caps.

### Live data and authentication

Before connecting live data, review the [database setup record](./docs/DATABASE_SETUP.md),
[operator catalog guide](./docs/OPERATOR_CATALOG_IMPORT.md), and the latest
[release status](./docs/LIVE_RELEASE_STATUS.md). Historical setup records may
describe earlier policies; the current product rules are in [PRD.md](./PRD.md).

Email sign-in uses PKCE. Configure the actual application origin and allowed
redirects in Supabase, keep email confirmation required, and follow the
[email setup guide](./docs/AUTH_EMAIL_SETUP.md). Expired links, missing browser
verification information, and failed code exchanges have Korean/English recovery
messages and a path to request a new link. Successful callbacks remove
authentication parameters from the URL.

Protected writes require server-verified identity, confirmed email, and the
required current consent. Admin permissions come from server-controlled roles.
The optional private booking profile is separate from public contributor
identity; saving it does not send a reservation or disclose it to a provider.

### Checks

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

Playwright projects cover **360px**, **390px**, and **1440px** viewports. Tests use
mocked providers and disposable data for supported local flows. PGlite tests
exercise database permissions, RLS, transaction behavior, and idempotency; they
do not verify hosted Supabase email delivery or Storage configuration.

For the itinerary-to-booking date and time flow:

```bash
npx vitest run tests/booking-initial-date-time.test.ts tests/booking-itinerary-ui.test.ts
```

### Build and deployment

```bash
npm run build
```

The frontend output is written to `dist`. `npm start` runs the Express server;
its available features depend on the environment and backend configuration.

For Vercel, follow the [deployment guide](./docs/VERCEL_DEPLOYMENT.md). The
configured build command is `node scripts/build-vercel-api.mjs`, which prepares
the private server runtime and builds the frontend. The API entry exports the
Express application without starting a port listener. Configure deployment
variables in the hosting project's settings rather than uploading `.env`.

### Photo maintenance

```bash
npm run photos:cleanup
```

Run cleanup only from an authorized server environment. It processes eligible
unsubmitted uploads older than 24 hours and rejected photographs older than
30 days, in batches of up to 100. Failed deletions can be retried by a later run.
The repository does not automatically schedule this maintenance in production.

## Project structure

```text
src/
  planner/                  Preference wizard, itinerary editor, route display, sharing
  booking/                  Reservation form, consent, API client, date/time prefill
  ai-assistance/            Editable menu previews and review-assistance UI
  components/               Discovery, contributions, accounts, maps, and shared UI
  examples/                 Public Euljiro sample itinerary and booking entry
  photos/                   Browser-side photo preparation
  i18n/                     Korean and English messages
  landing/                  Landing-page data and account state
server/
  app.ts                    Express routes and middleware
  repository.ts             Supabase persistence boundary
  planner/                  Candidate selection, Gemini orchestration, schedule checks
  routing/                  Server-only route provider adapters
  ai-assistance/            Validated AI extraction and moderation assistance
  booking/                  Booking authorization, provider requests, reconciliation
  photos.ts                 Upload validation, private access, and review handling
  visit-rewards/            Visit-feedback eligibility and contributor outcomes
shared/                     Domain types, schemas, policies, and validation
supabase/
  migrations/               PostgreSQL schema, RLS, ledger, and server RPCs
  templates/                Confirmation and passwordless sign-in email templates
scripts/                    Import, maintenance, development, and build tools
  data/                     Operator research, source records, and media provenance
public/                     Brand assets, licensed photographs, and labeled illustrations
api/                        Deployment API entry
server-runtime/             Private runtime bundle target (generated bundles ignored)
tests/                      Unit, integration, and mocked browser fixtures
e2e/                        Playwright user-flow tests
docs/                       Setup, deployment, and recorded release evidence
```

## Data, privacy, and credits

Place records, contributor recommendations, restaurant reviews, and ratings of
individual recommendations are separate objects. Provider IDs are external
identifiers, not LocalRoute UUIDs. Search and deduplication precede place creation;
uncertain matches require confirmation.

New user contributions require an exact place and a real contributor-taken
photograph. Menu photos are optional. Uploads are validated, metadata is removed,
and unreviewed files stay private until human review. The server checks image
bytes, type, size, and resolution; browser preparation also reduces upload size
for the hosting platform's request limits.

Some seeded listings use explicitly labeled **AI food illustrations** for
presentation. They do not show the actual venue or menu and cannot serve as
contribution or visit evidence. Approved real photographs take priority. Licensed
source photographs retain their original attribution and license terms, and
missing media is not represented as a verified photograph.

Gemini calls run only on the server. Menu extraction returns visible names,
prices, currencies, and uncertainty for user correction. Moderation assistance
provides evidence and suggested review actions; AI signals alone do not justify
punishment or LP confiscation. Booking contact details are not sent to Gemini or
stored in public profiles, Auth metadata, or analytics.

The current membership policy provides **50 promotional LP per calendar month**
under the Asia/Seoul calendar after verified email and required consent. Enhanced
planning costs **10 LP per travel day**. Promotional credits expire at month end;
earned credits follow the published policy. `/checkout/test` does not charge
money; its explicit test flow can grant a fixed, one-time **100 LP test bonus**
to an eligible verified account. This is not a paid purchase.

Booking confirmation, arrival checks, and uploaded photographs alone do not prove
a visit or qualify someone for a reward. Receipts are not required for ordinary
feedback. Reward issuance is separately gated and must be attributable,
authorized, bounded, and idempotent.

Maps preserve provider attribution. External tile services receive network
requests, including the user's IP address and the requested map area. The app
does not collect background location histories. The optional k-skill development
tools are not part of the public request path; user locations and secrets must
not be sent through third-party skill proxies.

## Status

LocalRoute is an evolving MVP. The repository implements the planner, discovery,
contribution, account, consent, media, booking, and sharing flows, with provider
features controlled by configuration and permission checks. Public examples are
operator-curated demonstrations, not proof of independent recommendations,
current opening hours, live availability, or completed reservations.

The [release status log](./docs/LIVE_RELEASE_STATUS.md) records dated deployment,
provider, database, and test evidence. Provider sandbox results do not establish
that real booking delivery, merchant confirmation, cancellation, or email delivery
work end to end. Builds and mocked tests do not replace those checks. Real-money
checkout and unapproved reward payouts remain outside the demonstrated flow.

[PRD.md](./PRD.md) defines product behavior;
[AGENTS.md](./AGENTS.md) defines engineering rules. The independent reviewer owns
[QA_REPORT.md](./QA_REPORT.md).

## License

The application source is licensed under the [Apache License 2.0](./LICENSE).
Third-party photographs retain their own licenses and attribution requirements;
see the [photo credits](./public/place-source-photos/ATTRIBUTION.md) and individual
media source records. The font uses its own OFL license. Repository licensing
does not grant rights to third-party branding or provider data.
