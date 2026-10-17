import type {
  VisitDecisionInput,
  VisitRequestInput,
  VisitRewardPolicy,
  VisitRewardRequest,
  VisitTarget,
} from "../../shared/visit-rewards";
export interface VisitRewardsApi {
  targets(): Promise<VisitTarget[]>;
  list(): Promise<VisitRewardRequest[]>;
  policy(): Promise<VisitRewardPolicy>;
  submit(input: VisitRequestInput): Promise<VisitRewardRequest>;
  queue(): Promise<VisitRewardRequest[]>;
  decide(input: VisitDecisionInput): Promise<VisitRewardRequest>;
  issue(id: string): Promise<VisitRewardRequest>;
}
export class VisitRewardsApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function createVisitRewardsApi(
  token: () => Promise<string | undefined>,
  fetcher: typeof fetch = fetch,
): VisitRewardsApi {
  async function call<T>(path: string, body?: unknown): Promise<T> {
    const access = await token();
    const res = await fetcher(`/api/visit-rewards/${path}`, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const data = await res.json();
    if (!res.ok)
      throw new VisitRewardsApiError(
        res.status,
        typeof data.error === "string" ? data.error : "visit.unavailable",
      );
    return data as T;
  }
  return {
    targets: () => call("targets"),
    list: () => call("requests"),
    policy: () => call("policy"),
    submit: (body) => call("requests", body),
    queue: () => call("admin/queue"),
    decide: (body) => call("admin/decisions", body),
    issue: (id) => call(`admin/requests/${encodeURIComponent(id)}/issue`, {}),
  };
}
