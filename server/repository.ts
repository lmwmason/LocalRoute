import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Contribution, Place } from "../shared/domain";
import type { ServerConfig } from "./config";
import { AppError } from "./errors";
import type { ProviderVenue } from "./heyyumi";

export type Actor = { id: string; role: "traveler" | "moderator" | "admin" };
export interface Repository {
  community(
    actor: Actor | null,
    action: string,
    requestId: string | null,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
  authenticate(token: string): Promise<Actor>;
  places(): Promise<Place[]>;
  contribute(
    actor: Actor,
    payload: Contribution,
    providerVenue?: ProviderVenue,
  ): Promise<{ id: string; status: "pending" }>;
}
export class SupabaseRepository implements Repository {
  private admin: SupabaseClient;
  private auth: SupabaseClient;
  constructor(config: ServerConfig) {
    const options = {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    };
    this.admin = createClient(config.url, config.secret, options);
    this.auth = createClient(config.url, config.publicKey, options);
  }
  async authenticate(token: string): Promise<Actor> {
    const { data, error } = await this.auth.auth.getUser(token);
    if (error || !data.user || data.user.is_anonymous)
      throw new AppError(401, "로그인 후 이용해 주세요.");
    const roleResult = await this.admin
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .maybeSingle();
    if (roleResult.error)
      throw new AppError(
        503,
        "계정 권한을 확인하지 못했어요. 데이터베이스 설정을 확인해 주세요.",
      );
    return { id: data.user.id, role: roleResult.data?.role || "traveler" };
  }
  async places(): Promise<Place[]> {
    const { data, error } = await this.auth
      .from("places")
      .select(
        "id,name,category,address,lat,lng,place_reviews(rating,verification_state),endorsements!endorsements_place_id_fkey(id,user_id,endorsement_versions!endorsement_versions_endorsement_id_fkey(id,text,endorsement_ratings(helpfulness)))",
      )
      .eq("status", "published")
      .limit(100);
    if (error)
      throw new AppError(
        503,
        "장소 데이터가 준비되지 않았어요. 데이터베이스 마이그레이션을 확인해 주세요.",
      );
    return (data || []).map((p) => ({
      id: p.id,
      name: p.name,
      category: p.category,
      address: p.address,
      lat: p.lat,
      lng: p.lng,
      tags: [],
      rating: p.place_reviews.length
        ? p.place_reviews.reduce((sum, r) => sum + r.rating, 0) /
          p.place_reviews.length
        : null,
      reviewCount: p.place_reviews.length,
      source: "localroute",
      endorsements: (p.endorsements || []).map((e) => ({
        id: e.id,
        versionId: e.endorsement_versions[0]?.id,
        userId: e.user_id,
        author: "동네 큐레이터",
        text: e.endorsement_versions.at(-1)?.text || "",
        helpfulCount:
          e.endorsement_versions[0]?.endorsement_ratings.length || 0,
      })),
    }));
  }
  async community(
    actor: Actor | null,
    action: string,
    requestId: string | null,
    payload: Record<string, unknown>,
  ) {
    const { data, error } = await this.admin.rpc("community_action", {
      p_actor: actor?.id || null,
      p_action: action,
      p_request_id: requestId,
      p_payload: payload,
    });
    if (error) {
      if (error.code === "42501" || error.code === "28000")
        throw new AppError(403, "이 작업을 할 권한이 없어요.");
      if (error.code === "LR409" || error.code === "23505")
        throw new AppError(
          409,
          "이미 처리되었거나 기존 항목과 겹쳐요. 내용을 새로 확인해 주세요.",
        );
      if (error.code === "LR429")
        throw new AppError(
          429,
          "요청이 많아요. 잠시 후 다시 시도해 주세요.",
          "60",
        );
      if (error.code === "22023" || error.code === "23514")
        throw new AppError(400, "입력 내용과 날짜를 확인해 주세요.");
      throw new AppError(
        503,
        "요청을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
    }
    return data;
  }
  async contribute(
    actor: Actor,
    payload: Contribution,
    providerVenue?: ProviderVenue,
  ) {
    const { data, error } = await this.admin.rpc(
      providerVenue ? "submit_provider_contribution" : "submit_contribution",
      providerVenue
        ? {
            p_user_id: actor.id,
            p_request_id: payload.requestId,
            p_provider: providerVenue,
            p_text: payload.text,
          }
        : {
            p_user_id: actor.id,
            p_request_id: payload.requestId,
            p_place_id: payload.placeId || null,
            p_manual: payload.manualPlace || null,
            p_text: payload.text,
          },
    );
    if (error) {
      if (error.code === "23505")
        throw new AppError(
          409,
          "이미 이 장소를 추천했어요. 기존 추천을 확인해 주세요.",
        );
      if (error.code === "LR409")
        throw new AppError(
          409,
          "요청 내용이 바뀌었어요. 새로 열어 다시 제출해 주세요.",
        );
      if (error.code === "LR429")
        throw new AppError(
          429,
          "추천 요청이 많아요. 잠시 후 다시 시도해 주세요.",
          "60",
        );
      if (error.code === "LR404")
        throw new AppError(404, "장소를 찾을 수 없어요. 다시 선택해 주세요.");
      throw new AppError(
        503,
        "추천을 저장하지 못했어요. 입력 내용은 유지되니 잠시 후 다시 시도해 주세요.",
      );
    }
    return data as { id: string; status: "pending" };
  }
}
