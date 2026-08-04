import { classifyCategory } from "../category-classifier.js";
import { solveAlgebraTransformation } from "./algebra-transformation.js";
import { solveBaseConversion } from "./base-conversion.js";
import { solveDerivative, solveIndefiniteIntegral } from "./calculus.js";
import { solveExponentialEquation } from "./exponential-equation.js";
import { solveLinearEquation } from "./linear-equation.js";
import { solveLinearInequality } from "./linear-inequality.js";
import { solveLinearSystem } from "./linear-system.js";
import { solveLogarithmicEquation } from "./logarithmic-equation.js";
import { solvePercentage } from "./percentage.js";
import { solveQuadraticEquation } from "./quadratic-equation.js";
import { solveQuadraticInequality } from "./quadratic-inequality.js";
import { solveRationalEquation } from "./rational-equation.js";
import { unsupportedResult } from "./utils.js";

export {
  solveAlgebraTransformation,
  solveBaseConversion,
  solveDerivative,
  solveExponentialEquation,
  solveIndefiniteIntegral,
  solveLinearEquation,
  solveLinearInequality,
  solveLinearSystem,
  solveLogarithmicEquation,
  solvePercentage,
  solveQuadraticEquation,
  solveQuadraticInequality,
  solveRationalEquation,
};

export const SOLVERS = Object.freeze([
  solveLinearSystem,
  solveQuadraticInequality,
  solveLinearInequality,
  solveBaseConversion,
  solvePercentage,
  solveLogarithmicEquation,
  solveExponentialEquation,
  solveRationalEquation,
  solveQuadraticEquation,
  solveLinearEquation,
]);

const CATEGORY_SOLVERS = Object.freeze({
  "一次方程式": [solveRationalEquation, solveLinearEquation],
  "分数方程式": [solveRationalEquation],
  "不等式": [solveQuadraticInequality, solveLinearInequality],
  "連立方程式": [solveLinearSystem],
  "二次方程式": [solveRationalEquation, solveQuadraticEquation],
  "指数・対数": [solveLogarithmicEquation, solveExponentialEquation],
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
  let recognizedUnsupported = null;
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
    if (result.recognized === true) {
      recognizedUnsupported ??= result;
      if (preserveRecognizedFailure) return result;
    }
    lastUnsupported = result;
  }
  return recognizedUnsupported
    ?? lastUnsupported
    ?? unsupportedResult("対応するソルバーがありません");
}

export function solveQuestion(question, options = {}) {
  const category = normalizedCategory(options.category, question);
  const preferred = CATEGORY_SOLVERS[category] ?? [];
  const remaining = SOLVERS.filter((solver) => !preferred.includes(solver));
  if (preferred.length) {
    const preferredResult = runSolvers(question, preferred, { preserveRecognizedFailure: true });
    if (preferredResult.supported || preferredResult.recognized === true) {
      return preferredResult;
    }
  }
  return runSolvers(question, remaining);
}

export const solveProblem = solveQuestion;
export const trySolve = solveQuestion;
export const solveWithLocalSolver = solveQuestion;

export async function solveQuestionAsync(question, options = {}) {
  const category = normalizedCategory(options.category, question);
  const asynchronousSolvers = category === "微分"
    ? [solveDerivative, solveIndefiniteIntegral, solveAlgebraTransformation]
    : category === "積分"
      ? [solveIndefiniteIntegral, solveDerivative, solveAlgebraTransformation]
      : [solveAlgebraTransformation, solveDerivative, solveIndefiniteIntegral];
  const preferAsynchronous = ["式の計算", "微分", "積分"].includes(category);
  let immediate = null;
  if (!preferAsynchronous) {
    immediate = solveQuestion(question, options);
    if (immediate.supported || immediate.recognized === true) return immediate;
  }
  let lastUnsupported = immediate;
  for (const solver of asynchronousSolvers) {
    const result = await solver(question, {
      symbolicOperations: options.symbolicOperations,
    });
    if (result.supported) return result;
    lastUnsupported = result;
  }
  if (preferAsynchronous) {
    immediate = solveQuestion(question, options);
    if (immediate.supported) return immediate;
  }
  return lastUnsupported ?? immediate;
}

export default solveQuestion;
