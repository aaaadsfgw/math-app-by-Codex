export const JAPANESE_OCR_RUNTIME = Object.freeze({
  id: "tesseract-js-jpn-fast",
  name: "Tesseract.js local Japanese recognizer",
  version: "7.0.0",
  executionProvider: "wasm",
  workerPath: "vendor/ocr/tesseract-japanese/worker.min.js",
  corePath: "vendor/ocr/tesseract-japanese/core",
  languagePath: "vendor/ocr/tesseract-japanese/lang",
});

export const JAPANESE_OCR_MODEL = Object.freeze({
  id: "tessdata-fast-jpn-4.1.0",
  family: "tessdata_fast",
  revision: "4.1.0",
  language: "jpn",
  orientation: "horizontal",
  bytes: 2_471_260,
  sha256: "1f5de9236d2e85f5fdf4b3c500f2d4926f8d9449f28f5394472d9e8d83b91b4d",
  license: "Apache-2.0",
  sourceRepository: "tesseract-ocr/tessdata_fast",
});

export const JAPANESE_OCR_LIMITS = Object.freeze({
  maxCharacters: 512,
  idleDisposeMs: 60_000,
});

export const JAPANESE_OCR_SCOPE = Object.freeze({
  maxInstructionLines: 2,
  printedHorizontalOnly: true,
  handwriting: false,
  verticalText: false,
  answerGeneration: false,
});
