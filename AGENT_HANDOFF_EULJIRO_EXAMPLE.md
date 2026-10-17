# 을지로 실제 장소 공개 시연 일정

2026-10-17. 사용자 요청의 `hidemeplease euljiro`를 **하이드미플리즈 을지로점**으로 확인했다. App/main/planner routes, 예약 플래그와 원격 DB는 변경하지 않았다. 검증 시점의 예약 플래그·접근 확인·이용조건 확인은 모두 false였다. 키 존재는 권한이나 무료 이용의 증거가 아니다.

## 앱 연결

- 경로: `/examples/euljiro` (`shared/euljiro-example.ts`의 `euljiroExamplePath`).
- 컴포넌트: `src/examples/EuljiroExamplePage.tsx`의 default export. 기존 `I18nProvider`와 React Router 안에서 렌더한다. 공개 catalog GET으로 이름·주소·출처 URL이 모두 정확히 일치하는 단 하나의 canonical UUID를 찾는다. 조회 장애여도 예시는 그대로 표시하며, 미확인 연결은 만들지 않는다. 별도 인증 요구·저장·LP 작업이 없다.
- 선택 인수 `canonicalPlaceIds?: Partial<Record<'wooraeok' | 'hidemeplease-euljiro' | 'tapgol-park', string>>`. 실제 DB import 결과의 정확한 UUID를 넘기면 해당 `/places/:id` 링크가 표시된다. 잘못된 UUID나 미확인 값은 링크를 만들지 않는다. 샘플의 source key를 LocalRoute UUID나 HeyYumi ID로 사용하지 않는다.
- 지도와 정류장 선택을 동기화하고, 개인정보 없는 예시 URL 복사를 지원한다. 사진·후기·예약은 생성하지 않는다.

## 확인한 실제 장소와 위치

| 장소                    | 확인한 주소                 | 대표 지도핀(WGS84)            | 근거                                                                                                                                      |
| ----------------------- | --------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| 우래옥                  | 서울 중구 창경궁로 62-29    | 37.5681902336, 126.9987367702 | [서울 공식 관광정보](https://korean.visitseoul.net/citycenter/%EC%9A%B0%EB%9E%98%EC%98%A5-Wooraeok/KOP003207)의 주소 및 지도 코드         |
| 하이드미플리즈 을지로점 | 서울 중구 을지로11길 33 2층 | 37.5679039, 126.99073307      | [운영사 공식 주소](https://hidemeplease.xyz/)와 [소유자 공간 소개](https://www.spacecloud.kr/space/59739)의 주소·JSON-LD 지도핀 교차 확인 |
| 탑골공원                | 서울 종로구 종로 99         | 37.571236, 126.988331         | [서울 공식 관광정보](https://korean.visitseoul.net/area/%ED%83%91%EA%B3%A8%EA%B3%B5%EC%9B%90/KOP001577)의 주소 및 지도 코드               |

대표 핀은 방문객 출입구나 접근 가능한 보행 경로를 증명하지 않는다. 데이터 검토 기록 시각은 `2026-10-17T05:15:37Z`다. 현재 영업·임시 휴무·대기·예약 가능성은 unknown/null로 유지했다. 공개 페이지의 일반적인 영업시간을 특정 여행 날짜에 검증된 영업 사실로 옮기지 않았다. 사진을 다운로드하거나 재사용하지 않았다.

## 일정 의미

날짜 미지정, 한국 시간의 사전 작성 예시다. 11:30–12:30 점심 → 13:15–14:15 카페 휴식 → 14:45–15:30 공원 방문. 각 45분/30분 공백은 계획에 예약한 이동·대기 여유이며, 실제 조회한 여행 소요시간이나 도착 보장이 아니다. Gemini 생성·개인화·실제 여행·현지인 방문 후기를 주장하지 않는다. 금액은 0 LP이고 계정·LP 원장에 접근하지 않는다.

## 예약 확인 결과 및 차단 조건

- 공식 [API reference](https://heyyumi.ai/developers/api-reference)는 개별 장소의 `yumiReservable === true`를 직접 예약 지원의 조건으로 설명한다. 검색 core만으로 이 사실이나 빈 좌석은 확인할 수 없다. 최초 요청은 pending이며 provider 확인 전 확정이 아니다.
- café의 **HeyYumi ID, `yumiReservable`, 계정 예약 생성·조회 권한은 확인되지 않았다**. 공식 API에 별도의 예약 권한 확인 endpoint는 문서화되어 있지 않다. 회사 주소가 같거나 검색에 잡히는 사실로 예약 지원을 추정하지 않는다.
- [현재 요금](https://heyyumi.ai/pricing)은 제품용 API와 개인용 MCP 요금을 구별하고, [약관 4-1](https://heyyumi.ai/legal/terms)은 무료 평가/프로토타입과 제품 탑재·상업 이용 및 별도 데이터 라이선스를 구별한다. 계정별 비용·권한·라이선스가 검증되지 않아 인증된 core 검색조차 수행하지 않았다. 예약 POST/sandbox/live-status 요청도 전혀 수행하지 않았다.
- 확인된 Spacecloud 링크는 **대관** 안내다. 일반 좌석 예약·특정 시각 좌석의 보장이 아니며 LocalRoute가 결제/예약을 수행하지 않는다. 버튼은 자동 예약 미확인으로 비활성화되어 있다.
- 다음 단계는 계정 계약·요금·권한 확인 후 서버에서 이름/주소가 일치하는 core 1회 검색으로 실제 HeyYumi ID를 확인하는 것이다. 파트너 지원을 판단하려면 별도 허가된 contact_hours 조회가 필요하다. 실예약은 명시적인 여행자 동의가 있을 때만 기존 예약 모듈에서 수행한다.

## DB import 준비

`scripts/data/euljiro-example-places.json`은 기존 importer 계약에 맞는 3행이다. dry run은 통과했다. 원격 쓰기는 통합 담당자가 별도로 실행한다.

```sh
rtk proxy ./node_modules/.bin/tsx scripts/import-verified-places.ts scripts/data/euljiro-example-places.json --dry-run
```

`--apply`는 이 담당 작업에서 실행하지 않았다. import 후 반환된 UUID를 `canonicalPlaceIds`에 전달한다. 사진·후기·예약 ID·방문 증거를 import하지 않는다.

## 검사

정적 데이터 검사는 정확한 café 지점/출처, unknown 예약·시간, 0 LP, 중복 없는 정류장과 근거리 순서, 식사 체류·여유 구간, import 계약을 검증한다. 브라우저 검사는 독립 fixture에서 실제 컴포넌트를 열고 360/390/1440px의 한영 화면, 지도 선택 동기화, 공개 링크 복사, 비활성 예약, UUID 연결, 44px·가로 넘침·클릭 가림·uncaught 오류와 쓰기 요청 없음을 확인한다. 외부 지도 요청은 차단하고 API·DB·예약을 호출하지 않는다.

실행 명령:

```sh
rtk npm test -- tests/euljiro-example.test.ts tests/euljiro-example-browser.test.ts --maxWorkers=2
```

최종 관련 검사 **2개 파일 7개 테스트 통과**(브라우저 3개는 각각 한영을 반복해 실제 6개 화면 조합 검사), 11.05초. 긴 지도 말풍선이 클릭을 가리는 문제가 확인되어 샘플 지도만 44px 번호 핀으로 수정하고 전체 행렬을 다시 통과했다. 접속 가능한 모든 장소명이 접근성 이름으로 유지된다. 담당 eslint와 import dry run도 통과했다. 다른 담당자가 전체 타입/lint/배포 검증을 진행하므로 이 문서는 배포나 실예약 성공의 증거가 아니다.
