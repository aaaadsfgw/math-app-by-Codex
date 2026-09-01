export const OCR_PROVIDER_ORDER = Object.freeze(["webgpu", "wasm"]);
export const OCR_DEFAULT_TIMEOUT_MS = 30_000;
export const OCR_MAX_OUTPUT_CHARACTERS = 4_096;

export const OCR_PROVISIONAL_MODEL_ASSETS = Object.freeze([
  Object.freeze({ name: "image_resizer.onnx", publishedSizeMb: 37.1 }),
  Object.freeze({ name: "encoder.onnx", publishedSizeMb: 84.8 }),
  Object.freeze({ name: "decoder.onnx", publishedSizeMb: 48.5 }),
]);

export const OCR_PROVISIONAL_BACKEND = Object.freeze({
  id: "rapid-latex-ocr-onnx-web",
  name: "RapidLaTeXOCR ONNX browser adapter",
  runtime: "onnxruntime-web",
  provisional: true,
});

export const OCR_PROVISIONAL_MODEL = Object.freeze({
  id: "rapid-latex-ocr-onnx-provisional",
  family: "RapidLaTeXOCR/pix2tex",
  revision: null,
  sourceRepository: "RapidAI/RapidLaTeXOCR",
  publishedAssetSizeMb: 170.4,
  assets: OCR_PROVISIONAL_MODEL_ASSETS,
  assetsBundled: false,
  provisional: true,
  licenseStatus: "unresolved",
  redistributionStatus: "blocked-license-gate",
});

export const OCR_LICENSE_GATE = Object.freeze({
  code: "OCR_LICENSE_GATE",
  status: "blocked",
  redistributionAllowed: false,
  reason: "モデル重みの再配布ライセンスが確定していません。",
});

export const OCR_UNAVAILABLE_STATUS = Object.freeze({
  available: false,
  status: "unavailable",
  reason: "license-gate",
  code: OCR_LICENSE_GATE.code,
});

export const OCR_FOUNDATION_CONFIG = Object.freeze({
  schemaVersion: 1,
  providers: OCR_PROVIDER_ORDER,
  defaultTimeoutMs: OCR_DEFAULT_TIMEOUT_MS,
  maxOutputCharacters: OCR_MAX_OUTPUT_CHARACTERS,
  backend: OCR_PROVISIONAL_BACKEND,
  model: OCR_PROVISIONAL_MODEL,
  licenseGate: OCR_LICENSE_GATE,
  availability: OCR_UNAVAILABLE_STATUS,
});
