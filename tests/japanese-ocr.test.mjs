import assert from "node:assert/strict";
import test from "node:test";

import {
  createJapaneseOcrRecognizer,
  JapaneseOcrError,
} from "../js/ocr/japanese-ocr.js";

const image = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

test("Tesseract.jsを同梱URL・LSTM-only・network/cacheなしで初期化する", async () => {
  const calls = { create: null, parameters: null, recognized: 0, terminated: 0 };
  const worker = {
    async setParameters(parameters) { calls.parameters = parameters; },
    async recognize(blob) {
      assert.equal(blob.type, "image/png");
      calls.recognized += 1;
      return { data: { text: "次の方程式を解け。\n", confidence: 87.5 } };
    },
    async terminate() { calls.terminated += 1; },
  };
  const recognizer = createJapaneseOcrRecognizer({
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    loadTesseract: async () => ({
      OEM: { LSTM_ONLY: 1 },
      PSM: { SINGLE_BLOCK: "6" },
      async createWorker(...args) { calls.create = args; return worker; },
    }),
    setTimer: () => ({ unref() {} }),
    clearTimer: () => {},
    now: (() => { let value = 10; return () => { value += 5; return value; }; })(),
  });

  const output = await recognizer.recognize(image());
  assert.equal(output.text, "次の方程式を解け。");
  assert.equal(output.rawText, "次の方程式を解け。");
  assert.equal(output.confidence, 87.5);
  assert.equal(output.provider, "wasm");
  assert.equal(output.confirmationRequired, true);
  assert.equal(output.verified, false);
  assert.equal(calls.create[0], "jpn");
  assert.equal(calls.create[1], 1);
  assert.deepEqual(calls.create[2], {
    workerPath: "chrome-extension://test/vendor/ocr/tesseract-japanese/worker.min.js",
    corePath: "chrome-extension://test/vendor/ocr/tesseract-japanese/core",
    langPath: "chrome-extension://test/vendor/ocr/tesseract-japanese/lang",
    workerBlobURL: false,
    cacheMethod: "none",
    gzip: false,
    legacyCore: false,
    legacyLang: false,
    logger: calls.create[2].logger,
  });
  assert.equal(typeof calls.create[2].logger, "function");
  assert.deepEqual(calls.parameters, {
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
  });
  assert.equal(calls.recognized, 1);
  await recognizer.dispose();
  assert.equal(calls.terminated, 1);
});

test("同梱ESMのdefault exportからTesseract APIを取得できる", async () => {
  let created = 0;
  const api = {
    OEM: { LSTM_ONLY: 1 },
    PSM: { SINGLE_BLOCK: "6" },
    async createWorker() {
      created += 1;
      return {
        recognize: async () => ({ data: { text: "次の式を展開せよ", confidence: 90 } }),
        setParameters: async () => {},
        terminate: async () => {},
      };
    },
  };
  const recognizer = createJapaneseOcrRecognizer({
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    loadTesseract: async () => ({ default: api }),
  });
  const result = await recognizer.recognize(image());
  assert.equal(result.text, "次の式を展開せよ");
  assert.equal(created, 1);
  await recognizer.dispose();
});

test("chrome-extension以外のasset URLを拒否する", async () => {
  const recognizer = createJapaneseOcrRecognizer({
    runtime: { getURL: (path) => ["https:", "", "example.invalid", path].join("/") },
    loadTesseract: async () => ({
      OEM: { LSTM_ONLY: 1 },
      async createWorker() { throw new Error("must not create"); },
    }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await assert.rejects(
    recognizer.recognize(image()),
    (error) => error instanceof JapaneseOcrError
      && error.code === "JAPANESE_OCR_REMOTE_ASSET_FORBIDDEN",
  );
});

test("空・過長・不可視文字を含む日本語OCR出力は候補にしない", async () => {
  for (const text of ["", "あ".repeat(513), "次の\u200B式を解け"]) {
    const recognizer = createJapaneseOcrRecognizer({
      runtime: { getURL: (path) => `chrome-extension://test/${path}` },
      loadTesseract: async () => ({
        async createWorker() {
          return {
            recognize: async () => ({ data: { text, confidence: 50 } }),
            terminate: async () => {},
          };
        },
      }),
      setTimer: () => 1,
      clearTimer: () => {},
    });
    await assert.rejects(
      recognizer.recognize(image()),
      (error) => error.code === "JAPANESE_OCR_OUTPUT_INVALID",
    );
    await recognizer.dispose();
  }
});

test("画像形式とsignalをstrictに検証する", async () => {
  const recognizer = createJapaneseOcrRecognizer({
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    loadTesseract: async () => ({ createWorker: async () => ({ recognize() {}, terminate() {} }) }),
    setTimer: () => 1,
    clearTimer: () => {},
  });
  await assert.rejects(
    recognizer.recognize(new Blob(["x"], { type: "text/plain" })),
    (error) => error.code === "JAPANESE_OCR_IMAGE_INVALID",
  );
  await assert.rejects(recognizer.recognize(image(), { signal: {} }), TypeError);
});

test("createWorker生成中のcancelは遅れて完成したworkerを一度だけ破棄する", async () => {
  const creationStarted = deferred();
  const createdWorker = deferred();
  let recognized = 0;
  let terminated = 0;
  const worker = {
    async recognize() {
      recognized += 1;
      return { data: { text: "解け", confidence: 80 } };
    },
    async terminate() { terminated += 1; },
  };
  const recognizer = createJapaneseOcrRecognizer({
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    loadTesseract: async () => ({
      async createWorker() {
        creationStarted.resolve();
        return createdWorker.promise;
      },
    }),
    setTimer: () => 1,
    clearTimer: () => {},
  });

  const recognition = recognizer.recognize(image());
  await creationStarted.promise;
  assert.equal(recognizer.cancel(), 1);
  createdWorker.resolve(worker);
  await assert.rejects(
    recognition,
    (error) => error instanceof JapaneseOcrError && error.code === "JAPANESE_OCR_CANCELLED",
  );
  assert.equal(recognized, 0);
  assert.equal(terminated, 1);
  assert.equal(recognizer.status.warm, false);
  assert.equal(recognizer.status.state, "idle");
  await recognizer.dispose();
  assert.equal(terminated, 1);
});

test("createWorker生成中のdisposeは遅れて完成したworkerを保持しない", async () => {
  const creationStarted = deferred();
  const createdWorker = deferred();
  let terminated = 0;
  const recognizer = createJapaneseOcrRecognizer({
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    loadTesseract: async () => ({
      async createWorker() {
        creationStarted.resolve();
        return createdWorker.promise;
      },
    }),
    setTimer: () => 1,
    clearTimer: () => {},
  });

  const recognition = recognizer.recognize(image());
  await creationStarted.promise;
  await recognizer.dispose();
  createdWorker.resolve({
    async recognize() { throw new Error("must not recognize"); },
    async terminate() { terminated += 1; },
  });
  await assert.rejects(
    recognition,
    (error) => error instanceof JapaneseOcrError && error.code === "JAPANESE_OCR_DISPOSED",
  );
  assert.equal(terminated, 1);
  assert.equal(recognizer.status.warm, false);
  assert.equal(recognizer.status.state, "disposed");
});

test("cancel前にqueueへ入った未開始recognizeも新workerを作らず中止する", async () => {
  const firstStarted = deferred();
  const firstResult = deferred();
  let recognized = 0;
  let terminated = 0;
  const worker = {
    async recognize() {
      recognized += 1;
      firstStarted.resolve();
      return firstResult.promise;
    },
    async terminate() { terminated += 1; },
  };
  const recognizer = createJapaneseOcrRecognizer({
    runtime: { getURL: (path) => `chrome-extension://test/${path}` },
    loadTesseract: async () => ({ async createWorker() { return worker; } }),
    setTimer: () => 1,
    clearTimer: () => {},
  });

  const first = recognizer.recognize(image());
  const second = recognizer.recognize(image());
  await firstStarted.promise;
  assert.equal(recognizer.cancel(), 2);
  const firstRejected = assert.rejects(
    first,
    (error) => error instanceof JapaneseOcrError && error.code === "JAPANESE_OCR_CANCELLED",
  );
  const secondRejected = assert.rejects(
    second,
    (error) => error instanceof JapaneseOcrError && error.code === "JAPANESE_OCR_CANCELLED",
  );
  firstResult.resolve({ data: { text: "解け", confidence: 80 } });
  await Promise.all([firstRejected, secondRejected]);
  assert.equal(recognized, 1);
  assert.equal(terminated, 1);
  assert.equal(recognizer.status.warm, false);
  await recognizer.dispose();
});
