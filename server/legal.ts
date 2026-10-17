import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Express, Request, RequestHandler } from "express";
import { isLocalRouteSupabase } from "../shared/config";
import {
  LEGAL_VERSION,
  legalConsentSchema,
  legalStatusSchema,
  type LegalConsent,
  type LegalStatus,
} from "../shared/legal";
import type { ServerConfig } from "./config";
import { AppError } from "./errors";

export interface LegalStore {
  // Must use server-verified Auth identity, never caller metadata/IDs.
  authenticate(token: string): Promise<string>;
  status(userId: string): Promise<LegalStatus>;
  record(userId: string, consent: LegalConsent): Promise<LegalStatus>;
}

export class SupabaseLegalStore implements LegalStore {
  private client: SupabaseClient;
  constructor(url: string, secret: string) {
    if (!isLocalRouteSupabase(url) || !secret)
      throw new Error(
        "Legal storage requires the LocalRoute Supabase project and a server secret.",
      );
    this.client = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  async authenticate(token: string) {
    const { data, error } = await this.client.auth.getUser(token);
    if (
      error ||
      !data.user?.email ||
      !data.user.email_confirmed_at ||
      data.user.is_anonymous
    )
      throw new AppError(401, "LEGAL_VERIFIED_EMAIL_REQUIRED");
    return data.user.id;
  }
  private async action(userId: string, action: string, payload: unknown = {}) {
    const { data, error } = await this.client.rpc("legal_consent_action", {
      p_actor: userId,
      p_action: action,
      p_payload: payload,
    });
    if (error)
      throw new AppError(
        error.code === "LR409" ? 409 : error.code === "28000" ? 401 : 503,
        "LEGAL_SAVE_FAILED",
      );
    return legalStatusSchema.parse(data);
  }
  status(userId: string) {
    return this.action(userId, "status");
  }
  record(userId: string, consent: LegalConsent) {
    return this.action(userId, "record", legalConsentSchema.parse(consent));
  }
}

export function createLegalStore(
  config: Pick<ServerConfig, "live" | "url" | "secret">,
): LegalStore | undefined {
  if (!isLocalRouteSupabase(config.url) && config.url)
    throw new Error("Legal storage rejects a mismatched Supabase project.");
  return config.live && config.secret && config.url
    ? new SupabaseLegalStore(config.url, config.secret)
    : undefined;
}

export function attachLegal(
  app: Express,
  {
    store,
    limit,
  }: {
    store?: LegalStore;
    limit: (key: string, max: number, seconds: number) => void;
  },
) {
  async function identity(req: Request) {
    if (!store) throw new AppError(503, "LEGAL_UNAVAILABLE");
    const header = req.get("Authorization");
    if (!header?.startsWith("Bearer ") || header.length > 8192)
      throw new AppError(401, "LEGAL_VERIFIED_EMAIL_REQUIRED");
    limit(`legal-auth:${req.ip}`, 60, 60);
    return store.authenticate(header.slice(7));
  }
  app.get("/api/legal", (_req, res) => {
    res.set("Cache-Control", "no-store").json({
      version: LEGAL_VERSION,
      minimumAge: 18,
      documents: ["privacy", "terms", "transfers", "location"],
    });
  });
  app.get("/api/me/legal-consents", async (req, res) => {
    const id = await identity(req);
    res.set("Cache-Control", "no-store").json(await store!.status(id));
  });
  app.post("/api/me/legal-consents", async (req, res) => {
    const id = await identity(req);
    limit(`legal-write:${id}`, 10, 60);
    const consent = legalConsentSchema.safeParse(req.body);
    if (!consent.success) throw new AppError(400, "LEGAL_INVALID_OR_OUTDATED");
    res
      .set("Cache-Control", "no-store")
      .json(await store!.record(id, consent.data));
  });
  // Mount BEFORE protected routes, after attaching the routes above. Public discovery
  // and the consent endpoints must remain reachable without a completed membership.
  const requireConsent: RequestHandler = async (req, _res, next) => {
    try {
      const id = await identity(req);
      if (!(await store!.status(id)).current)
        throw new AppError(403, "LEGAL_CONSENT_REQUIRED");
      next();
    } catch (error) {
      next(error);
    }
  };
  // Legacy profile endpoints must not create a second, unrecorded consent source.
  const requirePublicAreaChoice: RequestHandler = async (req, _res, next) => {
    try {
      const id = await identity(req);
      const status = await store!.status(id);
      if (
        !status.current ||
        req.body?.publicLocalArea !== status.publicLocalArea
      )
        throw new AppError(403, "LEGAL_PUBLIC_AREA_CHOICE_REQUIRED");
      next();
    } catch (error) {
      next(error);
    }
  };
  return { requireConsent, requirePublicAreaChoice };
}
