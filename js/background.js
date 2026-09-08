import { OFFSCREEN_SYMBOLIC_OPERATIONS } from "./math-core/offscreen-symbolic-client.js";
import { runOffscreenRequest } from "./offscreen-client.js";
import { runShortcutWorkflow } from "./shortcut-workflow.js";
import { addHistory, getSettings } from "./storage.js";
import {
  createOcrCaptureController,
  createOcrCaptureRuntimeListener,
} from "./ocr/capture-controller.js";
import { createOcrCaptureSessionStore } from "./ocr/capture-session-store.js";

const SOLVE_SELECTION_COMMAND = "solve-selection-to-clipboard";
const MAX_TOAST_ANSWER_LENGTH = 72;
const activeShortcutTabs = new Set();
const ocrCaptureSessionStore = createOcrCaptureSessionStore();
const ocrCaptureController = createOcrCaptureController({
  extensionApi: chrome,
  sessionStore: ocrCaptureSessionStore,
  runOffscreenRequest,
});

function isWebPage(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("アクティブなタブを取得できませんでした。");
  if (!isWebPage(tab.url)) throw new Error("このページではショートカットを使用できません。");
  return tab;
}

async function sendToTab(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["js/selection-math-extractor.js", "js/content-script.js"]
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch {
      throw firstError;
    }
  }
}

async function showToast(tabId, text, toastType) {
  await sendToTab(tabId, { type: "SHOW_TOAST", text, toastType });
}

async function getSelectedText(tabId) {
  const response = await sendToTab(tabId, { type: "GET_SELECTION_TEXT" });
  return String(response?.text || "").trim();
}

async function readClipboardInOffscreen() {
  return runOffscreenRequest("READ_CLIPBOARD_TEXT", {}, { timeoutMs: 5_000 });
}

async function writeClipboardInOffscreen(text) {
  return runOffscreenRequest("WRITE_CLIPBOARD_TEXT", { text }, { timeoutMs: 5_000 });
}

function shortenForToast(answer) {
  const oneLine = String(answer || "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_TOAST_ANSWER_LENGTH) return oneLine;
  return `${oneLine.slice(0, MAX_TOAST_ANSWER_LENGTH - 1)}…`;
}

function actionLabel(action) {
  if (action === "hint1") return "Hint 1";
  if (action === "hint2") return "Hint 2";
  if (action === "steps") return "途中式";
  return "答え";
}

async function handleShortcut() {
  let tab;
  try {
    tab = await getActiveTab();
    if (activeShortcutTabs.has(tab.id)) {
      await showToast(tab.id, "解析中です。完了までお待ちください。", "loading");
      return;
    }

    activeShortcutTabs.add(tab.id);
    await showToast(tab.id, "選択範囲またはクリップボードを解析中...", "loading");

    const settings = await getSettings();
    const result = await runShortcutWorkflow({
      getSelectionText: () => getSelectedText(tab.id),
      readClipboardText: readClipboardInOffscreen,
      writeClipboardText: writeClipboardInOffscreen,
      addHistory,
      settings,
      symbolicOperations: OFFSCREEN_SYMBOLIC_OPERATIONS,
    });

    const sourceLabel = result.input.source === "selection" ? "選択範囲" : "クリップボード";
    const historyNotice = result.historyError ? "（履歴保存のみ失敗）" : "";
    await showToast(
      tab.id,
      `${sourceLabel}から${actionLabel(result.action)}をコピー${historyNotice}: ${shortenForToast(result.clipboardOutput)}`,
      "success",
    );
  } catch (error) {
    console.error("Shortcut solve failed", error);
    if (tab?.id) {
      try {
        await showToast(tab.id, `エラー: ${error.message}`, "error");
      } catch (toastError) {
        console.warn("Could not show shortcut error toast", toastError);
      }
    }
  } finally {
    if (tab?.id) activeShortcutTabs.delete(tab.id);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void getSettings().catch((error) => console.warn("Could not initialize settings", error));
});

chrome.commands.onCommand.addListener((command) => {
  if (command === SOLVE_SELECTION_COMMAND) void handleShortcut();
});

chrome.runtime.onMessage.addListener(createOcrCaptureRuntimeListener(ocrCaptureController));

chrome.tabs.onRemoved.addListener((tabId) => {
  void ocrCaptureController.handleTabRemoved(tabId).catch((error) => {
    console.warn("Could not clean OCR preview after confirmation tab closed", error);
  });
});
