# 여행 지역 검색 인계

2026-10-17. 수정 범위는 `server/destinations.ts`, `shared/destinations.ts`, `src/planner/DestinationSearch.tsx`, 새 관련 테스트 두 파일과 이 문서뿐이다. 기존 파일과 다른 작업자의 변경은 건드리지 않는다.

## 구현과 범위

- 새 검색 모듈에는 성수/종로/해운대 열거형 제한이 없다. 대한민국 시·군·구·읍·면 지명을 서버 Kakao 주소 검색에서 가져온다. 상세 주소, 도로, 동, 리, 도 단위 결과는 제외한다. 광역시·특별시·세종의 축약명도 시로 허용한다. 지명 검색은 행정구역 전체 목록 API가 아니므로 모든 지역의 검색 성공이나 영문 검색 지원을 보장하지 않는다.
- 응답은 `{ destinations: Destination[], page: number, hasMore: boolean }`. 1~45페이지, 페이지당 최대 30개를 요청한다. 필터링 후 빈 페이지여도 공급자 다음 페이지가 있으면 더 보기가 가능하다. 같은 이름의 지역은 상위 시·도와 시·군·구를 포함해 구별한다.
- `Destination`은 `id`, `label`, `country: 'KR'`, `level`, `region1/2/3`, `lat/lng`, `source`를 포함한다. `id = kakao:region:${encodeURIComponent(label)}`는 **LocalRoute 선택 키**다. Kakao 장소 ID·행정구역 코드·내부 DB UUID가 아니다. 제공되지 않은 코드를 만들어 저장하지 않는다.
- 고정 HTTPS endpoint, `address_type=REGION`, 한국 시·도 식별, 계층과 전체 명칭 일치, 유한한 좌표와 경도/위도 순서, 대략적인 한국 좌표 범위(위도 32~39, 경도 124~132)를 검사한다. 이는 경계 폴리곤 검증·공식 행정구역 인증·여행 출발점 검증이 아니다. 좌표는 공급자 지명의 대표 위치이며 이동시간 계산에는 별도의 정확한 출발·도착점이 필요하다.
- `source`는 서버가 고정하는 Kakao endpoint, `REGION`, 조회 시각, `verification: 'provider'`, `coordinateMeaning: 'region_representative'`다. 브라우저가 받은 구조 검증만으로 진위를 보장하지 않는다. 생성 서버는 아래 `verifySelection()`으로 다시 확인해야 한다.
- 기능 비활성화, 키 누락, 잘못된 질의, 401/403, 404/5xx/네트워크 실패, 429와 Retry-After, 6초 timeout, JSON 오류, 결과 없음 상태를 구별한다. 원문 오류/키는 응답하지 않고 자동 재시도나 가짜 결과로 대체하지 않는다.
- 기본 프로세스당 공급자 호출 60회/시간, IP당 HTTP 요청 15회/분, 동시 동일 질의/페이지 요청 합치기를 제공한다. 완료된 검색 결과는 캐시·DB에 저장하지 않는다. 다중 인스턴스 운영에는 공유 rate limiter와 실제 계정 쿼터 감시가 별도로 필요하다. 검색어/IP를 로그나 분석 도구로 보내지 않는다.
- UI는 한·영 안내, 350ms debounce, IME 조합 중 검색 방지, AbortSignal과 세대 번호로 이전 응답 폐기, 재시도, 더 보기, 선택 지우기, 편집 즉시 기존 선택 해제, Tab/화살표/Enter/Escape, 라이브 상태를 제공한다. 부모 `<form>` 안에서도 검색 중 Enter는 일정 생성 제출을 유발하지 않는다. 키는 클라이언트로 전달하지 않는다.

## 공식 문서 확인

2026-10-17에 다음 문서를 브라우징했다. 실제 API 호출은 하지 않았다.

- [Kakao Local REST API — 주소로 좌표 변환](https://developers.kakao.com/docs/latest/ko/local/dev-guide#address-coord): `GET https://dapi.kakao.com/v2/local/search/address.json`, `Authorization: KakaoAK <REST_API_KEY>`, `query`, `analyze_type`, `page`(1~45), `size`(1~30). `REGION/ROAD/REGION_ADDR/ROAD_ADDR`, `x=경도`, `y=위도`와 지역 계층 필드를 확인했다.
- [쿼터](https://developers.kakao.com/docs/latest/ko/getting-started/quota): 앱별 합산 및 변경 가능성 확인. 코드의 보수적인 자체 예산은 계정 잔여 무료량을 의미하지 않는다.
- [운영 정책](https://developers.kakao.com/terms/latest/ko/site-policies): 실제 서비스의 표시·보관·타 지도 결합과 계정 권한 검토를 대체하지 않는다. 이 문서 열람만으로 영구 저장이나 특정 지도 위 표시가 허가됐다고 가정하지 않는다. `KAKAO_TERMS_VERIFIED`는 해당 사용 방식과 계정 검토 후에만 설정한다.

## 정확한 통합 방법 — 이 작업에서 기존 파일은 변경하지 않음

아래 연결 안내는 최초 점검한 기존 코드 계약을 기준으로 한다. 작업 중 공유 워크스페이스의 다른 작업자가 `server/app.ts`, `server/config.ts`, `shared/planner.ts`, Planner와 생성 서버 등에 이 모듈을 연결하는 변경을 진행한 것을 확인했다. 이 작업의 커밋에는 그 변경을 포함하지 않는다. 통합 담당자는 최신 diff와 이미 적용한 연결을 확인하고 아래 내용을 중복 적용하지 않아야 한다. 특히 기존 문자열 목적지를 허용하는 호환 union과 유료 요청 재생 순서는 별도로 확인한다.

### 1. 서버 환경과 라우트

루트 `.env`만 사용한다. 기존 키를 재사용하고 `VITE_` 접두사를 붙이지 않는다. 이 작업은 `.env`를 읽거나 변경하지 않았다. 기본값은 비활성화다.

```dotenv
FEATURE_KAKAO_DESTINATIONS=false
KAKAO_TERMS_VERIFIED=false
KAKAO_REST_API_KEY=
```

`server/config.ts`의 `readConfig(env)` 반환값에 `destinations: readDestinationConfig(env)`를 추가한다. `readDestinationConfig`는 `./destinations`에서 import한다. `server/app.ts`의 `createApp` 내부에서 서비스 인스턴스를 한 번 만들고, **`app.use('/api', ...404...)`보다 앞에서** 연결한다. 요청마다 새 인스턴스를 만들면 호출 예산과 중복 요청 합치기가 무효화된다.

```ts
import { attachDestinations, KakaoDestinations } from "./destinations";
// createApp 내부, /api 404 fallback 등록 전
const destinations = new KakaoDestinations(config.destinations);
attachDestinations(app, destinations);
```

`GET /api/destinations?q=충주시%20살미면&page=1`은 로그인 없는 무료 검색이다. 환경/키/공급자 문제는 503, timeout은 504, 공급자 응답 오류는 502, 호출 제한은 429, 입력 오류는 400이다. 성공한 검색 결과 없음은 200과 빈 배열이다. 기존 LP·인증·DB 플래그와 결합하지 않는다. 현재 `createApp()` 반환 후에 붙이면 기존 `/api` 404에 가로막히므로 반드시 내부에서 먼저 등록한다.

### 2. TripInput·폼·API 계약

`shared/planner.ts`에서 `tripSchema`의 `destination: z.enum(['seongsu','jongno','haeundae'])`를 `destination: destinationSchema`로 바꾸고 `./destinations`에서 import한다. `TripInput`은 추론되므로 함께 바뀐다. 단순 `z.string()`이나 기존 enum에 몇 개 지역을 추가하는 방식은 쓰지 않는다.

아직 선택하지 않은 폼 초안에는 `destination: Destination | null`이 필요하다. 예: `type TripDraft = Omit<TripInput, 'destination'> & { destination: Destination | null }`. 초기값은 `null`, 단계 진행 전 `tripSchema.safeParse(draft)`로 필수 선택을 검사한다. `src/planner/Planner.tsx` 첫 단계의 `<select>`와 3개 지역 파일럿 설명을 다음 형태로 교체한다. 외부 `<label>`로 전체 컴포넌트를 감싸지 않는다.

```tsx
<DestinationSearch
  language={language}
  value={input.destination}
  onChange={(destination) => update("destination", destination)}
  disabled={busy || Boolean(pending.current)}
/>
```

컴포넌트는 기본적으로 same-origin API에 직접 연결하므로 `src/api.ts` 변경 없이도 사용할 수 있다. 기존 API 계층을 이용하려면 같은 파일에서 export한 `searchDestinations`를 `api.destinations`로 재노출하고 `search={api.destinations}`를 전달한다. **선택한 전체 객체**를 `api.generate({input: ...})`로 전달한다. API 반환 구조는 런타임 스키마로 검증한다. 알 수 없는 지역을 기존 `seongsu`로 강제 변환하지 않는다.

### 3. 생성 서버에서 좌표/출처 재검증

`server/planner/routes.ts`의 `attachPlanner`에 검색 서비스 의존성을 전달한다. `generateSchema.parse(req.body)` 후, 신규 작업의 **`repository.planning(..., 'reserve', ...)` 전** 다음과 같이 재검증한다.

```ts
const verifiedDestination = await destinations.verifySelection(
  payload.input.destination,
);
// 후보 수집/지도 중심에는 이 서버 검증값만 사용한다.
const canonicalInput = { ...payload.input, destination: verifiedDestination };
```

재검증은 전체 명칭으로 Kakao 주소 검색을 한 번 수행하고 선택 키·좌표가 같은 실제 결과를 반환한다. 위조·변경·사라진 결과는 실패한다. 좌표가 바뀌었으면 재선택하도록 안내한다. 호출 실패나 검증 실패 시 LP를 예약하거나 차감하지 않는다.

주의: `observedAt`은 조회마다 달라진다. 이를 매 재시도 `reserve`의 기존 payload에 덮어쓰면 기존 payload hash와 충돌할 수 있다. 기존 idempotency 계약을 유지하고, 검증된 좌표는 후보 조회용으로 사용하되 동의/요청 payload는 그대로 보존한다. `ready`/진행 중 요청의 재생은 소유권·기존 payload 일치 확인 후 저장 결과/상태를 먼저 반환하여 새 공급자 호출 없이 복구해야 한다. 새 요청만 재검증하고 예약하며, 원래 동의 없이 새 requestId를 만들지 않는다. 통합 시 이 순서의 회귀 테스트를 추가해야 한다.

### 4. 함께 바꿔야 하는 기존 지역 참조

- `server/planner/catalog.ts`: 두 곳의 `regions[input.destination]`를 검증된 `input.destination` 좌표로 바꾼다. 기존 반경 5km/3km는 시 전체 경계가 아니므로 별도로 설명하고 후보 부족은 무과금 실패로 처리한다. 지역 검색 성공을 일정 생성 가능으로 표시하지 않는다.
- `server/planner/routes.ts`: pin 재생성의 목적지 비교는 객체 참조 비교(`!==`) 대신 검증된 `.id` 비교로 바꾼다. 날짜·기존 계획 소유권 확인은 유지한다.
- `src/planner/Planner.tsx`: 요약/저장 목록의 `regions[...]`는 `.label`로 대체한다. 한·영 UI에서도 Kakao 고유 명칭은 유지하고 번역된 장소명을 만들어내지 않는다.
- `src/planner/ItineraryEditor.tsx`: 지도 중심을 `[input.destination.lng, input.destination.lat]`, 캡션을 `.label`로 바꾼다.
- `shared/sharing.ts`, `src/planner/SharedItineraryPage.tsx`: 공유 DTO의 enum과 지도 참조도 변경해야 한다. 공유 snapshot에는 검증된 지역 식별/대표 좌표만 명시적으로 포함하고 다른 비공개 입력을 펼치지 않는다. 기존 공유 version 1 계약과 충돌하므로 버전 업 또는 기존 snapshot 읽기 어댑터가 필요하다.
- `shared/planner-demo.ts`, Planner의 `input.destination !== 'seongsu'` 분기, 세션 초안/저장 일정/대기 요청, 관련 테스트 fixture를 새 계약으로 정리한다. 기존 문자열 기록을 검증된 실시간 지명인 것처럼 변환하지 않는다. 새 검색 모듈은 demo 지역을 주입하지 않는다. 기존 demo 일정은 명시적인 별도 demo 경로를 유지하거나 새 입력과 호환될 때까지 비활성화한다. 알 수 없는 기록은 복구 안내로 처리하고 진행 중 유료 요청 payload는 임의 변경하지 않는다.
- `src/api.ts`의 `TripInput` 타입은 schema 변경으로 전파된다. 생성의 검증 실패 오류 코드는 기존 i18n 오류 표에 추가하거나 이 컴포넌트 안내와 동일하게 한·영으로 매핑해야 한다.

## 검증 기록

테스트는 공급자 응답을 모의하며 브라우저는 로컬 테스트 서버와 모의 API만 사용한다. 원격 DB 변경·배포·실제 Kakao/Gemini 유료 호출은 하지 않았다.

- `rtk proxy npm test -- tests/destinations.test.ts tests/destinations-ui.test.ts`: **33개 통과**. 서버 계약·검증·오류·호출 제한·선택 재검증 27개와 실제 Chromium 브라우저 검사 6개다. 360/390/1440px, 한·영, 44px 터치 영역, 가로 넘침 없음, 스크롤·키보드·터치, reduced-motion 환경, IME·debounce·이전 응답 무시, 재시도·선택 해제·빈 페이지 더 보기를 검증했다.
- `rtk proxy npm test -- --maxWorkers=1 --hookTimeout=30000`: **22개 파일 / 222개 테스트 모두 통과**. 기존 테스트의 일회용 DB fixture도 포함하며 원격 DB가 아니다. 최초 기본 병렬 실행은 여러 기존 fixture 준비 hook의 10초 초과와 브라우저 시간 초과로 실패했으므로 자원 경합을 줄인 순차 실행 결과를 최종 기록으로 삼는다.
- `rtk proxy npm run lint`: **통과**.
- 추가한 TypeScript/TSX 파일 5개의 별도 `tsc --ignoreConfig --noEmit` 검사: **통과**. 프로젝트와 동일한 ES2023, DOM, ESNext/Bundler, react-jsx, strict, skipLibCheck, esModuleInterop, vite/client·node 옵션을 사용했다.
- 마지막 `rtk proxy npm run typecheck`: **실패**. 담당 범위 밖인 `tests/ai-assistance.test.ts:92`의 generic model mock 타입 불일치와 `:353`의 빈 tuple 인덱스 오류다. 전체 타입 검사 또는 build 통과를 주장하지 않는다. 다른 작업자의 해당 파일은 수정하지 않았다.
- 새 테이블·Storage·LP·예약·권한 쓰기 작업은 없다. 새 DB RLS 정책 적용은 해당하지 않는다. 앱 전체의 통합 완료·실계정 쿼터·Kakao 계정 권한·전국 검색 품질을 이 모의 검증으로 인증하지 않는다.
