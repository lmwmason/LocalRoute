import { isLocalRouteSupabase } from "../shared/config";

export type ServerConfig = ReturnType<typeof readConfig>;
export function readConfig(env: NodeJS.ProcessEnv) {
  const publicKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || "";
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
  const secret = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || "";
  const mode = env.VITE_DATA_MODE || "demo";
  const warnings: string[] = [];
  if (!["demo", "live"].includes(mode))
    warnings.push(
      "VITE_DATA_MODE는 demo 또는 live여야 합니다. demo로 시작합니다.",
    );
  const live = mode === "live";
  const database = isLocalRouteSupabase(url) && Boolean(publicKey && secret);
  if (live && !database)
    warnings.push(
      "실제 저장 기능이 비활성화되었습니다. SUPABASE_URL, 공개 키, 서버 비밀 키를 확인하세요.",
    );
  const heyyumi =
    env.FEATURE_HEYYUMI_SEARCH === "true" &&
    env.HEYYUMI_TERMS_VERIFIED === "true" &&
    Boolean(env.HEY_YUMI_API_KEY);
  return {
    planning:
      live &&
      database &&
      env.FEATURE_AI_PLANNING === "true" &&
      env.PLANNING_POLICY_APPROVED === "true" &&
      env.FEATURE_KAKAO_DISCOVERY === "true" &&
      env.KAKAO_TERMS_VERIFIED === "true" &&
      Boolean(env.GEMINI_API_KEY && env.KAKAO_REST_API_KEY),
    kakaoKey: env.KAKAO_REST_API_KEY || "",
    aiBudget: Math.max(
      1,
      Math.min(1000, Number(env.AI_REQUESTS_PER_HOUR) || 30),
    ),
    live,
    database,
    url,
    publicKey,
    secret,
    heyyumi,
    heyyumiKey: env.HEY_YUMI_API_KEY || "",
    heyyumiBudget: Math.max(
      1,
      Math.min(1000, Number(env.HEYYUMI_REQUESTS_PER_HOUR) || 30),
    ),
    geminiKey: env.GEMINI_API_KEY || "",
    geminiModel: env.GEMINI_MODEL || "gemini-3.1-flash-lite",
    menuExtraction: env.FEATURE_GEMINI_MENU_EXTRACTION === "true",
    moderation: env.FEATURE_GEMINI_MODERATION === "true",
    warnings,
  };
}
