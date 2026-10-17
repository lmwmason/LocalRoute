# 방문 검토·LP 보상 모듈 인계

2026-10-17. 신규 모듈과 신규 로컬 마이그레이션만 작성했습니다. 기존 App.tsx, server/app.ts, server/repository.ts, 기존 마이그레이션, QA_REPORT.md는 이 작업에서 수정하지 않았습니다. 실제 LP 발급, 원격 DB 변경, 유료 호출, 배포는 수행하지 않았습니다.

## 제공 범위

- 영수증·사진·정밀 위치 없이, 이미 남긴 추천 도움 평가 하나를 선택해 방문 상황을 설명하고 비공개 인간 검토를 신청합니다. 낮은 점수도 동일하게 신청할 수 있습니다. 예약·사진·위치·본인 주장만으로 자동 방문 인증/보상을 수행하는 경로는 없습니다. 파트너 QR/상인 확인 API를 구현했다고 표시하지 않습니다.
- 서버는 본인 `endorsement_ratings` → 정확한 `endorsement_versions` → `endorsements` → 장소 및 `place_reviews`의 연결을 조회합니다. 방문자·장소·추천자·버전 ID/번호/텍스트·방문일·도움 점수·제휴 선언을 신청 당시 고정합니다. 식당 만족도는 보상 점수로 사용하지 않습니다.
- 관리자는 신청 근거와 추천 내용을 보고 사유 및 확인 근거를 기록해 승인/반려합니다. 승인에는 독립적인 인간 검토, 이해관계 확인, 중복·담합 및 추천 귀속 확인을 명시해야 합니다. 관리자의 본인/추천자/등록된 이해관계 사건은 검토·지급할 수 없습니다.
- 방문 검토 승인과 보상 지급은 별개입니다. 승인만으로 원장이나 기존 후기 신뢰 상태를 변경하지 않습니다. 공개 후기의 기존 `verification_state`는 장소별로 재사용되는 가변 행이므로 덮어쓰지 않고, 정확한 버전에 연결한 새 신청의 승인 상태를 사용합니다.
- 지급은 현재 피드백의 귀속·날짜·점수·제휴 상태, 장소/추천 활성 상태와 버전, 검토자 권한·독립성, 90일 간격, 상한을 다시 검사한 뒤 기존 `lp_ledger`에 `earned`를 한 번 적립합니다. 원장의 기존 append-only 보호는 그대로 유지합니다. 모든 추천자에게 나누어 지급하지 않습니다.

## 서버 연결

기존 JSON parser 다음, `/api` 404 fallback 및 기존 error handler 이전에 통합 담당자가 연결합니다. 이 작업은 해당 기존 파일을 수정하지 않았습니다.

```ts
import { attachVisitRewards, readVisitRewardSettings } from "./visit-rewards";

attachVisitRewards(
  app,
  {
    ...config,
    visitRewards: readVisitRewardSettings(process.env),
  },
  actor,
);
```

`actor(req)`는 기존 Supabase `getUser(token)` 기반 인증 함수여야 합니다. 클라이언트 metadata나 본문을 actor/role로 사용하지 마세요. 모듈은 서버 actor의 역할을 검사하고, SQL에서 확인된 이메일·비익명 계정 및 `user_roles`의 현재 역할을 독립적으로 다시 검사합니다. 검토·지급·대기열은 admin/moderator, 정책/제휴 관리 API는 admin 전용입니다. 클라이언트는 RPC나 테이블을 직접 쓰지 못합니다.

`VisitRewardConfig`는 기존 config 중 live/database/url/secret만 요구하고 옵션을 확장합니다. `server/config.ts` 변경이 필요하지 않습니다. runtime DB는 `https://pjdawapasozsrpnrtsfx.supabase.co`만 허용하며 live에서 다른 project URL이면 연결 단계에서 거부합니다. DB가 설정되지 않거나 demo이면 인증 뒤 503으로 저장을 막고 가상 잔액으로 대체하지 않습니다. 네 번째 인수 `VisitRewardStore` 주입은 모의 테스트에 사용합니다.

서버 환경 설정은 기존 root `.env` loader를 사용합니다. 새로운 환경 파일이나 키는 생성하지 않았습니다. 새 키 `FEATURE_VISIT_REWARD_PAYOUTS`는 미설정 시 **false**이며 `VITE_`로 노출하지 않습니다. 이 서버 플래그와 신규 `visit_reward_policy.enabled`, 기존 `lp_policy.rewards_enabled`가 **모두 true**일 때만 지급됩니다. 정책의 기본 활성화는 false이며 기존 LP 정책 활성화 값은 이 마이그레이션에서 변경하지 않습니다. 계정별 실제 지급 및 활성화는 이 작업의 허용 범위 밖입니다.

| Endpoint                                           | 역할/동작                                                                      |
| -------------------------------------------------- | ------------------------------------------------------------------------------ |
| `GET /api/visit-rewards/targets`                   | 본인이 작성한 추천 도움 평가 선택지                                            |
| `GET /api/visit-rewards/policy`                    | 현재 지급량·상한·버전·실제 지급 활성화 상태                                    |
| `GET /api/visit-rewards/requests`                  | 본인 신청/판단/지급 결과                                                       |
| `POST /api/visit-rewards/requests`                 | 본인 평가에 연결한 검토 신청, requestId로 멱등 처리                            |
| `GET /api/visit-rewards/requests/:id`              | 본인 또는 DB에서 확인된 검토자만 조회                                          |
| `GET /api/visit-rewards/admin/queue`               | pending 및 미지급 approved 사건, 기록된 이해관계 표시                          |
| `POST /api/visit-rewards/admin/decisions`          | 이유/근거/확인 사항을 기록하는 최종 승인 또는 반려                             |
| `POST /api/visit-rewards/admin/requests/:id/issue` | 승인된 사건의 적격성 재확인 및 원자 지급; 본문의 지급량/수령인은 사용하지 않음 |
| `PUT /api/visit-rewards/admin/policy`              | admin 전용, expectedVersion을 비교하고 정책 버전 증가/감사 기록                |
| `PUT /api/visit-rewards/admin/affiliations`        | admin 전용, 소유/제휴 관계와 사유를 등록·해제하고 감사 기록                    |

정책 변경 본문은 `expectedVersion`, `enabled`, 1→5 순서의 `amounts` 배열, `placeMonthCap`, `curatorMonthCap`, `reason`입니다. 제휴 관리 본문은 `userId`, `placeId`, `kind: owner | affiliate`, `active`, `reason`입니다. 공유 스키마에서 타입과 허용 필드를 제한하며 서버 정책이 지급량을 결정합니다. 유효한 관리자 역할을 얻지 않은 사용자는 이 필드를 조작해도 정책이나 보상을 변경할 수 없습니다.

## UI 연결

```tsx
import { createVisitRewardsApi } from './visit-rewards/api';
import {
  VisitRewardRequestPanel,
  VisitRewardAdminPanel,
} from './visit-rewards/VisitRewards';

// useMemo 또는 모듈 단위에서 안정적인 인스턴스를 유지하세요.
const visitRewardsApi = createVisitRewardsApi(async () => {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token;
});

<VisitRewardRequestPanel api={visitRewardsApi} language={language} />
// UI 표시 여부 외에 서버 권한 검사가 항상 적용됩니다.
<VisitRewardAdminPanel api={visitRewardsApi} language={language} />
```

`language`는 ko/en이고 기본은 ko입니다. 사용자 컴포넌트는 추천 선택·영수증 없는 설명·이해관계 선언·비공개 검토 동의 및 신청 상태/사유를 제공합니다. 관리자 컴포넌트는 원본 근거·정확한 버전/귀속 ID·이해관계·검토 확인 항목·승인/반려·정책에 따른 별도 지급 버튼을 제공합니다. 지급이 꺼져 있으면 검토는 가능하지만 지급 버튼은 비활성화됩니다. 정책·제휴 관리 API의 별도 운영 설정 화면은 제공하지 않습니다.

전송 도중 이중 클릭을 막으며 실패 시 동일 requestId/본문으로 재시도합니다. 결정 결과가 불확실하면 상태를 새로고침하세요. 사용자 본문·증거·동의를 localStorage/sessionStorage에 보관하지 않습니다. 페이지를 다시 열어도 동일 방문에 열린 사건이 있으면 중복 신청이 차단되고 본인 상태 목록에서 확인할 수 있습니다. 반려 후에는 새 근거/새 requestId로 재검토를 신청할 수 있습니다. 승인 이후의 이의 제기/원장 반전은 별도의 인간 운영 절차이며 기존 지급을 자동 취소하거나 LP를 몰수하지 않습니다.

## DB와 지급 불변 조건

신규 마이그레이션: `supabase/migrations/20261017040904_visit_rewards.sql`. 기존 마이그레이션 뒤에 통합 담당자가 검토 후 적용해야 하며, 이번 작업에서는 원격 적용하지 않았습니다.

- 신규 표 6개: 정책, 소유·제휴 관계, 신청, 최종 판단, 지급 사건, 감사 이력. 모두 RLS를 켜고 익명 접근/클라이언트 쓰기를 거부합니다. 본인 신청·판단·지급 내역만 소유자 SELECT가 가능하며 관리자 증거 조회는 서버의 DB 역할 검사 경로를 사용합니다. 추천자는 자신의 LP 원장을 볼 수 있지만 새 지급 사건 테이블을 통해 방문자의 사적인 근거/방문 이력을 조회하지 못합니다.
- `visit_reward_action`은 service_role 전용, security invoker, 빈 search_path입니다. 브라우저에서 `p_actor`, 지급 활성화, 임의 action을 지정하는 RPC 호출은 거부됩니다. API가 서버 설정으로 `p_issue_enabled`를 전달하며 요청 본문으로 전달받지 않습니다.
- `lp_ledger`의 기존 잔액 계산을 재사용합니다. 신규 잔액/지갑은 없습니다. 사건별 `visit-reward:<검토 UUID>` 원장 키와 지급 사건의 유일성, 원장 FK, 지급량/정책 snapshot을 저장합니다. 원장 삽입·지급 사건·감사 기록은 하나의 DB transaction으로 성공하거나 전부 rollback됩니다. 원장/결정/지급/감사 이력은 append-only이며 기존 지급을 수정·삭제하지 않습니다.
- 파일럿은 전역 transaction advisory lock으로 지급·결정·정책·제휴 변경을 직렬화합니다. 동일 방문 신청은 방문자별 lock과 고유 인덱스로 제한합니다. 지급은 기존 planner/community와 동일한 수령인 LP lock을 먼저 얻고 관련 후기/버전 행을 잠가 변경과 충돌하지 않게 합니다. 대규모 확장 시 이 전역 lock을 재설계할 수 있지만 상한과 순서를 유지해야 합니다.
- 신청 후 도움 점수·방문일·귀속이 바뀌면 지급을 거부합니다. 정상적으로 superseded된 과거 추천 버전은 새 버전에 보상을 옮기지 않고 원래 버전에 귀속합니다. 비활성/거절된 추천·장소는 지급 대상에서 제외합니다. 첫 등록자를 장소 소유자로 간주하지 않습니다.
- 소유·제휴 관계는 자기 선언과 기존 review의 affiliation, 관리자 registry, 독립 검토 확인을 함께 사용합니다. 아직 알려지지 않은 관계를 자동 검출한다고 주장하지 않습니다. 방문자와 추천자 양쪽을 검사하며, 검토자에게 사후 확인된 이해관계가 있거나 검토자 역할이 없어져도 지급을 막습니다.
- 방문자/장소의 90일 제한은 기존 후기의 **KST 방문 날짜**에 적용합니다. 지급 승인 날짜가 아니라 방문 사건 사이 간격이며 과거 날짜를 나중에 신청해도 양방향으로 90일 미만이면 거부합니다. 정확히 90일은 허용합니다. 날짜 단위인 기존 데이터에 맞춘 해석입니다.
- 장소/추천자 상한은 **KST 지급 월** 기준이며 과거 지급량을 조회해 전체 금액이 상한을 넘으면 전액 보류합니다. 일부만 지급하지 않습니다. PRD의 잠정값인 300 LP/장소/월, 1,000 LP/추천자/월로 시작합니다. 보류된 승인 건은 적격성이 유지되는 경우 이후 월에 다시 확인할 수 있습니다.
- 점수는 식당 만족도가 아니라 추천 도움 점수입니다. PRD 잠정 지급량은 1→0, 2→2, 3→8, 4→15, 5→20 LP입니다. 0 LP도 적격 결과로 기록해 90일 제한을 소비하지만, 기존 원장의 `amount<>0` 조건에 맞춰 0원장 행은 만들지 않습니다. 긍정 평가를 신청 조건으로 삼지 않습니다.
- 남용 방지 초기 가정은 신청 하루 5건/사용자, API 조회·변경 분당 30건/사용자입니다. 일별 신청 제한은 DB, 분별 요청 제한은 서버 프로세스 단위입니다. 다중 인스턴스의 통합 rate limit은 출시 전 별도 검토 대상입니다.

## 검증 및 운영 경계

검증은 모의 HTTP와 폐기 가능한 메모리 PGlite만 사용합니다. 원격 DB/실제 계정 LP/유료 호출은 사용하지 않았습니다. PGlite는 단일 연결을 직렬화하므로 Promise.all 동시 HTTP/지급·상한 검사는 수행했지만, 독립 Postgres 세션의 실제 lock 경합과 hosted RLS/advisors는 추가 검증 대상입니다. 실 서비스 활성화 전에 정책·운영 검토, raw 근거 보관/삭제 기한, 인간 검토 절차 및 이의 제기 운영을 확정해야 합니다. AI 점수나 단일 예약/사진/위치로 이를 대체하지 마세요.

확인 결과와 실행 명령:

- 전체 typecheck 통과.
- 방문/기존 원장/후기/기여/예약 관련 5개 파일 **53개 테스트 통과**. 그중 신규 방문·보상 테스트 15개는 권한, 독립 근거, 정확한 과거 버전 귀속, 소유·제휴, 사후 검토자 충돌, 동시 요청·중복 승인·중복 지급, 늦은 오류 rollback, 90일 양방향/경계, 장소·추천자 상한, 정책 snapshot, 0 LP, 월 경계, 원장 잔액·append-only·RLS를 검사합니다.
- 브라우저 **6개 테스트 통과**: 360px/390px/desktop에서 한·영 사용자 신청, 낮은 점수 허용, 동의, 상태, 관리자 근거 확인 및 비활성 지급, 키보드/터치 및 가로 overflow. 실제 기기의 소프트 키보드는 추가 검증 대상입니다.
- 전체 lint 및 build 통과. 빌드의 기존 대형 chunk 경고는 남아 있습니다.
- UI 전용 unit 파일을 제외한 backend/unit 회귀 **26개 파일 256개 테스트 통과**. 제외한 기존 UI 파일까지 모두 실행했다고 주장하지 않으며, 신규 컴포넌트는 위 Playwright 테스트로 별도 검증했습니다.

```sh
npx vitest run tests/visit-rewards.test.ts tests/planner-ledger.test.ts tests/database.test.ts tests/local-contributions.test.ts tests/booking.test.ts --maxWorkers=1 --hookTimeout=60000
npm run typecheck
npm run lint
npm run build
npm test -- --maxWorkers=1 --hookTimeout=60000 --exclude '**/*-ui.test.ts'
npx playwright test e2e/visit-rewards.spec.ts --workers=2 --output=/tmp/localroute-visit-rewards-browser
```

브라우저 fixture는 tests/visit-rewards-harness.html이며 production entry에 포함하지 않습니다. 기존 앱 연결과 공유/후기 화면의 상태 통합은 통합 담당자가 진행해야 합니다.
