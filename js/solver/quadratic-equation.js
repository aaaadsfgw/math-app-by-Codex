import {
  ExactPolynomialError,
  exactPolynomialDegree,
  exactPolynomialFromAst,
  subtractExactPolynomials,
} from "../math-core/exact-polynomial.js";
import { analyzeExactQuadraticRoots } from "../math-core/exact-quadratic-roots.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import {
  hasAmbiguousDivisionMultiplication,
  parseEquationInput,
} from "./equation-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const QUADRATIC_SOLVER_ID = "quadratic-equation";

function standardForm(coefficients) {
  const [c, b, a] = coefficients;
  return `(${a})x^2+(${b})x+(${c})=0`;
}

function formatApproximation(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || magnitude < 1e-8) {
    return value.toExponential(10)
      .replace(/\.?0+e/u, "e")
      .replace(/e\+/u, "e");
  }
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumSignificantDigits: 12,
  });
}

function approximateRootAnswer(roots) {
  if (!roots.some((root) => root.form === "radical")) return "";
  if (roots.some((root) => root.approximate === null)) return "";
  const values = roots.map((root) => formatApproximation(root.approximate));
  return values.every(Boolean) ? `x≈${values.join(",")}` : "";
}

function parseExactQuadratic(source) {
  const leftAst = parseMathExpression(source.leftSource, { symbols: ["x"] }).ast;
  const rightAst = parseMathExpression(source.rightSource, { symbols: ["x"] }).ast;
  if (
    hasAmbiguousDivisionMultiplication(source.leftSource)
    || hasAmbiguousDivisionMultiplication(source.rightSource)
  ) {
    throw new ExactPolynomialError(
      "割り算の直後の暗黙の掛け算は曖昧です。分母と掛け算を括弧で明示してください。",
      { code: "AMBIGUOUS_DIVISION_MULTIPLICATION" },
    );
  }
  const left = exactPolynomialFromAst(leftAst);
  const right = exactPolynomialFromAst(rightAst);
  const coefficients = subtractExactPolynomials(left, right);
  if (exactPolynomialDegree(coefficients) !== 2) {
    throw new ExactPolynomialError("二次方程式ではありません。", {
      code: "NOT_QUADRATIC",
      unsupported: true,
    });
  }
  return coefficients;
}

export function solveQuadraticEquation(question) {
  const source = parseEquationInput(question);
  if (!source.recognized) return unsupportedResult("二次方程式を検出できません。");
  if (!source.ok) return failedResult(QUADRATIC_SOLVER_ID, source.error);

  let coefficients;
  let analysis;
  try {
    coefficients = parseExactQuadratic(source);
    analysis = analyzeExactQuadraticRoots(coefficients);
  } catch (error) {
    if (error instanceof ExactPolynomialError) {
      return error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(QUADRATIC_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return failedResult(QUADRATIC_SOLVER_ID, error.message);
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ/u.test(error.message)) {
      return unsupportedResult(error.message);
    }
    return failedResult(
      QUADRATIC_SOLVER_ID,
      error.message || "二次方程式を解釈できません。",
    );
  }

  const [c, b, a] = analysis.integerCoefficients;
  const discriminant = analysis.discriminant;
  const baseSteps = [
    { type: "input", content: source.source },
    {
      type: "transformation",
      content: standardForm(coefficients),
      explanation: "右辺を0にし、有限小数と分数を厳密分数のまま整理します。",
    },
    {
      type: "strategy",
      content: `判別式 D=b^2-4ac=${discriminant}`,
      explanation: "整数比へ直した係数で、判別式の符号と平方数かを厳密に判定します。",
    },
  ];

  if (analysis.rootKind === "no-real") {
    const answer = "実数解なし";
    return solvedResult({
      answer,
      exactAnswer: answer,
      steps: [
        ...baseSteps,
        {
          type: "result",
          content: answer,
          explanation: "判別式が負なので、実数の範囲には解がありません。",
        },
      ],
      verification: `整数化した係数a=${a}, b=${b}, c=${c}の判別式D=${discriminant}<0を厳密に確認しました。`,
      solverId: QUADRATIC_SOLVER_ID,
    });
  }

  const exactAnswer = `x=${analysis.roots.map((root) => root.exact).join(",")}`;
  const approximateAnswer = approximateRootAnswer(analysis.roots);
  return solvedResult({
    answer: exactAnswer,
    exactAnswer,
    approximateAnswer,
    steps: [
      ...baseSteps,
      {
        type: "rule",
        content: "x=(-b±√D)/(2a)",
        explanation: analysis.rootKind === "double"
          ? "判別式が0なので、同じ根が1つ得られます。"
          : "平方根を簡約し、有理解は既約分数、無理解は根号のまま表します。",
      },
      { type: "result", content: exactAnswer },
    ],
    verification: `表示した各根をa=${a}, b=${b}, c=${c}へ厳密代入し、有理部分と根号部分がともに0になることを確認しました。判別式D=${discriminant}。`,
    solverId: QUADRATIC_SOLVER_ID,
  });
}

export default solveQuadraticEquation;
