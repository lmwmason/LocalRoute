# Routing module handoff

Implemented 2026-10-17. Integration is deliberately left to the main agent: no changes to App/API assembly, server config/repository/planner, shared planner, QA report, environment, dependencies, DB or deployments. No live routing calls were made. Other work was already present and continued in this shared checkout; it is excluded from this commit.

## Exports and usage

- `shared/transport.ts`: `transportRequestSchema`, `transportPointSchema`, `TransportRequest`, `TransportMode`, `TransportPoint`, `TransportLegResult`, `TransportStep`, `TransportSource`, `TransportReason`, `TransportGapValidation`, `validateTransportGap`.
- `server/routing/index.ts`: `createKakaoRouting`, `RoutingOptions`; re-exports `validateTransportGap`, `TransportRequest`, `TransportLegResult`. Server-only: imports Node timers and rejects construction in a browser. Never import this module into frontend code. Import shared types using `import type`.
- `src/planner/TransportLeg.tsx`: named `TransportLeg`, `TransportLegProps`; scoped `transport.css` is imported automatically. Uses current I18n context or explicit `language="ko" | "en"`. No API calls or global state changes.

Server example (integration sketch, not an enabled endpoint):

```ts
import { createKakaoRouting, validateTransportGap } from "./routing";

// Construct once at server composition, not once per HTTP request.
const routing = createKakaoRouting({
  enabled: false, // default; enable only after account/terms/billing review
  carKey: config.kakaoKey,     // server-only existing KAKAO_REST_API_KEY setting
  transitKey: config.kakaoKey, // or separately approved app credentials
  maxCalls: 0,                // default; set an explicitly approved positive budget
  budgetWindowMs: 3_600_000,
  timeoutMs: 5_000,
});
const leg = await routing.lookup({
  origin: { lat: 37.5, lng: 127 },
  destination: { lat: 37.6, lng: 127.1 },
  mode: "transit", // same car/transit/walking/wheelchair literals as planner mobility
});
const check = validateTransportGap(leg, gapSeconds, additionalBufferSeconds);
```

`lookup` validates finite WGS84 coordinates and a recognized mode without coercing strings. Invalid input throws a Zod validation error synchronously **before** any provider call; use `transportRequestSchema.safeParse` at the HTTP boundary. Provider failures resolve to `status: "unverified"`, not exceptions exposing provider payloads/secrets. Optional keys missing or `enabled !== true` return `disabled`. Walking and wheelchair return `unsupported_mode`, without querying a provider. The UI displays explicit unknown/loading/failure states.

`estimated` contains meters, seconds, provider transfer count, walking totals, ordered guidance, supplied stops/vehicles, optional KRW fare, source and lookup timestamps. Car transfer/walking values are `null` because this response does not establish them. Car fare is **toll only**, excludes taxi estimates and is not total cost. Missing fares remain `null`; transit fare ranges preserve unknown bounds. `unverified` always has null metrics/fare and an empty steps array. No speed-based fallback, synthetic lines, travel times or costs.

```tsx
import { TransportLeg } from "./planner/TransportLeg";

<TransportLeg
  leg={leg}
  loading={loading}
  language="en"
  availableSeconds={gapSeconds}
  bufferSeconds={additionalBufferSeconds}
  onRetry={retryRouteLookup}
/>
```

Retry is a caller callback; the component makes no network requests. Provider instructions/names remain in their original language and are React-escaped; English UI explains that Korean directions may appear. All displayed timestamps use Asia/Seoul independently of browser timezone. Native details/summary supports touch and keyboard. The component adds no animation, fixed controls or keyboard-blocking containers.

## Scheduler integration contract

`validateTransportGap(leg, availableSeconds, bufferSeconds = 0)` compares **provider route duration plus the caller's extra buffer** to the gap from previous visit end to next visit start. It returns `exceeds_gap` with exact excess seconds, `fits_estimate`, `unverified`, or `invalid_gap`. Equality fits; negative/nonfinite gap/buffer fails validation. Unknown duration never passes. This function does not charge LP or change schedules.

Before accepting an itinerary, main agent must match `leg.request` to the actual ordered endpoints and travel mode, establish an acceptable freshness policy, and re-query after changing stops/order/mode. Include start/return anchors where applicable. Reject or handle insufficient evidence according to the paid planner's acceptance policy **before** its atomic LP commit. Existing `evaluateSchedule` is unchanged and does not call this function yet.

Both adapters query routes at lookup time. `timeBasis: "lookup_time"`, `arrivalGuaranteed: false`, and `accessibility: "unverified"` are mandatory even on success. A future travel day's traffic/timetable, actual arrival, wheelchair accessibility or step-free path is never established. This module does not implement future-departure routing. Do not remove uncertainty merely because `fits_estimate` was returned.

## Failure and call controls

- Fixed official HTTPS hosts only; no configurable proxy/base URL, redirects, external k-skill execution or forwarding to third-party proxies. Only coordinates required for routing are sent; names/user IDs/booking data are omitted. Keys travel in server Authorization headers, never results.
- Opt-in feature switch and separate car/transit credentials. The adapter reads no environment files; main agent should use the existing root `.env` configuration path, with no VITE secret or new environment file.
- Configurable instance-wide call count/window (default zero calls/hour); failures/timeouts also consume a call. Concurrent identical requests share one promise; distinct requests consume budget synchronously. In-flight coordinates are discarded on completion; no persistent route cache/logging/DB writes.
- 401/403 → unauthorized; 404 or documented no-route response → no results; 429 → rate limited; 5xx/network → provider unavailable; malformed data/unknown codes → invalid response. No automatic retries.
- 429 numeric/date `Retry-After` blocks that mode until the indicated time. Missing/invalid header uses a **local** 60-second cooldown. Provider errors/bodies/exceptions are not forwarded. The total deadline includes response-body reading, aborts the request and resolves even if a test fetcher ignores abort.
- Singleton limits are **process-local**, reset on restart, and are not account-wide distributed quotas. Main integration must enforce authenticated ownership/authorization and per-user throttling before exposing an endpoint, plus a shared account budget for multiple workers. Do not instantiate per request or treat this adapter as the endpoint's authorization layer.

## Official references checked

Public documentation was read without API credentials or live provider requests on 2026-10-17:

- [Kakao Mobility automobile routing](https://developers.kakaomobility.com/guide/navi-api/directions): GET `https://apis-navi.kakaomobility.com/v1/directions`, KakaoAK header, x/y coordinate order, detailed guide response.
- [Route result codes](https://developers.kakaomobility.com/guide/navi-api/reference.html) and [HTTP errors](https://developers.kakaomobility.com/guide/navi-api/solution.html).
- [Kakao Maps REST](https://developers.kakao.com/docs/ko/kakaomap/rest-api), public transport section: GET `https://dapi.kakao.com/v2/routing/publictraffic`, WGS84 start/end x/y, status/routes, route properties and step properties. This is the direct official transit API, not a Kakao Mobility car endpoint or k-skill proxy. The first provider route is used; no invented alternative ranking.
- [Kakao quotas/prices](https://developers.kakao.com/docs/ko/getting-started/quota) and [Mobility quotas/prices](https://developers.kakaomobility.com/price/). Provider quota/pricing is not hardcoded as LocalRoute's spending allowance. Account entitlement, commercial/display/persistence rights, attribution and effective billing still need confirmation before enabling. Public docs also list walking APIs; walking is intentionally unimplemented here, not asserted absent from Kakao's products.

## Verification

- `rtk npm run typecheck`: passed.
- `rtk proxy npx eslint server/routing shared/transport.ts src/planner/TransportLeg.tsx tests/routing.test.ts tests/routing-ui.test.ts`: passed.
- `rtk npm test -- tests/routing.test.ts tests/routing-ui.test.ts`: **44 passed**. Includes mock car/transit payloads and server-only auth headers; absent fares; unsupported modes; invalid inputs; timeout through headers/body; 401/403/404/429/5xx; numeric/date/missing Retry-After; no-route/changed schemas; concurrency and budget reset; estimated-duration gap checks; Korean/English uncertainty and injection escaping.
- Chromium component checks at **360/390/1440px**, both languages: no horizontal overflow with long provider text, 44px summary/button targets, touch expand/collapse, keyboard focus/Enter, scrolling, reduced-motion preference. These use rendered component markup/CSS, not a newly integrated application route; React hydration and the caller's retry/network integration remain main-agent checks.
- Whole checkout snapshot `rtk npm test`: **114 passed, 4 failed**, all four failures in concurrently authored `tests/booking.test.ts` (HTTP 500 vs expected 409/404, and timezone string representation). Routing tests passed. `rtk npm run lint`: failed on two `no-control-regex` errors in `shared/reservations.ts`, plus eight unrelated React hook warnings. Those files were not changed here. Do not interpret whole-repo checks as passing; rerun after their owners resolve these findings.
- No new DB objects, so this module adds no RLS surface; existing in-memory DB tests passed in the whole-suite run. No hosted DB/security certification claimed. No live route correctness, provider entitlement, paid calls or deployment verified.
