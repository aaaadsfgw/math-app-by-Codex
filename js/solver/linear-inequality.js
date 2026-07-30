import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { createRealSet } from "../math-core/real-set.js";
import {
  LinearExpressionError,
  linearizeExpressionAst,
  subtractLinearExpressions,
} from "../math-core/linear-expression.js";
import { parseInequalityInput } from "./inequality-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const LINEAR_INEQUALITY_SOLVER_ID = "linear-inequality";

const REVERSED_OPERATOR = Object.freeze({
  "<": ">",
  "<=": ">=",
  ">": "<",
  ">=": "<=",
});

function relationIsTrue(value, operator) {
  const sign = value.numerator;
  if (operator === "<") return sign < 0n;
  if (operator === "<=") return sign <= 0n;
  if (operator === ">") return sign > 0n;
  return sign >= 0n;
}

function standardForm(expression, operator) {
  return `${expression.x}x+(${expression.constant})${operator}0`;
}

function rationalEndpoint(value) {
  const approximate = Number(value.numerator) / Number(value.denominator);
  return {
    exact: value.toString(),
    approximate: Number.isFinite(approximate) ? approximate : null,
  };
}

function linearSolutionSet(boundary, operator) {
  const endpoint = rationalEndpoint(boundary);
  if (operator === "<" || operator === "<=") {
    return createRealSet({
      intervals: [{
        lower: null,
        upper: endpoint,
        upperClosed: operator === "<=",
      }],
    });
  }
  return createRealSet({
    intervals: [{
      lower: endpoint,
      upper: null,
      lowerClosed: operator === ">=",
    }],
  });
}

export function solveLinearInequality(question) {
  const source = parseInequalityInput(question);
  if (!source.recognized) {
    return unsupportedResult("一次不等式を検出できません。");
  }
  if (!source.ok) return failedResult(LINEAR_INEQUALITY_SOLVER_ID, source.error);

  let expression;
  const operator = source.operator;
  try {
    const left = linearizeExpressionAst(
      parseMathExpression(source.leftSource, { symbols: ["x"] }).ast,
    );
    const right = linearizeExpressionAst(
      parseMathExpression(source.rightSource, { symbols: ["x"] }).ast,
    );
    expression = subtractLinearExpressions(left, right);
  } catch (error) {
    if (error instanceof LinearExpressionError) {
      return error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(LINEAR_INEQUALITY_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return failedResult(LINEAR_INEQUALITY_SOLVER_ID, error.message);
    }
    return failedResult(
      LINEAR_INEQUALITY_SOLVER_ID,
      error.message || "一次不等式を解釈できません。",
    );
  }

  if (!expression.y.isZero()) {
    return unsupportedResult("x以外の変数を含む一次不等式には対応していません。");
  }
  if (expression.x.isZero()) {
    const alwaysTrue = relationIsTrue(expression.constant, operator);
    const answer = alwaysTrue ? "すべての実数" : "解なし";
    const solutionSet = createRealSet({
      kind: alwaysTrue ? "all-real" : "empty",
    });
    return solvedResult({
      answer,
      solutionSet,
      steps: [
        { type: "input", content: source.source },
        {
          type: "transformation",
          content: `${expression.constant}${operator}0`,
          explanation: "xの項が消えるため、定数不等式の真偽だけを調べます。",
        },
        { type: "result", content: answer },
      ],
      verification: `xの項が消えた定数不等式を厳密分数で評価し、「${answer}」になることを確認しました。`,
      solverId: LINEAR_INEQUALITY_SOLVER_ID,
    });
  }

  const coefficientIsNegative = expression.x.numerator < 0n;
  const solvedOperator = coefficientIsNegative
    ? REVERSED_OPERATOR[operator]
    : operator;
  const boundary = expression.constant.negate().divide(expression.x);
  const answer = `x${solvedOperator}${boundary}`;
  const solutionSet = linearSolutionSet(boundary, solvedOperator);
  const steps = [
    { type: "input", content: source.source },
    {
      type: "transformation",
      content: standardForm(expression, operator),
      explanation: "すべての項を左辺へ移して係数を確認します。",
    },
    {
      type: "transformation",
      content: `${expression.x}x${operator}${expression.constant.negate()}`,
      explanation: "定数項を右辺へ移します。",
    },
  ];
  if (coefficientIsNegative) {
    steps.push({
      type: "rule",
      content: "負の係数で両辺を割るため、不等号の向きを反転",
      explanation: "負の数を掛けたり割ったりすると大小関係が逆になります。",
    });
  }
  steps.push({ type: "result", content: answer });

  return solvedResult({
    answer,
    exactAnswer: answer,
    solutionSet,
    steps,
    verification: `境界値${boundary}を厳密分数で求め、xの係数の符号に応じた不等号の向きを確認しました。`,
    solverId: LINEAR_INEQUALITY_SOLVER_ID,
  });
}

export default solveLinearInequality;
