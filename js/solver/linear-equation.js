import {
  EPSILON,
  evaluatePolynomial,
  failedResult,
  formatNumber,
  nearlyEqual,
  parsePolynomialEquation,
  solvedResult,
  unsupportedResult,
} from "./utils.js";

export const LINEAR_SOLVER_ID = "linear-equation";

function formatStandardForm(coefficient, constant) {
  const coefficientText = coefficient === 1 ? "" : coefficient === -1 ? "-" : formatNumber(coefficient);
  const constantText = nearlyEqual(constant, 0)
    ? ""
    : `${constant > 0 ? "+" : "-"}${formatNumber(Math.abs(constant))}`;
  return `${coefficientText}x${constantText}=0`;
}

export function solveLinearEquation(question) {
  const parsed = parsePolynomialEquation(question);
  if (!parsed.ok) {
    return parsed.unsupported
      ? unsupportedResult(parsed.error)
      : failedResult(LINEAR_SOLVER_ID, parsed.error);
  }

  const [constant, coefficient] = parsed.coefficients;
  const hasHigherTerm = parsed.coefficients.slice(2).some((value) => Math.abs(value) > EPSILON);
  if (hasHigherTerm) return unsupportedResult("一次方程式ではありません");

  if (nearlyEqual(coefficient, 0)) {
    if (nearlyEqual(constant, 0)) {
      return solvedResult({
        answer: "すべての実数",
        steps: [parsed.equation, "両辺は常に等しい"],
        verification: "式を整理すると0=0となるため、すべての実数で成立します",
        solverId: LINEAR_SOLVER_ID,
      });
    }
    return solvedResult({
      answer: "解なし",
      steps: [parsed.equation, `${formatNumber(constant)}=0となり矛盾`],
      verification: "xの項が消え、0ではない定数だけが残るため成立するxはありません",
      solverId: LINEAR_SOLVER_ID,
    });
  }

  const solution = -constant / coefficient;
  if (!Number.isFinite(solution)) return failedResult(LINEAR_SOLVER_ID, "解を有限値として計算できません");
  const residual = evaluatePolynomial(parsed.coefficients, solution);
  if (!nearlyEqual(residual, 0, 1e-8)) {
    return failedResult(LINEAR_SOLVER_ID, "代入検証に失敗しました");
  }

  const answer = `x=${formatNumber(solution)}`;
  return solvedResult({
    answer,
    steps: [
      parsed.equation,
      formatStandardForm(coefficient, constant),
      `${formatNumber(coefficient)}x=${formatNumber(-constant)}`,
      answer,
    ],
    verification: `${answer}を元の式に代入すると両辺が一致します（差=${formatNumber(residual)}）`,
    solverId: LINEAR_SOLVER_ID,
  });
}

export default solveLinearEquation;
