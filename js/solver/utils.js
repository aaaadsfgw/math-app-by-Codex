import {
  createInvalidMathResult,
  createSolvedMathResult,
  createUnsupportedMathResult,
  toLegacySolverResult,
} from "../math-core/result.js";
import { parseMathExpression } from "../math-core/expression-parser.js";

const EPSILON = 1e-9;
const MAX_POLYNOMIAL_DEGREE = 4;

export { EPSILON };

export function normalizeMathText(value) {
  return String(value ?? "")
    .replace(/[²²]/g, "^2")
    .replace(/[³³]/g, "^3")
    .normalize("NFKC")
    .replace(/[−‐-―−]/g, "-")
    .replace(/[×·∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[＝]/g, "=")
    .replace(/，/g, ",")
    .replace(/：/g, ":")
    .replace(/％/g, "%")
    .replace(/[ｘＸX]/g, "x")
    .trim();
}

export function nearlyEqual(left, right, epsilon = EPSILON) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= epsilon * scale;
}

export function cleanNumber(value, epsilon = EPSILON) {
  if (!Number.isFinite(value)) return value;
  if (Math.abs(value) <= epsilon) return 0;
  const nearestInteger = Math.round(value);
  if (nearlyEqual(value, nearestInteger, epsilon)) return nearestInteger;
  return value;
}

export function formatNumber(value, maximumFractionDigits = 10) {
  const cleaned = cleanNumber(Number(value));
  if (!Number.isFinite(cleaned)) return String(cleaned);
  if (Number.isInteger(cleaned)) return String(cleaned);
  return cleaned.toLocaleString("en-US", {
    useGrouping: false,
    maximumFractionDigits,
  });
}

export function unsupportedResult(error = "未対応形式") {
  return toLegacySolverResult(createUnsupportedMathResult({ reason: error }));
}

export function failedResult(solverId, error) {
  return toLegacySolverResult(createInvalidMathResult({
    reason: error,
    code: "SOLVER_INPUT_ERROR",
    domain: solverId,
  }));
}

export function solvedResult({
  answer,
  exactAnswer = "",
  approximateAnswer = "",
  conditions = [],
  kind = "exact",
  metadata = {},
  solutionSet = null,
  steps = [],
  verification,
  solverId,
}) {
  return toLegacySolverResult(createSolvedMathResult({
    kind,
    answer,
    exactAnswer,
    approximateAnswer,
    conditions,
    metadata,
    solutionSet,
    steps,
    verification: {
      method: "solver-specific-check",
      evidence: verification,
    },
    domain: solverId,
    solverId,
  }));
}

function trimJapanesePrompt(text) {
  return text
    .replace(/^(?:次の)?(?:一次|二次)?方程式(?:を)?(?:解いて|解け|解きなさい)?[：:\s]*/u, "")
    .replace(/^次の式[：:\s]*/u, "")
    .replace(/(?:を)?(?:解いて|解け|解きなさい|求め(?:よ|なさい)?)[。．.!！?？\s]*$/u, "")
    .trim();
}

export function extractEquation(value) {
  const text = trimJapanesePrompt(normalizeMathText(value).replace(/\s+/g, ""));
  if (!text.includes("=")) return null;

  const allowed = "0-9xX+\\-*/^().=";
  const direct = text.match(new RegExp(`^[${allowed}]+$`));
  if (direct) return direct[0].replace(/X/g, "x");
  return null;
}

function zeroPolynomial() {
  return Array(MAX_POLYNOMIAL_DEGREE + 1).fill(0);
}

function constantPolynomial(value) {
  const polynomial = zeroPolynomial();
  polynomial[0] = value;
  return polynomial;
}

function variablePolynomial() {
  const polynomial = zeroPolynomial();
  polynomial[1] = 1;
  return polynomial;
}

function addPolynomial(left, right, sign = 1) {
  return left.map((coefficient, degree) => coefficient + sign * right[degree]);
}

function multiplyPolynomial(left, right) {
  const result = zeroPolynomial();
  for (let leftDegree = 0; leftDegree < left.length; leftDegree += 1) {
    for (let rightDegree = 0; rightDegree < right.length; rightDegree += 1) {
      if (!left[leftDegree] || !right[rightDegree]) continue;
      const degree = leftDegree + rightDegree;
      if (degree > MAX_POLYNOMIAL_DEGREE) {
        throw new Error("次数が高すぎます");
      }
      result[degree] += left[leftDegree] * right[rightDegree];
    }
  }
  return result;
}

function polynomialDegree(polynomial) {
  for (let degree = polynomial.length - 1; degree >= 0; degree -= 1) {
    if (!nearlyEqual(polynomial[degree], 0)) return degree;
  }
  return 0;
}

function dividePolynomial(numerator, denominator) {
  if (polynomialDegree(denominator) !== 0) {
    throw new Error("xを含む式では割れません");
  }
  if (nearlyEqual(denominator[0], 0)) throw new Error("0では割れません");
  return numerator.map((coefficient) => coefficient / denominator[0]);
}

function powerPolynomial(base, exponent) {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_POLYNOMIAL_DEGREE) {
    throw new Error("指数は0以上4以下の整数にしてください");
  }
  let result = constantPolynomial(1);
  for (let count = 0; count < exponent; count += 1) {
    result = multiplyPolynomial(result, base);
  }
  return result;
}

function astToPolynomial(node) {
  switch (node.type) {
    case "number": {
      const value = Number(node.value);
      if (!Number.isFinite(value)) throw new Error("数値が大きすぎます");
      return constantPolynomial(value);
    }
    case "symbol":
      if (node.name !== "x") throw new Error(`変数${node.name}には対応していません`);
      return variablePolynomial();
    case "constant":
    case "call":
      throw new Error("関数や数学定数を含む多項式にはまだ対応していません");
    case "unary": {
      const value = astToPolynomial(node.argument);
      return node.operator === "-"
        ? value.map((coefficient) => -coefficient)
        : value;
    }
    case "binary": {
      const left = astToPolynomial(node.left);
      const right = astToPolynomial(node.right);
      if (node.operator === "+") return addPolynomial(left, right);
      if (node.operator === "-") return addPolynomial(left, right, -1);
      if (node.operator === "*") return multiplyPolynomial(left, right);
      if (node.operator === "/") return dividePolynomial(left, right);
      if (node.operator === "^") {
        if (polynomialDegree(right) !== 0) throw new Error("指数に変数は使用できません");
        return powerPolynomial(left, right[0]);
      }
      throw new Error(`演算子${node.operator}には対応していません`);
    }
    default:
      throw new Error("未知の数式要素です");
  }
}

function parseExpression(source) {
  const parsed = parseMathExpression(source, { symbols: ["x"] });
  return astToPolynomial(parsed.ast).map((coefficient) => cleanNumber(coefficient));
}

export function parsePolynomialEquation(value) {
  const equation = extractEquation(value);
  if (!equation) return { ok: false, unsupported: true, error: "方程式を検出できません" };
  const equalsCount = [...equation].filter((character) => character === "=").length;
  if (equalsCount !== 1) return { ok: false, unsupported: false, error: "等号は1つにしてください" };
  const [leftSource, rightSource] = equation.split("=");
  if (!leftSource || !rightSource) return { ok: false, unsupported: false, error: "等号の両側に式が必要です" };

  try {
    const left = parseExpression(leftSource);
    const right = parseExpression(rightSource);
    const coefficients = addPolynomial(left, right, -1).map((coefficient) => cleanNumber(coefficient));
    return {
      ok: true,
      equation,
      left,
      right,
      coefficients,
      degree: polynomialDegree(coefficients),
    };
  } catch (error) {
    const unsupported =
      /xを含む式では割れません|次数が高すぎます|指数は0以上4以下/u.test(error.message) ||
      /\^[x(]/i.test(equation);
    return { ok: false, unsupported, error: error.message };
  }
}

export function evaluatePolynomial(coefficients, x) {
  return coefficients.reduceRight((sum, coefficient) => sum * x + coefficient, 0);
}

export function greatestCommonDivisor(left, right) {
  let a = Math.abs(Math.trunc(left));
  let b = Math.abs(Math.trunc(right));
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function simplifySquareRoot(integer) {
  if (!Number.isInteger(integer) || integer < 0) return { outside: 1, inside: integer };
  let inside = integer;
  let outside = 1;
  for (let factor = 2; factor * factor <= inside; factor += 1) {
    while (inside % (factor * factor) === 0) {
      outside *= factor;
      inside /= factor * factor;
    }
  }
  return { outside, inside };
}
