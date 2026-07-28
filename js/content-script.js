(() => {
  const INSTALL_FLAG = "__mathStudyLogAiContentScriptInstalled";
  if (globalThis[INSTALL_FLAG]) return;
  globalThis[INSTALL_FLAG] = true;

  const TOAST_ID = "math-study-log-ai-toast";
  const RESULT_TOAST_DURATION_MS = 3500;
  const FADE_DURATION_MS = 180;

  let toastTimer = 0;
  let removalTimer = 0;
  let toastRevision = 0;

  function getTextControlSelection() {
    const active = document.activeElement;
    const isTextArea = active instanceof HTMLTextAreaElement;
    const isTextInput = active instanceof HTMLInputElement
      && ["text", "search", "url", "tel", "email"].includes(active.type);

    if (!isTextArea && !isTextInput) return "";

    try {
      const start = active.selectionStart ?? 0;
      const end = active.selectionEnd ?? 0;
      return start === end ? "" : active.value.slice(start, end);
    } catch {
      return "";
    }
  }

  function getSelectionText() {
    const active = document.activeElement;
    if (active instanceof HTMLInputElement && active.type === "password") return "";
    const controlSelection = getTextControlSelection();
    if (controlSelection) return controlSelection.trim();
    return (globalThis.getSelection?.().toString() || "").trim();
  }

  function toastAccent(type) {
    if (type === "success") return "#22c55e";
    if (type === "error") return "#ef4444";
    if (type === "loading") return "#60a5fa";
    return "#94a3b8";
  }

  function removeToast(revision) {
    const toast = document.getElementById(TOAST_ID);
    if (!toast || revision !== toastRevision) return;

    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    removalTimer = globalThis.setTimeout(() => {
      if (revision === toastRevision) toast.remove();
    }, FADE_DURATION_MS);
  }

  function showToast(text, type = "neutral") {
    toastRevision += 1;
    const revision = toastRevision;
    globalThis.clearTimeout(toastTimer);
    globalThis.clearTimeout(removalTimer);

    const existing = document.getElementById(TOAST_ID);
    const toast = existing || document.createElement("div");
    const isError = type === "error";

    toast.id = TOAST_ID;
    toast.textContent = String(text || "");
    toast.setAttribute("role", isError ? "alert" : "status");
    toast.setAttribute("aria-live", isError ? "assertive" : "polite");
    toast.style.position = "fixed";
    toast.style.inset = "16px 16px auto auto";
    toast.style.zIndex = "2147483647";
    toast.style.boxSizing = "border-box";
    toast.style.maxWidth = "min(360px, calc(100vw - 32px))";
    toast.style.padding = "11px 14px";
    toast.style.border = "1px solid rgba(148, 163, 184, 0.34)";
    toast.style.borderLeft = `4px solid ${toastAccent(type)}`;
    toast.style.borderRadius = "10px";
    toast.style.background = "rgba(15, 23, 42, 0.96)";
    toast.style.color = "#f8fafc";
    toast.style.font = "600 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    toast.style.letterSpacing = "normal";
    toast.style.textAlign = "left";
    toast.style.whiteSpace = "pre-wrap";
    toast.style.overflowWrap = "anywhere";
    toast.style.boxShadow = "0 16px 38px rgba(15, 23, 42, 0.28)";
    toast.style.pointerEvents = "none";
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-6px)";
    toast.style.transition = `opacity ${FADE_DURATION_MS}ms ease, transform ${FADE_DURATION_MS}ms ease`;

    if (!existing) document.documentElement.appendChild(toast);

    globalThis.requestAnimationFrame(() => {
      if (revision !== toastRevision) return;
      toast.style.opacity = "1";
      toast.style.transform = "translateY(0)";
    });

    if (type !== "loading") {
      toastTimer = globalThis.setTimeout(() => removeToast(revision), RESULT_TOAST_DURATION_MS);
    }
  }

  async function writeClipboard(text) {
    const value = String(text ?? "");
    if (!value) return false;

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
    } catch {
      // Some pages block the async Clipboard API. The command-backed fallback
      // below still writes from the content-script/page interaction context.
    }

    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.setAttribute("aria-hidden", "true");
    textarea.style.position = "fixed";
    textarea.style.left = "-10000px";
    textarea.style.top = "0";
    textarea.style.opacity = "0";
    document.documentElement.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();

    try {
      return document.execCommand("copy");
    } finally {
      textarea.remove();
    }
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    switch (message?.type) {
      case "PING":
        sendResponse({ ok: true });
        return false;
      case "GET_SELECTION_TEXT":
      case "GET_SOURCE_TEXT": {
        const text = getSelectionText();
        sendResponse({ ok: true, text, source: text ? "selection" : "none" });
        return false;
      }
      case "SHOW_TOAST":
        showToast(message.text, message.toastType);
        sendResponse({ ok: true });
        return false;
      case "SET_CLIPBOARD_TEXT":
        void writeClipboard(message.text)
          .then((ok) => sendResponse({ ok }))
          .catch((error) => sendResponse({ ok: false, error: error.message }));
        return true;
      default:
        return false;
    }
  });
})();
