import {
  BEGIN_OCR_SELECTION,
  CANCEL_OCR_CAPTURE,
  CANCEL_OCR_RECOGNITION,
  DISCARD_OCR_CAPTURE,
  GET_OCR_CAPTURE_PREVIEW,
  normalizeOcrCaptureMessage,
  OCR_CAPTURE_COMPLETE,
  OCR_CAPTURE_MESSAGE_TARGET,
  OCR_CAPTURE_PROTOCOL_VERSION,
  PREPARE_OCR_SCREENSHOT,
  RECOGNIZE_OCR_CAPTURE,
  START_OCR_CAPTURE,
  SUBMIT_OCR_SELECTION,
} from "./capture-contract.js";
import { validateViewportSelection } from "./capture-geometry.js";
import { OCR_AVAILABLE_STATUS, OCR_DEFAULT_TIMEOUT_MS } from "./ocr-config.js";
import {
  CANCEL_OCR_RECOGNITION as CANCEL_OCR_RECOGNITION_OFFSCREEN,
  CREATE_OCR_CAPTURE_PREVIEW,
  DISCARD_OCR_CAPTURE_PREVIEW,
  RECOGNIZE_OCR_CAPTURE_PREVIEW,
} from "./capture-preview-operations.js";

export {
  CREATE_OCR_CAPTURE_PREVIEW,
  DISCARD_OCR_CAPTURE_PREVIEW,
} from "./capture-preview-operations.js";

export const OCR_CAPTURE_SESSION_TTL_MS = 10 * 60 * 1_000;
export const OCR_CAPTURE_CONFIRMATION_PATH = "ocr-confirm.html";

const INBOUND_MESSAGE_TYPES = new Set([
  START_OCR_CAPTURE,
  SUBMIT_OCR_SELECTION,
  CANCEL_OCR_CAPTURE,
  GET_OCR_CAPTURE_PREVIEW,
  RECOGNIZE_OCR_CAPTURE,
  CANCEL_OCR_RECOGNITION,
  DISCARD_OCR_CAPTURE,
]);

const OCR_RESULT_CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const OCR_RESULT_INVISIBLE_CHARACTER = /[\u00AD\u034F\u061C\u180E\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u206F\uFEFF]/u;
const OCR_RECOGNITION_KINDS = new Set(["formula-only", "mixed", "instruction-only"]);

export class OcrCaptureControllerError extends Error {
  constructor(message, { code = "OCR_CAPTURE_CONTROLLER_ERROR", cause = null } = {}) {
    super(message, cause instanceof Error ? { cause } : undefined);
    this.name = "OcrCaptureControllerError";
    this.code = code;
  }
}

function controllerError(message, code, cause = null) {
  return new OcrCaptureControllerError(message, { code, cause });
}

function requireFunction(value, label) {
  if (typeof value !== "function") throw new TypeError(`${label}は関数で指定してください。`);
  return value;
}

function safeNow(now) {
  const value = now();
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("nowは有限のUNIX時刻を返す必要があります。");
  }
  return value;
}

function normalizeHttpUrl(value) {
  if (typeof value !== "string" || value.length < 1) return null;
  try {
    const url = new URL(value);
    if (!new Set(["http:", "https:"]).has(url.protocol)) return null;
    if (url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

function sameJsonValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function requireRoutingId(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw controllerError(`${label}を取得できませんでした。`, "OCR_CAPTURE_ROUTE_UNAVAILABLE");
  }
  return value;
}

function normalizePreviewMetadata(value, captureId, currentTime) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw controllerError("OCR previewの応答形式が不正です。", "OCR_CAPTURE_PREVIEW_INVALID");
  }
  if (value.previewId !== captureId) {
    throw controllerError("OCR preview IDが一致しません。", "OCR_CAPTURE_PREVIEW_ID_MISMATCH");
  }
  if (typeof value.previewUrl !== "string" || !value.previewUrl.startsWith("blob:")) {
    throw controllerError("OCR preview URLが不正です。", "OCR_CAPTURE_PREVIEW_INVALID");
  }
  const expiresAtTimestamp = Date.parse(value.expiresAt);
  if (
    typeof value.expiresAt !== "string"
    || !Number.isFinite(expiresAtTimestamp)
    || new Date(expiresAtTimestamp).toISOString() !== value.expiresAt
    || expiresAtTimestamp <= currentTime
    || expiresAtTimestamp > currentTime + 10 * 60_000
  ) {
    throw controllerError("OCR previewの期限が不正です。", "OCR_CAPTURE_PREVIEW_INVALID");
  }

  const normalizeSize = (size, label) => {
    if (!size || typeof size !== "object" || Array.isArray(size)) {
      throw controllerError(`${label}の形式が不正です。`, "OCR_CAPTURE_PREVIEW_INVALID");
    }
    const width = size.width;
    const height = size.height;
    if (
      !Number.isSafeInteger(width)
      || !Number.isSafeInteger(height)
      || width <= 0
      || height <= 0
    ) {
      throw controllerError(`${label}の寸法が不正です。`, "OCR_CAPTURE_PREVIEW_INVALID");
    }
    return Object.freeze({ width, height });
  };

  return Object.freeze({
    previewId: captureId,
    previewUrl: value.previewUrl,
    expiresAt: value.expiresAt,
    source: normalizeSize(value.source, "OCR source"),
    crop: normalizeSize(value.crop, "OCR crop"),
  });
}

function serializeError(error) {
  return Object.freeze({
    code: String(error?.code || "OCR_CAPTURE_FAILED"),
    message: String(error?.message || "OCR captureに失敗しました。"),
  });
}

function safeOcrText(value, maximum, { optional = false } = {}) {
  if (typeof value !== "string") {
    if (optional && value === undefined) return "";
    throw controllerError("OCR候補の文字列形式が不正です。", "OCR_RECOGNITION_OUTPUT_INVALID");
  }
  const text = value.replace(/\r\n?/gu, "\n").trim();
  if (
    (!text && !optional)
    || text.length > maximum
    || OCR_RESULT_CONTROL_CHARACTER.test(text)
    || OCR_RESULT_INVISIBLE_CHARACTER.test(text)
  ) {
    throw controllerError("OCR候補の文字列が不正です。", "OCR_RECOGNITION_OUTPUT_INVALID");
  }
  return text;
}

function safeStructuredCandidate(value, recognitionKind, fallbackFormula) {
  if (value === undefined && recognitionKind === "formula-only") {
    return Object.freeze({
      questionLabel: "",
      instructionText: "",
      instructionIntent: null,
      instructionStatus: "empty",
      formulaText: fallbackFormula,
      conditions: Object.freeze([]),
      rawInstructionText: "",
      rawFormulaText: fallbackFormula,
      source: "ocr",
      instructionSource: "none",
      formulaSource: "ocr",
    });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw controllerError("構造化OCR候補の形式が不正です。", "OCR_RECOGNITION_OUTPUT_INVALID");
  }
  const questionLabel = safeOcrText(value.questionLabel ?? "", 32, { optional: true });
  const instructionText = safeOcrText(value.instructionText ?? "", 512, { optional: true });
  const formulaText = safeOcrText(value.formulaText ?? "", 4_096, { optional: true });
  if (recognitionKind === "instruction-only" ? !instructionText : !formulaText) {
    throw controllerError("構造化OCR候補の必須欄が空です。", "OCR_RECOGNITION_OUTPUT_INVALID");
  }
  if (!Array.isArray(value.conditions) || value.conditions.length > 8) {
    throw controllerError("構造化OCR候補の条件が不正です。", "OCR_RECOGNITION_OUTPUT_INVALID");
  }
  const conditions = value.conditions.map((condition) => safeOcrText(condition, 512));
  const instructionIntent = value.instructionIntent === null
    || value.instructionIntent === undefined
    ? null
    : safeOcrText(value.instructionIntent, 64);
  const instructionStatus = safeOcrText(value.instructionStatus ?? "empty", 32);
  if (value.source !== "ocr") {
    throw controllerError("構造化OCR候補の入力元が不正です。", "OCR_RECOGNITION_OUTPUT_INVALID");
  }
  const instructionSource = instructionText && value.instructionSource === "ocr" ? "ocr" : "none";
  const formulaSource = formulaText && value.formulaSource === "ocr" ? "ocr" : "none";
  return Object.freeze({
    questionLabel,
    instructionText,
    instructionIntent,
    instructionStatus,
    formulaText,
    conditions: Object.freeze(conditions),
    rawInstructionText: safeOcrText(value.rawInstructionText ?? instructionText, 512, { optional: true }),
    rawFormulaText: safeOcrText(value.rawFormulaText ?? formulaText, 4_096, { optional: true }),
    source: "ocr",
    instructionSource,
    formulaSource,
  });
}

export function isOcrCaptureRuntimeMessage(message) {
  try {
    return message?.target === OCR_CAPTURE_MESSAGE_TARGET
      && message?.protocolVersion === OCR_CAPTURE_PROTOCOL_VERSION
      && INBOUND_MESSAGE_TYPES.has(message?.type);
  } catch {
    return false;
  }
}

export function createOcrCaptureRuntimeListener(controller) {
  if (!controller || typeof controller.handleMessage !== "function") {
    throw new TypeError("controller.handleMessageが必要です。");
  }
  return (message, sender, sendResponse) => {
    if (!isOcrCaptureRuntimeMessage(message)) return false;
    void controller.handleMessage(message, sender).then(
      (result) => sendResponse({ ok: true, result }),
      (error) => sendResponse({ ok: false, error: serializeError(error) }),
    );
    return true;
  };
}

export function createOcrCaptureController({
  extensionApi = globalThis.chrome,
  sessionStore,
  runOffscreenRequest,
  now = Date.now,
  createCaptureId = () => globalThis.crypto.randomUUID(),
  ttlMs = OCR_CAPTURE_SESSION_TTL_MS,
  confirmationPath = OCR_CAPTURE_CONFIRMATION_PATH,
} = {}) {
  const runtime = extensionApi?.runtime;
  const tabs = extensionApi?.tabs;
  const scripting = extensionApi?.scripting;
  if (
    !runtime?.id
    || typeof runtime.getURL !== "function"
    || typeof tabs?.query !== "function"
    || typeof tabs?.sendMessage !== "function"
    || typeof tabs?.captureVisibleTab !== "function"
    || typeof tabs?.create !== "function"
    || typeof tabs?.get !== "function"
    || typeof tabs?.remove !== "function"
    || typeof tabs?.onActivated?.addListener !== "function"
    || typeof tabs?.onActivated?.removeListener !== "function"
    || typeof scripting?.executeScript !== "function"
  ) {
    throw controllerError("OCR captureに必要なChrome APIを利用できません。", "OCR_CAPTURE_API_UNAVAILABLE");
  }
  if (
    !sessionStore
    || typeof sessionStore.get !== "function"
    || typeof sessionStore.replace !== "function"
    || typeof sessionStore.transition !== "function"
    || typeof sessionStore.clear !== "function"
  ) {
    throw new TypeError("sessionStoreのOCR capture APIが不足しています。");
  }
  const offscreenRequest = requireFunction(runOffscreenRequest, "runOffscreenRequest");
  requireFunction(now, "now");
  requireFunction(createCaptureId, "createCaptureId");
  if (!Number.isSafeInteger(ttlMs) || ttlMs < 10_000 || ttlMs > 10 * 60_000) {
    throw new TypeError("ttlMsは10秒以上10分以下の整数で指定してください。");
  }
  if (typeof confirmationPath !== "string" || !/^[A-Za-z0-9._/-]+\.html$/u.test(confirmationPath)) {
    throw new TypeError("confirmationPathは拡張機能内のHTMLパスで指定してください。");
  }

  const extensionOrigin = new URL(runtime.getURL("/")).origin;
  let startInProgress = false;
  let submitInProgress = false;

  function requireExtensionPageSender(sender, expectedPath) {
    if (sender?.id !== runtime.id || typeof sender?.url !== "string") {
      throw controllerError("このOCR操作の送信元を確認できません。", "OCR_CAPTURE_SENDER_REJECTED");
    }
    let url;
    try {
      url = new URL(sender.url);
    } catch {
      throw controllerError("このOCR操作の送信元URLが不正です。", "OCR_CAPTURE_SENDER_REJECTED");
    }
    const normalizedExpected = expectedPath.startsWith("/") ? expectedPath : `/${expectedPath}`;
    if (url.origin !== extensionOrigin || url.pathname !== normalizedExpected) {
      throw controllerError("この拡張機能ページからはOCR操作を開始できません。", "OCR_CAPTURE_SENDER_REJECTED");
    }
    return url;
  }

  function requireBoundContentSender(sender, session) {
    const senderUrl = normalizeHttpUrl(sender?.url);
    if (
      sender?.id !== runtime.id
      || sender?.frameId !== session.frameId
      || sender?.documentId !== session.documentId
      || sender?.tab?.id !== session.tabId
      || sender?.tab?.windowId !== session.windowId
      || senderUrl !== session.sourceUrl
    ) {
      throw controllerError(
        "OCR選択メッセージのタブまたは文書が現在のsessionと一致しません。",
        "OCR_CAPTURE_SENDER_MISMATCH",
      );
    }
  }

  async function getSessionOrThrow(captureId) {
    const session = await sessionStore.get({ clearExpired: false });
    if (!session || session.captureId !== captureId) {
      throw controllerError("OCR capture sessionが見つかりません。", "OCR_CAPTURE_SESSION_NOT_FOUND");
    }
    if (Date.parse(session.expiresAt) <= safeNow(now)) {
      await cleanupSession(session);
      throw controllerError("OCR capture sessionの期限が切れました。", "OCR_CAPTURE_SESSION_EXPIRED");
    }
    return session;
  }

  async function sendDocumentMessage(session, type, extra = {}) {
    return tabs.sendMessage(
      session.tabId,
      {
        target: OCR_CAPTURE_MESSAGE_TARGET,
        protocolVersion: OCR_CAPTURE_PROTOCOL_VERSION,
        type,
        captureId: session.captureId,
        ...extra,
      },
      { documentId: session.documentId },
    );
  }

  async function discardPreviewBestEffort(captureId) {
    try {
      await offscreenRequest(
        DISCARD_OCR_CAPTURE_PREVIEW,
        { previewId: captureId },
        { timeoutMs: 5_000, extensionApi },
      );
    } catch (error) {
      console.warn("Could not discard OCR capture preview", error);
    }
  }

  async function cancelRecognitionBestEffort() {
    try {
      await offscreenRequest(
        CANCEL_OCR_RECOGNITION_OFFSCREEN,
        {},
        { timeoutMs: 5_000, extensionApi },
      );
    } catch (error) {
      console.warn("Could not cancel OCR recognition", error);
    }
  }

  async function cleanupSession(
    session,
    {
      notifyDocument = true,
      discardPreview = new Set(["capturing", "preview"]).has(session.phase),
    } = {},
  ) {
    if (notifyDocument) {
      try {
        await sendDocumentMessage(session, CANCEL_OCR_CAPTURE, { reason: "capture-cleanup" });
      } catch {
        // Navigation or tab closure is an expected cleanup path.
      }
    }
    if (session.phase === "preview") await cancelRecognitionBestEffort();
    if (discardPreview) await discardPreviewBestEffort(session.captureId);
    await sessionStore.clear({ captureId: session.captureId });
  }

  async function cleanupPreviousSession() {
    let previous;
    try {
      previous = await sessionStore.get({ clearExpired: false });
    } catch (error) {
      if (error?.code === "OCR_CAPTURE_SESSION_CORRUPT") return;
      throw error;
    }
    if (previous) await cleanupSession(previous);
  }

  async function performStartCapture(sender) {
    requireExtensionPageSender(sender, "popup.html");
    const [tab] = await tabs.query({ active: true, currentWindow: true });
    const tabId = requireRoutingId(tab?.id, "アクティブなタブID");
    const windowId = requireRoutingId(tab?.windowId, "ウィンドウID");
    const sourceUrl = normalizeHttpUrl(tab?.url);
    if (!sourceUrl) {
      throw controllerError(
        "このページでは画像範囲を選択できません。HTTP(S)ページで使用してください。",
        "OCR_CAPTURE_PAGE_UNSUPPORTED",
      );
    }

    await cleanupPreviousSession();

    const captureId = String(createCaptureId());
    const expiresAt = new Date(safeNow(now) + ttlMs).toISOString();
    const injections = await scripting.executeScript({
      target: { tabId, frameIds: [0] },
      files: ["js/ocr/capture-overlay.js"],
    });
    const mainFrame = Array.isArray(injections)
      ? injections.find((result) => result?.frameId === 0)
      : null;
    if (!mainFrame || typeof mainFrame.documentId !== "string" || !mainFrame.documentId) {
      throw controllerError(
        "OCR範囲選択をメイン文書へ接続できませんでした。",
        "OCR_CAPTURE_INJECTION_FAILED",
      );
    }

    const session = await sessionStore.replace({
      protocolVersion: OCR_CAPTURE_PROTOCOL_VERSION,
      captureId,
      phase: "selecting",
      expiresAt,
      tabId,
      windowId,
      frameId: 0,
      documentId: mainFrame.documentId,
      sourceUrl,
    });

    try {
      const response = await sendDocumentMessage(session, BEGIN_OCR_SELECTION, {
        expiresAt,
        documentId: session.documentId,
        sourceUrl,
      });
      if (response?.ok !== true || response.captureId !== captureId) {
        throw controllerError("OCR範囲選択を開始できませんでした。", "OCR_CAPTURE_BEGIN_FAILED");
      }
    } catch (cause) {
      await cleanupSession(session);
      if (cause instanceof OcrCaptureControllerError) throw cause;
      throw controllerError("OCR範囲選択を開始できませんでした。", "OCR_CAPTURE_BEGIN_FAILED", cause);
    }

    return Object.freeze({ captureId, expiresAt, phase: "selecting" });
  }

  async function startCapture(sender) {
    if (startInProgress || submitInProgress) {
      throw controllerError(
        "別のOCR範囲選択または画像取得がすでに進行中です。",
        submitInProgress ? "OCR_CAPTURE_BUSY" : "OCR_CAPTURE_ALREADY_STARTING",
      );
    }
    startInProgress = true;
    try {
      return await performStartCapture(sender);
    } finally {
      startInProgress = false;
    }
  }

  async function ensureStillActive(session) {
    const [active] = await tabs.query({ active: true, windowId: session.windowId });
    if (
      active?.id !== session.tabId
      || active?.windowId !== session.windowId
      || normalizeHttpUrl(active?.url) !== session.sourceUrl
    ) {
      throw controllerError(
        "範囲選択後にアクティブなページが変わったため、画像取得を中止しました。",
        "OCR_CAPTURE_TAB_CHANGED",
      );
    }
  }

  function monitorTabActivation(session) {
    let changed = false;
    const listener = (activeInfo) => {
      if (
        activeInfo?.windowId === session.windowId
        && activeInfo?.tabId !== session.tabId
      ) {
        changed = true;
      }
    };
    tabs.onActivated.addListener(listener);
    return Object.freeze({
      assertUnchanged() {
        if (changed) {
          throw controllerError(
            "画像取得中にアクティブなタブが変わったため中止しました。",
            "OCR_CAPTURE_TAB_CHANGED_DURING_SCREENSHOT",
          );
        }
      },
      stop() {
        tabs.onActivated.removeListener(listener);
      },
    });
  }

  async function completeOriginalDocument(session) {
    let response;
    try {
      response = await sendDocumentMessage(session, OCR_CAPTURE_COMPLETE);
    } catch (cause) {
      throw controllerError(
        "画像取得中に元の文書が移動または再読み込みされました。",
        "OCR_CAPTURE_DOCUMENT_CHANGED",
        cause,
      );
    }
    if (response?.ok !== true) {
      throw controllerError(
        "元の文書へ画像取得完了を確認できませんでした。",
        "OCR_CAPTURE_DOCUMENT_CHANGED",
      );
    }
  }

  async function performSubmitSelection(message, sender) {
    const initial = await getSessionOrThrow(message.captureId);
    requireBoundContentSender(sender, initial);
    if (initial.phase !== "selecting") {
      throw controllerError("このOCR範囲はすでに処理中です。", "OCR_CAPTURE_PHASE_MISMATCH");
    }

    const geometry = validateViewportSelection(message.selection, message.viewport);
    const selection = geometry.selectionCss;
    const viewport = Object.freeze({
      width: geometry.viewportCss.width,
      height: geometry.viewportCss.height,
      devicePixelRatio: geometry.devicePixelRatio ?? message.viewport.devicePixelRatio,
    });
    const session = await sessionStore.transition({
      captureId: message.captureId,
      from: "selecting",
      to: "preparing",
      patch: { selection, viewport },
    });

    let previewRequested = false;
    let confirmationTabId = null;
    try {
      const prepared = await sendDocumentMessage(session, PREPARE_OCR_SCREENSHOT);
      if (
        prepared?.ok !== true
        || prepared.protocolVersion !== OCR_CAPTURE_PROTOCOL_VERSION
        || prepared.captureId !== session.captureId
        || !sameJsonValue(prepared.selection, selection)
        || !sameJsonValue(prepared.viewport, viewport)
      ) {
        throw controllerError(
          "OCR範囲選択画面を安全に非表示へ移行できませんでした。",
          "OCR_CAPTURE_PREPARE_FAILED",
        );
      }

      const activationMonitor = monitorTabActivation(session);
      let screenshotDataUrl;
      try {
        await ensureStillActive(session);
        await sessionStore.transition({
          captureId: session.captureId,
          from: "preparing",
          to: "capturing",
        });
        screenshotDataUrl = await tabs.captureVisibleTab(session.windowId, { format: "png" });
        await ensureStillActive(session);
        activationMonitor.assertUnchanged();
        await completeOriginalDocument(session);
        await ensureStillActive(session);
        activationMonitor.assertUnchanged();
      } finally {
        activationMonitor.stop();
      }
      previewRequested = true;
      const rawPreview = await offscreenRequest(
        CREATE_OCR_CAPTURE_PREVIEW,
        {
          previewId: session.captureId,
          screenshotDataUrl,
          selection,
          viewport,
        },
        { timeoutMs: 15_000, extensionApi },
      );
      const preview = normalizePreviewMetadata(
        rawPreview,
        session.captureId,
        safeNow(now),
      );

      await sessionStore.transition({
        captureId: session.captureId,
        from: "capturing",
        to: "preview",
        patch: { expiresAt: preview.expiresAt },
      });

      const confirmationUrl = new URL(confirmationPath, runtime.getURL("/"));
      confirmationUrl.searchParams.set("captureId", session.captureId);
      const confirmationTab = await tabs.create({
        url: confirmationUrl.href,
        active: true,
        windowId: session.windowId,
      });
      confirmationTabId = requireRoutingId(confirmationTab?.id, "OCR確認タブID");
      await sessionStore.transition({
        captureId: session.captureId,
        from: "preview",
        to: "preview",
        patch: { previewTabId: confirmationTabId },
      });
      const persistedConfirmationTab = await tabs.get(confirmationTabId);
      if (
        persistedConfirmationTab?.id !== confirmationTabId
        || persistedConfirmationTab?.windowId !== session.windowId
      ) {
        throw controllerError(
          "OCR確認タブが保存完了前に閉じられました。",
          "OCR_CAPTURE_CONFIRMATION_TAB_CLOSED",
        );
      }
      return Object.freeze({
        captureId: session.captureId,
        phase: "preview",
        crop: preview.crop,
      });
    } catch (cause) {
      if (confirmationTabId !== null) {
        try {
          await tabs.remove(confirmationTabId);
        } catch (closeError) {
          console.warn("Could not close failed OCR confirmation tab", closeError);
        }
      }
      // The host timeout does not cancel an already-dispatched offscreen
      // request. Queue a discard even when CREATE has not returned yet so a
      // late crop completion cannot leave an unreachable Blob preview behind.
      if (previewRequested) await discardPreviewBestEffort(session.captureId);
      try {
        await cleanupSession(session, { discardPreview: false });
      } catch (cleanupError) {
        console.warn("Could not fully clean failed OCR capture", cleanupError);
      }
      if (cause instanceof OcrCaptureControllerError) throw cause;
      throw controllerError("OCR画像の取得に失敗しました。", "OCR_CAPTURE_SCREENSHOT_FAILED", cause);
    }
  }

  async function submitSelection(message, sender) {
    if (startInProgress || submitInProgress) {
      throw controllerError(
        "OCR範囲選択または画像取得の処理がすでに進行中です。",
        "OCR_CAPTURE_BUSY",
      );
    }
    submitInProgress = true;
    try {
      return await performSubmitSelection(message, sender);
    } finally {
      submitInProgress = false;
    }
  }

  async function cancelCapture(message, sender) {
    const session = await sessionStore.get({ clearExpired: false });
    if (!session || session.captureId !== message.captureId) {
      return Object.freeze({ cancelled: false, alreadyFinished: true });
    }
    requireBoundContentSender(sender, session);
    await cleanupSession(session, { notifyDocument: false });
    return Object.freeze({ cancelled: true });
  }

  function requireConfirmationSender(sender, captureId, session = null) {
    const url = requireExtensionPageSender(sender, confirmationPath);
    if (url.searchParams.get("captureId") !== captureId) {
      throw controllerError("確認ページのOCR capture IDが一致しません。", "OCR_CAPTURE_SENDER_MISMATCH");
    }
    if (
      session?.previewTabId !== undefined
      && sender?.tab?.id !== session.previewTabId
    ) {
      throw controllerError("確認タブが現在のOCR previewと一致しません。", "OCR_CAPTURE_SENDER_MISMATCH");
    }
  }

  async function getPreview(message, sender) {
    requireConfirmationSender(sender, message.captureId);
    let session = await getSessionOrThrow(message.captureId);
    if (session.phase !== "preview") {
      throw controllerError("OCR previewはまだ準備できていません。", "OCR_CAPTURE_PHASE_MISMATCH");
    }
    if (session.previewTabId === undefined) {
      const previewTabId = requireRoutingId(sender?.tab?.id, "OCR確認タブID");
      session = await sessionStore.transition({
        captureId: session.captureId,
        from: "preview",
        to: "preview",
        patch: { previewTabId },
      });
    }
    requireConfirmationSender(sender, message.captureId, session);
    const preview = normalizePreviewMetadata(await offscreenRequest(
      GET_OCR_CAPTURE_PREVIEW,
      { previewId: session.captureId },
      { timeoutMs: 5_000, extensionApi },
    ), session.captureId, safeNow(now));
    return Object.freeze({
      captureId: session.captureId,
      previewUrl: preview.previewUrl,
      source: preview.source,
      crop: preview.crop,
      expiresAt: preview.expiresAt,
      availability: OCR_AVAILABLE_STATUS,
      candidateText: "",
    });
  }

  async function recognizeCapture(message, sender) {
    const session = await getSessionOrThrow(message.captureId);
    requireConfirmationSender(sender, message.captureId, session);
    if (session.phase !== "preview") {
      throw controllerError("認識できるOCR previewがありません。", "OCR_CAPTURE_PHASE_MISMATCH");
    }
    let output;
    try {
      output = await offscreenRequest(
        RECOGNIZE_OCR_CAPTURE_PREVIEW,
        { previewId: session.captureId, timeoutMs: OCR_DEFAULT_TIMEOUT_MS },
        { timeoutMs: OCR_DEFAULT_TIMEOUT_MS + 5_000, extensionApi },
      );
    } catch (cause) {
      try {
        await offscreenRequest(
          CANCEL_OCR_RECOGNITION_OFFSCREEN,
          {},
          { timeoutMs: 5_000, extensionApi },
        );
      } catch {
        // The original recognition failure is authoritative.
      }
      throw controllerError(
        String(cause?.message || "ローカルOCRを完了できませんでした。"),
        String(cause?.code || "OCR_RECOGNITION_FAILED"),
        cause,
      );
    }
    if (
      !output
      || typeof output !== "object"
      || output.confirmationRequired !== true
      || output.verified !== false
    ) {
      throw controllerError("OCR候補の応答形式が不正です。", "OCR_RECOGNITION_OUTPUT_INVALID");
    }
    if (!OCR_RECOGNITION_KINDS.has(output.recognitionKind)) {
      throw controllerError(
        "OCR候補の認識種別が不正です。",
        "OCR_RECOGNITION_OUTPUT_INVALID",
      );
    }
    const recognitionKind = output.recognitionKind;
    const candidateText = safeOcrText(output.text ?? "", 4_096, {
      optional: recognitionKind === "instruction-only",
    });
    const structuredCandidate = safeStructuredCandidate(
      output.structuredCandidate,
      recognitionKind,
      candidateText,
    );
    const currentSession = await getSessionOrThrow(message.captureId);
    requireConfirmationSender(sender, message.captureId, currentSession);
    if (currentSession.phase !== "preview") {
      throw controllerError("認識できるOCR previewがありません。", "OCR_CAPTURE_PHASE_MISMATCH");
    }
    return Object.freeze({
      captureId: currentSession.captureId,
      candidateText,
      rawText: safeOcrText(output.rawText ?? candidateText, 4_096, {
        optional: recognitionKind === "instruction-only",
      }),
      provider: String(output.provider || ""),
      backend: output.backend,
      model: output.model,
      warnings: Array.isArray(output.warnings) ? Object.freeze([...output.warnings]) : Object.freeze([]),
      confidence: output.confidence || null,
      timings: output.timings || null,
      recognitionKind,
      structuredCandidate,
      japaneseOcr: output.japaneseOcr || null,
      confirmationRequired: true,
    });
  }

  async function cancelRecognition(message, sender) {
    const session = await getSessionOrThrow(message.captureId);
    requireConfirmationSender(sender, message.captureId, session);
    if (session.phase !== "preview") {
      throw controllerError("キャンセルできるOCR previewがありません。", "OCR_CAPTURE_PHASE_MISMATCH");
    }
    return offscreenRequest(
      CANCEL_OCR_RECOGNITION_OFFSCREEN,
      {},
      { timeoutMs: 5_000, extensionApi },
    );
  }

  async function discardCapture(message, sender) {
    requireConfirmationSender(sender, message.captureId);
    let session;
    try {
      session = await sessionStore.get({ clearExpired: false });
    } catch (error) {
      if (error?.code !== "OCR_CAPTURE_SESSION_CORRUPT") throw error;
      await discardPreviewBestEffort(message.captureId);
      return Object.freeze({ discarded: false, alreadyFinished: true });
    }
    if (!session || session.captureId !== message.captureId) {
      await discardPreviewBestEffort(message.captureId);
      return Object.freeze({ discarded: false, alreadyFinished: true });
    }
    requireConfirmationSender(sender, message.captureId, session);
    if (Date.parse(session.expiresAt) <= safeNow(now)) {
      await cleanupSession(session, { notifyDocument: false });
      return Object.freeze({ discarded: false, alreadyFinished: true });
    }
    if (session.phase !== "preview") {
      throw controllerError("破棄できるOCR previewがありません。", "OCR_CAPTURE_PHASE_MISMATCH");
    }
    let discardError = null;
    try {
      await offscreenRequest(
        DISCARD_OCR_CAPTURE_PREVIEW,
        { previewId: session.captureId },
        { timeoutMs: 5_000, extensionApi },
      );
    } catch (error) {
      discardError = error;
    }
    await sessionStore.clear({ captureId: session.captureId });
    if (discardError) {
      throw controllerError(
        "OCR previewを完全に破棄できませんでした。期限切れ時に自動破棄されます。",
        "OCR_CAPTURE_PREVIEW_DISCARD_FAILED",
        discardError,
      );
    }
    return Object.freeze({ discarded: true });
  }

  async function handleTabRemoved(tabId) {
    if (!Number.isSafeInteger(tabId) || tabId < 0) return false;
    let session;
    try {
      session = await sessionStore.get({ clearExpired: false });
    } catch (error) {
      if (error?.code === "OCR_CAPTURE_SESSION_CORRUPT") return false;
      throw error;
    }
    const removedConfirmation = session?.phase === "preview"
      && session.previewTabId === tabId;
    const removedActiveSource = session?.phase !== "preview"
      && session?.tabId === tabId;
    if (!removedConfirmation && !removedActiveSource) {
      return false;
    }
    await cleanupSession(session, { notifyDocument: false });
    return true;
  }

  return Object.freeze({
    handleTabRemoved,
    async handleMessage(value, sender = {}) {
      let message;
      try {
        message = normalizeOcrCaptureMessage(value);
      } catch (cause) {
        throw controllerError("OCR captureメッセージが不正です。", "OCR_CAPTURE_MESSAGE_INVALID", cause);
      }
      if (!INBOUND_MESSAGE_TYPES.has(message.type)) {
        throw controllerError("この向きでは使用できないOCR captureメッセージです。", "OCR_CAPTURE_MESSAGE_DIRECTION_INVALID");
      }
      switch (message.type) {
        case START_OCR_CAPTURE:
          return startCapture(sender);
        case SUBMIT_OCR_SELECTION:
          return submitSelection(message, sender);
        case CANCEL_OCR_CAPTURE:
          return cancelCapture(message, sender);
        case GET_OCR_CAPTURE_PREVIEW:
          return getPreview(message, sender);
        case RECOGNIZE_OCR_CAPTURE:
          return recognizeCapture(message, sender);
        case CANCEL_OCR_RECOGNITION:
          return cancelRecognition(message, sender);
        case DISCARD_OCR_CAPTURE:
          return discardCapture(message, sender);
        default:
          throw controllerError("未対応のOCR capture操作です。", "OCR_CAPTURE_MESSAGE_DIRECTION_INVALID");
      }
    },
  });
}
