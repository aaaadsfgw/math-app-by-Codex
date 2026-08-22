import { formatExactPolynomialForIntegral } from "./exact-polynomial-integral.js";
import { ExactRational } from "./exact-rational.js";

const MAX_TANGENT_POLYNOMIAL_DEGREE = 4;

export class ExactPolynomialTangentError extends Error {
  constructor(message, {
    code = "EXACT_POLYNOMIAL_TANGENT_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "ExactPolynomialTangentError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function snapshotExactRational(value, label) {
  if (!(value instanceof ExactRational)) {
    throw new TypeError(`${label}は厳密分数で指定してください。`);
  }
  const numerator = value.numerator;
  const denominator = value.denominator;
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
    throw new TypeError(`${label}の分子と分母はBigIntで指定してください。`);
  }
  return new ExactRational(numerator, denominator);
}

function snapshotPolynomial(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("接線を求める式は厳密分数係数の多項式で指定してください。");
  }
  const length = value.length;
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !Number.isSafeInteger(length)
    || length < 1
    || descriptor?.value !== length
  ) {
    throw new TypeError("接線を求める多項式の配列長が正しくありません。");
  }
  if (length - 1 > MAX_TANGENT_POLYNOMIAL_DEGREE) {
    throw new ExactPolynomialTangentError(
      `接線を求める多項式の次数は${MAX_TANGENT_POLYNOMIAL_DEGREE}以下にしてください。`,
      { code: "TANGENT_POLYNOMIAL_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const coefficients = Array.from({ length }, (_, index) => {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError("接線を求める多項式の係数配列を疎配列にしないでください。");
    }
    return snapshotExactRational(value[index], `多項式の係数${index}`);
  });
  if (coefficients.length > 1 && coefficients.at(-1).isZero()) {
    throw new ExactPolynomialTangentError(
      "接線を求める多項式の末尾に不要な0係数があります。",
      { code: "NONCANONICAL_TANGENT_POLYNOMIAL" },
    );
  }
  return Object.freeze(coefficients);
}

function snapshotOptions(value) {
  if (value === undefined) {
    return Object.freeze({ declared: false, declaredValue: null });
  }
  if (value === null || typeof value !== "object") {
    throw new TypeError("接線の追加条件はオブジェクトで指定してください。");
  }
  const declaredSource = value.declaredValue;
  if (declaredSource === null || declaredSource === undefined) {
    return Object.freeze({ declared: false, declaredValue: null });
  }
  return Object.freeze({
    declared: true,
    declaredValue: snapshotExactRational(declaredSource, "宣言された接点のy座標"),
  });
}

function evaluatePolynomial(coefficients, point) {
  let value = ExactRational.zero();
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    value = value.multiply(point).add(coefficients[index]);
  }
  return value;
}

function differentiatePolynomial(coefficients) {
  if (coefficients.length === 1) {
    return Object.freeze([ExactRational.zero()]);
  }
  return Object.freeze(coefficients.slice(1).map((coefficient, index) => (
    coefficient.multiply(BigInt(index + 1))
  )));
}

function exactDifference(left, right) {
  return left.subtract(right);
}

function requireVerified(verified, message, code) {
  if (verified) return;
  throw new ExactPolynomialTangentError(message, { code });
}

export function evaluateExactPolynomialTangent(
  polynomial,
  point,
  options = undefined,
) {
  const coefficients = snapshotPolynomial(polynomial);
  const approachPoint = snapshotExactRational(point, "接点のx座標");
  const declared = snapshotOptions(options);

  const pointValue = evaluatePolynomial(coefficients, approachPoint);
  const pointMembershipDifference = declared.declared
    ? exactDifference(pointValue, declared.declaredValue)
    : null;
  const pointMembershipMatches = !declared.declared
    || pointMembershipDifference.isZero();
  if (!pointMembershipMatches) {
    throw new ExactPolynomialTangentError(
      `宣言された点(${approachPoint}, ${declared.declaredValue})は曲線上にありません。f(${approachPoint})=${pointValue}です。`,
      { code: "DECLARED_POINT_NOT_ON_CURVE" },
    );
  }

  const derivativePolynomial = differentiatePolynomial(coefficients);
  const slope = evaluatePolynomial(derivativePolynomial, approachPoint);
  const intercept = pointValue.subtract(slope.multiply(approachPoint));
  const lineCoefficients = Object.freeze([intercept, slope]);

  const lineValueAtPoint = evaluatePolynomial(lineCoefficients, approachPoint);
  const linePointDifference = exactDifference(lineValueAtPoint, pointValue);
  const linePointVerified = linePointDifference.isZero();
  requireVerified(
    linePointVerified,
    "構成した直線が接点を通ることを厳密に検証できませんでした。",
    "TANGENT_LINE_POINT_VERIFICATION_FAILED",
  );

  const derivativeValueAtPoint = evaluatePolynomial(
    derivativePolynomial,
    approachPoint,
  );
  const slopeDifference = exactDifference(slope, derivativeValueAtPoint);
  const slopeVerified = slopeDifference.isZero();
  requireVerified(
    slopeVerified,
    "構成した直線の傾きが接点での導関数値と一致しません。",
    "TANGENT_SLOPE_VERIFICATION_FAILED",
  );

  const pointMembership = Object.freeze({
    checked: declared.declared,
    point: approachPoint,
    declaredValue: declared.declaredValue,
    evaluatedValue: pointValue,
    difference: pointMembershipDifference,
    matches: pointMembershipMatches,
    verified: true,
  });
  const linePointVerification = Object.freeze({
    point: approachPoint,
    expectedValue: pointValue,
    lineValue: lineValueAtPoint,
    difference: linePointDifference,
    verified: linePointVerified,
  });
  const slopeVerification = Object.freeze({
    point: approachPoint,
    derivativeValue: derivativeValueAtPoint,
    lineSlope: slope,
    difference: slopeDifference,
    verified: slopeVerified,
  });
  const verification = Object.freeze({
    pointMembership,
    linePoint: linePointVerification,
    slope: slopeVerification,
    verified: pointMembership.verified
      && linePointVerification.verified
      && slopeVerification.verified,
  });
  const exact = `y=${formatExactPolynomialForIntegral(lineCoefficients)}`;

  return Object.freeze({
    polynomial: coefficients,
    point: approachPoint,
    declaredValue: declared.declaredValue,
    pointValue,
    derivativePolynomial,
    slope,
    intercept,
    lineCoefficients,
    linePolynomial: lineCoefficients,
    pointMembership,
    linePointVerification,
    slopeVerification,
    verification,
    exact,
  });
}

export { MAX_TANGENT_POLYNOMIAL_DEGREE };
