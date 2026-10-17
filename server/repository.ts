import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Contribution, Place } from "../shared/domain";
import type { ServerConfig } from "./config";
import { AppError } from "./errors";
import type { ProviderVenue } from "./heyyumi";
import type { PhotoTarget, ProcessedPhoto } from "./photos";
import { localitySchema } from "../shared/locality";

export type Actor = { id: string; role: "traveler" | "moderator" | "admin" };
export interface Repository {
  shares(
    actor: Actor | null,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
  bookingProfile(
    actor: Actor,
    action: string,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
  uploadPhoto(
    actor: Actor,
    requestId: string,
    target: PhotoTarget,
    photo: ProcessedPhoto,
  ): Promise<{ id: string }>;
  photo(actor: Actor | null, id: string): Promise<Buffer>;
  planning(
    actor: Actor,
    action: string,
    requestId: string | null,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
  community(
    actor: Actor | null,
    action: string,
    requestId: string | null,
    payload: Record<string, unknown>,
  ): Promise<unknown>;
  authenticate(token: string): Promise<Actor>;
  places(id?: string, center?: { lat: number; lng: number }): Promise<Place[]>;
  contribute(
    actor: Actor,
    payload: Contribution,
    providerVenue?: ProviderVenue,
  ): Promise<{ id: string; status: "pending" }>;
}
export class SupabaseRepository implements Repository {
  async shares(
    actor: Actor | null,
    action: string,
    payload: Record<string, unknown>,
  ) {
    const { data, error } = await this.admin.rpc("itinerary_share_action", {
      p_actor: actor?.id || null,
      p_action: action,
      p_payload: payload,
    });
    if (error)
      throw new AppError(
        error.code === "LR404"
          ? 404
          : error.code === "LR409"
            ? 409
            : error.code === "LR429"
              ? 429
              : 503,
        error.code === "LR404"
          ? "sharing.unavailable"
          : error.code === "LR409"
            ? "sharing.changed"
            : error.code === "LR429"
              ? "sharing.limit"
              : "sharing.failed",
      );
    return data;
  }
  async bookingProfile(
    actor: Actor,
    action: string,
    payload: Record<string, unknown>,
  ) {
    const { data, error } = await this.admin.rpc("booking_profile_action", {
      p_actor: actor.id,
      p_action: action,
      p_payload: payload,
    });
    if (error)
      throw new AppError(
        error.code === "22023" ? 400 : 503,
        error.code === "22023"
          ? "booking.invalidProfile"
          : "booking.profileUnavailable",
      );
    return data;
  }
  async uploadPhoto(
    actor: Actor,
    requestId: string,
    target: PhotoTarget,
    photo: ProcessedPhoto,
  ) {
    const { data: record, error } = await this.admin.rpc(
      "register_place_photo",
      {
        p_actor: actor.id,
        p_request_id: requestId,
        p_target: target,
        p_sha256: photo.sha256,
        p_width: photo.width,
        p_height: photo.height,
      },
    );
    if (error)
      throw new AppError(
        error.code === "LR409" ? 409 : error.code === "LR429" ? 429 : 503,
        error.code === "LR409"
          ? "photos.error.conflict"
          : error.code === "LR410"
            ? "photos.error.expired"
            : "photos.error.upload",
      );
    if (record.state === "ready" || record.state === "linked")
      return { id: record.id as string };
    const uploaded = await this.admin.storage
      .from("place-photos")
      .upload(record.object_path, photo.data, {
        contentType: "image/jpeg",
        upsert: true,
        cacheControl: "0",
      });
    if (uploaded.error) throw new AppError(503, "photos.error.upload");
    const ready = await this.admin
      .from("place_photos")
      .update({ state: "ready" })
      .eq("id", record.id)
      .eq("state", "uploading")
      .select("id")
      .single();
    if (ready.error) {
      // Another identical upload may already have completed. Never overwrite a linked state.
      const replay = await this.admin
        .from("place_photos")
        .select("id,state")
        .eq("id", record.id)
        .single();
      if (replay.error || !["ready", "linked"].includes(replay.data.state))
        throw new AppError(503, "photos.error.upload");
    }
    return { id: record.id as string };
  }
  async photo(actor: Actor | null, id: string) {
    const { data, error } = await this.admin
      .from("place_photos")
      .select(
        "object_path,user_id,state,review,expires_at,place_id,places(status)",
      )
      .eq("id", id)
      .maybeSingle();
    if (error) throw new AppError(503, "photos.error.load");
    const place = data?.places as unknown as { status: string } | null;
    const publicPhoto =
      data?.state === "linked" &&
      data.review === "approved" &&
      place?.status === "published";
    const ownPhoto =
      actor?.id === data?.user_id &&
      data?.state !== "expired" &&
      (data?.state === "linked" ||
        Date.parse(data?.expires_at || "") > Date.now());
    const moderationPhoto =
      actor &&
      ["moderator", "admin"].includes(actor.role) &&
      data?.state === "linked";
    if (
      !data ||
      !["ready", "linked"].includes(data.state) ||
      (!publicPhoto && !ownPhoto && !moderationPhoto)
    )
      throw new AppError(404, "photos.error.load");
    const downloaded = await this.admin.storage
      .from("place-photos")
      .download(data.object_path);
    if (downloaded.error) throw new AppError(404, "photos.error.load");
    return Buffer.from(await downloaded.data.arrayBuffer());
  }
  async planning(
    actor: Actor,
    action: string,
    requestId: string | null,
    payload: Record<string, unknown>,
  ) {
    const { data, error } = await this.admin.rpc("planning_action", {
      p_actor: actor.id,
      p_action: action,
      p_request_id: requestId,
      p_payload: payload,
    });
    if (error) {
      const status: Record<string, number> = {
        LR402: 402,
        LR404: 404,
        LR409: 409,
        LR410: 410,
        LR429: 429,
        LR503: 503,
        "42501": 403,
        "22023": 400,
      };
      throw new AppError(
        status[error.code] || 503,
        (
          {
            LR402: "INSUFFICIENT_LP",
            LR409: "REQUEST_CONFLICT",
            LR410: "REQUEST_EXPIRED",
            LR503: "PLANNING_DISABLED",
            LR404: "REQUEST_NOT_FOUND",
          } as Record<string, string>
        )[error.code] || "PLANNING_STORAGE_UNAVAILABLE",
      );
    }
    return data;
  }
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
    if (
      error ||
      !data.user ||
      data.user.is_anonymous ||
      !data.user.email_confirmed_at
    )
      throw new AppError(401, "로그인 후 이용해 주세요.");
    const rawRegion = data.user.user_metadata?.home_region;
    const locality = localitySchema.safeParse({
      homeCity: data.user.user_metadata?.home_city,
      homeArea: data.user.user_metadata?.home_area,
      localityScope: data.user.user_metadata?.locality_scope,
    });
    const homeRegion =
      typeof rawRegion === "string" &&
      rawRegion.trim().length >= 2 &&
      rawRegion.trim().length <= 100
        ? rawRegion.trim()
        : null;
    // User metadata is only a self-declared profile field, never a role or residency proof.
    await this.community(
      { id: data.user.id, role: "traveler" },
      "onboard_profile",
      null,
      {
        displayName: "Local explorer",
        homeRegion,
        ...(locality.success ? locality.data : {}),
        publicLocalArea: data.user.user_metadata?.public_local_area === true,
      },
    );
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
  async places(
    id?: string,
    center?: { lat: number; lng: number },
  ): Promise<Place[]> {
    let query = this.auth
      .from("places")
      .select(
        "id,name,kind,category,address,lat,lng,created_at,place_reviews(rating,verification_state),endorsements!endorsements_place_id_fkey(id,user_id,endorsement_versions!endorsement_versions_endorsement_id_fkey(id,text,endorsement_ratings(helpfulness)))",
      )
      .eq("status", "published")
      .limit(100);
    if (id) query = query.eq("id", id);
    if (center)
      query = query
        .gte("lat", center.lat - 0.05)
        .lte("lat", center.lat + 0.05)
        .gte("lng", center.lng - 0.065)
        .lte("lng", center.lng + 0.065);
    const { data, error } = await query;
    if (error)
      throw new AppError(
        503,
        "장소 데이터가 준비되지 않았어요. 데이터베이스 마이그레이션을 확인해 주세요.",
      );
    const ids = (data || []).map((p) => p.id);
    const userIds = [
      ...new Set(
        (data || []).flatMap((p) => p.endorsements.map((e) => e.user_id)),
      ),
    ];
    const [photos, identities] = await Promise.all([
      ids.length
        ? this.admin
            .from("place_photos")
            .select("id,place_id,width,height")
            .in("place_id", ids)
            .eq("state", "linked")
            .eq("review", "approved")
            .order("created_at")
        : Promise.resolve({ data: [], error: null }),
      userIds.length
        ? this.auth
            .from("curator_identities")
            .select("user_id,display_name,local_area_label")
            .in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (photos.error || identities.error)
      throw new AppError(503, "장소 사진과 추천자 정보를 불러오지 못했어요.");
    return (data || []).map((p) => ({
      photo: (() => {
        const photo = photos.data?.find((ph) => ph.place_id === p.id);
        return photo
          ? {
              id: photo.id,
              width: photo.width,
              height: photo.height,
              source: "contributor" as const,
              review: "approved" as const,
            }
          : undefined;
      })(),
      id: p.id,
      kind: p.kind,
      observedAt: p.created_at,
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
        author:
          identities.data?.find((identity) => identity.user_id === e.user_id)
            ?.display_name || "동네 큐레이터",
        localArea:
          identities.data?.find((identity) => identity.user_id === e.user_id)
            ?.local_area_label || undefined,
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
      payload.menuDraft
        ? "submit_contribution_with_menu"
        : "submit_photographed_contribution",
      {
        p_actor: actor.id,
        p_request_id: payload.requestId,
        p_payload: payload,
        p_provider: providerVenue || null,
      },
    );
    if (error) {
      if (error.code === "22023")
        throw new AppError(400, "photos.error.required");
      if (error.code === "LR422")
        throw new AppError(400, "profile.regionRequired");
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
