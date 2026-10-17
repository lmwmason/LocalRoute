import { z } from "zod";
import { AppError } from "./errors";

// Gemini accepts a subset of JSON Schema. Zod's date regex and string-length
// keywords can reject the entire request; retain full validation after output.
export function geminiResponseSchema(schema: z.ZodType): unknown {
  function compatible(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(compatible);
    if (!value || typeof value !== "object") return value;
    const entries = Object.entries(value);
    return Object.fromEntries(
      entries
        .filter(
          ([key]) =>
            ![
              "$schema",
              "pattern",
              "minLength",
              "maxLength",
              "format",
              "minItems",
              "maxItems",
              "additionalProperties",
            ].includes(key),
        )
        .map(([key, entry]) => [
          key,
          key === "properties" && entry && typeof entry === "object"
            ? Object.fromEntries(
                Object.entries(entry).map(([name, child]) => [
                  name,
                  compatible(child),
                ]),
              )
            : compatible(entry),
        ]),
    );
  }
  return compatible(z.toJSONSchema(schema));
}

export class Gemini {
  private used = 0;
  private resets = 0;
  private concurrent = 0;
  constructor(
    private key: string,
    private model: string,
    private fetcher: typeof fetch = fetch,
    private budget = 30,
  ) {}
  async structured<T>(
    schema: z.ZodType<T>,
    system: string,
    data: unknown,
  ): Promise<T> {
    if (Date.now() >= this.resets) {
      this.used = 0;
      this.resets = Date.now() + 3600000;
    }
    if (++this.used > this.budget || this.concurrent >= 2)
      throw new AppError(429, "AI_HOURLY_LIMIT", "60");
    this.concurrent++;
    try {
      let response: Response;
      try {
        response = await this.fetcher(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.model)}:generateContent`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": this.key,
            },
            signal: AbortSignal.timeout(45000),
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: system }] },
              contents: [
                { role: "user", parts: [{ text: JSON.stringify(data) }] },
              ],
              generationConfig: {
                responseMimeType: "application/json",
                responseJsonSchema: geminiResponseSchema(schema),
                temperature: 0.3,
                maxOutputTokens: 8192,
              },
            }),
          },
        );
      } catch {
        throw new AppError(504, "AI_TIMEOUT");
      }
      if (!response.ok)
        throw new AppError(
          response.status === 429 ? 429 : 502,
          response.status === 429 ? "AI_PROVIDER_LIMIT" : "AI_UNAVAILABLE",
        );
      const raw = (await response.json()) as {
        candidates?: {
          finishReason?: string;
          content?: { parts?: { text?: string; thought?: boolean }[] };
        }[];
      };
      const candidate = raw.candidates?.[0];
      if (candidate?.finishReason !== "STOP")
        throw new AppError(502, "AI_INCOMPLETE");
      const text =
        candidate.content?.parts
          ?.filter((p) => !p.thought)
          .map((p) => p.text || "")
          .join("") || "";
      const parsed = schema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new AppError(502, "AI_INVALID_OUTPUT");
      return parsed.data;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(502, "AI_INVALID_OUTPUT");
    } finally {
      this.concurrent--;
    }
  }
}
