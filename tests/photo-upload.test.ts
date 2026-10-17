import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import sharp from "sharp";
import {
  maxPreparedPhotoBytes,
  preparePhotoUpload,
} from "../src/photos/prepare-upload";
vi.mock("../src/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "fixture-session" } },
      }),
    },
  },
}));
import { api } from "../src/api";

let png: Buffer, jpeg: Buffer;
const close = vi.fn(),
  drawImage = vi.fn(),
  fillRect = vi.fn();
let output: Blob,
  canvas: {
    width: number;
    height: number;
    getContext: ReturnType<typeof vi.fn>;
    toBlob: ReturnType<typeof vi.fn>;
  };
const file = (bytes = png, type = "image/png") =>
  new File([new Uint8Array(bytes)], "private-original-name.png", {
    type,
    lastModified: 123,
  });
beforeAll(async () => {
  png = await sharp({
    create: { width: 640, height: 480, channels: 3, background: "#4588aa" },
  })
    .png()
    .toBuffer();
  jpeg = await sharp(png).jpeg().toBuffer();
});
beforeEach(() => {
  vi.clearAllMocks();
  output = new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" });
  canvas = {
    width: 0,
    height: 0,
    getContext: vi.fn(() => ({ fillStyle: "", fillRect, drawImage })),
    toBlob: vi.fn((callback: (blob: Blob | null) => void) => callback(output)),
  };
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 640, height: 480, close })),
  );
  vi.stubGlobal("document", { createElement: () => canvas });
});
afterEach(() => vi.unstubAllGlobals());

describe("local upload preparation", () => {
  it("returns a separate bounded JPEG without mutating the selected original", async () => {
    const original = file(),
      before = await original.arrayBuffer();
    const result = await preparePhotoUpload(original);
    expect(result).not.toBe(original);
    expect(result.type).toBe("image/jpeg");
    expect(result.name).toBe("localroute-photo.jpg");
    expect(result.size).toBeLessThanOrEqual(maxPreparedPhotoBytes);
    expect(original.name).toBe("private-original-name.png");
    expect(original.type).toBe("image/png");
    expect(original.lastModified).toBe(123);
    expect(await original.arrayBuffer()).toEqual(before);
    expect(canvas.toBlob.mock.calls[0].slice(1)).toEqual(["image/jpeg", 0.84]);
    expect(close).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(0);
    expect(canvas.height).toBe(0);
  });

  it.each([
    "oversized",
    "empty",
    "unsupported",
    "spoofed",
    "too_many_pixels",
    "tiny",
  ])("rejects %s before allocating a decoded bitmap", async (kind) => {
    let input = file(),
      code = "photos.error.type";
    if (kind === "oversized") {
      input = file(Buffer.alloc(5 * 1024 * 1024 + 1));
      code = "photos.error.size";
    }
    if (kind === "empty") {
      input = file(Buffer.alloc(0));
      code = "photos.error.size";
    }
    if (kind === "unsupported")
      input = file(Buffer.from("<svg/>"), "image/svg+xml");
    if (kind === "spoofed") input = file(png, "image/jpeg");
    if (kind === "too_many_pixels" || kind === "tiny") {
      const bytes = Buffer.from(png);
      bytes.writeUInt32BE(kind === "tiny" ? 100 : 5000, 16);
      bytes.writeUInt32BE(kind === "tiny" ? 100 : 5000, 20);
      input = file(bytes);
      code = "photos.error.dimensions";
    }
    await expect(preparePhotoUpload(input)).rejects.toThrow(code);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("rejects animated PNG markers before decoding a frame", async () => {
    const bytes = Buffer.concat([
      png.subarray(0, 33),
      Buffer.from("000000086163544c000000020000000000000000", "hex"),
      png.subarray(33),
    ]);
    await expect(preparePhotoUpload(file(bytes))).rejects.toThrow(
      "photos.error.type",
    );
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it("rejects corrupt image data without exposing decoder details", async () => {
    vi.mocked(createImageBitmap).mockRejectedValueOnce(
      new Error("private decoder detail"),
    );
    await expect(preparePhotoUpload(file())).rejects.toThrow(
      "photos.error.decode",
    );
  });

  it("does not enlarge small valid photographs and refuses a panorama that would become too small", async () => {
    await preparePhotoUpload(file());
    expect(drawImage.mock.calls[0].slice(1)).toEqual([0, 0, 640, 480]);
    vi.mocked(createImageBitmap).mockResolvedValueOnce({
      width: 500,
      height: 4000,
      close,
    } as unknown as ImageBitmap);
    await expect(preparePhotoUpload(file())).rejects.toThrow(
      "photos.error.dimensions",
    );
    expect(close).toHaveBeenCalledTimes(2);
  });

  it.each(["too_large", "null", "wrong_type"])(
    "never returns an unsafe encoder result: %s",
    async (kind) => {
      if (kind === "too_large")
        output = new Blob([Buffer.alloc(maxPreparedPhotoBytes + 1)], {
          type: "image/jpeg",
        });
      if (kind === "wrong_type")
        output = new Blob(["not-jpeg"], { type: "image/png" });
      if (kind === "null")
        canvas.toBlob.mockImplementationOnce(
          (callback: (blob: Blob | null) => void) => callback(null),
        );
      await expect(preparePhotoUpload(file())).rejects.toThrow(
        kind === "too_large" ? "photos.error.size" : "photos.error.decode",
      );
      expect(close).toHaveBeenCalledOnce();
    },
  );
});

describe("place upload network boundary", () => {
  it("uploads only the locally prepared bytes and keeps existing consent/target headers", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "photo-fixture" })),
      );
    vi.stubGlobal("fetch", fetcher);
    const original = file(),
      target = { placeId: "place-fixture" };
    expect(await api.uploadPhoto("request-fixture", target, original)).toEqual({
      id: "photo-fixture",
    });
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/place-photos/request-fixture");
    expect(init?.headers).toMatchObject({
      "Content-Type": "image/jpeg",
      "X-Place-Target": encodeURIComponent(JSON.stringify(target)),
      "X-Photo-Consent": "real-place-photo-v1",
      Authorization: "Bearer fixture-session",
    });
    expect(init?.body).toBeInstanceOf(File);
    expect(init?.body).not.toBe(original);
    expect(await (init!.body as File).arrayBuffer()).toEqual(
      await output.arrayBuffer(),
    );
  });

  it("does not call any API when preparation fails and preserves the original selection", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    const original = file(),
      before = await original.arrayBuffer();
    output = new Blob([Buffer.alloc(maxPreparedPhotoBytes + 1)], {
      type: "image/jpeg",
    });
    await expect(
      api.uploadPhoto("request-fixture", {}, original),
    ).rejects.toThrow("photos.error.size");
    expect(fetcher).not.toHaveBeenCalled();
    expect(await original.arrayBuffer()).toEqual(before);
  });
});
