import { OFFSCREEN_SYMBOLIC_OPERATIONS } from "./math-core/offscreen-symbolic-client.js";
import { runOffscreenRequest } from "./offscreen-client.js";
import { createShortcutCommandCoordinator } from "./shortcut-command-coordinator.js";
import { runShortcutWorkflow } from "./shortcut-workflow.js";
import { addHistory, getSettings } from "./storage.js";
import {
  createOcrCaptureController,
  createOcrCaptureRuntimeListener,
} from "./ocr/capture-controller.js";
import { createOcrCaptureSessionStore } from "./ocr/capture-session-store.js";

const SOLVE_SELECTION_COMMAND = "solve-selection-to-clipboard";
const ocrCaptureSessionStore = createOcrCaptureSessionStore();
const ocrCaptureController = createOcrCaptureController({
  extensionApi: chrome,
  sessionStore: ocrCaptureSessionStore,
  runOffscreenRequest,
});

async function queryActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
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

const coordinateShortcut = createShortcutCommandCoordinator({
  queryActiveTab,
  getSelectionText: getSelectedText,
  showToast,
  getSettings,
  runShortcutWorkflow,
  readClipboardText: readClipboardInOffscreen,
  writeClipboardText: writeClipboardInOffscreen,
  addHistory,
  symbolicOperations: OFFSCREEN_SYMBOLIC_OPERATIONS,
});

chrome.runtime.onInstalled.addListener(() => {
  void getSettings().catch((error) => console.warn("Could not initialize settings", error));
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command === SOLVE_SELECTION_COMMAND) void coordinateShortcut(tab);
});

chrome.runtime.onMessage.addListener(createOcrCaptureRuntimeListener(ocrCaptureController));

chrome.tabs.onRemoved.addListener((tabId) => {
  void ocrCaptureController.handleTabRemoved(tabId).catch((error) => {
    console.warn("Could not clean OCR preview after confirmation tab closed", error);
  });
});
