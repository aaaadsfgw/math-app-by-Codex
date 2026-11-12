import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createLocalOcr, ocrAssetPath, registerOcrScheme } from "../desktop/services/local-ocr.js";

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
    "desktop/ocr-host/windows-layout.js",
    "desktop/ocr-host/windows-mixed-ocr.js",
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
    `${base}/desktop/pix2text/worker.py`,
    `${base}/desktop/services/pix2text.js`,
    `${base}/js/ocr/%2e%2e/%2e%2e/package.json`,
    `${base}/js/ocr/test%5c..%5cpackage.js`,
    `${base}/js/ocr/test.js:stream`,
    `${base}/.git/config`,
  ]) assert.equal(ocrAssetPath(url), null);
});

test("only the active OCR host can request bounded Pix2Text inference", async () => {
  const png = await readFile(new URL("../bench/ocr/data/images/04-arithmetic.png", import.meta.url));
  let host;
  let formulaHandler;
  let received;
  let signal;
  let complete;
  let loaded;
  const ready = new Promise((resolve) => { loaded = resolve; });
  const ipcMain = Object.assign(new EventEmitter(), {
    handle(_name, handler) { formulaHandler = handler; },
    removeHandler() { formulaHandler = null; },
  });
  const session = {
    fromPartition: () => ({
      protocol: { handle() {}, unhandle() {} },
      setPermissionCheckHandler() {}, setPermissionRequestHandler() {}, on() {},
      webRequest: { onBeforeRequest() {} },
    }),
  };
  class Window extends EventEmitter {
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: { url: `${base}/desktop/ocr-host/index.html` },
      setWindowOpenHandler() {},
      send: (_channel, request) => { received = request; loaded(); },
    });
    constructor() { super(); host = this; }
    async loadURL() {}
    isDestroyed() { return false; }
    destroy() {}
  }
  const ocr = createLocalOcr({ BrowserWindow: Window, ipcMain, session, pix2text: {
    isAvailable: () => true,
    recognize(image, options) {
      assert.deepEqual(image, png);
      signal = options.signal;
      return new Promise((resolve) => { complete = resolve; });
    },
  } });
  try {
    const controller = new AbortController();
    const pending = ocr.recognize(png, { model: "pix2text", signal: controller.signal });
    await ready;
    const { id } = received;
    const sender = host.webContents;
    const event = { sender, senderFrame: sender.mainFrame };
    for (const [from, requestId, image] of [
      [{ ...event, sender: {} }, id, png],
      [{ ...event, senderFrame: { url: event.senderFrame.url } }, id, png],
      [event, "stale", png],
      [event, id, Uint8Array.of(0)],
    ]) {
      assert.equal((await formulaHandler(from, requestId, image)).error.code, "OCR_IMAGE_INVALID");
    }
    const formula = formulaHandler(event, id, png);
    assert.equal((await formulaHandler(event, id, png)).error.code, "OCR_IMAGE_INVALID");
    complete({ latex: "2+3", metrics: {} });
    assert.equal((await formula).text, "2+3");
    const abortedFormula = formulaHandler(event, id, png);
    controller.abort();
    await assert.rejects(pending, { code: "OCR_CANCELLED" });
    assert.equal(signal.aborted, true);
    complete({ latex: "2+3", metrics: {} });
    await abortedFormula;
    assert.equal((await formulaHandler(event, id, png)).error.code, "OCR_CANCELLED");
  } finally {
    ocr.close();
  }
  assert.equal(formulaHandler, null);
});
