import { classifyCategory } from "../category-classifier.js";
import { solveAlgebraTransformation } from "./algebra-transformation.js";
import { solveBaseConversion } from "./base-conversion.js";
import { solveLinearEquation } from "./linear-equation.js";
import { solveLinearInequality } from "./linear-inequality.js";
import { solveLinearSystem } from "./linear-system.js";
import { solvePercentage } from "./percentage.js";
import { solveQuadraticEquation } from "./quadratic-equation.js";
import { unsupportedResult } from "./utils.js";

export {
  solveAlgebraTransformation,
  solveBaseConversion,
  solveLinearEquation,
  solveLinearInequality,
  solveLinearSystem,
  solvePercentage,
  solveQuadraticEquation,
};

export const SOLVERS = Object.freeze([
  solveLinearSystem,
  solveLinearInequality,
  solveBaseConversion,
  solvePercentage,
  solveQuadraticEquation,
  solveLinearEquation,
]);

const CATEGORY_SOLVERS = Object.freeze({
  "一次方程式": [solveLinearEquation],
  "不等式": [solveLinearInequality],
  "連立方程式": [solveLinearSystem],
  "二次方程式": [solveQuadraticEquation],
  "基数変換": [solveBaseConversion],
  "パーセント": [solvePercentage],
});

function normalizedCategory(category, question) {
  if (typeof category === "string" && category) return category;
  if (category && typeof category === "object" && typeof category.primary === "string") return category.primary;
  if (typeof question === "string") return classifyCategory(question).primary;
  return "その他";
}

function runSolvers(input, solvers, { preserveRecognizedFailure = false } = {}) {
  let lastUnsupported = null;
  for (const solver of solvers) {
    let result;
    try {
      result = solver(input);
    } catch (error) {
      return {
        supported: true,
        solved: false,
        answer: "",
        steps: [],
        verified: false,
        verification: "",
        solverId: null,
        error: `ソルバー処理中にエラーが発生しました: ${error.message}`,
      };
    }
    if (result.supported && (result.solved || preserveRecognizedFailure)) return result;
    lastUnsupported = result;
  }
  return lastUnsupported ?? unsupportedResult("対応するソルバーがありません");
}

export function solveQuestion(question, options = {}) {
  const category = normalizedCategory(options.category, question);
  const preferred = CATEGORY_SOLVERS[category] ?? [];
  const remaining = SOLVERS.filter((solver) => !preferred.includes(solver));
  if (preferred.length) {
    const preferredResult = runSolvers(question, preferred, { preserveRecognizedFailure: true });
    if (preferredResult.supported) return preferredResult;
  }
  return runSolvers(question, remaining);
}

export const solveProblem = solveQuestion;
export const trySolve = solveQuestion;
export const solveWithLocalSolver = solveQuestion;

export async function solveQuestionAsync(question, options = {}) {
  const immediate = solveQuestion(question, options);
  if (immediate.supported) return immediate;
  return solveAlgebraTransformation(question, {
    symbolicOperations: options.symbolicOperations,
  });
}

export default solveQuestion;
