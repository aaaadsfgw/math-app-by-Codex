import { normalizeProblemInput } from "./problem-input.js";

export const STRUCTURED_PROBLEM_SCHEMA_VERSION = 1;
export const STRUCTURED_PROBLEM_SET_SCHEMA_VERSION = 1;

const TERMINAL_ACQUISITION_STATUSES = new Set([
  "invalid",
  "unsupported",
  "conflict",
  "ambiguous",
  "ambiguous_structure",
  "recognition_error",
  "unconfirmed",
  "pending_confirmation",
]);

const RECOGNITION_STATUSES = new Set([
  "not_applicable",
  "candidate",
  "confirmed",
  "recognition_error",
]);

const AMBIGUOUS_STRUCTURE_MESSAGE =
  "指数情報が失われた可能性があります。^2 または *2 を明示してください。ページから取得またはOCRも利用できます。";

function cleanText(value) {
  return String(value ?? "").trim();
}

function cleanWarnings(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((warning) => cleanText(warning))
    .filter(Boolean)
    .slice(0, 16);
}

function normalizedRecognitionStatus(value, sourceRecord) {
  if (RECOGNITION_STATUSES.has(value)) return value;
  if (sourceRecord?.status === "unconfirmed" || sourceRecord?.confirmationRequired === true) {
    return "candidate";
  }
  if (sourceRecord?.recognitionStatus === "confirmed" || sourceRecord?.ocrConfirmed === true) {
    return "confirmed";
  }
  return "not_applicable";
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value ?? "")) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, "0");
}

function stableProblemId(problemInput, order) {
  const basis = [
    problemInput.source,
    order,
    problemInput.questionLabel,
    problemInput.instructionText,
    problemInput.formulaText,
    ...problemInput.conditions,
  ].join("\u241f");
  return `problem-${order}-${stableHash(basis)}`;
}

function normalizedFieldProvenance(problemInput, formulaStructure) {
  const source = cleanText(problemInput.source) || "manual";
  const instructionSource = cleanText(problemInput.instructionSource) || "none";
  const formulaSource = cleanText(problemInput.formulaSource) || source;
  return Object.freeze({
    questionLabel: Object.freeze({
      source: problemInput.questionLabel ? source : "none",
      structure: "plain",
    }),
    instructionText: Object.freeze({
      source: problemInput.instructionText ? instructionSource : "none",
      structure: "plain",
    }),
    formulaText: Object.freeze({
      source: problemInput.formulaText ? formulaSource : "none",
      structure: formulaStructure,
    }),
    conditions: Object.freeze({
      source: problemInput.conditions.length ? source : "none",
      structure: "plain",
    }),
  });
}

/**
 * Detects plain-text forms whose mathematical structure may have been lost in
 * copy/paste. This intentionally does not repair the text: ambiguous input is
 * terminal until the user supplies explicit syntax or a structured source does.
 */
export function inspectFormulaSafety(formulaValue) {
  const formulaText = cleanText(formulaValue);
  if (!formulaText) {
    return Object.freeze({ safe: true, code: null, message: "" });
  }

  const comparable = formulaText.normalize("NFKC");
  const closingGroupFollowedByDigits = /[\)\]\}]\s*\d+/u;
  // Treat a single variable-like symbol followed by digits as ambiguous, while
  // leaving multi-letter function names such as log10(...) alone.
  const variableFollowedByDigits = /(?<![A-Za-z])(?:[A-Za-z])\s*\d+/u;

  if (closingGroupFollowedByDigits.test(comparable) || variableFollowedByDigits.test(comparable)) {
    return Object.freeze({
      safe: false,
      code: "ambiguous_structure",
      message: AMBIGUOUS_STRUCTURE_MESSAGE,
    });
  }

  return Object.freeze({ safe: true, code: null, message: "" });
}

function problemSeed(value, source) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  if (value.legacyProblemInput && typeof value.legacyProblemInput === "object") {
    return value.legacyProblemInput;
  }
  if (value.structuredCandidate && typeof value.structuredCandidate === "object") {
    const candidate = value.structuredCandidate;
    return {
      rawText: cleanText(value.rawText) || cleanText(candidate.rawFormulaText) || cleanText(candidate.formulaText),
      questionLabel: candidate.questionLabel,
      instructionText: candidate.instructionText,
      formulaText: candidate.formulaText,
      conditions: candidate.conditions,
      source,
      instructionSource: candidate.instructionSource,
      formulaSource: candidate.formulaSource,
      status: value.status,
      error: value.error,
    };
  }
  return value;
}

function normalizeStructuredProblem(value, {
  order,
  source,
  formulaStructure,
  warnings,
} = {}) {
  const rawStatus = cleanText(value?.status);
  const recognitionStatus = normalizedRecognitionStatus(value?.recognitionStatus, value);
  const legacyProblemInput = normalizeProblemInput(problemSeed(value, source), { source });
  const acquisitionWarnings = cleanWarnings([
    ...cleanWarnings(value?.acquisitionWarnings),
    ...cleanWarnings(value?.warnings),
    ...cleanWarnings(warnings),
  ]);

  let status = legacyProblemInput.status;
  let terminalCode = null;
  let error = legacyProblemInput.error;

  if (TERMINAL_ACQUISITION_STATUSES.has(rawStatus)) {
    status = rawStatus === "ambiguous_structure" ? "ambiguous" : rawStatus;
    terminalCode = rawStatus;
    error = cleanText(value?.error) || error;
  }

  if (recognitionStatus === "candidate" && status === "ready") {
    status = "pending_confirmation";
    terminalCode = "ocr_unconfirmed";
    error = "OCR候補は未確認です。内容を確認してから計算してください。";
  } else if (recognitionStatus === "recognition_error" && status === "ready") {
    status = "recognition_error";
    terminalCode = "recognition_error";
    error = cleanText(value?.error) || "OCR候補を安全に認識できませんでした。";
  }

  if (status === "ready") {
    const safety = inspectFormulaSafety(legacyProblemInput.formulaText);
    if (!safety.safe) {
      status = "ambiguous";
      terminalCode = safety.code;
      error = safety.message;
      acquisitionWarnings.push(safety.message);
    }
  }

  const resolvedOrder = Number.isSafeInteger(order) && order >= 0 ? order : 0;
  const structure = formulaStructure === "semantic" ? "semantic" : "plain";
  const requestedId = cleanText(value?.id);

  return Object.freeze({
    schemaVersion: STRUCTURED_PROBLEM_SCHEMA_VERSION,
    id: requestedId || stableProblemId(legacyProblemInput, resolvedOrder),
    order: resolvedOrder,
    status,
    terminalCode,
    error,
    questionLabel: legacyProblemInput.questionLabel,
    instructionText: legacyProblemInput.instructionText,
    instructionIntent: legacyProblemInput.instructionIntent,
    formulaText: legacyProblemInput.formulaText,
    conditions: Object.freeze([...legacyProblemInput.conditions]),
    source: legacyProblemInput.source,
    fieldProvenance: normalizedFieldProvenance(legacyProblemInput, structure),
    recognitionStatus,
    acquisitionWarnings: Object.freeze(acquisitionWarnings),
    legacyProblemInput,
  });
}

/**
 * Common acquisition boundary. A single problem is represented as a one-item
 * set, while callers may already provide multiple independent items.
 */
export function normalizeStructuredProblemSet(value, {
  source = "manual",
  formulaStructure = "plain",
  warnings = [],
} = {}) {
  const inputSet = value && typeof value === "object" && !Array.isArray(value) && Array.isArray(value.items)
    ? value
    : null;
  const setSource = cleanText(inputSet?.source) || cleanText(value?.source) || source;
  const rawItems = inputSet ? inputSet.items : [value];
  const setWarnings = cleanWarnings([
    ...cleanWarnings(inputSet?.warnings),
    ...cleanWarnings(warnings),
  ]);
  const items = rawItems.map((item, index) => normalizeStructuredProblem(item, {
    order: Number.isSafeInteger(item?.order) && item.order >= 0 ? item.order : index,
    source: cleanText(item?.source) || setSource,
    formulaStructure: cleanText(item?.formulaStructure) || formulaStructure,
    warnings: item?.warnings,
  }));

  const sharedInstructionText = cleanText(
    inputSet?.sharedInstructionText ?? inputSet?.sharedInstruction ?? "",
  );
  const sharedInstructionIntent = cleanText(inputSet?.sharedInstructionIntent) || null;

  return Object.freeze({
    schemaVersion: STRUCTURED_PROBLEM_SET_SCHEMA_VERSION,
    sharedInstructionText,
    sharedInstructionIntent,
    source: setSource,
    items: Object.freeze(items),
    warnings: Object.freeze(setWarnings),
  });
}

export function compileStructuredProblemSet(value, options = {}) {
  const problemSet = normalizeStructuredProblemSet(value, options);
  if (problemSet.items.length !== 1) {
    return Object.freeze({
      ok: false,
      kind: "unsupported",
      error: "複数問題の一括計算はまだ有効化されていません。各問題は独立itemとして保持されています。",
      problemSet,
      problem: null,
      problemInput: null,
    });
  }

  const problem = problemSet.items[0];
  if (problem.status !== "ready") {
    const kind = ["invalid", "conflict", "recognition_error"].includes(problem.status)
      ? "invalid"
      : "unsupported";
    return Object.freeze({
      ok: false,
      kind,
      error: cleanText(problem.error) || "入力を安全に確定できませんでした。",
      problemSet,
      problem,
      problemInput: problem.legacyProblemInput,
    });
  }

  return Object.freeze({
    ok: true,
    kind: "ready",
    error: "",
    problemSet,
    problem,
    problemInput: problem.legacyProblemInput,
  });
}

/**
 * Phase A request shape. Operation resolution itself is intentionally deferred
 * to Phase B; recognized instruction intent is retained as a request signal.
 */
export function createCalculationRequest(problemValue, options = {}) {
  const compiled = compileStructuredProblemSet(problemValue, options);
  const problem = compiled.problem;
  return Object.freeze({
    status: compiled.ok ? "ready_for_operation_resolution" : "terminal",
    terminalCode: problem?.terminalCode ?? null,
    error: compiled.error,
    problemSet: compiled.problemSet,
    problem,
    requestedOperation: problem?.instructionIntent ?? null,
  });
}

export const AMBIGUOUS_FORMULA_STRUCTURE_MESSAGE = AMBIGUOUS_STRUCTURE_MESSAGE;
