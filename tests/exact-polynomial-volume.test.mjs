import assert from "node:assert/strict";
import test from "node:test";

import { ExactLinearPi } from "../js/math-core/exact-linear-pi.js";
import { exactPolynomialFromAst } from "../js/math-core/exact-polynomial.js";
import {
  ExactPolynomialVolumeError,
  MAX_VOLUME_CROSS_SECTION_DEGREE,
  MAX_VOLUME_RADIUS_DEGREE,
  evaluateExactPolynomialVolume,
} from "../js/math-core/exact-polynomial-volume.js";
import { ExactRational } from "../js/math-core/exact-rational.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";

function polynomial(source) {
  return exactPolynomialFromAst(
    parseMathExpression(source, { symbols: ["x"] }).ast,
  );
}

function q(value) {
  const [numerator, denominator] = String(value).split("/");
  return denominator
    ? new ExactRational(BigInt(numerator), BigInt(denominator))
    : ExactRational.parse(numerator);
}

function volume(outer, inner, lower, upper) {
  return evaluateExactPolynomialVolume(polynomial(outer), polynomial(inner), {
    lower: q(lower),
    upper: q(upper),
  });
}

function assertVolume(outer, inner, lower, upper, expected) {
  const result = volume(outer, inner, lower, upper);
  assert.equal(result.exact, expected);
  assert.equal(result.value instanceof ExactLinearPi, true);
  assert.equal(result.value.rationalPart.toString(), "0");
  assert.equal(result.value.piCoefficient.toString(), result.volumeCoefficient.toString());
  return result;
}

test("x軸まわりの円板を2次半径の4次断面まで厳密に積分する", () => {
  assertVolume("x", "0", "0", "1", "pi/3");
  assertVolume("1-x^2", "0", "-1", "1", "16*pi/15");
  const quartic = assertVolume("(x-1)^2", "0", "0", "2", "2*pi/5");
  assert.equal(quartic.outerSquared.length - 1, 4);
  assert.equal(quartic.crossSectionPolynomial.length - 1, 4);
  assert.deepEqual(
    quartic.crossSectionPolynomial.map(String),
    ["1", "-4", "6", "-4", "1"],
  );
});

test("外半径と内半径の平方差を直接係数畳み込みしてワッシャー体積を得る", () => {
  assertVolume("2", "1", "0", "3", "9*pi");
  assertVolume("x+2", "x+1", "0", "1", "4*pi");
  assertVolume("x^2+1", "x^2", "-1", "1", "10*pi/3");
  assertVolume("(x-1)^2+1", "1", "0", "2", "26*pi/15");
  const equal = assertVolume("x^2+1", "x^2+1", "-3/2", "7/3", "0");
  assert.deepEqual(equal.radiusDifference.map(String), ["0"]);
  assert.deepEqual(equal.crossSectionPolynomial.map(String), ["0"]);
  assert.deepEqual(equal.antiderivative.map(String), ["0"]);
});

test("端点と区間内頂点だけで2次半径の非負性と外内順序を証明する", () => {
  const result = volume("(x-1/2)^2+1", "(x-1/2)^2", "0", "1");
  assert.equal(result.outerCertificate.verified, true);
  assert.equal(result.innerCertificate.verified, true);
  assert.equal(result.orderCertificate.verified, true);
  assert.equal(result.innerCertificate.minimum.toString(), "0");
  assert.equal(result.innerCertificate.witness.kind, "vertex");
  assert.equal(result.innerCertificate.witness.x.toString(), "1/2");
  assert.deepEqual(
    result.innerCertificate.candidates.map(({ kind }) => kind),
    ["lower-endpoint", "upper-endpoint", "vertex"],
  );

  const concave = volume("1-x^2", "0", "-1", "1");
  assert.equal(concave.outerCertificate.minimum.toString(), "0");
  assert.deepEqual(
    concave.outerCertificate.candidates.map(({ kind }) => kind),
    ["lower-endpoint", "upper-endpoint"],
  );

  const tangentOrder = volume("(x-1)^2+1", "1", "0", "2");
  assert.equal(tangentOrder.orderCertificate.minimum.toString(), "0");
  assert.equal(tangentOrder.orderCertificate.witness.kind, "vertex");
});

test("端点だけでは見つからない負半径と外内逆転をfail closedにする", () => {
  assert.throws(
    () => volume("2", "x^2-x+6/25", "0", "1"),
    (error) => error instanceof ExactPolynomialVolumeError
      && error.code === "INNER_RADIUS_NEGATIVE"
      && error.unsupported
      && /x=1\/2.*-1\/100/u.test(error.message),
  );
  assert.throws(
    () => volume("-1", "0", "0", "1"),
    (error) => error instanceof ExactPolynomialVolumeError
      && error.code === "OUTER_RADIUS_NEGATIVE"
      && error.unsupported,
  );
  assert.throws(
    () => volume("x^2-x+31/25", "1", "0", "1"),
    (error) => error instanceof ExactPolynomialVolumeError
      && error.code === "RADIUS_ORDER_VIOLATION"
      && error.unsupported
      && /x=1\/2.*-1\/100/u.test(error.message),
  );
  assert.throws(
    () => volume("1", "2", "0", "1"),
    (error) => error instanceof ExactPolynomialVolumeError
      && error.code === "RADIUS_ORDER_VIOLATION",
  );
});

test("区間と半径次数の公開境界を厳密に拒否する", () => {
  for (const [lower, upper] of [["1", "1"], ["2", "-1"]]) {
    assert.throws(
      () => volume("1", "0", lower, upper),
      (error) => error instanceof ExactPolynomialVolumeError
        && error.code === "INVALID_VOLUME_INTERVAL_ORDER",
    );
  }
  assert.throws(
    () => evaluateExactPolynomialVolume([q("1")], [q("0")]),
    (error) => error instanceof ExactPolynomialVolumeError
      && error.code === "MISSING_VOLUME_BOUNDS",
  );
  assert.throws(
    () => evaluateExactPolynomialVolume(
      [q("0"), q("0"), q("0"), q("1")],
      [q("0")],
      { lower: q("0"), upper: q("1") },
    ),
    (error) => error instanceof ExactPolynomialVolumeError
      && error.code === "RADIUS_DEGREE_TOO_HIGH"
      && error.unsupported,
  );
  assert.equal(MAX_VOLUME_RADIUS_DEGREE, 2);
  assert.equal(MAX_VOLUME_CROSS_SECTION_DEGREE, 4);
});

test("公開APIは密な正規配列と基底ExactRationalの凍結snapshotだけを保持する", () => {
  class DerivedRational extends ExactRational {}
  const mutableOuter = [new DerivedRational(1n), new DerivedRational(1n)];
  const mutableInner = [new DerivedRational(1n)];
  const mutableLower = new DerivedRational(0n);
  const mutableUpper = new DerivedRational(1n);
  const result = evaluateExactPolynomialVolume(mutableOuter, mutableInner, {
    lower: mutableLower,
    upper: mutableUpper,
  });
  mutableOuter[0] = q("99");
  mutableInner[0] = q("99");
  assert.equal(result.exact, "4*pi/3");
  assert.deepEqual(result.outerRadiusPolynomial.map(String), ["1", "1"]);
  assert.deepEqual(result.innerRadiusPolynomial.map(String), ["1"]);
  assert.equal(Object.getPrototypeOf(result.outerRadiusPolynomial[0]), ExactRational.prototype);
  assert.equal(Object.getPrototypeOf(result.lower), ExactRational.prototype);

  for (const frozen of [
    result,
    result.outerRadiusPolynomial,
    result.innerRadiusPolynomial,
    result.radiusDifference,
    result.outerSquared,
    result.innerSquared,
    result.crossSectionPolynomial,
    result.antiderivative,
    result.outerCertificate,
    result.innerCertificate,
    result.orderCertificate,
    result.outerCertificate.candidates,
    result.outerCertificate.witness,
    result.value,
  ]) {
    assert.equal(Object.isFrozen(frozen), true);
  }

  const sparse = [q("1"), , q("1")];
  assert.throws(
    () => evaluateExactPolynomialVolume(sparse, [q("0")], {
      lower: q("0"),
      upper: q("1"),
    }),
    /疎配列/u,
  );
  assert.throws(
    () => evaluateExactPolynomialVolume([q("1"), q("0")], [q("0")], {
      lower: q("0"),
      upper: q("1"),
    }),
    (error) => error instanceof ExactPolynomialVolumeError
      && error.code === "NONCANONICAL_VOLUME_POLYNOMIAL",
  );
  assert.throws(
    () => evaluateExactPolynomialVolume([1], [q("0")], {
      lower: q("0"),
      upper: q("1"),
    }),
    TypeError,
  );
});

test("分数係数・分数区間とpi係数の正規形を保つ", () => {
  assertVolume("x/2+1/3", "0", "0", "3/2", "79*pi/96");
  assertVolume("1", "0", "0", "1", "pi");
  assertVolume("2", "0", "0", "1/12", "pi/3");
  assertVolume("2", "0", "0", "1/6", "2*pi/3");
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
  return pair(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function pairText(value) {
  return value.denominator === 1n
    ? String(value.numerator)
    : `${value.numerator}/${value.denominator}`;
}

function trimPairs(coefficients) {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last].numerator === 0n) last -= 1;
  return coefficients.slice(0, last + 1);
}

function pairPolynomialAdd(left, right, sign = 1n) {
  return trimPairs(Array.from(
    { length: Math.max(left.length, right.length) },
    (_, index) => pairAdd(left[index] ?? pair(0n), right[index] ?? pair(0n), sign),
  ));
}

function pairPolynomialMultiply(left, right) {
  const output = Array.from(
    { length: left.length + right.length - 1 },
    () => pair(0n),
  );
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      output[leftIndex + rightIndex] = pairAdd(
        output[leftIndex + rightIndex],
        pairMultiply(left[leftIndex], right[rightIndex]),
      );
    }
  }
  return trimPairs(output);
}

function pairPolynomialEvaluate(coefficients, x) {
  let value = pair(0n);
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    value = pairAdd(pairMultiply(value, x), coefficients[index]);
  }
  return value;
}

function pairPolynomialIntegral(coefficients) {
  return [
    pair(0n),
    ...coefficients.map((coefficient, index) => (
      pairDivide(coefficient, pair(BigInt(index + 1)))
    )),
  ];
}

function squaredLinear(slope, intercept, offset) {
  return trimPairs([
    pairAdd(pairMultiply(intercept, intercept), offset),
    pairMultiply(pair(2n), pairMultiply(slope, intercept)),
    pairMultiply(slope, slope),
  ]);
}

function exactRational(value) {
  return new ExactRational(value.numerator, value.denominator);
}

function formatPiCoefficient(value) {
  if (value.numerator === 0n) return "0";
  const numerator = absolute(value.numerator);
  const sign = value.numerator < 0n ? "-" : "";
  if (value.denominator === 1n) {
    return `${sign}${numerator === 1n ? "pi" : `${numerator}*pi`}`;
  }
  return `${sign}${numerator === 1n ? "pi" : `${numerator}*pi`}/${value.denominator}`;
}

test("独立BigInt分数oracleの300例と公開core結果を一致させる", () => {
  for (let index = 0; index < 300; index += 1) {
    const inner = squaredLinear(
      pair(BigInt(index % 5 - 2), BigInt(index % 3 + 1)),
      pair(BigInt(Math.floor(index / 5) % 7 - 3), BigInt(index % 2 + 1)),
      pair(BigInt(index % 4), BigInt(index % 3 + 1)),
    );
    const gap = squaredLinear(
      pair(BigInt(index % 7 - 3), BigInt(index % 4 + 1)),
      pair(BigInt(Math.floor(index / 7) % 5 - 2), BigInt(index % 3 + 1)),
      pair(BigInt(index % 5), BigInt(index % 4 + 1)),
    );
    const outer = pairPolynomialAdd(inner, gap);
    const lower = pair(BigInt(index % 11 - 7), BigInt(index % 4 + 1));
    const width = pair(
      BigInt(index % 5 + 1),
      BigInt(Math.floor(index / 11) % 4 + 1),
    );
    const upper = pairAdd(lower, width);
    const crossSection = pairPolynomialAdd(
      pairPolynomialMultiply(outer, outer),
      pairPolynomialMultiply(inner, inner),
      -1n,
    );
    const antiderivative = pairPolynomialIntegral(crossSection);
    const expectedCoefficient = pairAdd(
      pairPolynomialEvaluate(antiderivative, upper),
      pairPolynomialEvaluate(antiderivative, lower),
      -1n,
    );
    const result = evaluateExactPolynomialVolume(
      outer.map(exactRational),
      inner.map(exactRational),
      { lower: exactRational(lower), upper: exactRational(upper) },
    );
    assert.equal(
      result.volumeCoefficient.toString(),
      pairText(expectedCoefficient),
      `generated case ${index}`,
    );
    assert.equal(
      result.exact,
      formatPiCoefficient(expectedCoefficient),
      `generated pi case ${index}`,
    );
  }
});

test("区間加法性と半径スケール二乗則を厳密分数のまま満たす", () => {
  const whole = volume("x^2+2", "x^2+1", "0", "2");
  const left = volume("x^2+2", "x^2+1", "0", "1");
  const right = volume("x^2+2", "x^2+1", "1", "2");
  assert.equal(
    whole.volumeCoefficient.toString(),
    left.volumeCoefficient.add(right.volumeCoefficient).toString(),
  );

  const original = volume("x+2", "x+1", "0", "1");
  const scaled = volume("3x+6", "3x+3", "0", "1");
  assert.equal(
    scaled.volumeCoefficient.toString(),
    original.volumeCoefficient.multiply(q("9")).toString(),
  );
});
