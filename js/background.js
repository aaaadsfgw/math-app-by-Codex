import { parseAnswer } from "./answer-parser.js";
import { classifyCategory } from "./category-classifier.js";
import { solveDemo } from "./demo-solver.js";
import { askOllama } from "./ollama-client.js";
import { solveQuestion as solveLocally } from "./solver/index.js";
import { addHistory, getSettings } from "./storage.js";

const SOLVE_SELECTION_COMMAND = "solve-selection-to-clipboard";
const SHORTCUT_MODE = "answer";
const SHORTCUT_MAX_TIMEOUT_SECONDS = 25;
const MAX_TOAST_ANSWER_LENGTH = 72;
const activeShortcutTabs = new Set();

function isWebPage(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

function normalizeQuestion(value) {
  return String(value || "").trim();
}

function normalizeParsedAnswer(parsed, rawContent, mode) {
  if (typeof parsed === "string") {
    const content = parsed.trim();
    return { content, finalAnswer: mode === "answer" ? content : "" };
  }

  const content = String(
    parsed?.content ?? parsed?.output ?? parsed?.answer ?? rawContent ?? ""
  ).trim();
  const finalAnswer = String(
    parsed?.finalAnswer ?? parsed?.answer ?? (mode === "answer" ? content : "")
  ).trim();
  return { content, finalAnswer };
}

function demoContent(result, mode) {
  const modeValue = result?.[mode];
  if (typeof modeValue === "string" && modeValue.trim()) return modeValue.trim();
  if (typeof result?.content === "string" && result.content.trim()) return result.content.trim();
  if (typeof result?.output === "string" && result.output.trim()) return result.output.trim();
  if (mode === "steps" && Array.isArray(result?.steps) && result.steps.length) {
    return result.steps.join("\n");
  }
  return String(result?.answer || result?.finalAnswer || "").trim();
}

function verificationForSolver(result) {
  return {
    verified: true,
    verificationType: "solver",
    verificationMessage: result.verification || "自作ソルバーで計算結果を検証しました。"
  };
}

async function resolveAnswer(question, settings, classification) {
  const solverResult = solveLocally(question, { category: classification.primary });

  if (solverResult?.supported && !solverResult.solved) {
    throw new Error(solverResult.error || "この問題は条件を満たさないため解けませんでした。");
  }

  const hasVerifiedSolverAnswer = Boolean(
    solverResult?.supported
      && solverResult.solved
      && solverResult.verified
      && String(solverResult.answer || "").trim()
  );

  if (hasVerifiedSolverAnswer) {
    const finalAnswer = String(solverResult.answer).trim();
    return {
      content: finalAnswer,
      finalAnswer,
      solverResult,
      solverId: solverResult.solverId || null,
      ...verificationForSolver(solverResult)
    };
  }

  if (settings.allowUnverifiedAiAnswer === false) {
    throw new Error("この問題は自動検証できません。設定で未検証AI回答を許可するとOllamaを利用できます。");
  }

  const configuredTimeout = Number(settings.timeoutSeconds);
  const timeoutSeconds = Math.max(
    1,
    Math.min(
      Number.isFinite(configuredTimeout) ? configuredTimeout : SHORTCUT_MAX_TIMEOUT_SECONDS,
      SHORTCUT_MAX_TIMEOUT_SECONDS
    )
  );

  let ollamaError;
  try {
    const rawContent = await askOllama({
      question,
      mode: SHORTCUT_MODE,
      settings: { ...settings, timeoutSeconds },
      timeoutSeconds,
      classification,
      category: classification.primary,
      solverResult
    });
    const parsed = normalizeParsedAnswer(parseAnswer(rawContent, SHORTCUT_MODE), rawContent, SHORTCUT_MODE);
    if (!parsed.finalAnswer) throw new Error("Ollamaの回答から最終回答を抽出できませんでした。");

    return {
      ...parsed,
      solverResult,
      solverId: null,
      verified: false,
      verificationType: "ai-only",
      verificationMessage: "AI回答・未検証"
    };
  } catch (error) {
    ollamaError = error;
  }

  if (!settings.demoMode) throw ollamaError;

  const demoResult = solveDemo(question, {
    mode: SHORTCUT_MODE,
    category: classification,
    solverResult
  });
  if (demoResult?.matched === false || demoResult?.supported === false) throw ollamaError;

  const content = demoContent(demoResult, SHORTCUT_MODE);
  const finalAnswer = String(demoResult?.finalAnswer || demoResult?.answer || content).trim();
  if (!finalAnswer) throw ollamaError;

  return {
    content,
    finalAnswer,
    solverResult,
    solverId: demoResult?.solverId || null,
    verified: false,
    verificationType: "demo",
    verificationMessage: "Ollamaに接続できなかったため、固定デモデータを使用しました。"
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
    const settings = await getSettings();
    const result = await resolveAnswer(question, settings, classification);

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
