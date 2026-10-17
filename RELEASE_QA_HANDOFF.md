# LocalRoute 실제 앱 회귀 QA

2026-10-17. `AGENTS.md`, `PRD.md`, `QA_REPORT.md`, `DESIGN.md` 및 현재 앱·기존 E2E를 읽고 검증했다. 이 작업의 수정 범위는 새 `e2e/release-app.spec.ts`, `e2e/release-live.spec.ts`와 이 문서다. 기존 구현·기존 테스트·`QA_REPORT.md`는 수정하지 않는다. 공유 워크스페이스의 다른 작업자가 통합 중이므로 실패는 안정된 재현을 확인한 뒤 제품 결함으로 분류한다.

## 실행과 안전 경계

테스트는 `/plan`, `/plan/new/1`~`4`, `/discover`, `/places/:id`, `/account`, `/login`, `/itineraries/:id`, `/legal/*`의 실제 App/router를 연다. 컴포넌트 전용 harness를 사용하지 않는다. 한국어·영어 각각 360×800, 390×844, 데스크톱 1440×1000의 기존 Playwright 프로젝트에서 실행한다. 데스크톱에도 터치 에뮬레이션을 켜고 키보드 검사를 병행한다. reduced-motion과 Service Worker 차단을 사용한다.

API·SDK 경계만 테스트에서 격리한다. Vite 개발 모듈 `src/config.ts`, `src/supabase.ts`의 브라우저 응답을 가짜 설정/세션으로 바꾼다. 실제 파일은 변경하지 않는다. API 요청은 모두 명시적으로 모킹하거나 503으로 차단하며 외부 지도·Auth·제공자 요청은 차단한다. 이 검사는 빌드된 배포 번들의 검증이 아니다. `E2E_PRODUCTION=true` 모드에서는 해당 개발 모듈 경계가 없으므로 이 모드로 실행하지 않는다.

가짜 계정은 `release-fixture@example.test`, 가짜 일정 이름은 `QA fixture` 접두사이며 테스트 메모리·브라우저에만 있다. 실제 가입·메일 발송·예약·Gemini/Kakao 유료 호출·원격 DB 변경·배포는 하지 않는다. 기존 앱의 명시적 DEMO 자료를 데모 흐름에서 사용한다. 실제 좌표 정확도·영업·예약 가능성·방문 또는 LP 차감의 서버 보장을 모의 응답으로 인증하지 않는다.

재현 명령:

```sh
rtk proxy env E2E_PRODUCTION=false ./node_modules/.bin/playwright test e2e/release-app.spec.ts e2e/release-live.spec.ts --workers=2 --output=/tmp/localroute-release-qa-results
```

기존 `playwright.config.ts`가 개발 서버를 시작하거나 5173 서버를 재사용한다. 반복 검증 중에는 서버를 별도로 유지해 앞선 Playwright 실행의 정리 과정이 다음 실행의 서버를 종료하지 않게 한다. API 서버는 이 테스트의 실제 데이터 공급자가 아니다. 모든 최종 테스트 산출물은 지정한 `/tmp/localroute-release-qa-results`에 둔다. 탐색 실행의 임시 산출물은 별도 보관하고 최종 결과와 혼동하지 않는다.

최종 매트릭스는 2026-10-17 **13:22:04 KST**의 `src`·`shared` 79개 파일을 Vite `load` hook에 메모리로 보관해 실행했다. `configFile:false`, `envFile:false`, 별도 `/tmp` dependency cache, `watch:null`, `hmr:false`를 사용해 다른 작업자의 `.env`·Vite 설정 변경과 lazy module 갱신이 검사 도중 서버를 재시작하지 않게 했다. 실제 컴포넌트 소스를 테스트용 화면으로 교체한 것은 아니다. 루트 `.env`를 읽거나 수정하지 않았고 API 서버·원격 DB를 사용하지 않았다. 테스트의 SDK/config 브라우저 응답 격리는 동일하다.

소스 manifest는 `/tmp/localroute-release-qa-source-snapshot.json`이며 SHA-256은 `43a4ffd8245aecab072cf88c0226e72dd0ab56549ea38ea6e26954447fad4e22`다. 워크스페이스가 그 뒤 바뀌면 manifest와 현재 파일 hash가 달라질 수 있으므로 전체 최신 소스나 배포 버전을 인증한 결과로 읽지 않는다. `implementation-snapshot` 첨부는 당시 워크스페이스의 변경 감지 자료이며, 실제 고정 서버의 기준은 이 manifest다.

동시에 구현을 진행하는 환경에서 같은 방식으로 서버를 고정하려면, 자신이 관리하는 5173 서버를 종료한 뒤 아래를 별도 터미널에서 실행하고 위 Playwright 명령을 실행한다. 저장소 파일을 변경하지 않는다.

```sh
rtk proxy node --input-type=module <<'JS'
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
const source = new Map();
function capture(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const path = resolve(dir, item.name);
    if (item.isDirectory()) capture(path);
    else if (/\.(tsx?|css|json)$/.test(path)) source.set(path, readFileSync(path, 'utf8'));
  }
}
capture(resolve('src')); capture(resolve('shared'));
const html = readFileSync('index.html', 'utf8');
const server = await createServer({
  configFile: false, envDir: false, envPrefix: 'RELEASE_QA_NO_PUBLIC_ENV_',
  cacheDir: '/tmp/localroute-release-qa-vite-cache',
  plugins: [{ name: 'release-snapshot', enforce: 'pre',
    load: id => source.get(id.split('?')[0]),
    transformIndexHtml: { order: 'pre', handler: () => html }
  }, react()],
  optimizeDeps: { entries: ['index.html'] },
  server: { host: '127.0.0.1', port: 5173, strictPort: true, hmr: false, watch: null }
});
await server.listen();
JS
```

## 검사 내용

| 흐름             | 검증 내용                                                                                                                                                              |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 연속 선택        | 활동 7개/음식 4개 연속 touch, 전체 선택과 일부 해제, 저장된 pressed 상태 비교                                                                                          |
| 입력 보존        | 날짜·시작/종료 시간, 활동·음식, 단계 이동·앱 뒤로가기·브라우저 back/forward·새로고침                                                                                   |
| 직접 진입        | `/plan`, `/discover`, 실제 존재하는 데모 `/places/:id`, `/account`, 모달 URL 새로고침·닫기                                                                             |
| 지도             | 벡터 제공자 장애, Leaflet 대체 지도와 마커, 타일 장애 안내, 목록 유지, resize, 재시도, 일정의 지도/타임라인 열기·닫기                                                  |
| 일정             | 동의 전 생성 금지, 0 LP DEMO 고지, 동의 복원 금지, 불가능한 데모 조건의 오류, 시간 충돌 시 저장/공유 금지, 장소 교체·저장·재조회                                       |
| 모의 실사용 생성 | 가격·잔액 표시, 100 LP 동의 payload, 연속 제출 시 단일 요청, timeout·pending 복구와 실패 상태 조회, 자동 두 번째 생성 없음                                             |
| 공유             | DEMO 텍스트 복사 실패와 성공, 저장 전 공유 금지, 링크 별도 동의·서버 실패·재시도·링크 생성·해제                                                                        |
| 인증/법적 고지   | 회원가입 필수 선택 초기 미동의, 전화번호 미수집, 이메일 확인 안내, OTP 실패/링크 발송/즉시 session 오설정 안내, 로그아웃 호출, 동의 조회 장애·복구, 공개 법적 고지 URL |
| 접근성           | 단계 heading focus, modal focus 및 Escape/복귀, keyboard legal disclosure, 44px 크기, center hit-test, 가로 넘침, 하단 메뉴·고정 버튼에 의한 가림                      |

`release-app`는 각 검사에 구현 파일 SHA-256의 전/후 값, uncaught page errors, 예상 밖 외부 요청 차단 내역을 `implementation-snapshot`으로 첨부한다. 구현이 바뀌면 `implementation-changed` annotation을 남긴다. 실패 시 스크린샷·trace·error-context에 실제 상태를 보존한다. 지도 버튼은 실제 bounding box를, 가려진 버튼은 label/rect/덮은 DOM/스크롤 위치를 별도 첨부한다.

## 결과

고정 소스 전체 매트릭스: **75개 중 67개 통과 / 8개 실패 / skip·flaky 0**, 168.8초. 실패는 아래 **현재 문제 2건**으로 묶인다. 테스트를 `test.fail`이나 skip으로 감추지 않았으므로 전체 E2E 명령은 exit 1이다.

| 화면                | 언어   | 통과 | 실패 | 실패 내용        |
| ------------------- | ------ | ---: | ---: | ---------------- |
| 360×800             | 한국어 |   11 |    1 | RQA-001          |
| 360×800             | 영어   |   11 |    2 | RQA-001, RQA-003 |
| 390×844             | 한국어 |   11 |    1 | RQA-001          |
| 390×844             | 영어   |   11 |    2 | RQA-001, RQA-003 |
| 1440×1000, touch 켬 | 한국어 |   11 |    1 | RQA-001          |
| 1440×1000, touch 켬 | 영어   |   12 |    1 | RQA-001          |

모의 실사용 생성·공유·OTP·법적 동의/공개 고지 경로는 **24/24 통과**했다. 데모/일반 앱 흐름은 **43/51 통과**했다. 가로 넘침, 선택 유지, 동의 초기화, 직접 진입, 장소/시간 편집과 실패 상태가 통과했다. 가림 검사에서 실패한 영어 모바일은 후속 재현에서 soft assertion을 사용해 나머지 컨트롤과 하단 메뉴도 계속 검사한다. 이를 전체 접근성 통과로 해석하지 않는다.

- 전체 매트릭스 JSON: `/tmp/localroute-release-qa-results/matrix/report.json`.
- 안정성 재현 JSON: `/tmp/localroute-release-qa-results/report.json`.
- 실행 소스 manifest: `/tmp/localroute-release-qa-results/source-snapshot.json`.
- `rtk proxy npm run typecheck`: 고정 소스 매트릭스 시작 시 **통과**했으나, 마지막 현재 워크스페이스 검사는 담당 범위 밖 `src/planner/trip-draft.ts:3:56`의 `ZodNullable<ZodUnion<...>> is not assignable to never` 오류로 **실패**했다. 해당 통합 파일은 수정하지 않았으며 최신 전체 타입 검사/build 통과를 주장하지 않는다.
- 두 새 E2E 파일의 별도 TypeScript 검사: **통과**. `tsc --ignoreConfig --noEmit`에 프로젝트와 동일한 ES2023, DOM, ESNext/Bundler, react-jsx, strict, skipLibCheck, esModuleInterop, vite/client·node 옵션을 적용했다.
- `rtk proxy ./node_modules/.bin/eslint e2e/release-app.spec.ts e2e/release-live.spec.ts`: **통과**.

전체 결과를 보존한 다음 같은 서버·같은 소스에서 **18개를 재실행해 10개 통과 / 동일한 8개 실패**, skip·flaky 0, 40.2초였다. RQA-001의 6개 조합과 RQA-003의 2개 조합이 두 번 연속 재현됐다. 보강한 지도/일정 버튼의 pressed 상태와 모바일 지도 닫힘 검사는 6개 조합 모두 통과했다. 접근성 검사는 soft assertion으로 끝까지 진행해 하단 메뉴·초점까지 확인했다. 실패 조건을 자동 재시도로 덮지 않았다.

```sh
rtk proxy env E2E_PRODUCTION=false PLAYWRIGHT_JSON_OUTPUT_NAME=/tmp/localroute-release-qa-results/report.json ./node_modules/.bin/playwright test e2e/release-app.spec.ts --grep 'map provider|44px controls|generation consent reset' --workers=2 --reporter=list,json --output=/tmp/localroute-release-qa-results
```

## 발견 사항

### RQA-001 — 대체 지도 확대/축소 컨트롤이 44px 조건을 충족하지 않음

- 분류: **확인된 현재 문제 / P2**, 모바일 수용 조건.
- 재현: `/discover` 진입 → 벡터 지도 제공자를 실패시키기 → 대체 Leaflet 지도 확인 → `.leaflet-control-zoom-in`의 CSS bounding box 측정. 테스트는 지도 재시도·화면 resize·장소 목록 사용 후 측정한다.
- 기대: 최소 44×44 CSS px의 실제 터치 영역.
- 실제: 최종 매트릭스의 **6개 화면/언어 조합 모두 30×30px**로 측정되어 `>=44` 검사가 실패했다. 지도가 대체되며 장소 목록·마커는 계속 사용 가능했다. 기존 `src/styles.css`의 44px 선언이 있어도 실제 lazy-loaded Leaflet touch 컨트롤에 적용된 크기는 30px였다. CSS 우선순위/지연 로딩 순서를 점검한 뒤 실측으로 수정 여부를 확인해야 한다.
- 근거: `map provider failure retains fallback map, resize, retry and place list`; `fallback-map-controls` 첨부, 실패 screenshot/trace/error-context.
- 관련 파일: `src/components/RasterMap.tsx`의 Leaflet zoomControl 생성, `src/styles.css` 및 Leaflet 기본 CSS. 지도 SDK 교체·데이터 접근 실패가 아니라 컨트롤 크기의 문제다.
- 바로 볼 근거: [360px 한국어 error-context](/tmp/localroute-release-qa-results/release-app-ko-map-provide-928fa-resize-retry-and-place-list-mobile-360/error-context.md), [스크린샷](/tmp/localroute-release-qa-results/release-app-ko-map-provide-928fa-resize-retry-and-place-list-mobile-360/test-failed-1.png), 같은 폴더의 `trace.zip`. 다른 화면/언어도 JSON 결과의 `fallback-map-controls`에 30×30px로 기록됐다.

### RQA-002 — 영어 상세 버튼 안내: 통합 후 수정 확인

- 분류: **초기 재현 후 통합 수정 확인 / 현재 문제에서 제외**.
- 재현: EN 선택 → `/discover` → 장소 카드의 accessible name 검사.
- 기대: 고유 장소 이름은 유지하면서 `View details` 등 영어 동작 안내 제공.
- 실제: 초기에는 `소담한 식탁 자세히 보기` 등 한국어 동작 안내가 남아 있었다. 별도 통합 변경 후 최종 고정 소스에서는 `View details for 소담한 식탁` 형태가 제공되어 영어 **3개 화면 모두 통과**했다. 고유명사나 기여자의 원문 리뷰에 대한 번역 요구가 아니다. 이 QA 작업이 구현을 수정한 것은 아니다.
- 근거: `English discovery exposes English detail-action labels`; `discovery-accessible-labels` 첨부와 역할 기반 `getByRole('button', {name: /자세히 보기/})` 검사.
- 관련 파일: `src/App.tsx`의 `.place-card-main` `aria-label`, `src/i18n/locales/discovery.ts`.

### RQA-003 — 영어 모바일 활동/음식 버튼을 고정 단계 액션·하단 메뉴가 가림

- 분류: **확인된 현재 문제 / P2**, 모바일 터치·스크롤 수용 조건.
- 재현: EN → `/plan` → Plan my trip → Continue → 두 번째 단계의 활동·음식 버튼을 순서대로 `scrollIntoViewIfNeeded()`하고 중심 hit-test.
- 기대: 스크롤로 드러난 44px 버튼의 중심을 다른 고정 액션이나 하단 메뉴가 가리지 않음.
- 실제: 폰트 로딩 완료 후에도 **360px·390px 영어에서 재현**됐다. 360px의 `Local discoveries`는 `(x=29, y=661.97, w=116, h=44)`, 390px의 `Korean`은 `(x=36, y=721.63, w=66, h=44)`였다. 두 경우 모두 중심의 `elementFromPoint`가 해당 선택 버튼이 아니라 고정된 **Back** 버튼을 반환했다. 두 기록의 `scrollY=0`. 최소 스크롤 동작은 이미 viewport 안에 있다고 판단하므로 이를 자동으로 해결하지 못한다. 한국어 모바일·영어 데스크톱의 해당 검사는 통과했다. 입력 손실은 주장하지 않는다.
- 끝까지 진행한 재현에서는 360px의 Korean/Japanese/Western 중심을 하단 메뉴의 Plan a trip/Discover/My trips가 가리는 경우도 기록됐다. 390px에서도 Korean/Japanese/Western/Cafes and desserts가 고정 액션 또는 하단 메뉴에 가렸다. `covered-control`에 대상과 실제 덮는 DOM이 각각 저장된다. 44px 크기를 충족하는 것만으로 가림이 해결되지는 않는다.
- 근거: `44px controls, focus, no horizontal overflow and bottom-menu reachability`; 실패 screenshot, 보강한 `covered-control` 첨부.
- 관련 파일: `src/planner/Planner.tsx`, `src/planner/planner.css`의 `.wizard-actions`, 모바일 레이아웃과 스크롤 여백.
- 바로 볼 근거: [360px 영어 error-context](/tmp/localroute-release-qa-results/release-app-en-44px-contro-60c71-nd-bottom-menu-reachability-mobile-360/error-context.md), [스크린샷](/tmp/localroute-release-qa-results/release-app-en-44px-contro-60c71-nd-bottom-menu-reachability-mobile-360/test-failed-1.png), [390px 영어 error-context](/tmp/localroute-release-qa-results/release-app-en-44px-contro-60c71-nd-bottom-menu-reachability-mobile-390/error-context.md), 각 폴더의 `trace.zip` 및 JSON `covered-control` 첨부.

## 일시적 실패와 한계

- 최초 입력 보존 검사는 reload 직후 lazy 화면이 준비되기 전 배열을 읽어 빈 배열로 실패했다. snapshot에는 올바른 선택이 있었으므로 자동 대기 비교로 테스트를 수정했다. 이를 입력 손실 결함으로 집계하지 않는다.
- 재사용하던 서버를 이전 실행이 종료해 `ERR_CONNECTION_RESET`이 발생했다. 종료 원인을 분리하고 유지되는 로컬 서버에서 재실행한다. 이 연결 오류를 다수의 앱 결함으로 세지 않는다.
- 작업 초기에 익명 `/account`가 프로필을 보였으나 별도 통합 변경 후 로그인 화면으로 바뀌었다. 새 회귀 검사를 유지하되 최신 재현에서 통과하면 현재 결함으로 분류하지 않는다.
- 법적 동의 gate가 통합된 뒤 가짜 회원 테스트의 미모킹 조회가 의도적으로 503 차단되어 화면 진입이 막혔다. 정상 동의 응답 fixture를 추가하고 조회 실패·복구를 별도 검증한다. 실제 서비스 장애로 주장하지 않는다.
- 기존 React StrictMode에서 조회가 두 번 실행될 수 있으므로, 법적 동의 장애 fixture는 단순 첫 호출만 실패시키지 않고 명시적인 재시도 전까지 실패 상태를 유지한다. 초기 fixture의 중복 조회 타이밍 문제도 제품 결함에서 제외했다.
- `.env`·Vite 설정 통합 중 서버 재시작과 의존성 재번들로 발생한 lazy module fetch/useContext 오류는 고정 서버에서 재현되지 않았다. 최종 고정 소스 실행에서는 uncaught page error 검사도 통과했다. 워크스페이스 전/후 SHA 변경 annotation은 고정 서버 소스가 변경됐다는 뜻이 아니다.
- 실제 기기의 가상 키보드, 스크린리더 음성, 실제 이메일 전달·Supabase 설정, 실서버 LP 원자성·RLS, 예약 제공자 상태, 원격 지도 품질은 이 브라우저 모의 검사 범위 밖이다. 키보드·focus·터치 에뮬레이션 검사가 이 항목들을 대체하지 않는다.
