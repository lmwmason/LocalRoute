# LocalRoute

현지인의 독립적인 추천으로 식당을 발견하고 여행에 담는 모바일 우선 웹 앱입니다. 요구사항은 `PRD.md`, 개발 규칙은 `AGENTS.md`가 기준입니다.

## 실행

Node.js 22.12 이상을 사용합니다.

```sh
npm ci
npm run dev
```

웹: http://127.0.0.1:5173 · 서버: http://127.0.0.1:3001

기본 `VITE_DATA_MODE=demo`에서는 비밀 키 없이 시작됩니다. 화면에 표시되는 가게·추천·평점은 가상 데이터이며, 데모 추천은 현재 탭의 sessionStorage에만 저장됩니다. 지도 타일은 OpenFreeMap에서 가져오며 외부 통신 실패 시 목록을 계속 사용할 수 있습니다. 게스트 여행 목록은 현재 브라우저의 localStorage에 저장됩니다.

## 환경 설정

루트 `.env`만 사용합니다. `.env.local`/`.env.example`은 만들지 않습니다. 값은 커밋하거나 출력하지 않습니다.

| 이름                                                          | 용도                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------ |
| `VITE_DATA_MODE`                                              | `demo`(기본)/`live`                                          |
| `VITE_SUPABASE_URL`                                           | 브라우저용 Supabase URL                                      |
| `VITE_SUPABASE_PUBLISHABLE_KEY`                               | 공개 클라이언트 키(우선 사용)                                |
| `VITE_SUPABASE_ANON_KEY`                                      | 기존 공개 anon 키 호환                                       |
| `SUPABASE_URL`                                                | 서버 Supabase URL                                            |
| `SUPABASE_SECRET_KEY` / `SUPABASE_SERVICE_ROLE_KEY`           | 서버 전용 관리자 키. 사용자 검증 후 제한된 RPC 호출에만 사용 |
| `VITE_MAP_STYLE_URL`                                          | MapLibre 스타일 URL. OpenFreeMap Liberty 기본값              |
| `HEY_YUMI_API_KEY`                                            | 서버 전용 HeyYumi 키                                         |
| `FEATURE_HEYYUMI_SEARCH`                                      | 외부 검색 활성화(기본 false)                                 |
| `HEYYUMI_TERMS_VERIFIED`                                      | 계정 요금·표시·영속 저장 권한을 직접 확인한 경우에만 true    |
| `HEYYUMI_REQUESTS_PER_HOUR`                                   | 단일 서버 프로세스의 시간당 호출 상한(기본 30)               |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                              | 서버 AI 연결 설정                                            |
| `FEATURE_GEMINI_MENU_EXTRACTION`, `FEATURE_GEMINI_MODERATION` | AI 기능 제어                                                 |
| `FEATURE_HEYYUMI_BOOKING`, `FEATURE_LP_REWARDS`               | 검증 전 비활성 유지                                          |
| `KAKAO_REST_API_KEY`, `KAKAO_MOBILITY_API_KEY`                | 선택적 서버 검색/경로 연결용                                 |
| `APP_BASE_URL`, `APP_TIMEZONE`                                | 로컬 서비스 기준 URL·시간대                                  |
| `KSKILL_ANALYTICS_DISABLED`                                   | 선택적 개발 도구 설정. 앱에서 k-skill을 실행하지 않음        |

`live` 전환 전 로컬 마이그레이션을 검토·적용하고 Supabase Auth 이메일 링크의 허용 URL에 개발 주소를 등록해야 합니다. 이 저장소 작성만으로 호스팅 DB를 변경하지 않습니다. 원격 적용과 배포는 별도 승인 대상입니다.

## 보안과 데이터

공개 API는 게시된 장소/추천만 읽습니다. 서버는 Supabase `getUser`로 토큰을 검증하고, 관리자 역할은 서버 소유 `user_roles`에서 확인합니다. 클라이언트는 권한·사용자 ID를 지정할 수 없습니다. 제출 RPC는 service_role만 실행 가능하며 사용자별 중복 요청과 활성 추천을 DB에서 제한합니다. 임시 운영 제한은 사용자당 분당 10건입니다. 신규 수동 장소는 기존 장소에 자동 병합하지 않고 검토 대기합니다.

HeyYumi는 core만 요청하고 서버 내부에서 동시 요청을 합칩니다. 외부 ID는 내부 UUID와 구분하며, 선택한 결과는 위변조·만료를 검사한 후 저장합니다. 라이선스가 확인되지 않은 응답 캐시는 사용하지 않습니다. 단일 프로세스 호출 예산은 다중 인스턴스 운영 전 공유 저장소 기반으로 교체해야 합니다.

OpenFreeMap 지도에는 OpenMapTiles/OpenStreetMap 출처 표시가 필요합니다. 기본 MapLibre 출처 표시를 유지합니다. 지도 제공자에 이용자의 IP 및 타일 요청 영역이 전송됩니다. 위치 권한이나 백그라운드 위치 기록은 수집하지 않습니다. 폰트는 OFL 라이선스의 Noto Sans KR이며 창업자가 제공한 루트 로고를 사용합니다.

## 검증

```sh
npm run typecheck
npm run lint
npm test
npm run build
npx playwright install chromium --only-shell
npm run test:e2e
```

DB 테스트는 PGlite의 실제 PostgreSQL 엔진에 폐기 가능한 auth 스키마/역할을 구성합니다. RLS, RPC 실행 권한, 중복 추천, 사용자별 격리, 요청 재처리와 공개 취소를 검사합니다. 호스팅 Supabase의 Auth/Storage 설정까지 검증하는 테스트는 아닙니다. E2E는 360px·390px·1440px에서 수행하며 실제 유료 제공자 호출을 하지 않습니다.

## 구현 진행

가입 지역은 도시와 선택적인 구·읍·면·동을 구분합니다. 자동 범위에서 충주시 살미면은 충주시 전체를, 서울특별시 성동구는 구 단위를 제안합니다. 사용자 지정 범위는 유지하며 자동 범위 확대 시 경계를 표시합니다. 지역별 수치는 게시된 LocalRoute 식당 주소 기준이며 실제 식당 분포 전체를 뜻하지 않습니다.

이메일 인증을 마친 신규 계정에는 선택적인 비공개 예약자 프로필(이름·전화번호)을 제안합니다. 프로필에서 수정·삭제할 수 있고, 공개 추천·Auth 메타데이터·Gemini 입력·감사 로그에 연락처를 넣지 않습니다. 저장만으로 HeyYumi에 전송하거나 예약하지 않습니다. 실제 예약 제출·상태 연동은 별도 모듈과 제공자 권한 검증이 필요합니다.

영수증은 후기나 기본 방문 인증의 필수 조건이 아닙니다. 현재 방문 후기는 미검증 상태로 저장하며 LP를 지급하지 않습니다. 도착 체크·예약 확정·장소 사진만으로 검증된 방문이나 보상 자격을 주장하지 않습니다.

지역 프로필과 실제 사진: 이메일 인증 가입 시 시·군·구 단위의 거주 지역을 받습니다. 추천에 지역을 공개하는 것은 별도 선택이며 거주 인증을 뜻하지 않습니다. 가게·여행 장소 추천에는 정확한 장소와 본인이 촬영한 실제 사진을 필수로 받습니다. 생성 이미지나 다른 장소의 사진은 넣지 않습니다. 메뉴 사진은 선택입니다.

사진은 서버에서 최대 5MB/JPEG·PNG·WebP/최소 해상도를 검사하고, EXIF를 제거한 JPEG로 변환하여 LocalRoute의 비공개 `place-photos` 버킷에 저장합니다. 미공개 사진은 작성자·운영자만 읽으며, 사진 검토와 장소 게시를 통과해야 공개 API가 이미지를 제공합니다. 사진 없는 기존 데이터는 빈 상태를 표시합니다. 업로드 파일은 브라우저 저장소에 넣지 않습니다. 이메일 링크를 열거나 페이지를 새로고침하기 전에 아직 업로드하지 않은 사진은 다시 선택해야 합니다.

사진 보관 정책을 시행하려면 서버 비밀 환경에서 `npm run photos:cleanup`을 주기적으로 실행해야 합니다. 24시간이 지난 미제출 파일 및 30일이 지난 거절 사진을 최대 100개씩 처리하며 실패한 삭제는 다음 실행에서 재시도합니다. 로컬 테스트가 이 작업을 운영 환경에 예약하지는 않습니다.

한·영 일정 마법사, 서버 Gemini 후보 선택과 시간/거리/식사 검증, 수정·대체·부분 재생성, LP 예약/유효한 결과 저장 후 원자 차감이 구현되어 있습니다. 실제 유료 생성은 `FEATURE_AI_PLANNING`, `PLANNING_POLICY_APPROVED`, `FEATURE_KAKAO_DISCOVERY`, `KAKAO_TERMS_VERIFIED` 및 DB `lp_policy.planning_enabled`를 검토 후 켜야 합니다. `AI_REQUESTS_PER_HOUR`는 서버 호출 예산입니다. 현재 데모는 가상 장소로만 동작하며 실제 영업시간·교통시간을 확인했다고 표시하지 않습니다.

현재 구현: 모바일 탐색·지도·검색/분류·상세·추천 미리보기·로그인 진입·수동 검토 제출·외부 장소 선택/식별 어댑터·브라우저 여행 목록. 실행 상태와 제한은 `/api/health`에서 확인합니다.

PRD 전체 MVP는 작업 중입니다. 원격 DB 적용, 실제 제공자 권한/비용 검증, 보상/예약 활성화는 완료되지 않았습니다. `QA_REPORT.md`는 독립 리뷰어가 관리하며 구현자가 수정하지 않습니다.
