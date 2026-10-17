# LocalRoute 인증 이메일 설정

LocalRoute 프로젝트 `pjdawapasozsrpnrtsfx` 전용입니다. 가입 확인과 비밀번호 없는 로그인 메일에 LocalRoute 이름, 파란색 버튼, 한국어·영어 안내, 만료 시 재요청 안내, 운영자 문의 주소를 넣었습니다. 메타데이터에 저장된 지역·이름·전화번호나 수신자 주소를 본문에 삽입하지 않습니다. 외부 이미지, 웹폰트, 추적 픽셀을 사용하지 않습니다.

| Supabase 템플릿 | 제목                                            | 본문                                   |
| --------------- | ----------------------------------------------- | -------------------------------------- |
| Confirm sign up | `[LocalRoute] 이메일 확인 · Confirm your email` | `supabase/templates/confirmation.html` |
| Magic Link      | `[LocalRoute] 로그인 링크 · Your sign-in link`  | `supabase/templates/magic-link.html`   |

현재 앱은 `signInWithOtp()`를 사용하므로 **두 템플릿을 모두** 설정합니다. 두 파일은 실제 Supabase 검증 URL인 `{{ .ConfirmationURL }}`을 그대로 유지합니다. 임의의 만료 시간을 약속하지 않으며, 가입 확인 후 필수 동의를 마쳐야 가입 절차가 완료된다고 안내합니다. 언어 메타데이터에 의존하지 않고 매번 한·영 안내를 함께 보여 줍니다.

## 로컬 검증과 원격 적용

기본 실행은 네트워크 요청이 없는 dry run입니다.

```sh
node scripts/apply-auth-email-templates.mjs
```

관리 API로 적용하려면 [Supabase 개인 액세스 토큰](https://supabase.com/dashboard/account/tokens)을 만들어 **루트의 gitignore된 `.env`**에 `SUPABASE_ACCESS_TOKEN`으로 넣습니다. 가능한 경우 LocalRoute 프로젝트로 범위를 한정하고 인증 설정 읽기·쓰기 권한만 부여하세요. 이 값은 브라우저용 키나 service-role 키와 다릅니다. 채팅·스크린샷·로그에 보내지 말고 `VITE_` 접두어를 붙이지 마세요. 템플릿 적용 후 필요 없으면 토큰을 폐기하고 로컬 파일에서도 제거할 수 있습니다.

```sh
node scripts/apply-auth-email-templates.mjs --apply
```

스크립트는 고정된 LocalRoute 관리 API에 제목·본문 4개 필드만 PATCH하고 GET으로 읽어 일치 여부를 확인합니다. SMTP, 사이트 URL, 리디렉션 허용 목록, 인증 확인 옵션은 변경하지 않습니다. 성공 로그에는 비밀 값이나 인증 설정 응답을 출력하지 않습니다. 타임아웃·검증 실패 시 자동 재시도하지 않으므로 대시보드에서 저장된 값을 확인하세요. `--apply`도 이메일을 발송하거나 계정을 생성하지 않습니다.

**작성 시점 상태:** 실제 관리 API 적용이나 실제 수신함 검증은 수행하지 않았습니다. 로컬 템플릿 파일 생성만으로 호스팅된 Supabase 메일이 바뀌지는 않습니다. root `.env`에 관리 토큰이 없으면 원격 적용을 거부합니다.

로컬 검증 결과: 전용 단위 테스트 15개, 담당 스크립트·테스트 lint, 전체 TypeScript 검사가 통과했습니다. Chromium으로 두 HTML을 360px·390px·1280px에서 확인한 6개 조합 모두 가로 넘침이 없고 기본 버튼 높이가 56px였습니다. 이는 이메일 클라이언트별 실제 수신 검증을 대신하지 않습니다.

## 대시보드에서 직접 적용

1. [LocalRoute 이메일 템플릿](https://supabase.com/dashboard/project/pjdawapasozsrpnrtsfx/auth/templates)에서 **Confirm sign up**과 **Magic Link**를 엽니다.
2. 위 표의 제목과 각 HTML 파일 전체를 붙여넣고 저장합니다. `{{ .ConfirmationURL }}`은 그대로 둡니다.
3. URL Configuration의 Site URL과 Redirect URLs에 실제 서비스 주소를 등록합니다. 개발 주소를 사용할 때도 앱에서 열어 둔 origin과 정확히 일치해야 합니다. 운영 주소를 임의로 추측해서 등록하지 않습니다.
4. 이메일 확인 기능은 유지합니다. 본문을 바꾸면서 자동 이메일 확인을 활성화하지 않습니다.

## 발신자와 수신 확인

본문 템플릿과 **발신자 표시명·발신 주소·전송 가능 대상**은 별도 설정입니다. Custom SMTP가 있다면 발신자 표시명을 `LocalRoute`로, 발신 주소를 운영자가 소유하고 검증한 도메인의 주소로 설정하세요. 이 작업에서 SMTP 계정·도메인을 생성하거나 유료 서비스를 신청하지 않았습니다. 기본 Supabase 메일 서비스의 전송 제한도 변경하지 않습니다.

SMTP 공급자의 링크 추적은 꺼야 인증 URL이 변형되지 않습니다. 일부 메일 보안 스캐너는 일회성 링크를 미리 열어 소모할 수 있습니다. 이 경우 앱에서 새 링크를 요청해야 합니다. 현재 앱은 이메일의 숫자 OTP 입력을 제공하지 않으므로 본문에 OTP 코드를 표시하지 않습니다.

수신 확인은 운영자가 실제 가입·로그인을 요청해 진행합니다. Gmail·모바일·영어 안내에서 버튼과 대체 링크를 확인하고, 만료/재사용 링크의 오류 및 새 링크 요청도 확인하세요. 실제 수신함, 스팸 판정, SMTP 발신자, 링크 도착 화면은 로컬 테스트만으로 검증되지 않습니다.

공식 문서 확인: 2026-10-17. [이메일 템플릿과 변수](https://supabase.com/docs/guides/auth/auth-email-templates), [인증 설정 관리 API](https://supabase.com/docs/reference/api/v1-update-auth-service-config), [Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp). 최근 [Supabase 변경사항](https://supabase.com/changelog)의 관련 인증·토큰 변경도 확인했습니다.
