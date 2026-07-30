import {
  ExactPolynomialError,
  evaluateExactPolynomial,
  exactPolynomialDegree,
  exactPolynomialFromAst,
  subtractExactPolynomials,
} from "../math-core/exact-polynomial.js";
import { ExactRational } from "../math-core/exact-rational.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import {
  hasAmbiguousDivisionMultiplication,
  parseEquationInput,
} from "./equation-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const LINEAR_SOLVER_ID = "linear-equation";

function standardForm(coefficients) {
  const [constant, coefficient] = coefficients;
  return `(${coefficient})x+(${constant})=0`;
}

function parseExactLinear(source) {
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
  if (exactPolynomialDegree(coefficients) > 1) {
    throw new ExactPolynomialError("一次方程式ではありません。", {
      code: "NOT_LINEAR",
      unsupported: true,
    });
  }
  return Object.freeze([
    coefficients[0],
    coefficients[1] ?? ExactRational.zero(),
  ]);
}

export function solveLinearEquation(question) {
  const source = parseEquationInput(question);
  if (!source.recognized) return unsupportedResult("一次方程式を検出できません。");
  if (!source.ok) return failedResult(LINEAR_SOLVER_ID, source.error);

  let coefficients;
  try {
    coefficients = parseExactLinear(source);
  } catch (error) {
    if (error instanceof ExactPolynomialError) {
      return error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(LINEAR_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return failedResult(LINEAR_SOLVER_ID, error.message);
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ/u.test(error.message)) {
      return unsupportedResult(error.message);
    }
    return failedResult(
      LINEAR_SOLVER_ID,
      error.message || "一次方程式を解釈できません。",
    );
  }

  const [constant, coefficient] = coefficients;
  const baseSteps = [
    { type: "input", content: source.source },
    {
      type: "transformation",
      content: standardForm(coefficients),
      explanation: "有限小数と分数を丸めず、xの項と定数項を整理します。",
    },
  ];

  if (coefficient.isZero()) {
    if (constant.isZero()) {
      return solvedResult({
        answer: "すべての実数",
        exactAnswer: "すべての実数",
        steps: [
          ...baseSteps,
          {
            type: "result",
            content: "すべての実数",
            explanation: "両辺を整理すると恒等式0=0になります。",
          },
        ],
        verification: "厳密分数係数を整理し、xの係数と定数項がともに0になることを確認しました。",
        solverId: LINEAR_SOLVER_ID,
      });
    }
    return solvedResult({
      answer: "解なし",
      exactAnswer: "解なし",
      steps: [
        ...baseSteps,
        {
          type: "result",
          content: "解なし",
          explanation: `${constant}=0という矛盾が残ります。`,
        },
      ],
      verification: `xの係数が0で、0ではない定数${constant}が残ることを厳密に確認しました。`,
      solverId: LINEAR_SOLVER_ID,
    });
  }

  let solution;
  try {
    solution = constant.negate().divide(coefficient);
  } catch (error) {
    return error instanceof RangeError
      ? unsupportedResult(error.message)
      : failedResult(LINEAR_SOLVER_ID, error.message);
  }
  const residual = evaluateExactPolynomial(coefficients, solution);
  if (!residual.isZero()) {
    return failedResult(LINEAR_SOLVER_ID, "厳密代入検証に失敗しました。");
  }

  const answer = `x=${solution}`;
  return solvedResult({
    answer,
    exactAnswer: answer,
    steps: [
      ...baseSteps,
      {
        type: "transformation",
        content: `${coefficient}x=${constant.negate()}`,
        explanation: "定数項を右辺へ移します。",
      },
      { type: "result", content: answer },
    ],
    verification: `${answer}を元の厳密分数係数へ代入し、左辺と右辺の差が0になることを確認しました。`,
    solverId: LINEAR_SOLVER_ID,
  });
}

export default solveLinearEquation;
