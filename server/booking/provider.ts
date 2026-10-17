import { z } from "zod";
import { AppError } from "../errors";
import type { ReservationInput } from "../../shared/reservations";

const resultSchema = z.object({
  success: z.literal(true),
  data: z.object({
    reservationId: z.string().min(1).max(200),
    placeId: z.union([z.string(), z.number()]).transform(String),
    status: z.string().max(64),
    expiresAt: z.iso.datetime({ offset: true }).nullish(),
  }),
});
export type ProviderResult = z.infer<typeof resultSchema>["data"];
export interface BookingProvider {
  venue(
    id: string,
  ): Promise<{
    id: string;
    name: string;
    address: string;
    supported: boolean;
    phone?: string;
  }>;
  submit(
    externalId: string,
    input: ReservationInput,
    key: string,
  ): Promise<ProviderResult>;
  status(reference: string): Promise<ProviderResult>;
}
export class HeyYumiBooking implements BookingProvider {
  private count = 0;
  private reset = 0;
  private blocked = 0;
  constructor(
    private key: string,
    private budget = 30,
    private fetcher: typeof fetch = fetch,
  ) {}
  private async call(path: string, body?: unknown) {
    const now = Date.now();
    if (now >= this.reset) {
      this.count = 0;
      this.reset = now + 3600000;
    }
    if (now < this.blocked || this.count >= this.budget)
      throw new AppError(
        429,
        "booking.limit",
        String(
          Math.max(
            1,
            Math.ceil(
              ((now < this.blocked ? this.blocked : this.reset) - now) / 1000,
            ),
          ),
        ),
      );
    this.count++;
    const response = await this.fetcher(
      `https://api.heyyumi.ai/api/v1/${path}`,
      {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${this.key}`,
          "Content-Type": "application/json",
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(8000),
      },
    );
    if (response.status === 429) {
      const raw = response.headers.get("Retry-After") || "60";
      const seconds = /^\d+$/.test(raw)
        ? Number(raw)
        : Math.ceil((Date.parse(raw) - now) / 1000);
      const delay = Number.isFinite(seconds) ? Math.max(1, seconds) : 60;
      this.blocked = now + delay * 1000;
      throw new AppError(429, "booking.limit", String(delay));
    }
    if (!response.ok)
      throw new AppError(
        response.status === 422 ? 422 : response.status === 404 ? 404 : 503,
        response.status === 422
          ? "booking.unsupported"
          : "booking.providerUnavailable",
      );
    return response.json();
  }
  async venue(id: string) {
    const value = z
      .object({
        success: z.literal(true),
        data: z.object({
          id: z.union([z.string(), z.number()]).transform(String),
          name: z.string().min(1).max(100),
          address: z.object({
            road: z.string().nullish(),
            jibun: z.string().nullish(),
          }),
          yumiReservable: z.boolean().optional(),
          phone: z.string().nullish(),
        }),
      })
      .parse(
        await this.call(
          `places/${encodeURIComponent(id)}?fields=core,contact_hours`,
        ),
      ).data;
    if (value.id !== id) throw new AppError(503, "booking.providerUnavailable");
    return {
      id,
      name: value.name,
      address: value.address.road || value.address.jibun || "",
      supported: value.yumiReservable === true,
      phone: value.phone || undefined,
    };
  }
  async submit(
    placeId: string,
    input: ReservationInput,
    idempotencyKey: string,
  ) {
    return resultSchema.parse(
      await this.call("reservations", {
        placeId,
        reservationTime: input.reservationTime,
        guestCount: input.guestCount,
        guestPhone: input.guestPhone,
        guestName: input.guestName,
        note: input.note,
        idempotencyKey,
      }),
    ).data;
  }
  async status(reference: string) {
    const result = resultSchema.parse(
      await this.call(`reservations/${encodeURIComponent(reference)}`),
    ).data;
    if (result.reservationId !== reference)
      throw new AppError(503, "booking.providerUnavailable");
    return result;
  }
}
