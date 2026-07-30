import {
  ExactPolynomialError,
  exactPolynomialDegree,
  exactPolynomialFromAst,
  subtractExactPolynomials,
} from "../math-core/exact-polynomial.js";
import { ExactRational } from "../math-core/exact-rational.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { createRealSet, formatRealSet } from "../math-core/real-set.js";
import { parseInequalityInput } from "./inequality-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const QUADRATIC_INEQUALITY_SOLVER_ID = "quadratic-inequality";

const MAX_INTEGER_COEFFICIENT = 10n ** 100n;
const MAX_FACTORED_DISCRIMINANT = 1_000_000_000_000n;

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function leastCommonMultiple(left, right) {
  return absolute(left / greatestCommonDivisor(left, right) * right);
}

function integerCoefficients(coefficients) {
  const denominator = coefficients.reduce(
    (value, coefficient) => leastCommonMultiple(value, coefficient.denominator),
    1n,
  );
  let integers = coefficients.map((coefficient) => (
    coefficient.numerator * (denominator / coefficient.denominator)
  ));
  const divisor = integers.reduce(
    (value, coefficient) => greatestCommonDivisor(value, coefficient),
    0n,
  );
  integers = integers.map((coefficient) => coefficient / divisor);
  if (integers.some((coefficient) => absolute(coefficient) > MAX_INTEGER_COEFFICIENT)) {
    throw new ExactPolynomialError("二次不等式の係数が大きすぎます。", {
      code: "COEFFICIENT_TOO_LARGE",
      unsupported: true,
    });
  }
  return integers;
}

function integerSquareRoot(value) {
  if (value < 0n) throw new RangeError("負の整数の平方根は求められません。");
  if (value < 2n) return value;
  const bitLength = value.toString(2).length;
  let estimate = 1n << BigInt(Math.ceil(bitLength / 2));
  while (true) {
    const next = (estimate + value / estimate) / 2n;
    if (next >= estimate) return estimate;
    estimate = next;
  }
}

function simplifiedRadical(value) {
  let inside = Number(value);
  let outside = 1;
  for (let factor = 2; factor * factor <= inside; factor += 1) {
    const square = factor * factor;
    while (inside % square === 0) {
      outside *= factor;
      inside /= square;
    }
  }
  return { outside: BigInt(outside), inside: BigInt(inside) };
}

function formatRadicalRoot(constant, radicalCoefficient, inside, denominator) {
  const divisor = greatestCommonDivisor(
    greatestCommonDivisor(constant, radicalCoefficient),
    denominator,
  );
  const reducedConstant = constant / divisor;
  const reducedRadical = radicalCoefficient / divisor;
  const reducedDenominator = denominator / divisor;
  const radicalMagnitude = absolute(reducedRadical);
  const radical = `${radicalMagnitude === 1n ? "" : radicalMagnitude}√${inside}`;
  let numerator;
  if (reducedConstant === 0n) {
    numerator = `${reducedRadical < 0n ? "-" : ""}${radical}`;
  } else {
    numerator = `${reducedConstant}${reducedRadical < 0n ? "-" : "+"}${radical}`;
  }
  if (reducedDenominator === 1n) return numerator;
  return reducedConstant === 0n
    ? `${numerator}/${reducedDenominator}`
    : `(${numerator})/${reducedDenominator}`;
}

function rootEndpoints(aInput, bInput, cInput, discriminant) {
  let a = aInput;
  let b = bInput;
  if (a < 0n) {
    a = -a;
    b = -b;
  }
  const denominator = 2n * a;
  const squareRoot = integerSquareRoot(discriminant);
  if (squareRoot * squareRoot === discriminant) {
    const lower = new ExactRational(-b - squareRoot, denominator);
    const upper = new ExactRational(-b + squareRoot, denominator);
    const lowerApproximate = Number(lower.numerator) / Number(lower.denominator);
    const upperApproximate = Number(upper.numerator) / Number(upper.denominator);
    const approximationsAreOrdered = Number.isFinite(lowerApproximate)
      && Number.isFinite(upperApproximate)
      && lowerApproximate < upperApproximate;
    return [
      {
        exact: lower.toString(),
        approximate: approximationsAreOrdered ? lowerApproximate : null,
      },
      {
        exact: upper.toString(),
        approximate: approximationsAreOrdered ? upperApproximate : null,
      },
    ];
  }
  const radical = discriminant <= MAX_FACTORED_DISCRIMINANT
    ? simplifiedRadical(discriminant)
    : { outside: 1n, inside: discriminant };
  const lowerApproximate = (-Number(b) - Math.sqrt(Number(discriminant))) / Number(denominator);
  const upperApproximate = (-Number(b) + Math.sqrt(Number(discriminant))) / Number(denominator);
  const approximationsAreOrdered = Number.isFinite(lowerApproximate)
    && Number.isFinite(upperApproximate)
    && lowerApproximate < upperApproximate;
  return [
    {
      exact: formatRadicalRoot(-b, -radical.outside, radical.inside, denominator),
      approximate: approximationsAreOrdered ? lowerApproximate : null,
    },
    {
      exact: formatRadicalRoot(-b, radical.outside, radical.inside, denominator),
      approximate: approximationsAreOrdered ? upperApproximate : null,
    },
  ];
}

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

  let integerValues;
  try {
    integerValues = integerCoefficients(coefficients);
  } catch (error) {
    return error.unsupported
      ? unsupportedResult(error.message)
      : failedResult(QUADRATIC_INEQUALITY_SOLVER_ID, error.message);
  }
  const [c, b, a] = integerValues;
  const discriminant = b * b - 4n * a * c;
  const leadingSign = a > 0n ? 1 : -1;
  let solutionSet;
  let signDescription;

  if (discriminant < 0n) {
    solutionSet = relationAcceptsSign(operator, leadingSign)
      ? createRealSet({ kind: "all-real" })
      : createRealSet({ kind: "empty" });
    signDescription = "実数解を持たず、二次式の符号は最高次係数の符号で一定";
  } else if (discriminant === 0n) {
    const [root] = rootEndpoints(a, b, c, discriminant);
    solutionSet = doubleRootSet(root, leadingSign, operator);
    signDescription = `重解 ${root.exact} でだけ二次式が0`;
  } else {
    const [lower, upper] = rootEndpoints(a, b, c, discriminant);
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
