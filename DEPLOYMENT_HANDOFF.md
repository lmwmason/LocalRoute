# LocalRoute 실행 환경 인계

## 변경 범위

- `server/index.ts`: 운영 바인딩, 지정 Supabase 프로젝트 검증, 빌드 파일 제공, 알려진 브라우저 경로의 HTML 응답, 실제 404, HTTP 종료 처리.
- `scripts/dev.mjs`: 로컬 바인딩 유지, 개발 서버 중 하나가 실패하면 함께 종료, 종료 신호 및 자손 프로세스 정리.
- `tests/runtime-server.test.ts`, `tests/runtime-process.test.ts`: 로컬 HTTP·브라우저·프로세스 검증.

기존 구현·의존성·QA_REPORT.md는 수정하지 않았다. 원격 DB, 가입, 예약, 외부 유료 API 호출, 실제 배포는 수행하지 않았다.

## 설치와 실행

Node.js 22.12 이상과 잠금 파일 기준 의존성이 필요하다. 모든 명령은 저장소 루트에서 실행한다.

```sh
npm ci --include=dev
npm run dev
```

개발 실행은 API `127.0.0.1:3001`, Vite `127.0.0.1:5173`을 사용한다. 개발 실행기는 자식 환경의 NODE_ENV를 development, HOST를 127.0.0.1, PORT를 3001로 설정해 Vite 프록시와 맞춘다. 운영 플랫폼의 HOST·PORT가 개발 서버를 외부에 노출하지 않는다. Vite 기본 포트가 이미 사용 중이면 Vite가 안내하는 포트를 확인한다.

운영 빌드·실행 명령:

```sh
npm run build
NODE_ENV=production npm start
```

컨테이너에서는 신호가 Node에 직접 전달되도록 다음 명령을 exec 형식의 실행 명령으로 사용하는 것이 좋다.

```sh
NODE_ENV=production node --import tsx server/index.ts
```

현재 npm start는 TypeScript 소스를 tsx로 실행한다. tsx는 기존 devDependency이므로 **운영 실행 이미지에도 개발 의존성을 유지해야 한다**. `npm ci --omit=dev`만으로 구성한 이미지에서는 실행되지 않는다. 이번 작업에서는 의존성 분류를 변경하지 않았다. `npm run build`는 클라이언트를 dist에 생성하며 서버 JavaScript를 별도로 컴파일하지 않는다. 실행 이미지에 dist, server, shared, package.json, 잠금 파일과 설치된 node_modules를 포함한다.

| 설정 | 동작 |
| --- | --- |
| NODE_ENV | production을 명시해야 운영 바인딩과 필수 빌드 검사가 적용된다. |
| PORT | 플랫폼 값 사용. 기본 3001, 정수 1–65535. 잘못된 값은 시작 실패. |
| HOST | 운영 기본 0.0.0.0. IP 주소(IPv6 포함) 또는 localhost 허용. 개발은 127.0.0.1 고정. |
| VITE_DATA_MODE | 기본 demo. live는 스키마·인증·운영 설정 검증 후 사용. 빌드와 실행의 값을 일치시킨다. |

## 환경 설정과 데이터 경계

로컬 환경 파일은 gitignored인 **루트 .env 하나만** 사용한다. .env.example이나 .env.production을 생성하거나 요구하지 않는다. 서버 CLI는 작업 디렉터리와 무관하게 저장소 루트 .env만 읽으며, 이미 주입된 플랫폼 환경 변수를 덮어쓰지 않는다. 운영에서는 플랫폼의 환경 변수 주입 기능을 사용하고 .env를 이미지에 포함하지 않는다.

유일한 DB 프로젝트는 `pjdawapasozsrpnrtsfx`, URL은 `https://pjdawapasozsrpnrtsfx.supabase.co`다. SUPABASE_URL과 VITE_SUPABASE_URL 중 설정된 어느 하나라도 다른 프로젝트라면 demo에서도 시작을 거부한다. 확인된 DB 리전은 ap-south-1이며 이 작업은 리전을 변경하거나 원격 상태를 조회하지 않았다.

demo 실행에는 실제 키가 필요 없다. live 저장 기능에는 지정 프로젝트 URL, 공개 클라이언트 키(VITE_SUPABASE_PUBLISHABLE_KEY 우선, VITE_SUPABASE_ANON_KEY 대안), 서버 전용 SUPABASE_SECRET_KEY 또는 SUPABASE_SERVICE_ROLE_KEY가 필요하다. 기존 readConfig는 live 키가 누락되면 변수 이름만 안내하고 저장 기능을 비활성화한다. live 모드 표시는 DB 연결 성공이나 준비 완료를 의미하지 않으므로 출시 전 별도 확인이 필요하다.

VITE_ 설정은 공개 정보이며 빌드 시 번들에 들어간다. 실행 시 환경 변수만 변경해도 이미 빌드된 브라우저 설정이 바뀌지는 않는다. 서버 비밀 키, Gemini·HeyYumi·Kakao 서버 키는 VITE_ 변수에 넣지 않는다. 선택 공급자 기능은 기존 server/config.ts의 키·기능 플래그·약관 확인 조건을 모두 충족해야 켜진다. 이번 실행 변경은 기능 사용 승인을 대신하지 않는다. 환경 전체 출력이나 키 값 로깅 없이 변수 이름과 준비 상태만 확인한다.

## HTTP 제공과 종료

운영에서는 dist/index.html이 없으면 설명과 함께 시작에 실패한다. 같은 HTTP 서버가 기존 API와 정적 빌드를 제공한다. /plan, /discover, /legal/privacy 등 알려진 브라우저 경로는 HTML 요청의 직접 접속·새로고침을 지원한다. HTML은 Cache-Control: no-store로 제공한다.

API 네임스페이스 /api와 그 하위의 미등록 경로, 없는 정적 파일, 알 수 없는 페이지, 브라우저 경로에 대한 잘못된 메서드 요청은 HTML 성공 응답으로 대체하지 않는다. JSON 404를 반환한다. 브라우저 경로를 추가할 때 server/index.ts의 허용 목록과 실행 테스트도 갱신해야 한다.

SIGINT·SIGTERM 수신 시 HTTP 신규 연결을 중단하고 idle 연결을 닫는다. 진행 중 HTTP 요청은 최대 10초간 기다린 뒤 남은 HTTP 연결을 강제 종료한다. 반복 종료 요청은 같은 종료 작업을 공유한다. 플랫폼 종료 유예 시간은 이보다 길게 설정한다. 개발 실행기는 POSIX 프로세스 그룹에 SIGTERM을 전달하고 최대 12초 후 SIGKILL로 정리한다. 자식 하나의 실패도 다른 서비스를 종료한다. Windows taskkill 대안은 구현했지만 Windows 실행 검증은 하지 않았다.

## 검증 결과

```sh
npx vitest run tests/runtime-server.test.ts tests/runtime-process.test.ts --maxWorkers=1 --hookTimeout=30000
npx eslint server/index.ts scripts/dev.mjs tests/runtime-server.test.ts tests/runtime-process.test.ts
npm run typecheck
npm run build
```

- 신규 테스트 2개 파일, **14개 통과**. 담당 ESLint 통과. 담당 diff 공백 검사 통과.
- 임시 디렉터리에 실제 Vite 빌드를 만들고 Chromium(390px, 한국어)에서 /plan·/discover·/legal/privacy 직접 접속과 새로고침을 검증했다. 외부 요청과 쓰기 요청은 차단했고 로컬 demo API만 사용했다. 브라우저 오류 없이 통과했다.
- 운영 0.0.0.0 바인딩·PORT, 잘못된 프로젝트·누락 빌드·잘못된 포트 거부, API/정적 파일/페이지 404, 진행 중 HTTP 요청 배출과 제한 시간 종료를 검증했다.
- 실제 서버 CLI의 SIGINT·SIGTERM 후 정상 종료와 포트 재사용, 개발 자식·손자 프로세스 정리, 종료에 응답하지 않는 자식 강제 종료, 자식 실패 시 함께 종료, 오류 로그의 시험용 비밀 값 비노출을 검증했다.
- 최신 전체 typecheck와 npm run build는 **범위 밖 src/photos/prepare-upload.ts의 context/blob null 타입 오류**로 실패했다(TS18047, TS2322). 해당 파일은 수정하지 않았다. 위 Vite 브라우저 검증은 타입 검사와 별개의 검증이며 전체 빌드 통과를 뜻하지 않는다. 이 오류 해결 후 두 전체 명령을 다시 실행해야 한다.

참고: Node 공식 [HTTP 종료 API](https://nodejs.org/api/http.html#serverclosecallback), [자식 프로세스 신호](https://nodejs.org/api/child_process.html#subprocesskill).
