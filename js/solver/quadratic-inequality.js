import {
  ExactPolynomialError,
  exactPolynomialDegree,
  exactPolynomialFromAst,
  subtractExactPolynomials,
} from "../math-core/exact-polynomial.js";
import { analyzeExactQuadraticRoots } from "../math-core/exact-quadratic-roots.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { createRealSet, formatRealSet } from "../math-core/real-set.js";
import { parseInequalityInput } from "./inequality-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const QUADRATIC_INEQUALITY_SOLVER_ID = "quadratic-inequality";

function relationAcceptsSign(operator, sign) {
  if (operator === "<") return sign < 0;
  if (operator === "<=") return sign <= 0;
  if (operator === ">") return sign > 0;
  return sign >= 0;
}

function doubleRootSet(root, leadingSign, operator) {
  const awayFromRoot = relationAcceptsSign(operator, leadingSign);
  const atRoot = relationAcceptsSign(operator, 0);
  if (awayFromRoot && atRoot) return createRealSet({ kind: "all-real" });
  if (!awayFromRoot && !atRoot) return createRealSet({ kind: "empty" });
  if (atRoot) {
    return createRealSet({
      intervals: [{
        lower: root,
        upper: root,
        lowerClosed: true,
        upperClosed: true,
      }],
    });
  }
  return createRealSet({
    intervals: [
      { lower: null, upper: root, upperClosed: false },
      { lower: root, upper: null, lowerClosed: false },
    ],
  });
}

function twoRootSet(lower, upper, leadingSign, operator) {
  const outside = relationAcceptsSign(operator, leadingSign);
  const rootsIncluded = relationAcceptsSign(operator, 0);
  if (outside) {
    return createRealSet({
      intervals: [
        { lower: null, upper: lower, upperClosed: rootsIncluded },
        { lower: upper, upper: null, lowerClosed: rootsIncluded },
      ],
    });
  }
  return createRealSet({
    intervals: [{
      lower,
      upper,
      lowerClosed: rootsIncluded,
      upperClosed: rootsIncluded,
    }],
  });
}

function standardForm(coefficients, operator) {
  const [c, b, a] = coefficients;
  return `(${a})x^2+(${b})x+(${c})${operator}0`;
}

export function solveQuadraticInequality(question) {
  const source = parseInequalityInput(question);
  if (!source.recognized) return unsupportedResult("二次不等式を検出できません。");
  if (!source.ok) return failedResult(QUADRATIC_INEQUALITY_SOLVER_ID, source.error);

  const operator = source.operator;
  let coefficients;
  try {
    const left = exactPolynomialFromAst(
      parseMathExpression(source.leftSource, { symbols: ["x"] }).ast,
    );
    const right = exactPolynomialFromAst(
      parseMathExpression(source.rightSource, { symbols: ["x"] }).ast,
    );
    coefficients = subtractExactPolynomials(left, right);
    if (exactPolynomialDegree(coefficients) !== 2) {
      return unsupportedResult("二次不等式ではありません。");
    }
  } catch (error) {
    if (error instanceof ExactPolynomialError) {
      return error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(QUADRATIC_INEQUALITY_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return failedResult(QUADRATIC_INEQUALITY_SOLVER_ID, error.message);
    }
    return failedResult(
      QUADRATIC_INEQUALITY_SOLVER_ID,
      error.message || "二次不等式を解釈できません。",
    );
  }

  let analysis;
  try {
    analysis = analyzeExactQuadraticRoots(coefficients);
  } catch (error) {
    return error.unsupported
      ? unsupportedResult(error.message)
      : failedResult(QUADRATIC_INEQUALITY_SOLVER_ID, error.message);
  }
  const [, , a] = analysis.integerCoefficients;
  const discriminant = analysis.discriminant;
  const leadingSign = a > 0n ? 1 : -1;
  let solutionSet;
  let signDescription;

  if (discriminant < 0n) {
    solutionSet = relationAcceptsSign(operator, leadingSign)
      ? createRealSet({ kind: "all-real" })
      : createRealSet({ kind: "empty" });
    signDescription = "実数解を持たず、二次式の符号は最高次係数の符号で一定";
  } else if (discriminant === 0n) {
    const [root] = analysis.roots;
    solutionSet = doubleRootSet(root, leadingSign, operator);
    signDescription = `重解 ${root.exact} でだけ二次式が0`;
  } else {
    const [lower, upper] = analysis.roots;
    solutionSet = twoRootSet(lower, upper, leadingSign, operator);
    signDescription = `2つの実数解 ${lower.exact}, ${upper.exact} で区切って符号を判定`;
  }

  const answer = formatRealSet(solutionSet);
  return solvedResult({
    answer,
    exactAnswer: answer,
    solutionSet,
    steps: [
      { type: "input", content: source.source },
      {
        type: "transformation",
        content: standardForm(coefficients, operator),
        explanation: "右辺を0にして二次式の係数を確定します。",
      },
      {
        type: "strategy",
        content: `判別式 D=${discriminant}`,
        explanation: signDescription,
      },
      { type: "result", content: answer },
    ],
    verification: `整数化した係数の判別式D=${discriminant}と最高次係数a=${a}から、各区間の符号と端点を含むかを確認しました。`,
    solverId: QUADRATIC_INEQUALITY_SOLVER_ID,
  });
}

export default solveQuadraticInequality;
