import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactPolynomialTangentError,
  MAX_TANGENT_POLYNOMIAL_DEGREE,
  evaluateExactPolynomialTangent,
} from "../js/math-core/exact-polynomial-tangent.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

function q(value) {
  const [numerator, denominator] = String(value).split("/");
  return new ExactRational(BigInt(numerator), BigInt(denominator ?? "1"));
}

function tangent(coefficients, point, declaredValue = null) {
  return evaluateExactPolynomialTangent(
    coefficients.map(q),
    q(point),
    declaredValue === null ? undefined : { declaredValue: q(declaredValue) },
  );
}

test("4次以下の多項式を係数微分し、接線を厳密分数で構成する", () => {
  const result = tangent(["3", "0", "-2", "0", "1"], "2", "11");

  assert.deepEqual(result.polynomial.map(String), ["3", "0", "-2", "0", "1"]);
  assert.equal(result.point.toString(), "2");
  assert.equal(result.declaredValue.toString(), "11");
  assert.equal(result.pointValue.toString(), "11");
  assert.deepEqual(result.derivativePolynomial.map(String), ["0", "-4", "0", "4"]);
  assert.equal(result.slope.toString(), "24");
  assert.equal(result.intercept.toString(), "-37");
  assert.deepEqual(result.lineCoefficients.map(String), ["-37", "24"]);
  assert.equal(result.linePolynomial, result.lineCoefficients);
  assert.equal(result.exact, "y=24x-37");

  assert.equal(result.pointMembership.checked, true);
  assert.equal(result.pointMembership.matches, true);
  assert.equal(result.pointMembership.difference.toString(), "0");
  assert.equal(result.linePointVerification.lineValue.toString(), "11");
  assert.equal(result.linePointVerification.difference.toString(), "0");
  assert.equal(result.linePointVerification.verified, true);
  assert.equal(result.slopeVerification.derivativeValue.toString(), "24");
  assert.equal(result.slopeVerification.lineSlope.toString(), "24");
  assert.equal(result.slopeVerification.difference.toString(), "0");
  assert.equal(result.slopeVerification.verified, true);
  assert.equal(result.verification.verified, true);
});

test("宣言されたy座標が曲線値と異なる接点をtyped errorにする", () => {
  assert.throws(
    () => tangent(["1", "0", "1"], "2", "4"),
    (error) => error instanceof ExactPolynomialTangentError
      && error.code === "DECLARED_POINT_NOT_ON_CURVE"
      && error.unsupported === false
      && /\(2, 4\).*f\(2\)=5/u.test(error.message),
  );

  const computedPoint = tangent(["1", "0", "1"], "2");
  assert.equal(computedPoint.pointValue.toString(), "5");
  assert.equal(computedPoint.declaredValue, null);
  assert.equal(computedPoint.pointMembership.checked, false);
  assert.equal(computedPoint.pointMembership.declaredValue, null);
  assert.equal(computedPoint.pointMembership.difference, null);
  assert.equal(computedPoint.pointMembership.matches, true);
  assert.equal(computedPoint.pointMembership.verified, true);
});

test("定数関数と水平接線でも固定幅[c,m]とcanonical表示を保つ", () => {
  const constant = tangent(["5"], "7/3", "5");
  assert.deepEqual(constant.derivativePolynomial.map(String), ["0"]);
  assert.equal(constant.slope.toString(), "0");
  assert.equal(constant.intercept.toString(), "5");
  assert.deepEqual(constant.lineCoefficients.map(String), ["5", "0"]);
  assert.equal(constant.exact, "y=5");

  const horizontal = tangent(["1", "0", "1"], "0", "1");
  assert.deepEqual(horizontal.derivativePolynomial.map(String), ["0", "2"]);
  assert.deepEqual(horizontal.lineCoefficients.map(String), ["1", "0"]);
  assert.equal(horizontal.exact, "y=1");

  const zero = tangent(["0"], "-9/7", "0");
  assert.deepEqual(zero.lineCoefficients.map(String), ["0", "0"]);
  assert.equal(zero.exact, "y=0");
});

test("分数係数・分数接点・巨大BigInt分数を丸めず保持する", () => {
  const fractional = tangent(["7/11", "-2/5", "0", "1/3"], "3/2");
  assert.equal(fractional.pointValue.toString(), "511/440");
  assert.deepEqual(fractional.derivativePolynomial.map(String), ["-2/5", "0", "1"]);
  assert.equal(fractional.slope.toString(), "37/20");
  assert.equal(fractional.intercept.toString(), "-71/44");
  assert.equal(fractional.exact, "y=(37/20)x-71/44");

  const hugeNumerator = BigInt(`9${"8".repeat(179)}`);
  const hugeDenominator = BigInt(`7${"6".repeat(179)}`);
  const otherNumerator = BigInt(`5${"4".repeat(179)}`);
  const otherDenominator = BigInt(`3${"2".repeat(179)}`);
  const hugeSlope = new ExactRational(hugeNumerator, hugeDenominator);
  const hugeIntercept = new ExactRational(otherNumerator, otherDenominator);
  const huge = evaluateExactPolynomialTangent(
    [hugeIntercept, hugeSlope],
    q("2/3"),
  );
  assert.equal(huge.slope.toString(), hugeSlope.toString());
  assert.equal(huge.intercept.toString(), hugeIntercept.toString());
  assert.deepEqual(
    huge.lineCoefficients.map(String),
    [hugeIntercept.toString(), hugeSlope.toString()],
  );
  assert.equal(huge.verification.verified, true);
});

test("公開境界は次数超過・疎配列・非canonical係数をfail closedにする", () => {
  assert.equal(MAX_TANGENT_POLYNOMIAL_DEGREE, 4);
  assert.doesNotThrow(() => tangent(["0", "0", "0", "0", "1"], "1"));

  assert.throws(
    () => tangent(["0", "0", "0", "0", "0", "1"], "1"),
    (error) => error instanceof ExactPolynomialTangentError
      && error.code === "TANGENT_POLYNOMIAL_DEGREE_TOO_HIGH"
      && error.unsupported === true,
  );
  assert.throws(
    () => evaluateExactPolynomialTangent([q("1"), , q("1")], q("0")),
    /疎配列/u,
  );
  assert.throws(
    () => evaluateExactPolynomialTangent([q("1"), q("0")], q("0")),
    (error) => error instanceof ExactPolynomialTangentError
      && error.code === "NONCANONICAL_TANGENT_POLYNOMIAL",
  );
  assert.throws(() => evaluateExactPolynomialTangent([], q("0")), TypeError);
  assert.throws(() => evaluateExactPolynomialTangent("x", q("0")), TypeError);
  assert.throws(() => evaluateExactPolynomialTangent([q("1")], 0), TypeError);
  assert.throws(
    () => evaluateExactPolynomialTangent([q("1")], q("0"), {
      declaredValue: "1",
    }),
    TypeError,
  );
  assert.throws(
    () => evaluateExactPolynomialTangent([q("1")], q("0"), null),
    TypeError,
  );
});

test("公開APIは派生型を基底snapshotへ落とし、返却証拠を深く凍結する", () => {
  class HostileDerivedRational extends ExactRational {
    isZero() {
      throw new Error("派生型のisZeroを呼び出してはいけない");
    }

    multiply() {
      throw new Error("派生型のmultiplyを呼び出してはいけない");
    }

    toString() {
      throw new Error("派生型のtoStringを呼び出してはいけない");
    }
  }

  const mutablePolynomial = [
    new HostileDerivedRational(1n),
    new HostileDerivedRational(2n),
    new HostileDerivedRational(3n),
  ];
  const point = new HostileDerivedRational(2n);
  const declaredValue = new HostileDerivedRational(17n);
  const result = evaluateExactPolynomialTangent(mutablePolynomial, point, {
    declaredValue,
  });
  mutablePolynomial[0] = q("999");
  mutablePolynomial.length = 1;

  assert.deepEqual(result.polynomial.map(String), ["1", "2", "3"]);
  assert.equal(result.pointValue.toString(), "17");
  assert.equal(result.exact, "y=14x-11");
  assert.equal(Object.getPrototypeOf(result.polynomial[0]), ExactRational.prototype);
  assert.equal(Object.getPrototypeOf(result.point), ExactRational.prototype);
  assert.equal(Object.getPrototypeOf(result.declaredValue), ExactRational.prototype);

  for (const frozen of [
    result,
    result.polynomial,
    result.derivativePolynomial,
    result.lineCoefficients,
    result.pointMembership,
    result.linePointVerification,
    result.slopeVerification,
    result.verification,
  ]) {
    assert.equal(Object.isFrozen(frozen), true);
  }
  assert.equal(result.verification.pointMembership, result.pointMembership);
  assert.equal(result.verification.linePoint, result.linePointVerification);
  assert.equal(result.verification.slope, result.slopeVerification);
  assert.throws(() => result.lineCoefficients.push(q("1")), TypeError);
});

test("hostile getterや偽装境界から検証済み結果を作らない", () => {
  const hostileCoefficient = new Proxy(q("1"), {
    get(target, property, receiver) {
      if (property === "numerator") throw new Error("numerator参照を拒否");
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => evaluateExactPolynomialTangent([hostileCoefficient], q("0")),
    /numerator参照を拒否/u,
  );

  const hostileOptions = Object.freeze({
    get declaredValue() {
      throw new Error("declaredValue参照を拒否");
    },
  });
  assert.throws(
    () => evaluateExactPolynomialTangent([q("1")], q("0"), hostileOptions),
    /declaredValue参照を拒否/u,
  );

  const inherited = [q("1")];
  inherited.length = 2;
  Object.setPrototypeOf(inherited, { 1: q("2") });
  assert.throws(
    () => evaluateExactPolynomialTangent(inherited, q("0")),
    /疎配列/u,
  );
});

function absolute(value) {
  return value < 0n ? -value : value;
}

function divisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function pair(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError("oracle denominator is zero");
  const sign = denominator < 0n ? -1n : 1n;
  const common = divisor(numerator, denominator);
  return Object.freeze({
    numerator: sign * numerator / common,
    denominator: absolute(denominator) / common,
  });
}

function pairAdd(left, right, sign = 1n) {
  return pair(
    left.numerator * right.denominator
      + sign * right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function pairMultiply(left, right) {
  return pair(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function pairEvaluate(coefficients, point) {
  let value = pair(0n);
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    value = pairAdd(pairMultiply(value, point), coefficients[index]);
  }
  return value;
}

function pairDerivative(coefficients) {
  return coefficients.length === 1
    ? [pair(0n)]
    : coefficients.slice(1).map((coefficient, index) => (
      pairMultiply(coefficient, pair(BigInt(index + 1)))
    ));
}

function pairText(value) {
  return value.denominator === 1n
    ? String(value.numerator)
    : `${value.numerator}/${value.denominator}`;
}

function exactFromPair(value) {
  return new ExactRational(value.numerator, value.denominator);
}

function formatPairLine(intercept, slope) {
  const terms = [];
  if (slope.numerator !== 0n) {
    const negative = slope.numerator < 0n;
    const magnitude = pair(absolute(slope.numerator), slope.denominator);
    const coefficient = magnitude.numerator === magnitude.denominator
      ? ""
      : magnitude.denominator === 1n
        ? String(magnitude.numerator)
        : `(${pairText(magnitude)})`;
    terms.push(`${negative ? "-" : ""}${coefficient}x`);
  }
  if (intercept.numerator !== 0n) {
    const negative = intercept.numerator < 0n;
    const magnitude = pair(absolute(intercept.numerator), intercept.denominator);
    const prefix = terms.length ? (negative ? "-" : "+") : (negative ? "-" : "");
    terms.push(`${prefix}${pairText(magnitude)}`);
  }
  return `y=${terms.join("") || "0"}`;
}

test("独立BigInt分数oracleの400例で値・係数微分・接線・検算を照合する", () => {
  const coveredDegrees = new Set();
  let declaredCount = 0;
  let fractionalSlopeCount = 0;
  let negativePointCount = 0;

  for (let index = 0; index < 400; index += 1) {
    const degree = index % 5;
    const coefficients = Array.from({ length: degree + 1 }, (_, power) => {
      let numerator = BigInt(((index + 3) * (power + 5) + power * 7) % 23 - 11);
      if (power === degree && numerator === 0n) {
        numerator = index % 2 === 0 ? 13n : -17n;
      }
      return pair(numerator, BigInt((index + power * 3) % 7 + 1));
    });
    const point = pair(
      BigInt((index * 11) % 29 - 14),
      BigInt((index * 5) % 8 + 1),
    );
    const pointValue = pairEvaluate(coefficients, point);
    const derivative = pairDerivative(coefficients);
    const slope = pairEvaluate(derivative, point);
    const intercept = pairAdd(pointValue, pairMultiply(slope, point), -1n);
    const declared = index % 3 === 0;

    const result = evaluateExactPolynomialTangent(
      coefficients.map(exactFromPair),
      exactFromPair(point),
      declared ? { declaredValue: exactFromPair(pointValue) } : undefined,
    );

    coveredDegrees.add(degree);
    if (declared) declaredCount += 1;
    if (slope.denominator !== 1n) fractionalSlopeCount += 1;
    if (point.numerator < 0n) negativePointCount += 1;
    assert.deepEqual(result.polynomial.map(String), coefficients.map(pairText));
    assert.deepEqual(result.derivativePolynomial.map(String), derivative.map(pairText));
    assert.equal(result.point.toString(), pairText(point));
    assert.equal(result.pointValue.toString(), pairText(pointValue));
    assert.equal(result.slope.toString(), pairText(slope));
    assert.equal(result.intercept.toString(), pairText(intercept));
    assert.deepEqual(
      result.lineCoefficients.map(String),
      [pairText(intercept), pairText(slope)],
    );
    assert.equal(result.exact, formatPairLine(intercept, slope));
    assert.equal(result.pointMembership.checked, declared);
    assert.equal(result.pointMembership.matches, true);
    assert.equal(result.linePointVerification.verified, true);
    assert.equal(result.slopeVerification.verified, true);
    assert.equal(result.verification.verified, true);
  }

  assert.deepEqual(coveredDegrees, new Set([0, 1, 2, 3, 4]));
  assert.equal(declaredCount, 134);
  assert.ok(fractionalSlopeCount > 200);
  assert.ok(negativePointCount > 150);
});
