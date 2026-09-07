export const OCR_PROVIDER_ORDER = Object.freeze(["webgpu", "wasm"]);
export const OCR_DEFAULT_TIMEOUT_MS = 120_000;
export const OCR_MAX_OUTPUT_CHARACTERS = 4_096;

export const OCR_MODEL_REVISION =
  "a7ced2309da108a911fa6880055a165264872a84";
export const OCR_DEPLOYMENT_SHA256 =
  "b8c710eadde7b1e0173db7742da4629c08942e9b935f98fadb75abf4dd01e78e";

export const OCR_MODEL_VARIANTS = Object.freeze({
  webgpu: Object.freeze({
    precision: "fp16",
    encoder: Object.freeze({
      name: "encoder.fp16.onnx",
      bytes: 16_497_777,
      sha256: "e0720d76d8b78a68f281522a6fc3ad20b42d7e3a0102fba9c08509c01e8d8477",
    }),
    decoder: Object.freeze({
      name: "decoder-step.fp16.onnx",
      bytes: 12_494_938,
      sha256: "531b2b82d680a1ce1b082cce1db8ed83273e043947ce8f340d82ce728f078ee9",
    }),
  }),
  wasm: Object.freeze({
    precision: "dynamic-int8",
    encoder: Object.freeze({
      name: "encoder.int8.onnx",
      bytes: 11_039_884,
      sha256: "6c889df95eb503c3debefad306e3bdc1f4d4a4f1d217f89a664d5710262bdab1",
    }),
    decoder: Object.freeze({
      name: "decoder-step.int8.onnx",
      bytes: 7_541_001,
      sha256: "fea2c1792dcfbb8b9e4ed3215d9591fa8ad5f99bd626bc9862355c666083eecf",
    }),
  }),
});

export const OCR_BACKEND = Object.freeze({
  id: "ibem-im2typst-onnx-web",
  name: "IBEM im2typst local ONNX recognizer",
  runtime: "onnxruntime-web@1.22.0",
  provisional: true,
});

export const OCR_MODEL = Object.freeze({
  id: "ibem-semantic-length33-phase10-step002000",
  family: "IBEM-im2typst",
  revision: OCR_MODEL_REVISION,
  sourceRepository: "dbcccc/IBEM-im2typst",
  publishedAssetSizeMb: 47.6,
  assetsBundled: true,
  provisional: true,
  licenseStatus: "MIT",
  redistributionStatus: "allowed-with-attribution",
  variants: OCR_MODEL_VARIANTS,
});

export const OCR_LICENSE_GATE = Object.freeze({
  code: "OCR_LICENSE_APPROVED",
  status: "approved",
  redistributionAllowed: true,
  reason: "モデル重みと実装のMITライセンスを確認し、帰属表示を同梱しています。",
});

export const OCR_AVAILABLE_STATUS = Object.freeze({
  available: true,
  status: "available",
  reason: null,
  code: "OCR_AVAILABLE",
});

export const OCR_IMAGE_LIMITS = Object.freeze({
  maxBytes: 8 * 1024 * 1024,
  maxPixels: 16 * 1024 * 1024,
  maxDimension: 8_192,
  supportedTypes: Object.freeze(["image/png", "image/jpeg", "image/webp"]),
});

export const OCR_FOUNDATION_CONFIG = Object.freeze({
  schemaVersion: 2,
  providers: OCR_PROVIDER_ORDER,
  defaultTimeoutMs: OCR_DEFAULT_TIMEOUT_MS,
  maxOutputCharacters: OCR_MAX_OUTPUT_CHARACTERS,
  backend: OCR_BACKEND,
  model: OCR_MODEL,
  licenseGate: OCR_LICENSE_GATE,
  availability: OCR_AVAILABLE_STATUS,
});

// Import aliases retained for older modules and migration tests.
export const OCR_PROVISIONAL_BACKEND = OCR_BACKEND;
export const OCR_PROVISIONAL_MODEL = OCR_MODEL;
