# LocalRoute 법적 고지·가입 동의 인계

작성일·공식 자료 확인일: 2026-10-17 (Asia/Seoul).

구현 커밋: `9354bf28889c8c7e818b7f559d5c512258ed91c6` (`feat(legal): add bilingual notices and verified versioned consent`). 이 문서는 해당 커밋 이후 별도 문서 커밋으로 남깁니다. 자기 커밋 해시를 같은 커밋 내용에 넣는 순환을 피하기 위한 분리입니다.

## 제공한 범위와 현재 상태

- `src/legal/**`: 한·영 개인정보 처리방침, 약관, 국외 이전/처리위탁 안내, 위치정보 안내; 가입 체크 필드; 인증 후 동의 게이트와 선택 동의 설정; API 클라이언트와 모바일 스타일.
- `shared/legal.ts`: 고지 묶음 버전 `2026-10-17.1`, 엄격한 요청/응답 스키마. 한 버전이 네 고지와 동의 문구 전체를 식별합니다. 공개 후 문구를 변경할 때는 버전을 올리고 이전 텍스트를 Git 이력에 보존해야 합니다.
- `server/legal.ts`: `attachLegal`, `createLegalStore`, `SupabaseLegalStore` 및 주입 가능한 `LegalStore`를 export합니다. 서버 Auth 조회와 SQL 모두 확인된 이메일·비익명 계정을 요구합니다. 사용자 ID·동의 시각·전화번호를 요청 본문으로 받지 않습니다.
- `src/components/Login.tsx`: 이메일 링크 요청 전 필수 네 항목을 각각 확인합니다. 지역 공개 선택은 이메일 확인 후 단계로 옮겼습니다. 서버 증빙을 Auth 메타데이터에 쓰지 않으며 `public_local_area` 초깃값은 false입니다. 기존 이메일 확인 설정 이상 시 즉시 세션을 종료하는 처리는 유지했습니다.
- `supabase/migrations/20261017034938_legal_consents.sql`: 소유자만 읽는 RLS, 클라이언트 쓰기/RPC 실행 차단, 서버 전용 invoker RPC, DB 시각, 사용자별 요청 멱등성, 변경 불가능한 동의 이력. 선택 공개 철회와 프로필/공개 라벨 변경은 같은 트랜잭션입니다. 과거 요청 재전송은 철회를 취소하지 않습니다. 레거시 프로필·Auth 메타데이터 경로로 동의 없이 지역을 공개하지 못하도록 트리거를 추가했습니다.
- `tests/local-contributions.test.ts`: 기존 지역 공개 회귀 테스트가 새 보안 규칙을 따르도록, 테스트용 확인 이메일과 실제 동의 RPC 호출만 추가했습니다. 앱 데이터/실계정은 사용하지 않습니다.
- 관련 독립 테스트·브라우저 fixture: `tests/legal.test.ts`, `tests/legal-database.test.ts`, `tests/legal-harness.html`, `tests/legal-harness.tsx`, `e2e/legal.spec.ts`.

**앱 전체 연결은 아직 필요합니다.** 수정 금지 요청에 따라 `src/App.tsx`, `src/main.tsx`, `src/api.ts`, `server/app.ts`, `server/repository.ts`, `shared/planner.ts`를 이 작업에서 편집하거나 커밋하지 않았습니다. `QA_REPORT.md`도 편집하지 않았습니다. 작업 중 다른 담당자의 변경/커밋이 있는 공유 작업 트리였으므로 `git commit --only`로 위 담당 파일만 커밋했습니다.

원격 DB 변경·마이그레이션 적용·배포·실예약·Gemini/API 유료 호출은 하지 않았습니다. Supabase CLI의 `migration new`는 로컬 SQL 파일 생성에만 사용했습니다. DB 테스트는 폐기 가능한 메모리 PGlite입니다.

## 필수 동의와 선택 동의

필수: 이용약관, 개인정보 수집·이용, Supabase 국외 이전/보관의 **별도 동의**, 만 18세 이상 자기확인. 생년월일·신분증을 추가 수집하지 않습니다. 체크박스는 실제 연령 인증이 아닙니다.

선택: 자가 입력한 거주 도시/지역 라벨의 공개. 기본 false이고 거부해도 회원 기능을 막지 않습니다. 별도 동의 설정 화면에서 false로 저장하면 공개 라벨이 제거되고, 철회 기록이 추가됩니다. 마케팅·GPS·Gemini 개인정보 이전·예약 고객정보 제공을 가입 동의에 묶지 않았습니다.

이메일 링크 요청 전 체크는 화면상의 가입 의사 확인입니다. 그 시점에는 확인된 사용자 증빙으로 저장하지 않습니다. 이메일 확인 후 `LegalConsentGate`에서 다시 명시적으로 동의하고 서버에 기록해야 회원 절차가 완료됩니다. 다른 기기에서 이메일을 여는 경우에도 로컬 체크를 신뢰하지 않습니다. 게이트를 연결하기 전에는 이 최종 단계가 작동하지 않으므로 가입 흐름 전체가 완료됐다고 표시하면 안 됩니다. Supabase Auth 계정의 생성 시점과 LocalRoute 회원 기능 활성 시점은 구별합니다.

예약자명·전화번호는 기존 비공개 예약 프로필 화면의 별도 선택 동의 영역입니다. 이 작업에서는 해당 항목을 Auth `data`/JWT·공개 프로필·동의 이벤트·로그·Gemini 입력에 추가하지 않았습니다.

## 서버 통합

JSON 파서와 기존 `limit` 함수 선언 뒤, 보호할 라우트를 등록하기 **전에** 다음을 연결하세요. 오류 처리 미들웨어보다 앞이어야 합니다. 환경 변수는 새로 만들지 않으며 기존 서버 설정을 사용합니다.

```ts
import { attachLegal, createLegalStore } from "./legal";

const legalStore = createLegalStore(config);
const { requireConsent, requirePublicAreaChoice } = attachLegal(app, {
  store: legalStore,
  limit,
});

// attachLegal이 먼저 등록한 동의 조회/저장 라우트는 동의 없이 접근 가능해야 합니다.
app.use("/api/me", requireConsent);
app.put("/api/me", requirePublicAreaChoice);
app.post("/api/contributions", requireConsent);
app.post("/api/place-photos/:requestId", requireConsent);
app.put("/api/endorsements/:id", requireConsent);
app.post("/api/feedback", requireConsent);
app.post("/api/reports", requireConsent);
app.use("/api/admin", requireConsent);
app.post("/api/planning/generate", requireConsent);
app.get("/api/planning/status/:requestId", requireConsent);
app.use("/api/itineraries", requireConsent);
app.use("/api/itinerary-shares", requireConsent);
```

위 등록 뒤에 기존 핸들러와 `attachPlanner`/`attachShares`를 연결합니다. `requireConsent`는 동의 검사만 추가하며 기존 소유권·역할·확인 이메일 검사를 대체하지 않습니다. 가격 조회, 공개 장소 검색/승인 사진, 공개 공유 링크, 법적 고지, 비회원 권리행사/정정 문의는 회원 동의로 막지 마세요. 예약·AI 보조 모듈을 통합하는 담당자는 해당 인증된 요청 경로에도 게이트를 적용해야 합니다. 예약 상태 열람/취소처럼 이미 발생한 거래와 권리행사 경로는 동의 갱신을 강요해 접근을 잃게 하지 않도록 별도로 검토하세요.

레거시 `PUT /api/me`는 공개 여부를 계속 받기 때문에 `requirePublicAreaChoice`가 필요합니다. 기록된 선택과 다른 값을 보내면 `403 LEGAL_PUBLIC_AREA_CHOICE_REQUIRED`입니다. 공개 여부 변경은 먼저 동의 설정을 저장한 다음 프로필을 갱신하도록 연결하세요. 프런트엔드의 기존 프로필 공개 체크도 이 동의 흐름과 연결해야 합니다. DB 트리거는 기록 없는 공개를 차단하지만, API 가드는 레거시 경로의 상태 불일치를 방지합니다.

API:

| 요청 | 의미 |
| --- | --- |
| `GET /api/legal` | 공개 버전·문서 목록·최소 연령 |
| `GET /api/me/legal-consents` | 확인된 현재 사용자 동의 상태 |
| `POST /api/me/legal-consents` | 필수 동의·선택 공개 여부를 새 이벤트로 저장 |

POST 예시:

```json
{
  "requestId": "30000000-0000-4000-8000-000000000001",
  "version": "2026-10-17.1",
  "language": "ko",
  "terms": true,
  "privacy": true,
  "supabaseTransfer": true,
  "adult": true,
  "publicLocalArea": false
}
```

동일 본문 재시도에는 같은 UUID를 사용합니다. 변경한 선택에는 새 UUID가 필요합니다. 클라이언트는 저장 실패 때 성공으로 표시하지 않으며, 이전 서버가 다른 버전을 `current: true`로 반환해도 스키마가 거부합니다. 주요 오류는 미인증 `401`, 동의 미완료/선택 불일치 `403`, 입력·구버전 `400`, 멱등 키 충돌 `409`, 연결 미설정/저장 실패 `503`입니다. 실제 기존 서버의 오류 응답 규약과 연결해 번역하세요.

## 프런트엔드 통합

```tsx
import { LegalPage, LegalConsentGate } from "./legal";

// 확인된 Auth 사용자 세션을 얻은 뒤, 기여/프로필/LP 등 회원 화면 진입 전에 표시.
<LegalConsentGate userId={session.user.id}>
  <MemberWorkspace />
</LegalConsentGate>

// 계정의 '동의 설정' 진입점. 선택 지역 공개를 해제하고 저장하면 철회.
<LegalConsentGate userId={session.user.id} settings>
  {null}
</LegalConsentGate>

// 공개 라우트로 등록하고 로그인 밖에서도 footer/설정에서 접근 가능하게 연결.
<LegalPage document="privacy" />
<LegalPage document="terms" />
<LegalPage document="transfers" />
<LegalPage document="location" />
```

권장 공개 경로는 `/legal/privacy`, `/legal/terms`, `/legal/transfers`, `/legal/location`입니다. **아직 라우터에 등록된 경로라고 주장하지 않습니다.** `LegalPage`는 기본적으로 기존 i18n 언어를 따르며, 독립 표시 시 `language="ko" | "en"`을 받을 수 있습니다. 로그인 안에서는 `LegalNotices`의 네 펼침 영역으로 이미 읽을 수 있습니다. 자유 탐색/데모 전체를 게이트로 감싸지 마세요. 사용자·언어가 바뀌면 게이트 상태는 초기화됩니다. 세션 종료/사용자 전환 때 민감한 회원 화면도 함께 해제해야 합니다.

## DB 적용 전과 출시 전 확인할 사항

허용되는 유일한 런타임 DB는 `pjdawapasozsrpnrtsfx`, 확인된 기본 DB 리전은 **인도 뭄바이 ap-south-1**입니다. `createLegalStore`는 다른 프로젝트 URL을 거부합니다. 이번 마이그레이션은 기존 profiles/curator/locality 마이그레이션 뒤에 적용해야 하며, 실제 적용은 별도 승인 대상입니다.

- SQL은 기존 행을 삭제/갱신하지 않습니다. 과거에 이미 공개된 지역 라벨을 어떻게 다시 동의받고 비공개로 전환할지는 기존 사용자 현황 확인 후 별도 승인된 절차로 처리하세요. 새 동의의 선택값 false 저장은 해당 사용자의 공개 라벨을 제거합니다.
- 공개 Supabase DPA의 계약/수신 법인은 **Supabase Pte. Ltd.(싱가포르)**입니다. DPA에는 privacy@supabase.io, 현재 개인정보방침에는 privacy@supabase.com이 나옵니다. 홈페이지 하단의 Supabase Inc. 표기만으로 미국 수신 법인을 확정하지 않았습니다. 실제 LocalRoute 계정 계약 법인과 대조해야 합니다. DB 리전은 Supabase의 모든 지원·백업·메일 처리 국가를 뜻하지 않습니다. 실계약, 최신 재수탁자 목록, 추가 국가·항목·보유/삭제/백업 잔존기간을 확정하고 고지를 완성하기 전 실제 회원 처리를 출시하지 마세요. 확인되지 않은 보존 연수를 법적 의무로 지어내지 않았습니다.
- Supabase 이메일 확인 활성화·허용 리디렉션·SMTP 수탁자 설정은 원격에서 조회/변경하지 않았습니다. 실제 이메일 확인 설정은 라이브 가입 전 별도로 검증해야 합니다.
- Gemini 공식 약관의 18세·미성년 접근 제한을 반영해 회원 서비스를 18세 이상으로 정했습니다. 이는 연령 확인·미성년자 접근 가능성에 대한 출시 검토를 대체하지 않습니다. 무료 API에 개인정보를 보내는 것은 선택 체크로 정당화할 수 없습니다. 현재 일정의 자유 입력·식이 제한·추천 문장·사진 메타데이터에 개인정보가 섞일 수 있으므로 실제 입력 최소화/필터링과 계정 계약·수신 법인·처리국·보유기간·이전 근거 확인 전 AI를 활성화하지 마세요. EEA/영국/스위스 제공에 대한 유료 서비스 조건도 확인해야 합니다. 유료 API도 안전 로그·글로벌 임시 처리 가능성이 있으므로 '보관/해외 처리 없음'이라고 고지하지 않습니다. 가입 동의는 미확정 Gemini 개인정보 이전을 허용하지 않습니다.
- 작업 중 예약·경로·목적지·AI 보조 모듈이 다른 담당자에 의해 추가되고 있었습니다. 고지는 **기본 비활성 상태**와 구현된 데이터 흐름을 기준으로 작성했습니다. 예약 제출, AI 이미지 처리, 새로운 목적지/경로 API를 켜는 담당자는 실제 입력·수신자·처리국·보유기간·기능별 별도 동의를 재검토하고 고지 버전을 올려야 합니다. 개인위치 추적이나 계정 일괄 삭제가 작동한다고 쓰지 않았습니다. 비공개 예약 프로필 삭제와 계정 전체 삭제는 구별했습니다.
- HeyYumi 공개 방침에는 예약 시 식당 제공·과거 해당 업소 예약 이력 요약·알림톡/SMS·국외 수탁자가 기재되어 있습니다. 향후 예약을 활성화할 때 이를 LocalRoute 실제 계약과 대조해야 합니다. 검색에는 개인 연락처를 넣지 말고, 확인되지 않은 수탁 관계·국외 처리기간을 추정하지 마세요.
- OpenFreeMap 직접 브라우저 요청 외에 지도 실패 시 `tile.openstreetmap.org` 대체 요청도 작업 중 추가되어 고지했습니다. 실제 사용 지도 스타일/타일/CDN 및 이후 추가 API가 바뀌면 안내를 갱신하세요. 외부 지도 통신은 GPS 수집과 구별합니다.
- 계정 전체 삭제·법정 보존·백업 파기·사진 정리 도구의 운영 스케줄은 완료됐다고 주장하지 않았습니다. 권리행사는 운영자 메일로 요청하도록 안내했습니다. 동의 이벤트는 auth 사용자 삭제 시 cascade되지만, 다른 기여/원장 외래키까지 처리하는 계정 삭제 절차는 이번 범위에 없습니다.
- 새 테이블의 Data API 노출 변경 공지도 확인했습니다. SQL의 명시적 GRANT와 RLS/RPC 권한을 유지하세요. 호스팅 환경의 advisor·JWT/Storage·메일·실동시 다중 연결 검증은 수행하지 않았습니다.

## 공식 근거

공식 자료는 다음 페이지를 실제 조회했습니다. 법적 문구는 원문 전체 복사가 아닌 실제 흐름에 맞춘 작성입니다.

- [개인정보 보호법](https://www.law.go.kr/법령/개인정보보호법), [개인정보위 국외 이전 제도](https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=367): 필수/선택 구분, 수집 목적·항목·보유·거부 안내, 제28조의8 국외 이전 근거.
- [위치정보법](https://www.law.go.kr/법령/위치정보의보호및이용등에관한법률), [법제처 위치정보 안내](https://easylaw.go.kr/CSP/CnpClsMain.laf?ccfNo=2&cciNo=2&cnpClsNo=1&csmSeq=1702&menuType=cnpcls&popMenu=ov): 미구현 GPS 기능에 포괄 동의를 요구하지 않음.
- [Gemini API 약관](https://ai.google.dev/gemini-api/terms): 연령, 무료/유료 데이터 조건, EEA/영국/스위스 제공 조건.
- [Supabase 리전](https://supabase.com/docs/guides/platform/regions), [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum), [재수탁자 목록](https://supabase.com/legal/customer-resources/subprocessor-list), [개인정보방침](https://supabase.com/privacy), [이메일 인증](https://supabase.com/docs/guides/auth/passwords), [변경 이력](https://supabase.com/changelog). 스킬이 지정한 `changelog.md`는 웹 도구에서 읽기 오류가 나 공개 changelog로 대체 확인했습니다.
- [OpenFreeMap 개인정보방침](https://openfreemap.org/privacy/), [OSMF 개인정보방침](https://osmfoundation.org/wiki/Privacy_Policy), [HeyYumi 개인정보방침](https://heyyumi.ai/legal/privacy), [Kakao 개인정보방침](https://www.kakao.com/policy/privacy).

## 실행한 검증과 결과

| 검증 | 결과 |
| --- | --- |
| `npx vitest run tests/legal.test.ts tests/legal-database.test.ts tests/local-contributions.test.ts --maxWorkers=1 --hookTimeout=30000` | **3 파일·24 테스트 통과**. 실제 SQL/RLS, 미확인 이메일·익명·소유권·클라이언트 쓰기/RPC 차단, 필수 거부·구버전·위조 필드, DB 시각, 멱등 재시도·충돌, 공개 철회·과거 재전송, Auth 메타데이터 공개 차단. 기존 전체 마이그레이션과의 조합도 local-contributions 테스트에서 검증. |
| `npx playwright test e2e/legal.spec.ts --workers=2` | **12/12 통과**. 360px·390px·1440px, 한·영, 키보드 펼침/초점·터치 체크·스크롤/가로 넘침, 모션 감소, 선택 거부/철회, 조회/저장 실패 시 차단·재시도 UUID 유지. 실제 외부 API/메일 호출 없이 로컬 mock 경계 사용. |
| `npm run typecheck` | **통과**. 최종 스키마 변경 이후 다시 실행. |
| `npm run build` | **통과**. Vite 번들 크기 경고는 있음. 이후 변경은 타입 검사 통과한 응답 스키마 강화/고지 문구·참고 링크/게이트 언어 초기화이며 배포는 하지 않음. |
| 담당 파일을 지정한 `npx eslint ...` | **통과**. Login, shared/server legal, src/legal, 신규 테스트·fixture·e2e 및 지역 공개 회귀 테스트. |
| 담당 경로 `git diff --check` | **통과**. |
| 전체 `npx vitest run --maxWorkers=2` | 당시 **171 통과·6 실패(21 파일)**. 실패는 담당 밖 `tests/destinations-ui.test.ts`의 로컬 브라우저 로딩 타임아웃 6개. 이후 다른 담당자 변경은 이 작업의 통과 근거로 사용하지 않음. |
| 초기 전체 `npm test` / 기본 hook timeout | 동시 실행 부하에서 메모리 DB 초기화 10초 제한으로 legal/booking 또는 지역 테스트가 skip된 실패가 있었음. 테스트 제한을 코드에서 바꾸지 않고 최종 관련 검증은 작업 수 1·hook 30초로 실행해 24개 모두 통과. |
| 초기 전체 `npm run lint` | 당시 담당 밖 `shared/reservations.ts` 정규식 2 오류와 기존 Hook 경고로 실패. 담당 lint는 별도로 통과했으며 전체 lint 완료로 주장하지 않음. |

최종 단계는 앱 담당자가 위 게이트·공개 페이지·동의 설정 진입점을 통합하고, 실제 계약/운영 조건을 확정한 뒤 별도 승인을 받아 이 프로젝트에만 마이그레이션을 적용하는 것입니다.
