import { parseMathExpression } from "../math-core/expression-parser.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { hasAmbiguousDivisionMultiplication } from "./equation-input.js";

const MAX_INPUT_LENGTH = 5_000;
const MAX_BOUND_COMPONENT_DIGITS = 512;
const SUBSCRIPT_PATTERN = /[₀₁₂₃₄₅₆₇₈₉₊₋]/u;
const RELATION_PATTERN = /[=<>≤≥≦≧]/u;

const DECIMAL_SOURCE = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const FRACTION_SOURCE = String.raw`[+-]?\d+\s*\/\s*\d+`;
const BOUND_CORE_SOURCE = `(?:${FRACTION_SOURCE}|${DECIMAL_SOURCE})`;
const PARENTHESIZED_BOUND_SOURCE = String.raw`\(\s*(${BOUND_CORE_SOURCE})\s*\)`;
const PLAIN_BOUND_SOURCE = `(${BOUND_CORE_SOURCE})`;
const INSTRUCTION_SOURCE = String.raw`(?:定積分|積分)(?:せよ|しなさい|してください|を求めよ|を求めなさい|を計算せよ|を計算しなさい)?`;

const NOTATION_WITH_PARENTHESIZED_UPPER = new RegExp(
  `^∫\\s*_\\s*(?:${PARENTHESIZED_BOUND_SOURCE}|${PLAIN_BOUND_SOURCE})`
    + `\\s*\\^\\s*${PARENTHESIZED_BOUND_SOURCE}\\s*(.+?)\\s*d\\s*x`
    + String.raw`\s*(?:を(?:求めよ|求めなさい|計算せよ|計算しなさい))?$`,
  "iu",
);

const NOTATION_WITH_PLAIN_UPPER = new RegExp(
  `^∫\\s*_\\s*(?:${PARENTHESIZED_BOUND_SOURCE}|${PLAIN_BOUND_SOURCE})`
    + `\\s*\\^\\s*${PLAIN_BOUND_SOURCE}\\s+(.+?)\\s*d\\s*x`
    + String.raw`\s*(?:を(?:求めよ|求めなさい|計算せよ|計算しなさい))?$`,
  "iu",
);

const JAPANESE_BOUNDS_FIRST = new RegExp(
  `^(?:次の)?\\s*(.+?)\\s*から\\s*(.+?)\\s*まで\\s*(.+?)\\s*を\\s*${INSTRUCTION_SOURCE}$`,
  "u",
);

const JAPANESE_EXPRESSION_FIRST = new RegExp(
  `^(?:次の)?\\s*(.+?)\\s*を\\s*(.+?)\\s*から\\s*(.+?)\\s*まで\\s*${INSTRUCTION_SOURCE}$`,
  "u",
);

function response({
  recognized,
  ok = false,
  expression = "",
  lowerSource = "",
  upperSource = "",
  error = "",
  errorCode = "",
}) {
  return Object.freeze({
    recognized: recognized === true,
    ok: ok === true,
    expression,
    lowerSource,
    upperSource,
    error,
    errorCode,
  });
}

function cleanRequest(value) {
  return normalizeMathNotation(value)
    .replace(/[。．.!！?？]+$/gu, "")
    .trim();
}

function hasExplicitDefiniteCue(value) {
  return /定積分/u.test(String(value ?? "").replace(/不定積分/gu, ""));
}

function hasJapaneseBoundShape(value) {
  const source = String(value ?? "");
  return /から[\s\S]*まで/u.test(source) && /積分/u.test(source);
}

function hasIntegralBoundShape(value) {
  const source = String(value ?? "");
  return (
    /∫\s*[_^]/u.test(source)
    || /∫\s*[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*\^/u.test(source)
    || /∫\s*\(\s*[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)|(?:\d+\s*\/\s*\d+))\s*\)\s*\^/u.test(source)
    || /∫\s*[^\s^()]*pi[^\s^()]*\s*\^/iu.test(source)
    || /∫\s*\([^\r\n)]*pi[^\r\n)]*\)\s*\^/iu.test(source)
  );
}

function looksDefinite(raw, normalized = "") {
  return hasExplicitDefiniteCue(raw)
    || hasExplicitDefiniteCue(normalized)
    || hasJapaneseBoundShape(raw)
    || hasJapaneseBoundShape(normalized)
    || hasIntegralBoundShape(raw)
    || hasIntegralBoundShape(normalized)
    || (/∫/u.test(raw) && SUBSCRIPT_PATTERN.test(raw));
}

function unwrapBound(value) {
  let source = String(value ?? "").trim();
  if (source.startsWith("(") && source.endsWith(")")) {
    source = source.slice(1, -1).trim();
  }
  return source.replace(/\s+/gu, "");
}

function validateBound(value) {
  const source = unwrapBound(value);
  const decimal = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/u.exec(source);
  if (decimal) {
    const digitCount = `${decimal[2] ?? ""}${decimal[3] ?? decimal[4] ?? ""}`.length;
    if (digitCount > MAX_BOUND_COMPONENT_DIGITS) {
      return { ok: false, source: "", error: "積分区間の数値が長すぎます。" };
    }
    return { ok: true, source, error: "" };
  }

  const fraction = /^([+-]?)(\d+)\/(\d+)$/u.exec(source);
  if (!fraction) {
    return {
      ok: false,
      source: "",
      error: "積分区間の上下限は、符号付き整数・有限小数・明示分数で入力してください。",
    };
  }
  if (
    fraction[2].length > MAX_BOUND_COMPONENT_DIGITS
    || fraction[3].length > MAX_BOUND_COMPONENT_DIGITS
  ) {
    return { ok: false, source: "", error: "積分区間の数値が長すぎます。" };
  }
  if (BigInt(fraction[3]) === 0n) {
    return { ok: false, source: "", error: "積分区間の分母を0にはできません。" };
  }
  return { ok: true, source, error: "" };
}

function elementaryFunctionNotationError(value) {
  const source = String(value ?? "");
  for (const match of source.matchAll(/exp|sin|cos/giu)) {
    const functionName = match[0].toLowerCase();
    const functionStart = match.index;
    if (
      ["sin", "cos"].includes(functionName)
      && source.slice(Math.max(0, functionStart - 3), functionStart).toLowerCase() === "arc"
    ) {
      continue;
    }

    const openingIndex = skipSpaces(source, functionStart + match[0].length);
    if (source[openingIndex] !== "(") {
      return "sin・cos・expの引数は括弧で囲み、sin(x)の形式で入力してください。";
    }

    const closingEnd = parenthesizedEnd(source, openingIndex);
    if (closingEnd < 0) {
      return "sin・cos・expの引数を囲む括弧を閉じてください。";
    }
    const followingIndex = skipSpaces(source, closingEnd);
    if (/^(?:\d|\.\d)/u.test(source.slice(followingIndex))) {
      return "関数の直後の数字は曖昧です。掛け算ならexp(x)*2、累乗ならexp(x)^2と入力してください。";
    }
  }
  return "";
}

function validatedCandidate(expressionValue, lowerValue, upperValue) {
  const lower = validateBound(lowerValue);
  if (!lower.ok) return response({ recognized: true, error: lower.error });
  const upper = validateBound(upperValue);
  if (!upper.ok) return response({ recognized: true, error: upper.error });

  const expression = String(expressionValue ?? "").trim();
  if (!expression) {
    return response({ recognized: true, error: "被積分関数を入力してください。" });
  }
  if (RELATION_PATTERN.test(expression)) {
    return response({ recognized: true, error: "定積分の入力に等式や不等式を付けないでください。" });
  }
  if (/[xX]\s*(?:\d|\.\d)/u.test(expression)) {
    return response({
      recognized: true,
      error: "xの直後の数字は曖昧です。係数なら2x、累乗ならx^2と入力してください。",
    });
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(expression)) {
    return response({
      recognized: true,
      error: "数字を空白だけで並べず、掛け算なら*を入力してください。",
    });
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(expression)) {
    return response({
      recognized: true,
      error: "科学記数法の連結表記は解釈しません。有限小数で入力するか、Euler数との掛け算なら*を明示してください。",
    });
  }
  if (hasAmbiguousDivisionMultiplication(expression)) {
    return response({
      recognized: true,
      error: "割り算の直後の暗黙の掛け算は曖昧です。分母と続く掛け算を括弧や*で明示してください。",
    });
  }
  const functionNotationError = elementaryFunctionNotationError(expression);
  if (functionNotationError) {
    return response({ recognized: true, error: functionNotationError });
  }
  try {
    const parsed = parseMathExpression(expression, { symbols: ["x"] });
    return response({
      recognized: true,
      ok: true,
      expression: parsed.normalized,
      lowerSource: lower.source,
      upperSource: upper.source,
    });
  } catch (error) {
    return response({
      recognized: true,
      error: error.message || "被積分関数を解釈できません。",
      errorCode: error.code || "",
    });
  }
}

function notationCandidate(text) {
  let match = text.match(NOTATION_WITH_PARENTHESIZED_UPPER);
  if (match) {
    const lower = match[1] ?? match[2];
    return { lower, upper: match[3], expression: match[4] };
  }
  match = text.match(NOTATION_WITH_PLAIN_UPPER);
  if (!match) return null;
  const lower = match[1] ?? match[2];
  return { lower, upper: match[3], expression: match[4] };
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

function skipSpaces(text, start) {
  let index = start;
  while (/\s/u.test(text[index] ?? "")) index += 1;
  return index;
}

function relaxedNotationCandidate(text) {
  let index = skipSpaces(text, 0);
  if (text[index] !== "∫") return null;
  index = skipSpaces(text, index + 1);
  if (text[index] !== "_") return null;
  index = skipSpaces(text, index + 1);

  const lowerStart = index;
  if (text[index] === "(") {
    index = parenthesizedEnd(text, index);
    if (index < 0) return null;
  } else {
    const marker = text.indexOf("^", index);
    if (marker < 0) return null;
    index = marker;
  }
  const lower = text.slice(lowerStart, index).trim();
  index = skipSpaces(text, index);
  if (text[index] !== "^") return null;
  index = skipSpaces(text, index + 1);

  const upperStart = index;
  if (text[index] === "(") {
    index = parenthesizedEnd(text, index);
    if (index < 0) return null;
  } else {
    while (index < text.length && !/\s/u.test(text[index])) index += 1;
  }
  const upper = text.slice(upperStart, index).trim();
  const remainder = text.slice(index).trim();
  const expressionMatch = remainder.match(
    /^(.+?)\s*d\s*x\s*(?:を(?:求めよ|求めなさい|計算せよ|計算しなさい))?$/iu,
  );
  if (!lower || !upper || !expressionMatch) return null;
  return { lower, upper, expression: expressionMatch[1] };
}

function japaneseCandidate(text) {
  const boundsFirst = text.match(JAPANESE_BOUNDS_FIRST);
  if (boundsFirst) {
    return {
      lower: boundsFirst[1],
      upper: boundsFirst[2],
      expression: boundsFirst[3],
    };
  }
  const expressionFirst = text.match(JAPANESE_EXPRESSION_FIRST);
  if (!expressionFirst) return null;
  return {
    expression: expressionFirst[1],
    lower: expressionFirst[2],
    upper: expressionFirst[3],
  };
}

export function parseDefiniteIntegralInput(question) {
  const raw = String(question ?? "");
  const rawLooksDefinite = looksDefinite(raw);
  if (raw.length > MAX_INPUT_LENGTH) {
    return rawLooksDefinite
      ? response({ recognized: true, error: "入力が長すぎます。" })
      : response({ recognized: false, error: "定積分を検出できません。" });
  }

  const text = cleanRequest(raw);
  const recognized = looksDefinite(raw, text);
  if (!recognized) {
    return response({ recognized: false, error: "定積分を検出できません。" });
  }
  if (/不定積分/u.test(text)) {
    return response({
      recognized: true,
      error: "定積分と不定積分の指示が矛盾しています。",
    });
  }
  if (/∫/u.test(raw) && SUBSCRIPT_PATTERN.test(raw)) {
    return response({
      recognized: true,
      error: "下付き文字の積分区間は曖昧です。_下限^上限の形式で入力してください。",
    });
  }
  if (RELATION_PATTERN.test(text)) {
    return response({
      recognized: true,
      error: "定積分の入力に答えの等式や不等式を付けないでください。",
    });
  }

  const candidate = notationCandidate(text)
    ?? relaxedNotationCandidate(text)
    ?? japaneseCandidate(text);
  if (!candidate) {
    return response({
      recognized: true,
      error: "定積分は上下限・被積分関数・積分変数xを完全に入力してください。",
    });
  }
  return validatedCandidate(candidate.expression, candidate.lower, candidate.upper);
}

export default parseDefiniteIntegralInput;
