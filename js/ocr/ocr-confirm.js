import {
  DISCARD_OCR_CAPTURE,
  GET_OCR_CAPTURE_PREVIEW,
  OCR_CAPTURE_PROTOCOL_VERSION,
  OCR_CAPTURE_TARGET,
  normalizeOcrCaptureMessage,
} from "./capture-contract.js";

const elements = Object.freeze({
  main: document.querySelector("#ocrConfirmMain"),
  status: document.querySelector("#captureStatus"),
  frame: document.querySelector("#previewFrame"),
  image: document.querySelector("#previewImage"),
  placeholder: document.querySelector("#previewPlaceholder"),
  cropInfo: document.querySelector("#cropInfo"),
  sourceInfo: document.querySelector("#sourceInfo"),
  availabilityInfo: document.querySelector("#availabilityInfo"),
  discardButton: document.querySelector("#discardButton"),
  discardHelp: document.querySelector("#discardHelp"),
  message: document.querySelector("#pageMessage"),
});

let captureId = null;
let discarding = false;
let previewExpiryTimer = null;

function clearPreviewExpiryTimer() {
  if (previewExpiryTimer !== null) globalThis.clearTimeout(previewExpiryTimer);
  previewExpiryTimer = null;
}

function clearPreviewSource() {
  elements.image.hidden = true;
  elements.image.removeAttribute("src");
}

function safeErrorMessage(error) {
  return error instanceof Error && error.message
    ? error.message
    : "詳細不明のエラー";
}

function setStatus(text, kind = "info") {
  elements.status.className = `badge ${kind}`;
  elements.status.textContent = text;
}

function setMessage(text, kind = "") {
  elements.message.className = kind ? `notice ${kind}` : "";
  elements.message.textContent = text;
}

function finishLoading() {
  elements.main.setAttribute("aria-busy", "false");
  elements.frame.setAttribute("aria-busy", "false");
}

function failPreview(message) {
  clearPreviewExpiryTimer();
  clearPreviewSource();
  elements.placeholder.hidden = false;
  elements.placeholder.textContent = message;
  elements.frame.dataset.state = "error";
  elements.cropInfo.textContent = "取得できませんでした";
  elements.sourceInfo.textContent = "取得できませんでした";
  elements.availabilityInfo.textContent = "利用不可";
  setStatus("表示できません", "danger");
  finishLoading();
}

function captureMessage(type, id) {
  return normalizeOcrCaptureMessage({
    target: OCR_CAPTURE_TARGET,
    protocolVersion: OCR_CAPTURE_PROTOCOL_VERSION,
    type,
    captureId: id,
  });
}

async function sendBackgroundMessage(message) {
  const sendMessage = globalThis.chrome?.runtime?.sendMessage;
  if (typeof sendMessage !== "function") {
    throw new Error("拡張機能のバックグラウンドへ接続できません。");
  }
  return sendMessage.call(globalThis.chrome.runtime, message);
}

function readCaptureId() {
  const value = new URL(globalThis.location.href).searchParams.get("captureId");
  if (!value) throw new Error("確認対象の識別子がありません。");
  captureMessage(GET_OCR_CAPTURE_PREVIEW, value);
  return value;
}

function requireRecord(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}の形式が不正です。`);
  }
  return value;
}

function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function dimensionsText(value, label) {
  const record = requireRecord(value, label);
  const width = positiveInteger(record.width);
  const height = positiveInteger(record.height);
  if (width === null || height === null) {
    throw new Error(`${label}の画像寸法が不正です。`);
  }
  return `${width.toLocaleString("ja-JP")} × ${height.toLocaleString("ja-JP")} px`;
}

function safePreviewUrl(value) {
  if (typeof value !== "string" || value.length < 1 || value.length > 12 * 1024 * 1024) {
    throw new Error("プレビュー画像URLの形式が不正です。");
  }
  if (value.startsWith("blob:")) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      throw new Error("プレビュー画像URLを解析できません。");
    }
    if (
      parsed.protocol !== "blob:"
      || !parsed.href.startsWith(`blob:${globalThis.location.origin}/`)
    ) {
      throw new Error("拡張機能外のBlob URLは表示できません。");
    }
    return parsed.href;
  }
  const pngPrefix = "data:image/png;base64,";
  if (value.startsWith(pngPrefix)) {
    const payload = value.slice(pngPrefix.length);
    const canonical = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;
    if (payload.startsWith("iVBORw0KGgo") && canonical.test(payload)) return value;
    throw new Error("PNGプレビューのデータが不正です。");
  }
  throw new Error("外部URLのプレビュー画像は表示できません。");
}

function availabilityText(value) {
  const availability = requireRecord(value, "文字認識状態");
  if (availability.available !== false) {
    throw new Error("文字認識の無効状態を確認できません。");
  }
  return availability.code === "OCR_LICENSE_GATE"
    ? "利用不可（モデル資産の配布条件を確認中）"
    : "利用不可";
}

function previewExpiryTimestamp(value) {
  const canonical = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
  const timestamp = typeof value === "string" && canonical.test(value)
    ? Date.parse(value)
    : Number.NaN;
  const currentTime = Date.now();
  if (
    !Number.isFinite(timestamp)
    || new Date(timestamp).toISOString() !== value
    || timestamp <= currentTime
    || timestamp > currentTime + 10 * 60_000
  ) {
    throw new Error("プレビューの有効期限が不正です。");
  }
  return timestamp;
}

function normalizePreviewResponse(response) {
  const envelope = requireRecord(response, "応答");
  if (envelope.ok !== true) {
    const reported = typeof envelope.error?.message === "string"
      ? envelope.error.message
      : "プレビューを取得できませんでした。";
    throw new Error(reported.slice(0, 500));
  }
  const result = requireRecord(envelope.result, "プレビュー応答");
  return Object.freeze({
    previewUrl: safePreviewUrl(result.previewUrl),
    cropText: dimensionsText(result.crop, "切り出し画像"),
    sourceText: dimensionsText(result.source, "元スクリーンショット"),
    availabilityText: availabilityText(result.availability),
    expiresAt: previewExpiryTimestamp(result.expiresAt),
  });
}

function expirePreview() {
  previewExpiryTimer = null;
  clearPreviewSource();
  elements.placeholder.hidden = false;
  elements.placeholder.textContent = "プレビューの確認期限が切れました。";
  elements.frame.dataset.state = "expired";
  setStatus("期限切れ", "danger");
  finishLoading();
  void discardAndClose();
}

function showPreview(preview) {
  clearPreviewExpiryTimer();
  elements.image.src = preview.previewUrl;
  elements.image.hidden = false;
  elements.placeholder.hidden = true;
  elements.frame.dataset.state = "ready";
  elements.cropInfo.textContent = preview.cropText;
  elements.sourceInfo.textContent = preview.sourceText;
  elements.availabilityInfo.textContent = preview.availabilityText;
  setStatus("画像を読み込み中", "info");
  previewExpiryTimer = globalThis.setTimeout(
    expirePreview,
    Math.max(0, preview.expiresAt - Date.now()),
  );
}

function closeConfirmationPage() {
  clearPreviewExpiryTimer();
  try {
    globalThis.close();
  } catch {
    // A directly opened extension page may not be script-closeable. The
    // extension-local fallback below still gives the button a complete action.
  }
  globalThis.setTimeout(() => {
    if (!globalThis.closed) globalThis.location.replace("popup.html");
  }, 80);
}

async function discardAndClose() {
  if (discarding) return;
  discarding = true;
  elements.discardButton.disabled = true;
  elements.discardHelp.textContent = "切り出し画像を破棄しています…";
  setMessage("プレビューを破棄しています…");

  try {
    if (captureId !== null) {
      const response = await sendBackgroundMessage(
        captureMessage(DISCARD_OCR_CAPTURE, captureId),
      );
      if (!response || response.ok !== true) {
        const message = typeof response?.error?.message === "string"
          ? response.error.message
          : "プレビューを破棄できませんでした。";
        throw new Error(message.slice(0, 500));
      }
    }
    setMessage("プレビューを破棄しました。", "success");
    closeConfirmationPage();
  } catch (error) {
    discarding = false;
    elements.discardButton.disabled = false;
    elements.discardHelp.textContent = "もう一度押すと、切り出し画像の破棄を再試行します。";
    setMessage(`プレビューを破棄できません: ${safeErrorMessage(error)}`, "error");
  }
}

elements.discardButton.addEventListener("click", () => {
  discardAndClose();
});
elements.image.addEventListener("load", () => {
  if (elements.frame.dataset.state !== "ready") return;
  setStatus("確認できます", "success");
  finishLoading();
});
elements.image.addEventListener("error", () => {
  if (elements.frame.dataset.state !== "ready") return;
  failPreview("プレビュー画像を読み込めませんでした。");
});

async function initialize() {
  try {
    captureId = readCaptureId();
    const response = await sendBackgroundMessage(
      captureMessage(GET_OCR_CAPTURE_PREVIEW, captureId),
    );
    showPreview(normalizePreviewResponse(response));
  } catch (error) {
    failPreview(`プレビューを表示できません: ${safeErrorMessage(error)}`);
  }
}

initialize();
