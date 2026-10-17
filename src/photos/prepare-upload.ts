const maxInputBytes = 5 * 1024 * 1024;
export const maxPreparedPhotoBytes = 4 * 1024 * 1024;
const maxPixels = 20_000_000;
function fail(code: "size" | "type" | "dimensions" | "decode"): never {
  throw new Error(`photos.error.${code}`);
}
function dimensions(width: number, height: number, minimum: number) {
  if (
    !width ||
    !height ||
    width * height > maxPixels ||
    Math.min(width, height) < minimum
  )
    fail("dimensions");
  return { width, height };
}
function headerDimensions(bytes: Uint8Array, mime: string, minimum: number) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (mime === "image/png") {
    if (
      bytes.length < 33 ||
      text(1, 3) !== "PNG" ||
      ![137, 80, 78, 71, 13, 10, 26, 10].every(
        (byte, i) => bytes[i] === byte,
      ) ||
      text(12, 4) !== "IHDR"
    )
      fail("type");
    const size = dimensions(view.getUint32(16), view.getUint32(20), minimum);
    for (let offset = 8; offset + 12 <= bytes.length;) {
      const length = view.getUint32(offset),
        kind = text(offset + 4, 4);
      if (offset + length + 12 > bytes.length) fail("decode");
      if (kind === "acTL") fail("type");
      offset += length + 12;
      if (kind === "IEND") break;
    }
    return size;
  }
  if (mime === "image/jpeg") {
    if (
      bytes.length < 4 ||
      bytes[0] !== 255 ||
      bytes[1] !== 216 ||
      bytes[2] !== 255
    )
      fail("type");
    for (let offset = 2; offset + 3 < bytes.length;) {
      if (bytes[offset++] !== 255) fail("decode");
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;
      if (offset + 2 > bytes.length) fail("decode");
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) fail("decode");
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        ![0xc4, 0xc8, 0xcc].includes(marker)
      ) {
        if (length < 8) fail("decode");
        return dimensions(
          view.getUint16(offset + 5),
          view.getUint16(offset + 3),
          minimum,
        );
      }
      offset += length;
    }
    return fail("decode");
  }
  if (mime === "image/webp") {
    if (bytes.length < 20 || text(0, 4) !== "RIFF" || text(8, 4) !== "WEBP")
      fail("type");
    let size: { width: number; height: number } | undefined;
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const kind = text(offset, 4),
        length = view.getUint32(offset + 4, true),
        data = offset + 8;
      if (data + length > bytes.length) fail("decode");
      if (kind === "ANIM" || kind === "ANMF") fail("type");
      if (kind === "VP8X" && length >= 10) {
        if (bytes[data] & 2) fail("type");
        const uint24 = (at: number) =>
          bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16);
        size = dimensions(uint24(data + 4) + 1, uint24(data + 7) + 1, minimum);
      }
      if (kind === "VP8L" && length >= 5 && bytes[data] === 0x2f) {
        const bits = view.getUint32(data + 1, true);
        size = dimensions(
          (bits & 0x3fff) + 1,
          ((bits >>> 14) & 0x3fff) + 1,
          minimum,
        );
      }
      if (
        kind === "VP8 " &&
        length >= 10 &&
        text(data + 3, 3) === "\x9d\x01\x2a"
      )
        size = dimensions(
          view.getUint16(data + 6, true) & 0x3fff,
          view.getUint16(data + 8, true) & 0x3fff,
          minimum,
        );
      offset = data + length + (length % 2);
    }
    return size || fail("decode");
  }
  return fail("type");
}

async function decode(file: File): Promise<{
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
}> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file, {
      imageOrientation: "from-image",
    });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(file),
    image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("decode"));
      image.src = url;
    });
    return {
      source: image,
      width: image.naturalWidth,
      height: image.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

/** Re-encode the selected photograph locally; never upload the original metadata.
 * Server validation remains authoritative. A new File leaves the original intact.
 */
export async function preparePhotoUpload(
  file: File,
  options: { minimumDimension?: number } = {},
): Promise<File> {
  if (!file.size || file.size > maxInputBytes) fail("size");
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    fail("type");
  const minimum = options.minimumDimension ?? 320;
  let decoded: Awaited<ReturnType<typeof decode>> | undefined;
  let canvas: HTMLCanvasElement | undefined;
  try {
    headerDimensions(
      new Uint8Array(await file.arrayBuffer()),
      file.type,
      minimum,
    );
    decoded = await decode(file);
    dimensions(decoded.width, decoded.height, minimum);
    const scale = Math.min(1, 1600 / Math.max(decoded.width, decoded.height));
    const width = Math.round(decoded.width * scale),
      height = Math.round(decoded.height * scale);
    dimensions(width, height, minimum);
    canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) fail("decode");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.drawImage(decoded.source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas!.toBlob(resolve, "image/jpeg", 0.84),
    );
    if (!blob || blob.type !== "image/jpeg" || !blob.size) fail("decode");
    if (blob.size > maxPreparedPhotoBytes) fail("size");
    return new File([blob], "localroute-photo.jpg", { type: "image/jpeg" });
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("photos.error."))
      throw error;
    return fail("decode");
  } finally {
    decoded?.close();
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}
