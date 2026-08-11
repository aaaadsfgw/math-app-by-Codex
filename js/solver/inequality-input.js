import { normalizeMathNotation } from "../math-core/notation.js";
import { hasAmbiguousDivisionMultiplication } from "./equation-input.js";

const INEQUALITY_CUE = /不等式/u;
const RELATION_PATTERN = /<=|>=|=|<|>/gu;
const MAX_INEQUALITY_INPUT_LENGTH = 5_000;

export function normalizeInequalityNotation(value) {
  return normalizeMathNotation(value)
    .replace(/[≤≦]/gu, "<=")
    .replace(/[≥≧]/gu, ">=")
    .replace(/[。．.!！?？]+$/gu, "")
    .trim();
}

function removeInstructionWrapper(value) {
  return value
    .replace(
      /^(?:次の)?(?:一次|二次|有理|分数)?不等式\s*(?:を\s*(?:解いてください|解きなさい|解きましょう|解いて|解け))?\s*[:：]?\s*/u,
      "",
    )
    .replace(
      /\s*(?:(?:を\s*)?(?:解いてください|解きなさい|解きましょう|解いて|解け)|の解を求めよ|の解を求めなさい)\s*$/u,
      "",
    )
    .trim();
}

export function parseInequalityInput(question) {
  const raw = String(question ?? "");
  if (raw.length > MAX_INEQUALITY_INPUT_LENGTH) {
    return {
      ok: false,
      recognized: INEQUALITY_CUE.test(raw) || /[<>≤≥≦≧]/u.test(raw),
      error: "入力が長すぎます。",
    };
  }
  const normalized = normalizeInequalityNotation(question);
  const recognized = INEQUALITY_CUE.test(normalized) || /[<>]/u.test(normalized);
  if (!recognized) {
    return {
      ok: false,
      recognized: false,
      error: "不等式を検出できません。",
    };
  }

  const source = removeInstructionWrapper(normalized);
  if (/[xX]\s*(?:\d|\.\d)/u.test(source)) {
    return {
      ok: false,
      recognized: true,
      error: "xの直後の数字は曖昧です。係数なら2x、累乗ならx^2と入力してください。",
    };
  }
  const relations = [...source.matchAll(RELATION_PATTERN)];
  if (relations.length !== 1 || relations[0][0] === "=") {
    return {
      ok: false,
      recognized: true,
      error: "不等号は1つにしてください。連立不等式と三項不等式はまだ未対応です。",
    };
  }
  const operator = relations[0][0];
  const index = relations[0].index;
  const leftSource = source.slice(0, index).trim();
  const rightSource = source.slice(index + operator.length).trim();
  if (!leftSource || !rightSource) {
    return {
      ok: false,
      recognized: true,
      error: "不等号の両側に式が必要です。",
    };
  }
  if (
    hasAmbiguousDivisionMultiplication(leftSource)
    || hasAmbiguousDivisionMultiplication(rightSource)
  ) {
    return {
      ok: false,
      recognized: true,
      error: "割り算の直後の暗黙の掛け算は曖昧です。分母と続く掛け算を括弧や*で明示してください。",
    };
  }
  return {
    ok: true,
    recognized: true,
    normalized,
    source,
    leftSource,
    rightSource,
    operator,
  };
}
