import {
  ExactPolynomialError,
  exactPolynomialDegree,
} from "./exact-polynomial.js";
import {
  analyzeExactQuadraticRoots,
  signOfExactQuadraticValue,
} from "./exact-quadratic-roots.js";
import { ExactRational } from "./exact-rational.js";
import { createRealSet } from "./real-set.js";

function compareRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function rationalPoint(value) {
  return Object.freeze({ kind: "rational", value });
}

function rootPoint(root, order) {
  return Object.freeze({ kind: "root", root, order });
}

function compareRootToRational(root, rational) {
  return signOfExactQuadraticValue({
    rationalPart: new ExactRational(
      root.numeratorConstant,
      root.denominator,
    ).subtract(rational),
    radicalPart: new ExactRational(
      root.radicalCoefficient,
      root.denominator,
    ),
  }, root.radicand);
}

function comparePoints(left, right) {
  if (left.kind === "rational" && right.kind === "rational") {
    return compareRationals(left.value, right.value);
  }
  if (left.kind === "root" && right.kind === "rational") {
    return compareRootToRational(left.root, right.value);
  }
  if (left.kind === "rational" && right.kind === "root") {
    return -compareRootToRational(right.root, left.value);
  }
  if (left.root.exact === right.root.exact) return 0;
  return left.order < right.order ? -1 : 1;
}

function outputEndpoint(point) {
  if (!point) return null;
  return Object.freeze({
    exact: point.kind === "rational" ? point.value.toString() : point.root.exact,
    approximate: null,
  });
}

function strictPositiveIntervals(coefficients) {
  const degree = exactPolynomialDegree(coefficients);
  if (degree === 0) {
    return coefficients[0].numerator > 0n
      ? [{ lower: null, upper: null }]
      : [];
  }
  if (degree === 1) {
    const [constant, coefficient] = coefficients;
    const boundary = rationalPoint(constant.negate().divide(coefficient));
    return coefficient.numerator > 0n
      ? [{ lower: boundary, upper: null }]
      : [{ lower: null, upper: boundary }];
  }
  if (degree !== 2) {
    throw new ExactPolynomialError("定義域の符号判定は二次式までです。", {
      code: "DOMAIN_DEGREE_TOO_HIGH",
      unsupported: true,
    });
  }

  const analysis = analyzeExactQuadraticRoots(coefficients);
  const leadingPositive = analysis.integerCoefficients[2] > 0n;
  if (analysis.discriminant < 0n) {
    return leadingPositive ? [{ lower: null, upper: null }] : [];
  }
  if (analysis.discriminant === 0n) {
    if (!leadingPositive) return [];
    const root = rootPoint(analysis.roots[0], 0);
    return [
      { lower: null, upper: root },
      { lower: root, upper: null },
    ];
  }

  const lower = rootPoint(analysis.roots[0], 0);
  const upper = rootPoint(analysis.roots[1], 1);
  return leadingPositive
    ? [
        { lower: null, upper: lower },
        { lower: upper, upper: null },
      ]
    : [{ lower, upper }];
}

function validatedBound(value, name) {
  if (value === null || value === undefined) return null;
  if (!(value instanceof ExactRational)) {
    throw new TypeError(`${name}は厳密分数で指定してください。`);
  }
  return rationalPoint(value);
}

function intersectInterval(interval, lowerBound, upperBound) {
  const lower = !interval.lower
    ? lowerBound
    : !lowerBound || comparePoints(interval.lower, lowerBound) >= 0
      ? interval.lower
      : lowerBound;
  const upper = !interval.upper
    ? upperBound
    : !upperBound || comparePoints(interval.upper, upperBound) <= 0
      ? interval.upper
      : upperBound;
  if (lower && upper && comparePoints(lower, upper) >= 0) return null;
  return { lower, upper };
}

export function createStrictPositivePolynomialSet(
  coefficients,
  { lower = null, upper = null } = {},
) {
  const lowerBound = validatedBound(lower, "下限");
  const upperBound = validatedBound(upper, "上限");
  if (lowerBound && upperBound && comparePoints(lowerBound, upperBound) >= 0) {
    return createRealSet({ kind: "empty" });
  }

  const intervals = strictPositiveIntervals(coefficients)
    .map((interval) => intersectInterval(interval, lowerBound, upperBound))
    .filter(Boolean);
  if (!intervals.length) return createRealSet({ kind: "empty" });
  if (
    intervals.length === 1
    && !intervals[0].lower
    && !intervals[0].upper
  ) {
    return createRealSet({ kind: "all-real" });
  }
  return createRealSet({
    intervals: intervals.map((interval) => ({
      lower: outputEndpoint(interval.lower),
      upper: outputEndpoint(interval.upper),
      lowerClosed: false,
      upperClosed: false,
    })),
  });
}
