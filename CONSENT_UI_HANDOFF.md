# 동의 화면 UI 인계

확인일: 2026-10-17 (Asia/Seoul). 범위는 동의 화면과 모의 응답 기반 UI 검증이다.

## 변경 파일

- `src/legal/LegalConsentGate.tsx`: 브랜드 카드, 조회/재조회 로딩, 조회 오류와 수동 재시도, 저장 중·저장 실패·성공 안내. 저장 실패 시 선택값을 보존한다. 오류 메시지에 제공자 응답·개인정보를 넣지 않는다.
- `src/legal/ConsentFields.tsx`: 기존 법적 문구와 체크 라벨을 유지하고 필수 4개/선택 그룹을 구분했다. 체크 행 전체를 누를 수 있고, 전문은 기존 인라인 펼치기 또는 새 창 링크로 읽을 수 있다.
- `src/legal/legal.css`: 법적 화면 범위의 카드·색상·여백·상태 피드백·포커스·44px 이상 조작 영역. 전역 스타일 파일과 App은 변경하지 않았다.
- `tests/consent-ui.test.ts`, `tests/consent-ui-harness.tsx`, `tests/consent-ui-harness.html`, `tests/consent-ui-client.ts`: 비밀 키·Auth·실제 API 없이 동의 화면을 실행하는 브라우저 회귀 테스트.
- `e2e/legal.spec.ts`: 저장 실패를 `alert`로 확인하고 외부/API 요청을 차단한다. Vite의 버전 쿼리가 붙은 client 모듈도 모킹한다. 체크 행 정렬 검증을 포함한다.
- `CONSENT_UI_HANDOFF.md`: 변경·검증·제한 기록.

## 동작과 보존한 안전장치

1. 조회 중에는 제목·짧은 설명·진행 표시를 제공하고 회원 콘텐츠를 표시하지 않는다. 조회 오류와 재조회 로딩은 같은 카드 최소 높이를 사용한다. 6개 언어/화면 조합에서 로딩→조회 오류 높이 변화는 2px 이하다. 전문과 체크 항목이 나타나는 단계는 내용에 맞게 자연스럽게 확장된다.
2. 조회 실패는 오류 영역으로 초점을 옮기고 재시도 버튼을 제공한다. 재시도 후 입력 화면으로 돌아오면 제목에 초점을 옮긴다. 자동 재시도나 자동 동의는 없다.
3. 필수 동의가 모두 선택되기 전에는 저장이 비활성화되고 이유를 안내한다. 선택 동의 거절은 저장을 막지 않는다. 저장 중에는 체크와 제출을 잠그고 진행 상태를 알린다.
4. 저장 실패는 `role="alert"`, 진행/성공은 `role="status"`로 알린다. 오류 메시지는 사용자가 할 다음 행동을 설명한다. 버튼 이름은 기존 ‘동의 설정 저장’/‘Save consent settings’를 유지했다.
5. 정상 저장 후에는 성공 안내와 기존 회원 콘텐츠를 즉시 함께 표시한다. 설정 화면은 성공 안내와 선택 항목을 유지한다. 서버 응답이 HTTP 200이어도 `current: false`면 실패로 처리하며 접근을 열지 않는다.
6. `LEGAL_VERSION = 2026-10-17.1`, 원래 법적 고지·동의 라벨, 별도 선택 공개 동의를 보존했다. 변경 전후 문자열 비교로 기존 법적 라벨/긴 문단 15개가 동일함을 확인했다. `shared/legal.ts`와 `content.ts`는 변경하지 않았다.
7. 실패 후 내용이 같으면 같은 요청 UUID를 재사용한다. 선택을 바꾸면 새 UUID를 만든다. 동기 제출 잠금으로 중복 제출을 막는다. 계정/언어별 기존 React key 초기화를 유지하며 이전 계정의 늦은 조회·저장 응답이 새 계정 화면을 열지 못한다.
8. 22px 체크박스의 클릭 영역은 전체 44px 이상 라벨 행이다. 버튼은 48px 이상, 링크/전문 펼치기는 44px 이상이다. 키보드 Space/Enter와 포커스 표시, native checkbox/fieldset, live region을 사용한다. reduced-motion에서는 스피너 회전과 버튼 전환을 제거하고 텍스트 피드백을 유지한다.

## 실행한 검사와 결과

모든 셸 명령은 `rtk proxy`로 실행했다. 아래 명령에 같은 접두사를 붙이면 재현할 수 있다.

```sh
npx vitest run tests/consent-ui.test.ts tests/legal.test.ts tests/euljiro-booking-panel.test.ts --hookTimeout=60000
# 39 passed: 새 동의 UI 9 + 기존 법적 계약 9 + 예약 진입 UI 21

npx vitest run tests/consent-ui.test.ts --hookTimeout=60000
# 마지막 CSS 조정 후 9 passed

npx playwright test e2e/legal.spec.ts --workers=1 --output=/tmp/localroute-consent-ui-recheck
# 12 passed: 360px·390px·1440px, 가입 고지/한국어 저장 실패·재시도/영어 설정/조회 실패·재시도

npx playwright test e2e/legal.spec.ts e2e/administrative-regions.spec.ts --grep 'signup consent checkboxes|signup notices|verified consent|English consent|failed status lookup' --workers=1 --output=/tmp/localroute-consent-ui-results
# 최초 실행 6 passed / 9 failed. 가입 체크 행 정렬 테스트는 3개 화면 모두 통과.
# 나머지 9개는 Vite 버전 쿼리로 기존 mock 경로가 일치하지 않아 실패했다.
# 모킹 정규식을 보완한 뒤 위 legal.spec.ts 12개 전체 재실행이 통과했다.

npm run typecheck
# passed

npx eslint src/legal/LegalConsentGate.tsx src/legal/ConsentFields.tsx tests/consent-ui-client.ts tests/consent-ui-harness.tsx tests/consent-ui.test.ts e2e/legal.spec.ts
# passed
```

새 UI 테스트의 한국어·영어 × 360/390/1440px 매트릭스는 모의 지연, 조회 실패→재시도, 저장 중 잠금, 저장 실패→같은 요청 재시도, 정상 완료를 확인한다. 추가로 HTTP 성공이지만 동의 미완료인 응답, 선택 변경 시 새 요청 ID, 선택 공개 철회, 계정 변경 중 늦은 응답을 검증한다. 가로 넘침 없음, 터치 행/버튼/링크 크기, 키보드 체크와 전문 펼치기, 초점 이동, reduced-motion을 확인한다.

`CONSENT_UI_SCREENSHOTS=1 npx vitest run tests/consent-ui.test.ts -t 'ko 390px' --hookTimeout=60000`로 390px 한국어 로딩/입력 화면 이미지를 `/tmp/localroute-consent-loading.png`, `/tmp/localroute-consent-ready.png`에 만들 수 있다. 해당 화면을 직접 열어 시각적으로 검토했다.

## 통합과 남은 제한

- 기존 `<LegalConsentGate userId={verifiedUserId}>…</LegalConsentGate>` 및 `settings` 계약을 유지한다. App 연결 변경은 필요 없다. 실제 사용자 확인·권한 검사는 기존 인증/서버 담당 범위다.
- 실제 Supabase 권한 오류 수정이나 운영 환경의 저장 성공은 이번 결과로 검증되었다고 볼 수 없다. 메인 에이전트의 권한 수정 후 실제 확인된 계정으로 조회/명시적 동의 저장을 별도 검수해야 한다.
- Chromium의 모바일 뷰포트·터치 에뮬레이션으로 검사했다. 실제 iOS Safari, 하드웨어 키보드, VoiceOver/NVDA의 음성 낭독은 미검증이다. ARIA/초점/키보드 동작은 브라우저에서 확인했다.
- 공개 전문 링크의 href/target과 44px 영역을 확인했다. 실제 새 창 탐색·복귀, 배포 환경의 네트워크 지연은 별도 실기기 확인 대상이다. 인라인 전문 읽기도 계속 제공한다.
- DB·서버·환경 설정·인증 처리·App·전역 스타일·QA_REPORT.md를 수정하지 않았다. 원격 데이터 변경, 실제 메일·예약·결제·LP 처리는 수행하지 않았다.
