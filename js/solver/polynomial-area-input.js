import {
  ExactPolynomialIntegralError,
  exactRationalConstantFromAst,
} from "../math-core/exact-polynomial-integral.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { hasAmbiguousDivisionMultiplication } from "./equation-input.js";

const MAX_INPUT_LENGTH = 5_000;
const MAX_BOUND_COMPONENT_DIGITS = 512;
const UNSUPPORTED_SCRIPT_CHARACTER = /[\u2071\u207C-\u207F\u2080-\u209F]/u;
const SAFE_NFKC_SOURCE_CHARACTER = /^[\u3000\uFF01-\uFF5E]$/u;
const SUPPORTED_SUPERSCRIPT_CHARACTER = /^[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]$/u;
const SUPERSCRIPT_SEQUENCE = /[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+/gu;
const VALID_SUPERSCRIPT_SEQUENCE = /^[\u207A\u207B]?[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]+$/u;
const SEPARATED_SUPERSCRIPT_SEQUENCES = /[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+\s+[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+/u;
const DESTRUCTIVE_LATEX_DELIMITER = /\\(?:left|right)/iu;
const RAW_AREA_MARKER = /area_|[Ａａ][Ｒｒ][Ｅｅ][Ａａ]＿|面積/iu;
const RELATION_PATTERN = /[=<>≤≥≦≧]/u;
const AREA_CUE = /(?:^|[^a-z])area_(?:\s*\[|intersections\s*\()|面積[\s\S]*(?:y\s*=|x\s*軸)|(?:y\s*=|x\s*軸)[\s\S]*面積|x\s*=.+から.+まで[\s\S]*面積/iu;
const DIAGRAM_CUE = /右図|左図|下図|上図|図の|図中|斜線|グラフ|この部分|その部分/u;
const INSTRUCTION = String.raw`(?:を\s*)?(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)\s*[!！。．.？?]?`;
const CURVE_LABEL = String.raw`(?:(?:曲線|直線|放物線|関数)\s*)?y\s*=\s*`;
const EXPLICIT_JAPANESE = new RegExp(
  String.raw`^(?:次の\s*)?x\s*=\s*(.+?)\s*から\s*x\s*=\s*(.+?)\s*まで`
    + String.raw`(?:\s*の\s*区間)?(?:\s*で)?\s*[、,]?\s*`
    + `${CURVE_LABEL}` + String.raw`(.+?)\s*と\s*` + `${CURVE_LABEL}`
    + String.raw`(.+?)\s*の\s*間\s*の\s*面積\s*` + `${INSTRUCTION}$`,
  "iu",
);
const INTERSECTION_JAPANESE = new RegExp(
  String.raw`^(?:次の\s*)?` + `${CURVE_LABEL}` + String.raw`(.+?)\s*と\s*`
    + `${CURVE_LABEL}` + String.raw`(.+?)\s*`
    + String.raw`(?:の\s*(?:異なる\s*2\s*交点|2\s*つ\s*の\s*交点)\s*の\s*間\s*に\s*ある`
    + String.raw`|で\s*囲まれ(?:た|る)\s*(?:部分\s*)?)\s*の?\s*面積\s*`
    + `${INSTRUCTION}$`,
  "iu",
);

function response({
  recognized,
  ok = false,
  form = "",
  firstExpression = "",
  secondExpression = "",
  lowerSource = "",
  upperSource = "",
  error = "",
  errorCode = "",
}) {
  return Object.freeze({
    recognized: recognized === true,
    ok: ok === true,
    form,
    firstExpression,
    secondExpression,
    lowerSource,
    upperSource,
    error,
    errorCode,
  });
}

function normalizeOuter(value) {
  return normalizeMathNotation(value)
    .replace(/[−‐‑‒–—―]/gu, "-")
    .replace(/[×∙⋅・]/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/，/gu, ",")
    .trim();
}

function hasAmbiguousCompatibilityNormalization(value) {
  for (const character of String(value ?? "")) {
    if (
      SAFE_NFKC_SOURCE_CHARACTER.test(character)
      || SUPPORTED_SUPERSCRIPT_CHARACTER.test(character)
    ) {
      continue;
    }
    const normalized = character.normalize("NFKC");
    if (normalized !== character && /[A-Za-z0-9]/u.test(normalized)) return true;
  }
  return false;
}

function hasAmbiguousSuperscriptSequence(value) {
  for (const match of String(value ?? "").matchAll(SUPERSCRIPT_SEQUENCE)) {
    if (!VALID_SUPERSCRIPT_SEQUENCE.test(match[0])) return true;
  }
  return false;
}

function hasAmbiguousSuperscriptBoundary(value) {
  const source = String(value ?? "");
  if (SEPARATED_SUPERSCRIPT_SEQUENCES.test(source)) return true;
  for (const match of source.matchAll(SUPERSCRIPT_SEQUENCE)) {
    const nextCharacter = source[match.index + match[0].length] ?? "";
    if (/[0-9０-９.．]/u.test(nextCharacter)) return true;
  }
  return false;
}

function matchingEnd(text, start, opening, closing) {
  if (text[start] !== opening) return -1;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === opening) depth += 1;
    if (text[index] === closing) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function splitTopLevel(value, delimiter) {
  const source = String(value ?? "");
  const parts = [];
  let start = 0;
  const stack = [];
  const pairs = new Map([[")", "("], ["]", "["], ["}", "{"]]);
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (["(", "[", "{"].includes(character)) stack.push(character);
    else if (pairs.has(character)) {
      if (stack.pop() !== pairs.get(character)) return null;
    } else if (character === delimiter && stack.length === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  if (stack.length) return null;
  parts.push(source.slice(start));
  return parts;
}

function symbolicCandidate(text) {
  const intervalPrefix = /^area_\s*\[/iu.exec(text);
  if (intervalPrefix) {
    const bracketStart = intervalPrefix[0].lastIndexOf("[");
    const bracketEnd = matchingEnd(text, bracketStart, "[", "]");
    if (bracketEnd < 0) return { malformed: true };
    let index = bracketEnd;
    while (/\s/u.test(text[index] ?? "")) index += 1;
    if (text[index] !== "(") return { malformed: true };
    const expressionEnd = matchingEnd(text, index, "(", ")");
    if (expressionEnd !== text.length) return { malformed: true };
    const bounds = splitTopLevel(text.slice(bracketStart + 1, bracketEnd - 1), ",");
    const expressions = splitTopLevel(text.slice(index + 1, expressionEnd - 1), ";");
    if (bounds?.length !== 2 || expressions?.length !== 2) return { malformed: true };
    return {
      form: "explicit-interval",
      lower: bounds[0],
      upper: bounds[1],
      first: expressions[0],
      second: expressions[1],
    };
  }

  const intersectionPrefix = /^area_intersections\s*\(/iu.exec(text);
  if (!intersectionPrefix) return null;
  const opening = intersectionPrefix[0].lastIndexOf("(");
  const end = matchingEnd(text, opening, "(", ")");
  if (end !== text.length) return { malformed: true };
  const expressions = splitTopLevel(text.slice(opening + 1, end - 1), ";");
  if (expressions?.length !== 2) return { malformed: true };
  return {
    form: "two-intersections",
    lower: "",
    upper: "",
    first: expressions[0],
    second: expressions[1],
  };
}

function japaneseCandidate(text) {
  const axisNormalized = text.replace(/x\s*軸/giu, "y=0");
  const explicit = EXPLICIT_JAPANESE.exec(axisNormalized);
  if (explicit) {
    return {
      form: "explicit-interval",
      lower: explicit[1],
      upper: explicit[2],
      first: explicit[3],
      second: explicit[4],
    };
  }
  const intersections = INTERSECTION_JAPANESE.exec(axisNormalized);
  if (!intersections) return null;
  return {
    form: "two-intersections",
    lower: "",
    upper: "",
    first: intersections[1],
    second: intersections[2],
  };
}

function unwrapBound(value) {
  let source = String(value ?? "").trim();
  if (
    source.startsWith("(")
    && matchingEnd(source, 0, "(", ")") === source.length
  ) {
    source = source.slice(1, -1).trim();
  }
  return source;
}

function validateBound(value, label) {
  const source = unwrapBound(value);
  if (!source) {
    return { ok: false, source: "", error: `${label}を入力してください。`, errorCode: "MISSING_AREA_BOUND" };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: `${label}では科学記数法の連結表記を解釈しません。`,
      errorCode: "AMBIGUOUS_AREA_BOUND_SCIENTIFIC_NOTATION",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: `${label}の数字を空白だけで並べないでください。`,
      errorCode: "AMBIGUOUS_AREA_BOUND_NUMBER_SPACING",
    };
  }
  const compact = source.replace(/\s+/gu, "");
  if (!/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)|(?:\d+\/\d+))$/u.test(compact)) {
    return {
      ok: false,
      source: "",
      error: `${label}は符号付き整数・有限小数・明示分数にしてください。`,
      errorCode: "UNSUPPORTED_AREA_BOUND",
    };
  }
  if ((compact.match(/\d+/gu) ?? []).some((digits) => (
    digits.length > MAX_BOUND_COMPONENT_DIGITS
  ))) {
    return {
      ok: false,
      source: "",
      error: `${label}の数値が長すぎます。`,
      errorCode: "AREA_BOUND_COMPONENT_TOO_LONG",
    };
  }
  try {
    const parsed = parseMathExpression(compact, { symbols: [] });
    const exact = exactRationalConstantFromAst(parsed.ast);
    return { ok: true, source: exact.toString(), error: "", errorCode: "" };
  } catch (error) {
    return {
      ok: false,
      source: "",
      error: error.message || `${label}を厳密分数として解釈できません。`,
      errorCode: error.code || "INVALID_AREA_BOUND",
    };
  }
}

function validateExpression(value, label) {
  const source = String(value ?? "").trim();
  if (!source) {
    return { ok: false, expression: "", error: `${label}の式を入力してください。`, errorCode: "MISSING_AREA_EXPRESSION" };
  }
  if (RELATION_PATTERN.test(source)) {
    return {
      ok: false,
      expression: "",
      error: `${label}の右辺に等式や不等式を付けないでください。`,
      errorCode: "AREA_RELATION_ATTACHED",
    };
  }
  if (/[xX]\s*(?:\d|\.\d)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "xの直後の数字は曖昧です。係数なら2x、累乗ならx^2と入力してください。",
      errorCode: "AMBIGUOUS_AREA_X_SUFFIX",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "数字を空白だけで並べず、掛け算なら*を入力してください。",
      errorCode: "AMBIGUOUS_AREA_NUMBER_SPACING",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "科学記数法の連結表記は解釈しません。",
      errorCode: "AMBIGUOUS_AREA_SCIENTIFIC_NOTATION",
    };
  }
  if (/pi\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "piの直後の数値は曖昧です。掛け算なら*を明示してください。",
      errorCode: "AMBIGUOUS_AREA_PI_MULTIPLICATION",
    };
  }
  if (/(?:^|[^A-Za-z])e\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "eの直後の数値は曖昧です。掛け算なら*を明示してください。",
      errorCode: "AMBIGUOUS_AREA_E_MULTIPLICATION",
    };
  }
  if (hasAmbiguousDivisionMultiplication(source)) {
    return {
      ok: false,
      expression: "",
      error: "割り算の直後の暗黙の掛け算は曖昧です。分母と掛け算を括弧や*で明示してください。",
      errorCode: "AMBIGUOUS_AREA_DIVISION_MULTIPLICATION",
    };
  }
  try {
    const parsed = parseMathExpression(normalizeMathNotation(source), { symbols: ["x"] });
    return { ok: true, expression: parsed.normalized, error: "", errorCode: "" };
  } catch (error) {
    const unsupported = error instanceof MathParseError
      && error.code === "UNSUPPORTED_SYMBOL";
    return {
      ok: false,
      expression: "",
      error: error.message || `${label}の式を解釈できません。`,
      errorCode: unsupported ? "UNSUPPORTED_AREA_EXPRESSION" : error.code || "INVALID_AREA_EXPRESSION",
    };
  }
}

function validateCandidate(candidate) {
  const first = validateExpression(candidate.first, "第1曲線");
  if (!first.ok) return response({ recognized: true, error: first.error, errorCode: first.errorCode });
  const second = validateExpression(candidate.second, "第2曲線");
  if (!second.ok) return response({ recognized: true, error: second.error, errorCode: second.errorCode });

  let lowerSource = "";
  let upperSource = "";
  if (candidate.form === "explicit-interval") {
    const lower = validateBound(candidate.lower, "面積区間の下端");
    if (!lower.ok) return response({ recognized: true, error: lower.error, errorCode: lower.errorCode });
    const upper = validateBound(candidate.upper, "面積区間の上端");
    if (!upper.ok) return response({ recognized: true, error: upper.error, errorCode: upper.errorCode });
    const lowerValue = exactRationalConstantFromAst(
      parseMathExpression(lower.source, { symbols: [] }).ast,
    );
    const upperValue = exactRationalConstantFromAst(
      parseMathExpression(upper.source, { symbols: [] }).ast,
    );
    const comparison = lowerValue.numerator * upperValue.denominator
      - upperValue.numerator * lowerValue.denominator;
    if (comparison >= 0n) {
      return response({
        recognized: true,
        error: "面積区間は下端が上端より小さくなるように指定してください。",
        errorCode: "INVALID_AREA_INTERVAL_ORDER",
      });
    }
    lowerSource = lower.source;
    upperSource = upper.source;
  }
  return response({
    recognized: true,
    ok: true,
    form: candidate.form,
    firstExpression: first.expression,
    secondExpression: second.expression,
    lowerSource,
    upperSource,
  });
}

export function parsePolynomialAreaInput(question) {
  const raw = String(question ?? "");
  const recognitionEdge = MAX_INPUT_LENGTH + 1;
  const recognitionSource = raw.length <= recognitionEdge
    ? raw
    : `${raw.slice(0, recognitionEdge)}\n${raw.slice(-recognitionEdge)}`;
  const recognitionSample = normalizeOuter(recognitionSource);
  const rawRecognized = AREA_CUE.test(recognitionSample) || RAW_AREA_MARKER.test(raw);
  if (raw.length > MAX_INPUT_LENGTH) {
    return response({
      recognized: rawRecognized,
      error: "入力が長すぎます。",
      errorCode: "AREA_INPUT_TOO_LONG",
    });
  }
  const text = normalizeOuter(raw);
  const recognized = AREA_CUE.test(text);
  if (!recognized) {
    return response({ recognized: false, error: "多項式の面積問題を検出できません。" });
  }
  if (UNSUPPORTED_SCRIPT_CHARACTER.test(raw)) {
    return response({
      recognized: true,
      error: "下付き文字または未対応の上付き文字は式の意味が曖昧になるため解釈できません。指数は ^ を使って明示してください。",
      errorCode: "AMBIGUOUS_AREA_SCRIPT_CHARACTER",
    });
  }
  if (hasAmbiguousSuperscriptSequence(raw)) {
    return response({
      recognized: true,
      error: "上付き指数は先頭の符号1個と、それに続く数字だけで入力してください。",
      errorCode: "AMBIGUOUS_AREA_SUPERSCRIPT_SEQUENCE",
    });
  }
  if (hasAmbiguousSuperscriptBoundary(raw)) {
    return response({
      recognized: true,
      error: "上付き指数の直後へ通常の数字を続けることはできません。指数はすべて上付きにし、掛け算は * で明示してください。",
      errorCode: "AMBIGUOUS_AREA_SUPERSCRIPT_BOUNDARY",
    });
  }
  if (DESTRUCTIVE_LATEX_DELIMITER.test(raw.normalize("NFKC"))) {
    return response({
      recognized: true,
      error: "\\left と \\right は位置情報を失うため面積入力では使用できません。通常の丸括弧を使ってください。",
      errorCode: "AMBIGUOUS_AREA_LATEX_DELIMITER",
    });
  }
  if (hasAmbiguousCompatibilityNormalization(raw)) {
    return response({
      recognized: true,
      error: "互換文字が通常の英数字へ変化すると式の意味を確定できません。通常の半角または全角の英数字で入力してください。",
      errorCode: "AMBIGUOUS_AREA_COMPATIBILITY_CHARACTER",
    });
  }
  if (/\)\s*(?:=|:|：)|面積\s*(?:は|=|:|：)|答え\s*(?:は|=|:|：)/u.test(text)) {
    return response({
      recognized: true,
      error: "面積問題に答えや追加の等式を付けないでください。",
      errorCode: "AREA_ANSWER_ATTACHED",
    });
  }
  if (DIAGRAM_CUE.test(text)) {
    return response({
      recognized: true,
      error: "図・グラフ・斜線から領域を読み取る面積問題は未対応です。式と区間を文章で完全に指定してください。",
      errorCode: "UNSUPPORTED_DIAGRAM_AREA",
    });
  }
  const candidate = symbolicCandidate(text) ?? japaneseCandidate(text);
  if (!candidate || candidate.malformed) {
    return response({
      recognized: true,
      error: "面積は area_[a,b](f;g)、area_intersections(f;g)、または対応する完全な日本語形式で入力してください。",
      errorCode: "MALFORMED_AREA_INPUT",
    });
  }
  try {
    return validateCandidate(candidate);
  } catch (error) {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialIntegralError
      || error instanceof RangeError
      || error instanceof TypeError
    ) {
      return response({
        recognized: true,
        error: error.message || "面積入力を厳密に検証できませんでした。",
        errorCode: error.code || "INVALID_AREA_INPUT",
      });
    }
    throw error;
  }
}

export default parsePolynomialAreaInput;
