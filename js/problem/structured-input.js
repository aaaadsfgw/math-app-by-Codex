import { normalizeMathNotation } from "../math-core/notation.js";
import {
  compileProblemInput,
  normalizeProblemInput,
} from "./problem-input.js";

export const STRUCTURED_PROBLEM_SCHEMA_VERSION = 1;
export const STRUCTURED_PROBLEM_SET_SCHEMA_VERSION = 1;

const MAX_STRUCTURED_ITEMS = 64;
const MAX_STRUCTURED_ID_CHARACTERS = 128;
const MAX_SHARED_INSTRUCTION_CHARACTERS = 1_000;

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
const OCR_CONFIRMATION_MESSAGE =
  "OCR候補は未確認です。内容を確認してから計算してください。";
const INVALID_STRUCTURED_INPUT_MESSAGE =
  "構造化入力を安全に読み取れませんでした。";

function cleanText(value) {
  return String(value ?? "").trim();
}

function safeErrorMessage(error) {
  try {
    if (error instanceof Error && cleanText(error.message)) {
      return cleanText(error.message).slice(0, 500);
    }
  } catch {
    // Hostile error values stay inside the acquisition boundary.
  }
  return "";
}

function cleanWarnings(value) {
  if (!Array.isArray(value)) return [];
  const warnings = value
    .slice(0, 16)
    .map((warning) => cleanText(warning))
    .filter(Boolean);
  return [...new Set(warnings)];
}

function snapshot(value, names) {
  const fields = {};
  for (const name of names) fields[name] = value?.[name];
  return fields;
}

function hasOwn(value, name) {
  return Boolean(value && typeof value === "object" && Object.hasOwn(value, name));
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

function validRequestedId(value) {
  const id = cleanText(value);
  return id.length <= MAX_STRUCTURED_ID_CHARACTERS
    && /^[A-Za-z0-9._:-]+$/u.test(id)
    ? id
    : "";
}

function normalizedFieldProvenance(problemInput, requested, formulaStructure) {
  const source = cleanText(problemInput.source) || "manual";
  const instructionSource = cleanText(problemInput.instructionSource) || "none";
  const formulaSource = cleanText(problemInput.formulaSource) || source;
  const requestedFields = requested && typeof requested === "object" ? requested : {};
  const requestedFormula = requestedFields.formulaText;
  const requestedStructure = cleanText(requestedFormula?.structure);
  const structure = requestedStructure === "semantic" || formulaStructure === "semantic"
    ? "semantic"
    : "plain";

  return Object.freeze({
    questionLabel: Object.freeze({
      source: cleanText(requestedFields.questionLabel?.source)
        || (problemInput.questionLabel ? source : "none"),
      structure: "plain",
    }),
    instructionText: Object.freeze({
      source: cleanText(requestedFields.instructionText?.source)
        || (problemInput.instructionText ? instructionSource : "none"),
      structure: "plain",
    }),
    formulaText: Object.freeze({
      source: cleanText(requestedFormula?.source)
        || (problemInput.formulaText ? formulaSource : "none"),
      structure,
    }),
    conditions: Object.freeze({
      source: cleanText(requestedFields.conditions?.source)
        || (problemInput.conditions.length ? source : "none"),
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
  let formulaText;
  try {
    formulaText = cleanText(formulaValue);
  } catch {
    return Object.freeze({
      safe: false,
      code: "invalid",
      message: INVALID_STRUCTURED_INPUT_MESSAGE,
    });
  }
  if (!formulaText) {
    return Object.freeze({ safe: true, code: null, message: "" });
  }

  // normalizeMathNotation expands Unicode superscripts before NFKC. This keeps
  // x² and (x-3)² distinguishable from structure-losing x2 and (x-3)2.
  const comparable = normalizeMathNotation(formulaText);
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

function legacyProblemInputShape(value) {
  return hasOwn(value, "instructionStatus")
    && hasOwn(value, "rawText")
    && !hasOwn(value, "legacyProblemInput")
    && !hasOwn(value, "fieldProvenance");
}

function canonicalSeed(value, fallbackSource) {
  if (typeof value === "string") {
    return Object.freeze({
      seed: value,
      fields: {},
      legacyProblemInput: null,
      failureSource: "structured-input",
      formulaStructure: "plain",
    });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.freeze({
      seed: value,
      fields: {},
      legacyProblemInput: null,
      failureSource: "structured-input",
      formulaStructure: "plain",
    });
  }

  const fields = snapshot(value, [
    "schemaVersion",
    "id",
    "status",
    "terminalCode",
    "error",
    "rawText",
    "questionLabel",
    "instructionText",
    "instructionIntent",
    "instructionStatus",
    "formulaText",
    "question",
    "conditions",
    "source",
    "instructionSource",
    "formulaSource",
    "fieldProvenance",
    "recognitionStatus",
    "confirmationRequired",
    "ocrConfirmed",
    "acquisitionWarnings",
    "warnings",
    "formulaStructure",
    "legacyProblemInput",
    "structuredCandidate",
    "failureSource",
  ]);
  const hasKnownInputField = [
    "schemaVersion",
    "status",
    "rawText",
    "questionLabel",
    "instructionText",
    "instructionIntent",
    "formulaText",
    "question",
    "conditions",
    "source",
    "legacyProblemInput",
    "structuredCandidate",
    "fieldProvenance",
    "recognitionStatus",
  ].some((name) => hasOwn(value, name));
  if (!hasKnownInputField) {
    return Object.freeze({
      seed: value,
      fields,
      legacyProblemInput: null,
      failureSource: "structured-input",
      formulaStructure: "plain",
    });
  }
  const legacy = fields.legacyProblemInput && typeof fields.legacyProblemInput === "object"
    ? fields.legacyProblemInput
    : null;
  const candidate = fields.structuredCandidate && typeof fields.structuredCandidate === "object"
    ? snapshot(fields.structuredCandidate, [
        "rawFormulaText",
        "formulaText",
        "questionLabel",
        "instructionText",
        "instructionIntent",
        "conditions",
        "instructionSource",
        "formulaSource",
      ])
    : null;
  const canonical = (name, candidateName = name) => {
    if (hasOwn(value, name)) return fields[name];
    if (candidate && hasOwn(fields.structuredCandidate, candidateName)) return candidate[candidateName];
    return legacy?.[name];
  };
  const rawStatus = canonical("status");
  const seedStatus = ["unsupported", "invalid", "conflict"].includes(rawStatus)
    ? rawStatus
    : undefined;
  const seed = {
    rawText: canonical("rawText", "rawFormulaText"),
    questionLabel: canonical("questionLabel"),
    instructionText: canonical("instructionText"),
    instructionIntent: canonical("instructionIntent"),
    formulaText: canonical("formulaText"),
    question: canonical("question"),
    conditions: canonical("conditions"),
    source: canonical("source") ?? fallbackSource,
    instructionSource: canonical("instructionSource")
      ?? fields.fieldProvenance?.instructionText?.source,
    formulaSource: canonical("formulaSource")
      ?? fields.fieldProvenance?.formulaText?.source,
    status: seedStatus,
    error: canonical("error"),
  };
  if (legacy && hasOwn(legacy, "schemaVersion")) {
    seed.schemaVersion = legacy.schemaVersion;
  } else if (hasOwn(value, "schemaVersion")) {
    seed.schemaVersion = fields.schemaVersion;
  }

  const canonicalFormula = hasOwn(value, "formulaText") ? fields.formulaText : undefined;
  const formulaChanged = legacy && canonicalFormula !== undefined
    && cleanText(canonicalFormula) !== cleanText(legacy.formulaText);
  const canonicalInstruction = hasOwn(value, "instructionText")
    ? fields.instructionText
    : undefined;
  const instructionChanged = legacy && canonicalInstruction !== undefined
    && cleanText(canonicalInstruction) !== cleanText(legacy.instructionText);
  if (formulaChanged) seed.formulaSource = "manual";
  if (instructionChanged) seed.instructionSource = "manual";
  const formulaStructure = formulaChanged
    ? "plain"
    : cleanText(fields.fieldProvenance?.formulaText?.structure)
      || cleanText(fields.formulaStructure)
      || "plain";
  const legacyOrigin = legacyProblemInputShape(value)
    || (!hasOwn(value, "formulaText") && Boolean(legacy));
  const preservedFailureSource = fields.failureSource === "problem-input"
    ? "problem-input"
    : "structured-input";

  return Object.freeze({
    seed,
    fields,
    legacyProblemInput: legacy,
    failureSource: legacyOrigin ? "problem-input" : preservedFailureSource,
    formulaStructure,
  });
}

function recognitionState({
  fields,
  source,
  formulaSource,
  instructionSource,
  inheritedRecognitionStatus,
  inheritedConfirmationRequired,
  inheritedOcrOrigin,
  ocrConfirmed,
}) {
  const itemRecognitionStatus = RECOGNITION_STATUSES.has(fields.recognitionStatus)
    ? fields.recognitionStatus
    : "not_applicable";
  const inheritedStatus = RECOGNITION_STATUSES.has(inheritedRecognitionStatus)
    ? inheritedRecognitionStatus
    : "not_applicable";
  if (
    itemRecognitionStatus === "recognition_error"
    || inheritedStatus === "recognition_error"
  ) {
    return "recognition_error";
  }

  const rawStatus = cleanText(fields.status);
  const confirmationRequired = fields.confirmationRequired === true
    || inheritedConfirmationRequired === true
    || rawStatus === "unconfirmed"
    || rawStatus === "pending_confirmation";
  const provenance = fields.fieldProvenance;
  const ocrOrigin = inheritedOcrOrigin === true
    || cleanText(source) === "ocr"
    || cleanText(formulaSource) === "ocr"
    || cleanText(instructionSource) === "ocr"
    || cleanText(provenance?.formulaText?.source) === "ocr"
    || cleanText(provenance?.instructionText?.source) === "ocr";
  const hasRecognitionClaim = [itemRecognitionStatus, inheritedStatus]
    .some((status) => status === "candidate" || status === "confirmed");
  const confirmationContext = confirmationRequired || ocrOrigin || hasRecognitionClaim;

  if (!confirmationContext) return "not_applicable";
  return ocrConfirmed === true ? "confirmed" : "candidate";
}

function normalizeStructuredProblem(value, options) {
  const {
    order,
    source,
    formulaStructure,
    warnings,
    inheritedRecognitionStatus,
    inheritedConfirmationRequired,
    inheritedOcrOrigin,
    ocrConfirmed,
  } = options;
  const canonical = canonicalSeed(value, source);
  const { fields } = canonical;
  const looksStructured = hasOwn(value, "legacyProblemInput")
    || hasOwn(value, "structuredCandidate")
    || hasOwn(value, "fieldProvenance")
    || hasOwn(value, "terminalCode")
    || hasOwn(value, "recognitionStatus")
    || hasOwn(value, "id");
  const invalidItemSchema = looksStructured
    && hasOwn(value, "schemaVersion")
    && fields.schemaVersion !== STRUCTURED_PROBLEM_SCHEMA_VERSION;
  const legacyProblemInput = normalizeProblemInput(canonical.seed, { source });
  const acquisitionWarnings = cleanWarnings([
    ...cleanWarnings(fields.acquisitionWarnings),
    ...cleanWarnings(fields.warnings),
    ...cleanWarnings(warnings),
  ]);
  const rawStatus = cleanText(fields.status);
  const recognitionStatus = recognitionState({
    fields,
    source: legacyProblemInput.source,
    formulaSource: legacyProblemInput.formulaSource,
    instructionSource: legacyProblemInput.instructionSource,
    inheritedRecognitionStatus,
    inheritedConfirmationRequired,
    inheritedOcrOrigin,
    ocrConfirmed,
  });

  let status = legacyProblemInput.status;
  let terminalCode = cleanText(fields.terminalCode) || null;
  let error = legacyProblemInput.error;
  let failureSource = canonical.failureSource;

  if (invalidItemSchema) {
    status = "invalid";
    terminalCode = "unsupported_schema_version";
    error = "未対応のStructuredProblem schemaVersionです。";
    failureSource = "structured-input";
  } else if (
    fields.recognitionStatus !== undefined
    && fields.recognitionStatus !== null
    && fields.recognitionStatus !== ""
    && !RECOGNITION_STATUSES.has(fields.recognitionStatus)
  ) {
    status = "invalid";
    terminalCode = "invalid_recognition_status";
    error = "StructuredProblemのrecognitionStatusが不正です。";
    failureSource = "structured-input";
  } else if (
    fields.confirmationRequired !== undefined
    && typeof fields.confirmationRequired !== "boolean"
  ) {
    status = "invalid";
    terminalCode = "invalid_confirmation_state";
    error = "StructuredProblemのconfirmationRequiredが不正です。";
    failureSource = "structured-input";
  } else if (TERMINAL_ACQUISITION_STATUSES.has(rawStatus)) {
    const confirmationTerminal = rawStatus === "unconfirmed"
      || rawStatus === "pending_confirmation";
    if (confirmationTerminal && ocrConfirmed === true) {
      terminalCode = null;
      error = legacyProblemInput.error;
    } else {
      status = rawStatus === "ambiguous_structure" ? "ambiguous" : rawStatus;
      terminalCode ||= rawStatus;
      error = cleanText(fields.error) || error;
    }
  } else if (rawStatus && rawStatus !== "ready") {
    status = "invalid";
    terminalCode = "invalid_status";
    error = "StructuredProblemのstatusが不正です。";
    failureSource = "structured-input";
  }

  if (recognitionStatus === "candidate" && status === "ready") {
    status = "pending_confirmation";
    terminalCode = "ocr_unconfirmed";
    error = OCR_CONFIRMATION_MESSAGE;
    failureSource = "structured-input";
  } else if (recognitionStatus === "recognition_error" && status === "ready") {
    status = "recognition_error";
    terminalCode = "recognition_error";
    error = cleanText(fields.error) || "OCR候補を安全に認識できませんでした。";
    failureSource = "structured-input";
  }

  if (status === "ready") {
    const safety = inspectFormulaSafety(legacyProblemInput.formulaText);
    if (!safety.safe) {
      status = safety.code === "invalid" ? "invalid" : "ambiguous";
      terminalCode = safety.code;
      error = safety.message;
      acquisitionWarnings.push(safety.message);
      failureSource = "structured-input";
    }
  }

  const resolvedOrder = Number.isSafeInteger(order) && order >= 0 ? order : 0;
  const requestedId = validRequestedId(fields.id);
  const requestedProvenance = canonical.legacyProblemInput
    && cleanText(canonical.seed.formulaText) !== cleanText(canonical.legacyProblemInput.formulaText)
    ? null
    : fields.fieldProvenance;
  const structure = canonical.formulaStructure === "semantic" || formulaStructure === "semantic"
    ? "semantic"
    : "plain";
  const fieldProvenance = normalizedFieldProvenance(
    legacyProblemInput,
    requestedProvenance,
    structure,
  );

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
    fieldProvenance,
    recognitionStatus,
    confirmationRequired: recognitionStatus === "candidate",
    acquisitionWarnings: Object.freeze([...new Set(acquisitionWarnings)]),
    failureSource,
    legacyProblemInput,
  });
}

function invalidProblemSet(error = INVALID_STRUCTURED_INPUT_MESSAGE) {
  const legacyProblemInput = normalizeProblemInput({
    formulaText: "?",
    status: "invalid",
    error,
    source: "manual",
  });
  const problem = Object.freeze({
    schemaVersion: STRUCTURED_PROBLEM_SCHEMA_VERSION,
    id: stableProblemId(legacyProblemInput, 0),
    order: 0,
    status: "invalid",
    terminalCode: "invalid_structured_input",
    error,
    questionLabel: "",
    instructionText: "",
    instructionIntent: null,
    formulaText: legacyProblemInput.formulaText,
    conditions: Object.freeze([]),
    source: legacyProblemInput.source,
    fieldProvenance: normalizedFieldProvenance(legacyProblemInput, null, "plain"),
    recognitionStatus: "not_applicable",
    confirmationRequired: false,
    acquisitionWarnings: Object.freeze([]),
    failureSource: "structured-input",
    legacyProblemInput,
  });
  return Object.freeze({
    schemaVersion: STRUCTURED_PROBLEM_SET_SCHEMA_VERSION,
    status: "invalid",
    terminalCode: "invalid_structured_input",
    error,
    recognitionStatus: "not_applicable",
    confirmationRequired: false,
    sharedInstructionText: "",
    sharedInstructionIntent: null,
    source: "manual",
    items: Object.freeze([problem]),
    warnings: Object.freeze([]),
    failureSource: "structured-input",
  });
}

function normalizeSet(value, rawOptions) {
  const optionFields = rawOptions && typeof rawOptions === "object"
    ? snapshot(rawOptions, ["source", "formulaStructure", "warnings", "ocrConfirmed"])
    : {};
  const sourceOption = cleanText(optionFields.source) || "manual";
  const optionSourceSupplied = rawOptions && typeof rawOptions === "object"
    && hasOwn(rawOptions, "source")
    && cleanText(optionFields.source) !== "";
  const formulaStructure = cleanText(optionFields.formulaStructure) === "semantic"
    ? "semantic"
    : "plain";
  const optionWarnings = cleanWarnings(optionFields.warnings);
  const ocrConfirmed = optionFields.ocrConfirmed === true;

  const objectValue = value && typeof value === "object" && !Array.isArray(value)
    ? value
    : null;
  const hasItems = objectValue ? hasOwn(objectValue, "items") : false;
  if (hasItems && !Array.isArray(objectValue.items)) {
    return invalidProblemSet("StructuredProblemSetのitemsは配列で指定してください。");
  }
  const inputSet = hasItems ? objectValue : null;
  const setFields = inputSet
    ? snapshot(inputSet, [
        "schemaVersion",
        "status",
        "terminalCode",
        "error",
        "recognitionStatus",
        "confirmationRequired",
        "source",
        "items",
        "warnings",
        "sharedInstructionText",
        "sharedInstruction",
        "sharedInstructionIntent",
        "failureSource",
      ])
    : {};
  if (
    inputSet
    && hasOwn(inputSet, "schemaVersion")
    && setFields.schemaVersion !== STRUCTURED_PROBLEM_SET_SCHEMA_VERSION
  ) {
    return invalidProblemSet("未対応のStructuredProblemSet schemaVersionです。");
  }
  if (
    inputSet
    && setFields.recognitionStatus !== undefined
    && setFields.recognitionStatus !== null
    && setFields.recognitionStatus !== ""
    && !RECOGNITION_STATUSES.has(setFields.recognitionStatus)
  ) {
    return invalidProblemSet("StructuredProblemSetのrecognitionStatusが不正です。");
  }
  if (
    inputSet
    && setFields.confirmationRequired !== undefined
    && typeof setFields.confirmationRequired !== "boolean"
  ) {
    return invalidProblemSet("StructuredProblemSetのconfirmationRequiredが不正です。");
  }

  const setSource = cleanText(setFields.source)
    || cleanText(objectValue?.source)
    || sourceOption;
  const rawItems = inputSet ? setFields.items : [value];
  if (rawItems.length === 0) {
    return invalidProblemSet("StructuredProblemSetに問題がありません。");
  }
  if (rawItems.length > MAX_STRUCTURED_ITEMS) {
    return invalidProblemSet("StructuredProblemSetの問題数が上限を超えています。");
  }
  for (let index = 0; index < rawItems.length; index += 1) {
    if (!(index in rawItems)) {
      return invalidProblemSet("StructuredProblemSetのitemsに欠損があります。");
    }
  }

  const setWarnings = cleanWarnings([
    ...cleanWarnings(setFields.warnings),
    ...optionWarnings,
  ]);
  const sharedInstructionText = cleanText(
    setFields.sharedInstructionText ?? setFields.sharedInstruction ?? "",
  );
  if (sharedInstructionText.length > MAX_SHARED_INSTRUCTION_CHARACTERS) {
    return invalidProblemSet("共通の指示文が長すぎます。");
  }
  const sharedInstructionIntent = cleanText(setFields.sharedInstructionIntent) || null;
  const outerRecognitionStatus = RECOGNITION_STATUSES.has(setFields.recognitionStatus)
    ? setFields.recognitionStatus
    : "not_applicable";
  const outerConfirmationRequired = setFields.confirmationRequired === true
    || setFields.status === "unconfirmed"
    || setFields.status === "pending_confirmation";

  const usedIds = new Set();
  const items = [];
  for (let index = 0; index < rawItems.length; index += 1) {
    const rawItem = rawItems[index];
    let item = normalizeStructuredProblem(rawItem, {
      order: index,
      source: cleanText(rawItem?.source) || setSource,
      formulaStructure,
      warnings: rawItem?.warnings,
      inheritedRecognitionStatus: outerRecognitionStatus,
      inheritedConfirmationRequired: outerConfirmationRequired,
      inheritedOcrOrigin: setSource === "ocr"
        || (optionSourceSupplied && sourceOption === "ocr"),
      ocrConfirmed,
    });
    if (usedIds.has(item.id)) {
      let replacementId = stableProblemId(item.legacyProblemInput, index);
      while (usedIds.has(replacementId)) replacementId = `${replacementId}-${index}`;
      item = Object.freeze({ ...item, id: replacementId });
    }
    usedIds.add(item.id);
    items.push(item);
  }

  const rawSetStatus = cleanText(setFields.status);
  let status = "ready";
  let terminalCode = cleanText(setFields.terminalCode) || null;
  let error = cleanText(setFields.error);
  let failureSource = setFields.failureSource === "problem-input"
    && items.length === 1
    && items[0].failureSource === "problem-input"
    ? "problem-input"
    : "structured-input";
  if (TERMINAL_ACQUISITION_STATUSES.has(rawSetStatus)) {
    const confirmationTerminal = rawSetStatus === "unconfirmed"
      || rawSetStatus === "pending_confirmation";
    if (confirmationTerminal && ocrConfirmed) {
      terminalCode = null;
      error = "";
    } else {
      status = rawSetStatus === "ambiguous_structure" ? "ambiguous" : rawSetStatus;
      terminalCode ||= rawSetStatus;
    }
  } else if (rawSetStatus && rawSetStatus !== "ready") {
    status = "invalid";
    terminalCode = "invalid_status";
    error = "StructuredProblemSetのstatusが不正です。";
  }

  let recognitionStatus = outerRecognitionStatus;
  if (items.some((item) => item.recognitionStatus === "recognition_error")) {
    recognitionStatus = "recognition_error";
  } else if (items.some((item) => item.recognitionStatus === "candidate")) {
    recognitionStatus = "candidate";
  } else if (items.some((item) => item.recognitionStatus === "confirmed")) {
    recognitionStatus = "confirmed";
  }
  if (status === "ready") {
    const terminalItem = items.find((item) => item.status !== "ready");
    if (terminalItem) {
      status = terminalItem.status;
      terminalCode = terminalItem.terminalCode;
      error = terminalItem.error;
      failureSource = terminalItem.failureSource;
    }
  }
  if (status === "ready" && recognitionStatus === "candidate") {
    status = "pending_confirmation";
    terminalCode = "ocr_unconfirmed";
    error = OCR_CONFIRMATION_MESSAGE;
    failureSource = "structured-input";
  } else if (status === "ready" && recognitionStatus === "recognition_error") {
    status = "recognition_error";
    terminalCode = "recognition_error";
    error ||= "OCR候補を安全に認識できませんでした。";
    failureSource = "structured-input";
  }
  if (!error && status !== "ready") {
    error = recognitionStatus === "candidate"
      ? OCR_CONFIRMATION_MESSAGE
      : "入力を安全に確定できませんでした。";
  }

  return Object.freeze({
    schemaVersion: STRUCTURED_PROBLEM_SET_SCHEMA_VERSION,
    status,
    terminalCode,
    error,
    recognitionStatus,
    confirmationRequired: recognitionStatus === "candidate",
    sharedInstructionText,
    sharedInstructionIntent,
    source: setSource,
    items: Object.freeze(items),
    warnings: Object.freeze(setWarnings),
    failureSource,
  });
}

/**
 * Common acquisition boundary. A single problem is represented as a one-item
 * set, while callers may already provide multiple independent items.
 */
export function normalizeStructuredProblemSet(value, options = {}) {
  try {
    return normalizeSet(value, options);
  } catch (error) {
    const detail = safeErrorMessage(error);
    return invalidProblemSet(
      detail ? `${INVALID_STRUCTURED_INPUT_MESSAGE}: ${detail}` : INVALID_STRUCTURED_INPUT_MESSAGE,
    );
  }
}

function compilationFailure({
  kind,
  error,
  problemSet,
  problem = null,
  problemInput = null,
  failureSource = "structured-input",
}) {
  return Object.freeze({
    ok: false,
    kind,
    error,
    problemSet,
    problem,
    problemInput,
    failureSource,
  });
}

export function compileStructuredProblemSet(value, options = {}) {
  const problemSet = normalizeStructuredProblemSet(value, options);
  if (problemSet.status !== "ready") {
    const problem = problemSet.items.length === 1 ? problemSet.items[0] : null;
    const kind = ["invalid", "conflict", "recognition_error"].includes(problemSet.status)
      ? "invalid"
      : "unsupported";
    return compilationFailure({
      kind,
      error: cleanText(problemSet.error) || "入力を安全に確定できませんでした。",
      problemSet,
      problem,
      problemInput: problem?.legacyProblemInput ?? null,
      failureSource: problemSet.failureSource,
    });
  }
  if (problemSet.items.length !== 1) {
    return compilationFailure({
      kind: "unsupported",
      error: "複数問題の一括計算はまだ有効化されていません。各問題は独立itemとして保持されています。",
      problemSet,
    });
  }

  const problem = problemSet.items[0];
  if (problem.status !== "ready") {
    const kind = ["invalid", "conflict", "recognition_error"].includes(problem.status)
      ? "invalid"
      : "unsupported";
    return compilationFailure({
      kind,
      error: cleanText(problem.error) || "入力を安全に確定できませんでした。",
      problemSet,
      problem,
      problemInput: problem.legacyProblemInput,
      failureSource: problem.failureSource,
    });
  }

  const appliesSharedInstruction = !problem.instructionText
    && !problem.instructionIntent
    && Boolean(problemSet.sharedInstructionText || problemSet.sharedInstructionIntent);
  const problemInput = appliesSharedInstruction
    ? normalizeProblemInput({
        ...problem.legacyProblemInput,
        instructionText: problemSet.sharedInstructionText,
        instructionIntent: problemSet.sharedInstructionIntent,
        instructionSource: problemSet.source,
      })
    : problem.legacyProblemInput;
  if (problemInput.status !== "ready") {
    return compilationFailure({
      kind: ["invalid", "conflict"].includes(problemInput.status) ? "invalid" : "unsupported",
      error: problemInput.error || "共通の指示文を安全に適用できませんでした。",
      problemSet,
      problem,
      problemInput,
      failureSource: "structured-input",
    });
  }
  if (appliesSharedInstruction) {
    const sharedCompilation = compileProblemInput(problemInput);
    if (!sharedCompilation.ok) {
      return compilationFailure({
        kind: sharedCompilation.kind,
        error: sharedCompilation.error,
        problemSet,
        problem,
        problemInput,
        failureSource: "structured-input",
      });
    }
  }

  return Object.freeze({
    ok: true,
    kind: "ready",
    error: "",
    problemSet,
    problem,
    problemInput,
    failureSource: null,
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
    terminalCode: problem?.terminalCode ?? compiled.problemSet.terminalCode ?? null,
    error: compiled.error,
    problemSet: compiled.problemSet,
    problem,
    requestedOperation: compiled.problemInput?.instructionIntent ?? null,
  });
}

export const AMBIGUOUS_FORMULA_STRUCTURE_MESSAGE = AMBIGUOUS_STRUCTURE_MESSAGE;
