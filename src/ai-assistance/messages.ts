import type { AssistanceFailure } from "../../shared/ai-assistance";
export const failures: Record<AssistanceFailure, [string, string]> = {
  disabled: [
    "사진 분석은 아직 연결되지 않았어요.",
    "Photo analysis is not enabled.",
  ],
  unauthenticated: [
    "이메일 인증을 마친 계정으로 로그인해 주세요.",
    "Sign in with an email-verified account.",
  ],
  forbidden: ["운영자 권한이 필요해요.", "Moderator permission is required."],
  not_found: [
    "검토 대기 항목을 찾을 수 없어요.",
    "The review queue item is unavailable.",
  ],
  invalid_input: [
    "입력과 개인정보 확인 항목을 확인해 주세요.",
    "Check the input and privacy confirmation.",
  ],
  invalid_photo: [
    "320px 이상의 JPEG·PNG·WebP 사진을 선택해 주세요.",
    "Choose a JPEG, PNG or WebP photo at least 320px on each side.",
  ],
  photo_too_large: [
    "사진은 5MB 이하로 올려 주세요.",
    "Choose a photo of 5MB or less.",
  ],
  rate_limited: [
    "AI 조회 한도에 도달했어요. 나중에 다시 시도해 주세요.",
    "The AI request limit has been reached. Try again later.",
  ],
  busy: [
    "분석이 밀리고 있어요. 잠시 후 다시 시도해 주세요.",
    "Analysis is busy. Try again shortly.",
  ],
  timeout: ["분석 시간이 초과됐어요.", "Analysis timed out."],
  unavailable: ["분석에 연결할 수 없어요.", "Analysis is unavailable."],
  invalid_output: [
    "분석 결과를 확인할 수 없어요.",
    "The analysis result could not be validated.",
  ],
};
export const menuWarnings: Record<string, [string, string]> = {
  partial_name: ["메뉴명이 일부만 보여요", "Item name is only partly visible"],
  price_unreadable: ["가격 미확인", "Price unknown"],
  currency_unreadable: ["통화 미확인", "Currency unknown"],
  partial_image: ["사진이 잘렸어요", "Partial image"],
  blur: ["사진이 흐려요", "Blurred image"],
  glare: ["빛 반사가 있어요", "Glare"],
  no_menu_found: ["읽을 수 있는 메뉴가 없어요", "No readable menu found"],
  instruction_like_text: [
    "사진 속 명령문은 따르지 않아요",
    "Instructions in the image are ignored",
  ],
};
