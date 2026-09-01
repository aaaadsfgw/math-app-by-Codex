import { normalizeWhitespace } from "./utils.js";

export class ClipboardError extends Error {
  constructor(message, { code = "CLIPBOARD_ERROR", cause = null } = {}) {
    super(message, { cause });
    this.name = "ClipboardError";
    this.code = code;
  }
}

export async function readFromClipboard() {
  if (!globalThis.navigator?.clipboard?.readText) {
    throw new ClipboardError("クリップボードの読み取り機能を利用できません。", {
      code: "READ_UNAVAILABLE",
    });
  }

  let text;
  try {
    text = await globalThis.navigator.clipboard.readText();
  } catch (error) {
    throw new ClipboardError(
      "クリップボードを読み取れません。Chromeの権限を確認してください。",
      { code: "READ_FAILED", cause: error },
    );
  }

  if (!normalizeWhitespace(text)) {
    throw new ClipboardError("クリップボードに数学問題がありません。", {
      code: "EMPTY_CLIPBOARD",
    });
  }
  return String(text);
}

async function activeTabId() {
  if (!globalThis.chrome?.tabs?.query) return null;
  return new Promise((resolve, reject) => {
    try {
      globalThis.chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;
        if (runtimeError) {
          reject(runtimeError);
          return;
        }
        resolve(Number.isInteger(tabs?.[0]?.id) ? tabs[0].id : null);
      });
    } catch (error) {
      reject(error);
    }
  });
}

async function writeInsideTab(tabId, text) {
  if (!Number.isInteger(tabId) || !globalThis.chrome?.scripting?.executeScript) return false;
  const results = await globalThis.chrome.scripting.executeScript({
    target: { tabId },
    func: async (value) => {
      await navigator.clipboard.writeText(value);
      return true;
    },
    args: [text],
  });
  return results?.some((result) => result.result === true) ?? false;
}

function legacyDocumentCopy(text) {
  if (!globalThis.document?.body || typeof globalThis.document.execCommand !== "function") {
    return false;
  }
  const textarea = globalThis.document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  globalThis.document.body.append(textarea);
  textarea.focus();
  textarea.select();
  let copied = false;
  try {
    copied = globalThis.document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return copied;
}

export async function writeToClipboard(value, { tabId = null } = {}) {
  const text = String(value ?? "");
  if (!normalizeWhitespace(text)) {
    throw new ClipboardError("コピーする内容が空です。", { code: "EMPTY_TEXT" });
  }

  let directError = null;
  if (globalThis.navigator?.clipboard?.writeText) {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      directError = error;
    }
  }

  try {
    const targetTabId = Number.isInteger(tabId) ? tabId : await activeTabId();
    if (await writeInsideTab(targetTabId, text)) return true;
  } catch (error) {
    directError ??= error;
  }

  try {
    if (legacyDocumentCopy(text)) return true;
  } catch (error) {
    directError ??= error;
  }

  throw new ClipboardError(
    "クリップボードへ書き込めません。ページの権限または対象タブを確認してください。",
    { code: "WRITE_FAILED", cause: directError },
  );
}

export const copyText = writeToClipboard;
export const readClipboardText = readFromClipboard;
