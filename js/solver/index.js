import { classifyCategory } from "../category-classifier.js";
import { solveAlgebraTransformation } from "./algebra-transformation.js";
import { solveBaseConversion } from "./base-conversion.js";
import {
  solveDefiniteIntegral,
  solveDerivative,
  solveIndefiniteIntegral,
} from "./calculus.js";
import { solveExponentialEquation } from "./exponential-equation.js";
import {
  FINITE_LIMIT_SOLVER_ID,
  solveFiniteLimit,
} from "./finite-limit.js";
import { solveLinearEquation } from "./linear-equation.js";
import { solveLinearInequality } from "./linear-inequality.js";
import { solveLinearSystem } from "./linear-system.js";
import { solveLogarithmicEquation } from "./logarithmic-equation.js";
import { parseInequalityInput } from "./inequality-input.js";
import { solvePercentage } from "./percentage.js";
import {
  POLYNOMIAL_AREA_SOLVER_ID,
  solvePolynomialArea,
} from "./polynomial-area.js";
import {
  POLYNOMIAL_TANGENT_SOLVER_ID,
  solvePolynomialTangent,
} from "./polynomial-tangent.js";
import {
  POLYNOMIAL_NORMAL_SOLVER_ID,
  solvePolynomialNormal,
} from "./polynomial-normal.js";
import {
  POLYNOMIAL_CONCAVITY_SOLVER_ID,
  solvePolynomialConcavity,
} from "./polynomial-concavity.js";
import {
  POLYNOMIAL_VARIATION_SOLVER_ID,
  solvePolynomialVariation,
} from "./polynomial-variation.js";
import {
  POLYNOMIAL_VOLUME_SOLVER_ID,
  solvePolynomialVolume,
} from "./polynomial-volume.js";
import { solveQuadraticEquation } from "./quadratic-equation.js";
import { solveQuadraticInequality } from "./quadratic-inequality.js";
import { solveRationalEquation } from "./rational-equation.js";
import { solveRationalInequality } from "./rational-inequality.js";
import { failedResult, unsupportedResult } from "./utils.js";

export {
  solveAlgebraTransformation,
  solveBaseConversion,
  solveDefiniteIntegral,
  solveDerivative,
  solveExponentialEquation,
  solveFiniteLimit,
  solveIndefiniteIntegral,
  solveLinearEquation,
  solveLinearInequality,
  solveLinearSystem,
  solveLogarithmicEquation,
  solvePercentage,
  solvePolynomialArea,
  solvePolynomialConcavity,
  solvePolynomialNormal,
  solvePolynomialTangent,
  solvePolynomialVariation,
  solvePolynomialVolume,
  solveQuadraticEquation,
  solveQuadraticInequality,
  solveRationalEquation,
  solveRationalInequality,
};

export const SOLVERS = Object.freeze([
  solveFiniteLimit,
  solveLinearSystem,
  solveRationalInequality,
  solveQuadraticInequality,
  solveLinearInequality,
  recognizedInequalityFallback,
  solveBaseConversion,
  solvePercentage,
  solveLogarithmicEquation,
  solveExponentialEquation,
  solveRationalEquation,
  solveQuadraticEquation,
  solveLinearEquation,
]);

function recognizedInequalityFallback(question) {
  const source = parseInequalityInput(question);
  const reason = source.ok
    ? "この不等式は現在の対応範囲外です。一次・二次多項式または対応済みの有理不等式を入力してください。"
    : source.error;
  return Object.freeze({
    ...unsupportedResult(reason),
    recognized: source.recognized === true,
  });
}

const CATEGORY_SOLVERS = Object.freeze({
  "一次方程式": [solveRationalEquation, solveLinearEquation],
  "分数方程式": [solveRationalEquation],
  "不等式": [
    solveRationalInequality,
    solveQuadraticInequality,
    solveLinearInequality,
    recognizedInequalityFallback,
  ],
  "連立方程式": [solveLinearSystem],
  "二次方程式": [solveRationalEquation, solveQuadraticEquation],
  "指数・対数": [solveLogarithmicEquation, solveExponentialEquation],
  "極限": [solveFiniteLimit],
  "基数変換": [solveBaseConversion],
  "パーセント": [solvePercentage],
});

function normalizedCategory(category, question) {
  if (typeof category === "string" && category) return category;
  if (category && typeof category === "object" && typeof category.primary === "string") return category.primary;
  if (typeof question === "string") return classifyCategory(question).primary;
  return "その他";
}

function safeThrownReason(error) {
  try {
    if (typeof error === "string") return error;
    if (["number", "boolean", "bigint", "symbol"].includes(typeof error)) {
      return String(error);
    }
    if (error instanceof Error && typeof error.message === "string") {
      return error.message;
    }
  } catch {
    // A thrown value can itself contain hostile accessors or proxy traps.
  }
  return "詳細不明の例外";
}

function runSolvers(input, solvers, { preserveRecognizedFailure = false } = {}) {
  let lastUnsupported = null;
  let recognizedUnsupported = null;
  for (const solver of solvers) {
    let result;
    try {
      result = solver(input);
    } catch (error) {
      return failedResult(
        "solver-router",
        `ソルバー処理中にエラーが発生しました: ${safeThrownReason(error)}`,
      );
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

function runApplicationPreflight(input, solver, solverId) {
  try {
    return solver(input);
  } catch (error) {
    return Object.freeze({
      ...failedResult(
        solverId,
        `ソルバー処理中にエラーが発生しました: ${safeThrownReason(error)}`,
      ),
      solverId,
    });
  }
}

function runApplicationPreflights(input) {
  const volume = runApplicationPreflight(
    input,
    solvePolynomialVolume,
    POLYNOMIAL_VOLUME_SOLVER_ID,
  );
  if (volume.supported || volume.recognized === true) return volume;
  const area = runApplicationPreflight(
    input,
    solvePolynomialArea,
    POLYNOMIAL_AREA_SOLVER_ID,
  );
  if (area.supported || area.recognized === true) return area;
  const tangent = runApplicationPreflight(
    input,
    solvePolynomialTangent,
    POLYNOMIAL_TANGENT_SOLVER_ID,
  );
  if (tangent.supported || tangent.recognized === true) return tangent;
  const normal = runApplicationPreflight(
    input,
    solvePolynomialNormal,
    POLYNOMIAL_NORMAL_SOLVER_ID,
  );
  if (normal.supported || normal.recognized === true) return normal;
  const concavity = runApplicationPreflight(
    input,
    solvePolynomialConcavity,
    POLYNOMIAL_CONCAVITY_SOLVER_ID,
  );
  if (concavity.supported || concavity.recognized === true) return concavity;
  const variation = runApplicationPreflight(
    input,
    solvePolynomialVariation,
    POLYNOMIAL_VARIATION_SOLVER_ID,
  );
  if (variation.supported || variation.recognized === true) return variation;
  return runApplicationPreflight(
    input,
    solveFiniteLimit,
    FINITE_LIMIT_SOLVER_ID,
  );
}

function prepareQuestionInput(value) {
  if (typeof value === "string") {
    return Object.freeze({ input: value, failure: null });
  }
  try {
    return Object.freeze({ input: String(value ?? ""), failure: null });
  } catch (error) {
    return Object.freeze({
      input: "",
      failure: Object.freeze({
        ...failedResult(
          POLYNOMIAL_AREA_SOLVER_ID,
          `ソルバー処理中にエラーが発生しました: ${safeThrownReason(error)}`,
        ),
        solverId: POLYNOMIAL_AREA_SOLVER_ID,
      }),
    });
  }
}

export function solveQuestion(question, options = {}) {
  const prepared = prepareQuestionInput(question);
  if (prepared.failure) return prepared.failure;
  const input = prepared.input;
  const application = runApplicationPreflights(input);
  if (application.supported || application.recognized === true) return application;
  const category = normalizedCategory(options.category, input);
  const preferred = CATEGORY_SOLVERS[category] ?? [];
  const remaining = SOLVERS.filter((solver) => !preferred.includes(solver));
  if (preferred.length) {
    const preferredResult = runSolvers(input, preferred, { preserveRecognizedFailure: true });
    if (preferredResult.supported || preferredResult.recognized === true) {
      return preferredResult;
    }
  }
  return runSolvers(input, remaining);
}

export const solveProblem = solveQuestion;
export const trySolve = solveQuestion;
export const solveWithLocalSolver = solveQuestion;

export async function solveQuestionAsync(question, options = {}) {
  const prepared = prepareQuestionInput(question);
  if (prepared.failure) return prepared.failure;
  const input = prepared.input;
  const application = runApplicationPreflights(input);
  if (application.supported || application.recognized === true) return application;
  const category = normalizedCategory(options.category, input);
  const asynchronousSolvers = category === "微分"
    ? [solveDerivative, solveDefiniteIntegral, solveIndefiniteIntegral, solveAlgebraTransformation]
    : category === "積分"
      ? [solveDefiniteIntegral, solveIndefiniteIntegral, solveDerivative, solveAlgebraTransformation]
      : [solveAlgebraTransformation, solveDerivative, solveDefiniteIntegral, solveIndefiniteIntegral];
  const preferAsynchronous = ["式の計算", "微分", "積分"].includes(category);
  let immediate = null;
  if (!preferAsynchronous) {
    immediate = solveQuestion(input, options);
    if (immediate.supported || immediate.recognized === true) return immediate;
  }
  let lastUnsupported = immediate;
  for (const solver of asynchronousSolvers) {
    const result = await solver(input, {
      symbolicOperations: options.symbolicOperations,
    });
    if (result.supported || result.recognized === true) return result;
    lastUnsupported = result;
  }
  if (preferAsynchronous) {
    immediate = solveQuestion(input, options);
    if (immediate.supported) return immediate;
  }
  return lastUnsupported ?? immediate;
}

export default solveQuestion;
