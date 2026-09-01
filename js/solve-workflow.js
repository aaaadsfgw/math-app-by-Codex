import { classifyCategory } from "./category-classifier.js";
import { presentSolution, OUTPUT_MODES } from "./solution-presenter.js";
import { solveQuestionAsync } from "./solver/index.js";
import { failedResult } from "./solver/utils.js";

const OUTPUT_MODE_SET = new Set(OUTPUT_MODES);

function cleanText(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  try {
    if (error instanceof Error && cleanText(error.message)) return cleanText(error.message);
    if (["string", "number", "boolean", "bigint"].includes(typeof error)) {
      return cleanText(error);
    }
  } catch {
    // Hostile thrown values must not escape the workflow boundary.
  }
  return "詳細不明の例外";
}

function snapshotQuestion(value) {
  try {
    return Object.freeze({ question: String(value ?? "").trim(), error: null });
  } catch (error) {
    return Object.freeze({ question: "", error });
  }
}

function normalizedOutputMode(value) {
  return OUTPUT_MODE_SET.has(value) ? value : "answer";
}

function presentableSolverResult(result) {
  return Boolean(
    result?.supported
      && result.solved
      && result.verified
      && cleanText(result.answer),
  );
}

function workflowFailure(message) {
  return Object.freeze({
    ...failedResult("solve-workflow", message),
    solverId: "solve-workflow",
  });
}

function workflowResult({
  question,
  outputMode,
  classification,
  solverResult,
  presentation = null,
}) {
  return Object.freeze({
    question,
    outputMode,
    classification,
    solverResult,
    resultKind: cleanText(solverResult?.resultKind) || "invalid",
    presentable: presentation !== null,
    presentation,
  });
}

/**
 * Runs the shared deterministic solve pipeline without reading or writing storage.
 * Unsupported and invalid solver results are returned unchanged and are never
 * passed to the presenter.
 */
export async function solveWorkflow(
  questionValue,
  {
    mode = "answer",
    symbolicOperations,
    solver = solveQuestionAsync,
    classifier = classifyCategory,
    presenter = presentSolution,
  } = {},
) {
  if (typeof solver !== "function") throw new TypeError("solverは関数で指定してください。");
  if (typeof classifier !== "function") throw new TypeError("classifierは関数で指定してください。");
  if (typeof presenter !== "function") throw new TypeError("presenterは関数で指定してください。");

  const snapshot = snapshotQuestion(questionValue);
  const outputMode = normalizedOutputMode(mode);
  if (snapshot.error) {
    return workflowResult({
      question: snapshot.question,
      outputMode,
      classification: null,
      solverResult: workflowFailure(
        `問題文を読み取れませんでした: ${safeErrorMessage(snapshot.error)}`,
      ),
    });
  }

  let classification;
  try {
    classification = classifier(snapshot.question);
  } catch (error) {
    return workflowResult({
      question: snapshot.question,
      outputMode,
      classification: null,
      solverResult: workflowFailure(
        `問題を分類できませんでした: ${safeErrorMessage(error)}`,
      ),
    });
  }

  let solverResult;
  try {
    solverResult = await solver(snapshot.question, {
      category: classification?.primary || "その他",
      symbolicOperations,
    });
  } catch (error) {
    solverResult = workflowFailure(
      `ソルバー処理中にエラーが発生しました: ${safeErrorMessage(error)}`,
    );
  }

  if (!presentableSolverResult(solverResult)) {
    return workflowResult({
      question: snapshot.question,
      outputMode,
      classification,
      solverResult,
    });
  }

  try {
    const presentation = Object.freeze({
      ...presenter(solverResult, {
        mode: outputMode,
        category: classification?.primary || "その他",
      }),
    });
    return workflowResult({
      question: snapshot.question,
      outputMode,
      classification,
      solverResult,
      presentation,
    });
  } catch (error) {
    return workflowResult({
      question: snapshot.question,
      outputMode,
      classification,
      solverResult: workflowFailure(
        `解答表示を構成できませんでした: ${safeErrorMessage(error)}`,
      ),
    });
  }
}

/**
 * Reuses one verified solver result to reveal another learning layer without
 * running the mathematical solver again.
 */
export function presentWorkflowResult(
  solvedWorkflow,
  mode,
  { presenter = presentSolution } = {},
) {
  if (typeof presenter !== "function") throw new TypeError("presenterは関数で指定してください。");
  if (!presentableSolverResult(solvedWorkflow?.solverResult)) {
    throw new TypeError("表示切替には検証済みのsolver結果が必要です。");
  }

  const outputMode = normalizedOutputMode(mode);
  const presentation = Object.freeze({
    ...presenter(solvedWorkflow.solverResult, {
      mode: outputMode,
      category: solvedWorkflow.classification?.primary || "その他",
    }),
  });
  return workflowResult({
    question: cleanText(solvedWorkflow.question),
    outputMode,
    classification: solvedWorkflow.classification,
    solverResult: solvedWorkflow.solverResult,
    presentation,
  });
}

/**
 * Builds the existing storage-compatible history input without persisting it.
 */
export function createHistoryRecordPayload(
  solvedWorkflow,
  {
    source = "manual",
    selfAssessment,
    parentHistoryId = null,
    additionalFields = {},
  } = {},
) {
  if (!solvedWorkflow?.presentable || !solvedWorkflow.presentation) {
    throw new TypeError("履歴payloadには表示可能な検証済み結果が必要です。");
  }
  if (additionalFields === null || typeof additionalFields !== "object" || Array.isArray(additionalFields)) {
    throw new TypeError("additionalFieldsはオブジェクトで指定してください。");
  }

  const result = solvedWorkflow.solverResult;
  const payload = {
    ...additionalFields,
    question: solvedWorkflow.question,
    mode: solvedWorkflow.outputMode,
    output: solvedWorkflow.presentation.content,
    finalAnswer: solvedWorkflow.presentation.finalAnswer,
    category: solvedWorkflow.classification,
    solverId: result.solverId || null,
    verified: true,
    verificationType: "solver",
    verificationMessage: cleanText(result.verification),
    resultKind: cleanText(result.resultKind) || "exact",
    conditions: Array.isArray(result.conditions) ? [...result.conditions] : [],
    solutionTrace: Array.isArray(result.solutionTrace)
      ? result.solutionTrace.map((step) => ({ ...step }))
      : [],
    solutionSet: result.solutionSet || null,
    source: cleanText(source) || "manual",
    parentHistoryId: cleanText(parentHistoryId) || null,
  };
  if (selfAssessment !== undefined) payload.selfAssessment = selfAssessment;
  return Object.freeze(payload);
}

export const runSolveWorkflow = solveWorkflow;
export const createHistoryPayload = createHistoryRecordPayload;
