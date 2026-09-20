import {
  createHistoryRecordPayload,
  presentWorkflowResult,
  solveWorkflow,
} from "./solve-workflow.js";
import { normalizeProblemInput } from "./problem/problem-input.js";
import { normalizeStructuredProblemSet } from "./problem/structured-input.js";
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

function normalizedProblemSet(value, source, ocrConfirmed) {
  if (value === undefined || value === null) return null;
  return normalizeStructuredProblemSet(value, {
    source,
    ocrConfirmed: ocrConfirmed === true,
  });
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

function isOcrProblemSet(problemSet) {
  if (!problemSet) return false;
  const recognitionStatuses = new Set(["candidate", "confirmed", "recognition_error"]);
  const confirmationStatuses = new Set(["unconfirmed", "pending_confirmation"]);
  const provenanceUsesOcr = (fieldProvenance) => Boolean(
    fieldProvenance
      && Object.values(fieldProvenance).some((field) => field?.source === "ocr"),
  );
  return Boolean(
    problemSet.source === "ocr"
      || recognitionStatuses.has(problemSet.recognitionStatus)
      || confirmationStatuses.has(problemSet.status)
      || problemSet.terminalCode === "ocr_unconfirmed"
      || problemSet.items?.some((item) => (
        item.source === "ocr"
        || recognitionStatuses.has(item.recognitionStatus)
        || confirmationStatuses.has(item.status)
        || item.terminalCode === "ocr_unconfirmed"
        || provenanceUsesOcr(item.fieldProvenance)
        || isOcrProblemInput(item.legacyProblemInput)
      )),
  );
}

function normalizeInput(input = {}) {
  const requestedSource = cleanText(input.source);
  const trustedOcrConfirmation = input.ocrConfirmed === true;
  const problemSet = normalizedProblemSet(
    input.problemSet,
    requestedSource || "manual",
    trustedOcrConfirmation,
  );
  const singleProblem = problemSet?.items?.length === 1 ? problemSet.items[0] : null;
  const problemInput = singleProblem?.legacyProblemInput ?? normalizedStructuredInput(
    input.problemInput,
    requestedSource || problemSet?.source || "manual",
  );
  const question = problemInput?.formulaText
    || cleanText(input.question)
    || cleanText(problemSet?.items?.[0]?.formulaText);
  if (!question) throw new TypeError("問題文が空です。");
  const source = requestedSource || problemSet?.source || problemInput?.source || "manual";
  const ocrUsed = (
    source === "ocr"
    || input.ocrUsed === true
    || isOcrProblemSet(problemSet)
    || isOcrProblemInput(problemInput)
  );
  return Object.freeze({
    question,
    problemInput,
    problemSet,
    source,
    parentHistoryId: cleanText(input.parentHistoryId) || null,
    ocrUsed,
    ocrConfirmed: ocrUsed && trustedOcrConfirmation,
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

function sameTextArray(left, right) {
  if (left === right) return true;
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function sameFieldProvenance(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  return ["questionLabel", "instructionText", "formulaText", "conditions"].every((field) => (
    left[field]?.source === right[field]?.source
      && left[field]?.structure === right[field]?.structure
  ));
}

function sameStructuredProblem(left, right) {
  if (left === right) return true;
  if (!left || !right) return false;
  const fields = [
    "schemaVersion",
    "id",
    "order",
    "status",
    "terminalCode",
    "error",
    "questionLabel",
    "instructionText",
    "instructionIntent",
    "formulaText",
    "source",
    "recognitionStatus",
    "confirmationRequired",
  ];
  return fields.every((field) => left[field] === right[field])
    && sameTextArray(left.conditions, right.conditions)
    && sameTextArray(left.acquisitionWarnings, right.acquisitionWarnings)
    && sameTextArray(left.warnings, right.warnings)
    && sameFieldProvenance(left.fieldProvenance, right.fieldProvenance)
    && sameProblemInput(left.legacyProblemInput, right.legacyProblemInput);
}

function sameProblemSet(left, right) {
  if (left === right) return true;
  if (!left || !right || left.items?.length !== right.items?.length) return false;
  const fields = [
    "schemaVersion",
    "status",
    "terminalCode",
    "error",
    "sharedInstructionText",
    "sharedInstructionIntent",
    "source",
    "recognitionStatus",
    "confirmationRequired",
  ];
  return fields.every((field) => left[field] === right[field])
    && sameTextArray(left.warnings, right.warnings)
    && sameTextArray(left.acquisitionWarnings, right.acquisitionWarnings)
    && left.items.every((item, index) => sameStructuredProblem(item, right.items[index]));
}

function sameInput(left, right) {
  return Boolean(
    left
      && right
      && left.question === right.question
      && sameProblemInput(left.problemInput, right.problemInput)
      && sameProblemSet(left.problemSet, right.problemSet)
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
    this._inputRevision = 0;
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
    this._inputRevision += 1;
    this._input = null;
    this._baseWorkflow = null;
    this._historyId = null;
    this._learningMode = null;
    this._viewedModes = [];
  }

  setInput(input) {
    const normalized = normalizeInput(input);
    if (sameInput(this._input, normalized)) return false;
    this._inputRevision += 1;
    this._input = normalized;
    this._baseWorkflow = null;
    this._historyId = null;
    this._learningMode = null;
    this._viewedModes = [];
    return true;
  }

  _isCurrentInput(input, revision) {
    return this._input === input && this._inputRevision === revision;
  }

  _assertCurrentInput(input, revision) {
    if (this._isCurrentInput(input, revision)) return;
    const error = new Error("解析中に入力が変更されたため、古い結果を破棄しました。");
    error.name = "LearningSessionError";
    error.code = "STALE_INPUT_RESULT";
    throw error;
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
    const inputSnapshot = this._input;
    const inputRevision = this._inputRevision;
    if (inputSnapshot.ocrUsed && !inputSnapshot.ocrConfirmed) {
      const error = new Error("画像から読み取った問題文を確認してから解析してください。");
      error.name = "LearningSessionError";
      error.code = "OCR_CONFIRMATION_REQUIRED";
      throw error;
    }
    if (!this._baseWorkflow) {
      const workflow = await this._solve(
        inputSnapshot.problemSet ?? inputSnapshot.problemInput ?? inputSnapshot.question,
        {
          mode,
          symbolicOperations,
          ocrConfirmed: inputSnapshot.ocrConfirmed,
        },
      );
      this._assertCurrentInput(inputSnapshot, inputRevision);
      if (workflow?.solverResult?.retryable !== true) {
        this._baseWorkflow = workflow;
      }
      return Object.freeze({
        workflow,
        solvedFresh: true,
        inputSnapshot,
        inputRevision,
      });
    }
    if (!this._baseWorkflow.presentable) {
      return Object.freeze({
        workflow: this._baseWorkflow,
        solvedFresh: false,
        inputSnapshot,
        inputRevision,
      });
    }
    return Object.freeze({
      workflow: this._present(this._baseWorkflow, mode),
      solvedFresh: false,
      inputSnapshot,
      inputRevision,
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
    const {
      workflow,
      solvedFresh,
      inputSnapshot,
      inputRevision,
    } = await this._workflowForMode(mode, symbolicOperations);
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
      const viewedModes = isNewView
        ? [...this._viewedModes, workflow.outputMode]
        : [...this._viewedModes];
      if (isNewView) this._viewedModes = viewedModes;
      let historyStillCurrent = this._isCurrentInput(inputSnapshot, inputRevision);
      try {
        const existingHistoryId = this._historyId;
        if (historyStillCurrent && existingHistoryId && isNewView) {
          historyRecord = await this._recordView(existingHistoryId, workflow.outputMode, {
            output: workflow.presentation.content,
          });
          historyStillCurrent = this._isCurrentInput(inputSnapshot, inputRevision);
          if (historyStillCurrent && !historyRecord) this._historyId = null;
        }
        if (historyStillCurrent && !this._historyId) {
          const historyPayload = createHistoryRecordPayload(workflow, {
            source: inputSnapshot.source,
            parentHistoryId: inputSnapshot.parentHistoryId,
            selfAssessment: selfAssessment ?? defaultAssessment(workflow.outputMode),
            additionalFields: {
              learningMode: "study",
              entryPoint: inputSnapshot.source === "review" ? "review" : "popup",
              usage: { viewedModes },
              ocrUsed: inputSnapshot.ocrUsed,
              ocrConfirmed: inputSnapshot.ocrConfirmed,
            },
          });
          const solvedProblemInput = workflow.problemInput ?? inputSnapshot.problemInput;
          historyRecord = await this._addHistory(solvedProblemInput
            ? { ...historyPayload, problemInput: solvedProblemInput }
            : historyPayload);
          historyStillCurrent = this._isCurrentInput(inputSnapshot, inputRevision);
          if (historyStillCurrent) this._historyId = historyRecord?.id || null;
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
