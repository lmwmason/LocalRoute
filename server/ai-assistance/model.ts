import { Gemini } from "../gemini";
import { z } from "zod";

export type AssistanceModel = Pick<Gemini, "structured"> & { modelId: string };
const imageEnvelope = z.strictObject({
  task: z.literal("menu-visible-v1"),
  language: z.enum(["ko", "en"]),
  image: z.strictObject({
    mimeType: z.literal("image/jpeg"),
    data: z.string().min(1).max(7_000_000),
  }),
});

/** Reuse the existing Gemini client's schema, finish-reason and budget checks.
 * Its text-only contents are converted to an actual multimodal Part here.
 */
export function createAssistanceModel(options: {
  key: string;
  model: string;
  budget?: number;
  timeoutMs?: number;
  fetcher?: typeof fetch;
}): AssistanceModel {
  if (typeof window !== "undefined")
    throw new Error("AI assistance is server-only");
  const key = z.string().trim().min(1).parse(options.key);
  const model = z
    .string()
    .regex(/^[A-Za-z0-9._-]{1,100}$/)
    .parse(options.model);
  const timeout = z
    .number()
    .int()
    .min(1)
    .max(45000)
    .parse(options.timeoutMs ?? 15000);
  const upstream = options.fetcher ?? fetch;
  const transport: typeof fetch = async (url, init) => {
    const endpoint = new URL(String(url));
    if (
      endpoint.origin !== "https://generativelanguage.googleapis.com" ||
      endpoint.pathname !== `/v1beta/models/${model}:generateContent`
    )
      throw new Error("AI_TRANSPORT_DESTINATION");
    const body = JSON.parse(String(init?.body));
    const payload = JSON.parse(body.contents[0].parts[0].text);
    if (payload.task === "menu-visible-v1") {
      const { image, ...data } = imageEnvelope.parse(payload);
      body.contents[0].parts = [
        { text: JSON.stringify(data) },
        { inlineData: image },
      ];
    }
    return upstream(url, {
      ...init,
      body: JSON.stringify(body),
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.any([
        ...(init?.signal ? [init.signal] : []),
        AbortSignal.timeout(timeout),
      ]),
    });
  };
  const client = new Gemini(
    key,
    model,
    transport,
    z
      .number()
      .int()
      .min(0)
      .max(10000)
      .parse(options.budget ?? 0),
  );
  return { modelId: model, structured: client.structured.bind(client) };
}
