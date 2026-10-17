# LocalRoute 공개 배포 사전 스모크

## 상태와 검사 경계

- 대상: https://localroute.vercel.app
- 검사: 2026-10-17 14:52–14:57 KST, Chromium, 360×844 / 390×844, 한국어·영어.
- **최종 배포 완료 통보를 받지 않았다. 이 문서는 현재 공개 버전의 사전 점검이며 최종 버전 승인이나 출시 합격 판정이 아니다.** 통보된 배포에서 미검증 항목을 다시 확인해야 한다.
- 최초 HTML 식별: `/assets/index-CAcncOtr.js`, ETag `W/"c49e35dca6c907ffe060b9a31ad3ba34"`. 검사 중 원격 배포가 변경될 수 있으므로 저장소 HEAD와 동일하다고 가정하지 않았다.
- 제품 코드·QA_REPORT.md·환경 설정을 수정하지 않았다. 실제 가입, 메일 발송, 개인화 생성, 예약, 결제, LP 변경을 하지 않았다. 체크박스 클릭은 제출하지 않은 브라우저 내 상태 변경뿐이다.
- 브라우저에서 쓰기 요청과 보호/공급자 API 요청을 차단했다. 공개 장소·이미지·지도 타일 GET만 사용했다. 인증을 위조하거나 동의 상태를 우회하지 않았다.

## 확인된 결과

| 항목 / URL | 재현 단계 | 기대 | 실제 / 판정 |
| --- | --- | --- | --- |
| `/` → `/discover` → `/places/ce4d976d-4b79-4f35-ac0a-2711bc516cfd` | 360/390px 각각 한국어·영어로 랜딩의 **보이는** 장소 둘러보기 CTA 클릭 → 첫 장소 카드 클릭 | 언어 유지, 목록과 선택 장소 상세 표시 | 4개 조합 모두 랜딩·탐색·대성갈비 상세 표시. 목록 29개. `html.lang` ko/en 일치. |
| 랜딩·탐색·상세 가로 폭 | 각 화면에서 `documentElement.scrollWidth`와 `innerWidth` 비교 | 가로 넘침 없음 | 360/390px 네 조합 모두 `scrollWidth === innerWidth`. |
| `/login` 가입 동의 | 로그인 화면에서 회원가입 탭 → 필수 체크박스 4개의 문구 span 클릭. 360/390px, ko/en 반복 | 문구 클릭으로 토글, 첫 줄 정렬, 읽을 수 있는 간격 | 16개 클릭 모두 토글. 체크박스와 문구 첫 글자의 수직 중심 차이 360px 약 1px, 390px 약 0px. 라벨 높이 44–88px. 가로 넘침 없음. 제출하지 않음. |
| `/api/health` | 인증 없이 GET | 정상 JSON 상태 응답 | 200 `application/json`; `ok:true`, `mode:live`, `database:true`, warnings 빈 배열. capabilities는 설정 상태이며 실제 생성·예약·LP 검증을 뜻하지 않음. |
| `/api/places` | 인증 없이 GET | 공개 장소 목록 JSON | 200 `application/json`, 29개. 을지로 세 장소의 canonical ID와 displayMedia 메타데이터가 응답에 존재. |
| 직접 경로 HTTP | `/discover`, `/plan/new/2`, 위 대성갈비 상세, `/examples/euljiro`를 독립 GET | 경로별 HTML 수신 가능 | 모두 200 `text/html`, 재조회 약 0.77–0.93초. 클라이언트 화면 복구와는 별개 결과. |
| 비회원 마법사 직접 진입 | 새 390px 영어 브라우저에서 `/plan/new/2` 진입, commit 이후 화면 조사 | 로그인 없이 일정 생성 불가 | `Sign in to create an itinerary`와 `.planning-access` 1개 확인. 비회원 생성 차단 유지. |

## 최종 버전에서 반드시 재확인할 항목

### 을지로 예시 이미지와 상세 연결 — 현재 일치 검증 불가

- URL: https://localroute.vercel.app/examples/euljiro
- 단계: 390px 한국어에서 예시 진입 → 우래옥·하이드미플리즈 을지로점·탑골공원 `.example-stop`의 이미지와 `/places/` 링크 조사.
- 기대: 예시와 동일 장소 상세가 같은 승인된 displayMedia를 표시하고, 실제 사진과 AI 일러스트의 구분 유지.
- 관찰: 최초 약 2초 시점의 세 카드에서 `img`와 동일 장소 상세 링크가 각각 0개였다. 초기 로딩 지연과 배포 버전 차이를 배제하지 못했으므로 **확정 P1로 분류하지 않았다**. 아래 직접 경로 재확인 결과와 함께 판단해야 한다.
- 공개 API의 비교 대상:
  - 우래옥: `/places/5bdc3ee1-3ae8-4e25-a72d-c1842565643a` → `/example-images/lunch-ai.png` (`ai_illustration`, 실제 메뉴·매장 재현 아님).
  - 하이드미플리즈: `/places/5e5098cd-0fbd-43c7-b9f4-5b81d8e3720c` → `/place-display-media/hidemeplease-euljiro-founder.jpg` (사용자 제공 사진).
  - 탑골공원: `/places/468d4c2f-0ee6-4fa3-a8f4-0c41742c6819` → `/example-images/tapgol-park-tristan-surtel.jpg` (사진).

### 새로고침·뒤로가기·직접 진입의 브라우저 완료

- 대성갈비 상세의 SPA 진입은 4개 언어/폭 조합에서 확인했다. 이어진 `page.reload`는 검사기의 5초 navigation deadline을 초과해 뒤로가기까지 연속 검증하지 못했다.
- 별도 `/plan/new/2` 진입도 DOMContentLoaded 대기 18초를 초과한 사례가 있었다. 독립 HTTP GET은 위와 같이 200이며, **이 차이만으로 배포 장애/P1이라고 단정하지 않는다**. 다른 대기 방식으로 직접 진입을 재확인했다.
- 새 브라우저에서 `waitUntil: commit` 후 1.8초를 기다린 재확인에서는 `/plan/new/2` 로그인 안내가 표시됐다. 이어진 상세·예시 경로는 그 시점 제목/이미지 DOM이 아직 없어 화면 복구 완료로 처리하지 않았다.
- 최종 버전에서 새로고침 후 실제 상세 DOM, 닫기/뒤로가기 후 목록 복귀, 재진입을 사람 조작 및 충분한 로딩 대기로 확인해야 한다.

### 지도와 하단 버튼

- 을지로 예시 첫 화면에서 지도 컨테이너·핀·확대/축소 버튼·출처는 보였으나 초기 2–3초 시점에는 지도 로딩 문구가 남아 있었다. 베이스맵 완전 표시를 통과 처리하지 않았다.
- 가입 동의 영역은 스크롤 후 문구·버튼이 화면 안에 표시됐다. 로그인 링크 버튼은 이메일 미입력 상태로 비활성화돼 있었고 제출하지 않았다. 전체 화면의 하단 버튼 가림·막다른 동선 전수 검증은 시간 제한으로 미완료다.

### 인증이 필요한 동의 게이트 / 마법사 — 미검증

- 동의 로딩·조회 오류·재시도·저장 오류는 확인된 회원의 서버 동의 상태를 요구한다. 이번 검사는 비회원이며 실제 인증 및 기록 변경을 하지 않아 생산 환경에서 재현하지 않았다. 가입 폼의 정적 동의 체크 UI 통과와 구분한다.
- 일정 마법사의 날짜·여러 활동 선택·이전 단계 입력 유지 역시 회원 세션 없이 우회 검증하지 않았다. `/plan/new/2`의 HTTP 200은 마법사 접근 허용이나 입력 유지 검증을 뜻하지 않는다.
- 최종 배포 완료 후 이미 준비된 검증 계정과 비파괴 검사 절차가 필요하다. 생성·저장·예약·결제/LP 작업은 이번 승인 범위에 포함되지 않는다.

## 근거와 인계

- 로컬 검사 증거: `/tmp/localroute-deployed-smoke/`의 `results.json`, `focus-results.json`, `direct-results.json`(생성 시), `landing-*`, `focus-consent-*`, `focus-example.png` 및 `direct-*` 스크린샷.
- 원격 API 응답 원본은 `/tmp/localroute-smoke-health.json`, `/tmp/localroute-smoke-places.json`, 최초 HTML은 `/tmp/localroute-smoke-root.json`에 보관했다. 민감한 세션/키를 기록하지 않았다.
- **현재까지 확정 재현한 P0/P1 없음. 미검증과 초기 관찰을 합격으로 처리하지 않았다.** 최종 배포 완료 통보와 위 미완료 항목 확인 전 출시 스모크 완료로 사용하면 안 된다.
