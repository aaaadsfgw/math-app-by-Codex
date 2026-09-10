import {
  createHistoryRecordPayload,
  presentWorkflowResult,
  solveWorkflow,
} from "./solve-workflow.js";
import { normalizeProblemInput } from "./problem/problem-input.js";
import {
  addHistory,
  recordOutputView,
} from "./storage.js";

function cleanText(value) {
  return String(value ?? "").trim();
}

function normalizedStructuredInput(value, source) {
  if (value === undefined || value === null) return null;
  const problemInput = normalizeProblemInput(value, { source });
  if (!problemInput.formulaText) {
    throw new TypeError(problemInput.error || "数式が空です。");
  }
  return problemInput;
}

function isOcrProblemInput(problemInput) {
  return Boolean(
    problemInput
      && (
        problemInput.source === "ocr"
        || problemInput.instructionSource === "ocr"
        || problemInput.formulaSource === "ocr"
      ),
  );
}

function normalizeInput(input = {}) {
  const requestedSource = cleanText(input.source);
  const problemInput = normalizedStructuredInput(
    input.problemInput,
    requestedSource || "manual",
  );
  const question = problemInput?.formulaText || cleanText(input.question);
  if (!question) throw new TypeError("問題文が空です。");
  const source = requestedSource || problemInput?.source || "manual";
  const ocrUsed = (
    source === "ocr"
    || input.ocrUsed === true
    || isOcrProblemInput(problemInput)
  );
  return Object.freeze({
    question,
    problemInput,
    source,
    parentHistoryId: cleanText(input.parentHistoryId) || null,
    ocrUsed,
    ocrConfirmed: ocrUsed && input.ocrConfirmed === true,
  });
}

function sameProblemInput(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  const fields = [
    "schemaVersion",
    "status",
    "error",
    "rawText",
    "questionLabel",
    "instructionText",
    "instructionIntent",
    "instructionStatus",
    "formulaText",
    "source",
    "instructionSource",
    "formulaSource",
  ];
  return fields.every((field) => left[field] === right[field])
    && left.conditions.length === right.conditions.length
    && left.conditions.every((condition, index) => condition === right.conditions[index]);
}

function sameInput(left, right) {
  return Boolean(
    left
      && right
      && left.question === right.question
      && sameProblemInput(left.problemInput, right.problemInput)
      && left.source === right.source
      && left.parentHistoryId === right.parentHistoryId
      && left.ocrUsed === right.ocrUsed
      && left.ocrConfirmed === right.ocrConfirmed,
  );
}

function defaultAssessment(mode) {
  return mode === "answer" ? "answer_seen" : "unassessed";
}

export class LearningSession {
  constructor({
    solve = solveWorkflow,
    present = presentWorkflowResult,
    addHistoryRecord = addHistory,
    recordView = recordOutputView,
  } = {}) {
    if (typeof solve !== "function") throw new TypeError("solveは関数で指定してください。");
    if (typeof present !== "function") throw new TypeError("presentは関数で指定してください。");
    if (typeof addHistoryRecord !== "function") {
      throw new TypeError("addHistoryRecordは関数で指定してください。");
    }
    if (typeof recordView !== "function") throw new TypeError("recordViewは関数で指定してください。");
    this._solve = solve;
    this._present = present;
    this._addHistory = addHistoryRecord;
    this._recordView = recordView;
    this.clear();
  }

  get snapshot() {
    return Object.freeze({
      input: this._input,
      hasCachedResult: Boolean(this._baseWorkflow),
      presentable: this._baseWorkflow?.presentable === true,
      historyId: this._historyId,
      learningMode: this._learningMode,
      viewedModes: Object.freeze([...this._viewedModes]),
    });
  }

  clear() {
    this._input = null;
    this._baseWorkflow = null;
    this._historyId = null;
    this._learningMode = null;
    this._viewedModes = [];
  }

  setInput(input) {
    const normalized = normalizeInput(input);
    if (sameInput(this._input, normalized)) return false;
    this._input = normalized;
    this._baseWorkflow = null;
    this._historyId = null;
    this._learningMode = null;
    this._viewedModes = [];
    return true;
  }

  changeLearningMode(learningMode) {
    const mode = learningMode === "quick" ? "quick" : "study";
    if (this._learningMode === null) {
      this._learningMode = mode;
      return false;
    }
    if (this._learningMode === mode) return false;
    this._learningMode = mode;
    return true;
  }

  async _workflowForMode(mode, symbolicOperations) {
    if (!this._input) throw new TypeError("問題文を先に設定してください。");
    if (this._input.ocrUsed && !this._input.ocrConfirmed) {
      const error = new Error("画像から読み取った問題文を確認してから解析してください。");
      error.name = "LearningSessionError";
      error.code = "OCR_CONFIRMATION_REQUIRED";
      throw error;
    }
    if (!this._baseWorkflow) {
      const workflow = await this._solve(this._input.problemInput ?? this._input.question, {
        mode,
        symbolicOperations,
      });
      if (workflow?.solverResult?.retryable !== true) {
        this._baseWorkflow = workflow;
      }
      return Object.freeze({ workflow, solvedFresh: true });
    }
    if (!this._baseWorkflow.presentable) {
      return Object.freeze({ workflow: this._baseWorkflow, solvedFresh: false });
    }
    return Object.freeze({
      workflow: this._present(this._baseWorkflow, mode),
      solvedFresh: false,
    });
  }

  async view(
    mode,
    {
      learningMode = "study",
      saveHistory = true,
      symbolicOperations,
      selfAssessment,
    } = {},
  ) {
    const normalizedLearningMode = learningMode === "quick" ? "quick" : "study";
    this.changeLearningMode(normalizedLearningMode);
    const { workflow, solvedFresh } = await this._workflowForMode(mode, symbolicOperations);
    if (!workflow?.presentable) {
      return Object.freeze({
        workflow,
        solvedFresh,
        historyRecord: null,
        historyError: null,
      });
    }

    let historyRecord = null;
    let historyError = null;
    if (normalizedLearningMode === "study" && saveHistory) {
      const isNewView = !this._viewedModes.includes(workflow.outputMode);
      if (isNewView) this._viewedModes.push(workflow.outputMode);
      try {
        if (this._historyId && isNewView) {
          historyRecord = await this._recordView(this._historyId, workflow.outputMode, {
            output: workflow.presentation.content,
          });
          if (!historyRecord) this._historyId = null;
        }
        if (!this._historyId) {
          const historyPayload = createHistoryRecordPayload(workflow, {
            source: this._input.source,
            parentHistoryId: this._input.parentHistoryId,
            selfAssessment: selfAssessment ?? defaultAssessment(workflow.outputMode),
            additionalFields: {
              learningMode: "study",
              entryPoint: this._input.source === "review" ? "review" : "popup",
              usage: { viewedModes: [...this._viewedModes] },
              ocrUsed: this._input.ocrUsed,
              ocrConfirmed: this._input.ocrConfirmed,
            },
          });
          historyRecord = await this._addHistory(this._input.problemInput
            ? { ...historyPayload, problemInput: this._input.problemInput }
            : historyPayload);
          this._historyId = historyRecord?.id || null;
        }
      } catch (error) {
        historyError = error;
      }
    }

    return Object.freeze({
      workflow,
      solvedFresh,
      historyRecord,
      historyError,
    });
  }
}

export function createLearningSession(options) {
  return new LearningSession(options);
}
