# HeyYumi 예약 모듈 인계

작성일: 2026-10-17. 담당 경로에 독립 모듈을 추가했습니다. 앱 연결, 환경 값 변경, 원격 마이그레이션 적용, 실예약, 제공자 sandbox 호출, 유료 호출, 배포는 수행하지 않았습니다. `QA_REPORT.md` 및 수정 금지 파일은 변경하지 않았습니다.

## 공식 계약 확인

- [개발자 가이드](https://heyyumi.ai/developers), [API reference](https://heyyumi.ai/developers/api-reference), [OpenAPI 3.1 / API v1.0.0](https://heyyumi.ai/openapi.json), [약관](https://heyyumi.ai/legal/terms), [요금](https://heyyumi.ai/pricing)을 확인했습니다. 별도 공개 변경 이력은 찾지 못했습니다. 출시 시 다시 확인해야 합니다.
- `GET /api/v1/places/{id}?fields=core,contact_hours`의 `yumiReservable === true`만 지원합니다. 일반 `reservable`, 검색에 나오는 것, 영업 중 표시는 좌석이나 예약 가능성을 증명하지 않습니다. 외부 ID는 `place_external_ids(provider='heyyumi')`에서 얻으며 내부 UUID와 구별합니다.
- `POST /api/v1/reservations`: `placeId`, offset 포함 미래 `reservationTime`, `guestCount`, `guestPhone`, `idempotencyKey`, 선택 `guestName`, `note`. 서버가 생성한 예약 UUID를 제공자 멱등성 키로 사용합니다. 사용자별 동일 요청 키/내용은 재사용하고, 내용 변경은 409입니다.
- `GET /api/v1/reservations/{id}`로 조회합니다. 최초 응답은 `pending`, 제공자 `confirmed`만 확정입니다. 제공자 `cancelled`는 식당 거절이므로 LocalRoute `declined`로 표시하고 상태 이력에 원본 문자열을 보존합니다. `expired`, `no_show`도 처리합니다. 알 수 없는 상태는 `unknown`입니다. `expiresAt`을 저장하며 로컬 시계로 임의 확정/만료시키지 않습니다.
- 제공자 취소 API, 요청 키로 상태를 조회하는 API, 좌석 조회 API, 계정의 예약 권한을 확인하는 전용 endpoint는 확인되지 않았습니다. 이를 생성하지 않았습니다. 공식 sandbox 설명은 확인했지만 호출하지 않았습니다.
- 공식 문서와 OpenAPI의 무료 한도 설명에 차이가 있고, 약관은 제품 탑재/상업 이용 및 세션 범위를 넘는 응답 저장에 별도 계약을 요구합니다. 계정의 생성/조회 권한, 실제 요금·한도, 예약 상태와 고객 정보 보관, 출처 표시, 지원 지역 및 개인정보 전달 조건을 담당자가 확인한 후에만 검증 플래그를 켜야 합니다. 환경 플래그는 이 운영 확인의 기록이며 자동 권한 검증 API가 아닙니다.

## 서버 통합

`server/app.ts`의 기존 JSON parser 다음, API 404 fallback / error handler 이전에서 아래와 같이 연결합니다. 이 변경은 통합 담당자의 작업입니다.

```ts
import { attachBooking } from "./booking";
import { readBookingSettings } from "./booking/config";

attachBooking(
  app,
  { ...config, booking: readBookingSettings(process.env) },
  actor,
);
```

`actor(req)`는 반드시 기존 `repository.authenticate`를 사용해야 합니다. 해당 구현은 Supabase `getUser(token)`, 익명 계정 거부 및 `email_confirmed_at` 확인을 수행합니다. 요청 본문의 actor/사용자 ID나 클라이언트 메타데이터를 전달하지 마세요. 별도 프로세스에서도 인증 계약을 유지해야 합니다. 모의 테스트만 네 번째 인수 `{store, provider}`를 주입합니다.

`BookingConfig`는 기존 `ServerConfig`의 확장이므로 금지된 `server/config.ts` 변경이 필요하지 않습니다. root `.env`의 기존 loader를 통해 다음 **서버 전용** 값을 전달합니다. 새 `.env.*` 파일은 사용하지 않습니다. 실제 키/설정은 이번 작업에서 변경하지 않았습니다.

| 키                                  | 기본값 / 의미                                                                      |
| ----------------------------------- | ---------------------------------------------------------------------------------- |
| `FEATURE_HEYYUMI_BOOKING`           | 미설정 시 false                                                                    |
| `HEYYUMI_BOOKING_ACCESS_VERIFIED`   | 미설정 시 false, 담당자가 계정의 예약 생성·조회 권한을 확인한 후에만 true          |
| `HEYYUMI_TERMS_VERIFIED`            | 기존 서버 설정과 공유, 미설정 시 false; 제품 이용·보관·개인정보 전달 조건까지 확인 |
| `HEYYUMI_BOOKING_REQUESTS_PER_HOUR` | 기본 30, 프로세스별 전체 제공자 요청 상한(1–1000); 실계약 이하로 설정              |
| `HEY_YUMI_API_KEY`                  | 기존 서버 비밀 키                                                                  |

`live`, 유효한 DB 설정, 모든 검증 플래그, 제공자 키가 있어야 제공자 조회/전송이 활성화됩니다. URL은 `https://pjdawapasozsrpnrtsfx.supabase.co`만 허용합니다. 기능이 꺼져 있어도 인증된 사용자는 기존 저장 예약을 읽을 수 있습니다. provider 호출이나 재전송은 없습니다. 기존 health endpoint의 `booking:false`는 변경하지 않았으므로 통합 시 `/api/booking/capabilities`의 enabled 상태를 반영하세요.

| LocalRoute endpoint                          | 동작                                                                                    |
| -------------------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/booking/capabilities`              | enabled/cancellation:false/availability:false                                           |
| `GET /api/booking/venues/:placeId`           | 공개된 내부 장소의 외부 ID를 서버에서 조회하고 제공자 지원 여부/식당명/주소/연락처 반환 |
| `GET /api/booking/profile`                   | 기존 비공개 `booking_profiles`의 본인 이름·전화만 반환; 저장 동의는 전송 동의가 아님    |
| `POST /api/booking/reservations`             | 검증·명시 동의·식당 정보 대조 후 원자적 요청 획득, 최초 요청만 제공자 POST              |
| `GET /api/booking/requests/:requestId`       | 응답 유실 후 본인 요청 결과 조회                                                        |
| `GET /api/booking/reservations/:id`          | 본인 저장 상태 조회; 기능 off에서도 가능                                                |
| `POST /api/booking/reservations/:id/refresh` | 제공자 reference로 조정; POST 재전송 없음                                               |
| `POST /api/booking/reservations/:id/cancel`  | 본인 권한 검사 후 409 cancellationUnavailable; 제공자 호출/로컬 취소 없음               |

## UI 통합

```tsx
import { createBookingApi } from "./booking/api";
import { BookingButton, BookingForm } from "./booking/BookingButton";

// useMemo 등으로 인스턴스를 안정적으로 유지합니다.
const bookingApi = createBookingApi(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
});

<BookingButton
  api={bookingApi}
  placeId={canonicalPlace.id}
  language={language}
  onReservation={handleReservation}
/>;
```

`BookingButton`은 기능과 해당 식당의 `yumiReservable`을 서버에서 확인한 후 예약 버튼을 표시합니다. `BookingForm`도 독립 사용 가능합니다. `language`는 `ko | en`이며 기본값은 ko입니다. 이름/연락처는 기존 프로필에서 불러오지만 매번 식당·주소·KST 일시·인원·이름·연락처·요청 사항을 검토하고, 헤이유미/식당 전달 및 알림톡/SMS 연락 동의를 직접 체크해야 전송됩니다. 내용을 수정하면 동의를 초기화합니다. 최대 100명은 남용 방지용 LocalRoute 입력 제한이며 좌석 수를 의미하지 않습니다. 확인되지 않은 예약 링크는 표시하지 않고 제공자 응답의 연락처만 폴백으로 표시합니다.

전송 중 이중 클릭을 잠그며 네트워크 실패 시 같은 요청과 동일 내용을 재사용합니다. sessionStorage에는 복구용 요청 UUID만 저장하며 전화·이름·요청 사항·동의는 저장하지 않습니다. 화면 재진입 시 기존 결과를 조회하고 새 요청을 자동 전송하지 않습니다. 복구 조회에서도 요청이 없으면 지원 확인 안내를 유지합니다. 결과가 확인된 예약만 사용자가 '다른 예약 요청하기'로 새 폼을 열 수 있습니다. 저장소 사용이 차단된 환경에서는 호스트가 pending 화면을 유지하고 `onReservation`에서 받은 ID로 복구를 제공해야 합니다.

기능 off/식당 지원 중단 후 저장 예약 UI가 필요하면 `bookingApi.read(id)` / `lookup(requestId)`로 표시하세요. 기본 버튼은 신규 예약 진입점입니다. 일정 결과 JSON을 수정하거나 예약 확정을 자동 연결하지 않습니다. 일정 통합 담당자는 `onReservation`의 ID를 해당 정류장에 연결하고 서버 소유권 검사를 유지해야 합니다. 공유 일정에는 고객 정보를 포함하지 마세요.

## DB, 보안 및 조정

신규 `20261017035002_heyyumi_reservations.sql`은 아직 원격 적용하지 않았습니다. 기존 마이그레이션 다음에 통합 담당자가 검토·승인 후 적용합니다. `reservations`, `reservation_status_events`에 RLS를 켜고 소유자 SELECT만 허용합니다. 클라이언트 쓰기와 RPC 실행을 금지하며 서버 service role 전용 `reservation_action`이 요청자 소유권을 검사합니다. 모든 상태·고객 정보는 사용자별 비공개입니다. 공개 프로필/Auth 메타데이터/로그/AI/LP/방문 인증 테이블에 고객 정보를 쓰지 않습니다.

동일 사용자·식당·시각의 활성 예약은 다른 요청 키나 변경된 인원/전화로도 중복 생성할 수 없습니다. 사용자 단위 advisory lock, 고유 인덱스, 요청 fingerprint와 버전 비교로 동시 제출 및 오래된 poll 덮어쓰기를 방어합니다. DB 사용자별 신규 요청은 시간당 5건, 서버 조회/제출은 분당 20건이며 운영 정책 가정입니다. 제공자 한도는 프로세스별이므로 다중 인스턴스 출시 전 중앙 quota를 추가해야 합니다. HTTP 429의 Retry-After를 존중합니다. 자동 재시도·백그라운드 유료 poll은 없습니다.

예약 생성 응답 유실/5xx/파싱 실패는 `unknown`으로 보존합니다. reference가 있으면 GET만 재조회하고, 없으면 재전송 없이 식당/고객지원 수동 조정이 필요합니다. 프로세스 중단으로 남은 submitting은 30초의 로컬 복구 유예 후 unknown으로 조정합니다(제공자 예약 만료 시간과 별개). 조회 실패나 다른 식당/reference 응답은 기존 확정을 유지하고 reconciliationRequired를 표시합니다. 제공자 pending이 confirmed를 덮어쓰지 못하며, CAS가 오래된 동시 응답을 무시합니다. 수동 조정 관리 UI/공식 provider lookup-by-key API는 없습니다. 운영자가 실제 결과를 확인하기 전에는 unknown 잠금을 풀거나 새 POST를 보내지 마세요.

고객 snapshot은 예약 시각 30일 경과 후 `reservation_action(actor, 'redact', {})`로 이름·전화·요청 사항을 제거할 수 있습니다. **30일은 검토 가능한 보수적 초기 가정이며 실제 계약·개인정보 처리방침 검토가 필요합니다. 이번 작업은 유지보수 스케줄을 등록하지 않았습니다.** 운영 서버에서 일별 사용자별 실행을 연결해야 자동 삭제가 됩니다. 상태 이력은 고객 상세를 포함하지 않습니다. 기존 booking_profiles의 독립 저장/삭제 정책은 유지합니다.

예약 확정/미방문 상태로 방문 인증이나 LP를 발급·차감하지 않습니다. 취소 API는 확인 전까지 계속 차단합니다.

## 검증

테스트는 모의 네트워크와 폐기 가능한 메모리 PGlite만 사용합니다. 실 Supabase/HeyYumi 계정 권한·RLS 동작은 원격 검증하지 않았으며, 앱 연결도 허용 범위 밖이라 수행하지 않았습니다. 동시 HTTP 제출은 검사했지만 PGlite의 단일 연결 큐를 사용하므로 독립 Postgres 세션 간 경합은 추가 검증 대상입니다. 따라서 이 모듈의 mock 검증을 실서비스 활성화 승인으로 해석하면 안 됩니다.

확인된 결과:

- 전체 `npm run typecheck` 및 `npm run build` 통과. 빌드는 기존 대형 chunk 경고를 출력합니다.
- 담당 코드/테스트 ESLint 통과.
- 예약 서버·메모리 DB·제공자 계약 테스트 **11/11 통과** (`npx vitest run tests/booking.test.ts --maxWorkers=1 --hookTimeout=60000`).
- 예약/기존 DB/기여/LP/공유 회귀 검사 **5개 파일 42/42 통과** (`npx vitest run tests/booking.test.ts tests/database.test.ts tests/local-contributions.test.ts tests/planner-ledger.test.ts tests/sharing.test.ts --maxWorkers=1 --hookTimeout=60000`).
- 예약 브라우저 테스트 **6/6 통과**: 360px, 390px, desktop 각각 한국어/영어.
- 전체 `npm run lint`는 담당 밖 `tests/destinations-ui.test.ts:45`의 `preserve-caught-error` 오류 및 기존 hook 경고로 실패했습니다. 해당 파일은 수정하지 않았습니다.
- 전체 unit suite 실행은 DB 초기화 지연과 담당 밖 `destinations-ui`의 동적 모듈/React DOM 오류가 발생하여 중단했습니다. 전체 suite 통과를 주장하지 않습니다. 예약 단독 검사는 별도로 통과했습니다.

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
- `npx playwright test e2e/booking.spec.ts --workers=2 --output=/tmp/localroute-booking-browser-results`
- 브라우저 fixture는 `tests/booking-harness.html`이며 production entry에 포함되지 않습니다. 360px/390px/desktop에서 한국어·영어 폼, 명시 동의/수정 후 초기화, 프로필 입력, KST, pending→confirmed, unknown 재전송 방지, 화면 복구, 44px 버튼, 가로 overflow, 키보드 및 reduced-motion을 검사합니다. 실제 기기의 소프트 키보드/네트워크/제공자 동작은 추가 검증 대상입니다.
