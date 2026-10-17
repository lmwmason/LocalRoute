# 운영자 확인 공식 장소 자료 등록

이 등록은 실제 기여자의 현지 추천과 별개인 **운영자가 확인한 공식 장소 사실**을 위한 도구입니다. 가상의 사용자·방문 경험·추천·후기·사진·LP를 만들지 않습니다. 이용자가 장소나 추천을 직접 등록하는 기존 절차의 실제 사진 필수 조건도 바꾸지 않습니다.

## 입력 자료

- 원본 연구 자료 `scripts/data/verified-places.json`은 조사 결과와 미확인 항목을 포함한 참고 문서입니다. 이를 바로 가져오거나 도구에 맞추려고 덮어쓰지 않습니다.
- 실제 가져오기 대상은 검토 후 별도로 만든 `scripts/data/operator-places.json`입니다. 한국관광공사 공식 상세 자료에서 이름·주소·좌표를 직접 확인한 14개 항목을 초기 대상으로 선별했습니다. 선정 근거와 사실 확인은 운영자 검토이며 이 도구가 자동으로 진위를 보증하지 않습니다.
- 가져오기 도구는 웹 검색이나 외부 장소 API 조회를 하지 않습니다. 입력 파일에 사진·영업시간·예약 가능 여부·방문 경험을 추가할 수 없습니다. 자료에 없는 사실을 보완해서는 안 됩니다.

파일 형식은 아래 필드를 가진 배열이며 한 번에 1–50개만 허용합니다.

```ts
{
  sourceUrl: string; // 공식 공개 HTTPS 상세 페이지, 인증 정보·fragment 제외
  observedAt: string; // 실제 사실 확인 시각, ISO 8601의 Z 또는 시간대 offset
  name: string;
  address: string;
  lat: number;
  lng: number;
  kind: "restaurant" | "cafe" | "attraction" | "culture" | "experience";
  category: string;
}
[];
```

## 검토와 적용

기본 실행은 루트 `.env`와 입력 파일을 읽어 검증하며 데이터베이스 요청을 보내지 않습니다. 별도의 환경 설정 파일은 사용하지 않습니다. 값이나 비밀 키를 로그에 출력하지 않습니다.

```sh
npx tsx scripts/import-verified-places.ts
npx tsx scripts/import-verified-places.ts /absolute/path/to/reviewed-batch.json --dry-run
```

원격 적용은 담당 운영자가 승인 범위와 자료를 확인한 뒤 진행합니다. 먼저 `supabase/migrations/20261017045410_operator_place_catalog.sql`을 LocalRoute 프로젝트에 적용해야 합니다. 루트 `.env`의 `SUPABASE_URL` 또는 `VITE_SUPABASE_URL`은 `https://pjdawapasozsrpnrtsfx.supabase.co`여야 하며 서버 비밀 키가 필요합니다. 다른 프로젝트 URL, 공개 키만 있는 설정은 거부합니다.

```sh
npx tsx scripts/import-verified-places.ts --apply
```

`--apply`만 `import_operator_places(p_entries jsonb)` RPC를 호출합니다. 이 담당 작업에서는 원격 스키마 적용이나 실제 데이터 가져오기를 실행하지 않았습니다. 네트워크 응답이 모호하면 자동 재시도하지 않습니다. 같은 파일을 다시 적용하기 전 `operator_place_sources`에 해당 source URL이 저장되었는지 확인하세요.

## 중복과 실패 처리

동일 source URL과 동일 원문 사실은 기존 LocalRoute UUID를 반환합니다. 같은 URL의 사실이 달라지면 수동 확인이 필요한 충돌로 중단하며 기존 사실을 덮어쓰지 않습니다. 새 source URL도 정규화한 이름·정확한 주소가 같고 좌표가 30m 이내이면 공개된 같은 종류의 기존 장소를 재사용합니다. 기존 canonical 이름·주소·분류는 변경하지 않습니다.

동일 이름·주소인데 좌표가 멀거나, 150m 이내에서 이름 또는 주소만 같은 경우, 정확히 일치하는 canonical 후보가 여러 개인 경우는 자동 병합하지 않습니다. 검토 대기·거부·병합 상태의 장소도 자동 공개하지 않습니다. 확실한 경우에만 운영자가 기존 데이터와 대조해 별도의 수정 절차를 진행해야 합니다. 임의 좌표 변경이나 주소 변형으로 충돌 검사를 피하지 마세요.

한 배치 전체가 단일 트랜잭션입니다. 마지막 항목에서 실패해도 앞서 새로 등록한 장소·source·감사 기록이 함께 롤백됩니다. 앱 기여 절차와 동시에 같은 장소를 만들 수 있는 모든 경합까지 이 도구가 해결한다고 주장하지 않습니다.

## 앱 연결과 권한

`public.operator_place_sources`의 `place_id`가 canonical `places.id`입니다. `source_url`, `observed_at`을 출처 링크·확인 일자로 표시하고, `facts`는 그 source의 가져온 원문 사실, `imported_at`은 DB 등록 시각입니다. 공개된 장소에 연결된 행만 공개 RLS 읽기를 허용하고 일반 사용자의 쓰기와 RPC 실행은 금지합니다. RPC는 `service_role` 전용 `SECURITY INVOKER`이며 빈 `search_path`를 사용합니다.

UI에는 **‘공식 자료 · 운영자 확인’**처럼 실제 근거를 표시하고 이를 ‘현지인 추천’, ‘직접 방문’, ‘검증된 거주자’로 표시하지 않습니다. 사진은 비어 있는 상태로 유지하고, 실제 독립 기여자의 추천이 생기기 전에는 현지 추천 수에 포함하지 않습니다. 영업시간·예약·장애인 접근성·식단 가능 여부·실제 이동시간도 이 자료로 확인된 것으로 간주하지 않습니다.

로컬 검증: 가져오기 검증·중복·원자 롤백·RLS·서버 전용 권한 테스트 17개가 통과했습니다. 전체 TypeScript와 담당 파일 lint도 통과했습니다. 검토한 14개 입력의 실제 CLI dry-run도 통과했고 입력 내부의 확실한 중복·불확실한 충돌은 발견되지 않았습니다. 이는 원격 DB에 이미 존재하는 장소와의 중복 검사 결과가 아닙니다. 실제 원격 DB, 제공자 데이터 라이선스 및 운영 수신/노출 결과는 이 검증 범위에 포함되지 않습니다.
