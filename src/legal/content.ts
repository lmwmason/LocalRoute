import type { LegalDocument } from "../../shared/legal";

type Notice = { title: string; sections: { title: string; text: string }[] };
export const notices: Record<"ko" | "en", Record<LegalDocument, Notice>> = {
  ko: {
    privacy: {
      title: "개인정보 처리방침",
      sections: [
        {
          title: "1. 운영자와 적용 범위",
          text: "LocalRoute 운영자 및 개인정보 보호 담당자는 just_grassy이며 운영 국가는 대한민국입니다. 문의·권리행사: lmw.hpc@gmail.com. 이 방침은 현재 구현된 웹 서비스에 적용됩니다. 데모의 장소·평점은 가상 데이터이며 실제 계정 가입은 별도입니다.",
        },
        {
          title: "2. 필수 수집·이용",
          text: "회원가입·이메일 소유 확인·계정 관리에 이메일, Auth 사용자 식별자, 인증·세션 정보를 처리합니다. 지역 기반 추천과 프로필에는 자가 입력한 거주 도시, 선택한 경우 구·읍·면, 지역 범위를 처리합니다. 동의 증빙에는 사용자 식별자, 고지 버전, 필수 동의·18세 이상 자기확인, 선택 동의 여부, 언어, 요청 식별자와 서버 기록 시각을 저장합니다. 생년월일이나 신분증은 수집하지 않으며 자기확인은 신원·거주 검증이 아닙니다. 필수 수집·이용 동의 거부 시 회원 기능을 이용할 수 없으나 무료 탐색·데모는 이용할 수 있습니다.",
        },
        {
          title: "3. 기능별 수집과 공개",
          text: "기여 시 정확한 장소 위치, 본인이 촬영한 실제 장소 사진, 추천 문장 및 버전·검토 이력을 처리합니다. 파일 형식·크기·이미지 내용을 검사하고 EXIF를 제거하며, 사람 검토 전 업로드는 비공개입니다. 공개 승인된 추천·사진·활동명과 후기는 다른 이용자가 볼 수 있습니다. 피드백에는 방문일, 식당 만족도, 특정 추천의 도움 정도를 별도로 저장합니다. 신고·운영 검토·정정 요청에는 내용, 사유 및 제공한 연락처를 처리합니다. 연락처나 얼굴 등 타인의 개인정보를 사진·추천에 넣지 마세요. 일정 공유 링크를 직접 만들면 제목·요약·날짜·선택 장소·시간·이동 가정의 스냅샷을 링크를 아는 사람이 볼 수 있습니다. 링크는 로그인 없이 전달될 수 있으며 비밀 보관함이 아닙니다. 만료·철회로 이후 접근을 막아도 이미 저장한 사본까지 회수할 수는 없습니다.",
        },
        {
          title: "4. 선택 처리와 AI 일정",
          text: "거주 지역 라벨 공개는 별도 선택이며 거부해도 회원 기능을 이용할 수 있습니다. 동의한 도시·지역 라벨만 추천과 함께 공개하고, 이는 검증된 거주지가 아닙니다. 예약 프로필의 예약자명·연락 전화번호 저장은 별도 화면의 선택 동의로 처리하며 가입에 필요하지 않습니다. 예약 정보는 비공개이며 Auth 메타데이터·공개 프로필·AI 입력에 넣지 않습니다. 현재 무료 AI 일정은 별도 안내에 동의한 뒤 이용하며, 서버가 목적지·여행일·시간·여행 목적·선택한 취향·동행 유형·이동수단·예산·속도·여유 시간과 공개 장소 사실만 골라 Google Gemini에 보냅니다. 이름·이메일·전화번호·원문 식이제한·기여자 추천 문장·사진은 일정 모델에 보내지 않습니다. 입력한 식이제한은 저장된 일정과 서버 검증에 사용될 수 있으므로 개인정보나 민감한 설명을 넣지 마세요. 선택 메뉴 추출은 별도 체크 후 개인정보를 제거한 공공 메뉴 사진만 Gemini에 전송하며, 이 모듈은 원본을 영구 저장하지 않습니다. Google의 입력·출력 처리와 사람 검토 가능성은 기능 안내와 국외 처리 항목을 확인하세요. AI 심사는 비활성이고 AI만으로 자동 제재하지 않습니다.",
        },
        {
          title: "5. 보유와 파기",
          text: "계정·프로필·동의 이력은 회원 관계 유지와 동의 확인에 필요한 동안 보관하고, 기여·후기·일정·LP 거래·검토 이력은 해당 기능 제공과 분쟁 처리에 필요한 동안 처리합니다. 목적 달성·적법한 삭제 요청 시 법정 보존 대상과 타인의 권리를 확인해 삭제 또는 식별정보를 제거합니다. 법정 보존이 필요한 경우 근거·항목·기간을 개별 안내하고 분리 보관합니다. 현재 계정 일괄 삭제 UI·자동 파기 일정은 구현되지 않았습니다. 메일로 요청하면 본인 확인 후 처리 방법·범위·보존 사유를 안내합니다. 미제출 사진 24시간·반려 사진 30일 정리 도구는 있으나 실행이 설정되어야 적용되며 즉시 자동 삭제를 보장하지 않습니다. 예약 프로필은 전용 화면에서 삭제할 수 있습니다.",
        },
        {
          title: "6. 접속·단말 저장",
          text: "접속 시 서버·인증·지도 제공자는 IP 주소, 브라우저·요청 시각 등 통신 정보를 처리할 수 있습니다. 서버 요청 제한은 메모리의 IP 또는 사용자별 카운터를 사용합니다. 브라우저에는 로그인 세션, 언어·저장 장소·화면 설정이 localStorage에, 미완성 기여·일정 요청이 sessionStorage에 남을 수 있습니다. 브라우저 저장소를 지우면 단말의 임시 정보가 지워지며 서버 계정·기여가 삭제되지는 않습니다. 지도 요청은 국외 이전 안내를 확인하세요. 현재 광고·마케팅 동의를 수집하지 않습니다.",
        },
        {
          title: "7. 권리와 보호조치",
          text: "열람·정정·삭제·처리정지·동의 철회·회원탈퇴·AI 결과 이의제기를 lmw.hpc@gmail.com으로 요청할 수 있습니다. 필요한 최소한의 본인 확인 후 관련 법령에 따라 처리하며 제한 사유가 있으면 안내합니다. 지역 공개 동의는 동의 설정에서 철회할 수 있습니다. 필수 처리·국외 보관 철회 시 회원 기능이 제한될 수 있습니다. 접근 권한·사용자별 RLS, 서버 전용 비밀키, 비공개 사진 저장을 사용하며 AI 점수만으로 영구 제재·LP 몰수를 결정하지 않습니다. 개인정보 침해 상담은 개인정보침해 신고센터(privacy.kisa.or.kr), 분쟁조정은 개인정보분쟁조정위원회(kopico.go.kr)에 문의할 수 있습니다.",
        },
        {
          title: "8. 위탁·국외 처리·변경",
          text: "인증·DB·기여 사진 저장은 Supabase를 이용하며 확인된 기본 DB 보관 국가는 인도(뭄바이, ap-south-1)입니다. 실제 웹 서비스 localroute.vercel.app의 호스팅·콘텐츠 전송·API 실행에는 Vercel을 이용합니다. Vercel 처리 위치는 Supabase DB 리전과 같다고 보장하지 않습니다. 상세 항목·이전 시기·제공자·미확인 범위·거부 방법은 국외 이전/처리위탁 안내에 기재합니다. 지원 매장의 예약 요청은 매번 정보 재확인과 별도 제출 동의를 거쳐 사용자가 직접 제출합니다. 요청은 업체 확인 전까지 확정 예약이 아니며 미지원 매장에서는 제출할 수 없습니다. 보상 지급은 비활성이며 개인위치 추적은 제공하지 않습니다. 방침 변경 시 버전과 시행일을 공개하고, 동의가 필요한 변경은 다시 동의를 받습니다.",
        },
      ],
    },
    terms: {
      title: "이용약관",
      sections: [
        {
          title: "1. 운영과 회원가입",
          text: "LocalRoute는 대한민국의 just_grassy가 운영하는 지역 추천·여행 일정 웹 서비스입니다. 문의: lmw.hpc@gmail.com. 회원 서비스는 만 18세 이상을 대상으로 하며, 이메일 확인과 필수 동의의 서버 기록 후 가입 절차가 완료됩니다. 자기확인 체크는 연령 인증을 대신하지 않습니다. 미성년자를 대상으로 Gemini 기능을 제공하지 않습니다.",
        },
        {
          title: "2. 서비스 범위와 한계",
          text: "기본 탐색은 무료이며 데모와 실제 자료를 구별합니다. 독립 기여자의 지역 추천은 개인의 경험·의견입니다. 운영자 초기 추천은 확인한 공개 장소 사실을 바탕으로 별도 표시하며 현지인의 직접 방문·후기·추천으로 간주하지 않습니다. 어느 자료도 전체 업소의 전수조사나 품질 보증이 아닙니다. AI 일정은 초안이며 영업시간·가격·이동시간·접근성·식이 안전·예약 가능성을 보장하지 않습니다. 방문 전 업소와 교통편을 확인하세요. 실시간 교통·위치 추적·방문 자동 인증·계정 자동 삭제를 제공한다고 해석하지 않습니다. 연동이 지원되는 매장에서만 예약 정보를 재확인하고 별도 안내·동의 후 사용자가 예약 요청을 직접 제출할 수 있습니다. 제출은 확정이 아니며 업체의 확인 결과를 기다려야 합니다. 미지원 매장에서는 예약 요청을 제공하지 않고, 예약 프로필 저장만으로 예약되지 않습니다.",
        },
        {
          title: "3. 기여와 권리",
          text: "본인이 권리를 보유한 실제 장소 사진과 정직한 추천·후기를 제출하세요. 저작권은 작성자에게 남으며, 제출 시 서비스의 저장·검토·표시·이미지 크기 조정에 필요한 비독점적 이용을 허용합니다. 별도 광고 이용 권한을 부여하는 것은 아닙니다. 타인의 개인정보·무단 복제·허위 장소·자기 사업체에 대한 은폐된 추천·조작 평점·중복 보상 청구를 금지합니다. 부정적 평가도 제출할 수 있으며 식당 평가와 추천 도움 평가는 구별합니다.",
        },
        {
          title: "4. LP와 유료 기능",
          text: "이메일 인증과 필수 동의를 마친 회원에게 월 기본 50 LP를 월 1회 지급하며 월말에 만료됩니다. 기존 지급 기록은 유지합니다. AI 일정 생성은 여행 날짜를 포함해 하루당 10 LP이며 생성 전 총액·잔액을 안내하고 별도 확인을 받습니다. 유효한 일정이 저장된 뒤에만 한 번 차감하며 생성 실패·무효 결과에는 차감하지 않습니다. 실제 금전 결제는 비활성입니다. 테스트 충전은 실제 청구 없이 인증·동의 계정당 1회 무료 테스트 보너스 100 LP를 지급하는 체험이며 유료 구매가 아닙니다. 방문 평가 보상은 해당 추천에 대한 방문 검토와 적격성 확인 후 별도 정책에 따라 지급합니다. LP의 현금 환급·양도·수익은 보장하지 않으며 법률상 소비자 권리를 제한하지 않습니다.",
        },
        {
          title: "5. 검토·중단·책임",
          text: "불법·권리 침해·조작이 의심되면 사람의 검토를 거쳐 게시 제한 등 필요한 조치를 하고 사유와 이의제기 경로를 안내합니다. AI 점수만으로 영구 제재하지 않습니다. 장애·점검·외부 제공자 제한 시 기능이 중단될 수 있으며 가능한 범위에서 안내합니다. 운영자의 고의·중과실 또는 강행법규에 따른 책임을 면제하지 않습니다. 분쟁은 대한민국 법과 적용되는 강행법규를 따르며 관할은 법정 관할 규정에 따릅니다.",
        },
        {
          title: "6. 탈퇴와 약관 변경",
          text: "탈퇴·동의 철회·자료 삭제는 lmw.hpc@gmail.com으로 요청하세요. 계정 일괄 삭제 버튼은 아직 없으며 보존 의무·타인 권리를 확인한 후 처리 범위를 안내합니다. 변경 약관은 시행일·변경 내용을 공지하고 중요한 동의 사항은 다시 확인합니다. 공지만으로 새로운 선택 동의를 얻은 것으로 보지 않습니다.",
        },
      ],
    },
    transfers: {
      title: "국외 이전 및 처리위탁 안내",
      sections: [
        {
          title: "1. 필수 Supabase 국외 보관 동의",
          text: "이전받는 자: Supabase Pte. Ltd. (공식 DPA상 싱가포르 법인; 실제 계정 계약 상대방은 출시 전 대조), 문의: privacy@supabase.io(DPA) / privacy@supabase.com(개인정보 문의) 및 supabase.com/privacy. 처리 목적: 이메일 인증·세션 관리, 회원·기여·사진·일정·동의·LP 기록의 DB/Storage 운영. 항목: 이메일, 사용자 식별자·인증 정보, 프로필·자가 입력 지역, 선택 공개 여부, 제출 내용·사진, 여행 입력·결과, 기능 사용·동의·거래·검토 기록; 예약 프로필을 별도로 저장한 경우 예약자명·전화번호도 포함됩니다. 이전 국가: 확인된 기본 프로젝트 DB 보관지는 인도 뭄바이(ap-south-1), 프로젝트 pjdawapasozsrpnrtsfx입니다. Supabase의 미국 운영·지원 및 재수탁자에 의한 추가 처리·보관 국가는 기본 DB 리전과 다를 수 있습니다. 계약·지원·백업·메일 재수탁 범위는 출시 전 확정 대상이며 인도에만 모든 데이터가 존재한다고 보장하지 않습니다.",
        },
        {
          title: "2. 시기·방법·보유·거부",
          text: "가입·로그인·저장·기능 이용 시 HTTPS API를 통해 전송하고 계정과 기능 제공에 필요한 동안 보관합니다. 목적 달성·탈퇴 요청 시 법정 보존을 제외하고 삭제 처리하며 백업·운영 로그의 실제 잔존 기간과 삭제 절차는 제공자 계약 확인이 필요합니다. 개인정보 보호법 제28조의8 제1항 제1호에 따른 별도 동의를 받습니다. 동의하지 않으면 국외 인증·저장이 필요한 회원 기능은 이용할 수 없으나 공개 탐색·데모는 가능합니다. 철회·이전 중단은 lmw.hpc@gmail.com으로 요청하세요. 이 필수 동의는 Gemini·예약업체 제공·위치 추적 동의를 포함하지 않습니다. 미확정 국외 처리 범위는 별도 확인·고지 전 활성화하지 않아야 합니다.",
        },
        {
          title: "3. Gemini: 조건부 AI 처리",
          text: "별도 AI 안내에 동의하면 서버가 Google Gemini API에 목적지·날짜·시간·여행 목적·선택형 취향·동행 유형·예산·이동·여행 속도·여유 시간과 공개 장소 사실만 전송합니다. 일정 모델에는 이름·이메일·연락처·원문 식이제한·기여자 추천 문장·사진을 보내지 않습니다. 메뉴 사진 추출은 선택 기능으로, 이름·얼굴·전화번호·영수증 등 개인정보를 제거한 공공 메뉴 사진만 기능별 체크 후 Google에 전송합니다. LocalRoute 추출 모듈은 원본을 영구 저장하지 않으며 Google의 보유와는 별개입니다. AI 심사는 비활성입니다. Google 무료 API는 입력·출력을 제품 개선에 이용하거나 사람이 검토할 수 있으므로 개인정보·민감정보를 전송하면 안 됩니다. Google 약관의 18세 미만 제한 및 지역별 제공 조건이 적용됩니다. Google의 실제 처리 국가·안전 로그·보유 범위가 Supabase 인도 리전과 같다고 보장하지 않습니다. 본 가입 동의가 미고지된 AI 개인정보 이전을 허용하는 것은 아닙니다.",
        },
        {
          title: "4. Vercel 웹 호스팅과 API 처리",
          text: "현재 서비스 주소 https://localroute.vercel.app은 Vercel Inc.의 웹 호스팅·콘텐츠 전송·서버 실행을 이용합니다. 페이지 접속과 기능 요청 때 IP·브라우저 정보·요청 URL·시각 및 전송한 API 요청 내용이 이 인프라를 거칠 수 있습니다. 목적은 페이지·API 제공, 보안과 장애 대응입니다. Vercel은 전 세계 네트워크를 사용하며 실제 배포·로그·지원의 전체 처리 국가와 보유기간은 계정 설정·계약에 따라 달라집니다. 이를 인도 보관으로 안내하거나 특정 기간 뒤 모두 삭제된다고 보장하지 않습니다. 제공자 안내: vercel.com/legal/privacy-notice, vercel.com/legal/dpa 및 재수탁자 목록. 문의·처리 중단 요청은 lmw.hpc@gmail.com으로 보내주세요. 호스팅 처리를 거부하면 현재 웹 서비스 접속이 어려울 수 있습니다.",
        },
        {
          title: "5. 지도·장소 검색·예약",
          text: "기본 지도는 브라우저에서 OpenFreeMap 타일·스타일·글꼴을 요청하므로 IP·브라우저 정보와 조회 지도 영역이 외부에 전달됩니다. 운영자는 헝가리 Hyperknot Software Kft.(privacy@openfreemap.org)이며 배포 서버의 모든 처리 국가는 확인되지 않았습니다. 제공자 정책상 기본 접속 로그에는 IP를 저장하지 않으나 오류 로그는 7일, 보안 조사 시 임시 IP 로그는 최대 30일 보관할 수 있습니다. 지도 실패 시 OpenStreetMap Foundation(영국, privacy@osmfoundation.org)의 tile.openstreetmap.org로 대체 타일을 요청할 수 있습니다. 이때도 IP·브라우저·조회 타일 영역이 전달되며 전 세계 CDN에서 처리되고 로그 보유는 해당 정책에 따릅니다. 선택한 지도 URL이 다르면 제공자도 달라지므로 출시 전 고지를 갱신해야 합니다. HeyYumi 검색은 서버에서 검색어를 전송하며, Kakao 활동 검색은 목적지 지역 중심좌표·분류를 전송합니다. 사용자 GPS·예약 연락처를 이 검색에 보내지 않습니다. 예약 요청은 지원 매장에 한해 사용자가 직접 제출하며 매번 수신자·항목·목적·보유·국외 처리 안내, 고객 정보와 별도 제출 동의를 재확인합니다. 요청은 업체가 확인하기 전까지 대기 상태이며 미지원 매장은 제출할 수 없습니다.",
        },
      ],
    },
    location: {
      title: "위치정보 안내",
      sections: [
        {
          title: "현재 처리하는 장소 정보",
          text: "선택한 여행 목적지, 수동 지도 중심·장소 좌표와 자가 입력한 거주 도시/선택 지역을 사용합니다. 업소의 위치는 이용자가 현재 그 장소에 있다는 증거가 아니며, 거주 지역 라벨은 자기신고입니다. 지도 제공자는 조회 타일 영역과 접속 IP를 통신 과정에서 처리할 수 있습니다.",
        },
        {
          title: "제공하지 않는 위치 기능",
          text: "현재 기기 GPS 수집, 백그라운드 위치 추적, 이동 이력 저장, 도착 자동 인증을 구현하지 않았습니다. 가입 시 위치정보 수집 동의를 요구하거나 브라우저 위치 권한을 요청하지 않습니다. 예약 확인·업로드 사진만으로 방문을 증명하거나 보상을 지급하지 않습니다.",
        },
        {
          title: "향후 도착 확인과 권리",
          text: "향후 위치 기능을 도입한다면 운영자 신고 등 적용 의무, 처리 항목·목적·보유기간·제공자·철회 방법을 먼저 확인·고지하고 사용 시점에 별도 선택 동의와 기기 권한을 받습니다. 거부해도 기본 탐색을 제한하지 않는 방식으로 설계합니다. 본 안내는 미구현 기능에 대한 이용약관이나 포괄 동의가 아닙니다. 문의·정정·삭제·처리정지 요청: just_grassy, lmw.hpc@gmail.com.",
        },
      ],
    },
  },
  en: {
    privacy: {
      title: "Privacy policy",
      sections: [
        {
          title: "1. Operator and scope",
          text: "LocalRoute is operated in the Republic of Korea by just_grassy, who is also responsible for privacy. Contact: lmw.hpc@gmail.com. This notice describes the implemented web service. Demo places and ratings are fictional; creating a real account is a separate action.",
        },
        {
          title: "2. Required collection and use",
          text: "We process your email, Auth user ID and authentication/session information to verify email ownership and manage your account. Your self-declared home city, optional district/township and coverage preference support regional recommendations and your profile. Consent evidence contains your user ID, notice version, required acceptances, self-declaration of being 18 or older, optional choice, language, request ID and server timestamp. We do not collect a birth date or identity document; self-declaration does not verify age or residence. Refusing required collection prevents member features; public discovery and demo browsing remain available.",
        },
        {
          title: "3. Contributions and publication",
          text: "Contributions include an exact venue location, your own real venue photograph, recommendation text, versions and moderation history. We validate image bytes and size, strip EXIF and keep uploads private before human review. Approved recommendations, photos, display names and reviews are visible to others. Feedback stores the visit date, restaurant satisfaction and helpfulness of a specific recommendation separately. Reports, moderation and owner corrections process submitted content, reasons and any supplied contact details. Do not include other people's personal details or identifiable faces without authority. If you explicitly create an itinerary share link, anyone with it can view a snapshot of the title, summary, dates, selected venues, times and travel assumptions without login. Treat the link as forwardable. Expiry or revocation blocks later access, but cannot recall saved copies.",
        },
        {
          title: "4. Optional processing and AI planning",
          text: "Publishing a self-declared city/area label is optional and does not verify residence. Saving a private booking name and phone requires separate optional consent and is unnecessary for signup; booking contacts do not enter Auth metadata, public profiles or AI inputs. Current free AI planning requires its own disclosure confirmation. The server sends only an allowlist of destination, dates, time windows, purpose, selected preferences, companion type, travel mode, budget, pace, buffers and public place facts to Google Gemini. Names, emails, contact details, raw dietary restrictions, contributor recommendation prose and photographs are excluded from the planning model. Dietary input may remain in the saved itinerary and server checks; do not enter personal or sensitive explanations. Optional menu extraction separately asks you to remove personal details and confirm sending a public menu photograph to Gemini. This module does not persist the original image. Provider improvement and human review are explained in the feature and transfer notices. AI moderation is disabled; AI alone does not impose punishment.",
        },
        {
          title: "5. Retention and deletion",
          text: "Account, profile and consent history remain while needed for membership and consent evidence. Contributions, feedback, itineraries, LP transactions and moderation records remain as needed for the relevant service and disputes. When purposes end or a lawful deletion request is accepted, we delete or remove identifying information after checking statutory retention and others' rights. Any legally required retention is separated and its basis, data and period explained individually. There is no bulk account-deletion UI or automated account-erasure schedule. Email us for identity checks, scope and any retention reasons. A cleanup tool targets unsubmitted photos after 24 hours and rejected photos after 30 days, but requires scheduled execution; immediate automatic erasure is not guaranteed. Private booking profiles have a dedicated delete control.",
        },
        {
          title: "6. Connections and device storage",
          text: "Servers, authentication and map providers may process IP addresses, browser details and request times. Server rate limits use in-memory IP/user counters. Your browser may retain login sessions, language, saved places and screen settings in localStorage, and unfinished contributions or planning requests in sessionStorage. Clearing browser storage removes device data, not your server account or contributions. See the transfer notice for map requests. We do not currently collect advertising or marketing consent.",
        },
        {
          title: "7. Rights and safeguards",
          text: "Email lmw.hpc@gmail.com to request access, correction, deletion, restriction, withdrawal, account closure or human review of an AI result. We use proportionate identity checks, process requests under applicable law and explain any restriction. You can withdraw area-publication consent in consent settings. Withdrawing required processing or overseas storage may prevent member features. We use access controls, user-scoped RLS, server-only secrets and private photo storage. AI scores alone do not determine permanent bans or LP confiscation. For assistance, contact Korea's privacy complaint center (privacy.kisa.or.kr) or dispute mediation committee (kopico.go.kr).",
        },
        {
          title: "8. Processors and changes",
          text: "Supabase provides authentication, database and contribution-photo storage; the confirmed primary database is Mumbai, India (ap-south-1). The live website localroute.vercel.app uses Vercel for hosting, content delivery and API execution. Vercel processing locations are not necessarily the Supabase database region. The transfer notice describes providers, data, timing, unconfirmed details and refusal routes. For supported venues, users submit reservation requests themselves after reconfirming details and giving separate submission consent each time. Requests are not confirmed bookings until the provider confirms them; unsupported venues cannot receive submissions. Reward payouts and personal location tracking remain disabled. Notice changes publish a version/effective date and obtain renewed consent when required.",
        },
      ],
    },
    terms: {
      title: "Terms of service",
      sections: [
        {
          title: "1. Operator and membership",
          text: "LocalRoute is a regional recommendation and travel-planning web service operated by just_grassy in the Republic of Korea. Contact: lmw.hpc@gmail.com. Membership is for people aged 18 or older and is completed after email verification and server-recorded required consent. A checkbox is a self-declaration, not age verification. Gemini features are not intended for minors.",
        },
        {
          title: "2. Scope and limitations",
          text: "Basic discovery is free and demo content is identified. Independent local contributions are personal opinions. Operator starter recommendations are separately labeled selections based on checked public place facts; they are not independent local visits, reviews or endorsements. Neither source is a complete venue census or quality guarantee. AI itineraries are drafts, not assurances about hours, prices, travel times, accessibility, dietary safety or availability. Check with venues and transport providers before visiting. Real-time traffic, location tracking, automatic visit verification and automatic account erasure are not offered. At supported venues, users may submit a reservation request themselves after reviewing their details, the disclosure and separate consent. Submission is not confirmation; wait for the provider result. Unsupported venues do not offer submission, and saving a booking profile does not create a reservation.",
        },
        {
          title: "3. Contributions and rights",
          text: "Submit honest recommendations and reviews, and actual venue photographs you have the right to use. Authors keep copyright and permit non-exclusive storage, review, display and image resizing necessary for the service; this does not grant separate advertising rights. Do not infringe privacy or copyright, invent venues, hide business affiliations, manipulate ratings or seek duplicate rewards. Negative feedback is permitted. Restaurant satisfaction and recommendation helpfulness are separate ratings.",
        },
        {
          title: "4. LP and enhanced features",
          text: "Members with verified email and current required consent receive 50 LP once each month, expiring at month end. Previous grants remain unchanged. AI itinerary generation costs 10 LP per inclusive travel day. The total and balance are shown before separate confirmation. Debit occurs once only after a valid itinerary is saved; failed or invalid generation is not charged. Real-money payments are disabled. Test checkout awards a free 100-LP test bonus once per verified consenting account without charging money; it is not a paid purchase. Visitor-feedback rewards require review of the attributable recommendation and eligibility under a separate policy. Cash value, transferability and returns are not guaranteed. Statutory consumer rights remain intact.",
        },
        {
          title: "5. Moderation, interruptions and responsibility",
          text: "Suspected illegality, rights infringement or manipulation may lead to proportionate publication restrictions after human review, with reasons and an appeal route. AI scores alone do not impose permanent sanctions. Maintenance, outages and external provider limits may interrupt features; we provide notice where practicable. We do not exclude liability for intentional wrongdoing, gross negligence or mandatory legal duties. Korean law and applicable mandatory protections govern, with jurisdiction determined by law.",
        },
        {
          title: "6. Closure and amendments",
          text: "Request account closure, withdrawal or deletion at lmw.hpc@gmail.com. Bulk account deletion is not yet available; we explain the scope after checking retention duties and others' rights. Changes include an effective date and explanation. Material consent changes require renewed acceptance; notice alone does not create optional consent.",
        },
      ],
    },
    transfers: {
      title: "Overseas transfers and processors",
      sections: [
        {
          title: "1. Required Supabase overseas-storage consent",
          text: "Recipient: Supabase Pte. Ltd., Singapore, as named in the public DPA; verify the actual account contracting entity before launch; privacy@supabase.io (DPA), privacy@supabase.com (privacy inquiries) and supabase.com/privacy. Purposes: email authentication, sessions, database and Storage for accounts, contributions, photos, itineraries, consent and LP records. Data: email, user ID and authentication information, profile and declared area, optional-publication choices, submissions and photos, trip inputs/results, usage, consent, transaction and moderation records; booking names/phones only if separately saved in a private booking profile. Destination: the confirmed primary database for project pjdawapasozsrpnrtsfx is Mumbai, India (ap-south-1). US operations/support and subprocessors may involve other locations. Contract, support, backup and email subprocessor scope still requires prelaunch confirmation; the primary DB region does not mean all processing occurs only in India.",
        },
        {
          title: "2. Timing, method, retention and refusal",
          text: "Data is transmitted over HTTPS APIs during signup, login, saving and feature use, and retained while needed for the account and service. After purposes end or an accepted closure request, data is deleted except lawful retention; actual backup/log lifetimes and erasure procedures require provider-contract confirmation. Separate consent is requested under PIPA Article 28-8(1)(1). Refusal prevents member features that require overseas authentication/storage; public discovery and demo remain available. Request withdrawal or transfer suspension at lmw.hpc@gmail.com. This required consent does not authorize Gemini personal-data transfers, disclosure to booking providers or location tracking. Unconfirmed processing must not be enabled before verification and notice.",
        },
        {
          title: "3. Conditional Gemini processing",
          text: "After separate AI disclosure confirmation, the server sends Google Gemini only destination, dates, times, purpose, selected preferences, companion type, budget, travel mode, pace, buffers and public place facts. The planner excludes names, emails, contacts, raw dietary restrictions, contributor recommendation prose and photographs. Menu extraction is optional: remove names, faces, phone numbers, receipts and other personal information from a public menu photograph, then confirm this separate transfer. LocalRoute does not persist the original menu image; this is distinct from Google's retention. AI moderation is disabled. Google's unpaid API may use inputs/outputs for product improvement and human review, so do not send personal or sensitive information. Google's age and regional availability conditions apply. Actual processing countries, safety logs and retention are not necessarily the Supabase India region. Membership consent does not authorize undisclosed AI personal-data transfers.",
        },
        {
          title: "4. Vercel web hosting and API processing",
          text: "The live service at https://localroute.vercel.app uses Vercel Inc. for web hosting, content delivery and server execution. Page and feature requests may transmit IP/browser information, request URLs/times and submitted API contents through this infrastructure to serve pages/APIs and handle security or outages. Vercel operates a global network; actual deployment, log and support locations and retention depend on account settings and contracts. We do not describe this as India-only storage or promise erasure after an unverified period. Provider information: vercel.com/legal/privacy-notice, vercel.com/legal/dpa and its subprocessor list. Contact lmw.hpc@gmail.com about processing or suspension requests. Refusing hosting processing may prevent access to the current website.",
        },
        {
          title: "5. Maps, place search and reservations",
          text: "The default browser map fetches OpenFreeMap styles, tiles and fonts, exposing IP/browser information and viewed map areas to an external service. Its operator is Hyperknot Software Kft., Hungary (privacy@openfreemap.org); all serving locations have not been confirmed. Its policy excludes IPs from default access logs, but permits error logs for 7 days and temporary security IP logs for up to 30 days. If the map fails, fallback tiles may be requested from tile.openstreetmap.org, operated by the OpenStreetMap Foundation, UK (privacy@osmfoundation.org). IP/browser and requested tile areas reach its global CDN; log retention follows its policy. Changing the map URL changes the provider and requires updated notice before launch. Server-side HeyYumi search receives search terms; Kakao activity search receives destination-center coordinates and categories, not user GPS or booking contacts. Reservation requests are available only at supported venues and are submitted directly by the user. Each submission requires reconfirming customer details, the recipient, data, purpose, retention and overseas-handling notice, and separate explicit submission consent. A request remains pending until provider confirmation; unsupported venues cannot receive submissions.",
        },
      ],
    },
    location: {
      title: "Location information notice",
      sections: [
        {
          title: "Place information currently used",
          text: "We use your chosen destination, manually selected map center/venue coordinates and self-declared home city/optional area. A venue coordinate does not show that you are there; a residence label is self-declared. Map providers may process requested tile areas and connection IP addresses.",
        },
        {
          title: "Location features not provided",
          text: "Device GPS collection, background tracking, movement history and automatic arrival verification are not implemented. Signup does not request personal-location consent or browser location permission. A reservation confirmation or uploaded venue photo alone does not prove a visit or qualify for rewards.",
        },
        {
          title: "Future arrival checks and rights",
          text: "Before introducing location features, we must check applicable operator filings and duties, publish data, purposes, retention, recipients and withdrawal routes, and request separate optional consent and device permission at the point of use. Basic discovery should remain available on refusal. This notice is not terms or blanket consent for unimplemented features. Questions, corrections, deletion or restriction: just_grassy, lmw.hpc@gmail.com.",
        },
      ],
    },
  },
};

export const legalSources = [
  ["Vercel privacy notice", "https://vercel.com/legal/privacy-notice"],
  ["Vercel DPA", "https://vercel.com/legal/dpa"],
  ["Vercel subprocessors", "https://vercel.com/legal/sub-processors"],
  ["HeyYumi privacy", "https://heyyumi.ai/legal/privacy"],
  ["Kakao privacy", "https://www.kakao.com/policy/privacy"],
  [
    "OpenStreetMap Foundation privacy",
    "https://osmfoundation.org/wiki/Privacy_Policy",
  ],
  [
    "개인정보 보호법 / Personal Information Protection Act",
    "https://www.law.go.kr/법령/개인정보보호법",
  ],
  [
    "개인정보위 국외이전 제도 / PIPC overseas transfers",
    "https://www.privacy.go.kr/front/contents/cntntsView.do?contsNo=367",
  ],
  [
    "위치정보법 / Location Information Act",
    "https://www.law.go.kr/법령/위치정보의보호및이용등에관한법률",
  ],
  ["Gemini API terms", "https://ai.google.dev/gemini-api/terms"],
  ["Supabase regions", "https://supabase.com/docs/guides/platform/regions"],
  ["Supabase privacy", "https://supabase.com/privacy"],
  [
    "Supabase DPA",
    "https://supabase.com/legal/customer-resources/data-processing-addendum",
  ],
  [
    "Supabase subprocessors",
    "https://supabase.com/legal/customer-resources/subprocessor-list",
  ],
  ["OpenFreeMap privacy", "https://openfreemap.org/privacy/"],
] as const;
