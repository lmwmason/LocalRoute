# English region search handoff

2026-10-18 Asia/Seoul. Small first scope: conservative English aliases without changing destination identity or planning contracts.

## Implementation

- `shared/region-search-aliases.ts`: exact-name aliases; Unicode NFKC, case, whitespace and hyphen normalization. Includes all 17 top-level metropolitan/province names plus Chungju, Jeju-si, Seongdong-gu, Jung-gu, Seongsu and Euljiro. Stores search/display vocabulary only, with no coordinates or administrative identifiers.
- `server/destinations.ts`: translates known aliases before the existing Kakao address request and uses the translated query for concurrent-request deduplication. Unknown English and Korean queries pass through unchanged. Validation, pagination, fixed endpoint, quota, failure handling and `verifySelection` remain intact.
- `src/planner/DestinationSearch.tsx`: English results, selected input and selected-region announcement show known English names alongside the original Korean provider label. Saved selection data remains the original provider object. Cancellation, debounce, IME, keyboard and touch handling remain intact.
- `src/components/HomeRegionFields.tsx`: applies the same aliases to local official-list filtering. Province/city/district options display known bilingual labels in English. Stored Korean option values and the official snapshot remain unchanged; no external query is made for signup regions.
- `tests/destinations.test.ts`, `tests/destinations-ui.test.ts`, `tests/region-search-aliases.test.ts`, `e2e/english-region-search.spec.ts`: provider-mock and browser regression tests.

## Important scope boundaries

The existing travel destination schema permits city/county/district/town/township only. Province and dong-level selections remain unsupported; the shared destination schema and planner contracts were not expanded.

- `Seoul` → `서울`, `Busan` → `부산`, `Chung-Ju` → `충주시`.
- `Jeju` / `Jeju Island` → `제주시`: Jeju City, not the whole island. A visible scope note explains this.
- `Seongsu` / `Seongsu-dong` → `서울 성동구`; `Euljiro` / `Eulji-ro` → `서울 중구`. These search the containing selectable district, not the precise neighborhood. The UI explicitly explains the changed boundary; the returned district and its coordinates must still come from Kakao.
- Province names such as `Gangwon-do` translate for provider lookup and work in signup's province list. A province-only Kakao result is still filtered out by the existing travel contract; it may yield an empty travel search. Choose a city/district for travel planning.
- Unknown names, arbitrary romanizations, compound phrases such as `Seoul Seongsu`, and fuzzy transliteration are not translated. Unknown English is sent to Kakao as typed; a genuine empty response remains empty.
- Bilingual display covers the curated names, not every Korean county/town/neighborhood. Unknown Korean parts remain visible in Korean, without invented English spellings. Signup users still choose province before city/district and town.

## Verification

Commands were run with the `rtk proxy` prefix:

```sh
npx vitest run tests/destinations.test.ts tests/destinations-ui.test.ts tests/region-search-aliases.test.ts tests/administrative-regions.test.ts --hookTimeout=60000
# 56 passed. Includes both languages, 360/390/1440px, selection/clear,
# pagination, cancellation/stale responses, failures, empty results and provider revalidation.

npm run typecheck
# passed

npx eslint server/destinations.ts shared/region-search-aliases.ts src/planner/DestinationSearch.tsx src/components/HomeRegionFields.tsx tests/destinations.test.ts tests/destinations-ui.test.ts tests/region-search-aliases.test.ts
# passed

npx playwright test e2e/english-region-search.spec.ts --workers=1 --output=/tmp/localroute-english-region-final
# 3 passed: 360px, 390px, desktop. Seoul/Seongdong/Seongsu and Chungbuk/Chungju signup selection.
```

An initial signup E2E run exposed an abbreviation mismatch (충북 vs official 충청북도). Local filtering now chooses an alias variant actually present in the available official options. The final three-viewport rerun passed.

All provider responses in tests are fixtures, and browser tests block external/API access except explicitly mocked destination responses. No actual Kakao search, paid call, database change or deployment was performed. Live-provider spelling/availability and actual devices are not verified by these tests.

## Sources and integration

- Kakao official Local REST documentation reviewed: https://developers.kakao.com/docs/en/local/dev-guide#address-coord — query/page parameters, REGION vs road/parcel document types, longitude x and latitude y. Only validated provider results supply selectable identities and coordinates.
- English regional vocabulary reference: https://english.visitkorea.or.kr/svc/whereToGo/locIntrdn/locIntrdnList.do . Alias/display text is product search vocabulary, not an authoritative boundary definition.
- Existing `/api/destinations` and selection contracts are unchanged; no Planner.tsx or server/planner integration change is required. LP, booking, legal consent, QA_REPORT.md, server configuration and environment values were not changed.
