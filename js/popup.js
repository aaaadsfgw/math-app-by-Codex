import { classifyCategory } from "./category-classifier.js";
import { copyText } from "./clipboard.js";
import { presentSolution } from "./solution-presenter.js";
import { solveQuestionAsync as solveLocally } from "./solver/index.js";
import {
  addHistory,
  clearPendingQuestion,
  getPendingQuestion,
  getSettings,
  updateHistory
} from "./storage.js";

const elements = {
  appStateBadge: document.querySelector("#appStateBadge"),
  questionInput: document.querySelector("#questionInput"),
  charCount: document.querySelector("#charCount"),
  selectionButton: document.querySelector("#selectionButton"),
  categoryStatus: document.querySelector("#categoryStatus"),
  runButton: document.querySelector("#runButton"),
  processStatus: document.querySelector("#processStatus"),
  errorMessage: document.querySelector("#errorMessage"),
  resultPanel: document.querySelector("#resultPanel"),
  verificationBadge: document.querySelector("#verificationBadge"),
  verificationMessage: document.querySelector("#verificationMessage"),
  resultOutput: document.querySelector("#resultOutput"),
  copyButton: document.querySelector("#copyButton"),
  assessmentPanel: document.querySelector("#assessmentPanel"),
  assessmentSelect: document.querySelector("#assessmentSelect"),
  assessmentSaveButton: document.querySelector("#assessmentSaveButton"),
  saveStatus: document.querySelector("#saveStatus")
};

const VERIFICATION_LABELS = {
  solver: "自作ソルバーで検証済み",
  unsupported: "自動検証不能",
  error: "エラー"
};

let settings;
let currentClassification = null;
let currentHistoryId = null;
let pendingParentHistoryId = null;
let pendingSource = "popup";
let pendingQuestionText = null;
let latestCopyText = "";
let analysisRunning = false;

function selectedMode() {
  return document.querySelector('input[name="mode"]:checked')?.value || "answer";
}

function normalizeQuestion(value) {
  return String(value || "").trim();
}

function setAppState(text, state = "") {
  elements.appStateBadge.textContent = text;
  elements.appStateBadge.dataset.state = state;
}

function showError(message) {
  elements.errorMessage.textContent = String(message || "不明なエラーが発生しました。");
  elements.errorMessage.hidden = false;
  setAppState("エラー", "error");
}

function clearError() {
  elements.errorMessage.textContent = "";
  elements.errorMessage.hidden = true;
}

function setBusy(isBusy) {
  elements.runButton.disabled = isBusy;
  elements.selectionButton.disabled = isBusy;
  elements.processStatus.hidden = !isBusy;
  elements.runButton.textContent = isBusy ? "解析中..." : "解析する";
  if (isBusy) setAppState("解析中", "loading");
}

function updateCharacterCount() {
  elements.charCount.textContent = `${Array.from(elements.questionInput.value).length}文字`;
}

function updateClassification() {
  const question = normalizeQuestion(elements.questionInput.value);
  if (!question) {
    currentClassification = null;
    elements.categoryStatus.textContent = "未分類";
    elements.categoryStatus.removeAttribute("title");
    return null;
  }

  currentClassification = classifyCategory(question);
  elements.categoryStatus.textContent = currentClassification?.primary || "その他";
  const details = [currentClassification?.reason]
    .concat(currentClassification?.candidates?.length ? `候補: ${currentClassification.candidates.join("、")}` : [])
    .filter(Boolean)
    .join(" / ");
  if (details) elements.categoryStatus.title = details;
  else elements.categoryStatus.removeAttribute("title");
  return currentClassification;
}

function renderResult(result) {
  const verificationType = result.verificationType || "unsupported";
  elements.verificationBadge.textContent = result.verificationLabel
    || VERIFICATION_LABELS[verificationType]
    || VERIFICATION_LABELS.unsupported;
  elements.verificationBadge.dataset.verification = verificationType;
  elements.verificationMessage.textContent = result.verificationMessage || "自動検証できませんでした。";
  elements.resultOutput.textContent = result.content;
  elements.resultPanel.hidden = false;
  elements.assessmentPanel.hidden = false;
  latestCopyText = result.content;
  elements.copyButton.disabled = !latestCopyText;
}

function defaultAssessment(mode) {
  return mode === "answer" ? "answer_seen" : "unassessed";
}

function verificationForSolver(result) {
  return {
    verified: true,
    verificationType: "solver",
    verificationLabel: "自作ソルバーで検証済み",
    verificationMessage: result.verification || "自作ソルバーで計算結果を検証しました。"
  };
}

async function resolveQuestion(question, mode, classification) {
  const solverResult = await solveLocally(question, { category: classification.primary });

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
    ...presentSolution(solverResult, { mode, category: classification.primary }),
    solverId: solverResult.solverId || null,
    resultKind: solverResult.resultKind || "exact",
    conditions: Array.isArray(solverResult.conditions) ? solverResult.conditions : [],
    solutionTrace: Array.isArray(solverResult.solutionTrace) ? solverResult.solutionTrace : [],
    solverResult,
    ...verificationForSolver(solverResult)
  };
}

async function persistResult(question, mode, classification, result) {
  const assessment = defaultAssessment(mode);
  elements.assessmentSelect.value = assessment;
  currentHistoryId = null;
  elements.assessmentSaveButton.disabled = true;

  if (!settings.saveHistory) {
    elements.saveStatus.textContent = "履歴保存は設定でオフになっています。";
    return;
  }

  try {
    const record = await addHistory({
      question,
      mode,
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
      selfAssessment: assessment,
      source: pendingSource,
      parentHistoryId: pendingParentHistoryId
    });
    currentHistoryId = record?.id || null;
    elements.assessmentSaveButton.disabled = !currentHistoryId;
    elements.saveStatus.textContent = currentHistoryId
      ? "履歴に保存しました。"
      : "結果は表示しましたが、履歴IDを確認できませんでした。";
  } catch (error) {
    elements.saveStatus.textContent = `結果は表示しましたが、履歴を保存できませんでした: ${error.message}`;
  }
}

async function runAnalysis() {
  if (analysisRunning) return;

  const question = normalizeQuestion(elements.questionInput.value);
  if (!question) {
    showError("問題文を入力してください。");
    elements.questionInput.focus();
    return;
  }

  const mode = selectedMode();
  if (pendingQuestionText && question !== pendingQuestionText) {
    pendingQuestionText = null;
    pendingParentHistoryId = null;
    pendingSource = "popup";
  }
  const classification = updateClassification();
  analysisRunning = true;
  clearError();
  setBusy(true);
  elements.resultPanel.hidden = true;
  elements.assessmentPanel.hidden = true;
  elements.saveStatus.textContent = "";
  latestCopyText = "";
  currentHistoryId = null;

  try {
    const result = await resolveQuestion(question, mode, classification);
    renderResult(result);
    await persistResult(question, mode, classification, result);
    if (currentHistoryId && pendingSource === "review") {
      pendingQuestionText = null;
      pendingParentHistoryId = null;
      pendingSource = "popup";
    }
    setAppState("完了", "success");
  } catch (error) {
    showError(error.message);
  } finally {
    analysisRunning = false;
    setBusy(false);
  }
}

function isWebPage(url) {
  return /^https?:\/\//i.test(String(url || ""));
}

async function sendToTab(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["js/content-script.js"]
      });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      throw firstError;
    }
  }
}

async function loadSelection() {
  clearError();
  elements.selectionButton.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isWebPage(tab.url)) {
      throw new Error("このページからは選択中の文章を取得できません。");
    }

    const response = await sendToTab(tab, { type: "GET_SELECTION_TEXT" });
    const text = String(response?.text || "").trim();
    if (!text) throw new Error("ページ上で問題文を選択してください。");

    elements.questionInput.value = text;
    updateCharacterCount();
    updateClassification();
    setAppState("選択を取得", "success");
  } catch (error) {
    showError(error.message);
  } finally {
    elements.selectionButton.disabled = false;
  }
}

async function saveAssessment() {
  if (!currentHistoryId) {
    elements.saveStatus.textContent = settings.saveHistory
      ? "更新対象の履歴がありません。もう一度解析してください。"
      : "履歴保存は設定でオフになっています。";
    return;
  }

  elements.assessmentSaveButton.disabled = true;
  try {
    const updated = await updateHistory(currentHistoryId, {
      selfAssessment: elements.assessmentSelect.value
    });
    if (!updated) throw new Error("履歴が見つかりませんでした。");
    elements.saveStatus.textContent = `評価を保存しました（${updated.score ?? "未評価"}点）。`;
    setAppState("評価を保存", "success");
  } catch (error) {
    elements.saveStatus.textContent = `評価を保存できませんでした: ${error.message}`;
  } finally {
    elements.assessmentSaveButton.disabled = false;
  }
}

async function copyResult() {
  if (!latestCopyText) return;
  elements.copyButton.disabled = true;
  clearError();
  try {
    await copyText(latestCopyText);
    setAppState("コピー完了", "success");
  } catch (error) {
    showError(error.message);
  } finally {
    elements.copyButton.disabled = false;
  }
}

async function loadPendingQuestion() {
  const pending = await getPendingQuestion();
  if (!pending) return;

  const question = typeof pending === "string" ? pending : pending.question;
  if (question) {
    elements.questionInput.value = question;
    pendingQuestionText = normalizeQuestion(question);
    pendingParentHistoryId = typeof pending === "object" ? pending.parentHistoryId : null;
    pendingSource = "review";
    updateCharacterCount();
    updateClassification();
    setAppState("復習問題を読込", "success");
  }
  await clearPendingQuestion();
}

async function initialize() {
  settings = await getSettings();
  const defaultMode = ["answer", "hint1", "hint2", "steps", "explain"].includes(settings.defaultMode)
    ? settings.defaultMode
    : "answer";
  const defaultModeInput = document.querySelector(`input[name="mode"][value="${defaultMode}"]`);
  if (defaultModeInput) defaultModeInput.checked = true;

  setAppState("オフライン数式エンジン");
  updateCharacterCount();
  updateClassification();
  await loadPendingQuestion();

  elements.questionInput.addEventListener("input", () => {
    updateCharacterCount();
    updateClassification();
    clearError();
  });
  elements.selectionButton.addEventListener("click", () => void loadSelection());
  elements.runButton.addEventListener("click", () => void runAnalysis());
  elements.copyButton.addEventListener("click", () => void copyResult());
  elements.assessmentSaveButton.addEventListener("click", () => void saveAssessment());
  elements.questionInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void runAnalysis();
    }
  });
}

void initialize().catch((error) => showError(`初期化できませんでした: ${error.message}`));
