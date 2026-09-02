import {
  OcrCaptureGeometryError,
  planScreenshotCrop,
} from "./capture-geometry.js";

const PNG_DATA_URL_PREFIX = "data:image/png;base64,";
const PNG_MIME_TYPE = "image/png";
const PNG_SIGNATURE = Object.freeze([137, 80, 78, 71, 13, 10, 26, 10]);

export const OCR_CAPTURE_IMAGE_LIMITS = Object.freeze({
  maxInputCharacters: 24 * 1024 * 1024,
  maxDecodedBytes: 16 * 1024 * 1024,
  maxImagePixels: 40 * 1024 * 1024,
  maxCropPixels: 16 * 1024 * 1024,
  maxOutputBytes: 8 * 1024 * 1024,
});

export const OCR_CAPTURE_OUTPUT_FORMATS = Object.freeze([
  "blob",
  "data-url",
  "blob-url",
]);

export class OcrCaptureImageError extends Error {
  constructor(
    message,
    { code = "OCR_CAPTURE_IMAGE_FAILED", details = null, cause = null } = {},
  ) {
    super(message);
    this.name = "OcrCaptureImageError";
    this.code = code;
    this.details = details;
    if (cause !== null) this.cause = cause;
  }
}

function imageError(message, code, details = null, cause = null) {
  return new OcrCaptureImageError(message, { code, details, cause });
}

function requireRecord(value, label, code = "OCR_CAPTURE_INPUT_INVALID") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw imageError(`${label}の形式が不正です。`, code);
  }
  return value;
}

function readProperties(record, keys, label, code = "OCR_CAPTURE_INPUT_INVALID") {
  const values = {};
  try {
    for (const key of keys) values[key] = record[key];
  } catch (cause) {
    throw imageError(`${label}を読み取れません。`, code, null, cause);
  }
  return values;
}

function readDependency(dependencies, key, fallback) {
  let value;
  try {
    value = dependencies?.[key];
  } catch (cause) {
    throw imageError(
      `${key}依存関係を読み取れません。`,
      "OCR_CAPTURE_DEPENDENCY_INVALID",
      Object.freeze({ dependency: key }),
      cause,
    );
  }
  return value === undefined ? fallback : value;
}

function requireFunction(value, key, code = "OCR_CAPTURE_DEPENDENCY_INVALID") {
  if (typeof value !== "function") {
    throw imageError(
      `${key}を利用できません。`,
      code,
      Object.freeze({ dependency: key }),
    );
  }
  return value;
}

function resolveLimits(overrides) {
  if (overrides !== undefined && (!overrides || typeof overrides !== "object" || Array.isArray(overrides))) {
    throw imageError("limitsの形式が不正です。", "OCR_CAPTURE_LIMIT_INVALID");
  }

  const resolved = {};
  for (const [key, hardMaximum] of Object.entries(OCR_CAPTURE_IMAGE_LIMITS)) {
    let value;
    try {
      value = overrides?.[key] ?? hardMaximum;
    } catch (cause) {
      throw imageError(
        `limits.${key}を読み取れません。`,
        "OCR_CAPTURE_LIMIT_INVALID",
        Object.freeze({ limit: key }),
        cause,
      );
    }
    if (!Number.isSafeInteger(value) || value <= 0 || value > hardMaximum) {
      throw imageError(
        `limits.${key}は1以上${hardMaximum}以下の整数で指定してください。`,
        "OCR_CAPTURE_LIMIT_INVALID",
        Object.freeze({ limit: key, hardMaximum }),
      );
    }
    resolved[key] = value;
  }
  return Object.freeze(resolved);
}

function checkedPixelCount(width, height, maximum, code, label) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw imageError(`${label}の寸法が不正です。`, "OCR_CAPTURE_IMAGE_DIMENSIONS_INVALID");
  }
  if (width > Math.floor(maximum / height)) {
    throw imageError(
      `${label}のピクセル数が上限を超えています。`,
      code,
      Object.freeze({ width, height, maximum }),
    );
  }
  return width * height;
}

function readUint32(bytes, offset) {
  return (
    (bytes[offset] * 0x1000000)
    + (bytes[offset + 1] << 16)
    + (bytes[offset + 2] << 8)
    + bytes[offset + 3]
  );
}

function inspectPngHeader(bytes) {
  if (bytes.byteLength < 33) {
    throw imageError("PNGデータが途中で切れています。", "OCR_CAPTURE_PNG_INVALID");
  }
  if (PNG_SIGNATURE.some((value, index) => bytes[index] !== value)) {
    throw imageError("PNGシグネチャが不正です。", "OCR_CAPTURE_PNG_INVALID");
  }
  const ihdrLength = readUint32(bytes, 8);
  const hasIhdr = bytes[12] === 73 && bytes[13] === 72 && bytes[14] === 68 && bytes[15] === 82;
  if (ihdrLength !== 13 || !hasIhdr) {
    throw imageError("PNGのIHDRチャンクが不正です。", "OCR_CAPTURE_PNG_INVALID");
  }
  const width = readUint32(bytes, 16);
  const height = readUint32(bytes, 20);
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) {
    throw imageError("PNGの画像寸法が不正です。", "OCR_CAPTURE_PNG_INVALID");
  }
  return Object.freeze({ width, height });
}

function canonicalBase64Payload(dataUrl, limits) {
  if (typeof dataUrl !== "string") {
    throw imageError("スクリーンショットはPNG Data URLで指定してください。", "OCR_CAPTURE_DATA_URL_INVALID");
  }
  if (dataUrl.length > limits.maxInputCharacters) {
    throw imageError(
      "スクリーンショットData URLが文字数上限を超えています。",
      "OCR_CAPTURE_INPUT_CHAR_LIMIT",
      Object.freeze({ maximum: limits.maxInputCharacters }),
    );
  }
  if (!dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
    throw imageError(
      "data:image/png;base64形式以外は受け付けません。",
      "OCR_CAPTURE_DATA_URL_INVALID",
    );
  }

  const payload = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
  const canonicalBase64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
  if (!payload || !canonicalBase64.test(payload)) {
    throw imageError("PNGのBase64表現が不正です。", "OCR_CAPTURE_BASE64_INVALID");
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const estimatedBytes = (payload.length / 4) * 3 - padding;
  if (!Number.isSafeInteger(estimatedBytes) || estimatedBytes <= 0) {
    throw imageError("PNGのBase64表現が不正です。", "OCR_CAPTURE_BASE64_INVALID");
  }
  if (estimatedBytes > limits.maxDecodedBytes) {
    throw imageError(
      "デコード後のPNGが容量上限を超えています。",
      "OCR_CAPTURE_DECODED_BYTE_LIMIT",
      Object.freeze({ estimatedBytes, maximum: limits.maxDecodedBytes }),
    );
  }
  return payload;
}

function defaultDecodeBase64(payload) {
  const decode = requireFunction(globalThis.atob, "atob");
  const binary = decode(payload);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function normalizeDecodedBytes(value) {
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  throw imageError(
    "Base64 decoderはArrayBufferまたはTypedArrayを返す必要があります。",
    "OCR_CAPTURE_DECODE_FAILED",
  );
}

function defaultCreateCanvas(width, height) {
  if (typeof globalThis.OffscreenCanvas === "function") {
    return new globalThis.OffscreenCanvas(width, height);
  }
  if (globalThis.document && typeof globalThis.document.createElement === "function") {
    const canvas = globalThis.document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw imageError("画像切り出し用Canvasを利用できません。", "OCR_CAPTURE_CANVAS_UNAVAILABLE");
}

function defaultEncodeBase64(bytes) {
  const encode = requireFunction(globalThis.btoa, "btoa");
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < bytes.byteLength; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return encode(binary);
}

function closeBitmap(bitmap) {
  if (!bitmap) return;
  try {
    if (typeof bitmap.close === "function") bitmap.close();
  } catch {
    // A cleanup failure must not hide the original typed failure or leak a
    // successfully created Blob URL from the caller's revoke handle.
  }
}

function validateBitmap(bitmap, expected, limits) {
  if (!bitmap || typeof bitmap !== "object") {
    throw imageError("デコード済み画像の形式が不正です。", "OCR_CAPTURE_BITMAP_INVALID");
  }
  let width;
  let height;
  let close;
  try {
    width = bitmap.width;
    height = bitmap.height;
    close = bitmap.close;
  } catch (cause) {
    throw imageError(
      "デコード済み画像の寸法を読み取れません。",
      "OCR_CAPTURE_BITMAP_INVALID",
      null,
      cause,
    );
  }
  if (typeof close !== "function") {
    throw imageError("デコード済み画像を安全に破棄できません。", "OCR_CAPTURE_BITMAP_INVALID");
  }
  checkedPixelCount(
    width,
    height,
    limits.maxImagePixels,
    "OCR_CAPTURE_IMAGE_PIXEL_LIMIT",
    "スクリーンショット",
  );
  if (width !== expected.width || height !== expected.height) {
    throw imageError(
      "PNGヘッダーとデコード済み画像の寸法が一致しません。",
      "OCR_CAPTURE_PNG_DIMENSION_MISMATCH",
      Object.freeze({ header: expected, decoded: Object.freeze({ width, height }) }),
    );
  }
  return Object.freeze({ width, height });
}

async function exportCanvasPng(canvas) {
  let blob;
  try {
    if (typeof canvas.convertToBlob === "function") {
      blob = await canvas.convertToBlob({ type: PNG_MIME_TYPE });
    } else if (typeof canvas.toBlob === "function") {
      blob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob(resolve, PNG_MIME_TYPE);
        } catch (cause) {
          reject(cause);
        }
      });
    } else {
      throw imageError(
        "CanvasからPNG Blobを生成できません。",
        "OCR_CAPTURE_CANVAS_EXPORT_UNAVAILABLE",
      );
    }
  } catch (cause) {
    if (cause instanceof OcrCaptureImageError) throw cause;
    throw imageError(
      "切り出し画像のPNG生成に失敗しました。",
      "OCR_CAPTURE_CANVAS_EXPORT_FAILED",
      null,
      cause,
    );
  }
  return blob;
}

function validateOutputBlob(blob, limits) {
  let size;
  let type;
  try {
    size = blob?.size;
    type = blob?.type;
  } catch (cause) {
    throw imageError("生成されたPNG Blobを検証できません。", "OCR_CAPTURE_OUTPUT_INVALID", null, cause);
  }
  if (
    !Number.isSafeInteger(size)
    || size <= 0
    || typeof type !== "string"
    || type.toLowerCase() !== PNG_MIME_TYPE
  ) {
    throw imageError("Canvasが有効なPNG Blobを返しませんでした。", "OCR_CAPTURE_OUTPUT_INVALID");
  }
  if (size > limits.maxOutputBytes) {
    throw imageError(
      "切り出しPNGが出力容量上限を超えています。",
      "OCR_CAPTURE_OUTPUT_BYTE_LIMIT",
      Object.freeze({ size, maximum: limits.maxOutputBytes }),
    );
  }
  return blob;
}

async function pngBlobToDataUrl(blob, limits, dependencies) {
  if (typeof blob.arrayBuffer !== "function") {
    throw imageError("PNG BlobをData URLへ変換できません。", "OCR_CAPTURE_OUTPUT_ENCODING_FAILED");
  }
  let bytes;
  try {
    bytes = new Uint8Array(await blob.arrayBuffer());
  } catch (cause) {
    throw imageError(
      "PNG Blobの読み取りに失敗しました。",
      "OCR_CAPTURE_OUTPUT_ENCODING_FAILED",
      null,
      cause,
    );
  }
  if (
    bytes.byteLength <= 0
    || bytes.byteLength > limits.maxOutputBytes
    || bytes.byteLength !== blob.size
  ) {
    throw imageError("PNG Blobの容量が検証結果と一致しません。", "OCR_CAPTURE_OUTPUT_INVALID");
  }
  const encodeBase64 = requireFunction(
    readDependency(dependencies, "encodeBase64", defaultEncodeBase64),
    "encodeBase64",
  );
  let payload;
  try {
    payload = await encodeBase64(bytes);
  } catch (cause) {
    if (cause instanceof OcrCaptureImageError) throw cause;
    throw imageError(
      "PNG BlobのBase64変換に失敗しました。",
      "OCR_CAPTURE_OUTPUT_ENCODING_FAILED",
      null,
      cause,
    );
  }
  if (
    typeof payload !== "string"
    || !payload
    || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(payload)
  ) {
    throw imageError("Base64 encoderの戻り値が不正です。", "OCR_CAPTURE_OUTPUT_ENCODING_FAILED");
  }
  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  if ((payload.length / 4) * 3 - padding !== bytes.byteLength) {
    throw imageError("Base64 encoderの出力長が不正です。", "OCR_CAPTURE_OUTPUT_ENCODING_FAILED");
  }
  return `${PNG_DATA_URL_PREFIX}${payload}`;
}

/**
 * Creates a Blob URL whose lifetime remains explicit. The returned revoke
 * function is idempotent; callers should invoke it as soon as the preview is
 * replaced or closed.
 */
export function createRevocablePngBlobUrl(blob, dependencies = {}) {
  const createObjectURL = requireFunction(
    readDependency(dependencies, "createObjectURL", globalThis.URL?.createObjectURL?.bind(globalThis.URL)),
    "createObjectURL",
    "OCR_CAPTURE_BLOB_URL_UNAVAILABLE",
  );
  const revokeObjectURL = requireFunction(
    readDependency(dependencies, "revokeObjectURL", globalThis.URL?.revokeObjectURL?.bind(globalThis.URL)),
    "revokeObjectURL",
    "OCR_CAPTURE_BLOB_URL_UNAVAILABLE",
  );

  let url;
  try {
    url = createObjectURL(blob);
  } catch (cause) {
    throw imageError("PNG Blob URLの生成に失敗しました。", "OCR_CAPTURE_BLOB_URL_FAILED", null, cause);
  }
  if (typeof url !== "string" || !url.startsWith("blob:")) {
    if (typeof url === "string") {
      try {
        revokeObjectURL(url);
      } catch {
        // Best effort cleanup for an invalid provider result.
      }
    }
    throw imageError("Blob URL providerの戻り値が不正です。", "OCR_CAPTURE_BLOB_URL_FAILED");
  }

  let revoked = false;
  const revoke = () => {
    if (revoked) return;
    try {
      revokeObjectURL(url);
      revoked = true;
    } catch (cause) {
      throw imageError("PNG Blob URLの破棄に失敗しました。", "OCR_CAPTURE_BLOB_URL_REVOKE_FAILED", null, cause);
    }
  };
  return Object.freeze({ url, revoke });
}

/**
 * Crops a browser screenshot without dereferencing any URL. Only an inline
 * data:image/png;base64 payload is accepted. The decoded bitmap's real width
 * and height are passed to planScreenshotCrop, rather than trusting DPR.
 *
 * output="blob" returns the PNG Blob, output="data-url" additionally returns
 * a Data URL, and output="blob-url" returns an explicit, revocable Blob URL.
 */
export async function cropScreenshotPng(input = {}, options = {}) {
  const inputRecord = requireRecord(input, "input");
  const optionRecord = requireRecord(options, "options", "OCR_CAPTURE_OPTIONS_INVALID");
  const {
    screenshotDataUrl,
    selection,
    viewport,
    output: requestedOutput,
  } = readProperties(
    inputRecord,
    ["screenshotDataUrl", "selection", "viewport", "output"],
    "input",
  );
  const {
    limits: limitOverrides,
    geometryOptions,
    dependencies: requestedDependencies,
  } = readProperties(
    optionRecord,
    ["limits", "geometryOptions", "dependencies"],
    "options",
    "OCR_CAPTURE_OPTIONS_INVALID",
  );
  const output = requestedOutput ?? "blob";
  const dependencies = requestedDependencies ?? {};
  requireRecord(dependencies, "dependencies", "OCR_CAPTURE_DEPENDENCY_INVALID");
  if (
    geometryOptions !== undefined
    && (!geometryOptions || typeof geometryOptions !== "object" || Array.isArray(geometryOptions))
  ) {
    throw imageError("geometryOptionsの形式が不正です。", "OCR_CAPTURE_OPTIONS_INVALID");
  }
  if (!OCR_CAPTURE_OUTPUT_FORMATS.includes(output)) {
    throw imageError("output形式が不正です。", "OCR_CAPTURE_OUTPUT_FORMAT_INVALID");
  }
  const limits = resolveLimits(limitOverrides);
  const payload = canonicalBase64Payload(screenshotDataUrl, limits);
  const decodeBase64 = requireFunction(
    readDependency(dependencies, "decodeBase64", defaultDecodeBase64),
    "decodeBase64",
  );

  let bytes;
  try {
    bytes = normalizeDecodedBytes(await decodeBase64(payload));
  } catch (cause) {
    if (cause instanceof OcrCaptureImageError) throw cause;
    throw imageError("PNGのBase64デコードに失敗しました。", "OCR_CAPTURE_DECODE_FAILED", null, cause);
  }
  if (bytes.byteLength <= 0 || bytes.byteLength > limits.maxDecodedBytes) {
    throw imageError(
      "デコード後のPNGが容量上限を超えています。",
      "OCR_CAPTURE_DECODED_BYTE_LIMIT",
      Object.freeze({ actualBytes: bytes.byteLength, maximum: limits.maxDecodedBytes }),
    );
  }

  const header = inspectPngHeader(bytes);
  checkedPixelCount(
    header.width,
    header.height,
    limits.maxImagePixels,
    "OCR_CAPTURE_IMAGE_PIXEL_LIMIT",
    "スクリーンショット",
  );

  const BlobConstructor = requireFunction(
    readDependency(dependencies, "Blob", globalThis.Blob),
    "Blob",
  );
  let sourceBlob;
  try {
    sourceBlob = new BlobConstructor([bytes], { type: PNG_MIME_TYPE });
  } catch (cause) {
    throw imageError("PNG Blobの生成に失敗しました。", "OCR_CAPTURE_SOURCE_BLOB_FAILED", null, cause);
  }
  const createImageBitmap = requireFunction(
    readDependency(dependencies, "createImageBitmap", globalThis.createImageBitmap),
    "createImageBitmap",
    "OCR_CAPTURE_IMAGE_DECODER_UNAVAILABLE",
  );

  let bitmap = null;
  try {
    try {
      bitmap = await createImageBitmap(sourceBlob);
    } catch (cause) {
      throw imageError("PNG画像のデコードに失敗しました。", "OCR_CAPTURE_IMAGE_DECODE_FAILED", null, cause);
    }
    const screenshot = validateBitmap(bitmap, header, limits);

    let plan;
    try {
      plan = planScreenshotCrop({ selection, viewport, screenshot }, geometryOptions);
    } catch (cause) {
      if (cause instanceof OcrCaptureGeometryError) {
        throw imageError(cause.message, cause.code, cause.details, cause);
      }
      throw cause;
    }
    const crop = plan.cropPixels;
    const cropPixelCount = checkedPixelCount(
      crop.width,
      crop.height,
      limits.maxCropPixels,
      "OCR_CAPTURE_CROP_PIXEL_LIMIT",
      "切り出し範囲",
    );

    const createCanvas = requireFunction(
      readDependency(dependencies, "createCanvas", defaultCreateCanvas),
      "createCanvas",
    );
    let canvas;
    try {
      canvas = await createCanvas(crop.width, crop.height);
    } catch (cause) {
      if (cause instanceof OcrCaptureImageError) throw cause;
      throw imageError("画像切り出し用Canvasの生成に失敗しました。", "OCR_CAPTURE_CANVAS_FAILED", null, cause);
    }
    if (!canvas || typeof canvas !== "object") {
      throw imageError("Canvasの寸法が切り出し範囲と一致しません。", "OCR_CAPTURE_CANVAS_INVALID");
    }
    let canvasWidth;
    let canvasHeight;
    try {
      canvasWidth = canvas.width;
      canvasHeight = canvas.height;
    } catch (cause) {
      throw imageError("Canvasの寸法を読み取れません。", "OCR_CAPTURE_CANVAS_INVALID", null, cause);
    }
    if (canvasWidth !== crop.width || canvasHeight !== crop.height) {
      throw imageError("Canvasの寸法が切り出し範囲と一致しません。", "OCR_CAPTURE_CANVAS_INVALID");
    }

    let context;
    try {
      context = canvas.getContext?.("2d");
    } catch (cause) {
      throw imageError("Canvas 2D contextの取得に失敗しました。", "OCR_CAPTURE_CANVAS_CONTEXT_FAILED", null, cause);
    }
    if (!context || typeof context.drawImage !== "function") {
      throw imageError("Canvas 2D contextを利用できません。", "OCR_CAPTURE_CANVAS_CONTEXT_FAILED");
    }
    try {
      context.drawImage(
        bitmap,
        crop.x,
        crop.y,
        crop.width,
        crop.height,
        0,
        0,
        crop.width,
        crop.height,
      );
    } catch (cause) {
      throw imageError("選択範囲の描画に失敗しました。", "OCR_CAPTURE_CANVAS_DRAW_FAILED", null, cause);
    }

    const blob = validateOutputBlob(await exportCanvasPng(canvas), limits);
    const baseResult = {
      blob,
      plan,
      source: Object.freeze({
        width: screenshot.width,
        height: screenshot.height,
        bytes: bytes.byteLength,
      }),
      crop: Object.freeze({
        width: crop.width,
        height: crop.height,
        pixels: cropPixelCount,
        bytes: blob.size,
      }),
    };

    if (output === "data-url") {
      return Object.freeze({
        ...baseResult,
        dataUrl: await pngBlobToDataUrl(blob, limits, dependencies),
      });
    }
    if (output === "blob-url") {
      const handle = createRevocablePngBlobUrl(blob, dependencies);
      return Object.freeze({
        ...baseResult,
        blobUrl: handle.url,
        revoke: handle.revoke,
      });
    }
    return Object.freeze(baseResult);
  } finally {
    closeBitmap(bitmap);
  }
}
