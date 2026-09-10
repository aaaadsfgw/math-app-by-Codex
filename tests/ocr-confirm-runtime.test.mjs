import assert from "node:assert/strict";
import test from "node:test";

const CAPTURE_ID = "capture-cancel-race";

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function mockElement({ hidden = false, value = "" } = {}) {
  const listeners = new Map();
  return {
    className: "",
    dataset: {},
    disabled: false,
    hidden,
    src: "",
    textContent: "",
    value,
    addEventListener(type, listener) {
      const registered = listeners.get(type) ?? [];
      registered.push(listener);
      listeners.set(type, registered);
    },
    dispatch(type) {
      for (const listener of listeners.get(type) ?? []) listener({ type });
    },
    focus() {},
    removeAttribute(name) {
      if (name === "src") this.src = "";
    },
    select() {},
    setAttribute() {},
  };
}

test("キャンセル開始後に先着したOCR成功結果を確認候補へ表示しない", async () => {
  const originalGlobals = {
    addEventListener: globalThis.addEventListener,
    chrome: globalThis.chrome,
    clearTimeout: globalThis.clearTimeout,
    close: globalThis.close,
    document: globalThis.document,
    location: globalThis.location,
    setTimeout: globalThis.setTimeout,
  };
  const recognition = deferred();
  const cancellation = deferred();
  const elements = new Map();
  const hiddenIds = new Set([
    "previewImage",
    "recognitionProgress",
    "recognitionError",
    "candidatePanel",
    "cancelRecognitionButton",
  ]);
  const getElement = (selector) => {
    const id = selector.replace(/^#/u, "");
    if (!elements.has(id)) elements.set(id, mockElement({ hidden: hiddenIds.has(id) }));
    return elements.get(id);
  };

  try {
    globalThis.document = { querySelector: getElement };
    globalThis.location = {
      href: `chrome-extension://test/ocr-confirm.html?captureId=${CAPTURE_ID}`,
      origin: "chrome-extension://test",
      replace() {},
    };
    globalThis.addEventListener = () => {};
    globalThis.close = () => {};
    globalThis.setTimeout = () => 1;
    globalThis.clearTimeout = () => {};
    globalThis.chrome = {
      runtime: {
        id: "test",
        sendMessage(message) {
          if (message.type === "GET_OCR_CAPTURE_PREVIEW") {
            return Promise.resolve({
              ok: true,
              result: {
                previewUrl: "blob:chrome-extension://test/preview",
                crop: { width: 290, height: 120 },
                source: { width: 1280, height: 900 },
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                availability: { available: true, code: "OCR_AVAILABLE" },
              },
            });
          }
          if (message.type === "RECOGNIZE_OCR_CAPTURE") return recognition.promise;
          if (message.type === "CANCEL_OCR_RECOGNITION") return cancellation.promise;
          throw new Error(`Unexpected message: ${message.type}`);
        },
      },
    };

    await import(`../js/ocr/ocr-confirm.js?cancel-race=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));

    const candidatePanel = getElement("#candidatePanel");
    const candidateInput = getElement("#candidateInput");
    const recognitionStatus = getElement("#recognitionStatus");
    const recognizeButton = getElement("#recognizeButton");
    const cancelButton = getElement("#cancelRecognitionButton");
    const solveButton = getElement("#solveButton");

    recognizeButton.dispatch("click");
    await new Promise((resolve) => setImmediate(resolve));
    cancelButton.dispatch("click");
    recognition.resolve({
      ok: true,
      result: {
        captureId: CAPTURE_ID,
        candidateText: "x=1",
        provider: "wasm",
        backend: { id: "test-backend" },
        model: { id: "test-model" },
        warnings: [],
        confirmationRequired: true,
      },
    });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(candidatePanel.hidden, true);
    assert.equal(candidateInput.value, "");
    assert.equal(solveButton.disabled, true);

    cancellation.resolve({ ok: true, result: { cancelled: true } });
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(candidatePanel.hidden, true);
    assert.equal(candidateInput.value, "");
    assert.equal(recognitionStatus.textContent, "キャンセルしました");
    assert.equal(cancelButton.hidden, true);
    assert.equal(solveButton.disabled, true);
  } finally {
    Object.assign(globalThis, originalGlobals);
  }
});

test("未知の認識種別を拒否し、既知の数式種別だけを候補へ表示する", async () => {
  const originalGlobals = {
    addEventListener: globalThis.addEventListener,
    chrome: globalThis.chrome,
    clearTimeout: globalThis.clearTimeout,
    close: globalThis.close,
    document: globalThis.document,
    location: globalThis.location,
    setTimeout: globalThis.setTimeout,
  };
  const elements = new Map();
  const hiddenIds = new Set([
    "previewImage",
    "recognitionProgress",
    "recognitionError",
    "candidatePanel",
    "cancelRecognitionButton",
  ]);
  const getElement = (selector) => {
    const id = selector.replace(/^#/u, "");
    if (!elements.has(id)) elements.set(id, mockElement({ hidden: hiddenIds.has(id) }));
    return elements.get(id);
  };
  let recognitionKind = "future-mixed-layout";

  try {
    globalThis.document = { querySelector: getElement };
    globalThis.location = {
      href: `chrome-extension://test/ocr-confirm.html?captureId=${CAPTURE_ID}`,
      origin: "chrome-extension://test",
      replace() {},
    };
    globalThis.addEventListener = () => {};
    globalThis.close = () => {};
    globalThis.setTimeout = () => 1;
    globalThis.clearTimeout = () => {};
    globalThis.chrome = {
      runtime: {
        id: "test",
        sendMessage(message) {
          if (message.type === "GET_OCR_CAPTURE_PREVIEW") {
            return Promise.resolve({
              ok: true,
              result: {
                previewUrl: "blob:chrome-extension://test/preview",
                crop: { width: 290, height: 120 },
                source: { width: 1280, height: 900 },
                expiresAt: new Date(Date.now() + 60_000).toISOString(),
                availability: { available: true, code: "OCR_AVAILABLE" },
              },
            });
          }
          if (message.type === "RECOGNIZE_OCR_CAPTURE") {
            return Promise.resolve({
              ok: true,
              result: {
                captureId: CAPTURE_ID,
                candidateText: "2*x^2+5*x+2=0",
                rawText: "zws _( 2 x ^( 2 ) + 5 x + 2 = 0 )",
                recognitionKind,
                provider: "wasm",
                backend: { id: "test-backend" },
                model: { id: "test-model" },
                warnings: [],
                confirmationRequired: true,
              },
            });
          }
          throw new Error(`Unexpected message: ${message.type}`);
        },
      },
    };

    await import(`../js/ocr/ocr-confirm.js?structured-fields=${Date.now()}`);
    await new Promise((resolve) => setImmediate(resolve));
    getElement("#recognizeButton").dispatch("click");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(getElement("#candidateInput").value, "");
    assert.equal(getElement("#solveButton").disabled, true);
    assert.match(getElement("#recognitionError").textContent, /認識種別が不正/u);

    recognitionKind = "formula-only";
    getElement("#recognizeButton").dispatch("click");
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(getElement("#candidatePanel").hidden, false);
    assert.equal(getElement("#candidateInput").value, "2*x^2+5*x+2=0");
    assert.equal(getElement("#questionLabelInput").value, "");
    assert.equal(getElement("#instructionInput").value, "");
    assert.equal(getElement("#conditionsInput").value, "");
    assert.equal(getElement("#solveButton").disabled, false);

    getElement("#questionLabelInput").value = "(1)";
    getElement("#questionLabelInput").dispatch("input");
    getElement("#instructionInput").value = "次の方程式を解け";
    getElement("#instructionInput").dispatch("input");
    getElement("#candidateInput").value = "2*x^2+5*x+2=0";
    getElement("#candidateInput").dispatch("input");
    assert.equal(getElement("#solveButton").disabled, false);
  } finally {
    Object.assign(globalThis, originalGlobals);
  }
});
