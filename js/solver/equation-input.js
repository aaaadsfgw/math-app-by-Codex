import { normalizeMathNotation } from "../math-core/notation.js";

const RELATION_PATTERN = /<=|>=|=|<|>/gu;
const MAX_EQUATION_INPUT_LENGTH = 5_000;

export function normalizeEquationNotation(value) {
  return normalizeMathNotation(value)
    .replace(/X/gu, "x")
    .replace(/[。．.!！?？]+$/gu, "")
    .trim();
}

function removeInstructionWrapper(value) {
  return value
    .replace(
      /^(?:次の)?(?:一次|二次|有理|分数)?方程式\s*(?:を\s*(?:解け|解きなさい|解いて|解いてください|解きましょう))?\s*[:：]?\s*/u,
      "",
    )
    .replace(/^次の式\s*[:：]?\s*/u, "")
    .replace(
      /\s*(?:(?:を\s*)?(?:解け|解きなさい|解いて|解いてください|解きましょう)|の解を求めよ|の解を求めなさい)\s*$/u,
      "",
    )
    .trim();
}

export function parseEquationInput(question) {
  const raw = String(question ?? "");
  if (raw.length > MAX_EQUATION_INPUT_LENGTH) {
    return {
      ok: false,
      recognized: /[=＝]/u.test(raw),
      error: "入力が長すぎます。",
    };
  }
  const normalized = normalizeEquationNotation(question);
  const recognized = normalized.includes("=");
  if (!recognized) {
    return {
      ok: false,
      recognized: false,
      error: "方程式を検出できません。",
    };
  }

  const source = removeInstructionWrapper(normalized);
  if (/x\s*\d/u.test(source)) {
    return {
      ok: false,
      recognized: true,
      error: "xの直後の数字は曖昧です。係数なら2x、累乗ならx^2と入力してください。",
    };
  }
  const relations = [...source.matchAll(RELATION_PATTERN)];
  if (relations.length !== 1 || relations[0][0] !== "=") {
    return {
      ok: false,
      recognized: true,
      error: "等号は1つにしてください。",
    };
  }
  const index = relations[0].index;
  const leftSource = source.slice(0, index).trim();
  const rightSource = source.slice(index + 1).trim();
  if (!leftSource || !rightSource) {
    return {
      ok: false,
      recognized: true,
      error: "等号の両側に式が必要です。",
    };
  }
  return {
    ok: true,
    recognized: true,
    normalized,
    source,
    leftSource,
    rightSource,
  };
}

function skipSpaces(source, start) {
  let index = start;
  while (/\s/u.test(source[index] ?? "")) index += 1;
  return index;
}

function consumeParenthesized(source, start) {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return source.length;
}

function consumePrimary(source, start) {
  let index = skipSpaces(source, start);
  while (source[index] === "+" || source[index] === "-") {
    index = skipSpaces(source, index + 1);
  }
  if (source[index] === "(") return consumeParenthesized(source, index);
  const number = /^(?:\d+(?:\.\d*)?|\.\d+)/u.exec(source.slice(index));
  if (number) return index + number[0].length;
  return /[A-Za-z]/u.test(source[index] ?? "") ? index + 1 : index;
}

function consumePower(source, start) {
  let index = consumePrimary(source, start);
  const powerIndex = skipSpaces(source, index);
  if (source[powerIndex] !== "^") return index;
  return consumePrimary(source, powerIndex + 1);
}

export function hasAmbiguousDivisionMultiplication(value) {
  const source = String(value ?? "");
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== "/") continue;
    const denominatorEnd = consumePower(source, index + 1);
    const next = source[skipSpaces(source, denominatorEnd)] ?? "";
    if (/[A-Za-z0-9.(]/u.test(next)) return true;
  }
  return false;
}
