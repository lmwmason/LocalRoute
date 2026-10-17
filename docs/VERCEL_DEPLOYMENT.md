# LocalRoute Vercel deployment

Vite builds the frontend into `dist`; one Node function at `api/index.ts` exports the existing Express application. It reuses `createApp`, `readConfig`, `SupabaseRepository`, authentication, legal gates and route validation. It does not start a port listener, load `.env`, serve application source or create another database. The only supported runtime database remains `pjdawapasozsrpnrtsfx`.

The configured build command is `node scripts/build-vercel-api.mjs`. It first uses the existing Vite SSR builder to bundle `server/vercel-runtime.ts` into the private `server-runtime/index.cjs`, then runs the existing `npm run build` checks and frontend build. The small API entry imports that explicit CJS filename. This fixes the observed deployed `ERR_MODULE_NOT_FOUND` for extensionless server imports; source-level tests using TSX/Vite resolution alone did not catch it. Runtime package dependencies remain external and Vercel traces them. The generated runtime is gitignored, outside public `dist`, and rebuilt from current source on every deployment. A plain Node subprocess regression loads the actual API entry and checks health/unknown-route JSON without a TypeScript resolver.

## Project settings

- Framework: **Vite**; repository root; install with the committed lockfile; build `node scripts/build-vercel-api.mjs`; output `dist`.
- Select supported Node **24.x** in the project settings. The existing package requires Node >=22.12; no new packages are required.
- Use Fluid compute. The checked official limits permit up to **300 seconds on Hobby**; this function deliberately uses **180 seconds**, not the historical 10/60-second defaults. Two existing Gemini attempts can take 45 seconds each, with destination/activity/routing and database work in addition. This is an upper bound, not a promise that all requests complete within it. Provider budgets and timeouts still apply. [Function duration](https://vercel.com/docs/functions/configuring-functions/duration), [limits](https://vercel.com/docs/functions/limitations).
- The function region is explicitly **Mumbai, India (`bom1`)**, matching the current Supabase `ap-south-1` database region to reduce database round trips. Update hosting/overseas-processing disclosures to reflect the provider and region. [Regions](https://vercel.com/docs/regions).

## Environment configuration

Configure values in the Vercel project's environment settings for the intended deployment environment; do not upload the root `.env`. `.vercelignore` and function exclusions omit local environment files. Existing variable names and feature gates are documented in `AGENTS.md` and root configuration documentation. [Vercel environment variables](https://vercel.com/docs/environment-variables).

Frontend build settings are public: `VITE_DATA_MODE=live`, `VITE_SUPABASE_URL=https://pjdawapasozsrpnrtsfx.supabase.co`, a **publishable/anon** key in `VITE_SUPABASE_PUBLISHABLE_KEY` (preferred) or `VITE_SUPABASE_ANON_KEY`, and `VITE_MAP_STYLE_URL`. The Vite build rejects a secret/service-role value in either public key variable.

Server settings use unprefixed names: `SUPABASE_URL` for the same project and `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY`; optional Gemini, Kakao and HeyYumi settings retain their existing names/gates. Never prefix server/provider secrets with `VITE_`. The runtime rejects a mismatched project URL before constructing any repository. Missing optional integrations remain disabled, with existing capability/error responses. Actual payment and unverified booking/reward features remain disabled; deploying does not approve a provider plan or guarantee free provider usage.

Production and preview environment variables are separate. Redeploy after changing build-time `VITE_` values. Configure Supabase Auth Site URL and allowed redirects to the final HTTPS origin; keep confirmation required and preserve the operator-approved email templates. Do not include customer details or tokens in deployment logs.

## Request routing and checks

`/api/:path*` is routed to the Node function **before** the SPA fallback. The Express application consumes the incoming `/api/...` URL and query unchanged; it does not rebuild a path from client-controlled headers or query parameters. Unknown API routes return the existing JSON 404. Existing built assets are served by Vercel's filesystem/CDN; frontend deep URLs return `index.html` and React Router resolves them. [Vite deep linking](https://vercel.com/docs/frameworks/frontend/vite), [rewrite configuration](https://vercel.com/docs/project-configuration/vercel-json#rewrites), [Express export](https://vercel.com/docs/frameworks/backend/express).

Before enabling a production alias, verify the actual preview deployment:

1. `GET /api/health` returns **JSON**, the intended live/demo mode and expected database capability; it must not return the SPA HTML.
2. An unknown `/api/...` route returns **404 JSON**, and `/api/itineraries` without authentication returns an auth error rather than HTML.
3. Open and reload `/plan/new/1`, `/discover`, `/saved`, `/account`, `/login`, `/contribute`, `/legal/privacy`, `/checkout/test` and a real accessible itinerary/share URL; test browser back at 360/390px.
4. Inspect a built asset's MIME type and ensure the browser only receives public configuration; no server keys or `.env` files may be accessible.
5. Use the final origin when verifying email links. A successful build alone does not prove email delivery, provider access, itinerary quality or production permissions.

The local adapter tests cover Express dispatch, JSON API failures, configuration rejection and rewrite ordering. They do **not** emulate Vercel's full edge router or replace the deployed smoke checks.

## Photo uploads and lifecycle limits

Vercel limits request and response bodies to **4.5 MB** and can return platform `413 FUNCTION_PAYLOAD_TOO_LARGE` before Express runs. The existing server accepts up to 5 MB input; those limits are different. The separately implemented `src/photos/prepare-upload.ts` now decodes and resizes real place/menu photographs to at most 1600px, re-encodes JPEG without EXIF, and rejects output above 4 MiB before upload. Its byte/image validation and browser tests are separate from this adapter's tests; the server still validates and strips metadata authoritatively. No direct-to-storage bypass is used. [Payload limits](https://vercel.com/docs/functions/limitations#request-body-size).

In-memory rate/call budgets are per warm function instance and reset with cold starts; they are not a global account spending cap. Database-backed LP idempotency remains authoritative. A platform timeout can prevent the fail handler from finishing, so preserve request IDs and use status recovery; never automatically create a new paid request after an ambiguous response. No cron, cleanup schedule, real payment, reservation or reward payout is enabled here.

Documentation checked on 2026-10-17. This change prepares deployment files; deployment, account configuration, real auth/provider calls and billing checks are performed separately.
