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
const RAW_VOLUME_MARKER = /volume_|ｖｏｌｕｍｅ＿|回転体/iu;
const RELATION_PATTERN = /[=<>≤≥≠≦≧]/u;
const VOLUME_CUE = /(?:^|[^a-z])volume_|回転体[\s\S]*体積|回転[\s\S]*体積|体積[\s\S]*回転/iu;
const DIAGRAM_CUE = /右図|左図|下図|上図|図の|図中|斜線|グラフ|この部分|その部分/u;
const UNSUPPORTED_JAPANESE_AXIS = /(?:y|z)\s*軸\s*の\s*(?:まわり|周り)|直線\s*(?:x|y)\s*=\s*[^、,\sとの間部領を]+?\s*の\s*(?:まわり|周り)/iu;
const INSTRUCTION = String.raw`(?:を\s*)?(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)\s*[。.!！?？]?`;
const CURVE_LABEL = String.raw`(?:(?:曲線|直線|放物線|関数)\s*)?y\s*=\s*`;
const ROTATION_TAIL = String.raw`x\s*軸\s*の\s*(?:まわり|周り)\s*に\s*`
  + String.raw`(?:(?:1|一)\s*回転\s*(?:して|させて)|回転\s*(?:して|させて))\s*`
  + String.raw`できる\s*(?:立体|回転体)\s*の\s*体積\s*${INSTRUCTION}`;
const JAPANESE_PREFIX = String.raw`^(?:次の\s*)?x\s*=\s*(.+?)\s*から\s*x\s*=\s*(.+?)\s*まで`
  + String.raw`(?:\s*の\s*区間)?(?:\s*で)?\s*[、,]?\s*`;
const JAPANESE_WASHER = new RegExp(
  JAPANESE_PREFIX
    + `${CURVE_LABEL}` + String.raw`(.+?)\s*と\s*`
    + `${CURVE_LABEL}` + String.raw`(.+?)\s*の\s*(?:間|あいだ)\s*の?\s*(?:部分|領域)\s*を\s*`
    + ROTATION_TAIL + "$",
  "iu",
);
const JAPANESE_DISK = new RegExp(
  JAPANESE_PREFIX
    + `${CURVE_LABEL}` + String.raw`(.+?)\s*と\s*x\s*軸\s*の\s*(?:間|あいだ)\s*の?\s*`
    + String.raw`(?:部分|領域)\s*を\s*` + ROTATION_TAIL + "$",
  "iu",
);

function response({
  recognized,
  ok = false,
  form = "",
  outerExpression = "",
  innerExpression = "",
  lowerSource = "",
  upperSource = "",
  error = "",
  errorCode = "",
}) {
  return Object.freeze({
    recognized: recognized === true,
    ok: ok === true,
    form,
    outerExpression,
    innerExpression,
    lowerSource,
    upperSource,
    error,
    errorCode,
  });
}

function normalizeOuter(value) {
  return normalizeMathNotation(value)
    .replace(/[−–—﹣－]/gu, "-")
    .replace(/[×·⋅∙]/gu, "*")
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
  const prefix = /^volume_([a-z]+(?:_[a-z]+)*)_\s*\[/iu.exec(text);
  if (!prefix) return null;
  if (!["x_axis", "xaxis", "x"].includes(prefix[1].toLowerCase())) {
    return { unsupportedAxis: true };
  }
  const bracketStart = prefix[0].lastIndexOf("[");
  const bracketEnd = matchingEnd(text, bracketStart, "[", "]");
  if (bracketEnd < 0) return { malformed: true };
  let index = bracketEnd;
  while (/\s/u.test(text[index] ?? "")) index += 1;
  if (text[index] !== "(") return { malformed: true };
  const expressionEnd = matchingEnd(text, index, "(", ")");
  if (expressionEnd !== text.length) return { malformed: true };
  const bounds = splitTopLevel(text.slice(bracketStart + 1, bracketEnd - 1), ",");
  const expressions = splitTopLevel(text.slice(index + 1, expressionEnd - 1), ";");
  if (bounds?.length !== 2 || ![1, 2].includes(expressions?.length)) {
    return { malformed: true };
  }
  return {
    lower: bounds[0],
    upper: bounds[1],
    outer: expressions[0],
    inner: expressions.length === 2 ? expressions[1] : "0",
  };
}

function japaneseCandidate(text) {
  const washer = JAPANESE_WASHER.exec(text);
  if (washer) {
    return {
      lower: washer[1],
      upper: washer[2],
      outer: washer[3],
      inner: washer[4],
    };
  }
  const disk = JAPANESE_DISK.exec(text);
  if (!disk) return null;
  return {
    lower: disk[1],
    upper: disk[2],
    outer: disk[3],
    inner: "0",
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
    return {
      ok: false,
      source: "",
      error: `${label}を入力してください。`,
      errorCode: "MISSING_VOLUME_BOUND",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: `${label}では科学記数法の連結表記を解釈しません。`,
      errorCode: "AMBIGUOUS_VOLUME_BOUND_SCIENTIFIC_NOTATION",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: `${label}の数字を空白だけで並べないでください。`,
      errorCode: "AMBIGUOUS_VOLUME_BOUND_NUMBER_SPACING",
    };
  }
  const compact = source.replace(/\s+/gu, "");
  if (!/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)|(?:\d+\/\d+))$/u.test(compact)) {
    return {
      ok: false,
      source: "",
      error: `${label}は符号付き整数・有限小数・明示分数にしてください。`,
      errorCode: "UNSUPPORTED_VOLUME_BOUND",
    };
  }
  if ((compact.match(/\d+/gu) ?? []).some((digits) => (
    digits.length > MAX_BOUND_COMPONENT_DIGITS
  ))) {
    return {
      ok: false,
      source: "",
      error: `${label}の数値が長すぎます。`,
      errorCode: "VOLUME_BOUND_COMPONENT_TOO_LONG",
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
      error: error.message || `${label}を厳密な数として解釈できません。`,
      errorCode: error.code || "INVALID_VOLUME_BOUND",
    };
  }
}

function validateExpression(value, label) {
  const source = String(value ?? "").trim();
  if (!source) {
    return {
      ok: false,
      expression: "",
      error: `${label}の式を入力してください。`,
      errorCode: "MISSING_VOLUME_EXPRESSION",
    };
  }
  if (RELATION_PATTERN.test(source)) {
    return {
      ok: false,
      expression: "",
      error: `${label}の式に等式や不等式を付けないでください。`,
      errorCode: "VOLUME_RELATION_ATTACHED",
    };
  }
  if (/[xX]\s*(?:\d|\.\d)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "xの直後の数字は曖昧です。指数ならx^2、積ならx*2と入力してください。",
      errorCode: "AMBIGUOUS_VOLUME_X_SUFFIX",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "数字を空白だけで並べず、演算子を入力してください。",
      errorCode: "AMBIGUOUS_VOLUME_NUMBER_SPACING",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "科学記数法の連結表記は解釈しません。",
      errorCode: "AMBIGUOUS_VOLUME_SCIENTIFIC_NOTATION",
    };
  }
  if (/pi\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "piの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_VOLUME_PI_MULTIPLICATION",
    };
  }
  if (/(?:^|[^A-Za-z])e\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "eの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_VOLUME_E_MULTIPLICATION",
    };
  }
  if (hasAmbiguousDivisionMultiplication(source)) {
    return {
      ok: false,
      expression: "",
      error: "割り算の直後の暗黙の掛け算は曖昧です。分母と積を括弧や*で明示してください。",
      errorCode: "AMBIGUOUS_VOLUME_DIVISION_MULTIPLICATION",
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
      errorCode: unsupported
        ? "UNSUPPORTED_VOLUME_EXPRESSION"
        : error.code || "INVALID_VOLUME_EXPRESSION",
    };
  }
}

function validateCandidate(candidate) {
  const outer = validateExpression(candidate.outer, "外半径");
  if (!outer.ok) {
    return response({ recognized: true, error: outer.error, errorCode: outer.errorCode });
  }
  const inner = validateExpression(candidate.inner, "内半径");
  if (!inner.ok) {
    return response({ recognized: true, error: inner.error, errorCode: inner.errorCode });
  }
  const lower = validateBound(candidate.lower, "回転区間の下端");
  if (!lower.ok) {
    return response({ recognized: true, error: lower.error, errorCode: lower.errorCode });
  }
  const upper = validateBound(candidate.upper, "回転区間の上端");
  if (!upper.ok) {
    return response({ recognized: true, error: upper.error, errorCode: upper.errorCode });
  }
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
      error: "回転区間の下端が上端より小さくなるように指定してください。",
      errorCode: "INVALID_VOLUME_INTERVAL_ORDER",
    });
  }
  return response({
    recognized: true,
    ok: true,
    form: "explicit-x-axis",
    outerExpression: outer.expression,
    innerExpression: inner.expression,
    lowerSource: lower.source,
    upperSource: upper.source,
  });
}

function hasAnswerAttached(text) {
  return /\)\s*(?:=|:|：|答え|体積\s*(?:は|=|:|：))/u.test(text)
    || /(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)\s*[。.!！?？]?\s*(?:答え|=|:|：|体積\s*は)/u.test(text);
}

export function parsePolynomialVolumeInput(question) {
  const raw = String(question ?? "");
  const recognitionEdge = MAX_INPUT_LENGTH + 1;
  const recognitionSource = raw.length <= recognitionEdge
    ? raw
    : `${raw.slice(0, recognitionEdge)}\n${raw.slice(-recognitionEdge)}`;
  const recognitionSample = normalizeOuter(recognitionSource);
  const rawRecognized = VOLUME_CUE.test(recognitionSample) || RAW_VOLUME_MARKER.test(raw);
  if (raw.length > MAX_INPUT_LENGTH) {
    return response({
      recognized: rawRecognized,
      error: "入力が長すぎます。",
      errorCode: "VOLUME_INPUT_TOO_LONG",
    });
  }
  const text = normalizeOuter(raw);
  const recognized = VOLUME_CUE.test(text);
  if (!recognized) {
    return response({ recognized: false, error: "x軸回転体の体積問題を検出できません。" });
  }
  if (UNSUPPORTED_SCRIPT_CHARACTER.test(raw)) {
    return response({
      recognized: true,
      error: "下付き文字または未対応の上付き文字は式の意味が曖昧になるため解釈できません。",
      errorCode: "AMBIGUOUS_VOLUME_SCRIPT_CHARACTER",
    });
  }
  if (hasAmbiguousSuperscriptSequence(raw)) {
    return response({
      recognized: true,
      error: "上付き指数は先頭の符号1個と、それに続く数字だけで入力してください。",
      errorCode: "AMBIGUOUS_VOLUME_SUPERSCRIPT_SEQUENCE",
    });
  }
  if (hasAmbiguousSuperscriptBoundary(raw)) {
    return response({
      recognized: true,
      error: "上付き指数の直後へ通常の数字を続けることはできません。",
      errorCode: "AMBIGUOUS_VOLUME_SUPERSCRIPT_BOUNDARY",
    });
  }
  if (DESTRUCTIVE_LATEX_DELIMITER.test(raw.normalize("NFKC"))) {
    return response({
      recognized: true,
      error: "\\leftと\\rightは位置情報を失うため使用できません。通常の丸括弧を使用してください。",
      errorCode: "AMBIGUOUS_VOLUME_LATEX_DELIMITER",
    });
  }
  if (hasAmbiguousCompatibilityNormalization(raw)) {
    return response({
      recognized: true,
      error: "互換文字が通常の英数字へ変化するため式の意味を確定できません。",
      errorCode: "AMBIGUOUS_VOLUME_COMPATIBILITY_CHARACTER",
    });
  }
  if (hasAnswerAttached(text)) {
    return response({
      recognized: true,
      error: "体積問題に答えや追加の等式を付けないでください。",
      errorCode: "VOLUME_ANSWER_ATTACHED",
    });
  }
  if (DIAGRAM_CUE.test(text)) {
    return response({
      recognized: true,
      error: "図・グラフ・斜線から領域を読み取る回転体問題には対応していません。",
      errorCode: "UNSUPPORTED_DIAGRAM_VOLUME",
    });
  }
  if (UNSUPPORTED_JAPANESE_AXIS.test(text)) {
    return response({
      recognized: true,
      error: "現在はx軸のまわりに回転する体積だけに対応しています。",
      errorCode: "UNSUPPORTED_VOLUME_AXIS",
    });
  }
  const candidate = symbolicCandidate(text);
  if (candidate?.unsupportedAxis) {
    return response({
      recognized: true,
      error: "現在はx軸のまわりに回転する体積だけに対応しています。",
      errorCode: "UNSUPPORTED_VOLUME_AXIS",
    });
  }
  const parsedCandidate = candidate ?? japaneseCandidate(text);
  if (!parsedCandidate || parsedCandidate.malformed) {
    return response({
      recognized: true,
      error: "体積はvolume_x_axis_[a,b](R)、volume_x_axis_[a,b](R;r)、または対応する完全な日本語形式で入力してください。",
      errorCode: "MALFORMED_VOLUME_INPUT",
    });
  }
  try {
    return validateCandidate(parsedCandidate);
  } catch (error) {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialIntegralError
      || error instanceof RangeError
      || error instanceof TypeError
    ) {
      return response({
        recognized: true,
        error: error.message || "回転体の体積入力を厳密に検証できませんでした。",
        errorCode: error.code || "INVALID_VOLUME_INPUT",
      });
    }
    throw error;
  }
}

export default parsePolynomialVolumeInput;
