import { setPendingQuestion } from "../storage.js";
import {
  CANCEL_OCR_RECOGNITION,
  DISCARD_OCR_CAPTURE,
  GET_OCR_CAPTURE_PREVIEW,
  OCR_CAPTURE_PROTOCOL_VERSION,
  OCR_CAPTURE_TARGET,
  RECOGNIZE_OCR_CAPTURE,
  normalizeOcrCaptureMessage,
} from "./capture-contract.js";

const MAX_CANDIDATE_CHARACTERS = 4_096;
const DISALLOWED_CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const DISALLOWED_INVISIBLE_CHARACTERS = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;

const elements = Object.freeze({
  main: document.querySelector("#ocrConfirmMain"),
  status: document.querySelector("#captureStatus"),
  frame: document.querySelector("#previewFrame"),
  image: document.querySelector("#previewImage"),
  placeholder: document.querySelector("#previewPlaceholder"),
  cropInfo: document.querySelector("#cropInfo"),
  sourceInfo: document.querySelector("#sourceInfo"),
  availabilityInfo: document.querySelector("#availabilityInfo"),
  recognitionStatus: document.querySelector("#recognitionStatus"),
  recognizeButton: document.querySelector("#recognizeButton"),
  cancelRecognitionButton: document.querySelector("#cancelRecognitionButton"),
  recognitionProgress: document.querySelector("#recognitionProgress"),
  recognitionError: document.querySelector("#recognitionError"),
  candidatePanel: document.querySelector("#candidatePanel"),
  candidateInput: document.querySelector("#candidateInput"),
  candidateHelp: document.querySelector("#candidateHelp"),
  providerInfo: document.querySelector("#providerInfo"),
  backendInfo: document.querySelector("#backendInfo"),
  modelInfo: document.querySelector("#modelInfo"),
  candidateWarning: document.querySelector("#candidateWarning"),
  solveButton: document.querySelector("#solveButton"),
  solveHelp: document.querySelector("#solveHelp"),
  discardButton: document.querySelector("#discardButton"),
  discardHelp: document.querySelector("#discardHelp"),
  message: document.querySelector("#pageMessage"),
});

let captureId = null;
let recognitionAvailable = false;
let recognitionRunning = false;
let discarding = false;
let submitting = false;
let previewDiscarded = false;
let recognitionRevision = 0;
let previewExpiryTimer = null;

function clearPreviewExpiryTimer() {
  if (previewExpiryTimer !== null) globalThis.clearTimeout(previewExpiryTimer);
  previewExpiryTimer = null;
}

function clearPreviewSource() {
  elements.image.hidden = true;
  elements.image.removeAttribute("src");
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  return error instanceof Error && cleanText(error.message)
    ? cleanText(error.message)
    : "詳細不明のエラー";
}

function setStatus(text, kind = "info") {
  elements.status.className = `badge ${kind}`;
  elements.status.textContent = text;
}

function setRecognitionStatus(text, kind = "info") {
  elements.recognitionStatus.className = `badge ${kind}`;
  elements.recognitionStatus.textContent = text;
}

function setMessage(text, kind = "") {
  elements.message.className = kind ? `notice ${kind}` : "";
  elements.message.textContent = text;
}

function setRecognitionError(text = "") {
  elements.recognitionError.textContent = text;
  elements.recognitionError.hidden = !text;
}

function validCandidate(value) {
  const text = cleanText(value);
  return Boolean(
    text
      && text.length <= MAX_CANDIDATE_CHARACTERS
      && !DISALLOWED_CONTROL_CHARACTERS.test(text)
      && !DISALLOWED_INVISIBLE_CHARACTERS.test(text),
  );
}

function updateActionStates() {
  const pageLocked = discarding || submitting;
  elements.recognizeButton.disabled = (
    pageLocked
    || recognitionRunning
    || !recognitionAvailable
    || previewDiscarded
    || captureId === null
  );
  elements.cancelRecognitionButton.hidden = !recognitionRunning;
  elements.cancelRecognitionButton.disabled = pageLocked;
  elements.solveButton.disabled = (
    pageLocked
    || recognitionRunning
    || !validCandidate(elements.candidateInput.value)
  );
  elements.discardButton.disabled = pageLocked;
}

function finishLoading() {
  elements.main.setAttribute("aria-busy", "false");
  elements.frame.setAttribute("aria-busy", "false");
}

function failPreview(message) {
  recognitionAvailable = false;
  clearPreviewExpiryTimer();
  clearPreviewSource();
  elements.placeholder.hidden = false;
  elements.placeholder.textContent = message;
  elements.frame.dataset.state = "error";
  elements.cropInfo.textContent = "取得できませんでした";
  elements.sourceInfo.textContent = "取得できませんでした";
  elements.availabilityInfo.textContent = "利用できません";
  setStatus("表示できません", "danger");
  setRecognitionStatus("開始できません", "danger");
  updateActionStates();
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

function availabilityDetails(value) {
  const availability = requireRecord(value, "文字認識状態");
  if (availability.available === true && availability.code === "OCR_AVAILABLE") {
    return Object.freeze({ available: true, text: "利用可能（端末内処理）" });
  }
  if (availability.available === false) {
    const reason = cleanText(availability.reason).slice(0, 300);
    return Object.freeze({
      available: false,
      text: reason ? `利用不可（${reason}）` : "利用不可",
    });
  }
  throw new Error("文字認識の利用状態を確認できません。");
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
  const availability = availabilityDetails(result.availability);
  return Object.freeze({
    previewUrl: safePreviewUrl(result.previewUrl),
    cropText: dimensionsText(result.crop, "切り出し画像"),
    sourceText: dimensionsText(result.source, "元スクリーンショット"),
    availability,
    expiresAt: previewExpiryTimestamp(result.expiresAt),
  });
}

function safeMetadataText(value, fields, fallback) {
  if (typeof value === "string") return cleanText(value).slice(0, 300) || fallback;
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const parts = fields.map((field) => cleanText(value[field])).filter(Boolean);
  return parts.join(" / ").slice(0, 300) || fallback;
}

function normalizeWarnings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((warning) => typeof warning === "string")
    .map((warning) => cleanText(warning).slice(0, 300))
    .filter(Boolean)
    .slice(0, 5);
}

function normalizeRecognitionResponse(response) {
  const envelope = requireRecord(response, "文字認識応答");
  if (envelope.ok !== true) {
    const reported = typeof envelope.error?.message === "string"
      ? envelope.error.message
      : "文字認識を完了できませんでした。";
    const error = new Error(reported.slice(0, 500));
    error.code = cleanText(envelope.error?.code).slice(0, 100);
    throw error;
  }
  const result = requireRecord(envelope.result, "文字認識結果");
  if (result.captureId !== captureId) {
    throw new Error("文字認識結果の識別子が一致しません。");
  }
  if (result.confirmationRequired !== true) {
    throw new Error("文字認識結果の確認必須状態を検証できません。");
  }
  const candidateText = cleanText(result.candidateText);
  if (!validCandidate(candidateText)) {
    throw new Error("文字認識の候補が空か、安全に扱える長さを超えています。");
  }
  const provider = cleanText(result.provider).toLowerCase();
  if (!new Set(["webgpu", "wasm"]).has(provider)) {
    throw new Error("文字認識の実行方式が不正です。");
  }
  return Object.freeze({
    candidateText,
    provider,
    backend: safeMetadataText(result.backend, ["name", "id", "runtime"], "ローカルOCR"),
    model: safeMetadataText(result.model, ["family", "id", "revision"], "同梱モデル"),
    warnings: Object.freeze(normalizeWarnings(result.warnings)),
  });
}

function expirePreview() {
  previewExpiryTimer = null;
  recognitionAvailable = false;
  clearPreviewSource();
  elements.placeholder.hidden = false;
  elements.placeholder.textContent = "プレビューの確認期限が切れました。";
  elements.frame.dataset.state = "expired";
  setStatus("期限切れ", "danger");
  setRecognitionStatus("期限切れ", "danger");
  updateActionStates();
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
  elements.availabilityInfo.textContent = preview.availability.text;
  recognitionAvailable = preview.availability.available;
  setStatus("画像を読み込み中", "info");
  setRecognitionStatus(recognitionAvailable ? "開始できます" : "利用不可", recognitionAvailable ? "info" : "danger");
  updateActionStates();
  previewExpiryTimer = globalThis.setTimeout(
    expirePreview,
    Math.max(0, preview.expiresAt - Date.now()),
  );
}

function showRecognitionResult(result) {
  elements.candidateInput.value = result.candidateText;
  elements.providerInfo.textContent = result.provider === "webgpu" ? "WebGPU" : "WASM";
  elements.backendInfo.textContent = result.backend;
  elements.modelInfo.textContent = result.model;
  elements.candidateWarning.textContent = result.warnings.length
    ? `注意: ${result.warnings.join(" / ")} 必ず候補を確認してください。`
    : "文字認識の候補は正解とは限りません。記号・指数・括弧を必ず確認してください。";
  elements.candidatePanel.hidden = false;
  elements.recognizeButton.textContent = "もう一度認識";
  elements.candidateHelp.textContent = "候補は未確認です。記号・指数・分数・括弧を見直し、必要なら直接修正してください。";
  setRecognitionStatus("候補を確認してください", "warning");
  setMessage("文字認識が完了しました。候補を確認してから次へ進んでください。", "success");
  updateActionStates();
  elements.candidateInput.focus();
  elements.candidateInput.select();
}

function showManualCandidateFallback() {
  elements.candidatePanel.hidden = false;
  elements.providerInfo.textContent = "認識失敗（手入力）";
  elements.backendInfo.textContent = "未実行";
  elements.modelInfo.textContent = "未実行";
  elements.candidateWarning.textContent = "自動認識に失敗しました。画像を見ながら数式を入力・修正し、内容を確認してから解いてください。";
  elements.candidateHelp.textContent = validCandidate(elements.candidateInput.value)
    ? "入力内容は未確定です。画像と照合してから「この内容で解く」を押してください。"
    : "認識に失敗しました。画像を見ながら数式を入力してください。空欄では解けません。";
}

async function startRecognition() {
  if (recognitionRunning || !recognitionAvailable || discarding || submitting) return;
  const revision = ++recognitionRevision;
  recognitionRunning = true;
  setRecognitionError();
  setMessage("");
  elements.recognitionProgress.hidden = false;
  elements.recognizeButton.textContent = "文字認識中…";
  setRecognitionStatus("認識中", "info");
  updateActionStates();

  try {
    const response = await sendBackgroundMessage(
      captureMessage(RECOGNIZE_OCR_CAPTURE, captureId),
    );
    if (revision !== recognitionRevision) return;
    showRecognitionResult(normalizeRecognitionResponse(response));
  } catch (error) {
    if (revision !== recognitionRevision) return;
    const cancelled = error?.code === "OCR_CANCELLED";
    elements.recognizeButton.textContent = "再試行";
    setRecognitionStatus(cancelled ? "キャンセルしました" : "認識できませんでした", cancelled ? "warning" : "danger");
    if (!cancelled) {
      showManualCandidateFallback();
      setRecognitionError(`文字認識を完了できません: ${safeErrorMessage(error)}`);
      elements.candidateInput.focus();
    }
  } finally {
    if (revision === recognitionRevision) {
      recognitionRunning = false;
      elements.recognitionProgress.hidden = true;
      updateActionStates();
    }
  }
}

async function cancelRecognition({ silent = false } = {}) {
  if (!recognitionRunning || captureId === null) return true;
  recognitionRevision += 1;
  elements.cancelRecognitionButton.disabled = true;
  if (!silent) setRecognitionStatus("中止しています", "warning");
  try {
    const response = await sendBackgroundMessage(
      captureMessage(CANCEL_OCR_RECOGNITION, captureId),
    );
    if (!response || response.ok !== true || typeof response.result?.cancelled !== "boolean") {
      const reported = cleanText(response?.error?.message);
      throw new Error(reported || "文字認識を中止できませんでした。");
    }
    recognitionRunning = false;
    elements.recognitionProgress.hidden = true;
    elements.recognizeButton.textContent = elements.candidatePanel.hidden ? "再試行" : "もう一度認識";
    if (!silent) setRecognitionStatus("キャンセルしました", "warning");
    updateActionStates();
    return true;
  } catch (error) {
    recognitionRunning = false;
    elements.recognitionProgress.hidden = true;
    elements.recognizeButton.textContent = elements.candidatePanel.hidden ? "再試行" : "もう一度認識";
    if (!silent) {
      setRecognitionStatus("中止を確認できませんでした", "danger");
      setRecognitionError(`文字認識を中止できません: ${safeErrorMessage(error)}`);
    }
    updateActionStates();
    return false;
  }
}

async function discardPreview() {
  if (previewDiscarded || captureId === null) return;
  const response = await sendBackgroundMessage(
    captureMessage(DISCARD_OCR_CAPTURE, captureId),
  );
  if (!response || response.ok !== true) {
    const reported = cleanText(response?.error?.message);
    throw new Error(reported || "プレビューを破棄できませんでした。");
  }
  previewDiscarded = true;
  recognitionAvailable = false;
  clearPreviewExpiryTimer();
  clearPreviewSource();
}

function closeConfirmationPage() {
  clearPreviewExpiryTimer();
  try {
    globalThis.close();
  } catch {
    // A directly opened extension page may not be script-closeable.
  }
  globalThis.setTimeout(() => {
    if (!globalThis.closed) globalThis.location.replace("popup.html");
  }, 80);
}

async function discardAndClose() {
  if (discarding || submitting) return;
  discarding = true;
  updateActionStates();
  elements.discardHelp.textContent = "切り出し画像を破棄しています…";
  setMessage("プレビューを破棄しています…");

  try {
    await cancelRecognition({ silent: true });
    await discardPreview();
    elements.candidateInput.value = "";
    setMessage("プレビューを破棄しました。", "success");
    closeConfirmationPage();
  } catch (error) {
    discarding = false;
    elements.discardHelp.textContent = "もう一度押すと、切り出し画像の破棄を再試行します。";
    setMessage(`プレビューを破棄できません: ${safeErrorMessage(error)}`, "error");
    updateActionStates();
  }
}

async function solveCandidate() {
  if (submitting || discarding || recognitionRunning) return;
  const question = cleanText(elements.candidateInput.value);
  if (!validCandidate(question)) {
    setRecognitionError("確認する問題文を入力してください。");
    elements.candidateInput.focus();
    updateActionStates();
    return;
  }

  submitting = true;
  updateActionStates();
  setRecognitionError();
  elements.solveHelp.textContent = "確認済みの問題文を数式エンジンへ渡す準備をしています…";
  setMessage("画像を破棄し、確認済みの問題文を準備しています…");
  try {
    await discardPreview();
    await setPendingQuestion({
      question,
      source: "ocr",
      ocrConfirmed: true,
      requestedMode: "answer",
      autoSolve: true,
    });
    globalThis.location.replace("popup.html");
  } catch (error) {
    submitting = false;
    elements.solveHelp.textContent = previewDiscarded
      ? "画像は破棄済みです。候補を再確認して、もう一度お試しください。"
      : "このボタンを押したときだけ、候補を確認済みとして数式エンジンへ渡します。";
    setMessage(`確認済みの問題文を準備できません: ${safeErrorMessage(error)}`, "error");
    updateActionStates();
  }
}

elements.recognizeButton.addEventListener("click", () => void startRecognition());
elements.cancelRecognitionButton.addEventListener("click", () => void cancelRecognition());
elements.solveButton.addEventListener("click", () => void solveCandidate());
elements.discardButton.addEventListener("click", () => void discardAndClose());
elements.candidateInput.addEventListener("input", () => {
  elements.candidateHelp.textContent = validCandidate(elements.candidateInput.value)
    ? "編集内容はまだ未確定です。「この内容で解く」を押す前に、もう一度確認してください。"
    : "空欄または使用できない文字が含まれています。候補を修正してください。";
  updateActionStates();
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
globalThis.addEventListener("pagehide", () => {
  if (!recognitionRunning || captureId === null) return;
  void sendBackgroundMessage(captureMessage(CANCEL_OCR_RECOGNITION, captureId)).catch(() => {});
});

async function initialize() {
  updateActionStates();
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

void initialize();
