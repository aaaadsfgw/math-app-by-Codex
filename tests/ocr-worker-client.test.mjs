import assert from "node:assert/strict";
import test from "node:test";

import { createIbemOcrBackendSession } from "../js/ocr/ocr-worker-client.js";

class FakeWorker {
  constructor({ initError = null } = {}) {
    this.initError = initError;
    this.listeners = new Map();
    this.posts = [];
    this.terminated = 0;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, data) {
    for (const listener of this.listeners.get(type) || []) listener({ data });
  }

  postMessage(message) {
    this.posts.push(message);
    queueMicrotask(() => {
      if (message.type === "INIT") {
        this.emit("message", this.initError
          ? { type: "INIT_ERROR", error: this.initError }
          : { type: "READY", provider: message.provider });
      } else if (message.type === "RECOGNIZE") {
        this.emit("message", {
          type: "RESULT",
          requestId: message.requestId,
          result: { text: `x=${message.requestId}`, format: "text" },
        });
      }
    });
  }

  terminate() {
    this.terminated += 1;
  }
}

test("Worker sessionを一度初期化し複数認識でwarm reuseする", async () => {
  const worker = new FakeWorker();
  const session = await createIbemOcrBackendSession({
    provider: "wasm",
    workerFactory: () => worker,
  });
  const first = await session.recognize(new Blob(["a"], { type: "image/png" }));
  const second = await session.recognize(new Blob(["b"], { type: "image/png" }));

  assert.equal(first.text, "x=1");
  assert.equal(second.text, "x=2");
  assert.deepEqual(worker.posts.map(({ type }) => type), ["INIT", "RECOGNIZE", "RECOGNIZE"]);
  session.dispose();
  assert.equal(worker.terminated, 1);
});

test("初期化失敗のcodeを保持しWorkerを停止する", async () => {
  const worker = new FakeWorker({
    initError: { code: "OCR_SESSION_CREATE_FAILED", message: "unsupported operator" },
  });
  await assert.rejects(
    createIbemOcrBackendSession({ provider: "webgpu", workerFactory: () => worker }),
    (error) => error.code === "OCR_SESSION_CREATE_FAILED" && /unsupported/u.test(error.message),
  );
  assert.equal(worker.terminated, 1);
});

test("認識中のAbortは専用Workerをterminateして推論を残さない", async () => {
  const worker = new FakeWorker();
  worker.postMessage = function postMessage(message) {
    this.posts.push(message);
    if (message.type === "INIT") {
      queueMicrotask(() => this.emit("message", { type: "READY", provider: message.provider }));
    }
  };
  const session = await createIbemOcrBackendSession({
    provider: "wasm",
    workerFactory: () => worker,
  });
  const controller = new AbortController();
  const request = session.recognize(new Blob(["a"]), { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, (error) => error.code === "OCR_CANCELLED");
  assert.equal(worker.terminated, 1);
});
