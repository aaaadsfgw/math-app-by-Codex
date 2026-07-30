import {
  createAffinePrimePowerSide,
  createConstantPrimePowerSide,
  ExactPrimePowerError,
  formatAffinePrimePowerRelation,
  solveAffinePrimePowerEquality,
  verifyAffinePrimePowerCandidate,
} from "../math-core/exact-prime-power.js";
import {
  ExactPolynomialError,
  exactPolynomialDegree,
  exactPolynomialFromAst,
} from "../math-core/exact-polynomial.js";
import { ExactRational } from "../math-core/exact-rational.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import {
  hasAmbiguousDivisionMultiplication,
  parseEquationInput,
} from "./equation-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const EXPONENTIAL_EQUATION_SOLVER_ID = "exponential-equation";

class ExponentialEquationError extends Error {
  constructor(message, { unsupported = false } = {}) {
    super(message);
    this.name = "ExponentialEquationError";
    this.unsupported = unsupported;
  }
}

function containsX(node) {
  if (node?.type === "symbol") return node.name === "x";
  if (node?.type === "unary") return containsX(node.argument);
  if (node?.type === "binary") return containsX(node.left) || containsX(node.right);
  if (node?.type === "call") return node.args.some(containsX);
  return false;
}

function integerLiteral(node) {
  if (node?.type === "number") {
    const value = ExactRational.parse(node.value);
    return value.denominator === 1n ? value.numerator : null;
  }
  if (node?.type === "unary" && ["+", "-"].includes(node.operator)) {
    const value = integerLiteral(node.argument);
    if (value === null) return null;
    return node.operator === "-" ? -value : value;
  }
  return null;
}

function evaluateConstant(node) {
  if (containsX(node)) {
    throw new ExponentialEquationError("底または定数側にxを含む形には対応していません。", {
      unsupported: true,
    });
  }
  if (node?.type === "number") return ExactRational.parse(node.value);
  if (node?.type === "unary") {
    const value = evaluateConstant(node.argument);
    return node.operator === "-" ? value.negate() : value;
  }
  if (node?.type === "binary") {
    const left = evaluateConstant(node.left);
    const right = evaluateConstant(node.right);
    if (node.operator === "+") return left.add(right);
    if (node.operator === "-") return left.subtract(right);
    if (node.operator === "*") return left.multiply(right);
    if (node.operator === "/") return left.divide(right);
    if (node.operator === "^") {
      const exponent = integerLiteral(node.right);
      if (exponent === null) {
        throw new ExponentialEquationError("定数の指数は整数にしてください。", {
          unsupported: true,
        });
      }
      return left.pow(exponent);
    }
  }
  throw new ExponentialEquationError(
    "数学定数、関数、または未対応の定数式を含んでいます。",
    { unsupported: true },
  );
}

function parseAffineExponent(node) {
  let polynomial;
  try {
    polynomial = exactPolynomialFromAst(node);
  } catch (error) {
    if (error instanceof ExactPolynomialError) {
      throw new ExponentialEquationError(error.message, {
        unsupported: error.unsupported,
      });
    }
    throw error;
  }
  if (exactPolynomialDegree(polynomial) > 1) {
    throw new ExponentialEquationError("指数はxの一次式までにしてください。", {
      unsupported: true,
    });
  }
  return Object.freeze({
    constant: polynomial[0],
    coefficient: polynomial[1] ?? ExactRational.zero(),
  });
}

function parseSide(node) {
  if (node?.type === "binary" && node.operator === "^") {
    const base = evaluateConstant(node.left);
    const hasVariableExponent = containsX(node.right);
    if (base.numerator <= 0n && hasVariableExponent) {
      throw new ExponentialEquationError(
        "変数指数の底は正の有理数にしてください。",
        { unsupported: true },
      );
    }
    if (base.equals(ExactRational.one()) && hasVariableExponent) {
      throw new ExponentialEquationError(
        "底が1の指数方程式は現在の対応範囲外です。",
        { unsupported: true },
      );
    }
    if (base.numerator > 0n) {
      const exponent = parseAffineExponent(node.right);
      return Object.freeze({
        hasVariableExponent,
        isPositive: true,
        side: createAffinePrimePowerSide(
          base,
          exponent.constant,
          exponent.coefficient,
        ),
      });
    }
  }

  if (containsX(node)) {
    throw new ExponentialEquationError(
      "指数関数の和・積、変数底、または指数外のxには対応していません。",
      { unsupported: true },
    );
  }
  const value = evaluateConstant(node);
  return Object.freeze({
    hasVariableExponent: false,
    isPositive: value.numerator > 0n,
    value,
    side: value.numerator > 0n ? createConstantPrimePowerSide(value) : null,
  });
}

function looksLikeVariableExponent(value) {
  return /\^[^=<>]{0,128}x/iu.test(String(value ?? ""));
}

function solvedNoSolution(source, explanation) {
  return solvedResult({
    answer: "解なし",
    exactAnswer: "解なし",
    steps: [
      { type: "input", content: source.source },
      {
        type: "domain",
        content: explanation,
        explanation: "正の数の実数乗は常に正です。",
      },
      { type: "result", content: "解なし" },
    ],
    verification: `${explanation} 正値性を厳密に確認しました。`,
    solverId: EXPONENTIAL_EQUATION_SOLVER_ID,
  });
}

export function solveExponentialEquation(question) {
  const source = parseEquationInput(question);
  if (!source.recognized) return unsupportedResult("指数方程式を検出できません。");
  if (!source.ok) {
    return looksLikeVariableExponent(question)
      ? failedResult(EXPONENTIAL_EQUATION_SOLVER_ID, source.error)
      : unsupportedResult("指数方程式を検出できません。");
  }

  let left;
  let right;
  try {
    const leftAst = parseMathExpression(source.leftSource, { symbols: ["x"] }).ast;
    const rightAst = parseMathExpression(source.rightSource, { symbols: ["x"] }).ast;
    const hasVariableExponent = (
      (leftAst?.type === "binary" && leftAst.operator === "^" && containsX(leftAst.right))
      || (rightAst?.type === "binary" && rightAst.operator === "^" && containsX(rightAst.right))
    );
    if (!hasVariableExponent) return unsupportedResult("変数を指数に含む方程式ではありません。");
    if (
      hasAmbiguousDivisionMultiplication(source.leftSource)
      || hasAmbiguousDivisionMultiplication(source.rightSource)
    ) {
      return failedResult(
        EXPONENTIAL_EQUATION_SOLVER_ID,
        "割り算の直後の暗黙の掛け算は曖昧です。括弧または*で範囲を明示してください。",
      );
    }
    left = parseSide(leftAst);
    right = parseSide(rightAst);
  } catch (error) {
    if (
      error instanceof ExponentialEquationError
      || error instanceof ExactPrimePowerError
      || error instanceof ExactPolynomialError
    ) {
      return error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(EXPONENTIAL_EQUATION_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return looksLikeVariableExponent(source.source)
        ? failedResult(EXPONENTIAL_EQUATION_SOLVER_ID, error.message)
        : unsupportedResult(error.message);
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ|絶対値/u.test(error.message)) {
      return unsupportedResult(error.message);
    }
    return failedResult(
      EXPONENTIAL_EQUATION_SOLVER_ID,
      error.message || "指数方程式を解釈できません。",
    );
  }

  if (!left.hasVariableExponent && !right.hasVariableExponent) {
    return unsupportedResult("変数を指数に含む方程式ではありません。");
  }
  if (!left.isPositive || !right.isPositive) {
    return solvedNoSolution(
      source,
      "正の有理数を底とする指数式と0以下の定数は等しくなりません。",
    );
  }

  let relation;
  try {
    relation = solveAffinePrimePowerEquality(left.side, right.side);
  } catch (error) {
    return error instanceof RangeError
      ? unsupportedResult(error.message)
      : failedResult(EXPONENTIAL_EQUATION_SOLVER_ID, error.message);
  }
  const relationText = formatAffinePrimePowerRelation(relation);
  const baseSteps = [
    { type: "input", content: source.source },
    {
      type: "strategy",
      content: "正の有理数の底を素因数の指数ベクトルへ変換",
      explanation: "有限小数と分数も既約分数の分子・分母に分けて厳密に扱います。",
    },
    {
      type: "transformation",
      content: relationText,
      explanation: "左右の各素数について、指数差をxの一次式として保持します。",
    },
  ];

  if (relation.state === "requires-logarithm") {
    return unsupportedResult(
      "解を対数の比で表す必要があります。型付き対数式の検証を実装するまで未対応です。",
    );
  }
  if (relation.state === "identity") {
    return solvedResult({
      answer: "すべての実数",
      exactAnswer: "すべての実数",
      steps: [
        ...baseSteps,
        {
          type: "verification",
          content: "すべての素因数指数差が恒等的に0",
        },
        { type: "result", content: "すべての実数" },
      ],
      verification: "左右の全素因数について、xの係数と定数項が厳密に一致しました。",
      solverId: EXPONENTIAL_EQUATION_SOLVER_ID,
    });
  }
  if (relation.state === "none") {
    return solvedResult({
      answer: "解なし",
      exactAnswer: "解なし",
      steps: [
        ...baseSteps,
        {
          type: "verification",
          content: "xの係数は一致するが、定数の素因数指数差が0ではない",
        },
        { type: "result", content: "解なし" },
      ],
      verification: "xに依存する指数は一致しますが、定数倍率が異なることを厳密に確認しました。",
      solverId: EXPONENTIAL_EQUATION_SOLVER_ID,
    });
  }

  const candidate = relation.candidate;
  if (!verifyAffinePrimePowerCandidate(relation, candidate)) {
    return failedResult(
      EXPONENTIAL_EQUATION_SOLVER_ID,
      "素因数指数への厳密代入検証に失敗しました。",
    );
  }
  const answer = `x=${candidate}`;
  return solvedResult({
    answer,
    exactAnswer: answer,
    steps: [
      ...baseSteps,
      {
        type: "transformation",
        content: answer,
        explanation: "すべての素因数指数差を同時に0にする厳密分数を求めます。",
      },
      {
        type: "verification",
        content: `${answer}で全素因数の指数差が0`,
      },
      { type: "result", content: answer },
    ],
    verification: `${answer}を左右の全素因数指数へ代入し、各指数差が厳密に0になることを確認しました。`,
    solverId: EXPONENTIAL_EQUATION_SOLVER_ID,
  });
}

export default solveExponentialEquation;
