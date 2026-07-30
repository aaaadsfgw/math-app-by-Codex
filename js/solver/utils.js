import {
  createInvalidMathResult,
  createSolvedMathResult,
  createUnsupportedMathResult,
  toLegacySolverResult,
} from "../math-core/result.js";

const EPSILON = 1e-9;

export { EPSILON };

export function normalizeMathText(value) {
  return String(value ?? "")
    .replace(/[²²]/g, "^2")
    .replace(/[³³]/g, "^3")
    .normalize("NFKC")
    .replace(/[−‐-―−]/g, "-")
    .replace(/[×·∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[＝]/g, "=")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/％/g, "%")
    .replace(/[ｘＸX]/g, "x")
    .trim();
}

export function nearlyEqual(left, right, epsilon = EPSILON) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= epsilon * scale;
}

export function cleanNumber(value, epsilon = EPSILON) {
  if (!Number.isFinite(value)) return value;
  if (Math.abs(value) <= epsilon) return 0;
  const nearestInteger = Math.round(value);
  if (nearlyEqual(value, nearestInteger, epsilon)) return nearestInteger;
  return value;
}

export function formatNumber(value, maximumFractionDigits = 10) {
  const cleaned = cleanNumber(Number(value));
  if (!Number.isFinite(cleaned)) return String(cleaned);
  if (Number.isInteger(cleaned)) return String(cleaned);
  return cleaned.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits,
  });
}

export function unsupportedResult(error = "未対応形式") {
  return toLegacySolverResult(createUnsupportedMathResult({ reason: error }));
}

export function failedResult(solverId, error) {
  return toLegacySolverResult(createInvalidMathResult({
    reason: error,
    code: "SOLVER_INPUT_ERROR",
    domain: solverId,
  }));
}

export function solvedResult({
  answer,
  exactAnswer = "",
  approximateAnswer = "",
  conditions = [],
  kind = "exact",
  metadata = {},
  solutionSet = null,
  steps = [],
  verification,
  solverId,
}) {
  return toLegacySolverResult(createSolvedMathResult({
    kind,
    answer,
    exactAnswer,
    approximateAnswer,
    conditions,
    metadata,
    solutionSet,
    steps,
    verification: {
      method: "solver-specific-check",
      evidence: verification,
    },
    domain: solverId,
    solverId,
  }));
}
