import assert from "node:assert/strict";
import test from "node:test";
import { ocrAssetPath, registerOcrScheme } from "../desktop/services/local-ocr.js";

const base = "math-study-ocr://local";

test("Electron OCR scheme can fetch local assets without bypassing CSP", () => {
  let registered;
  registerOcrScheme({ registerSchemesAsPrivileged(schemes) { registered = schemes; } });
  assert.deepEqual(registered, [{
    scheme: "math-study-ocr",
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  }]);
  for (const path of [
    "desktop/ocr-host/index.html",
    "js/ocr/ocr-worker.js",
    "js/problem/instruction-normalizer.js",
    "vendor/ocr/ibem-im2typst/encoder.int8.onnx",
    "vendor/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm",
    "vendor/ocr/tesseract-japanese/lang/jpn.traineddata",
  ]) assert.equal(ocrAssetPath(`${base}/${path}`), path);
});

test("Electron OCR protocol excludes privileged host code and unrelated files", () => {
  for (const url of [
    "invalid",
    "math-study-ocr://other/js/ocr/ocr-worker.js",
    "math-study-ocr://a@local/js/ocr/ocr-worker.js",
    `${base}/desktop/ocr-host/preload.cjs`,
    `${base}/desktop/main.js`,
    `${base}/js/ocr/%2e%2e/%2e%2e/package.json`,
    `${base}/js/ocr/test%5c..%5cpackage.js`,
    `${base}/js/ocr/test.js:stream`,
    `${base}/.git/config`,
  ]) assert.equal(ocrAssetPath(url), null);
});
