import { setTimeout, clearTimeout } from "node:timers";
import { z } from "zod";
import {
  transportRequestSchema,
  type TransportLegResult,
  type TransportReason,
  type TransportRequest,
  type TransportSource,
} from "../../shared/transport";
import { parseProviderRoute, RouteResponseError, routeUrl } from "./providers";

export { validateTransportGap } from "../../shared/transport";
export type {
  TransportLegResult,
  TransportRequest,
} from "../../shared/transport";

const optionsSchema = z.object({
  enabled: z.boolean().default(false),
  carKey: z.string().optional(),
  transitKey: z.string().optional(),
  maxCalls: z.number().int().min(0).max(10000).default(0),
  budgetWindowMs: z.number().int().min(1000).max(86400000).default(3600000),
  timeoutMs: z.number().int().min(1).max(30000).default(5000),
});
export type RoutingOptions = z.input<typeof optionsSchema> & {
  fetcher?: typeof fetch;
  now?: () => number;
};

/** Server-only, opt-in adapter. Keep one instance per process/account budget.
 * No cache, database, telemetry, proxies or automatic retries.
 */
export function createKakaoRouting(options: RoutingOptions = {}) {
  if (typeof window !== "undefined")
    throw new Error("Routing must run on the server.");
  const config = optionsSchema.parse(options);
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  let calls = 0,
    resetAt = 0;
  const blockedUntil = new Map<string, number>();
  const pending = new Map<string, Promise<TransportLegResult>>();

  async function run(request: TransportRequest): Promise<TransportLegResult> {
    const start = now();
    const supported = request.mode === "car" || request.mode === "transit";
    const source: TransportSource = {
      provider:
        request.mode === "car"
          ? "kakao_mobility"
          : request.mode === "transit"
            ? "kakao_maps"
            : "none",
      documentationUrl:
        request.mode === "car"
          ? "https://developers.kakaomobility.com/guide/navi-api/directions"
          : request.mode === "transit"
            ? "https://developers.kakao.com/docs/ko/kakaomap/rest-api"
            : null,
      requestedAt: new Date(start).toISOString(),
      checkedAt: new Date(start).toISOString(),
      attempted: false,
    };
    const unknown = (
      reason: TransportReason,
      retryAfterSeconds?: number,
    ): TransportLegResult => ({
      request,
      source: { ...source, checkedAt: new Date(now()).toISOString() },
      status: "unverified",
      reason,
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
      timeBasis: "lookup_time",
      arrivalGuaranteed: false,
      accessibility: "unverified",
      distanceMeters: null,
      durationSeconds: null,
      transfers: null,
      walking: null,
      steps: [],
      fare: null,
    });
    if (!supported) return unknown("unsupported_mode");
    const key = (
      request.mode === "car" ? config.carKey : config.transitKey
    )?.trim();
    if (!config.enabled || !key) return unknown("disabled");
    const until = blockedUntil.get(request.mode) ?? 0;
    if (start < until)
      return unknown("rate_limited", Math.ceil((until - start) / 1000));
    if (start >= resetAt) {
      calls = 0;
      resetAt = start + config.budgetWindowMs;
    }
    if (calls >= config.maxCalls)
      return unknown("budget_exceeded", Math.ceil((resetAt - start) / 1000));
    calls++;
    source.attempted = true;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      // Race the entire operation including response body; injected fetchers need
      // not implement abort for this deadline to resolve safely.
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          controller.abort();
          reject(new Error("ROUTE_TIMEOUT"));
        }, config.timeoutMs);
      });
      const operation = async (): Promise<TransportLegResult> => {
        const response = await fetcher(routeUrl(request), {
          method: "GET",
          headers: {
            Authorization: `KakaoAK ${key}`,
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          redirect: "error",
          cache: "no-store",
        });
        if (timedOut) return unknown("timeout");
        if (response.status === 401 || response.status === 403)
          return unknown("unauthorized");
        if (response.status === 429) {
          const retry = retryAfter(response.headers.get("Retry-After"), now());
          blockedUntil.set(request.mode, now() + retry * 1000);
          return unknown("rate_limited", retry);
        }
        if (response.status >= 500) return unknown("provider_unavailable");
        if (response.status === 404) return unknown("no_results");
        if (!response.ok) return unknown("invalid_request");
        let body: unknown;
        try {
          body = await response.json();
        } catch {
          return unknown("invalid_response");
        }
        return parseProviderRoute(body, request, {
          ...source,
          checkedAt: new Date(now()).toISOString(),
        });
      };
      return await Promise.race([operation(), deadline]);
    } catch (error) {
      if (timedOut) return unknown("timeout");
      if (error instanceof RouteResponseError) return unknown(error.reason);
      // Never forward exception messages, raw bodies, coordinates or keys.
      return unknown("provider_unavailable");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  return {
    lookup(input: TransportRequest): Promise<TransportLegResult> {
      const request = transportRequestSchema.parse(input);
      const id = JSON.stringify(request);
      const existing = pending.get(id);
      if (existing) return existing;
      const promise = run(request).finally(() => pending.delete(id));
      pending.set(id, promise);
      return promise;
    },
  };
}

/** Missing/invalid Retry-After uses a local 60s cooldown, not a provider claim. */
function retryAfter(value: string | null, now: number): number {
  if (value !== null && /^\d+$/.test(value.trim())) {
    const seconds = Number(value.trim());
    if (Number.isFinite(seconds))
      return Math.min(seconds, Number.MAX_SAFE_INTEGER / 1000);
  }
  const date = value === null ? NaN : Date.parse(value);
  return Number.isFinite(date)
    ? Math.max(0, Math.ceil((date - now) / 1000))
    : 60;
}
