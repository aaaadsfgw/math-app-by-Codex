import { classifyCategory } from "./category-classifier.js";
import { OFFSCREEN_SYMBOLIC_OPERATIONS } from "./math-core/offscreen-symbolic-client.js";
import { presentSolution } from "./solution-presenter.js";
import { solveQuestionAsync as solveLocally } from "./solver/index.js";
import { addHistory, getSettings } from "./storage.js";

const SOLVE_SELECTION_COMMAND = "solve-selection-to-clipboard";
const SHORTCUT_MODE = "answer";
const MAX_TOAST_ANSWER_LENGTH = 72;
const activeShortcutTabs = new Set();

function isWebPage(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function normalizeQuestion(value) {
  return String(value || "").trim();
}

function verificationForSolver(result) {
  return {
    verified: true,
    verificationType: "solver",
    verificationMessage: result.verification || "自作ソルバーで計算結果を検証しました。"
  };
}

async function resolveAnswer(question, classification) {
  const solverResult = await solveLocally(question, {
    category: classification.primary,
    symbolicOperations: OFFSCREEN_SYMBOLIC_OPERATIONS
  });

  if (solverResult?.supported && !solverResult.solved) {
    throw new Error(solverResult.error || "この問題は条件を満たさないため解けませんでした。");
  }

  const hasVerifiedSolverAnswer = Boolean(
    solverResult?.supported
      && solverResult.solved
      && solverResult.verified
      && String(solverResult.answer || "").trim()
  );

  if (!hasVerifiedSolverAnswer) {
    throw new Error(
      solverResult?.error
        || "この問題形式は、現在のオフライン数式エンジンではまだ解けません。"
    );
  }

  return {
    ...presentSolution(solverResult, {
      mode: SHORTCUT_MODE,
      category: classification.primary
    }),
    solverResult,
    solverId: solverResult.solverId || null,
    resultKind: solverResult.resultKind || "exact",
    conditions: Array.isArray(solverResult.conditions) ? solverResult.conditions : [],
    solutionTrace: Array.isArray(solverResult.solutionTrace) ? solverResult.solutionTrace : [],
    ...verificationForSolver(solverResult)
  };
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
        files: ["js/content-script.js"]
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

async function getSelectedQuestion(tabId) {
  const response = await sendToTab(tabId, { type: "GET_SELECTION_TEXT" });
  const question = normalizeQuestion(response?.text);
  if (!question) throw new Error("問題文を選択してください。");
  return question;
}

async function copyInContentScript(tabId, text) {
  const response = await sendToTab(tabId, { type: "SET_CLIPBOARD_TEXT", text });
  if (!response?.ok) {
    throw new Error(response?.error || "回答をクリップボードへコピーできませんでした。");
  }
}

function shortenForToast(answer) {
  const oneLine = String(answer || "").replace(/\s+/g, " ").trim();
  if (oneLine.length <= MAX_TOAST_ANSWER_LENGTH) return oneLine;
  return `${oneLine.slice(0, MAX_TOAST_ANSWER_LENGTH - 1)}…`;
}

async function saveShortcutHistory(question, classification, result) {
  const settings = await getSettings();
  if (!settings.saveHistory) return null;

  return addHistory({
    question,
    mode: SHORTCUT_MODE,
    output: result.content,
    finalAnswer: result.finalAnswer,
    category: classification,
    solverId: result.solverId,
    verified: result.verified,
    verificationType: result.verificationType,
    verificationMessage: result.verificationMessage,
    resultKind: result.resultKind,
    conditions: result.conditions,
    solutionTrace: result.solutionTrace,
    selfAssessment: "answer_seen",
    source: "shortcut"
  });
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
    await showToast(tab.id, "解析中...", "loading");

    const question = await getSelectedQuestion(tab.id);
    const classification = classifyCategory(question);
    const result = await resolveAnswer(question, classification);

    await copyInContentScript(tab.id, result.finalAnswer);
    await saveShortcutHistory(question, classification, result);
    await showToast(tab.id, `コピー完了: ${shortenForToast(result.finalAnswer)}`, "success");
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
