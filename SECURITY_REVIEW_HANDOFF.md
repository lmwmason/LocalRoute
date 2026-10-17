# LocalRoute 출시 보안 검토 인계

검토일: 2026-10-17, Asia/Seoul. **현재 검토 결과는 출시 보안 승인 보류입니다. 재현한 P1 2건을 먼저 수정하고 다시 검증해야 합니다.** 실제 키 유출이나 운영 환경 침해를 확인했다는 의미는 아닙니다.

검토 기준: AGENTS.md, PRD.md, QA_REPORT.md, Supabase 및 Supabase Postgres 보안 스킬. QA_REPORT.md의 과거 스냅샷을 현재 구현의 증거로 대체하지 않았으며 해당 파일의 상태/내용을 수정하지 않았습니다. 다른 담당자의 작업이 진행 중인 공유 작업 트리에서 읽은 구현을 대상으로 했습니다. 마지막 확인 기준 HEAD는 `33da8bd`이며 미커밋 구현도 포함합니다. 주요 입력의 SHA-256을 아래에 남깁니다.

변경한 파일은 이 인계 문서와 새 `tests/release-security-boundary.test.ts`, `tests/release-security-bundle.test.ts`, `tests/release-security-database.test.ts`뿐입니다. 기존 구현·기존 테스트·마이그레이션·QA_REPORT.md를 수정하지 않았습니다.

실제 공격, 원격 DB 조회/변경, 가입/인증 메일, 실제 예약, 유료 API 호출, 배포를 하지 않았습니다. 외부 접근은 공식 문서 조회뿐입니다. DB는 폐기 가능한 메모리 PGlite, HTTP는 로컬 Express/Supertest, 제공자/인증 응답은 mock을 사용했습니다. 번들 검증은 `.env`를 읽지 않도록 `envDir: false`와 가짜 키만 사용하며 `/tmp`의 임시 산출물을 검사 후 제거합니다. 실제 `.env`의 비밀값이나 운영 로그를 열람하지 않았습니다.

## 확인된 문제

### RS-001 — P1: 공개 키 설정에 들어간 레거시 service_role 자격증명을 빌드가 거부하지 않음

**재현:** `tests/release-security-bundle.test.ts`의 `CONFIRMED RS-001` 두 테스트. 사용할 수 없는 가짜 JWT에 `role: service_role`을 넣고 `VITE_SUPABASE_ANON_KEY`로 설정합니다. 나머지 서버 전용 키도 각각 별도의 가짜 표식으로 설정합니다. 실제 Vite production build를 실행하면 빌드가 성공하고 클라이언트 JS에 가짜 service-role JWT 전체가 포함됩니다. 별도 테스트에서 `readConfig`도 같은 키를 publicKey로 수용하고 `database: true`를 반환합니다.

**근거:** `src/config.ts:7`은 두 공개 키 설정을 그대로 선택합니다. `src/supabase.ts:9`는 `sb_secret_` 접두어만 검사하며 레거시 service-role JWT를 검사하지 않습니다. `server/config.ts:17`은 키의 존재 여부만 검사합니다. `vite.config.ts`에는 공개 키의 형식/역할을 검증해 빌드를 중단하는 처리가 없습니다. Vite의 `VITE_` 값은 브라우저 산출물에 치환됩니다.

**영향과 조건:** 운영자가 실제 service-role 자격증명을 이 공개 설정에 잘못 복사하면 다운로드 가능한 JS로 자격증명이 공개됩니다. 실제 유효한 service-role 키는 RLS를 우회하는 권한이 있으므로 영향이 큽니다. **공격자가 환경 변수를 변경할 수 있다고 가정한 원격 공격이나, 현재 운영 키가 유출됐다는 주장은 아닙니다.** 검증한 결함은 이런 설정 오류를 빌드/설정 검증에서 차단하지 못한다는 것입니다. 올바른 서버 전용 변수에 둔 가짜 Supabase/Gemini/HeyYumi/Kakao 키는 같은 번들에 포함되지 않았습니다.

**수정 제안:** 공용 키 검증을 빌드 진입점과 서버/클라이언트 설정에 공통 적용하세요. `sb_publishable_` 또는 레거시 `role: anon`만 허용하고 `sb_secret_`, `role: service_role`, 식별 불가능한 JWT/역할은 공개 설정에서 거부하세요. 레거시 키의 프로젝트 식별 정보도 허용된 LocalRoute 프로젝트와 대조하세요. 브라우저에서 초기화만 중단하는 것은 이미 포함된 비밀값을 번들에서 제거하지 못하므로 빌드가 산출물 작성 전에 실패해야 합니다. 수정 후 재현 테스트의 기대 결과를 '빌드 거부'로 전환하고 정상 공개 키로는 서버 전용 표식이 포함되지 않는 회귀 검증을 유지하세요.

### RS-002 — P1: 법적 동의 전 planning quote가 월간 LP를 발급함

**재현:** `tests/release-security-database.test.ts`의 `CONFIRMED RS-002`. 모든 현재 마이그레이션을 적용한 메모리 DB에 확인된 이메일을 가진 사용자를 만들되 `legal_consent_events`는 비워 둡니다. 실제 `createApp`에 메모리 DB로 위임하는 repository와 확인된 사용자 Auth mock을 연결하고 법적 동의 조회는 `current: false`로 둡니다. 같은 사용자로 `GET /api/me`는 403이지만 `GET /api/planning/quote`는 200이며 promo 300을 반환합니다. DB의 LP ledger에도 실제로 +300 한 행이 생기고 법적 동의 행은 여전히 0개입니다. 외부 fetch는 차단했고 호출되지 않았습니다.

**근거:** `server/app.ts`의 `if (config.live && config.database)` 이후의 동의 미들웨어 목록에는 generate/status/itineraries 등이 있지만 quote가 없습니다. `server/planner/routes.ts`의 `/api/planning/quote`는 actor 검사 후 `planning(..., 'balance', ...)`를 호출합니다. `20261017024600_planner_entitlements.sql:77`의 balance/reserve 공통 분기에서 월별 grant와 ledger를 INSERT합니다. 이 SQL의 해당 경로는 현재 법적 동의를 확인하지 않습니다.

**영향과 조건:** 서버 일정 기능(새 GEMINI_DATA_PROCESSING_APPROVED 플래그 포함)과 DB LP 정책이 모두 활성화되어 있고 해당 월 grant가 없으면, 필수 동의를 거부한 계정도 회원 LP 발급을 실행할 수 있습니다. 단순 가격 조회인 GET이 원장 쓰기를 일으키며, 가입 동의 게이트의 범위를 우회합니다. 동의 증빙을 받기 전에 인증/추천 외 LP 처리를 시작하는 출시 차단 사유입니다. **확인한 범위는 월간 프로모션 LP 발급이며 무제한 발급·중복 차감·유료 생성 우회가 아닙니다.** generate의 동의 차단은 별도 테스트에서 통과했습니다.

**수정 제안:** 가격/정책 조회를 쓰기 없는 함수로 분리하세요. 월간 LP 발급은 동의가 완료된 보호 작업에서만 원자적으로 수행하고, 발급 직전 확인된 이메일·현재 법적 동의도 서버/DB에서 검사하세요. 단기적으로 quote도 `requireConsent` 뒤에 두면 이 재현 경로를 막을 수 있습니다. 비회원에게 가격을 보여줘야 하면 공개 가격 응답과 회원 잔액/발급을 분리하세요. 수정 후 같은 재현은 '동의 전 grant/ledger 0개'를 기대하도록 바꾸세요.

두 P1은 발견 시 대화에서 즉시 알렸습니다. 이번 담당 범위는 검토이므로 수정은 적용하지 않았습니다.

## 검증한 방어 동작

| 집중 항목 | 실행한 로컬 검증과 결과 |
| --- | --- |
| 클라이언트 번들 | 실제 production build에서 정상 서버 전용 가짜 키 표식이 JS에 포함되지 않음. sourcemap 미생성. 공개 키 오설정은 RS-001로 구분. 실제 운영 번들/키 무유출을 인증하는 검사는 아님. |
| 확인 이메일·관리자 | 실제 SupabaseRepository의 getUser 경계를 mock해 미확인/익명/없는 사용자 거부. user_metadata의 admin 역할은 무시하고 server-owned role 결과를 사용. HTTP 관리자 큐/판정에서 traveler의 위조 role/app_metadata 거부. SQL moderation 큐도 역할 재확인. |
| 법적 동의 | 실제 createApp의 기여·프로필·생성·예약 제출 경로에서 동의 미완료를 403으로 차단하고 repository 쓰기 전 종료. 법적 동의 SQL은 미확인 이메일과 타인 읽기를 거부. quote 예외는 RS-002. |
| 모든 신규 테이블/RPC | 현재 마이그레이션 13개로 정의된 public 테이블 **34개**를 포함해 RLS 누락 0개. 기존 호스팅과 유사한 broad default grant를 주고 시작해도 anon/authenticated의 INSERT/UPDATE/DELETE/TRUNCATE 권한 0개. public 함수의 클라이언트 EXECUTE 권한과 SECURITY DEFINER 함수 0개. Storage는 별도 모의 스키마로 검증. |
| LP 차감 | 월별 grant 재호출 한 번만 발급. 같은 요청 재예약/최종화에도 차감 한 번. 바뀐 payload 거부, 실패한 hold 최종화 거부·추가 차감 없음. 타인 요청/일정 조회 거부, stale revision 저장 거부. 클라이언트 ledger INSERT 및 원장 DELETE 거부. |
| 방문 보상 | 새 visit_reward 모듈 SQL까지 검증. 미확인 이메일·일반 사용자 심사/지급·타인 방문 요청 읽기 거부. 사람의 독립 증빙/관계/공모 검토 승인 후에만 지급. 두 정책 게이트를 켠 fixture에서 재시도 두 번에 curator earned LP 한 번(20)만 기록. 다음날 동일 방문자/업소의 재지급은 90일 제한으로 거부, 관계자 등록 후에도 거부. 원장·지급 증빙 변경 금지. 낮은 식당 만족도와 추천 도움 평가는 분리된 fixture 사용. |
| 예약 | DB claim의 동일 키 재시도는 기존 행 반환. 바뀐 payload·새 키로 같은 활성 슬롯 예약은 거부. 타인 예약 읽기/RLS 차단. 실제 HTTP 모듈과 fake provider에서 모호한 timeout은 unknown으로 보존하며 동일 키 POST 재시도에도 제공자 submit은 1회. 연락처·요청 문구는 공개용 예약 응답/상태 이벤트/감사 payload에 포함되지 않음. 실제 예약 호출은 없음. |
| 공유 | 공유 snapshot에서 개인 식이 입력·모델 자유 제목/요약 제거. DB에는 token hash만 저장. 다른 사용자의 생성·회수·테이블 읽기 거부. 잘못된 토큰, 만료, 회수 후 공개 접근 거부. owner의 중복 회수 허용. 링크의 UUID를 알아도 원본 일정 소유권 검사 유지. |
| 사진 | 비인증/미확인 업로드 거부, 5 MiB 초과 413, 위장 JPEG와 작은 이미지 거부. 실제 JPEG EXIF/GPS가 있는 fixture를 정규화한 후 EXIF/방향/개인 Artist 표식 제거와 크기 제한 확인. 비공개 사진은 소유자/검토자만 조회, 공개 사진은 승인+published 부모 모두 필요. 다른 앱의 넓은 Storage 정책이 있어도 place-photos 읽기/쓰기 우회 거부, bucket public=false. |
| 응답·애플리케이션 로그 | 내부 예외에 가짜 비밀값/전화번호를 넣어도 generic 500 응답이며 console.log/warn/error 호출 없음. Auth 온보딩 payload로 예약 연락처가 복사되지 않음. 서버에서 발견된 console 사용은 시작 메시지/누락 설정 경고와 정리 개수이며 request body 출력 경로는 찾지 못함. 운영 프록시/제공자 로그는 미검증. |
| 잘못된 프로젝트·누락 키 | readConfig는 잘못된 프로젝트/누락 키/잘못된 URL에서 database=false·planning=false와 값이 포함되지 않은 경고를 반환. 이 경우 기본 서버 부트스트랩은 repository를 만들지 않으므로 다른 DB로 대체 연결하지 않음. 실제 운영 시작 환경은 조회하지 않음. 공개 키 역할 검증 누락은 RS-001. |

## 실행 결과

```sh
rtk proxy npx vitest run tests/release-security*.test.ts --maxWorkers=1 --hookTimeout=30000
```

**신규 3개 파일, 21개 테스트 통과.** 이 숫자에는 결함을 입증하는 `CONFIRMED RS-001/002` 테스트가 들어 있습니다. 모두 초록이라고 보안 문제가 없다는 의미가 아닙니다. 수정 담당자는 결함 재현 테스트를 수정된 보안 기대값으로 바꿔 다시 실행해야 합니다.

- `rtk proxy npx eslint tests/release-security*.test.ts`: 통과.
- `rtk npm run typecheck`: 최종 신규 테스트 작성 후 통과. 앞선 중간 실행에서는 담당 밖 AI 보조 모듈의 타입 오류가 있었으나 이후 실행에서 해결된 상태를 확인했습니다.
- 담당 파일 `git diff --check`: 통과.
- 기존 관련 보안/DB 테스트도 **7개 파일·53개 테스트 통과**했습니다. 이는 마지막 메뉴 draft 마이그레이션/AI 앱 연결 변경이 유입되기 전 확장 검증 기록이며 최종 전체 저장소 테스트 통과를 뜻하지 않습니다. 최종 신규 21개 테스트는 추가 마이그레이션을 포함해 다시 실행했습니다:

```sh
rtk proxy npx vitest run tests/database.test.ts tests/planner-ledger.test.ts tests/legal.test.ts tests/legal-database.test.ts tests/photos.test.ts tests/booking.test.ts tests/sharing.test.ts --maxWorkers=1 --hookTimeout=30000
```

## 미검증 항목 — 확인된 결함과 구별

이 항목들은 이번 검토로 안전/취약을 판단하지 않았으며 별도의 사실 확인이 필요합니다.

- 호스팅 프로젝트의 실제 schema/RLS/grant와 로컬 마이그레이션의 일치, 실제 Auth 이메일 확인 설정·SMTP·세션 폐기·JWT 검증/만료. DB 리전 ap-south-1과 유일 프로젝트 식별자는 제공된 정보이며 원격 조회하지 않았습니다.
- PGlite는 한 연결에서 트랜잭션을 직렬 처리합니다. Promise.all 재시도 검증은 실제 다중 서버/연결의 동시성·교착·프로세스 종료/커밋 후 응답 유실·월 경계 테스트를 대체하지 않습니다. 운영 규모에서 LP와 예약의 해당 장애 행렬은 별도로 필요합니다.
- 운영 프록시/CDN/관측 도구/DB statement logging/제공자 로그의 Authorization, 공유 URL 경로, 전화번호 마스킹과 보유기간. HTTP·앱 console의 제한된 테스트 결과를 전체 로그 무유출로 확대하지 않았습니다.
- 실제 `.env`와 배포 산출물에 이미 유효 비밀키가 있는지, 과거 Git 이력·원격 저장소/CI artifact에 노출됐는지. 이번 검증은 합성 키만 사용했고 운영 자격증명 유효성 확인은 하지 않았습니다.
- 실제 Storage 서비스의 배포 정책·버킷·백업/정리 작업. 테스트는 모의 Storage 테이블과 fake download를 사용합니다. 얼굴·영수증 개인정보 가림은 EXIF 제거와 별개이며 사람 검토의 정확성은 인증하지 않았습니다.
- 예약 제공자의 실제 계정 권한·멱등 기간·상태 정합성·취소 지원. fake provider 검증을 실예약 성공이나 복구 가능성으로 주장하지 않습니다.
- Gemini의 실제 billing/보유·국외 처리 조건과 실제 여행 입력의 개인정보 최소화, 미성년자 접근 가능성. 실제 모델/메뉴 이미지/유료 호출은 하지 않았습니다.
- 새 AI 보조·방문 보상 모듈의 앱 연결 상태는 작업 중 바뀌고 있었습니다. 마지막 확인에서 AI 보조 경로에는 requireConsent가 연결되었으며 방문 보상은 아직 독립 attach 모듈이었습니다. 이번 검증의 방문 보상은 DB 권한/지급 경로이며 실제 활성화된 전체 운영 HTTP/관리자 UX를 인증하지 않습니다. 추가 attach 경로도 동일한 이메일·동의·소유권·역할 검토가 필요합니다.
- 부하·대량 파일·외부 대상 공격, 실제 브라우저/단말 세션 탈취, 의존성 원격 취약점 스캔은 수행하지 않았습니다.

## 공식 근거와 검토 입력 식별

[Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)는 공개 키와 RLS를 우회하는 서버 자격증명을 구분합니다. [RLS 문서](https://supabase.com/docs/guides/database/postgres/row-level-security)는 grant와 행 정책을 함께 검증하도록 안내합니다. [Vite 환경 변수 문서](https://vite.dev/guide/env-and-mode)는 VITE_ 값의 클라이언트 노출을 설명합니다. [Supabase 변경 이력](https://supabase.com/changelog)의 신규 Data API 기본 노출 변경도 확인했습니다. changelog.md는 웹 도구에서 content-type 오류가 나 일반 changelog 페이지로 대체했습니다. 실제 호스팅 설정은 이 문서 조회로 확인한 것이 아닙니다.

검토한 핵심 파일의 SHA-256입니다. HEAD 외 미커밋 변경을 포함해 이 버전에서 재현했으며, 이후 변경 시 관련 테스트를 다시 실행하세요.

| 파일 | SHA-256 |
| --- | --- |
| server/app.ts | `cac4d8bbf0eb1aef44a2f9c02a652821d74b5ab44288d5754db317411ed6d6da` |
| server/config.ts | `049105a04013abb2200a79158b8037e80594d39d061183ff68b014e3feee545e` |
| server/repository.ts | `4dc6c7a74d345ddc8419facdaab56244ee4ab64bd668d6d0eb1c2bf3d2708e50` |
| server/legal.ts | `73065e79d1f5ef2372568eb7b0d1679d7e56509152f49af92be9e0d42139c557` |
| server/planner/routes.ts | `2e80475b248557278bad159afd0977e7f3dff94a6f9637cf292a0c76a32d576b` |
| server/booking/index.ts | `dd374f5ed9a78c84feaaf1c1bfa09b8910ded5bcefee5aa93b26791fb9521108` |
| server/sharing.ts | `5d6a77b7a786626686fcbebfd1b210c0e41d3baa398e71400ab9585bd0cbc574` |
| src/config.ts | `b7a839544564e9e130de48456afe0af887cb79e9ce47f4a72a4750abf8de5e8c` |
| src/supabase.ts | `df13cd27169cf7d224c3b9da3b021a741188ba1fd47ab28274605d017aebc79e` |
| vite.config.ts | `10c65ad6198123cd91e98d0cc1f6941155a72c02ce069a24d2f87a5f1fa9b5d4` |
| 20261017024600_planner_entitlements.sql | `1e0efad8f43352de6349463d3ba1f3a53039f510fb745cb3df32154ab1c1dabd` |
| 20261017033835_itinerary_shares.sql | `f0010b9206cae7cd96ecb9a044b957ec074484499a387349281199108f5d1272` |
| 20261017034938_legal_consents.sql | `223270bcc70ab86c379ab3795867dd82a9adb64f99242314084c11c6bad63357` |
| 20261017035002_heyyumi_reservations.sql | `44e651a378919b725fdfb1f0f95abdddf7d8ce467632aa9d37bf678b5c06fed7` |
| 20261017040904_visit_rewards.sql | `f926bf5d03e5d8c03cb179cc972cb393df5fe594d7234bb1914066b59d9bcaa3` |
| 20261017041751_contribution_menu_drafts.sql | `bbe417eb0f55d6df95278a6172eacb1f4c3d3719c7051476c162a77729611e6d` |

각 SQL 파일은 `supabase/migrations/`에 있습니다. 위 식별 정보는 실제 운영 DB와 일치한다는 증거가 아닙니다.
