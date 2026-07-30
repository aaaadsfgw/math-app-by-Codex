import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import {
  LinearExpressionError,
  evaluateLinearExpression,
  linearizeExpressionAst,
  subtractLinearExpressions,
} from "../math-core/linear-expression.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const LINEAR_SYSTEM_SOLVER_ID = "linear-system";

const SYSTEM_CUE = /連立方程式|連立して|同時に満た/u;
const EQUATION_PATTERN = /[0-9xyXY.+\-*/^() \t]+=[0-9xyXY.+\-*/^() \t]+/gu;

function extractEquations(question) {
  const raw = String(question ?? "");
  const prepared = raw
    .replace(/\\begin\s*\{cases\}|\\end\s*\{cases\}/gu, "\n")
    .replace(/\\\\/gu, "\n")
    .replace(/[{}［］【】]/gu, "\n");
  const normalized = normalizeMathNotation(prepared);
  const equations = [...normalized.matchAll(EQUATION_PATTERN)]
    .map((match) => match[0].trim())
    .filter(Boolean);
  return {
    equations,
    recognized: SYSTEM_CUE.test(normalized) || equations.length >= 2,
  };
}

function parseEquation(source) {
  const parts = source.split("=");
  if (parts.length !== 2 || !parts[0].trim() || !parts[1].trim()) {
    throw new LinearExpressionError("各式の等号は1つにし、両側に式を入力してください。", {
      code: "INVALID_EQUATION",
    });
  }
  const left = linearizeExpressionAst(
    parseMathExpression(parts[0], { symbols: ["x", "y"] }).ast,
  );
  const right = linearizeExpressionAst(
    parseMathExpression(parts[1], { symbols: ["x", "y"] }).ast,
  );
  return subtractLinearExpressions(left, right);
}

function determinant(leftA, leftB, rightA, rightB) {
  return leftA.multiply(rightB).subtract(rightA.multiply(leftB));
}

function solvePair(first, second) {
  if (
    (first.x.isZero() && first.y.isZero() && !first.constant.isZero())
    || (second.x.isZero() && second.y.isZero() && !second.constant.isZero())
  ) {
    return { kind: "none" };
  }

  const firstHasVariable = !first.x.isZero() || !first.y.isZero();
  const secondHasVariable = !second.x.isZero() || !second.y.isZero();
  if (!firstHasVariable && !secondHasVariable) return { kind: "all" };
  if (!firstHasVariable || !secondHasVariable) return { kind: "infinite" };

  const coefficientDeterminant = determinant(first.x, first.y, second.x, second.y);
  if (coefficientDeterminant.isZero()) {
    const xConstantMinor = determinant(first.x, first.constant, second.x, second.constant);
    const yConstantMinor = determinant(first.y, first.constant, second.y, second.constant);
    return xConstantMinor.isZero() && yConstantMinor.isZero()
      ? { kind: "infinite" }
      : { kind: "none" };
  }

  const firstRight = first.constant.negate();
  const secondRight = second.constant.negate();
  const x = determinant(firstRight, first.y, secondRight, second.y)
    .divide(coefficientDeterminant);
  const y = determinant(first.x, firstRight, second.x, secondRight)
    .divide(coefficientDeterminant);
  return { kind: "unique", x, y, determinant: coefficientDeterminant };
}

export function solveLinearSystem(question) {
  const extracted = extractEquations(question);
  if (!extracted.recognized) {
    return unsupportedResult("2本の一次方程式を検出できません。");
  }
  if (extracted.equations.length !== 2) {
    return failedResult(
      LINEAR_SYSTEM_SOLVER_ID,
      "2元連立一次方程式として、等式をちょうど2本入力してください。",
    );
  }

  let equations;
  try {
    equations = extracted.equations.map(parseEquation);
  } catch (error) {
    if (error instanceof LinearExpressionError) {
      return error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(LINEAR_SYSTEM_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return failedResult(LINEAR_SYSTEM_SOLVER_ID, error.message);
    }
    return failedResult(LINEAR_SYSTEM_SOLVER_ID, error.message || "連立方程式を解釈できません。");
  }

  const solution = solvePair(equations[0], equations[1]);
  if (solution.kind === "none") {
    return solvedResult({
      answer: "解なし",
      steps: [
        ...extracted.equations.map((equation) => ({ type: "input", content: equation })),
        {
          type: "conclusion",
          content: "係数を消去すると矛盾する等式になります",
          explanation: "2本を同時に満たす点はありません。",
        },
      ],
      verification: "2本の式の係数関係と定数項の関係が一致しないため、共通する解はありません。",
      solverId: LINEAR_SYSTEM_SOLVER_ID,
    });
  }
  if (solution.kind === "all") {
    return solvedResult({
      answer: "すべての実数の組 (x,y)",
      steps: [
        ...extracted.equations.map((equation) => ({ type: "input", content: equation })),
        { type: "conclusion", content: "2本とも恒等式です" },
      ],
      verification: "両方の式を整理すると0=0となるため、すべての実数の組で成立します。",
      solverId: LINEAR_SYSTEM_SOLVER_ID,
    });
  }
  if (solution.kind === "infinite") {
    return solvedResult({
      answer: "解は無数にある",
      steps: [
        ...extracted.equations.map((equation) => ({ type: "input", content: equation })),
        {
          type: "conclusion",
          content: "2本の式は同じ直線を表します",
          explanation: "独立な条件が1本だけなので、解の組は無数にあります。",
        },
      ],
      verification: "係数と定数項が比例し、独立な条件が1本だけになることを確認しました。",
      solverId: LINEAR_SYSTEM_SOLVER_ID,
    });
  }

  const firstResidual = evaluateLinearExpression(equations[0], solution);
  const secondResidual = evaluateLinearExpression(equations[1], solution);
  if (!firstResidual.isZero() || !secondResidual.isZero()) {
    return failedResult(LINEAR_SYSTEM_SOLVER_ID, "厳密な代入検証に失敗しました。");
  }

  const answer = `x=${solution.x}, y=${solution.y}`;
  return solvedResult({
    answer,
    exactAnswer: answer,
    steps: [
      ...extracted.equations.map((equation) => ({ type: "input", content: equation })),
      {
        type: "strategy",
        content: `係数行列の行列式: ${solution.determinant}`,
        explanation: "行列式が0でないため、解はただ1組に決まります。",
      },
      { type: "result", content: answer },
    ],
    verification: `${answer}を元の2本の式へ分数のまま代入し、両方の差が厳密に0になることを確認しました。`,
    solverId: LINEAR_SYSTEM_SOLVER_ID,
  });
}

export default solveLinearSystem;
