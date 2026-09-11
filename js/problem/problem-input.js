import {
  INSTRUCTION_INTENTS,
  isInstructionIntent,
  looksLikeInstructionText,
  normalizeInstruction,
} from "./instruction-normalizer.js";
import {
  isQuestionLabel,
  separateQuestionLabel,
} from "./question-label.js";

export const PROBLEM_INPUT_SCHEMA_VERSION = 1;
export const PROBLEM_INPUT_SOURCES = Object.freeze([
  "manual",
  "selection",
  "clipboard",
  "ocr",
  "review",
]);
export const PROBLEM_FIELD_SOURCES = Object.freeze([
  "none",
  "manual",
  "selection",
  "clipboard",
  "ocr",
  "review",
]);

const PROBLEM_SOURCE_SET = new Set(PROBLEM_INPUT_SOURCES);
const FIELD_SOURCE_SET = new Set(PROBLEM_FIELD_SOURCES);
const MAX_RAW_CHARACTERS = 10_000;
const MAX_FORMULA_CHARACTERS = 5_000;
const MAX_LABEL_CHARACTERS = 32;
const MAX_CONDITIONS = 8;
const MAX_CONDITION_CHARACTERS = 512;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const RELATION_CHARACTER = /[=＝<>＜＞≤≥≦≧≠]/u;
const EQUATION_CHARACTER = /[=＝]/gu;
const JAPANESE_CHARACTER = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
const NON_JAPANESE_RUN = /[^\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+/gu;
const BARE_SOLVE_INSTRUCTION = /^を?(?:解け|解きなさい|解いてください)[。．.!！?？]*$/u;
const DIRECT_INLINE_COMMAND = /^を(?:解け|解きなさい|解いてください|微分(?:せよ|しなさい|してください)|展開(?:せよ|しなさい|してください)|因数分解(?:せよ|しなさい|してください)|(?:簡単に|簡約|整理)(?:せよ|しなさい|してください))[。．.!！?？]*$/u;
const INLINE_FORMULA_QUOTE = /[「」『』]/u;

function frozenStrings(values) {
  return Object.freeze(values.map((value) => String(value)));
}

function cleanText(value, { preserveLines = false } = {}) {
  const text = String(value ?? "").replace(/\r\n?/gu, "\n");
  return preserveLines
    ? text.split("\n").map((line) => line.trim()).join("\n").trim()
    : text.replace(/\s+/gu, " ").trim();
}

function safeFields(value, names) {
  try {
    const fields = {};
    for (const name of names) fields[name] = value[name];
    return { fields, error: null };
  } catch (error) {
    return { fields: {}, error };
  }
}

function safeErrorMessage(error) {
  try {
    if (error instanceof Error && String(error.message).trim()) return String(error.message).trim();
  } catch {
    // Hostile error values stay inside the acquisition boundary.
  }
  return "詳細不明の例外";
}

function hasStructuredProblemFields(value) {
  try {
    return [
      "formulaText",
      "question",
      "instructionText",
      "instructionIntent",
      "questionLabel",
      "conditions",
      "schemaVersion",
    ].some((name) => Object.hasOwn(value, name));
  } catch {
    return true;
  }
}

function sourceValue(value, fallback) {
  return PROBLEM_SOURCE_SET.has(value) ? value : fallback;
}

function fieldSourceValue(value, fallback) {
  return FIELD_SOURCE_SET.has(value) ? value : fallback;
}

function formulaEvidence(value) {
  const source = String(value ?? "").trim();
  if (!source || looksLikeInstructionText(source)) return false;
  return /[0-9A-Za-z=+\-*/^<>≤≥≦≧∫√π∞]|(?:sin|cos|tan|log|exp)\s*\(/iu.test(source);
}

function normalizedConditions(value) {
  if (value === undefined || value === null) return { conditions: [], error: "" };
  if (!Array.isArray(value)) {
    return { conditions: [], error: "条件は配列で指定してください。" };
  }
  if (value.length > MAX_CONDITIONS) {
    return { conditions: [], error: "条件の個数が上限を超えています。" };
  }
  const conditions = [];
  try {
    for (const item of value) {
      const condition = cleanText(item);
      if (!condition) continue;
      if (
        condition.length > MAX_CONDITION_CHARACTERS
        || CONTROL_CHARACTER.test(condition)
      ) {
        return { conditions: [], error: "条件の形式が不正です。" };
      }
      conditions.push(condition);
    }
  } catch {
    return { conditions: [], error: "条件を安全に読み取れませんでした。" };
  }
  return { conditions: [...new Set(conditions)], error: "" };
}

function problemRecord({
  status = "ready",
  error = "",
  rawText = "",
  questionLabel = "",
  instructionText = "",
  instructionIntent = null,
  instructionStatus = "empty",
  formulaText = "",
  conditions = [],
  source = "manual",
  instructionSource = "none",
  formulaSource = "manual",
} = {}) {
  return Object.freeze({
    schemaVersion: PROBLEM_INPUT_SCHEMA_VERSION,
    status,
    error,
    rawText,
    questionLabel,
    instructionText,
    instructionIntent: isInstructionIntent(instructionIntent) ? instructionIntent : null,
    instructionStatus,
    formulaText,
    conditions: frozenStrings(conditions),
    source,
    instructionSource,
    formulaSource,
  });
}

function parseInstructionPrefix(lines) {
  for (const count of [1, 2]) {
    if (lines.length !== count + 1) continue;
    const instructionText = lines.slice(0, count).join(" ").trim();
    if (!looksLikeInstructionText(instructionText)) continue;
    const formulaText = lines[count].trim();
    if (!formulaEvidence(formulaText)) continue;
    return { instructionText, formulaText };
  }
  return null;
}

function contextualInstruction(instructionText, formulaText) {
  const normalized = normalizeInstruction(instructionText);
  if (normalized.status === "recognized") {
    return Object.freeze({
      instructionText,
      instructionIntent: normalized.intent,
    });
  }

  // 「を解け」だけでは一般の式変形か方程式かを決められない。
  // 等号がちょうど1つある非関数定義を同時に確認できた場合だけ、
  // closed intent の solve_equation へ補う。
  if (
    BARE_SOLVE_INSTRUCTION.test(instructionText.normalize("NFKC").replace(/\s+/gu, ""))
    && exactlyOneEquation(formulaText)
    && !/^\s*(?:y|f\s*\(\s*x\s*\))\s*[=＝]/iu.test(formulaText)
  ) {
    return Object.freeze({
      instructionText: "方程式を解け",
      instructionIntent: "solve_equation",
    });
  }
  return null;
}

function inlineFormulaEvidence(value, { startsLine = false } = {}) {
  const source = String(value ?? "").trim();
  if (!formulaEvidence(source)) return false;
  const compact = source.replace(/\s+/gu, "");

  // A lone count or degree marker in Japanese prose ("2 次式"など) is not
  // structural evidence of a formula. A lone variable is accepted only at
  // the start of the line, where it cannot have been cut out of prose such as
  // "関数 f を微分せよ".
  if (/^[+-]?(?:\d+(?:\.\d+)?|\(\d+(?:\.\d+)?\))$/u.test(compact)) return false;
  if (/^[A-Za-z]$/u.test(compact)) return startsLine;
  if (/^[A-Za-z]\d+$/u.test(compact)) return startsLine;
  return /[=+\-*/^<>≤≥≦≧]|(?:sin|cos|tan|log|exp|sqrt)\(/iu.test(compact);
}

function inlineFormulaFromRun(value) {
  const source = String(value ?? "").trim();
  if (!INLINE_FORMULA_QUOTE.test(source)) return source;
  for (const [opening, closing] of [["「", "」"], ["『", "』"]]) {
    if (!source.startsWith(opening) || !source.endsWith(closing)) continue;
    const inner = source.slice(opening.length, -closing.length).trim();
    return inner && !INLINE_FORMULA_QUOTE.test(inner) ? inner : null;
  }
  return null;
}

/**
 * Splits one-line Japanese prose only when the formula is an isolated,
 * whitespace-delimited non-Japanese run and the remaining prose resolves to
 * exactly one closed intent. Multiple possible formula runs remain untouched.
 */
function parseInlineInstruction(line) {
  if (!JAPANESE_CHARACTER.test(line)) return null;
  const candidates = [];
  for (const match of line.matchAll(NON_JAPANESE_RUN)) {
    const rawRun = match[0];
    const formulaText = inlineFormulaFromRun(rawRun);

    const start = match.index;
    const end = start + rawRun.length;
    if (!formulaText) continue;
    if (!inlineFormulaEvidence(formulaText, { startsLine: start === 0 })) continue;
    const followingText = line.slice(end).trimStart();
    const hasJapaneseAfter = JAPANESE_CHARACTER.test(followingText);
    const hasDirectCommand = DIRECT_INLINE_COMMAND.test(
      followingText.normalize("NFKC").replace(/\s+/gu, ""),
    );
    if (!hasJapaneseAfter || !hasDirectCommand) continue;

    const precedingText = line.slice(0, start).trim();
    if (precedingText && formulaEvidence(precedingText)) continue;

    const instructionText = `${line.slice(0, start).trim()}${line.slice(end).trim()}`;
    if (!instructionText || formulaEvidence(instructionText)) continue;
    const instruction = contextualInstruction(instructionText, formulaText);
    if (!instruction) continue;
    candidates.push(Object.freeze({
      instructionText: instruction.instructionText,
      instructionIntent: instruction.instructionIntent,
      formulaText,
    }));
  }

  const unique = candidates.filter((candidate, index) => (
    candidates.findIndex((other) => (
      other.instructionText === candidate.instructionText
      && other.instructionIntent === candidate.instructionIntent
      && other.formulaText === candidate.formulaText
    )) === index
  ));
  return unique.length === 1 ? unique[0] : null;
}

/**
 * Parses only strong line-structured evidence. It is intentionally not used
 * for arbitrary legacy strings; callers opt in for a web selection or OCR
 * result whose line structure is available.
 */
export function parseCombinedProblemText(value, { source = "selection" } = {}) {
  let rawText;
  try {
    rawText = cleanText(value, { preserveLines: true });
  } catch {
    return problemRecord({
      status: "invalid",
      error: "問題文を安全に読み取れませんでした。",
      source: sourceValue(source, "selection"),
      formulaSource: fieldSourceValue(source, "selection"),
    });
  }
  if (!rawText || rawText.length > MAX_RAW_CHARACTERS || CONTROL_CHARACTER.test(rawText)) {
    return problemRecord({
      status: "invalid",
      error: rawText ? "問題文が長すぎるか不正です。" : "問題文が空です。",
      rawText,
      source: sourceValue(source, "selection"),
      formulaSource: fieldSourceValue(source, "selection"),
    });
  }

  const separated = separateQuestionLabel(rawText);
  const body = separated.remainingText;
  const lines = body.split("\n").map((line) => line.trim()).filter(Boolean);
  const parsed = parseInstructionPrefix(lines)
    ?? (lines.length === 1 && !separated.reason ? parseInlineInstruction(lines[0]) : null);
  const recordSource = sourceValue(source, "selection");
  const recordFieldSource = fieldSourceValue(source, "selection");
  if (!parsed) {
    if (lines.length === 1 && separated.reason) {
      return problemRecord({
        status: "unsupported",
        error: "先頭の番号風表記が問題番号か数式の係数か判別できないため、自動実行しません。",
        rawText,
        formulaText: body,
        source: recordSource,
        formulaSource: recordFieldSource,
      });
    }
    return normalizeProblemInput({
      rawText,
      questionLabel: separated.questionLabel,
      formulaText: body,
      source: recordSource,
      formulaSource: recordFieldSource,
    });
  }
  return normalizeProblemInput({
    rawText,
    questionLabel: separated.questionLabel,
    instructionText: parsed.instructionText,
    formulaText: parsed.formulaText,
    source: recordSource,
    instructionSource: recordFieldSource,
    formulaSource: recordFieldSource,
  });
}

/**
 * Snapshots a typed ProblemInput. Plain strings remain a single formula and
 * are not reinterpreted, preserving every legacy solver entry point.
 */
export function normalizeProblemInput(value, { source = "manual" } = {}) {
  if (typeof value === "string") {
    const formulaText = cleanText(value, { preserveLines: true });
    return problemRecord({
      status: formulaText ? "ready" : "invalid",
      error: formulaText ? "" : "問題文が空です。",
      rawText: formulaText,
      formulaText,
      source: sourceValue(source, "manual"),
      formulaSource: fieldSourceValue(source, "manual"),
    });
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return problemRecord({ status: "invalid", error: "ProblemInputの形式が不正です。" });
  }
  if (!hasStructuredProblemFields(value)) {
    try {
      return normalizeProblemInput(String(value), { source });
    } catch (error) {
      return problemRecord({
        status: "invalid",
        error: `問題文を安全に読み取れませんでした: ${safeErrorMessage(error)}`,
      });
    }
  }

  let hasSchemaVersion;
  try {
    hasSchemaVersion = Object.hasOwn(value, "schemaVersion");
  } catch {
    return problemRecord({ status: "invalid", error: "ProblemInputのschemaVersionを安全に読み取れませんでした。" });
  }

  const snapshot = safeFields(value, [
    "schemaVersion",
    "rawText",
    "questionLabel",
    "instructionText",
    "instructionIntent",
    "formulaText",
    "question",
    "conditions",
    "source",
    "instructionSource",
    "formulaSource",
  ]);
  if (snapshot.error) {
    return problemRecord({ status: "invalid", error: "ProblemInputを安全に読み取れませんでした。" });
  }
  if (hasSchemaVersion && snapshot.fields.schemaVersion !== PROBLEM_INPUT_SCHEMA_VERSION) {
    return problemRecord({
      status: "invalid",
      error: "未対応のProblemInput schemaVersionです。",
    });
  }

  let rawText;
  let questionLabel;
  let instructionText;
  let formulaText;
  try {
    rawText = cleanText(snapshot.fields.rawText, { preserveLines: true });
    questionLabel = cleanText(snapshot.fields.questionLabel);
    instructionText = cleanText(snapshot.fields.instructionText);
    formulaText = cleanText(
      snapshot.fields.formulaText ?? snapshot.fields.question,
      { preserveLines: true },
    );
  } catch {
    return problemRecord({ status: "invalid", error: "ProblemInputの文字列を安全に読み取れませんでした。" });
  }

  const recordSource = sourceValue(snapshot.fields.source, sourceValue(source, "manual"));
  const instructionSource = instructionText
    ? fieldSourceValue(
        snapshot.fields.instructionSource,
        recordSource === "ocr" ? "ocr" : "manual",
      )
    : "none";
  const formulaSource = fieldSourceValue(snapshot.fields.formulaSource, recordSource);
  const conditionsResult = normalizedConditions(snapshot.fields.conditions);

  let status = "ready";
  let error = "";
  if (!formulaText) {
    status = "invalid";
    error = "数式が空です。";
  } else if (
    formulaText.length > MAX_FORMULA_CHARACTERS
    || rawText.length > MAX_RAW_CHARACTERS
    || CONTROL_CHARACTER.test(formulaText)
  ) {
    status = "invalid";
    error = "数式が長すぎるか不正です。";
  } else if (
    questionLabel
    && (questionLabel.length > MAX_LABEL_CHARACTERS || !isQuestionLabel(questionLabel))
  ) {
    status = "invalid";
    error = "問題番号の形式が不正です。";
  } else if (conditionsResult.error) {
    status = "invalid";
    error = conditionsResult.error;
  }

  const instruction = normalizeInstruction(instructionText);
  const suppliedIntent = snapshot.fields.instructionIntent;
  let instructionIntent = instruction.intent;
  if (suppliedIntent !== undefined && suppliedIntent !== null && suppliedIntent !== "") {
    if (!isInstructionIntent(suppliedIntent)) {
      status = "invalid";
      error ||= "instructionIntentが対応一覧にありません。";
    } else if (instruction.intent && instruction.intent !== suppliedIntent) {
      status = "conflict";
      error ||= "指示文とinstructionIntentが一致しません。";
    } else {
      instructionIntent = suppliedIntent;
    }
  }
  if (status === "ready" && instructionText) {
    if (instruction.status === "conflict") {
      status = "conflict";
      error = instruction.reason;
    } else if (!instructionIntent && instruction.status !== "empty") {
      status = "unsupported";
      error = instruction.reason;
    }
  }
  if (status === "ready" && conditionsResult.conditions.length > 0) {
    status = "unsupported";
    error = "入力条件を既存solverの検証へ安全に結合できないため、現在は自動実行しません。";
  }

  return problemRecord({
    status,
    error,
    rawText,
    questionLabel,
    instructionText: instruction.normalizedText ?? instructionText,
    instructionIntent,
    instructionStatus: instruction.status,
    formulaText,
    conditions: conditionsResult.conditions,
    source: recordSource,
    instructionSource,
    formulaSource,
  });
}

function compilationFailure(problemInput, kind, error) {
  return Object.freeze({
    ok: false,
    kind,
    error,
    solverInput: "",
    instructionIntent: problemInput.instructionIntent,
    problemInput,
  });
}

function compilationSuccess(problemInput, solverInput) {
  return Object.freeze({
    ok: true,
    kind: "ready",
    error: "",
    solverInput,
    instructionIntent: problemInput.instructionIntent,
    problemInput,
  });
}

function variationExpression(formulaText) {
  const source = formulaText.trim();
  const definition = /^(?:y|f\s*\(\s*x\s*\))\s*=\s*(.+)$/iu.exec(source);
  return definition ? definition[1].trim() : source;
}

function exactlyOneEquation(value) {
  const source = String(value ?? "");
  const matches = source.match(EQUATION_CHARACTER) ?? [];
  return matches.length === 1 && !/[<>＜＞≤≥≦≧≠]/u.test(source);
}

/** Converts a validated ProblemInput to the closed syntax of one existing solver. */
export function compileProblemInput(value) {
  const problemInput = normalizeProblemInput(value);
  if (problemInput.status !== "ready") {
    return compilationFailure(
      problemInput,
      problemInput.status === "invalid" || problemInput.status === "conflict"
        ? "invalid"
        : "unsupported",
      problemInput.error || "ProblemInputを実行できません。",
    );
  }

  const formula = problemInput.formulaText;
  const intent = problemInput.instructionIntent;
  if (!intent) return compilationSuccess(problemInput, formula);

  if (["simplify", "expand", "factor"].includes(intent)) {
    if (RELATION_CHARACTER.test(formula)) {
      return compilationFailure(
        problemInput,
        "invalid",
        "式変形の指示と等式・不等式が競合しています。1つの式だけを入力してください。",
      );
    }
    const prefix = intent === "simplify" ? "簡約" : intent === "expand" ? "展開" : "因数分解";
    return compilationSuccess(problemInput, `${prefix}: ${formula}`);
  }

  if (intent === "solve_equation") {
    if (!exactlyOneEquation(formula) || /^\s*(?:y|f\s*\(\s*x\s*\))\s*[=＝]/iu.test(formula)) {
      return compilationFailure(
        problemInput,
        "invalid",
        "方程式を解くには、関数定義ではない等号を1つ含む式が必要です。",
      );
    }
    return compilationSuccess(problemInput, formula);
  }

  if (intent === "differentiate") {
    if (/[<>≤≥≦≧≠]/u.test(formula)) {
      return compilationFailure(problemInput, "invalid", "不等式を微分問題へ変換しません。");
    }
    return compilationSuccess(problemInput, `${formula}を微分せよ`);
  }

  if (intent === "integrate") {
    if (RELATION_CHARACTER.test(formula)) {
      return compilationFailure(problemInput, "invalid", "等式・不等式を不定積分問題へ変換しません。");
    }
    return compilationSuccess(problemInput, `${formula}を積分せよ`);
  }

  if (intent === "definite_integral") {
    if (!/∫/u.test(formula) || !/d\s*x(?:\s|$)/iu.test(formula)) {
      return compilationFailure(
        problemInput,
        "invalid",
        "定積分には上下限・被積分関数・積分変数を含む完全な記法が必要です。",
      );
    }
    return compilationSuccess(problemInput, formula);
  }

  if (intent === "limit") {
    if (!/(?:^|[^A-Za-z])lim(?:[^A-Za-z]|$)|近づ(?:ける|けた|く)\s*とき/iu.test(formula)) {
      return compilationFailure(
        problemInput,
        "invalid",
        "極限には接近する変数・値・式を含む完全な記法が必要です。",
      );
    }
    return compilationSuccess(problemInput, formula);
  }

  if (intent === "tangent" || intent === "normal") {
    const prefix = intent === "tangent" ? "tangent" : "normal";
    if (!new RegExp(`^${prefix}(?:_x)?_`, "iu").test(formula)) {
      return compilationFailure(
        problemInput,
        "invalid",
        `${intent === "tangent" ? "接線" : "法線"}には接点を含む完全なcanonical記法が必要です。`,
      );
    }
    return compilationSuccess(problemInput, formula);
  }

  if (["monotonicity", "extrema", "monotonicity_extrema"].includes(intent)) {
    const expression = variationExpression(formula);
    if (!expression || RELATION_CHARACTER.test(expression)) {
      return compilationFailure(
        problemInput,
        "invalid",
        "増減・極値には、1つの関数式を入力してください。",
      );
    }
    return compilationSuccess(problemInput, `${intent}(${expression})`);
  }

  return compilationFailure(problemInput, "unsupported", "このinstruction intentには対応していません。");
}

export function problemInputDisplayText(value) {
  const problemInput = normalizeProblemInput(value);
  return [
    problemInput.questionLabel,
    problemInput.instructionText,
    problemInput.formulaText,
    ...problemInput.conditions,
  ].filter(Boolean).join("\n");
}

export { INSTRUCTION_INTENTS };
