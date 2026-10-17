import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { AppError } from "./errors";
import type { ProviderVenue } from "./heyyumi";

export function candidateSigner(
  secret = randomBytes(32).toString("hex"),
  now = () => Date.now(),
) {
  function sign(text: string) {
    return createHmac("sha256", secret).update(text).digest("base64url");
  }
  return {
    issue(venue: ProviderVenue) {
      const data = Buffer.from(
        JSON.stringify({ venue, expires: now() + 10 * 60000 }),
      ).toString("base64url");
      return `${data}.${sign(data)}`;
    },
    verify(token: string): ProviderVenue {
      const [data, signature, ...rest] = token.split(".");
      const expected = sign(data || "");
      if (
        !signature ||
        rest.length ||
        signature.length !== expected.length ||
        !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
      )
        throw new AppError(
          400,
          "장소 선택을 확인하지 못했어요. 다시 검색해 주세요.",
        );
      try {
        const parsed = JSON.parse(Buffer.from(data, "base64url").toString());
        if (typeof parsed.expires !== "number" || parsed.expires <= now())
          throw new Error("expired");
        return parsed.venue as ProviderVenue;
      } catch {
        throw new AppError(
          400,
          "검색 결과가 만료되었어요. 다시 검색해 주세요.",
        );
      }
    },
  };
}
