import {
  ExactPolynomialIntegralError,
  exactRationalConstantFromAst,
} from "../math-core/exact-polynomial-integral.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { hasAmbiguousDivisionMultiplication } from "./equation-input.js";

const MAX_INPUT_LENGTH = 5_000;
const LIMIT_CUE = /(?:^|[^A-Za-z])lim(?:[^A-Za-z]|$)|極限|収束値|近づ(?:ける|けた|く)\s*とき/iu;
const RELATION_PATTERN = /[=<>≤≥≦≧]/u;

function response({
  recognized,
  ok = false,
  source = "",
  expression = "",
  pointSource = "",
  approachKind = "finite",
  direction = "both",
  error = "",
  errorCode = "",
}) {
  return Object.freeze({
    recognized: recognized === true,
    ok: ok === true,
    source,
    expression,
    pointSource,
    approachKind,
    direction,
    error,
    errorCode,
  });
}

function normalizeLimitNotation(value) {
  return normalizeMathNotation(value)
    .replace(/\\lim(?![A-Za-z])/giu, "lim")
    .replace(/\\to(?![A-Za-z])/giu, "->")
    .replace(/\\infty(?![A-Za-z])/giu, "infinity")
    .replace(/[→⟶]/gu, "->")
    .replace(/[。．.?？]+$/gu, "")
    .trim();
}

function hasValidLatexSizingCommands(value) {
  const source = String(value ?? "");
  const pattern = /\\(left|right)/gu;
  let depth = 0;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    const tail = source.slice(match.index + match[0].length);
    const delimiter = /^\s*(.)/su.exec(tail)?.[1] ?? "";
    if (!"()[]{}|.".includes(delimiter)) return false;
    if (match[1] === "left") {
      depth += 1;
    } else {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0;
}

function parenthesizedEnd(text, start) {
  if (text[start] !== "(") return -1;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    if (text[index] === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function splitTargetDirection(value) {
  const source = String(value ?? "").trim();
  const groupedMatch = /^(.*?)\^\s*\(\s*([+-])\s*\)$/u.exec(source);
  if (groupedMatch?.[1].trim()) {
    return {
      target: groupedMatch[1].trim(),
      direction: groupedMatch[2] === "+" ? "right" : "left",
    };
  }
  const match = /^(.*?)(?:\^\s*)?([+-])$/u.exec(source);
  if (!match || !match[1].trim()) {
    return { target: source, direction: "both" };
  }
  return {
    target: match[1].trim(),
    direction: match[2] === "+" ? "right" : "left",
  };
}

function symbolicCandidate(text) {
  const prefix = /^(?:lim\s*_\s*|lim(?=\s|\()\s*)/iu.exec(text);
  if (!prefix) return null;
  let index = prefix[0].length;
  if (text[index] === "(") {
    const end = parenthesizedEnd(text, index);
    if (end < 0) return { malformed: true };
    const control = text.slice(index + 1, end - 1).trim();
    const controlMatch = /^([A-Za-z])\s*->\s*(.+)$/u.exec(control);
    if (!controlMatch) return { malformed: true };
    const target = splitTargetDirection(controlMatch[2]);
    return {
      variable: controlMatch[1].toLowerCase(),
      target: target.target,
      direction: target.direction,
      expression: text.slice(end).trim(),
    };
  }
  const loose = /^([A-Za-z])\s*->\s*(\S+)\s+([\s\S]+)$/u.exec(text.slice(index));
  if (!loose) return { malformed: true };
  const target = splitTargetDirection(loose[2]);
  return {
    variable: loose[1].toLowerCase(),
    target: target.target,
    direction: target.direction,
    expression: loose[3].trim(),
  };
}

function japaneseCandidate(text) {
  const match = /^([A-Za-z])\s*(?:を|が)\s*(.+?)\s*に\s*(?:(右|左)(?:側)?\s*から\s*)?近づ(?:ける|けた|く)\s*とき(?:の)?[\s,:、]*(.+)$/u.exec(text);
  if (!match) return null;
  return {
    variable: match[1].toLowerCase(),
    target: match[2].trim(),
    direction: match[3] === "右" ? "right" : match[3] === "左" ? "left" : "both",
    expression: match[4].trim(),
  };
}

function splitTrailingDirection(value) {
  const source = String(value ?? "").trim();
  const match = /^(.*?)\s*の?\s*(右|左)(?:側)?極限(?:値)?(?:\s*を\s*(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください))?\s*[!！]?\s*$/u.exec(source);
  if (!match || !match[1].trim()) {
    return { expression: source, direction: "both" };
  }
  return {
    expression: match[1].trim(),
    direction: match[2] === "右" ? "right" : "left",
  };
}

function stripExpressionInstruction(value) {
  return String(value ?? "")
    .replace(
      /\s*(?:(?:の\s*)?極限(?:値)?(?:\s*を\s*(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください))?|(?:を\s*)?(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください))\s*[!！]?\s*$/u,
      "",
    )
    .trim();
}

function unwrapTarget(value) {
  let source = String(value ?? "").trim();
  if (source.startsWith("(") && parenthesizedEnd(source, 0) === source.length) {
    source = source.slice(1, -1).trim();
  }
  return source;
}

function exactInfinitePoint(value) {
  if (/^\+?\s*(?:∞|infinity)$/iu.test(value) || value === "正の無限大") {
    return {
      ok: true,
      source: "+infinity",
      approachKind: "positive-infinity",
      error: "",
      errorCode: "",
    };
  }
  if (/^-\s*(?:∞|infinity)$/iu.test(value) || value === "負の無限大") {
    return {
      ok: true,
      source: "-infinity",
      approachKind: "negative-infinity",
      error: "",
      errorCode: "",
    };
  }
  return null;
}

function validatePoint(value) {
  const source = unwrapTarget(value);
  if (!source) {
    return { ok: false, source: "", error: "接近先の値を入力してください。", errorCode: "MISSING_LIMIT_POINT" };
  }
  const infinitePoint = exactInfinitePoint(source);
  if (infinitePoint) return infinitePoint;
  if (/∞|infinity|無限/iu.test(source)) {
    return {
      ok: false,
      source: "",
      error: "無限遠の接近先は ∞、+∞、-∞、正の無限大、または負の無限大のどれかを1つだけ入力してください。",
      errorCode: "MALFORMED_INFINITE_LIMIT_POINT",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: "接近点の数字を空白だけで並べないでください。",
      errorCode: "AMBIGUOUS_LIMIT_POINT_NUMBER_SPACING",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: "接近点では科学記数法の連結表記を解釈しません。",
      errorCode: "AMBIGUOUS_LIMIT_POINT_SCIENTIFIC_NOTATION",
    };
  }
  if (/pi\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      source: "",
      error: "接近点でpiの直後に数値を続ける表記は曖昧です。",
      errorCode: "AMBIGUOUS_LIMIT_POINT_PI_MULTIPLICATION",
    };
  }
  if (/(?:^|[^A-Za-z])e\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      source: "",
      error: "接近点でeの直後に数値を続ける表記は曖昧です。",
      errorCode: "AMBIGUOUS_LIMIT_POINT_E_MULTIPLICATION",
    };
  }
  if (hasAmbiguousDivisionMultiplication(source)) {
    return {
      ok: false,
      source: "",
      error: "接近点の割り算範囲を括弧や*で明示してください。",
      errorCode: "AMBIGUOUS_LIMIT_POINT",
    };
  }
  let parsed;
  try {
    parsed = parseMathExpression(source, { symbols: [] });
  } catch (error) {
    const unsupported = error instanceof MathParseError
      && error.code === "UNSUPPORTED_SYMBOL";
    return {
      ok: false,
      source: "",
      error: unsupported
        ? "接近点は値が確定した有限有理数にしてください。"
        : error.message || "接近点の形式が正しくありません。",
      errorCode: unsupported ? "UNSUPPORTED_LIMIT_POINT" : error.code || "INVALID_LIMIT_POINT",
    };
  }
  try {
    const point = exactRationalConstantFromAst(parsed.ast);
    return {
      ok: true,
      source: point.toString(),
      approachKind: "finite",
      error: "",
      errorCode: "",
    };
  } catch (error) {
    if (error instanceof ExactPolynomialIntegralError) {
      return {
        ok: false,
        source: "",
        error: error.unsupported
          ? "接近点は値が確定した有限有理数にしてください。"
          : error.message,
        errorCode: error.unsupported ? "UNSUPPORTED_LIMIT_POINT" : error.code,
      };
    }
    if (error instanceof RangeError || error instanceof TypeError) {
      return {
        ok: false,
        source: "",
        error: error.message,
        errorCode: "INVALID_LIMIT_POINT",
      };
    }
    throw error;
  }
}

function validateExpression(value) {
  const expression = stripExpressionInstruction(value);
  if (!expression) {
    return { ok: false, expression: "", error: "極限を求める式を入力してください。", errorCode: "MISSING_LIMIT_EXPRESSION" };
  }
  if (RELATION_PATTERN.test(expression)) {
    return { ok: false, expression: "", error: "極限の入力に等式や不等式を付けないでください。", errorCode: "LIMIT_RELATION_ATTACHED" };
  }
  if (/[xX]\s*(?:\d|\.\d)/u.test(expression)) {
    return { ok: false, expression: "", error: "xの直後の数字は曖昧です。係数なら2x、累乗ならx^2と入力してください。", errorCode: "AMBIGUOUS_X_SUFFIX" };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(expression)) {
    return { ok: false, expression: "", error: "数字を空白だけで並べず、掛け算なら*を入力してください。", errorCode: "AMBIGUOUS_NUMBER_SPACING" };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(expression)) {
    return { ok: false, expression: "", error: "科学記数法の連結表記は解釈しません。", errorCode: "AMBIGUOUS_SCIENTIFIC_NOTATION" };
  }
  if (/pi\s*(?:\d|\.)/iu.test(expression)) {
    return { ok: false, expression: "", error: "piの直後の数値は曖昧です。掛け算なら*を明示してください。", errorCode: "AMBIGUOUS_PI_MULTIPLICATION" };
  }
  if (/(?:^|[^A-Za-z])e\s*(?:\d|\.)/iu.test(expression)) {
    return { ok: false, expression: "", error: "eの直後の数値は曖昧です。掛け算なら*を明示してください。", errorCode: "AMBIGUOUS_E_MULTIPLICATION" };
  }
  if (hasAmbiguousDivisionMultiplication(expression)) {
    return { ok: false, expression: "", error: "割り算の直後の暗黙の掛け算は曖昧です。分母と続く掛け算を括弧や*で明示してください。", errorCode: "AMBIGUOUS_DIVISION_MULTIPLICATION" };
  }
  try {
    const parsed = parseMathExpression(expression, { symbols: ["x"] });
    return { ok: true, expression: parsed.normalized, error: "", errorCode: "" };
  } catch (error) {
    const unsupported = error instanceof MathParseError
      && error.code === "UNSUPPORTED_SYMBOL";
    return {
      ok: false,
      expression: "",
      error: error.message || "極限を求める式を解釈できません。",
      errorCode: unsupported ? "UNSUPPORTED_LIMIT_EXPRESSION" : error.code || "INVALID_LIMIT_EXPRESSION",
    };
  }
}

export function parseFiniteLimitInput(question) {
  const raw = String(question ?? "");
  const recognitionSample = raw.slice(0, MAX_INPUT_LENGTH + 1).normalize("NFKC");
  const rawRecognized = LIMIT_CUE.test(recognitionSample);
  if (raw.length > MAX_INPUT_LENGTH) {
    return response({
      recognized: rawRecognized,
      error: "入力が長すぎます。",
      errorCode: "LIMIT_INPUT_TOO_LONG",
    });
  }
  if (rawRecognized && !hasValidLatexSizingCommands(recognitionSample)) {
    return response({
      recognized: true,
      source: raw.trim(),
      error: "LaTeXの\\leftと\\rightは対応する区切り記号と対で入力してください。",
      errorCode: "MALFORMED_LATEX_DELIMITER",
    });
  }
  const source = normalizeLimitNotation(raw);
  const recognized = LIMIT_CUE.test(source);
  if (!recognized) {
    return response({ recognized: false, error: "極限を検出できません。" });
  }
  const candidate = symbolicCandidate(source) ?? japaneseCandidate(source);
  if (!candidate || candidate.malformed) {
    return response({
      recognized: true,
      source,
      error: "極限は lim_(x->a) f(x) の形式で、接近点と式を完全に入力してください。",
      errorCode: "MALFORMED_LIMIT_INPUT",
    });
  }
  const trailing = splitTrailingDirection(candidate.expression);
  if (
    candidate.direction !== "both"
    && trailing.direction !== "both"
    && candidate.direction !== trailing.direction
  ) {
    return response({
      recognized: true,
      source,
      error: "接近方向と右極限・左極限の指定が一致していません。",
      errorCode: "CONFLICTING_LIMIT_DIRECTION",
    });
  }
  const direction = trailing.direction === "both"
    ? candidate.direction
    : trailing.direction;
  const expression = validateExpression(trailing.expression);
  if (!expression.ok && !expression.errorCode.startsWith("UNSUPPORTED_")) {
    return response({
      recognized: true,
      source,
      error: expression.error,
      errorCode: expression.errorCode,
    });
  }
  if (candidate.variable !== "x") {
    return response({
      recognized: true,
      source,
      error: "この段階の極限変数はxだけに対応しています。",
      errorCode: "UNSUPPORTED_LIMIT_VARIABLE",
    });
  }
  if (!expression.ok) {
    return response({
      recognized: true,
      source,
      error: expression.error,
      errorCode: expression.errorCode,
    });
  }
  const point = validatePoint(candidate.target);
  if (!point.ok) {
    return response({
      recognized: true,
      source,
      error: point.error,
      errorCode: point.errorCode,
    });
  }
  if (point.approachKind !== "finite" && direction !== "both") {
    return response({
      recognized: true,
      source,
      error: "無限遠への極限に右極限・左極限の指定を付けないでください。",
      errorCode: "INFINITE_LIMIT_DIRECTION_ATTACHED",
    });
  }
  return response({
    recognized: true,
    ok: true,
    source,
    expression: expression.expression,
    pointSource: point.source,
    approachKind: point.approachKind,
    direction,
  });
}

export default parseFiniteLimitInput;
