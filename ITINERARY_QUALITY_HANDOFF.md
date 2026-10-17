# 일정 생성·검증 검토 인계

검토일: 2026-10-17, Asia/Seoul. PRD·AGENTS·QA_REPORT와 현행 생성기/검증기/후보 수집/이동 검증/LP 원장 및 기존 테스트를 확인했습니다. 검토 중 다른 작업이 반영되어 최종 재검증은 HEAD `5d76a60` 시점 코드를 기준으로 수행했습니다. 이 문서만 작성하며 제품 코드·기존 테스트·마이그레이션·QA_REPORT.md는 수정하지 않았습니다.

실제 Gemini·Kakao·HeyYumi·Supabase 원격 요청이나 유료 API 호출은 수행하지 않았습니다. 추가 재현은 `/tmp`의 일회성 스크립트, 주입한 모의 제공자, 로컬 HTTP, 폐기한 메모리 PGlite만 사용했습니다. 아래 LP 수치는 가상 테스트 잔액이며 실제 LP 지급/청구가 아닙니다.

## 결론과 확인된 정상 동작

일정 구조·기본 시간·동일 ID 중복·실제 조회된 이동 소요시간과 간격 충돌·보통의 요청 멱등성은 방어하고 있습니다. 검증 실패와 원자 저장 실패의 무차감도 모의 HTTP→실제 메모리 SQL 연결에서 확인했습니다. 다만 **과거 핀 후보 재사용, 운영 영업시간 입력 누락, 취향 판정, 일부 식사 시간대 누락, 가격 정책 변경 후 재조회, SQL NULL 검증**에 보완이 필요합니다.

| 요청 항목            | 확인 결과                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 식사 시간            | 점심 시작 11:00–14:00, 저녁 시작 17:30–20:30, 식사 최소 45분 및 일일 범위 검증. 일부 시간대는 식사 0개도 통과: IQ-05                                                           |
| 휴무·미확인 영업시간 | 날짜별 `hours: []`는 휴무로 거부하고, 전체 체류가 하나의 영업 구간 안에 있어야 함. 미확인은 `HOURS_UNKNOWN` 경고. 운영 데이터 전달과 최신성은 IQ-01/02                         |
| 이동 시간            | 인접 정류장별 실제 조회 소요시간+추가 buffer가 빈 시간을 넘으면 거부. endpoint/mode 및 5분 freshness 검사. 미조회 이동은 경고로만 허용하며 출발/복귀 구간은 입력·검증하지 않음 |
| 중복 장소            | 동일 candidateId는 날짜를 넘어 중복 거부. 서로 다른 공급자 ID로 표현된 동일 물리 장소는 IQ-06                                                                                  |
| 사용자 취향          | 정확한 태그 문자열의 전체 일정 OR 매칭이며 선택 차원의 구분이 없음. 음식 여행만 선택하면 오히려 실패할 수 있음: IQ-07                                                          |
| 실패 시 LP 무차감    | 잘못된 모델 후보 → HTTP 422, 원장 차감 0, 요청 failed. 저장 도중 오류도 결과·차감 rollback 후 failed 확인                                                                      |
| 중복 청구 방지       | 동일 요청 재전송/중복 finalize 및 commit 후 응답 유실에서 결과 1개·차감 100 LP 1회. 정책 변경 후 replay 실패는 IQ-04. 독립 Postgres 세션 경합은 미검증                         |

## 확인된 결함

### IQ-01 · P1 · 핀 재생성이 현재 후보에서 제거된 장소를 되살림

위치: `server/planner/routes.ts:170`의 pin 수집 및 `routes.ts:198`의 catalog 병합. 저장 일정의 `original.catalog`에서 뽑은 `pinnedCatalog`를 최신 local/provider 후보 뒤에 넣고 Map을 만들기 때문에 동일 ID이면 과거 snapshot이 이깁니다. 최신 후보에 아예 없어도 핀으로 다시 추가됩니다. 생성기의 pin 검사는 이 병합된 catalog 안에 ID가 있는지만 봅니다.

재현: 현재 `repository.places()`와 활동 검색을 모두 빈 배열로 주입하고, 과거 저장 일정의 5개 정류장을 pin으로 지정했습니다. 실제 `attachPlanner`에 로컬 HTTP 요청을 보내자 **HTTP 201, evaluation.valid=true, stopCount=5**, `status → reserve → get → finalize`를 호출했습니다. 현재 공급처에서 재확인할 수 없는 모든 장소가 과거 snapshot만으로 승인됩니다. SQL 원장은 이 재현에 연결하지 않았으므로 실제 차감까지 발생했다고 주장하지 않습니다.

추가 재현: 최신 활동 후보 3개에 해당 날짜 `hours: []`를 넣어 휴무로 돌려주어도, 과거 pinnedCatalog가 이를 덮어 **HTTP 201, valid=true, CLOSED_VENUE 오류 0개**였습니다. 단순히 최신 검색 결과가 부족한 사례뿐 아니라 명시적인 최신 휴무 근거와 충돌하는 사례도 확인했습니다. 데이터는 모두 합성 fixture입니다.

필요한 변경/테스트: pin은 시간·선택 유지 요청이어야 하며 최신 사실/공개 상태를 덮는 수단이면 안 됩니다. 최신 휴무/폐업 의심, 추천 비활성·장소 비공개, 오래된 source를 주입하고 **중단 또는 명시적인 확인 실패 + LP 무차감**을 검증해야 합니다. 최신 closed hours와 과거 open/unknown hours가 충돌할 때 과거 값이 이기지 않는 테스트가 필요합니다. 편집 PUT도 `original.catalog`만 재사용하므로 동일한 최신 사실 재검증 범위를 정해야 합니다.

### IQ-02 · P1 · 실제 후보 수집에는 영업시간·휴무 사실 연결이 없음

위치: `server/repository.ts:283`의 places 조회, `shared/domain.ts`의 Place, `server/planner/catalog.ts:20`의 localCandidates 및 KakaoActivities 변환, `shared/planner.ts:301`의 hours 검사.

검증기는 날짜별 hours를 받을 수 있지만 현재 Place 조회/타입과 두 운영 후보 변환 경로는 hours를 공급하지 않습니다. 장소 사실의 hours나 외부 식별 레코드의 상태·최신성을 읽는 연결도 이 조회에는 없습니다. 일회성 변환 재현에서는 `hours: {'2026-11-01': []}`를 가진 입력 객체의 local candidate 결과에서 hours가 사라졌습니다. 이 입력 확장은 현행 Place의 정식 계약에도 없으므로, 합성 closed-hours 단위 테스트 통과와 운영 경로의 휴무 검증 가능성을 동일시하면 안 됩니다.

필요한 변경/테스트: 승인된 사실/허가된 제공자 데이터 → 정형 날짜별 영업 구간/휴무 예외 → 후보 → 검증기까지 연결한 오프라인 통합 테스트가 필요합니다. 휴게 시간, 날짜별 휴무, 체류 중 폐점, last service/last order, 신뢰할 수 없는 오래된 사실도 포함하세요. last-order 정보는 현재 Candidate 계약에 없습니다. 모르는 사실은 계속 미확인으로 표시해야 하며 임의 영업시간으로 채워서는 안 됩니다. 실제 DB에 특정 휴무 사실이 존재하는지는 이번 검토에서 확인하지 않았습니다.

### IQ-03 · P2 · 원장 SQL의 일부 필수값 검사가 NULL에서 열림

위치: `supabase/migrations/20261017024600_planner_entitlements.sql:86`, `:111`.

`expectedCost <> currentCost`, `policyVersion <> currentVersion`, `provenance <> 'gemini'`, `jsonb_array_length(catalog) < 2`가 필드 누락 시 NULL이 됩니다. 다른 조건이 false이면 PL/pgSQL IF가 오류를 발생시키지 않습니다.

메모리 DB에서 확인한 결과:

- `reserve`에 `{input:{}, consent:true}`만 전달해도 가격·정책 버전 없이 100 LP hold가 생성됩니다.
- 정상 reserve 후 `finalize`에 `{result:{evaluation:{valid:true}}}`만 전달해도 provenance/catalog/schedule 없는 결과가 저장되고 **100 LP 차감**됩니다.

경계: RPC는 service_role 전용이고 정상 HTTP 경로는 zod와 서버 생성 metadata를 사용합니다. 이 재현은 **브라우저에서 원장 우회가 가능하다는 증거가 아니며**, 잘못된 내부 호출에 대한 DB 방어층 결함입니다. 서버 검증 책임을 SQL로 모두 옮기라는 뜻도 아닙니다.

필요한 테스트: 가격/정책/provenance/catalog의 missing·null·잘못된 타입·빈 배열을 각각 거부하는 SQL 부정 테스트. 실패한 finalize에 결과/음수 원장이 없고, orchestrator의 fail 처리 뒤 hold도 풀리는지 확인해야 합니다. 비교는 NULL까지 포함해 닫힌 실패가 되도록 구현 담당자가 정리해야 합니다.

### IQ-04 · P2 · 정책 변경 후 이미 완료된 동일 요청 replay가 실패함

위치: LP migration `:86`의 현재 정책 검사 순서가 기존 요청 조회 `:87`보다 앞섬. HTTP 연결은 `server/planner/routes.ts:122`.

재현: 100 LP / pilot-v1로 저장·차감한 뒤 테스트 정책을 120 LP / pilot-v2로 바꿔 **같은 requestId와 원문**을 다시 전송했습니다. SQL은 `22023 Price confirmation required`, 실제 모의 HTTP는 **400**이었습니다. 원래 요청의 상태는 ready이고 원장 차감 총액은 100 LP로 그대로입니다.

기존 상태 GET으로 결과를 읽는 길은 남아 있으며, 이 재현에서 중복 차감은 발생하지 않았습니다. 그러나 commit 후 응답 유실 시 동일 POST로 결과를 회수한다는 멱등 계약이 정책 변경에 따라 깨집니다.

필요한 테스트: 완료/진행 요청 replay는 원래 payload와 대조하고 원래 결과를 반환하되 변경된 payload는 거부해야 합니다. 가격·정책 변경 후 동일 payload, 다른 payload, 다른 사용자, 월 경계 사례를 나누어 결과/원장 수가 늘지 않는지 확인하세요. 새 요청의 새 가격 동의는 별도로 유지해야 합니다.

### IQ-05 · P2 · 점심 시간대를 지나는 일정도 식사 0개로 승인됨

위치: `shared/planner.ts:348`, `:350`; 생성기의 선행 restaurant 개수 검사는 선택된 식사 수 검사가 아님.

점심 필수 조건은 여행 범위가 13:00–14:00 전체를 포함할 때만 적용됩니다. **10:00–13:30**에 10:00–11:00 전시와 11:20–12:20 산책만 넣은 합성 일정은 `valid=true`, `localMeals=0`으로 통과했고 모의 `generateValidated`도 이를 받아들였습니다. 저녁도 19:30–20:00을 포함하지 않는 범위에 비슷한 공백이 있습니다.

필요한 테스트/정책 결정: 식사 시간대와 여행 범위의 교집합, 최소 식사 체류, 이동 여유를 기준으로 필수 식사를 어떻게 정할지 명시해야 합니다. 이 검토가 임의의 새 식사 정책을 확정하는 것은 아닙니다. 점심 직전 종료·점심 도중 종료·점심 후 시작 및 저녁 대응 경계를 테스트하고, 필수 식사를 넣을 수 없으면 유료 승인 대신 실행 가능한 실패로 처리해야 합니다. 최소 45분/시작 범위/체류 전체 영업시간 검사는 별도로 유지하세요.

### IQ-06 · P2 · ID가 다른 동일 물리 장소는 중복 검사를 통과함

위치: `shared/planner.ts`의 `seen` Set, `server/planner/routes.ts:198`의 ID별 Map, `server/planner/catalog.ts`의 local UUID / `kakao:<id>` 식별 분리.

동일 이름·주소·좌표인 공원 후보를 local ID와 Kakao ID 두 개로 표현하고 서로 다른 정류장에 넣자 **valid=true**였습니다. 현재 테스트의 DUPLICATE_STOP은 동일 문자열 ID만 검증합니다.

필요한 테스트: 이미 검증된 external ID ↔ 내부 canonical ID 매핑을 가진 동일 장소가 서로 다른 경로에서 들어오는 경우 중복을 제거해야 합니다. 이름만 비슷한 지점/인접 시설을 잘못 합치지 않는 반례도 필요합니다. 검증되지 않은 근접/유사 이름을 자동 병합하라는 뜻은 아닙니다. 날짜를 넘는 모든 동일 ID 재방문도 현재는 금지하므로 다일 여행의 의도적 재방문 정책은 별도 확정 대상입니다.

### IQ-07 · P2 · 취향 태그의 의미 불일치와 전체 OR 검사

위치: `shared/planner.ts:337`, `:364`; `server/planner/catalog.ts:10`의 categoryTags; places 결과의 `tags: []`.

두 방향을 재현했습니다.

- 음식 여행: `purpose:'food', activities:['food'], foodTypes:[]`로 실제 추천 식사 2개가 있는 기본 일정을 검사하면 `PREFERENCES_NOT_MATCHED`로 실패합니다. restaurant 종류/`korean` 등 세부 음식 태그와 일반 활동 `food`가 연결되지 않습니다. 운영 local 후보도 빈 원본 태그에 세부 음식 태그만 추가하므로 같은 의미 공백이 있습니다.
- 문화 여행: history 후보를 카탈로그에 남겨두고 `purpose:'culture', activities:['history'], foodTypes:['japanese']`를 요청했습니다. history 정류장이 없더라도 한 음식점의 japanese 태그 하나로 `preferenceMatches=1`, **valid=true**입니다. purpose·companions·budget는 주로 prompt 또는 경고에 머물며 차원별 반영 검사는 없습니다.

필요한 테스트: 일반 food 활동과 식사 종류의 의미 매핑, 활동만/음식만/혼합 선택, 여러 날짜의 반영, 후보가 충분한데 선호 활동을 생략한 경우를 검증하세요. soft preference 전부를 무조건 hard constraint로 만들지는 말고, 차원별 최소 반영/우선순위와 부족 시 설명 정책을 먼저 정해야 합니다.

## 이동 검증과 미확인 정보의 경계

다음은 확인된 동작/미검증 범위이며 그 자체를 거짓 데이터 생성 버그로 판정하지 않았습니다.

- `assessTransport`는 모든 인접 구간의 실제 조회 소요시간과 추가 buffer를 비교하며, 오래되거나 endpoint가 다른 근거를 거부합니다. 기존 관련 테스트가 통과했습니다.
- unknown/disabled/unsupported route는 `ROUTE_UNVERIFIED` 경고만 추가합니다. 일회성 재현에서 모든 4개 구간이 미조회여도 생성 결과는 valid=true였습니다. 이는 이동 가능성을 검증했다는 뜻이 아닙니다. PRD는 불확실성 표시를 허용하므로 **어느 수준의 미확인 결과까지 유료로 제공할지**를 확정하고 표시·동의·실패 정책을 테스트해야 합니다.
- 직선거리·고정 최고속도 및 거리 상한은 도로망, 강/장벽, 환승·대기 시간을 증명하지 않습니다. 조회값은 `lookup_time`이며 여행 날짜/출발 시각의 실시간 정보가 아닙니다. 현재 TransportRequest에는 출발 시각이 없습니다.
- 숙소/출발·복귀 anchor가 TripInput에 없고 정류장 사이만 검사합니다. 복귀까지 보장하는 일정이라고 표시할 수 없습니다. 긴 일정에서 휴식으로 인정하는 gap이 실제 이동으로 소진되는 경우의 테스트도 필요합니다.
- unknown hours를 명시적으로 경고하는 처리는 확인했습니다. 엄격한 known-open 제약을 사용자가 선택하는 계약은 현재 없으며, 미확인을 '영업 중'으로 간주하거나 경고만으로 이를 충족했다고 평가하면 안 됩니다.

## 검증 결과와 우선 추가할 테스트

기존 테스트 실행:

```sh
npx vitest run tests/planner-quality.test.ts tests/planner-boundary.test.ts tests/planner-ledger.test.ts tests/planner-transport.test.ts tests/planner-account.test.ts tests/planner-ai-privacy.test.ts tests/routing.test.ts tests/server.test.ts --maxWorkers=1 --hookTimeout=60000
```

**8개 파일 73개 통과**. 이 수치는 전체 프로젝트 suite나 실제 Gemini 일정 품질 평가를 뜻하지 않습니다. PGlite의 동시 요청은 한 연결에서 직렬화되므로 실제 독립 Postgres 세션의 경합 검증을 대체하지 못합니다. 새 정식 테스트 파일은 요청에 따라 추가하지 않았습니다.

추가 일회성 모의 HTTP + 메모리 원장 확인:

| 주입 사건                                       | 관찰                                                                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 존재하지 않는 모델 candidate ID, 2회 품질 실패  | 422 SCHEDULE_QUALITY_FAILED, 상태 failed, 음수 원장 0/차감 0                                |
| finalize commit 후 응답 유실 + 동일 POST replay | 200/200, 저장 일정 1개, 음수 원장 1개/차감 총 100 LP                                        |
| planning.charged audit 삽입에서 늦은 오류       | 503, 새 요청 failed, 기존 일정 1개·차감 100 LP에서 증가 없음: 새 일정/새 차감 전체 rollback |
| 위 완료 건의 가격/정책 변경 후 replay           | 400 Price confirmation required, 기존 차감 100 LP 유지: IQ-04                               |

회귀로 정식화할 우선순위:

1. IQ-01의 stale pin/편집, IQ-02의 사실→후보→검증 연결 및 영업 구간 경계.
2. 위 HTTP→원장 4개 fault 시나리오와 IQ-03의 missing/null 부정 입력. Gemini timeout/429/5xx·거절·잘린 JSON도 모의 입력으로 추가하고 무차감·hold 해제를 확인.
3. 80 promo + 50 earned의 100 LP 청구가 -80/-20 두 행으로 정확히 한 번 기록되는지, 잔액 부족 99 LP, 10분 hold 만료·월말 promo 만료 전후, fail RPC/status RPC 자체 오류와 재시도. 두 원장 행을 두 번 청구로 오판하지 말고 event별 합계를 검사.
4. 서로 다른 DB 연결의 동일 key / 서로 다른 key 동시 reserve·finalize, 결과 저장/원장 각각의 중간 실패, 소유권·변경 payload·stale revision 유지. 로컬 단일 연결 테스트와 독립 세션 결과를 구분.
5. IQ-05/06/07의 식사 경계·canonical 중복·취향 차원 반영 및 다일 일정. 영업 구간/휴게·last-service 전체 체류, 실제 이동 후 남는 휴식 시간도 포함.

재현 스크립트와 로그는 `/tmp/localroute-itinerary-{quality,ledger,pins,http-ledger}-probe.mts` 및 테스트 로그에만 남겨 두었습니다. 임시 파일은 영구 산출물이 아니므로 위 입력·결과와 소스 위치를 기준으로 구현 담당자가 정식 테스트를 추가해야 합니다. 코드 수정·마이그레이션 적용·유료 계획 활성화는 수행하지 않았습니다.
