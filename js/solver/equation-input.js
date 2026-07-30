import { normalizeMathNotation } from "../math-core/notation.js";

const RELATION_PATTERN = /<=|>=|=|<|>/gu;

export function normalizeEquationNotation(value) {
  return normalizeMathNotation(value)
    .replace(/X/gu, "x")
    .replace(/[。．.!！?？]+$/gu, "")
    .trim();
}

function removeInstructionWrapper(value) {
  return value
    .replace(
      /^(?:次の)?(?:一次|二次)?方程式\s*(?:を\s*(?:解け|解きなさい|解いて|解いてください|解きましょう))?\s*[:：]?\s*/u,
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
