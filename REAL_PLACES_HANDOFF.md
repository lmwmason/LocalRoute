# 실제 장소 조사 인계

2026-10-17 조사. 충주에서 테스트한다는 추가 요청에 따라 **충주 20곳(식당 8, 관광·문화·체험 12), 서울 성수동 6곳(식당 3, 관광·문화 3), 총 26곳**을 `scripts/data/verified-places.json`에 수집했다. 모두 실제 공개 장소 자료이며 가상 매장이나 작성한 방문 후기는 없다.

## 자료의 상태

이 파일과 JSON은 출처를 추적할 수 있는 조사 자료다. 앱에 연결하거나 DB에 등록하지 않았다. 등록 요건인 기여자 촬영 사진, 인적 검토, 제공자 이용조건 확인이 완료되지 않아 모든 장소의 `publication.ready`는 `false`다. 영업·개방 여부나 현지인 추천을 보증하지 않는다.

AGENTS.md·PRD.md에 따라 장소의 객관적 사실과 기여자 추천을 구분했다. 이름·주소·좌표를 중심으로 짧은 사실만 추출했고, 공식 사이트의 소개문·후기·사진을 복제하지 않았다. HeyYumi ID나 LocalRoute 내부 UUID는 만들지 않았다. JSON의 `researchId`는 이 조사 파일 안에서만 쓰는 식별자이며 `externalIds`의 Kakao ID와 구분한다.

## 확인 방법과 시각

- Kakao의 공개 검색 결과에서 후보 URL을 찾고, **26개 실제 장소 페이지를 각각 HTTP GET으로 읽었다.** `og:title`, `og:description`으로 이름·주소를 확인했다. 키나 로그인 없이 공개 페이지를 읽었으며 Kakao REST API는 호출하지 않았다.
- 좌표는 같은 장소 페이지의 `meta[name="twitter:image"]` URL에서 `srs=wgs84`와 `m=경도,위도`를 확인해 추출했다. 이미지 URL은 요청하지 않았고 사진·정적 지도 이미지를 내려받지 않았다. JSON에는 축을 명시한 `latitude`, `longitude`, `crs: EPSG:4326`으로 기록했다.
- 관광기관 상세 페이지와 운영기관 안내를 대조했다. 대한민국 구석구석의 일부 상세 정보는 공식 페이지가 사용하는 공개 `/call` 조회 요청(`TOUR_CONTENT_BODY_DETAIL`)으로 확인했다. POST 방식이지만 콘텐츠 읽기 요청이며 등록·좋아요·예약·계정 API는 호출하지 않았다. 재확인할 URL·폼은 각 `sources[].readRequest`에 있다.
- 원문 본문을 직접 읽은 경우와 검색 색인만 확인한 경우를 `accessMethod`로 구분했다. 충주박물관·활옥동굴·고구려천문과학관·세계무술박물관의 보조 공식 자료 4건은 공식 도메인의 검색 색인을 확인했지만 직접 본문 요청은 시간 초과여서 재확인이 필요하다. Kakao 장소 페이지의 직접 조회 성공과 혼동하면 안 된다.
- 국립충주기상과학관은 공식 웹 문서로 주소를 확인했다. 별도 Node GET은 시간 초과여서 `latestDirectFetch`에 남겼다. 수도박물관은 서울아리수본부의 운영기관 안내를 직접 읽었다.
- 각 장소의 `checkedAt`은 Kakao 공개 페이지 응답을 읽은 UTC ISO 8601 시각이고, 보조 출처에도 확인 시각을 따로 기록했다. 현장 방문일·사업자 확인일·원문 갱신일과 다르다. Kakao 확인 범위는 **2026-10-17 13:51:09~13:52:42 KST**다.

`sources[].observed`는 출처별 표기를 보존한다. `address.value`는 Kakao의 약칭·층수 포함 원문 표기이고 `officialValue`는 공식 자료의 별도 표기다. 도로명과 지번이 같은 필지를 뜻한다고 자동 판단하지 않았다. 주소 검색 좌표나 지역 중심점으로 빈 값을 채우지 않았다.

## 좌표·주소에서 주의할 항목

| 장소                         | 확인 결과와 남은 확인                                                                                                                                                                         |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 대성갈비                     | 공식 최신 상세와 Kakao가 상원1길 26으로 일치한다. 과거 서울숲길 주소를 채택하지 않았다.                                                                                                       |
| 숲속장수촌 본점              | 오래된 공식 코스 기사에는 금제로 28이 있으나 최신 공식 상세와 Kakao는 쇠저울1길 36으로 일치한다. 이전 이력 자체는 확인하지 않았다.                                                            |
| 메밀마당·대장군·메밀면묵밥리 | 공식 자료와 Kakao의 띄어쓰기·지점명·식당 접미사가 다르다. 도로명·건물번호를 대조하고 출처 명칭을 각각 보존했다.                                                                               |
| 서울숲                       | 공식 대표 핀과 Kakao 핀 사이 약 394m. 공식 도로명 주소와 Kakao 지번을 보존했다. 공원 대표 핀을 방문객 출입구로 쓰면 안 된다.                                                                  |
| 오대호아트팩토리             | 공식 핀과 Kakao 핀 사이 약 78m. 같은 가곡로 1434 안내지만 출입구 위치는 확인하지 않았다.                                                                                                      |
| 탄금대                       | 공식 핀과 Kakao 핀 사이 약 242m. 도로명·지번 및 유적 영역 핀의 차이를 보존했고 입구를 확정하지 않았다.                                                                                        |
| 충주세계무술박물관           | 공식 충북 무장애 관광 색인은 남한강로24, Kakao는 남한강로 26. 주소 차이가 미해결이므로 정확한 입구 안내용으로 사용하지 않는다.                                                                |
| 비내섬                       | Kakao는 소태면 복탄리 908. 관광 안내의 앙성면 조천리 접근 경로와 동일 필지로 합치지 않았다. 섬 대표 핀이며 출입 지점·현재 출입 가능 여부는 별도 확인이 필요하다.                              |
| 활옥동굴·수도박물관          | 공식 도로명 주소와 Kakao 지번을 각각 기록했다. 법적 필지 대응·출입구·체험 운영 여부는 미확인이다.                                                                                             |
| 수안보물탕공원               | Kakao의 공원 핀과 공식 수안보온천 관광특구의 주정산로 12를 대조했다. 관광특구 전체와 공원을 같은 객체로 합치지 않았다. 검색에서 나온 관광협의회 사무실 핀은 제외했다. 족욕 운영은 미확인이다. |

핀 간 거리는 출처의 위·경도 표기로 계산한 Haversine 근사치다. 50m는 이번 자료의 검토 표시 기준일 뿐 제품의 자동 병합 기준이나 위치 정확도 보증이 아니다. 좌표를 평균하지 않았다. 모든 `navigationEntranceCoordinates`와 `surveyedAccuracyMeters`는 `null`이다.

## 영업시간과 사진

모든 `openingHours`는 `null`, `operatingStatus`는 `unverified`다. 공식 관광 자료에도 과거 작성 정보·계절별 운영·서로 다른 시간이 있어 현재 운영 시간으로 확정하지 않았다. `null`은 24시간 영업이나 폐업을 뜻하지 않는다. 관람·카약·천체관측·족욕·전시 제공 여부와 요금, 예약 가능 여부도 추정하지 않았다.

모든 `photos`는 빈 배열이다. 해당 장소의 사진이 공개되어 있어도 상업적 재사용·변경·재배포 권리까지 확보된 것은 아니다. 특히 [메밀마당이 포함된 공식 기사](https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=e5484a1a-cc5c-4e5b-b11d-cf8429915d4a)는 글·사진의 무단 이용을 금지하고 있다. 상세 응답의 `imgType=Public`도 재사용 라이선스로 해석하지 않았다. 사진 출처·라이선스·허락 근거는 모두 `null`로 두었다. 대체 스톡 사진이나 생성 사진을 붙이지 않았다.

## 시연과 후속 연결

충주 자료는 중앙탑권, 수안보권, 앙성권, 도심·칠금권, 동량면, 목벌동에 분산되어 있다. 도심 식사와 실내 박물관·과학관, 역사·자연 탐방 등 다양한 입력을 시험할 후보로 쓸 수 있다. 모두를 하루 일정에 넣을 수 있다는 뜻은 아니며 실제 이동 시간·개방 시간은 이 자료에 없다. 서울 시연은 성수동 식당과 서울숲·수도박물관·성수연방으로 범위를 제한했다.

현재 앱이 JSON을 읽는 로더는 추가하지 않았다. 후속 통합자는 이름·종류·출처와 “공개 자료 조사 / 방문 확인 없음” 상태를 표시하고, 미확인 영업시간을 일정의 확정 제약으로 사용하지 않아야 한다. 사진이 없는 빈 상태를 유지해야 한다. 이 자료로 추천 후기·현지인 평점·방문 실적·LP 보상을 만들면 안 된다.

운영 반영 전에는 주소 차이와 출입구를 인적으로 확인하고, 실제 기여자 촬영 사진과 검토 절차를 갖추며, 공급자별 저장·표시·상업적 재사용 조건을 확인해야 한다. 공개 페이지 열람 성공은 재사용 계약 확인을 대신하지 않는다. 이 조사만으로 `KAKAO_TERMS_VERIFIED` 같은 운영 플래그를 승인하지 않는다.

유료 API·계정 생성·예약·원격 DB 변경·배포는 하지 않았다. `.env`와 비밀 키도 사용하지 않았다. QA_REPORT.md와 기존 구현 파일을 수정하지 않았다.

## 검증

JSON 구문, 26건 및 권역/종류별 수량, 조사 ID·Kakao ID 중복, URL·시각·출처 참조, 좌표 축과 지역 범위, 미확인 시간·사진·추천 공백을 로컬에서 검사했다. 실제 앱 실행이나 방문 검증을 통과했다는 뜻은 아니다.

## 장소별 근거

아래 공식 근거와 Kakao 원문은 JSON의 출처별 관찰 값·확인 시각으로 연결된다. 색인만 확인한 공식 출처는 JSON에 별도로 표시했다.

| 지역        | 장소                    | 종류                | 공식 근거                                                                                                                                                                                       | 실제 Kakao 장소                                 |
| ----------- | ----------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 서울 성수동 | 대성갈비                | 돼지갈비·한식       | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=48a0552a-2b19-4373-8793-0f119c3ff86a)                                                                                  | [Kakao](https://place.map.kakao.com/12055448)   |
| 서울 성수동 | 성수족발                | 족발·한식           | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=bc0fe900-cf60-4ff5-8acc-418025c625ea)                                                                                  | [Kakao](https://place.map.kakao.com/8416853)    |
| 서울 성수동 | 성수부두                | 해산물·한식         | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=5b34b854-c575-44d5-8df3-ec8676274390)                                                                                  | [Kakao](https://place.map.kakao.com/1282309711) |
| 서울 성수동 | 서울숲                  | 도시공원            | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=02f56ab2-5e53-470f-8ec3-95cf8fb88aa4)                                                                                  | [Kakao](https://place.map.kakao.com/11331488)   |
| 서울 성수동 | 수도박물관              | 박물관              | [서울아리수본부](https://arisu.seoul.go.kr/home/sub?menukey=7510)                                                                                                                               | [Kakao](https://place.map.kakao.com/10376369)   |
| 서울 성수동 | 성수연방                | 복합문화공간        | [한국관광공사](https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=78ac1b66-81f8-45d8-b987-dd4a217db34d)                                                                                 | [Kakao](https://place.map.kakao.com/1819728691) |
| 충주시      | 메밀마당 충주중앙탑본점 | 막국수·메밀요리     | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=9d34d695-3e4a-4555-885a-c328c9baa851)                                                                                  | [Kakao](https://place.map.kakao.com/8291326)    |
| 충주시      | 운정식당                | 올갱이해장국·한식   | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=ff7fb6b9-f8e4-47b1-9f6b-f1d92c838e82)                                                                                  | [Kakao](https://place.map.kakao.com/10698086)   |
| 충주시      | 대장군                  | 꿩요리·한식         | [한국관광공사](https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=1f390d1d-6f63-4c6b-8b53-737dc3e1a0b2)                                                                                 | [Kakao](https://place.map.kakao.com/11891870)   |
| 충주시      | 상록수식당              | 버섯전골·한식       | [한국관광공사](https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=1f390d1d-6f63-4c6b-8b53-737dc3e1a0b2)                                                                                 | [Kakao](https://place.map.kakao.com/12800097)   |
| 충주시      | 영화식당                | 산채정식·한식       | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=3a074b6f-56e3-4bf3-a504-ac65b9230f1f)                                                                                  | [Kakao](https://place.map.kakao.com/10641816)   |
| 충주시      | 숲속장수촌 본점         | 백숙·한식           | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=bc4ad83e-e9a2-4b56-b1e8-d9b03feaabbe)                                                                                  | [Kakao](https://place.map.kakao.com/23840178)   |
| 충주시      | 메밀면묵밥리 앙성온천점 | 막국수·묵밥         | [한국관광공사](https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=19c80a5e-fb70-45af-8ffa-f3669746f690)                                                                                 | [Kakao](https://place.map.kakao.com/61123582)   |
| 충주시      | 복서울해장국            | 해장국·한식         | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=c7199f1f-e721-4d2e-a84c-e040efe0471b)                                                                                  | [Kakao](https://place.map.kakao.com/21347061)   |
| 충주시      | 중앙탑사적공원          | 역사공원            | [한국관광공사](https://access.visitkorea.or.kr/opentour/detail.do?cotId=1ec0a252-dd64-4f6d-84c0-f4bea990c3e5)                                                                                   | [Kakao](https://place.map.kakao.com/17697891)   |
| 충주시      | 충주박물관              | 역사박물관          | [충청북도 충북나드리](https://tour.chungbuk.go.kr/www/selectTourCntnts.do?key=60&searchMainSe=ATTR&tourNo=464)                                                                                  | [Kakao](https://place.map.kakao.com/8585447)    |
| 충주시      | 활옥동굴                | 관광동굴·체험시설   | [충청북도 충북나드리](https://tour.chungbuk.go.kr/www/selectTourCntnts.do?key=60&searchMainSe=ATTR&tourNo=2562)                                                                                 | [Kakao](https://place.map.kakao.com/531411391)  |
| 충주시      | 충주고구려비전시관      | 역사전시관          | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=83305ab8-af95-41a8-b129-389de4bddb9a)                                                                                  | [Kakao](https://place.map.kakao.com/8077640)    |
| 충주시      | 충주고구려천문과학관    | 천문과학관          | [충청북도 충북나드리](https://tour.chungbuk.go.kr/www/selectTourCntnts.do?key=60&searchMainSe=ATTR&tourNo=586)                                                                                  | [Kakao](https://place.map.kakao.com/10025826)   |
| 충주시      | 충주자연생태체험관      | 생태체험관          | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=8a6e7ebc-e526-47a3-954c-d35844a21cd7)                                                                                  | [Kakao](https://place.map.kakao.com/9972481)    |
| 충주시      | 충주세계무술박물관      | 무술문화박물관      | [충청북도 네바퀴로떠나는 충북여행](https://freetour.chungbuk.go.kr/www/selectTourCntntsWebView.do?ctgry=4&key=4&pageIndex=7&pageUnit=6&searchCnd=all&searchShowAt=Y&sortTy=RECOMEND&tourNo=625) | [Kakao](https://place.map.kakao.com/14508671)   |
| 충주시      | 오대호아트팩토리        | 미술관·예술체험시설 | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=44ab3132-75a4-4179-b1e7-262db516c677)                                                                                  | [Kakao](https://place.map.kakao.com/1247062613) |
| 충주시      | 비내섬                  | 하천섬·자연탐방     | [한국관광공사](https://korean.visitkorea.or.kr/detail/rem_detail.do?cotid=19c80a5e-fb70-45af-8ffa-f3669746f690)                                                                                 | [Kakao](https://place.map.kakao.com/11495420)   |
| 충주시      | 탄금대                  | 역사유적·자연탐방   | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=cfda5364-2ef5-48cb-90b7-2b55fed9bab7)                                                                                  | [Kakao](https://place.map.kakao.com/11235478)   |
| 충주시      | 수안보물탕공원          | 온천문화공원        | [한국관광공사](https://korean.visitkorea.or.kr/detail/ms_detail.do?cotid=b5650a0c-3f97-4f3b-89cd-e5f0a36cc36c)                                                                                  | [Kakao](https://place.map.kakao.com/17344256)   |
| 충주시      | 국립충주 기상과학관     | 기상과학관          | [기상청 국립충주기상과학관](https://science.kma.go.kr/chungju/company/location)                                                                                                                 | [Kakao](https://place.map.kakao.com/793335766)  |
