import assert from "node:assert/strict";
import test from "node:test";

import {
  BEGIN_OCR_SELECTION,
  CANCEL_OCR_CAPTURE,
  DISCARD_OCR_CAPTURE,
  GET_OCR_CAPTURE_PREVIEW,
  OCR_CAPTURE_COMPLETE,
  OCR_CAPTURE_MAX_ID_LENGTH,
  OCR_CAPTURE_MAX_URL_LENGTH,
  OCR_CAPTURE_MESSAGE_TYPES,
  OCR_CAPTURE_PHASES,
  OCR_CAPTURE_PROTOCOL_VERSION,
  OCR_CAPTURE_SESSION_STORAGE_KEY,
  OCR_CAPTURE_TARGET,
  OcrCaptureContractError,
  PREPARE_OCR_SCREENSHOT,
  START_OCR_CAPTURE,
  SUBMIT_OCR_SELECTION,
  isOcrCaptureExpired,
  normalizeOcrCaptureMessage,
  normalizeOcrCaptureSession,
  normalizeOcrCaptureStorageRecord,
} from "../js/ocr/capture-contract.js";

const CAPTURE_ID = "24f4e8c8-3db9-445d-8cb7-146f8e41b769";
const DOCUMENT_ID = "b7d217b4-b340-4cf9-b26b-360b511390e2";
const EXPIRES_AT = "2026-09-02T10:15:30.000Z";

function sourceUrl(path = "/problem") {
  return `${"https:"}${"//example.test"}${path}`;
}

function envelope(type, patch = {}) {
  return {
    target: OCR_CAPTURE_TARGET,
    protocolVersion: OCR_CAPTURE_PROTOCOL_VERSION,
    type,
    ...patch,
  };
}

function selection() {
  return { x: 20, y: 30, width: 240, height: 80 };
}

function viewport() {
  return {
    width: 1_280,
    height: 720,
    devicePixelRatio: 2,
    scrollX: 0,
    scrollY: 400,
  };
}

function session(patch = {}) {
  return {
    protocolVersion: OCR_CAPTURE_PROTOCOL_VERSION,
    captureId: CAPTURE_ID,
    phase: "selecting",
    expiresAt: EXPIRES_AT,
    tabId: 42,
    windowId: 7,
    frameId: 0,
    documentId: DOCUMENT_ID,
    sourceUrl: sourceUrl(),
    ...patch,
  };
}

function assertContractError(code) {
  return (error) => error instanceof OcrCaptureContractError && error.code === code;
}

test("OCR capture protocol v1のtarget、message、phaseを固定する", () => {
  assert.equal(OCR_CAPTURE_TARGET, "math-study-log-background");
  assert.equal(OCR_CAPTURE_PROTOCOL_VERSION, 1);
  assert.equal(OCR_CAPTURE_SESSION_STORAGE_KEY, "ocrCaptureSessionV1");
  assert.deepEqual(OCR_CAPTURE_MESSAGE_TYPES, [
    "START_OCR_CAPTURE",
    "BEGIN_OCR_SELECTION",
    "SUBMIT_OCR_SELECTION",
    "PREPARE_OCR_SCREENSHOT",
    "CANCEL_OCR_CAPTURE",
    "GET_OCR_CAPTURE_PREVIEW",
    "DISCARD_OCR_CAPTURE",
    "OCR_CAPTURE_COMPLETE",
  ]);
  assert.deepEqual(OCR_CAPTURE_PHASES, [
    "selecting",
    "preparing",
    "capturing",
    "preview",
    "failed",
    "cancelled",
  ]);
  assert.equal(Object.isFrozen(OCR_CAPTURE_MESSAGE_TYPES), true);
  assert.equal(Object.isFrozen(OCR_CAPTURE_PHASES), true);
});

test("STARTとcaptureIdだけの制御messageをJSON-safeに正規化する", () => {
  const start = normalizeOcrCaptureMessage(envelope(START_OCR_CAPTURE));
  assert.deepEqual(start, envelope(START_OCR_CAPTURE));

  for (const type of [
    PREPARE_OCR_SCREENSHOT,
    GET_OCR_CAPTURE_PREVIEW,
    DISCARD_OCR_CAPTURE,
    OCR_CAPTURE_COMPLETE,
  ]) {
    const normalized = normalizeOcrCaptureMessage(envelope(type, { captureId: CAPTURE_ID }));
    assert.deepEqual(normalized, envelope(type, { captureId: CAPTURE_ID }));
    assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized);
    assert.equal(Object.isFrozen(normalized), true);
  }
});

test("BEGINはdocument identityと期限をcontentへ安全に渡す", () => {
  const normalized = normalizeOcrCaptureMessage(envelope(BEGIN_OCR_SELECTION, {
    captureId: CAPTURE_ID,
    expiresAt: EXPIRES_AT,
    documentId: DOCUMENT_ID,
    sourceUrl: sourceUrl(),
  }));

  assert.deepEqual(normalized, envelope(BEGIN_OCR_SELECTION, {
    captureId: CAPTURE_ID,
    expiresAt: EXPIRES_AT,
    documentId: DOCUMENT_ID,
    sourceUrl: sourceUrl(),
  }));
});

test("SUBMITはselectionとviewportだけをpayload identityとして受理する", () => {
  const normalized = normalizeOcrCaptureMessage(envelope(SUBMIT_OCR_SELECTION, {
    captureId: CAPTURE_ID,
    selection: selection(),
    viewport: viewport(),
  }));

  assert.deepEqual(normalized.selection, selection());
  assert.deepEqual(normalized.viewport, viewport());
  assert.equal(Object.isFrozen(normalized), true);
  assert.equal(Object.isFrozen(normalized.selection), true);
  assert.equal(Object.isFrozen(normalized.viewport), true);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized);

  for (const untrustedIdentity of [
    { documentId: DOCUMENT_ID },
    { sourceUrl: sourceUrl("/spoofed") },
    { tabId: 42 },
  ]) {
    assert.throws(
      () => normalizeOcrCaptureMessage(envelope(SUBMIT_OCR_SELECTION, {
        captureId: CAPTURE_ID,
        selection: selection(),
        viewport: viewport(),
        ...untrustedIdentity,
      })),
      assertContractError("OCR_CAPTURE_UNEXPECTED_FIELD"),
    );
  }
});

test("CANCELは双方向cleanup用の同じ型と任意reasonを使う", () => {
  const withoutReason = normalizeOcrCaptureMessage(envelope(CANCEL_OCR_CAPTURE, {
    captureId: CAPTURE_ID,
  }));
  const withReason = normalizeOcrCaptureMessage(envelope(CANCEL_OCR_CAPTURE, {
    captureId: CAPTURE_ID,
    reason: "ユーザーがEscでキャンセルしました。",
  }));

  assert.equal(withoutReason.type, CANCEL_OCR_CAPTURE);
  assert.equal(withReason.reason, "ユーザーがEscでキャンセルしました。");
});

test("target、version、typeとtype固有必須フィールドをfail closedにする", () => {
  assert.throws(
    () => normalizeOcrCaptureMessage(envelope(START_OCR_CAPTURE, { target: "wrong" })),
    assertContractError("OCR_CAPTURE_PROTOCOL_MISMATCH"),
  );
  assert.throws(
    () => normalizeOcrCaptureMessage(envelope(START_OCR_CAPTURE, { protocolVersion: 2 })),
    assertContractError("OCR_CAPTURE_PROTOCOL_MISMATCH"),
  );
  assert.throws(
    () => normalizeOcrCaptureMessage(envelope("UNKNOWN")),
    assertContractError("OCR_CAPTURE_UNSUPPORTED_MESSAGE"),
  );
  assert.throws(
    () => normalizeOcrCaptureMessage(envelope(PREPARE_OCR_SCREENSHOT)),
    assertContractError("OCR_CAPTURE_REQUIRED_FIELD"),
  );
  assert.throws(
    () => normalizeOcrCaptureMessage(envelope(BEGIN_OCR_SELECTION, {
      captureId: CAPTURE_ID,
      expiresAt: EXPIRES_AT,
      documentId: DOCUMENT_ID,
    })),
    assertContractError("OCR_CAPTURE_REQUIRED_FIELD"),
  );
  assert.throws(
    () => normalizeOcrCaptureMessage(envelope(SUBMIT_OCR_SELECTION, {
      captureId: CAPTURE_ID,
      selection: selection(),
    })),
    assertContractError("OCR_CAPTURE_REQUIRED_FIELD"),
  );
});

test("sessionはtab/window/frame/document/source URLと正規ISO期限を保持する", () => {
  const normalized = normalizeOcrCaptureSession(session());
  assert.deepEqual(normalized, session());
  assert.equal(Object.isFrozen(normalized), true);
  assert.deepEqual(JSON.parse(JSON.stringify(normalized)), normalized);

  const preview = normalizeOcrCaptureStorageRecord(session({
    phase: "preview",
    selection: selection(),
    viewport: viewport(),
  }));
  assert.equal(preview.phase, "preview");
  assert.deepEqual(preview.selection, selection());
  assert.equal(Object.isFrozen(preview.selection), true);
});

test("session phaseとselection/viewportの整合を厳格に検証する", () => {
  assert.throws(
    () => normalizeOcrCaptureSession(session({ phase: "unknown" })),
    assertContractError("OCR_CAPTURE_INVALID_PHASE"),
  );
  assert.throws(
    () => normalizeOcrCaptureSession(session({ phase: "capturing" })),
    assertContractError("OCR_CAPTURE_INCOMPLETE_METADATA"),
  );
  assert.throws(
    () => normalizeOcrCaptureSession(session({ selection: selection() })),
    assertContractError("OCR_CAPTURE_INCOMPLETE_METADATA"),
  );
  assert.throws(
    () => normalizeOcrCaptureSession(session({
      phase: "selecting",
      selection: selection(),
      viewport: viewport(),
    })),
    assertContractError("OCR_CAPTURE_UNEXPECTED_FIELD"),
  );
});

test("preview tab IDはpreview phaseのmetadataにだけ保持する", () => {
  const preview = normalizeOcrCaptureSession(session({
    phase: "preview",
    previewTabId: 99,
    selection: { x: 10, y: 20, width: 80, height: 40 },
    viewport: { width: 800, height: 600, devicePixelRatio: 2 },
  }));
  assert.equal(preview.previewTabId, 99);
  assert.throws(
    () => normalizeOcrCaptureSession(session({ previewTabId: 99 })),
    assertContractError("OCR_CAPTURE_UNEXPECTED_FIELD"),
  );
});

test("期限は正規ISO文字列だけを受理し期限切れ判定を分離する", () => {
  for (const expiresAt of [
    "2026-09-02",
    "2026-09-02T10:15:30Z",
    "2026-13-02T10:15:30.000Z",
    "not-a-date",
  ]) {
    assert.throws(
      () => normalizeOcrCaptureSession(session({ expiresAt })),
      assertContractError("OCR_CAPTURE_INVALID_EXPIRY"),
    );
  }

  assert.equal(isOcrCaptureExpired(session(), Date.parse(EXPIRES_AT) - 1), false);
  assert.equal(isOcrCaptureExpired(session(), Date.parse(EXPIRES_AT)), true);
  assert.throws(() => isOcrCaptureExpired(session(), Number.NaN), TypeError);
});

test("過長または不正なcaptureId/documentId/source URLを拒否する", () => {
  for (const captureId of [
    "",
    "contains space",
    "a".repeat(OCR_CAPTURE_MAX_ID_LENGTH + 1),
  ]) {
    assert.throws(
      () => normalizeOcrCaptureSession(session({ captureId })),
      assertContractError("OCR_CAPTURE_INVALID_ID"),
    );
  }

  assert.throws(
    () => normalizeOcrCaptureSession(session({ documentId: "bad document" })),
    assertContractError("OCR_CAPTURE_INVALID_DOCUMENT"),
  );
  assert.throws(
    () => normalizeOcrCaptureSession(session({
      sourceUrl: `${"https:"}${"//example.test/"}${"a".repeat(OCR_CAPTURE_MAX_URL_LENGTH)}`,
    })),
    assertContractError("OCR_CAPTURE_INVALID_SOURCE_URL"),
  );
  assert.throws(
    () => normalizeOcrCaptureSession(session({ sourceUrl: `${"file:"}${"///tmp/problem"}` })),
    assertContractError("OCR_CAPTURE_INVALID_SOURCE_URL"),
  );
  assert.throws(
    () => normalizeOcrCaptureSession(session({
      sourceUrl: `${"https:"}${"//user:secret@example.test/problem"}`,
    })),
    assertContractError("OCR_CAPTURE_INVALID_SOURCE_URL"),
  );
});

test("routing IDとselection/viewportの数値を有限・安全・範囲内に制限する", () => {
  for (const patch of [
    { tabId: -1 },
    { windowId: 1.5 },
    { frameId: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    assert.throws(
      () => normalizeOcrCaptureSession(session(patch)),
      assertContractError("OCR_CAPTURE_INVALID_ROUTE"),
    );
  }

  for (const badSelection of [
    { x: Number.NaN, y: 0, width: 30, height: 30 },
    { x: -1, y: 0, width: 30, height: 30 },
    { x: 0, y: 0, width: 0, height: 30 },
    { x: 1_270, y: 0, width: 20, height: 30 },
  ]) {
    assert.throws(
      () => normalizeOcrCaptureMessage(envelope(SUBMIT_OCR_SELECTION, {
        captureId: CAPTURE_ID,
        selection: badSelection,
        viewport: viewport(),
      })),
      (error) => error instanceof OcrCaptureContractError,
    );
  }

  assert.throws(
    () => normalizeOcrCaptureMessage(envelope(SUBMIT_OCR_SELECTION, {
      captureId: CAPTURE_ID,
      selection: selection(),
      viewport: { ...viewport(), devicePixelRatio: Infinity },
    })),
    assertContractError("OCR_CAPTURE_INVALID_METADATA"),
  );
});

test("hostile getterを一度も実行せず、検査trap例外もtyped errorへ閉じ込める", () => {
  let getterCalled = false;
  const hostile = envelope(PREPARE_OCR_SCREENSHOT);
  Object.defineProperty(hostile, "captureId", {
    enumerable: true,
    get() {
      getterCalled = true;
      throw new Error("do not execute");
    },
  });

  assert.throws(
    () => normalizeOcrCaptureMessage(hostile),
    assertContractError("OCR_CAPTURE_ACCESSOR_FORBIDDEN"),
  );
  assert.equal(getterCalled, false);

  const proxy = new Proxy({}, {
    getPrototypeOf() {
      throw new Error("hostile proxy");
    },
  });
  assert.throws(
    () => normalizeOcrCaptureMessage(proxy),
    assertContractError("OCR_CAPTURE_MALFORMED"),
  );
});

test("prototype汚染・独自prototype・未知フィールドをfail closedにする", () => {
  const polluted = JSON.parse(JSON.stringify({
    ...envelope(PREPARE_OCR_SCREENSHOT, { captureId: CAPTURE_ID }),
    __protoMarker: true,
  }).replace("__protoMarker", "__proto__"));
  assert.throws(
    () => normalizeOcrCaptureMessage(polluted),
    assertContractError("OCR_CAPTURE_PROTOTYPE_POLLUTION"),
  );

  const inherited = Object.assign(Object.create({ captureId: "inherited" }), session());
  assert.throws(
    () => normalizeOcrCaptureSession(inherited),
    assertContractError("OCR_CAPTURE_UNSAFE_PROTOTYPE"),
  );

  assert.throws(
    () => normalizeOcrCaptureSession(session({ unexpected: true })),
    assertContractError("OCR_CAPTURE_UNKNOWN_FIELD"),
  );
  assert.equal(Object.prototype.polluted, undefined);
});

test("storage.session用recordへ画像・data URL・bytesを混入させない", () => {
  for (const imagePatch of [
    { imageDataUrl: `${"data:"}${"image/png;base64,AAAA"}` },
    { screenshot: { pixels: true } },
    { bytes: new Uint8Array([1, 2, 3]) },
    { preview: `${"data:"}${"image/png;base64,BBBB"}` },
  ]) {
    assert.throws(
      () => normalizeOcrCaptureStorageRecord(session(imagePatch)),
      assertContractError("OCR_CAPTURE_IMAGE_STORAGE_FORBIDDEN"),
    );
  }

  const stored = normalizeOcrCaptureStorageRecord(session({
    phase: "preview",
    selection: selection(),
    viewport: viewport(),
  }));
  const serialized = JSON.stringify(stored);
  assert.doesNotMatch(serialized, /data:|base64|blob|bytes|image|pixels|screenshot/u);
  assert.deepEqual(JSON.parse(serialized), stored);
});
