import { parseAnswer } from "./answer-parser.js";
import { classifyCategory } from "./category-classifier.js";
import { copyText } from "./clipboard.js";
import { solveDemo } from "./demo-solver.js";
import { askOllama } from "./ollama-client.js";
import { solveQuestion as solveLocally } from "./solver/index.js";
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
  demo: "デモデータ",
  "ai-only": "AI回答・未検証",
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

function localStepContent(result) {
  if (Array.isArray(result?.steps) && result.steps.length) return result.steps.join("\n");
  return String(result?.answer || "").trim();
}

function comparableAnswer(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\*\*/g, "")
    .replace(/^(?:最終回答|最終的な答え|最終答え|答え|解答|final\s*answer|answer)(?:（[^）]*）)?\s*[：:]\s*/iu, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function rawFinalAnswerCandidates(rawContent) {
  const candidates = new Set();
  const prefix = /^(?:最終回答|最終的な答え|最終答え|答え|解答|final\s*answer|answer)\s*[：:]\s*/iu;
  for (const rawLine of String(rawContent || "").split(/\r?\n/u)) {
    const line = rawLine.replace(/\*\*/g, "").replace(/^\s*[-*]\s*/u, "").trim();
    if (!prefix.test(line)) continue;
    const candidate = comparableAnswer(line.replace(prefix, ""));
    if (candidate) candidates.add(candidate);
  }
  return candidates;
}

function looksLikeStandaloneAnswer(line) {
  const value = String(line || "").trim();
  if (!value || value.length > 120) return false;
  if (/[。！？]|(?:代入|検算|確認|一致|理由)/u.test(value)) return false;
  return /(?:^|\s)(?:[a-z]\s*=|[-+]?\d|√|解なし|不定解|すべての実数|不明)/iu.test(value);
}

function enforceVerifiedFinalAnswer(content, parsedFinalAnswer, verifiedAnswer, mode, rawContent) {
  if (!["steps", "explain"].includes(mode)) return content;
  const parsedCandidate = comparableAnswer(parsedFinalAnswer);
  const rawCandidates = rawFinalAnswerCandidates(rawContent);
  const lines = String(content || "").split("\n");
  let finalLineIndex = lines.length - 1;
  while (finalLineIndex >= 0 && !lines[finalLineIndex].trim()) finalLineIndex -= 1;

  const keptLines = lines.filter((line, index) => {
    const candidate = comparableAnswer(line);
    if (candidate && rawCandidates.has(candidate)) return false;
    return !(
      index === finalLineIndex
      && candidate
      && candidate === parsedCandidate
      && looksLikeStandaloneAnswer(line)
    );
  });
  const body = keptLines.join("\n").trim();
  const verifiedLine = `最終回答（自作ソルバー検証済み）: ${verifiedAnswer}`;
  return body ? `${body}\n\n${verifiedLine}` : verifiedLine;
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

  if (hasVerifiedSolverAnswer && mode === "answer") {
    const finalAnswer = String(solverResult.answer).trim();
    return {
      content: finalAnswer,
      finalAnswer,
      solverId: solverResult.solverId || null,
      solverResult,
      ...verificationForSolver(solverResult)
    };
  }

  if (hasVerifiedSolverAnswer && mode === "steps") {
    return {
      content: localStepContent(solverResult),
      finalAnswer: String(solverResult.answer).trim(),
      solverId: solverResult.solverId || null,
      solverResult,
      ...verificationForSolver(solverResult)
    };
  }

  if (!hasVerifiedSolverAnswer && settings.allowUnverifiedAiAnswer === false) {
    throw new Error("この問題は自動検証できません。設定で未検証AI回答を許可するとOllamaを利用できます。");
  }

  let ollamaError;
  try {
    const rawContent = await askOllama({
      question,
      mode,
      settings,
      classification,
      category: classification.primary,
      solverResult
    });
    const parsed = normalizeParsedAnswer(parseAnswer(rawContent, mode), rawContent, mode);
    if (!parsed.content) throw new Error("Ollamaから表示できる回答を取得できませんでした。");

    const verifiedAnswer = hasVerifiedSolverAnswer ? String(solverResult.answer).trim() : "";
    const content = hasVerifiedSolverAnswer
      ? enforceVerifiedFinalAnswer(parsed.content, parsed.finalAnswer, verifiedAnswer, mode, rawContent)
      : parsed.content;
    const generatedWithVerifiedAnswer = hasVerifiedSolverAnswer && ["steps", "explain"].includes(mode);

    return {
      content,
      finalAnswer: hasVerifiedSolverAnswer ? verifiedAnswer : parsed.finalAnswer,
      solverId: hasVerifiedSolverAnswer ? (solverResult.solverId || null) : null,
      solverResult,
      verified: hasVerifiedSolverAnswer,
      verificationType: hasVerifiedSolverAnswer ? "solver" : "ai-only",
      verificationLabel: hasVerifiedSolverAnswer
        ? (generatedWithVerifiedAnswer ? "最終回答を検証済み" : "ソルバー結果を確認済み")
        : undefined,
      verificationMessage: hasVerifiedSolverAnswer
        ? `表示内容はOllamaが生成しました。最終回答「${verifiedAnswer}」は自作ソルバーで検証済みです。${solverResult.verification || ""}`.trim()
        : "AI回答・未検証"
    };
  } catch (error) {
    ollamaError = error;
  }

  if (!settings.demoMode) throw ollamaError;

  const demoResult = solveDemo(question, { mode, category: classification, solverResult });
  if (demoResult?.matched === false || demoResult?.supported === false) throw ollamaError;

  const demoOutput = demoContent(demoResult, mode);
  if (!demoOutput) throw ollamaError;
  const verifiedAnswer = hasVerifiedSolverAnswer ? String(solverResult.answer).trim() : "";
  const content = hasVerifiedSolverAnswer
    ? enforceVerifiedFinalAnswer(demoOutput, demoResult?.answer, verifiedAnswer, mode, demoOutput)
    : demoOutput;
  const finalAnswer = String(
    hasVerifiedSolverAnswer
      ? verifiedAnswer
      : (demoResult?.finalAnswer || demoResult?.answer || (mode === "answer" ? content : ""))
  ).trim();
  const generatedWithVerifiedAnswer = hasVerifiedSolverAnswer && ["steps", "explain"].includes(mode);

  return {
    content,
    finalAnswer,
    solverId: hasVerifiedSolverAnswer
      ? (solverResult.solverId || null)
      : (demoResult?.solverId || null),
    solverResult,
    verified: hasVerifiedSolverAnswer,
    verificationType: hasVerifiedSolverAnswer ? "solver" : "demo",
    verificationLabel: hasVerifiedSolverAnswer
      ? (generatedWithVerifiedAnswer ? "最終回答を検証済み" : "ソルバー結果を確認済み")
      : undefined,
    verificationMessage: hasVerifiedSolverAnswer
      ? `Ollamaの処理に失敗したため固定デモを使用しました。最終回答「${verifiedAnswer}」は自作ソルバーで検証済みです。${solverResult.verification || ""}`.trim()
      : "Ollamaの処理に失敗したため、固定デモデータを使用しました。"
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

  setAppState(settings.demoMode ? "Ollama + デモ予備" : "ローカル + Ollama");
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
