import assert from "node:assert/strict";
import test from "node:test";

import { createOffscreenMessageDispatcher } from "../js/offscreen.js";
import {
  CANCEL_OCR_RECOGNITION,
  CREATE_OCR_CAPTURE_PREVIEW,
  DISCARD_OCR_CAPTURE_PREVIEW,
  RECOGNIZE_OCR_CAPTURE_PREVIEW,
} from "../js/ocr/capture-preview-operations.js";

function harness() {
  const calls = { create: [], get: [], getBlob: [], discard: [], recognize: [], cancel: 0 };
  const blob = new Blob(["formula"], { type: "image/png" });
  const capturePreviews = {
    async create(value) {
      calls.create.push(value);
      return { previewId: value.previewId };
    },
    async get(value) {
      calls.get.push(value);
      return { previewId: value, previewUrl: "blob:preview" };
    },
    async getBlob(value) {
      calls.getBlob.push(value);
      return blob;
    },
    async discard(value) {
      calls.discard.push(value);
      return true;
    },
  };
  const ocrEngine = {
    async recognize(value, options) {
      calls.recognize.push({ value, options });
      return { text: "x=1", confirmationRequired: true };
    },
    cancel() {
      calls.cancel += 1;
      return 1;
    },
  };
  const dispatch = createOffscreenMessageDispatcher({ capturePreviews, ocrEngine });
  return { calls, dispatch };
}

test("offscreen dispatcherがcrop previewの作成・取得・破棄を分離する", async () => {
  const { calls, dispatch } = harness();
  const selection = { x: 10, y: 20, width: 80, height: 40 };
  const viewport = { width: 800, height: 600, devicePixelRatio: 2 };
  const created = await dispatch({
    type: CREATE_OCR_CAPTURE_PREVIEW,
    previewId: "capture-1",
    screenshotDataUrl: "data:image/png;base64,AA==",
    selection,
    viewport,
  });
  const loaded = await dispatch({ type: "GET_OCR_CAPTURE_PREVIEW", previewId: "capture-1" });
  const discarded = await dispatch({
    type: DISCARD_OCR_CAPTURE_PREVIEW,
    previewId: "capture-1",
  });

  assert.deepEqual(created, { previewId: "capture-1" });
  assert.deepEqual(loaded, { previewId: "capture-1", previewUrl: "blob:preview" });
  assert.equal(discarded, true);
  assert.deepEqual(calls.create, [{
    previewId: "capture-1",
    screenshotDataUrl: "data:image/png;base64,AA==",
    selection,
    viewport,
  }]);
  assert.deepEqual(calls.get, ["capture-1"]);
  assert.deepEqual(calls.discard, ["capture-1"]);
});

test("offscreen dispatcherが保持BlobだけをOCRへ渡しcancelを中継する", async () => {
  const { calls, dispatch } = harness();
  const output = await dispatch({
    type: RECOGNIZE_OCR_CAPTURE_PREVIEW,
    previewId: "capture-1",
    timeoutMs: 120_000,
  });
  const cancelled = await dispatch({ type: CANCEL_OCR_RECOGNITION });

  assert.deepEqual(output, { text: "x=1", confirmationRequired: true });
  assert.deepEqual(calls.getBlob, ["capture-1"]);
  assert.equal(calls.recognize[0].value instanceof Blob, true);
  assert.equal(calls.recognize[0].options.timeoutMs, 120_000);
  assert.deepEqual(cancelled, { cancelled: true });
  assert.equal(calls.cancel, 1);
});

test("未知のoffscreen操作は型付きで拒否する", async () => {
  const { dispatch } = harness();
  await assert.rejects(
    dispatch({ type: "UNKNOWN" }),
    (error) => error.code === "OFFSCREEN_UNSUPPORTED_OPERATION",
  );
});
