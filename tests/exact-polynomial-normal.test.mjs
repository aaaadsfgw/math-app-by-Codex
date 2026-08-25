import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactPolynomialNormalError,
  MAX_NORMAL_POLYNOMIAL_DEGREE,
  evaluateExactPolynomialNormal,
} from "../js/math-core/exact-polynomial-normal.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

function q(value) {
  const [numerator, denominator] = String(value).split("/");
  return new ExactRational(BigInt(numerator), BigInt(denominator ?? "1"));
}

function normal(coefficients, point, declaredValue = null) {
  return evaluateExactPolynomialNormal(
    coefficients.map(q),
    q(point),
    declaredValue === null ? undefined : { declaredValue: q(declaredValue) },
  );
}

test("4次以下の多項式から非垂直な法線を暗黙形と傾き切片形で厳密構成する", () => {
  const result = normal(["3", "0", "-2", "0", "1"], "2", "11");

  assert.deepEqual(result.polynomial.map(String), ["3", "0", "-2", "0", "1"]);
  assert.equal(result.point.toString(), "2");
  assert.equal(result.declaredValue.toString(), "11");
  assert.equal(result.pointValue.toString(), "11");
  assert.deepEqual(result.derivativePolynomial.map(String), ["0", "-4", "0", "4"]);
  assert.equal(result.tangentSlope.toString(), "24");
  assert.deepEqual(result.tangentDirection.map(String), ["1", "24"]);
  assert.deepEqual(result.normalDirection.map(String), ["-24", "1"]);
  assert.deepEqual(result.implicitLineCoefficients.map(String), ["1", "24", "-266"]);
  assert.equal(result.implicitLine.A.toString(), "1");
  assert.equal(result.implicitLine.B.toString(), "24");
  assert.equal(result.implicitLine.C.toString(), "-266");
  assert.equal(result.implicitLine.coefficients, result.implicitLineCoefficients);
  assert.equal(result.implicitLine.exact, "x+24y-266=0");

  assert.equal(result.line.kind, "slope-intercept");
  assert.equal(result.line.slope.toString(), "-1/24");
  assert.equal(result.line.intercept.toString(), "133/12");
  assert.deepEqual(result.line.lineCoefficients.map(String), ["133/12", "-1/24"]);
  assert.equal(result.line.linePolynomial, result.line.lineCoefficients);
  assert.equal(result.line.exact, "y=-(1/24)x+133/12");
  assert.equal(result.exact, result.line.exact);

  assert.equal(result.pointMembership.checked, true);
  assert.equal(result.pointMembership.matches, true);
  assert.equal(result.linePointVerification.kind, "slope-intercept");
  assert.equal(result.linePointVerification.implicitValue.toString(), "0");
  assert.equal(result.linePointVerification.lineValue.toString(), "11");
  assert.equal(result.linePointVerification.difference.toString(), "0");
  assert.equal(result.linePointVerification.verified, true);
  assert.equal(result.orthogonalityVerification.dotProduct.toString(), "0");
  assert.equal(result.orthogonalityVerification.expected.toString(), "0");
  assert.equal(result.orthogonalityVerification.verified, true);
  assert.equal(result.slopeProductVerification.applicable, true);
  assert.equal(result.slopeProductVerification.product.toString(), "-1");
  assert.equal(result.slopeProductVerification.expected.toString(), "-1");
  assert.equal(result.slopeProductVerification.difference.toString(), "0");
  assert.equal(result.slopeProductVerification.verified, true);
  assert.equal(result.verification.verified, true);
});

test("接線傾き0ではInfinityや偽の傾きを作らず垂直法線をtagged unionで返す", () => {
  const stationary = normal(["1", "0", "1"], "0", "1");

  assert.equal(stationary.tangentSlope.toString(), "0");
  assert.deepEqual(stationary.tangentDirection.map(String), ["1", "0"]);
  assert.deepEqual(stationary.normalDirection.map(String), ["0", "1"]);
  assert.deepEqual(stationary.implicitLineCoefficients.map(String), ["1", "0", "0"]);
  assert.equal(stationary.implicitLine.exact, "x=0");
  assert.deepEqual(Object.keys(stationary.line).sort(), ["exact", "kind", "x"]);
  assert.equal(stationary.line.kind, "vertical");
  assert.equal(stationary.line.x.toString(), "0");
  assert.equal(stationary.line.exact, "x=0");
  assert.equal(Object.hasOwn(stationary.line, "slope"), false);
  assert.equal(Object.hasOwn(stationary.line, "intercept"), false);
  assert.equal(stationary.linePointVerification.kind, "vertical");
  assert.equal(stationary.linePointVerification.coordinateDifference.toString(), "0");
  assert.equal(stationary.slopeProductVerification.applicable, false);
  assert.equal(Object.hasOwn(stationary.slopeProductVerification, "normalSlope"), false);
  assert.equal(stationary.slopeProductVerification.verified, true);
  assert.equal(stationary.verification.verified, true);
  for (const value of [
    stationary,
    stationary.line,
    stationary.implicitLine,
    stationary.implicitLineCoefficients,
    stationary.linePointVerification,
    stationary.orthogonalityVerification,
    stationary.slopeProductVerification,
    stationary.verification,
  ]) {
    assert.equal(Object.isFrozen(value), true);
  }

  const constant = normal(["5"], "7/3", "5");
  assert.equal(constant.line.kind, "vertical");
  assert.equal(constant.line.exact, "x=7/3");
  assert.deepEqual(constant.implicitLineCoefficients.map(String), ["1", "0", "-7/3"]);
  assert.equal(constant.implicitLine.exact, "x-7/3=0");
});

test("宣言された点が曲線上にない場合を法線固有のtyped errorにする", () => {
  assert.throws(
    () => normal(["1", "0", "1"], "2", "4"),
    (error) => error instanceof ExactPolynomialNormalError
      && error.code === "DECLARED_POINT_NOT_ON_CURVE"
      && error.unsupported === false
      && /\(2, 4\).*f\(2\)=5/u.test(error.message),
  );

  const computedPoint = normal(["1", "0", "1"], "2");
  assert.equal(computedPoint.pointValue.toString(), "5");
  assert.equal(computedPoint.declaredValue, null);
  assert.equal(computedPoint.pointMembership.checked, false);
  assert.equal(computedPoint.pointMembership.declaredValue, null);
  assert.equal(computedPoint.pointMembership.difference, null);
  assert.equal(computedPoint.pointMembership.matches, true);
});

test("分数係数・分数接点と巨大BigIntを丸めず保持する", () => {
  const fractional = normal(["7/11", "-2/5", "0", "1/3"], "3/2");
  assert.equal(fractional.pointValue.toString(), "511/440");
  assert.equal(fractional.tangentSlope.toString(), "37/20");
  assert.deepEqual(
    fractional.implicitLineCoefficients.map(String),
    ["1", "37/20", "-32107/8800"],
  );
  assert.equal(fractional.line.kind, "slope-intercept");
  assert.equal(fractional.line.slope.toString(), "-20/37");
  assert.equal(fractional.line.intercept.toString(), "32107/16280");
  assert.equal(fractional.line.exact, "y=-(20/37)x+32107/16280");

  const hugeText = `9${"8".repeat(238)}`;
  const otherText = `7${"6".repeat(238)}`;
  const huge = normal([otherText, hugeText], "0");
  const expectedC = -(BigInt(hugeText) * BigInt(otherText));
  assert.equal(huge.tangentSlope.toString(), hugeText);
  assert.equal(huge.pointValue.toString(), otherText);
  assert.equal(huge.implicitLine.C.toString(), String(expectedC));
  assert.equal(huge.line.slope.toString(), `-1/${hugeText}`);
  assert.equal(huge.verification.verified, true);
});

test("公開境界は次数超過・疎配列・末尾0・巨大中間値をfail closedにする", () => {
  assert.equal(MAX_NORMAL_POLYNOMIAL_DEGREE, 4);
  assert.doesNotThrow(() => normal(["0", "0", "0", "0", "1"], "1"));
  assert.throws(
    () => normal(["0", "0", "0", "0", "0", "1"], "1"),
    (error) => error instanceof ExactPolynomialNormalError
      && error.code === "NORMAL_POLYNOMIAL_DEGREE_TOO_HIGH"
      && error.unsupported === true,
  );
  assert.throws(
    () => evaluateExactPolynomialNormal([q("1"), , q("1")], q("0")),
    /疎配列/u,
  );
  assert.throws(
    () => evaluateExactPolynomialNormal([q("1"), q("0")], q("0")),
    (error) => error instanceof ExactPolynomialNormalError
      && error.code === "NONCANONICAL_NORMAL_POLYNOMIAL",
  );
  assert.throws(() => evaluateExactPolynomialNormal([], q("0")), TypeError);
  assert.throws(() => evaluateExactPolynomialNormal("x", q("0")), TypeError);
  assert.throws(() => evaluateExactPolynomialNormal([q("1")], 0), TypeError);
  assert.throws(
    () => evaluateExactPolynomialNormal([q("1")], q("0"), {
      declaredValue: "1",
    }),
    TypeError,
  );
  assert.throws(
    () => evaluateExactPolynomialNormal([q("1")], q("0"), null),
    TypeError,
  );

  const oversized = `8${"7".repeat(298)}`;
  assert.throws(
    () => normal([oversized, oversized], "0"),
    (error) => error instanceof RangeError && /大きすぎ/u.test(error.message),
  );
});

test("派生ExactRationalを基底snapshotへ落とし、返却木を深く凍結する", () => {
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
  const result = evaluateExactPolynomialNormal(mutablePolynomial, point, {
    declaredValue,
  });
  mutablePolynomial[0] = q("999");
  mutablePolynomial.length = 1;

  assert.deepEqual(result.polynomial.map(String), ["1", "2", "3"]);
  assert.equal(result.pointValue.toString(), "17");
  assert.equal(result.tangentSlope.toString(), "14");
  assert.equal(result.line.slope.toString(), "-1/14");
  assert.equal(result.line.exact, "y=-(1/14)x+120/7");
  assert.equal(Object.getPrototypeOf(result.polynomial[0]), ExactRational.prototype);
  assert.equal(Object.getPrototypeOf(result.point), ExactRational.prototype);
  assert.equal(Object.getPrototypeOf(result.declaredValue), ExactRational.prototype);

  const frozenValues = [
    result,
    result.polynomial,
    result.derivativePolynomial,
    result.tangentDirection,
    result.normalDirection,
    result.implicitLineCoefficients,
    result.implicitLine,
    result.line,
    result.line.lineCoefficients,
    result.pointMembership,
    result.linePointVerification,
    result.orthogonalityVerification,
    result.slopeProductVerification,
    result.verification,
  ];
  for (const value of frozenValues) assert.equal(Object.isFrozen(value), true);
  assert.equal(result.verification.pointMembership, result.pointMembership);
  assert.equal(result.verification.linePoint, result.linePointVerification);
  assert.equal(result.verification.orthogonality, result.orthogonalityVerification);
  assert.equal(result.verification.slopeProduct, result.slopeProductVerification);
  assert.throws(() => result.normalDirection.push(q("1")), TypeError);
  assert.throws(() => result.line.lineCoefficients.push(q("1")), TypeError);
});

test("hostile getter・継承係数・入力の後変更から検証済み結果を作らない", () => {
  const hostileCoefficient = new Proxy(q("1"), {
    get(target, property, receiver) {
      if (property === "numerator") throw new Error("numerator参照を拒否");
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => evaluateExactPolynomialNormal([hostileCoefficient], q("0")),
    /numerator参照を拒否/u,
  );

  const hostileOptions = Object.freeze({
    get declaredValue() {
      throw new Error("declaredValue参照を拒否");
    },
  });
  assert.throws(
    () => evaluateExactPolynomialNormal([q("1")], q("0"), hostileOptions),
    /declaredValue参照を拒否/u,
  );

  const inherited = [q("1")];
  inherited.length = 2;
  Object.setPrototypeOf(inherited, { 1: q("2") });
  assert.throws(
    () => evaluateExactPolynomialNormal(inherited, q("0")),
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

function pairDivide(left, right) {
  if (right.numerator === 0n) throw new RangeError("oracle division by zero");
  return pair(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function pairNegate(value) {
  return pair(-value.numerator, value.denominator);
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

test("独立BigInt分数oracleの500例で値・法線・暗黙形・直交検算を照合する", () => {
  const coveredDegrees = new Set();
  let verticalCount = 0;
  let fractionalNormalSlopeCount = 0;
  let declaredCount = 0;

  for (let index = 0; index < 500; index += 1) {
    const degree = index % 5;
    const coefficients = Array.from({ length: degree + 1 }, (_, power) => {
      let numerator = BigInt(((index + 7) * (power + 3) + power * 11) % 31 - 15);
      if (power === degree && numerator === 0n) {
        numerator = index % 2 === 0 ? 17n : -19n;
      }
      return pair(numerator, BigInt((index * 3 + power * 5) % 9 + 1));
    });
    const point = pair(
      BigInt((index * 13) % 37 - 18),
      BigInt((index * 7) % 10 + 1),
    );
    const pointValue = pairEvaluate(coefficients, point);
    const derivative = pairDerivative(coefficients);
    const tangentSlope = pairEvaluate(derivative, point);
    const implicitC = pairNegate(pairAdd(
      point,
      pairMultiply(tangentSlope, pointValue),
    ));
    const declared = index % 4 === 0;

    const result = evaluateExactPolynomialNormal(
      coefficients.map(exactFromPair),
      exactFromPair(point),
      declared ? { declaredValue: exactFromPair(pointValue) } : undefined,
    );

    coveredDegrees.add(degree);
    if (declared) declaredCount += 1;
    assert.deepEqual(result.polynomial.map(String), coefficients.map(pairText));
    assert.deepEqual(result.derivativePolynomial.map(String), derivative.map(pairText));
    assert.equal(result.point.toString(), pairText(point));
    assert.equal(result.pointValue.toString(), pairText(pointValue));
    assert.equal(result.tangentSlope.toString(), pairText(tangentSlope));
    assert.deepEqual(
      result.implicitLineCoefficients.map(String),
      ["1", pairText(tangentSlope), pairText(implicitC)],
    );
    assert.deepEqual(
      result.tangentDirection.map(String),
      ["1", pairText(tangentSlope)],
    );
    assert.deepEqual(
      result.normalDirection.map(String),
      [pairText(pairNegate(tangentSlope)), "1"],
    );

    if (tangentSlope.numerator === 0n) {
      verticalCount += 1;
      assert.equal(result.line.kind, "vertical");
      assert.equal(result.line.x.toString(), pairText(point));
      assert.equal(result.line.exact, `x=${pairText(point)}`);
      assert.equal(Object.hasOwn(result.line, "slope"), false);
      assert.equal(result.slopeProductVerification.applicable, false);
    } else {
      const normalSlope = pairDivide(pair(-1n), tangentSlope);
      const intercept = pairAdd(
        pointValue,
        pairMultiply(normalSlope, point),
        -1n,
      );
      if (normalSlope.denominator !== 1n) fractionalNormalSlopeCount += 1;
      assert.equal(result.line.kind, "slope-intercept");
      assert.equal(result.line.slope.toString(), pairText(normalSlope));
      assert.equal(result.line.intercept.toString(), pairText(intercept));
      assert.deepEqual(
        result.line.lineCoefficients.map(String),
        [pairText(intercept), pairText(normalSlope)],
      );
      assert.equal(result.line.exact, formatPairLine(intercept, normalSlope));
      assert.equal(result.slopeProductVerification.applicable, true);
      assert.equal(result.slopeProductVerification.product.toString(), "-1");
    }
    assert.equal(result.pointMembership.checked, declared);
    assert.equal(result.linePointVerification.verified, true);
    assert.equal(result.orthogonalityVerification.dotProduct.toString(), "0");
    assert.equal(result.orthogonalityVerification.verified, true);
    assert.equal(result.slopeProductVerification.verified, true);
    assert.equal(result.verification.verified, true);
  }

  assert.deepEqual(coveredDegrees, new Set([0, 1, 2, 3, 4]));
  assert.ok(verticalCount >= 100);
  assert.ok(fractionalNormalSlopeCount > 250);
  assert.equal(declaredCount, 125);
});
