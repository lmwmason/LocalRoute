# 내 추천의 평가·보상 현황

## 연결

`src/App.tsx`는 수정하지 않았습니다. 메인 담당자가 계정 화면에서 검증된 세션과 기존 언어 상태를 사용해 연결하세요.

```tsx
import { ContributorOutcomes } from "./ContributorOutcomes";
// 계정 화면의 원하는 위치에 한 줄:
<ContributorOutcomes userId={verifiedSession?.user.id ?? null} language={language} />
```

`verifiedSession`은 예시 변수명입니다. 기존 서버 검증을 완료한 계정 상태를 전달하고, 확인 중·로그아웃 시 null을 전달하세요. 토큰 존재만으로 로그인 상태를 만들지 않습니다. 컴포넌트는 기본 조회 클라이언트를 포함하므로 별도 API 연결이 필요 없습니다.

`GET /api/visit-rewards/contributor-outcomes`는 기존 `attachVisitRewards` 안에 연결했습니다. 기존 actor의 인증·이메일 확인과 상위 법적 동의 미들웨어를 그대로 통과합니다. 대상 사용자 파라미터는 받지 않으며 관리자도 타인 조회로 전환할 수 없습니다. 응답은 `private, no-store`, 조회 제한은 기존 계정별 분당 30회입니다.

## 집계 기준

- 본인 `endorsements`에 속한 모든 `endorsement_versions`를 버전별로 표시합니다. 추천 검토 상태와 보상 검토 상태를 구분합니다. 버전이 아직 없는 추천도 0건·미집계로 표시합니다.
- 평가 수와 도움 점수 평균(5점 만점)은 해당 버전의 `endorsement_ratings.helpfulness`만 사용합니다. 장소 만족도인 `place_reviews`는 읽지 않습니다. 이전 버전의 평가는 새 버전에 이월하지 않습니다.
- 실제 지급 LP는 본인 `visit_reward_grants`와 본인 `lp_ledger`가 ledger ID·금액·earned 버킷·`visit-reward:<request ID>` 이벤트로 일치하는 양수 금액의 누계입니다. 현재 잔액이나 예상 보상이 아닙니다. 승인만 된 요청이나 관계없는 원장은 합산하지 않습니다.
- `pending` 보상 요청 수와 `approved`이지만 지급 기록이 없는 요청 수를 각각 표시합니다. 점수를 지급액으로 환산하거나 지급 여부를 추정하지 않습니다.
- 행이 없으면 0·미집계입니다. 테이블 누락·조회 실패는 오류 및 재시도로 표시하며 0으로 숨기지 않습니다. 조회는 100행 단위로 페이지를 읽고 관계 ID는 100개씩 나눕니다. 단일 조회 묶음이 10,000행에 도달하면 일부 합계 대신 오류를 반환합니다.
- service-role 조회이므로 첫 조회를 반드시 actor 소유 추천으로 제한하고, 하위 조회를 그 ID로 한정합니다. 요청·지급·원장에는 별도 소유자 조건도 있습니다. 방문자 식별자·증빙·심사 사유·개인정보는 선택하거나 응답하지 않습니다.

## 검증

- `npx vitest run tests/contributor-outcomes.test.ts tests/contributor-outcomes-ui.test.ts tests/visit-rewards.test.ts`: **24 passed**.
- `npx vitest run tests/contributor-outcomes-client.test.ts`: **3 passed**.
- 전체 `npm run typecheck`: 통과.
- 담당 TypeScript/TSX 파일 ESLint: 통과.
- UI: 한국어·영어 × 360/390/1280px, 로딩·오류·재시도·빈 상태·미집계·인증 만료·계정 전환, 44px 버튼·키보드·스크롤·가로 넘침 확인. reduced-motion 환경에서 실행하며 컴포넌트에는 애니메이션이 없습니다.
- 모든 새 조회 테스트는 로컬 Supabase HTTP 모킹, UI 테스트는 로컬 Vite + Chromium + 모킹입니다. 기존 보상 회귀 테스트는 폐기 가능한 PGlite DB를 사용합니다. 원격 조회·DB 변경·실제 인증·지급·재계산은 하지 않았습니다.

## 통합 시 확인

실제 배포 API/DB와 App 계정 화면에 연결된 레이아웃은 검증하지 않았습니다. 여러 SELECT의 결과이므로 동시 평가·지급 시 단일 트랜잭션 스냅샷은 보장하지 않습니다. 새로고침으로 최신 상태를 조회할 수 있습니다. 이번 변경에는 마이그레이션·RLS 변경·월 지급·일정 과금·결제·Gemini 변경이 없습니다.
