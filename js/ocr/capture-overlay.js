(() => {
  "use strict";

  const INSTALL_KEY = "__mathStudyLogOcrCaptureOverlayV1";
  const PROTOCOL_VERSION = 1;
  const BACKGROUND_TARGET = "math-study-log-background";
  const MIN_SELECTION_CSS_PX = 24;
  const SCREENSHOT_WATCHDOG_MS = 30_000;
  const MAX_CAPTURE_LIFETIME_MS = 10 * 60_000;
  const CAPTURE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
  const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,255}$/u;
  const CANONICAL_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
  const MESSAGE = Object.freeze({
    begin: "BEGIN_OCR_SELECTION",
    prepare: "PREPARE_OCR_SCREENSHOT",
    complete: "OCR_CAPTURE_COMPLETE",
    cancel: "CANCEL_OCR_CAPTURE",
    submit: "SUBMIT_OCR_SELECTION",
  });

  if (window !== window.top) return;
  if (globalThis[INSTALL_KEY]) return;

  let activeOverlay = null;

  function validCaptureId(value) {
    return typeof value === "string" && CAPTURE_ID_PATTERN.test(value);
  }

  function validBeginMetadata(message) {
    if (
      typeof message.documentId !== "string"
      || !DOCUMENT_ID_PATTERN.test(message.documentId)
      || typeof message.expiresAt !== "string"
      || !CANONICAL_ISO_PATTERN.test(message.expiresAt)
      || typeof message.sourceUrl !== "string"
      || message.sourceUrl.length < 1
      || message.sourceUrl.length > 4_096
    ) {
      return false;
    }
    const expiresAt = Date.parse(message.expiresAt);
    if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== message.expiresAt) {
      return false;
    }
    try {
      const source = new URL(message.sourceUrl);
      return (source.protocol === "http:" || source.protocol === "https:")
        && !source.username
        && !source.password
        && source.href === message.sourceUrl;
    } catch {
      return false;
    }
  }

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function viewportSnapshot() {
    const ratio = Number(window.devicePixelRatio);
    return Object.freeze({
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
    });
  }

  function normalizedSelection(startX, startY, endX, endY) {
    const viewport = viewportSnapshot();
    const firstX = clamp(startX, 0, viewport.width);
    const firstY = clamp(startY, 0, viewport.height);
    const secondX = clamp(endX, 0, viewport.width);
    const secondY = clamp(endY, 0, viewport.height);
    return Object.freeze({
      x: Math.min(firstX, secondX),
      y: Math.min(firstY, secondY),
      width: Math.abs(secondX - firstX),
      height: Math.abs(secondY - firstY),
    });
  }

  function createNode(tagName, className, text) {
    const node = document.createElement(tagName);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function applyHostStyles(host) {
    const declarations = {
      position: "fixed",
      inset: "0",
      width: "100vw",
      height: "100vh",
      "max-width": "none",
      "max-height": "none",
      margin: "0",
      padding: "0",
      border: "0",
      outline: "0",
      overflow: "hidden",
      background: "transparent",
      "z-index": "2147483647",
    };
    for (const [property, value] of Object.entries(declarations)) {
      host.style.setProperty(property, value, "important");
    }
  }

  function setStatus(state, text, kind = "info") {
    state.status.textContent = text;
    state.status.dataset.kind = kind;
  }

  function showSelection(state, selection, kind = "valid") {
    state.selectionBox.hidden = false;
    state.selectionBox.dataset.kind = kind;
    state.selectionBox.style.transform = `translate(${selection.x}px, ${selection.y}px)`;
    state.selectionBox.style.width = `${selection.width}px`;
    state.selectionBox.style.height = `${selection.height}px`;
  }

  function releasePointer(state) {
    if (state.pointerId === null) return;
    try {
      if (state.shield.hasPointerCapture(state.pointerId)) {
        state.shield.releasePointerCapture(state.pointerId);
      }
    } catch {
      // The browser can release capture before pointercancel reaches this world.
    }
    state.pointerId = null;
  }

  function stopEvent(event) {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  }

  function addWindowListener(state, type, listener, options) {
    window.addEventListener(type, listener, options);
    state.windowListeners.push({ type, listener, options });
  }

  function removeWindowListeners(state) {
    for (const { type, listener, options } of state.windowListeners) {
      window.removeEventListener(type, listener, options);
    }
    state.windowListeners.length = 0;
  }

  function cleanup(state = activeOverlay) {
    if (!state || state.cleaned) return;
    state.cleaned = true;
    if (state.expiryTimer !== null) window.clearTimeout(state.expiryTimer);
    if (state.watchdogTimer !== null) window.clearTimeout(state.watchdogTimer);
    state.expiryTimer = null;
    state.watchdogTimer = null;
    releasePointer(state);
    removeWindowListeners(state);
    if (activeOverlay === state) activeOverlay = null;

    try {
      if (typeof state.host.close === "function" && state.host.open) state.host.close();
    } catch {
      // Removing the host below is the authoritative cleanup operation.
    }
    state.host.remove();

    const previousFocus = state.previousFocus;
    if (previousFocus?.isConnected && typeof previousFocus.focus === "function") {
      try {
        previousFocus.focus({ preventScroll: true });
      } catch {
        // Focus restoration is best-effort and must never keep the shield alive.
      }
    }
  }

  function sendBackgroundMessage(payload, onFailure = () => {}) {
    try {
      const pending = chrome.runtime.sendMessage({
        protocolVersion: PROTOCOL_VERSION,
        target: BACKGROUND_TARGET,
        ...payload,
      });
      if (pending && typeof pending.then === "function") {
        pending.then((response) => {
          if (response?.ok === false) {
            const error = new Error(
              typeof response.error?.message === "string"
                ? response.error.message
                : "Background rejected the OCR capture message.",
            );
            error.code = response.error?.code;
            onFailure(error);
          }
        }, onFailure);
      }
    } catch (error) {
      onFailure(error);
    }
  }

  function cancelFromUser(state, reason) {
    if (!state || state.cleaned) return;
    const captureId = state.captureId;
    cleanup(state);
    sendBackgroundMessage({
      type: MESSAGE.cancel,
      captureId,
      reason,
    });
  }

  function submitSelection(state, selection) {
    state.phase = "submitted";
    state.selection = selection;
    state.host.dataset.phase = state.phase;
    state.surface.dataset.phase = state.phase;
    showSelection(state, selection, "valid");
    setStatus(state, "範囲を確定しました。画像の準備中です…", "success");
    state.watchdogTimer = window.setTimeout(() => {
      cancelFromUser(state, "background-timeout");
    }, SCREENSHOT_WATCHDOG_MS);

    sendBackgroundMessage({
      type: MESSAGE.submit,
      captureId: state.captureId,
      selection,
      viewport: viewportSnapshot(),
    }, () => {
      if (activeOverlay !== state || state.cleaned || state.phase !== "submitted") return;
      cancelFromUser(state, "background-rejected");
    });
  }

  function removeModalBackdropForScreenshot(state) {
    const { host } = state;
    try {
      if (typeof host.close === "function" && host.open) host.close();
      if (typeof host.show === "function") {
        host.show();
      } else {
        host.setAttribute("open", "");
      }
    } catch {
      // Keeping the element visible is safer than leaving the page unguarded.
      host.setAttribute("open", "");
    }
  }

  function installInteractionGuards(state) {
    const block = (event) => stopEvent(event);

    const onPointerDown = (event) => {
      stopEvent(event);
      if (state.phase !== "selecting") return;
      if (!event.isTrusted || !event.isPrimary || event.button !== 0) return;
      if (state.pointerId !== null) return;

      state.pointerId = event.pointerId;
      state.startX = clamp(event.clientX, 0, window.innerWidth);
      state.startY = clamp(event.clientY, 0, window.innerHeight);
      state.selection = null;
      state.selectionBox.dataset.kind = "valid";
      showSelection(
        state,
        normalizedSelection(state.startX, state.startY, state.startX, state.startY),
      );
      setStatus(state, "そのままドラッグして、問題全体を囲んでください。", "info");
      try {
        state.shield.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement; window capture listeners still guard the page.
      }
    };

    const onPointerMove = (event) => {
      stopEvent(event);
      if (!event.isTrusted || state.phase !== "selecting") return;
      if (event.pointerId !== state.pointerId) return;
      showSelection(
        state,
        normalizedSelection(state.startX, state.startY, event.clientX, event.clientY),
      );
    };

    const onPointerUp = (event) => {
      stopEvent(event);
      if (!event.isTrusted || !event.isPrimary || event.button !== 0) return;
      if (state.phase !== "selecting" || event.pointerId !== state.pointerId) return;

      const selection = normalizedSelection(
        state.startX,
        state.startY,
        event.clientX,
        event.clientY,
      );
      releasePointer(state);
      if (selection.width < MIN_SELECTION_CSS_PX || selection.height < MIN_SELECTION_CSS_PX) {
        showSelection(state, selection, "invalid");
        setStatus(
          state,
          `選択範囲は縦横とも${MIN_SELECTION_CSS_PX} CSS px以上にしてください。もう一度選べます。`,
          "error",
        );
        return;
      }
      submitSelection(state, selection);
    };

    const onPointerCancel = (event) => {
      stopEvent(event);
      if (!event.isTrusted || event.pointerId !== state.pointerId) return;
      releasePointer(state);
      state.selectionBox.hidden = true;
      setStatus(state, "選択が中断されました。もう一度ドラッグしてください。", "error");
    };

    const onKeyDown = (event) => {
      stopEvent(event);
      if (event.isTrusted && event.key === "Escape") {
        cancelFromUser(state, "escape-key");
      }
    };

    const onResize = () => {
      if (activeOverlay !== state || state.cleaned) return;
      if (state.phase !== "selecting") {
        cancelFromUser(state, "viewport-changed");
        return;
      }
      releasePointer(state);
      state.selection = null;
      state.selectionBox.hidden = true;
      setStatus(state, "表示領域が変わりました。もう一度範囲を選んでください。", "error");
    };

    const activeOptions = { capture: true, passive: false };
    addWindowListener(state, "pointerdown", onPointerDown, activeOptions);
    addWindowListener(state, "pointermove", onPointerMove, activeOptions);
    addWindowListener(state, "pointerup", onPointerUp, activeOptions);
    addWindowListener(state, "pointercancel", onPointerCancel, activeOptions);
    addWindowListener(state, "keydown", onKeyDown, activeOptions);
    addWindowListener(state, "keyup", block, activeOptions);
    addWindowListener(state, "keypress", block, activeOptions);
    addWindowListener(state, "wheel", block, activeOptions);
    addWindowListener(state, "touchmove", block, activeOptions);
    addWindowListener(state, "contextmenu", block, activeOptions);
    addWindowListener(state, "dragstart", block, activeOptions);
    addWindowListener(state, "selectstart", block, activeOptions);
    addWindowListener(state, "drop", block, activeOptions);
    addWindowListener(state, "resize", onResize, { capture: true });
  }

  function createOverlay(beginMessage) {
    if (activeOverlay && !activeOverlay.cleaned) {
      return Object.freeze({ ok: false, code: "OCR_SELECTION_ALREADY_ACTIVE" });
    }

    const expiresAt = Date.parse(beginMessage?.expiresAt);
    const remainingMs = expiresAt - Date.now();
    if (
      !Number.isFinite(expiresAt)
      || !Number.isFinite(remainingMs)
      || remainingMs <= 0
      || remainingMs > MAX_CAPTURE_LIFETIME_MS
    ) {
      return Object.freeze({ ok: false, code: "OCR_CAPTURE_EXPIRY_INVALID" });
    }

    const host = document.createElement("dialog");
    host.id = "math-study-log-ocr-capture-overlay-v1";
    host.tabIndex = -1;
    host.setAttribute("aria-label", "数式画像の範囲選択");
    host.setAttribute("aria-modal", "true");
    applyHostStyles(host);

    // Native dialog elements cannot host a shadow root in Chromium. Keep the
    // dialog as the top-layer container and isolate the actual UI inside a
    // dedicated, shadow-capable surface.
    const surface = document.createElement("div");
    const shadow = surface.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = `
      :host {
        all: initial;
        position: fixed !important;
        inset: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: none !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        border: 0 !important;
        outline: 0 !important;
        overflow: hidden !important;
        background: transparent !important;
        color-scheme: light !important;
        z-index: 2147483647 !important;
      }
      :host::backdrop {
        background: transparent !important;
      }
      *, *::before, *::after { box-sizing: border-box; }
      .shield {
        position: fixed;
        inset: 0;
        width: 100vw;
        height: 100vh;
        margin: 0;
        background: rgba(2, 6, 23, 0.34);
        cursor: crosshair;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
      }
      .selection {
        position: fixed;
        inset: 0 auto auto 0;
        min-width: 0;
        min-height: 0;
        border: 3px solid #38bdf8;
        border-radius: 6px;
        background: rgba(255, 255, 255, 0.12);
        box-shadow: 0 0 0 9999px rgba(2, 6, 23, 0.18), 0 0 0 2px rgba(15, 23, 42, 0.8);
        pointer-events: none;
        transform-origin: top left;
      }
      .selection[data-kind="invalid"] {
        border-color: #fb7185;
      }
      .panel {
        position: fixed;
        top: 18px;
        left: 50%;
        width: min(520px, calc(100vw - 32px));
        transform: translateX(-50%);
        padding: 13px 16px;
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 12px;
        background: rgba(15, 23, 42, 0.96);
        box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3);
        color: #f8fafc;
        font: 600 14px/1.55 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: center;
        pointer-events: none;
      }
      .title { margin: 0 0 3px; font-size: 15px; }
      .status { margin: 0; color: #cbd5e1; font-weight: 500; }
      .status[data-kind="error"] { color: #fecdd3; }
      .status[data-kind="success"] { color: #bae6fd; }
      .escape { margin-left: 7px; color: #94a3b8; white-space: nowrap; }
      :host([data-phase="submitted"]) .shield { cursor: wait; }
      :host([data-capture-ready="true"]) .shield {
        background: transparent !important;
        cursor: default;
      }
      :host([data-capture-ready="true"]) .capture-chrome { display: none !important; }
    `;

    const shield = createNode("div", "shield");
    shield.setAttribute("aria-hidden", "true");
    const selectionBox = createNode("div", "selection capture-chrome");
    selectionBox.hidden = true;
    selectionBox.setAttribute("aria-hidden", "true");
    const panel = createNode("section", "panel capture-chrome");
    const title = createNode("p", "title", "画像にする数式の範囲をドラッグ");
    const status = createNode(
      "p",
      "status",
      "左ボタンで問題全体を囲んでください。Escで取り消せます。",
    );
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const escape = createNode("span", "escape", "Esc: 取消");
    title.append(escape);
    panel.append(title, status);
    shadow.append(style, shield, selectionBox, panel);
    host.append(surface);

    const captureId = beginMessage.captureId;
    const state = {
      captureId,
      cleaned: false,
      expiryTimer: null,
      host,
      phase: "selecting",
      pointerId: null,
      previousFocus: document.activeElement,
      selection: null,
      selectionBox,
      shield,
      surface,
      startX: 0,
      startY: 0,
      status,
      watchdogTimer: null,
      windowListeners: [],
    };
    host.addEventListener("cancel", (event) => {
      stopEvent(event);
      if (event.isTrusted) cancelFromUser(state, "dialog-cancelled");
    });
    host.addEventListener("close", () => {
      if (
        !state.cleaned
        && state.phase !== "preparing-screenshot"
        && state.phase !== "capture-ready"
      ) {
        cancelFromUser(state, "dialog-closed");
      }
    });
    activeOverlay = state;
    state.expiryTimer = window.setTimeout(() => {
      cancelFromUser(state, "capture-expired");
    }, remainingMs);
    host.dataset.phase = state.phase;
    surface.dataset.phase = state.phase;
    installInteractionGuards(state);
    document.documentElement.append(host);

    try {
      if (typeof host.showModal === "function") {
        host.showModal();
      } else {
        host.setAttribute("open", "");
      }
    } catch {
      host.setAttribute("open", "");
    }
    try {
      host.focus({ preventScroll: true });
    } catch {
      // The global keyboard guard remains active even if focus cannot move.
    }
    return Object.freeze({ ok: true, captureId });
  }

  function prepareForScreenshot(message, sendResponse) {
    const state = activeOverlay;
    if (!state || state.cleaned) {
      sendResponse({ ok: false, code: "OCR_SELECTION_NOT_ACTIVE" });
      return;
    }
    if (message.captureId !== state.captureId) {
      sendResponse({ ok: false, code: "OCR_CAPTURE_ID_MISMATCH" });
      return;
    }
    if (state.phase !== "submitted" || !state.selection) {
      sendResponse({ ok: false, code: "OCR_SELECTION_NOT_SUBMITTED" });
      return;
    }

    state.phase = "preparing-screenshot";
    state.host.dataset.phase = state.phase;
    state.surface.dataset.phase = state.phase;
    removeModalBackdropForScreenshot(state);
    if (state.watchdogTimer !== null) window.clearTimeout(state.watchdogTimer);
    state.watchdogTimer = window.setTimeout(() => {
      cancelFromUser(state, "screenshot-timeout");
    }, SCREENSHOT_WATCHDOG_MS);
    state.host.dataset.captureReady = "true";
    state.surface.dataset.captureReady = "true";
    state.shield.style.setProperty("background", "transparent", "important");

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (activeOverlay !== state || state.cleaned) {
          sendResponse({ ok: false, code: "OCR_CAPTURE_CANCELLED" });
          return;
        }
        state.phase = "capture-ready";
        state.host.dataset.phase = state.phase;
        state.surface.dataset.phase = state.phase;
        sendResponse({
          ok: true,
          protocolVersion: PROTOCOL_VERSION,
          captureId: state.captureId,
          selection: state.selection,
          viewport: viewportSnapshot(),
        });
      });
    });
  }

  function acceptsMessage(message, sender) {
    if (!message || typeof message !== "object") return false;
    if (message.target !== BACKGROUND_TARGET) return false;
    if (message.protocolVersion !== PROTOCOL_VERSION) return false;
    if (sender?.id !== chrome.runtime.id) return false;
    if (!validCaptureId(message.captureId)) return false;
    if (![MESSAGE.begin, MESSAGE.prepare, MESSAGE.complete, MESSAGE.cancel].includes(message.type)) {
      return false;
    }
    return message.type !== MESSAGE.begin || validBeginMetadata(message);
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!acceptsMessage(message, sender)) return undefined;

    if (message.type === MESSAGE.begin) {
      sendResponse(createOverlay(message));
      return false;
    }
    if (message.type === MESSAGE.prepare) {
      prepareForScreenshot(message, sendResponse);
      return true;
    }
    if (message.type === MESSAGE.complete || message.type === MESSAGE.cancel) {
      const state = activeOverlay;
      if (!state) {
        sendResponse({ ok: true, alreadyClean: true });
        return false;
      }
      if (message.captureId !== state.captureId) {
        sendResponse({ ok: false, code: "OCR_CAPTURE_ID_MISMATCH" });
        return false;
      }
      cleanup(state);
      sendResponse({ ok: true });
      return false;
    }
    return undefined;
  });

  Object.defineProperty(globalThis, INSTALL_KEY, {
    configurable: false,
    enumerable: false,
    value: Object.freeze({ protocolVersion: PROTOCOL_VERSION }),
    writable: false,
  });
})();
