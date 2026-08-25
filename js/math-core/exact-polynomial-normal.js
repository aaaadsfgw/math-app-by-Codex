import { formatExactPolynomialForIntegral } from "./exact-polynomial-integral.js";
import {
  ExactPolynomialTangentError,
  evaluateExactPolynomialTangent,
} from "./exact-polynomial-tangent.js";
import { ExactRational } from "./exact-rational.js";

const MAX_NORMAL_POLYNOMIAL_DEGREE = 4;

export class ExactPolynomialNormalError extends Error {
  constructor(message, {
    code = "EXACT_POLYNOMIAL_NORMAL_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "ExactPolynomialNormalError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

const TANGENT_ERROR_CODES = Object.freeze({
  TANGENT_POLYNOMIAL_DEGREE_TOO_HIGH: "NORMAL_POLYNOMIAL_DEGREE_TOO_HIGH",
  NONCANONICAL_TANGENT_POLYNOMIAL: "NONCANONICAL_NORMAL_POLYNOMIAL",
  TANGENT_LINE_POINT_VERIFICATION_FAILED: "NORMAL_INPUT_POINT_VERIFICATION_FAILED",
  TANGENT_SLOPE_VERIFICATION_FAILED: "TANGENT_SLOPE_VERIFICATION_FAILED",
});

function normalMessage(message) {
  return String(message)
    .replaceAll("接線を求める", "法線を求める")
    .replaceAll("接線の追加条件", "法線の追加条件")
    .replaceAll("接線", "法線");
}

function tangentEvidence(polynomial, point, options) {
  try {
    return evaluateExactPolynomialTangent(polynomial, point, options);
  } catch (error) {
    if (!(error instanceof ExactPolynomialTangentError)) throw error;
    throw new ExactPolynomialNormalError(normalMessage(error.message), {
      code: TANGENT_ERROR_CODES[error.code] ?? error.code,
      unsupported: error.unsupported,
    });
  }
}

function requireVerified(verified, message, code) {
  if (verified) return;
  throw new ExactPolynomialNormalError(message, { code });
}

function formatVariableTerm(coefficient, variable, first) {
  if (coefficient.isZero()) return "";
  const negative = coefficient.numerator < 0n;
  const magnitude = negative ? coefficient.negate() : coefficient;
  const coefficientText = magnitude.equals(ExactRational.one())
    ? ""
    : magnitude.denominator === 1n
      ? magnitude.toString()
      : `(${magnitude})`;
  const sign = first ? (negative ? "-" : "") : (negative ? "-" : "+");
  return `${sign}${coefficientText}${variable}`;
}

function formatConstantTerm(coefficient, first) {
  if (coefficient.isZero()) return "";
  const negative = coefficient.numerator < 0n;
  const magnitude = negative ? coefficient.negate() : coefficient;
  const sign = first ? (negative ? "-" : "") : (negative ? "-" : "+");
  return `${sign}${magnitude}`;
}

function formatImplicitLine(A, B, C) {
  const terms = [];
  const xTerm = formatVariableTerm(A, "x", terms.length === 0);
  if (xTerm) terms.push(xTerm);
  const yTerm = formatVariableTerm(B, "y", terms.length === 0);
  if (yTerm) terms.push(yTerm);
  const constantTerm = formatConstantTerm(C, terms.length === 0);
  if (constantTerm) terms.push(constantTerm);
  return `${terms.join("") || "0"}=0`;
}

export function evaluateExactPolynomialNormal(
  polynomial,
  point,
  options = undefined,
) {
  const tangent = tangentEvidence(polynomial, point, options);
  const one = ExactRational.one();
  const zero = ExactRational.zero();
  const minusOne = one.negate();
  const tangentSlope = tangent.slope;

  const A = one;
  const B = tangentSlope;
  const C = tangent.point.negate().subtract(tangentSlope.multiply(tangent.pointValue));
  const implicitLineCoefficients = Object.freeze([A, B, C]);
  const implicitLine = Object.freeze({
    A,
    B,
    C,
    coefficients: implicitLineCoefficients,
    exact: formatImplicitLine(A, B, C),
  });

  const tangentDirection = Object.freeze([one, tangentSlope]);
  const normalDirection = Object.freeze([tangentSlope.negate(), one]);
  const dotProduct = tangentDirection[0].multiply(normalDirection[0])
    .add(tangentDirection[1].multiply(normalDirection[1]));
  const orthogonalityVerified = dotProduct.isZero();
  requireVerified(
    orthogonalityVerified,
    "接線方向と法線方向の内積が0になることを厳密に検証できませんでした。",
    "NORMAL_ORTHOGONALITY_VERIFICATION_FAILED",
  );

  const implicitValueAtPoint = A.multiply(tangent.point)
    .add(B.multiply(tangent.pointValue))
    .add(C);
  const implicitPointVerified = implicitValueAtPoint.isZero();

  let line;
  let linePointVerification;
  let slopeProductVerification;
  if (tangentSlope.isZero()) {
    const exact = `x=${tangent.point}`;
    line = Object.freeze({
      kind: "vertical",
      x: tangent.point,
      exact,
    });
    const coordinateDifference = tangent.point.subtract(line.x);
    const linePointVerified = coordinateDifference.isZero();
    linePointVerification = Object.freeze({
      kind: "vertical",
      pointX: tangent.point,
      pointY: tangent.pointValue,
      implicitValue: implicitValueAtPoint,
      coordinateDifference,
      verified: implicitPointVerified && linePointVerified,
    });
    slopeProductVerification = Object.freeze({
      applicable: false,
      reason: "法線が垂直線のため有限な傾き積を定義しません。",
      verified: true,
    });
  } else {
    const normalSlope = minusOne.divide(tangentSlope);
    const intercept = tangent.pointValue.subtract(
      normalSlope.multiply(tangent.point),
    );
    const lineCoefficients = Object.freeze([intercept, normalSlope]);
    const exact = `y=${formatExactPolynomialForIntegral(lineCoefficients)}`;
    line = Object.freeze({
      kind: "slope-intercept",
      slope: normalSlope,
      intercept,
      lineCoefficients,
      linePolynomial: lineCoefficients,
      exact,
    });
    const lineValue = normalSlope.multiply(tangent.point).add(intercept);
    const difference = lineValue.subtract(tangent.pointValue);
    const linePointVerified = difference.isZero();
    linePointVerification = Object.freeze({
      kind: "slope-intercept",
      pointX: tangent.point,
      pointY: tangent.pointValue,
      implicitValue: implicitValueAtPoint,
      lineValue,
      difference,
      verified: implicitPointVerified && linePointVerified,
    });

    const product = tangentSlope.multiply(normalSlope);
    const differenceFromMinusOne = product.subtract(minusOne);
    const productVerified = differenceFromMinusOne.isZero();
    slopeProductVerification = Object.freeze({
      applicable: true,
      tangentSlope,
      normalSlope,
      product,
      expected: minusOne,
      difference: differenceFromMinusOne,
      verified: productVerified,
    });
  }

  requireVerified(
    linePointVerification.verified,
    "構成した法線が指定点を通ることを厳密に検証できませんでした。",
    "NORMAL_LINE_POINT_VERIFICATION_FAILED",
  );
  requireVerified(
    slopeProductVerification.verified,
    "非垂直な接線と法線の傾きの積が-1になることを厳密に検証できませんでした。",
    "NORMAL_SLOPE_PRODUCT_VERIFICATION_FAILED",
  );

  const orthogonalityVerification = Object.freeze({
    tangentDirection,
    normalDirection,
    dotProduct,
    expected: zero,
    verified: orthogonalityVerified,
  });
  const pointMembership = tangent.pointMembership;
  const verification = Object.freeze({
    pointMembership,
    linePoint: linePointVerification,
    orthogonality: orthogonalityVerification,
    slopeProduct: slopeProductVerification,
    verified: pointMembership.verified
      && linePointVerification.verified
      && orthogonalityVerification.verified
      && slopeProductVerification.verified,
  });

  return Object.freeze({
    polynomial: tangent.polynomial,
    point: tangent.point,
    declaredValue: tangent.declaredValue,
    pointValue: tangent.pointValue,
    derivativePolynomial: tangent.derivativePolynomial,
    tangentSlope,
    tangentDirection,
    normalDirection,
    implicitLineCoefficients,
    implicitLine,
    line,
    pointMembership,
    linePointVerification,
    orthogonalityVerification,
    slopeProductVerification,
    verification,
    exact: line.exact,
  });
}

export { MAX_NORMAL_POLYNOMIAL_DEGREE };
