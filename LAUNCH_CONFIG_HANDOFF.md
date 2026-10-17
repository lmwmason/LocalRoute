# LocalRoute 출시 설정 읽기 전용 점검

점검일: 2026-10-17 (KST). 대상 프로젝트: 저장소에서 허용한 Supabase 프로젝트 `pjdawapasozsrpnrtsfx`.

이메일 인증 필수 설정은 원격 공개 Auth 설정에서 확인했다. 그러나 SMTP 전달, 실제 배포 도메인의 리디렉션, Kakao 앱 활성화·할당량·이용 권한은 확인되지 않았다. 이 문서는 출시 승인이나 실제 인증 메일 전달 성공을 뜻하지 않는다.

## 범위와 실행 기록

- AGENTS.md, PRD.md, DESIGN.md, QA_REPORT.md와 관련 구현·테스트를 읽었다. Supabase 스킬의 점검 지침과 공식 문서를 참고했다.
- 원격 조회는 Supabase 프로젝트 메타데이터, 공개 Auth `GET /auth/v1/settings`, OpenFreeMap 스타일·TileJSON 메타데이터에 한정했다. Auth 응답에서는 허용한 불리언만 추출했다. 지도 타일은 요청하지 않았다.
- `.env`는 메모리에서 읽어 존재 여부·형식·일치 여부만 판정했다. 값과 개인정보는 이 문서에 기록하지 않았다.
- 가입·로그인 메일 발송·인증 링크 소비·예약·Kakao 검색·유료 API 호출·SQL·원격 설정 변경·배포를 실행하지 않았다. 이메일 템플릿 적용 스크립트도 실행하지 않았다.
- 아래의 “로컬”은 점검 시점 작업 디렉터리를 뜻한다. 통합 중인 변경이 있으므로 배포된 코드와 동일하다고 가정하지 않는다.

## 확인된 사실과 남은 확인

| 항목          | 확인된 사실                                                                                   | 미확인 / 출시 전 필요 사항                                                |
| ------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Supabase 대상 | 로컬 URL 검사가 지정 프로젝트와 일치. 읽기 전용 프로젝트 조회 결과 `ACTIVE_HEALTHY`           | 실제 배포 환경도 동일 프로젝트인지 확인                                   |
| 이메일 인증   | 원격 공개 설정: 이메일 공급자 활성, 가입 허용, `mailer_autoconfirm=false`                     | 메일 전달·링크 클릭·최초 로그인 전체 과정, 기존 계정 상태                 |
| 리디렉션      | 클라이언트가 현재 페이지의 origin을 `emailRedirectTo`로 전달. 루트에서 PKCE 코드를 교환       | 원격 Site URL·Redirect URLs, 실제 운영 도메인·프록시 환경                 |
| SMTP          | 저장소에 이중 언어 이메일 템플릿 존재                                                         | 사용자 지정 SMTP 활성 여부·발신 도메인 인증·전달 성공·원격 템플릿 내용    |
| Kakao         | REST 키의 로컬 존재, 서버에서 `KakaoAK`로 주소 검색하는 코드 확인                             | 키의 유효성·앱 귀속·카카오맵 ON·할당량·호출 허용 IP·약관상 표시/보관 권한 |
| 지도 출처     | MapLibre 출처 컨트롤, 기본 스타일의 세 공급자 출처 메타데이터, OSM 대체 지도 출처 링크 존재   | 실제 배포 화면의 출처 노출·다른 지도 스타일·모바일 겹침                   |
| 비밀 키       | 로컬 공개 변수에 검사 대상 서버 비밀 값 복사 없음. 기존 `dist`에서 해당 값의 정확한 일치 없음 | 배포 번들·CDN·과거 커밋·변형/인코딩된 값·로그의 포괄 검사                 |

## Supabase: 필요한 설정과 확인 방법

### 이메일 소유권 확인

공개 설정 조회에서 `external.email=true`, `disable_signup=false`, `mailer_autoconfirm=false`를 확인했다. Supabase의 Confirm Email 설정은 확인 후 최초 로그인을 허용하는 설정이다. 이 조회는 메일 발송 없이 수행했다. 공개 설정 API는 SMTP 자격 증명이나 리디렉션 허용 목록을 제공하지 않는다. [Auth 설정 API 스키마](https://raw.githubusercontent.com/supabase/auth/master/openapi.yaml), [일반 Auth 설정](https://supabase.com/docs/guides/auth/general-configuration)

로컬 방어도 확인했다.

- `server/repository.ts`는 `auth.getUser(token)` 결과를 확인하고 익명 사용자나 `email_confirmed_at`이 없는 사용자를 거부한다. 모든 별도 서비스의 보호 여부까지 보장하는 검사는 아니다.
- `src/components/Login.tsx`는 예상과 달리 즉시 세션이 반환되면 로그아웃하고 인증 설정 안내를 표시한다. 메일 발송 성공으로 표시하지 않는다. 로그인은 `shouldCreateUser=false`로 자동 가입을 막는다.

프로젝트 소유자는 Dashboard의 Authentication에서 이메일 공급자와 Confirm Email을 **열람**해 재확인할 수 있다. 이후 별도 승인된 테스트에서만 신규 테스트 계정의 미인증 접근 거부 → 메일 수신 → 링크 인증 → 보호 작업 허용을 검증한다. 이번 점검에서는 실제 계정을 만들거나 메일을 보내지 않았다.

### Site URL과 Redirect URLs

`src/components/Login.tsx`의 반환 주소는 `window.location.origin`이다. `src/App.tsx`가 루트 URL의 `?code`를 처리하고 `src/supabase.ts`가 `exchangeCodeForSession`을 호출한다. 현재 코드에 맞는 허용 주소는 실제 운영 origin이며, 존재하지 않는 `/auth/callback` 경로를 임의로 설정하면 안 된다.

Dashboard → Authentication → URL Configuration에서 다음을 열람하고 운영 담당자가 별도로 설정해야 한다.

1. Site URL이 실제 운영 HTTPS 주소인지 확인한다. 운영 도메인은 이 점검에 제공되지 않아 확정하지 않았다.
2. Redirect URLs에 코드가 보내는 정확한 운영 반환 주소가 허용되는지 확인한다. 개발용 localhost와 IP 주소는 서로 다른 origin이므로 필요한 항목만 명시한다. 끝 슬래시 포함 매칭도 실제 반환 URL로 확인한다.
3. 운영에서는 광범위한 와일드카드 대신 필요한 정확한 주소를 사용한다. 프리뷰·개발 주소를 운영 주소와 구분한다.
4. PKCE 링크는 코드 검증 정보를 가진 동일 브라우저/기기에서 시험한다. 이메일 템플릿만 `token_hash` 방식으로 바꾸면 현재 코드 교환 흐름과 맞지 않을 수 있다.

허용되지 않은 반환 주소는 Site URL로 대체될 수 있다. 코드가 반환 주소를 요청한다는 사실만으로 허용 목록 설정을 확인할 수는 없다. [리디렉션 URL](https://supabase.com/docs/guides/auth/redirect-urls), [PKCE 흐름](https://supabase.com/docs/guides/auth/sessions/pkce-flow)

### SMTP와 이메일 템플릿

공개 Auth 설정과 프로젝트 메타데이터는 SMTP 구성을 노출하지 않았다. 로컬에 Management API 토큰도 없어 인증 관리 설정을 조회하지 않았다. 서버용 DB 키를 관리 토큰 대신 사용하지 않았다.

Dashboard → Authentication의 이메일/SMTP 설정에서 사용자 지정 SMTP 활성 여부, 공급자 호스트·포트·인증 설정의 존재, 승인된 발신 주소를 열람해야 한다. 비밀번호·메일 원문·수신자 정보는 점검 문서에 복사하지 않는다. 기본 SMTP는 수신 대상과 전달 보장이 제한되므로 일반 사용자 대상 운영 메일의 준비 완료 근거가 될 수 없다. 공급자 측 SPF·DKIM·DMARC 상태, 할당량·반송 처리도 확인한다. [사용자 지정 SMTP](https://supabase.com/docs/guides/auth/auth-smtp)

`supabase/templates/confirmation.html`과 `magic-link.html`에는 `{{ .ConfirmationURL }}`이 있다. 파일 존재는 원격 적용 증거가 아니다. 원격 Confirm Signup/Magic Link 템플릿, 실제 반환 URL, 공급자의 링크 추적 비활성 여부를 확인한다. 추적 URL 재작성이나 메일 보안 도구의 링크 선행 접근이 인증 링크를 깨뜨릴 수 있다. [이메일 템플릿](https://supabase.com/docs/guides/auth/auth-email-templates)

`scripts/apply-auth-email-templates.mjs`의 `--apply`는 원격 설정을 변경한다. 이번 읽기 전용 점검에서는 실행하지 않았으며, 확인 목적으로 실행해서도 안 된다.

## Kakao: 앱 활성화·키·권한

`server/destinations.ts`는 서버에서 `https://dapi.kakao.com/v2/local/search/address.json`에 REST 키를 `Authorization: KakaoAK …`로 전달한다. 브라우저에서 REST 키를 사용하는 구현은 발견하지 못했다. [Local REST API](https://developers.kakao.com/docs/ko/local/dev-guide)

현재 로컬 설정은 목적지 검색 활성화 조건인 `FEATURE_KAKAO_DESTINATIONS=true`와 `KAKAO_TERMS_VERIFIED=true`를 충족하지 않는다. 검색·라우팅 관련 별도 플래그와 약관 확인 조건도 충족하지 않는다. 키가 존재하는 것과 기능 활성화·사업적 사용 승인은 별개다. 활성화 플래그를 이번 점검에서 바꾸지 않았다.

앱 소유자가 Kakao Developers에서 다음을 **조회**해야 한다.

1. 대상 앱의 [카카오맵] → [사용 설정]이 ON인지 확인한다. 공식 문서는 2026-07-21 이후 정책을 안내하며, 개발자 계정의 최초 활성화 앱 여부와 할당량 초과 등에 따라 무료/유료 조건이 달라진다. 무료 사용 가능 여부를 키 존재만으로 판단하지 않는다. [카카오맵 사용 설정과 정책](https://developers.kakao.com/docs/ko/kakaomap/common)
2. [앱] → [플랫폼 키] → [REST API 키]에서 키 상태·대상 앱·호출 허용 IP 설정을 확인한다. 허용 IP를 등록했다면 실제 서버의 외부 송신 IP가 포함되어야 한다. 서버리스 환경의 IP를 임의로 추정하거나 제한을 변경하지 않는다. 실제 값은 문서에 복사하지 않는다. [앱 설정](https://developers.kakao.com/docs/ko/app-setting/app)
3. 사용량·쿼터·결제 연결 여부를 조회한다. 이번에는 키 검증을 위한 실제 검색도 호출하지 않았다.
4. 현재 지도 렌더러는 MapLibre/Leaflet이다. 서버 Local 주소 검색에 Kakao JavaScript 키·웹 도메인 등록·Kakao Login OAuth 동의를 일괄 필수 조건으로 덧붙이지 않는다. 반대로 Kakao 지도 SDK를 나중에 추가하면 해당 SDK의 키·도메인 요건을 별도로 확인한다.
5. Local 검색 권한을 Kakao Mobility 길찾기 권한이나 예약 권한으로 간주하지 않는다. `server/routing/providers.ts`의 제공자별 계약·키·할당량은 따로 확인한다.

Kakao 검색 결과를 다른 제공자의 지도에 표시하거나 저장·재사용할 수 있는 구체적 범위는 이번에 확보한 문서만으로 확정하지 못했다. 금지 또는 허용으로 단정하지 않는다. 결과 출처 표시, 저장 기간, 최신성 유지, 상업적 이용 조건을 실제 앱 계약과 정책에 대조한 후에만 `KAKAO_TERMS_VERIFIED`를 승인해야 한다. 지도 자체의 OSM 출처는 Kakao 결과의 이용 허가를 대신하지 않는다. [Kakao 운영정책](https://developers.kakao.com/terms/ko/site-policies)

## 지도 출처 표시

확인한 로컬 구현과 공급자 메타데이터:

- `src/components/Map.tsx`는 MapLibre의 `attributionControl: { compact: true }`를 사용한다.
- 기본 OpenFreeMap Liberty 스타일 및 연결된 TileJSON에 OpenFreeMap·OpenMapTiles·OpenStreetMap 크레딧이 있다. 스타일·출처 메타데이터만 읽었으며 타일은 받지 않았다.
- `src/components/RasterMap.tsx`는 표준 OSM 타일과 연결된 OpenStreetMap 저작권 출처를 지정한다.
- `server/app.ts`의 응답 정책은 `strict-origin-when-cross-origin`이다. 배포 CDN/정적 호스트가 덮어쓰는 헤더는 확인하지 못했다.

기본 스타일의 출처 컨트롤을 유지하고, 스타일을 교체할 때도 공급자별 링크·크레딧을 확인해야 한다. OSM 표준 타일 정책은 화면에서 보이는 출처와 정상 Referer, 캐시 정책 준수 등을 요구하며 대량 다운로드·오프라인 선취용 서비스가 아니다. [OpenFreeMap](https://openfreemap.org/), [OpenMapTiles 출처 안내](https://github.com/openmaptiles/openmaptiles/blob/master/README.md), [OSM 타일 정책](https://operations.osmfoundation.org/policies/tiles/)

실제 배포 화면에서 360px·390px·데스크톱, 한국어·영어, 지도 열기/닫기·크기 변경·대체 지도 상태별로 출처 링크가 보이고 눌리는지 확인해야 한다. 하단 메뉴·시트에 가리거나 화면 밖으로 밀리는지, compact 컨트롤이 필수 출처를 숨기는지도 확인한다. 이번 정적 점검만으로 시각적 노출 준수를 확정하지 않았다. 브라우저 Network에서 실제 타일 요청의 Referer와 응답 캐시 헤더도 값 전체를 기록하지 않고 판정한다.

## 브라우저 비밀 키 노출 검사

확인 결과:

- `.env` 및 별도 환경 파일의 ignore 규칙을 확인했고 해당 검사 대상 파일은 Git에 추적되지 않았다. 과거 Git 이력 전체를 검사한 것은 아니다.
- 로컬 공개 Supabase 자격 증명은 publishable 형식이었다. 서버 비밀이 공개 변수에 그대로 복사된 일치는 없었고, 허용 목록 밖의 `VITE_` 변수도 발견하지 못했다. 키 값은 출력하지 않았다.
- 기존 로컬 `dist`의 텍스트 자산 15개에서 검사 가능한 서버 비밀 값 5개의 정확한 일치를 찾지 못했다. `sb_secret_` 형식과 소스맵도 발견하지 못했다. 이 결과는 기존 로컬 산출물에 한정한다.
- `src/config.ts`가 공개 설정을 읽고 `src/supabase.ts`는 허용된 URL·공개 키만 사용한다. `shared/config.ts`와 `vite.config.ts`는 잘못된 프로젝트 URL, secret 키, service-role JWT 등 허용되지 않는 공개 키를 거부한다. publishable 키의 형식 검사 자체는 프로젝트 귀속이나 유효성을 증명하지 않는다. 이번에는 해당 공개 키를 이용한 원격 Auth 설정 GET도 성공했다.
- `vite.config.ts`는 프로덕션 소스맵 생성을 끈다. 이 검사는 모든 공개 변수의 비밀 문자열을 자동 탐지하는 일반 보안 스캐너는 아니다.

`VITE_` 변수는 브라우저에 공개된다. `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`/`VITE_SUPABASE_ANON_KEY`는 공개 설정이며, Supabase secret/service-role, Gemini, HeyYumi, Kakao REST/Mobility 키는 서버에만 있어야 한다. 공개 키의 안전성은 별도의 RLS·서버 권한 검증도 필요하다. [Vite 환경 변수](https://vite.dev/guide/env-and-mode), [Supabase API 키](https://supabase.com/docs/guides/getting-started/api-keys)

운영 담당자는 배포 플랫폼의 환경 변수 **이름과 배치 위치**를 열람하고, 배포된 HTML/JS/CSS/소스맵·네트워크 요청·로그에서 비밀 노출을 추가 확인해야 한다. 검사는 비밀을 메모리에서 비교하고 일치 건수만 보고하는 방식으로 수행한다. 키·인증 헤더·토큰이 들어간 HAR이나 응답 원문을 공유하지 않는다. 배포 URL과 산출물이 제공되지 않아 이 단계는 수행하지 못했다. 정확한 문자열 검색은 인코딩·분할·난독화된 노출을 모두 탐지하지 못한다.

## 실행한 검증과 다음 확인

실행 명령: `rtk proxy npm test -- tests/public-config.test.ts tests/release-security-bundle.test.ts`

결과: **2개 파일, 6개 테스트 통과**. 공개 키/프로젝트 제한과 잘못된 공개 자격 증명의 빌드 차단, 가짜 서버 키를 사용한 임시 프로덕션 번들에서 비밀·소스맵 제외를 검증했다. 테스트는 임시 로컬 산출물과 합성 키를 사용하며 원격 계정·DB·제공자를 변경하지 않는다. 배포 번들에 대한 검증 결과는 아니다.

남은 확인은 다음 순서로 진행할 수 있다.

1. 소유자가 원격 Auth URL·SMTP·이메일 템플릿을 열람하고 민감 값 없이 확인 여부를 기록한다.
2. Kakao 앱의 활성화·키 귀속·허용 IP·할당량·라이선스를 확인한다. 확인 전 기능 플래그를 승인하지 않는다.
3. 배포 대상의 공개/서버 환경 분리, 실제 번들, 지도 출처 노출을 점검한다.
4. 별도 승인된 테스트 계정·메일로 인증과 리디렉션 전체 흐름을 검증한다. 이번 읽기 전용 점검에는 포함하지 않는다.

이 점검으로 변경한 산출물은 이 문서뿐이다. 원격 설정·DB·QA_REPORT.md는 수정하지 않았다.
