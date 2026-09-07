import assert from "node:assert/strict";
import test from "node:test";

import {
  createOcrCapturePreviewStore,
  OcrCapturePreviewStoreError,
} from "../js/ocr/capture-preview-store.js";

const NOW = Date.parse("2026-09-02T00:00:00.000Z");

function harness({ maxEntries = 2 } = {}) {
  let clock = NOW;
  const calls = { crops: [], revoked: [], timers: [], cleared: [] };
  let nextUrl = 0;
  const store = createOcrCapturePreviewStore({
    now: () => clock,
    maxEntries,
    cropImage: async (input) => {
      calls.crops.push(input);
      nextUrl += 1;
      const url = `blob:preview-${nextUrl}`;
      return {
        blob: new Blob(["test"], { type: "image/png" }),
        blobUrl: url,
        revoke: () => calls.revoked.push(url),
        source: { width: 1600, height: 1200, bytes: 100 },
        crop: { width: 400, height: 200, pixels: 80_000, bytes: 40 },
      };
    },
    setTimer: (callback, delay) => {
      const timer = { callback, delay };
      calls.timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => calls.cleared.push(timer),
  });
  return { store, calls, setClock: (value) => { clock = value; } };
}

function createInput(previewId = "capture-1") {
  return {
    previewId,
    screenshotDataUrl: "data:image/png;base64,AA==",
    selection: { x: 10, y: 20, width: 80, height: 40 },
    viewport: { width: 800, height: 600, devicePixelRatio: 2 },
  };
}

test("crop結果からBlob URLと最小metadataだけを保持する", async () => {
  const { store, calls } = harness();
  const result = await store.create(createInput());

  assert.equal(calls.crops[0].output, "blob-url");
  assert.deepEqual(result, {
    previewId: "capture-1",
    previewUrl: "blob:preview-1",
    source: { width: 1600, height: 1200 },
    crop: { width: 400, height: 200 },
    expiresAt: "2026-09-02T00:10:00.000Z",
  });
  assert.deepEqual(await store.get("capture-1"), result);
  assert.equal((await store.getBlob("capture-1")).type, "image/png");
  assert.equal(Object.hasOwn(result, "blob"), false);
  assert.equal(Object.hasOwn(result, "screenshotDataUrl"), false);
});

test("明示破棄はBlob URLを一度だけrevokeする", async () => {
  const { store, calls } = harness();
  await store.create(createInput());

  assert.equal(await store.discard("capture-1"), true);
  assert.equal(await store.discard("capture-1"), false);
  assert.deepEqual(calls.revoked, ["blob:preview-1"]);
  assert.equal(calls.cleared.length, 1);
});

test("期限切れpreviewは取得時にrevokeして型付きで拒否する", async () => {
  const { store, calls, setClock } = harness();
  await store.create(createInput());
  setClock(NOW + 600_000);

  await assert.rejects(
    store.get("capture-1"),
    (error) => error instanceof OcrCapturePreviewStoreError
      && error.code === "OCR_CAPTURE_PREVIEW_EXPIRED",
  );
  assert.deepEqual(calls.revoked, ["blob:preview-1"]);
});

test("上限到達時は最古のpreviewをrevokeしてから置き換える", async () => {
  const { store, calls } = harness({ maxEntries: 1 });
  await store.create(createInput("capture-1"));
  await store.create(createInput("capture-2"));

  assert.deepEqual(calls.revoked, ["blob:preview-1"]);
  await assert.rejects(
    store.get("capture-1"),
    (error) => error.code === "OCR_CAPTURE_PREVIEW_NOT_FOUND",
  );
  assert.equal((await store.get("capture-2")).previewUrl, "blob:preview-2");
});

test("不正IDと不正crop providerをfail closedにする", async () => {
  const { store } = harness();
  await assert.rejects(
    store.get("../capture"),
    (error) => error.code === "OCR_CAPTURE_PREVIEW_ID_INVALID",
  );

  let revoked = 0;
  const invalid = createOcrCapturePreviewStore({
    cropImage: async () => ({
      blobUrl: "not-a-blob-url",
      revoke: () => { revoked += 1; },
      source: { width: 1, height: 1 },
      crop: { width: 1, height: 1 },
    }),
  });
  await assert.rejects(
    invalid.create(createInput()),
    (error) => error.code === "OCR_CAPTURE_PREVIEW_RESULT_INVALID",
  );
  assert.equal(revoked, 1);
});
