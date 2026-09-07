import {
  cropToForeground,
  grayscaleFromRgba,
  normalizePolarity,
  outputPolicyDecision,
  resizeGeometry,
  selectWidthBucket,
  sha256Hex,
} from "./vendor/ibem-core.js";
import { runCachedGreedy } from "./vendor/ibem-inference-runtime.js";
import { normalizeMathOcrCandidate } from "./math-ocr-normalizer.js";
import {
  OCR_DEPLOYMENT_SHA256,
  OCR_IMAGE_LIMITS,
  OCR_MODEL_VARIANTS,
} from "./ocr-config.js";

const MODEL_BASE = new URL("../../vendor/ocr/ibem-im2typst/", import.meta.url);
const ORT_MODULE_URL = new URL(
  "../../vendor/onnxruntime-web/ort.webgpu.bundle.min.mjs",
  import.meta.url,
);
const ORT_WASM_URL = new URL(
  "../../vendor/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm",
  import.meta.url,
);
const JSON_ASSETS = Object.freeze([
  "model-config.json",
  "preprocess-config.json",
  "vocabulary.json",
  "output-policy.json",
]);

export class IbemOcrRuntimeError extends Error {
  constructor(message, { code = "OCR_RUNTIME_ERROR", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "IbemOcrRuntimeError";
    this.code = code;
  }
}

function runtimeError(message, code, cause = null) {
  return new IbemOcrRuntimeError(message, { code, cause });
}

async function fetchBytes(url, { bytes, sha256 }, label) {
  let response;
  try {
    response = await fetch(url, { cache: "no-store", credentials: "same-origin" });
  } catch (cause) {
    throw runtimeError(`${label}を読み込めませんでした。`, "OCR_ASSET_FETCH_FAILED", cause);
  }
  if (!response.ok) {
    throw runtimeError(
      `${label}を読み込めませんでした（HTTP ${response.status}）。`,
      "OCR_ASSET_FETCH_FAILED",
    );
  }
  const data = new Uint8Array(await response.arrayBuffer());
  if (Number.isSafeInteger(bytes) && data.byteLength !== bytes) {
    throw runtimeError(`${label}の容量が固定値と一致しません。`, "OCR_ASSET_INTEGRITY_FAILED");
  }
  const actualHash = await sha256Hex(data);
  if (typeof sha256 === "string" && actualHash !== sha256) {
    throw runtimeError(`${label}のSHA-256が固定値と一致しません。`, "OCR_ASSET_INTEGRITY_FAILED");
  }
  return data;
}

async function loadDeployment() {
  const data = await fetchBytes(
    new URL("deployment.json", MODEL_BASE),
    { sha256: OCR_DEPLOYMENT_SHA256 },
    "OCR deployment manifest",
  );
  try {
    const deployment = JSON.parse(new TextDecoder().decode(data));
    if (deployment?.schema_version !== "browser-deployment-v1") throw new Error("schema mismatch");
    return deployment;
  } catch (cause) {
    throw runtimeError("OCR deployment manifestの形式が不正です。", "OCR_ASSET_INVALID", cause);
  }
}

async function loadJsonAsset(name, deployment) {
  const expected = deployment?.artifacts?.[name];
  if (!expected) {
    throw runtimeError(`${name}の固定ハッシュがありません。`, "OCR_ASSET_INTEGRITY_FAILED");
  }
  const data = await fetchBytes(new URL(name, MODEL_BASE), expected, name);
  try {
    return JSON.parse(new TextDecoder().decode(data));
  } catch (cause) {
    throw runtimeError(`${name}のJSON形式が不正です。`, "OCR_ASSET_INVALID", cause);
  }
}

function requireCanvasContext(canvas, options = {}) {
  const context = canvas.getContext("2d", options);
  if (!context) throw runtimeError("画像処理Canvasを利用できません。", "OCR_IMAGE_CANVAS_UNAVAILABLE");
  return context;
}

function grayscaleCanvas(grayscale, width, height) {
  const canvas = new OffscreenCanvas(width, height);
  const context = requireCanvasContext(canvas, { alpha: false, willReadFrequently: true });
  const imageData = context.createImageData(width, height);
  for (let source = 0, target = 0; source < grayscale.length; source += 1) {
    const value = grayscale[source];
    imageData.data[target] = value;
    imageData.data[target + 1] = value;
    imageData.data[target + 2] = value;
    imageData.data[target + 3] = 255;
    target += 4;
  }
  context.putImageData(imageData, 0, 0);
  return canvas;
}

function validateBlob(blob) {
  if (!(blob instanceof Blob) || blob.size <= 0) {
    throw runtimeError("OCR入力画像が空です。", "OCR_IMAGE_EMPTY");
  }
  if (blob.size > OCR_IMAGE_LIMITS.maxBytes) {
    throw runtimeError("OCR入力画像が容量上限を超えています。", "OCR_IMAGE_BYTE_LIMIT");
  }
  if (blob.type && !OCR_IMAGE_LIMITS.supportedTypes.includes(blob.type.toLowerCase())) {
    throw runtimeError("OCR入力画像の形式に対応していません。", "OCR_IMAGE_TYPE_UNSUPPORTED");
  }
}

export async function preprocessIbemImage(blob, config) {
  validateBlob(blob);
  let bitmap;
  try {
    bitmap = await createImageBitmap(blob, {
      imageOrientation: "from-image",
      premultiplyAlpha: "default",
      colorSpaceConversion: "default",
    });
  } catch (cause) {
    throw runtimeError("OCR入力画像をデコードできません。", "OCR_IMAGE_DECODE_FAILED", cause);
  }

  try {
    const width = bitmap.width;
    const height = bitmap.height;
    if (
      !Number.isSafeInteger(width)
      || !Number.isSafeInteger(height)
      || width <= 0
      || height <= 0
      || width > OCR_IMAGE_LIMITS.maxDimension
      || height > OCR_IMAGE_LIMITS.maxDimension
      || width * height > OCR_IMAGE_LIMITS.maxPixels
    ) {
      throw runtimeError("OCR入力画像の寸法が上限を超えています。", "OCR_IMAGE_PIXEL_LIMIT");
    }

    const sourceCanvas = new OffscreenCanvas(width, height);
    const sourceContext = requireCanvasContext(sourceCanvas, {
      alpha: false,
      willReadFrequently: true,
    });
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, width, height);
    sourceContext.drawImage(bitmap, 0, 0);
    const rgba = sourceContext.getImageData(0, 0, width, height).data;
    const grayscale = grayscaleFromRgba(rgba);
    const polarity = normalizePolarity(grayscale, width, height, config.normalize_polarity);
    const cropped = config.auto_crop
      ? cropToForeground(polarity.pixels, width, height, {
          threshold: config.crop_threshold,
          marginRatio: config.crop_margin_ratio,
          minimumMargin: config.crop_min_margin,
          minimumPixels: config.minimum_foreground_pixels,
        })
      : {
          height,
          width,
          pixels: polarity.pixels,
        };

    const geometry = resizeGeometry(
      cropped.width,
      cropped.height,
      config.input_height,
      config.max_width,
      config.resize_mode,
    );
    const bucket = selectWidthBucket(geometry.width, config.width_buckets, config.max_width);
    const normalizedCanvas = grayscaleCanvas(cropped.pixels, cropped.width, cropped.height);
    const resizedCanvas = new OffscreenCanvas(geometry.width, geometry.height);
    const resizedContext = requireCanvasContext(resizedCanvas, {
      alpha: false,
      willReadFrequently: true,
    });
    resizedContext.fillStyle = "#ffffff";
    resizedContext.fillRect(0, 0, geometry.width, geometry.height);
    resizedContext.imageSmoothingEnabled = true;
    resizedContext.imageSmoothingQuality = "high";
    resizedContext.drawImage(
      normalizedCanvas,
      0,
      0,
      cropped.width,
      cropped.height,
      0,
      0,
      geometry.width,
      geometry.height,
    );
    const resizedPixels = resizedContext.getImageData(
      0,
      0,
      geometry.width,
      geometry.height,
    ).data;
    const tensorData = new Float32Array(config.input_height * bucket);
    for (let y = 0; y < geometry.height; y += 1) {
      for (let x = 0; x < geometry.width; x += 1) {
        tensorData[(y + geometry.top) * bucket + x] =
          (255 - resizedPixels[(y * geometry.width + x) * 4]) / 255;
      }
    }
    return Object.freeze({
      bucket,
      height: config.input_height,
      pixelWidth: geometry.width,
      tensorData,
    });
  } finally {
    bitmap.close();
  }
}

async function safeRelease(session) {
  try {
    await session?.release?.();
  } catch {
    // A terminating Worker is the final cleanup boundary.
  }
}

export async function createIbemRuntimeSession(provider) {
  if (!Object.hasOwn(OCR_MODEL_VARIANTS, provider)) {
    throw runtimeError("未対応のOCR実行プロバイダーです。", "OCR_PROVIDER_UNSUPPORTED");
  }
  const deployment = await loadDeployment();
  const [config, preprocessConfig, vocabulary, outputPolicy] = await Promise.all(
    JSON_ASSETS.map((name) => loadJsonAsset(name, deployment)),
  );
  const variant = OCR_MODEL_VARIANTS[provider];
  const [encoderBytes, decoderBytes] = await Promise.all([
    fetchBytes(new URL(variant.encoder.name, MODEL_BASE), variant.encoder, variant.encoder.name),
    fetchBytes(new URL(variant.decoder.name, MODEL_BASE), variant.decoder, variant.decoder.name),
  ]);

  let ort;
  try {
    ort = await import(ORT_MODULE_URL.href);
    ort.env.wasm.numThreads = 1;
    ort.env.wasm.proxy = false;
    ort.env.wasm.wasmPaths = { wasm: ORT_WASM_URL.href };
    ort.env.logLevel = "warning";
  } catch (cause) {
    throw runtimeError("ONNX Runtime Webを初期化できません。", "OCR_RUNTIME_LOAD_FAILED", cause);
  }

  const options = {
    executionProviders: [provider],
    graphOptimizationLevel: "all",
  };
  let encoder;
  let decoder;
  try {
    encoder = await ort.InferenceSession.create(encoderBytes, options);
    decoder = await ort.InferenceSession.create(decoderBytes, options);
  } catch (cause) {
    await safeRelease(encoder);
    throw runtimeError(`${provider}用OCRモデルを初期化できません。`, "OCR_SESSION_CREATE_FAILED", cause);
  }

  const model = { ort, encoder, decoder, config, deployment, outputPolicy, vocabulary };
  return Object.freeze({
    provider,
    async recognize(blob, onProgress = () => {}) {
      const prepared = await preprocessIbemImage(blob, preprocessConfig);
      const result = await runCachedGreedy(model, prepared, onProgress);
      if (!result.eosReached || result.repetitionGuardTriggered) {
        throw runtimeError("OCRデコーダーが安全な終了条件へ到達しませんでした。", "OCR_DECODE_INCOMPLETE");
      }
      const policy = outputPolicyDecision(result.text, outputPolicy);
      if (!policy.accepted) {
        throw runtimeError("OCR出力が数式候補の安全条件を満たしません。", "OCR_OUTPUT_POLICY_REJECTED");
      }
      const normalized = normalizeMathOcrCandidate(result.text);
      return Object.freeze({
        text: normalized.text,
        format: "text",
        rawText: normalized.sourceText,
        warnings: normalized.warnings,
        confidence: Object.freeze({ ...result.confidence }),
        timings: Object.freeze({
          encoderMilliseconds: result.encoderMilliseconds,
          decoderMilliseconds: result.decoderMilliseconds,
          totalMilliseconds: result.totalMilliseconds,
        }),
      });
    },
    async dispose() {
      await Promise.allSettled([safeRelease(decoder), safeRelease(encoder)]);
    },
  });
}
