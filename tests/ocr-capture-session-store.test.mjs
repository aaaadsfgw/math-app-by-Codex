import assert from "node:assert/strict";
import test from "node:test";

import {
  createOcrCaptureSessionStore,
  OcrCaptureSessionStoreError,
} from "../js/ocr/capture-session-store.js";

const NOW = Date.parse("2026-09-02T00:00:00.000Z");
const PAGE_URL = ["https:", "//example.invalid/problem"].join("");

function session(overrides = {}) {
  return {
    protocolVersion: 1,
    captureId: "capture-1",
    phase: "selecting",
    expiresAt: new Date(NOW + 60_000).toISOString(),
    tabId: 12,
    windowId: 4,
    frameId: 0,
    documentId: "document-1",
    sourceUrl: PAGE_URL,
    ...overrides,
  };
}

function fakeStorage(initial = {}) {
  const values = structuredClone(initial);
  const calls = { get: 0, set: 0, remove: 0 };
  return {
    calls,
    values,
    area: {
      async get(key) {
        calls.get += 1;
        return Object.hasOwn(values, key) ? { [key]: structuredClone(values[key]) } : {};
      },
      async set(update) {
        calls.set += 1;
        Object.assign(values, structuredClone(update));
      },
      async remove(key) {
        calls.remove += 1;
        delete values[key];
      },
    },
  };
}

function makeStore(storage = fakeStorage(), now = () => NOW) {
  return {
    storage,
    store: createOcrCaptureSessionStore({ storageArea: storage.area, now }),
  };
}

test("metadataだけをstorage.sessionへ保存し正規化済みcopyを返す", async () => {
  const { storage, store } = makeStore();
  const saved = await store.replace(session());

  assert.equal(saved.captureId, "capture-1");
  assert.equal(Object.isFrozen(saved), true);
  assert.equal(storage.calls.set, 1);
  assert.deepEqual(await store.get(), saved);
});

test("画像データをsessionへ保存しない", async () => {
  const { store } = makeStore();
  await assert.rejects(
    store.replace({ ...session(), screenshotDataUrl: "data:image/png;base64,AA==" }),
    (error) => error instanceof OcrCaptureSessionStoreError
      && error.code === "OCR_CAPTURE_SESSION_INVALID"
      && error.cause?.code === "OCR_CAPTURE_IMAGE_STORAGE_FORBIDDEN",
  );
});

test("selectingからpreparingへselectionとviewportを一度だけ確定する", async () => {
  const { store } = makeStore();
  await store.replace(session());
  const transition = {
    captureId: "capture-1",
    from: "selecting",
    to: "preparing",
    patch: {
      selection: { x: 10, y: 20, width: 80, height: 40 },
      viewport: { width: 800, height: 600, devicePixelRatio: 2 },
    },
  };

  const results = await Promise.allSettled([
    store.transition(transition),
    store.transition(transition),
  ]);
  assert.deepEqual(results.map(({ status }) => status), ["fulfilled", "rejected"]);
  assert.equal(results[1].reason.code, "OCR_CAPTURE_SESSION_PHASE_MISMATCH");
  assert.equal((await store.get()).phase, "preparing");
});

test("capture IDが違うsessionを遷移または削除しない", async () => {
  const { store } = makeStore();
  await store.replace(session());
  await assert.rejects(
    store.transition({ captureId: "capture-2", from: "selecting", to: "cancelled" }),
    (error) => error.code === "OCR_CAPTURE_SESSION_ID_MISMATCH",
  );
  assert.equal(await store.clear({ captureId: "capture-2" }), false);
  assert.equal((await store.get()).captureId, "capture-1");
});

test("期限切れsessionは読み取り時に削除する", async () => {
  const storage = fakeStorage({
    ocrCaptureSessionV1: session({ expiresAt: new Date(NOW - 1).toISOString() }),
  });
  const { store } = makeStore(storage);

  assert.equal(await store.get(), null);
  assert.equal(storage.calls.remove, 1);
});

test("破損sessionはfail closedで削除し型付きエラーにする", async () => {
  const storage = fakeStorage({
    ocrCaptureSessionV1: { captureId: "missing-fields", image: "forbidden" },
  });
  const { store } = makeStore(storage);

  await assert.rejects(
    store.get(),
    (error) => error.code === "OCR_CAPTURE_SESSION_CORRUPT",
  );
  assert.equal(storage.calls.remove, 1);
});

test("storage API failureを型付き境界へ閉じ込める", async () => {
  const storage = fakeStorage();
  storage.area.get = async () => { throw new Error("denied"); };
  const { store } = makeStore(storage);
  await assert.rejects(
    store.get(),
    (error) => error.code === "OCR_CAPTURE_SESSION_READ_FAILED",
  );
});
