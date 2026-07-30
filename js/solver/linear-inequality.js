import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import {
  LinearExpressionError,
  linearizeExpressionAst,
  subtractLinearExpressions,
} from "../math-core/linear-expression.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const LINEAR_INEQUALITY_SOLVER_ID = "linear-inequality";

const INEQUALITY_CUE = /不等式/u;
const INEQUALITY_PATTERN = /[0-9xX.+\-*/^() \t]+(?:<=|>=|<|>)[0-9xX.+\-*/^() \t]+/gu;
const REVERSED_OPERATOR = Object.freeze({
  "<": ">",
  "<=": ">=",
  ">": "<",
  ">=": "<=",
});

function normalizeInequalityNotation(value) {
  return normalizeMathNotation(value)
    .replace(/[≤≦]/gu, "<=")
    .replace(/[≥≧]/gu, ">=");
}

function extractInequality(question) {
  const normalized = normalizeInequalityNotation(question);
  const matches = [...normalized.matchAll(INEQUALITY_PATTERN)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  return {
    normalized,
    matches,
    operatorCount: [...normalized.matchAll(/<=|>=|<|>/gu)].length,
    recognized: INEQUALITY_CUE.test(normalized) || matches.length > 0,
  };
}

function splitInequality(source) {
  const operators = [...source.matchAll(/<=|>=|<|>/gu)];
  if (operators.length !== 1) {
    throw new LinearExpressionError("不等号は1つにしてください。", {
      code: "INVALID_INEQUALITY",
    });
  }
  const operator = operators[0][0];
  const index = operators[0].index;
  const leftSource = source.slice(0, index).trim();
  const rightSource = source.slice(index + operator.length).trim();
  if (!leftSource || !rightSource) {
    throw new LinearExpressionError("不等号の両側に式が必要です。", {
      code: "INVALID_INEQUALITY",
    });
  }
  return { leftSource, rightSource, operator };
}

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

export function solveLinearInequality(question) {
  const extracted = extractInequality(question);
  if (!extracted.recognized) {
    return unsupportedResult("一次不等式を検出できません。");
  }
  if (extracted.operatorCount !== 1) {
    return failedResult(
      LINEAR_INEQUALITY_SOLVER_ID,
      "不等号は1つにしてください。連立不等式と三項不等式はまだ未対応です。",
    );
  }
  if (extracted.matches.length !== 1) {
    return failedResult(
      LINEAR_INEQUALITY_SOLVER_ID,
      "1つの一次不等式を入力してください。連立不等式と三項不等式はまだ未対応です。",
    );
  }

  let source;
  let expression;
  let operator;
  try {
    source = splitInequality(extracted.matches[0]);
    operator = source.operator;
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
    return solvedResult({
      answer,
      steps: [
        extracted.matches[0],
        `${expression.constant}${operator}0`,
        answer,
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
  const steps = [
    extracted.matches[0],
    standardForm(expression, operator),
    `${expression.x}x${operator}${expression.constant.negate()}`,
  ];
  if (coefficientIsNegative) {
    steps.push("負の係数で両辺を割るため、不等号の向きを反転");
  }
  steps.push(answer);

  return solvedResult({
    answer,
    exactAnswer: answer,
    steps,
    verification: `境界値${boundary}を厳密分数で求め、xの係数の符号に応じた不等号の向きを確認しました。`,
    solverId: LINEAR_INEQUALITY_SOLVER_ID,
  });
}

export default solveLinearInequality;
