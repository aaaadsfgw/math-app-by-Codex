import { classifyCategory } from "./category-classifier.js";
import { copyText } from "./clipboard.js";
import { createLearningSession } from "./learning-session.js";
import {
  OCR_CAPTURE_PROTOCOL_VERSION,
  OCR_CAPTURE_TARGET,
  START_OCR_CAPTURE,
  normalizeOcrCaptureMessage,
} from "./ocr/capture-contract.js";
import {
  getSettings,
  saveSettings,
  takePendingQuestion,
  updateHistory,
} from "./storage.js";

const OUTPUT_MODES = new Set(["hint1", "hint2", "steps", "answer", "explain"]);
const SOURCE_LABELS = Object.freeze({
  manual: "手入力",
  selection: "選択範囲",
  clipboard: "クリップボード",
  ocr: "画像読み取り",
  review: "復習",
});

const elements = {
  appStateBadge: document.querySelector("#appStateBadge"),
  learningModeStatus: document.querySelector("#learningModeStatus"),
  learningModeInputs: [...document.querySelectorAll('input[name="learningMode"]')],
  questionInput: document.querySelector("#questionInput"),
  charCount: document.querySelector("#charCount"),
  selectionButton: document.querySelector("#selectionButton"),
  ocrButton: document.querySelector("#ocrButton"),
  ocrStatus: document.querySelector("#ocrStatus"),
  categoryStatus: document.querySelector("#categoryStatus"),
  inputSourceStatus: document.querySelector("#inputSourceStatus"),
  outputActionButtons: [...document.querySelectorAll("[data-output-mode]")],
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
  saveStatus: document.querySelector("#saveStatus"),
};

const learningSession = createLearningSession();

let settings = null;
let activeOutputMode = "answer";
let currentInputSource = "manual";
let pendingParentHistoryId = null;
let currentOcrConfirmed = false;
let currentWorkflow = null;
let currentViewLearningMode = null;
let latestCopyText = "";
let analysisRunning = false;
let selectionLoading = false;
let learningModeSaving = false;
let questionRevision = 0;

function cleanText(value) {
  return String(value ?? "").trim();
}

function errorMessage(error, fallback = "不明なエラーが発生しました。") {
  if (error instanceof Error && cleanText(error.message)) return cleanText(error.message);
  if (typeof error === "string" && cleanText(error)) return cleanText(error);
  return fallback;
}

function normalizeOutputMode(value) {
  return OUTPUT_MODES.has(value) ? value : "answer";
}

function currentLearningMode() {
  return settings?.learningMode === "quick" ? "quick" : "study";
}

function setAppState(text, state = "") {
  elements.appStateBadge.textContent = text;
  elements.appStateBadge.dataset.state = state;
}

function showError(message) {
  elements.errorMessage.textContent = cleanText(message) || "不明なエラーが発生しました。";
  elements.errorMessage.hidden = false;
  setAppState("エラー", "error");
}

function clearError() {
  elements.errorMessage.textContent = "";
  elements.errorMessage.hidden = true;
}

function canSaveAssessment() {
  return Boolean(
    settings?.learningMode === "study"
      && settings.saveHistory
      && currentViewLearningMode === "study"
      && learningSession.snapshot.historyId,
  );
}

function syncControlStates() {
  const controlsLocked = analysisRunning || selectionLoading || learningModeSaving;
  elements.questionInput.disabled = analysisRunning || selectionLoading;
  elements.selectionButton.disabled = controlsLocked;
  elements.outputActionButtons.forEach((button) => {
    button.disabled = controlsLocked;
  });
  elements.learningModeInputs.forEach((input) => {
    input.disabled = controlsLocked;
  });

  elements.ocrButton.disabled = controlsLocked;
  elements.copyButton.disabled = controlsLocked || !latestCopyText;
  elements.assessmentSaveButton.disabled = controlsLocked || !canSaveAssessment();
  elements.processStatus.hidden = !analysisRunning;
}

function updateCharacterCount() {
  elements.charCount.textContent = `${Array.from(elements.questionInput.value).length}文字`;
}

function updateClassification() {
  const question = cleanText(elements.questionInput.value);
  if (!question) {
    elements.categoryStatus.textContent = "未分類";
    elements.categoryStatus.removeAttribute("title");
    return null;
  }

  try {
    const classification = classifyCategory(question);
    elements.categoryStatus.textContent = classification?.primary || "その他";
    const details = [
      classification?.reason,
      classification?.candidates?.length
        ? `候補: ${classification.candidates.join("、")}`
        : "",
    ].filter(Boolean).join(" / ");
    if (details) elements.categoryStatus.title = details;
    else elements.categoryStatus.removeAttribute("title");
    return classification;
  } catch {
    elements.categoryStatus.textContent = "分類不能";
    elements.categoryStatus.removeAttribute("title");
    return null;
  }
}

function setInputSource(source, { ocrConfirmed = false } = {}) {
  currentInputSource = Object.hasOwn(SOURCE_LABELS, source) ? source : "manual";
  currentOcrConfirmed = currentInputSource === "ocr" && ocrConfirmed === true;
  elements.inputSourceStatus.textContent = SOURCE_LABELS[currentInputSource];
  elements.inputSourceStatus.dataset.source = currentInputSource;
  if (currentInputSource === "ocr") {
    elements.ocrStatus.textContent = currentOcrConfirmed
      ? "読み取り結果を確認済みです。"
      : "読み取り結果を確認してから解析してください。";
  } else {
    elements.ocrStatus.textContent = "ページ上で、印刷された数式1つが収まる範囲を選択します。";
  }
}

function setActiveOutputMode(mode) {
  activeOutputMode = normalizeOutputMode(mode);
  elements.outputActionButtons.forEach((button) => {
    button.setAttribute(
      "aria-pressed",
      String(button.dataset.outputMode === activeOutputMode),
    );
  });
}

function hideAttemptOutput() {
  currentWorkflow = null;
  currentViewLearningMode = null;
  latestCopyText = "";
  elements.resultPanel.hidden = true;
  elements.assessmentPanel.hidden = true;
  elements.resultOutput.textContent = "";
  elements.saveStatus.textContent = "";
  syncControlStates();
}

function resetAttempt() {
  questionRevision += 1;
  learningSession.clear();
  hideAttemptOutput();
}

function setQuestion(
  value,
  {
    source = "manual",
    parentHistoryId = null,
    ocrConfirmed = false,
  } = {},
) {
  elements.questionInput.value = String(value ?? "");
  pendingParentHistoryId = cleanText(parentHistoryId) || null;
  setInputSource(source, { ocrConfirmed });
  resetAttempt();
  updateCharacterCount();
  updateClassification();
}

function updateLearningModeUi() {
  const mode = currentLearningMode();
  elements.learningModeInputs.forEach((input) => {
    input.checked = input.value === mode;
  });

  if (mode === "quick") {
    elements.learningModeStatus.textContent = "履歴を残さず表示します";
    elements.assessmentPanel.hidden = true;
  } else if (!settings?.saveHistory) {
    elements.learningModeStatus.textContent = "設定で履歴保存がオフです";
    elements.assessmentPanel.hidden = true;
  } else {
    elements.learningModeStatus.textContent = "1問題を1件の履歴にまとめます";
    elements.assessmentPanel.hidden = !(
      currentWorkflow?.presentable
        && currentViewLearningMode === "study"
        && learningSession.snapshot.historyId
    );
  }
  syncControlStates();
}

function workflowFailureMessage(workflow) {
  const solverResult = workflow?.solverResult;
  if (cleanText(solverResult?.error)) return cleanText(solverResult.error);
  if (workflow?.resultKind === "unsupported") {
    return "この問題形式は、現在のオフライン数式エンジンではまだ解けません。";
  }
  if (workflow?.resultKind === "invalid") {
    return "問題文または条件を正しく解釈できませんでした。";
  }
  return "検証済みの解答を作成できませんでした。";
}

function renderResult(workflow) {
  const solverResult = workflow.solverResult;
  currentWorkflow = workflow;
  currentViewLearningMode = currentLearningMode();
  latestCopyText = cleanText(workflow.presentation?.content);
  elements.verificationBadge.textContent = "自作ソルバーで検証済み";
  elements.verificationBadge.dataset.verification = "solver";
  elements.verificationMessage.textContent = cleanText(solverResult?.verification)
    || "自作ソルバーで計算結果を検証しました。";
  elements.resultOutput.textContent = latestCopyText;
  elements.resultPanel.hidden = false;
  setActiveOutputMode(workflow.outputMode);
}

function updateStudyStatus({
  outcome,
  mode,
  hadHistoryBefore,
  viewedBefore,
}) {
  if (currentLearningMode() === "quick") {
    elements.saveStatus.textContent = "Quick Modeのため、履歴には保存していません。";
    elements.assessmentPanel.hidden = true;
    return;
  }
  if (!settings.saveHistory) {
    elements.saveStatus.textContent = "履歴保存は設定でオフになっています。";
    elements.assessmentPanel.hidden = true;
    return;
  }

  const historyId = learningSession.snapshot.historyId;
  if (outcome.historyRecord?.selfAssessment) {
    elements.assessmentSelect.value = outcome.historyRecord.selfAssessment;
  }
  if (outcome.historyError) {
    elements.saveStatus.textContent =
      `結果は表示しましたが、履歴を保存できませんでした: ${errorMessage(outcome.historyError)}`;
  } else if (!historyId) {
    elements.saveStatus.textContent =
      "結果は表示しましたが、保存した履歴を確認できませんでした。";
  } else if (!hadHistoryBefore) {
    elements.assessmentSelect.value = outcome.historyRecord?.selfAssessment
      || (mode === "answer" ? "answer_seen" : "unassessed");
    elements.saveStatus.textContent = "新しい学習履歴に保存しました。";
  } else if (viewedBefore) {
    elements.saveStatus.textContent = "同じ学習履歴を維持しています。";
  } else {
    elements.saveStatus.textContent = "同じ学習履歴に表示段階を追加しました。";
  }

  elements.assessmentPanel.hidden = !(currentWorkflow?.presentable && historyId);
}

async function runOutputMode(requestedMode) {
  if (analysisRunning || selectionLoading || learningModeSaving) return;

  const question = cleanText(elements.questionInput.value);
  if (!question) {
    showError("問題文を入力してください。");
    elements.questionInput.focus();
    return;
  }
  if (currentInputSource === "ocr" && !currentOcrConfirmed) {
    showError("画像から読み取った問題文を確認してから解析してください。");
    return;
  }

  const mode = normalizeOutputMode(requestedMode);
  const inputChanged = learningSession.setInput({
    question,
    source: currentInputSource,
    parentHistoryId: pendingParentHistoryId,
    ocrUsed: currentInputSource === "ocr",
    ocrConfirmed: currentOcrConfirmed,
  });
  if (inputChanged) {
    currentWorkflow = null;
    latestCopyText = "";
  }

  const before = learningSession.snapshot;
  const hadCachedResult = before.hasCachedResult;
  const hadHistoryBefore = Boolean(before.historyId);
  const viewedBefore = before.viewedModes.includes(mode);
  const revisionAtStart = questionRevision;

  analysisRunning = true;
  clearError();
  setActiveOutputMode(mode);
  elements.processStatus.textContent = hadCachedResult
    ? "表示を切り替えています"
    : "解析中です";
  if (!hadCachedResult) {
    hideAttemptOutput();
    elements.saveStatus.textContent = "";
  }
  setAppState(hadCachedResult ? "表示切替中" : "解析中", "loading");
  syncControlStates();

  try {
    const outcome = await learningSession.view(mode, {
      learningMode: currentLearningMode(),
      saveHistory: settings.saveHistory,
    });
    if (revisionAtStart !== questionRevision) return;

    if (!outcome.workflow?.presentable) {
      hideAttemptOutput();
      showError(workflowFailureMessage(outcome.workflow));
      return;
    }

    renderResult(outcome.workflow);
    updateStudyStatus({
      outcome,
      mode: outcome.workflow.outputMode,
      hadHistoryBefore,
      viewedBefore,
    });
    setAppState("完了", "success");
  } catch (error) {
    showError(errorMessage(error, "解析中にエラーが発生しました。"));
  } finally {
    analysisRunning = false;
    updateLearningModeUi();
  }
}

function isWebPage(url) {
  return /^https?:\/\//iu.test(String(url || ""));
}

async function sendToTab(tab, message) {
  try {
    return await chrome.tabs.sendMessage(tab.id, message);
  } catch (firstError) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["js/content-script.js"],
      });
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch (error) {
      throw new Error("このページから選択範囲を取得できませんでした。", {
        cause: error ?? firstError,
      });
    }
  }
}

async function loadSelection() {
  if (analysisRunning || selectionLoading || learningModeSaving) return;
  selectionLoading = true;
  clearError();
  setAppState("選択取得中", "loading");
  syncControlStates();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !isWebPage(tab.url)) {
      throw new Error("このページからは選択中の文章を取得できません。");
    }

    const response = await sendToTab(tab, { type: "GET_SELECTION_TEXT" });
    const text = cleanText(response?.text);
    if (!text) throw new Error("ページ上で問題文を選択してください。");

    setQuestion(text, { source: "selection" });
    setAppState("選択を取得", "success");
  } catch (error) {
    showError(errorMessage(error, "選択中の文章を取得できませんでした。"));
  } finally {
    selectionLoading = false;
    syncControlStates();
  }
}

async function startOcrCapture() {
  if (analysisRunning || selectionLoading || learningModeSaving) return;
  selectionLoading = true;
  clearError();
  elements.ocrStatus.textContent = "画像の範囲選択を開始しています…";
  setAppState("画像範囲を準備中", "loading");
  syncControlStates();

  try {
    const message = normalizeOcrCaptureMessage({
      target: OCR_CAPTURE_TARGET,
      protocolVersion: OCR_CAPTURE_PROTOCOL_VERSION,
      type: START_OCR_CAPTURE,
    });
    const response = await globalThis.chrome?.runtime?.sendMessage(message);
    if (!response || response.ok !== true) {
      const reported = cleanText(response?.error?.message);
      throw new Error(reported || "画像の範囲選択を開始できませんでした。");
    }
    elements.ocrStatus.textContent = "ページ上で数式を囲んでください。選択後に確認画面が開きます。";
    setAppState("範囲を選択中", "success");
    globalThis.close();
  } catch (error) {
    showError(errorMessage(error, "画像の範囲選択を開始できませんでした。"));
    elements.ocrStatus.textContent = "画像読み取りを開始できませんでした。もう一度お試しください。";
  } finally {
    selectionLoading = false;
    syncControlStates();
  }
}

async function saveAssessment() {
  const historyId = learningSession.snapshot.historyId;
  if (!historyId || !canSaveAssessment()) {
    elements.saveStatus.textContent = settings?.saveHistory
      ? "更新対象の学習履歴がありません。"
      : "履歴保存は設定でオフになっています。";
    return;
  }

  elements.assessmentSaveButton.disabled = true;
  clearError();
  try {
    const updated = await updateHistory(historyId, {
      selfAssessment: elements.assessmentSelect.value,
    });
    if (!updated) throw new Error("履歴が見つかりませんでした。");
    elements.saveStatus.textContent =
      `評価を保存しました（${updated.score ?? "未評価"}点）。`;
    setAppState("評価を保存", "success");
  } catch (error) {
    elements.saveStatus.textContent =
      `評価を保存できませんでした: ${errorMessage(error)}`;
  } finally {
    syncControlStates();
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
    showError(errorMessage(error, "結果をコピーできませんでした。"));
  } finally {
    syncControlStates();
  }
}

async function changeLearningMode(nextValue) {
  if (analysisRunning || selectionLoading || learningModeSaving) return;
  const nextMode = nextValue === "quick" ? "quick" : "study";
  const previousMode = currentLearningMode();
  if (nextMode === previousMode) {
    updateLearningModeUi();
    return;
  }

  learningModeSaving = true;
  clearError();
  syncControlStates();
  try {
    settings = await saveSettings({ learningMode: nextMode });
    learningSession.changeLearningMode(nextMode);
    currentViewLearningMode = null;
    elements.saveStatus.textContent = nextMode === "quick"
      ? "Quick Modeに切り替えました。この先の表示は記録しません。"
      : "Study Modeに切り替えました。次に表示した段階から学習記録を再開します。";
    setAppState(nextMode === "quick" ? "Quick Mode" : "Study Mode", "success");
  } catch (error) {
    settings = { ...settings, learningMode: previousMode };
    showError(errorMessage(error, "利用モードを保存できませんでした。"));
  } finally {
    learningModeSaving = false;
    updateLearningModeUi();
  }
}

async function loadPendingQuestion() {
  const pending = await takePendingQuestion();
  if (!pending) return;

  const question = typeof pending === "string" ? pending : pending.question;
  if (cleanText(question)) {
    const source = typeof pending === "object" && Object.hasOwn(SOURCE_LABELS, pending.source)
      ? pending.source
      : "review";
    const requestedMode = typeof pending === "object" && OUTPUT_MODES.has(pending.requestedMode)
      ? pending.requestedMode
      : activeOutputMode;
    setQuestion(question, {
      source,
      parentHistoryId: typeof pending === "object" ? pending.parentHistoryId : null,
      ocrConfirmed: typeof pending === "object" && pending.ocrConfirmed === true,
    });
    setActiveOutputMode(requestedMode);
    setAppState(source === "ocr" ? "画像読み取りを確認済み" : "復習問題を読込", "success");
    if (typeof pending === "object" && pending.autoSolve === true) {
      await runOutputMode(requestedMode);
    }
  }
}

function handleManualInput() {
  pendingParentHistoryId = null;
  setInputSource("manual");
  resetAttempt();
  updateCharacterCount();
  updateClassification();
  clearError();
  setAppState("入力中");
}

async function initialize() {
  settings = await getSettings();
  settings.learningMode = settings.learningMode === "quick" ? "quick" : "study";
  setActiveOutputMode(normalizeOutputMode(settings.defaultMode));
  setInputSource("manual");
  updateLearningModeUi();
  updateCharacterCount();
  updateClassification();
  setAppState("オフライン数式エンジン");

  elements.questionInput.addEventListener("input", handleManualInput);
  elements.selectionButton.addEventListener("click", () => void loadSelection());
  elements.ocrButton.addEventListener("click", () => void startOcrCapture());
  elements.outputActionButtons.forEach((button) => {
    button.addEventListener("click", () => void runOutputMode(button.dataset.outputMode));
  });
  elements.learningModeInputs.forEach((input) => {
    input.addEventListener("change", () => {
      if (input.checked) void changeLearningMode(input.value);
    });
  });
  elements.copyButton.addEventListener("click", () => void copyResult());
  elements.assessmentSaveButton.addEventListener("click", () => void saveAssessment());
  elements.questionInput.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      void runOutputMode(activeOutputMode);
    }
  });

  await loadPendingQuestion();
  syncControlStates();
}

void initialize().catch((error) => {
  showError(`初期化できませんでした: ${errorMessage(error)}`);
  elements.ocrButton.disabled = true;
});
