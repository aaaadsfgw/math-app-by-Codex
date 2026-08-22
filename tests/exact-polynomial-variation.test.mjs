import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactPolynomialVariationError,
  MAX_VARIATION_POLYNOMIAL_DEGREE,
  evaluateExactPolynomialVariation,
} from "../js/math-core/exact-polynomial-variation.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

function q(value) {
  const [numerator, denominator = "1"] = String(value).split("/");
  return new ExactRational(BigInt(numerator), BigInt(denominator));
}

function variation(coefficients) {
  return evaluateExactPolynomialVariation(coefficients.map(q));
}

test("定数関数は全実数でconstantとし孤立した極値を作らない", () => {
  for (const constant of ["0", "3", "-7/5"]) {
    const result = variation([constant]);
    assert.equal(result.degree, 0);
    assert.deepEqual(result.derivativePolynomial.map(String), ["0"]);
    assert.equal(result.stationarySet, "all-real");
    assert.equal(result.rootAnalysis.kind, "identically-zero");
    assert.equal(result.rootAnalysis.rootKind, "all-real");
    assert.deepEqual(result.criticalPoints, []);
    assert.deepEqual(result.extrema, []);
    assert.deepEqual(result.stationaryNonExtrema, []);
    assert.equal(result.overallBehavior, "constant");
    assert.equal(result.intervals.length, 1);
    assert.deepEqual(
      result.intervals.map(({ lower, upper, derivativeSign, behavior }) => ({
        lower,
        upper,
        derivativeSign,
        behavior,
      })),
      [{ lower: null, upper: null, derivativeSign: 0, behavior: "constant" }],
    );
    assert.equal(result.maximalIntervals.length, 1);
    assert.equal(result.maximalIntervals[0].lower, null);
    assert.equal(result.maximalIntervals[0].upper, null);
    assert.equal(result.maximalIntervals[0].lowerClosed, false);
    assert.equal(result.maximalIntervals[0].upperClosed, false);
    assert.equal(result.valueReduction, null);
    assert.equal(result.verification.verified, true);
  }
});

test("一次関数は導関数の符号どおり全実数で単調になり極値を持たない", () => {
  const increasing = variation(["1/3", "2/5"]);
  assert.equal(increasing.overallBehavior, "increasing");
  assert.deepEqual(increasing.intervals.map(({ derivativeSign }) => derivativeSign), [1]);
  assert.equal(increasing.maximalIntervals[0].behavior, "increasing");
  assert.deepEqual(increasing.criticalPoints, []);

  const decreasing = variation(["4", "-7/3"]);
  assert.equal(decreasing.overallBehavior, "decreasing");
  assert.deepEqual(decreasing.intervals.map(({ derivativeSign }) => derivativeSign), [-1]);
  assert.equal(decreasing.maximalIntervals[0].behavior, "decreasing");
  assert.deepEqual(decreasing.extrema, []);
});

test("二次関数の有理臨界点・有限端包含・大域的極値を厳密に返す", () => {
  const minimum = variation(["0", "0", "1"]);
  assert.deepEqual(minimum.derivativePolynomial.map(String), ["0", "2"]);
  assert.deepEqual(minimum.rootAnalysis.rootExacts, ["0"]);
  assert.deepEqual(minimum.intervals.map(({ derivativeSign }) => derivativeSign), [-1, 1]);
  assert.equal(minimum.maximalIntervals[0].upperClosed, true);
  assert.equal(minimum.maximalIntervals[1].lowerClosed, true);
  assert.equal(minimum.localMinima.length, 1);
  assert.equal(minimum.localMaxima.length, 0);
  assert.equal(minimum.localMinima[0].pointExact, "0");
  assert.equal(minimum.localMinima[0].point.exact, "0");
  assert.equal(minimum.localMinima[0].valueExact, "0");
  assert.equal(minimum.localMinima[0].value.exact, "0");
  assert.equal(minimum.localMinima[0].global, true);
  assert.equal(minimum.localMinima[0].derivativeValueExact, "0");
  assert.equal(minimum.localMinima[0].valueViaRemainder.exact, "0");
  assert.equal(minimum.valueReduction.verified, true);
  assert.deepEqual(minimum.valueReduction.remainder.map(String), ["0"]);

  const maximum = variation(["1", "4", "-2"]);
  assert.equal(maximum.localMaxima.length, 1);
  assert.equal(maximum.localMaxima[0].pointExact, "1");
  assert.equal(maximum.localMaxima[0].valueExact, "3");
  assert.equal(maximum.localMaxima[0].global, true);
  assert.equal(maximum.localMinima.length, 0);
});

test("三次関数の二次無理臨界点とQ+Q√d極値を別経路で検証する", () => {
  const result = variation(["0", "-1", "0", "1"]);
  assert.deepEqual(result.derivativePolynomial.map(String), ["-1", "0", "3"]);
  assert.equal(result.rootAnalysis.kind, "quadratic");
  assert.equal(result.rootAnalysis.rootKind, "two-real");
  assert.deepEqual(result.rootAnalysis.rootExacts, ["-√3/3", "√3/3"]);
  assert.equal(result.rootAnalysis.orderingVerified, true);
  assert.deepEqual(
    result.rootAnalysis.orderingComparisons.map(({ comparison }) => comparison),
    [-1],
  );
  assert.deepEqual(result.intervals.map(({ derivativeSign }) => derivativeSign), [1, -1, 1]);
  assert.deepEqual(result.intervals.map(({ predictedSign }) => predictedSign), [1, -1, 1]);
  assert.deepEqual(
    result.maximalIntervals.map(({ behavior }) => behavior),
    ["increasing", "decreasing", "increasing"],
  );
  assert.deepEqual(
    result.maximalIntervals.map(({ lowerClosed, upperClosed }) => ({
      lowerClosed,
      upperClosed,
    })),
    [
      { lowerClosed: false, upperClosed: true },
      { lowerClosed: true, upperClosed: true },
      { lowerClosed: true, upperClosed: false },
    ],
  );
  assert.equal(result.localMaxima.length, 1);
  assert.equal(result.localMinima.length, 1);
  assert.equal(result.localMaxima[0].pointExact, "-√3/3");
  assert.equal(result.localMaxima[0].valueExact, "2√3/9");
  assert.equal(result.localMaxima[0].value.kind, "quadratic");
  assert.equal(result.localMaxima[0].value.radicand, 3n);
  assert.equal(result.localMinima[0].pointExact, "√3/3");
  assert.equal(result.localMinima[0].valueExact, "-2√3/9");
  assert.equal(result.localMaxima[0].global, false);
  assert.deepEqual(result.valueReduction.remainder.map(String), ["0", "-2/3"]);
  for (const point of result.criticalPoints) {
    assert.equal(point.derivativeZeroVerified, true);
    assert.equal(point.valueVerified, true);
    assert.equal(point.valueDifference.exact, "0");
    assert.equal(point.value.exact, point.valueExact);
    assert.equal(point.point.exact, point.pointExact);
  }
});

test("x^3の偶数重根を越えて最大増加区間を全実数へ結合する", () => {
  const result = variation(["0", "0", "0", "1"]);
  assert.equal(result.rootAnalysis.rootKind, "double");
  assert.deepEqual(result.rootAnalysis.rootExacts, ["0"]);
  assert.deepEqual(result.intervals.map(({ derivativeSign }) => derivativeSign), [1, 1]);
  assert.equal(result.intervals.every(({ lowerClosed, upperClosed }) => (
    !lowerClosed && !upperClosed
  )), true);
  assert.equal(result.maximalIntervals.length, 1);
  assert.equal(result.maximalIntervals[0].lower, null);
  assert.equal(result.maximalIntervals[0].upper, null);
  assert.deepEqual(result.maximalIntervals[0].partitionIndexes, [0, 1]);
  assert.equal(result.maximalIntervals[0].behavior, "increasing");
  assert.equal(result.overallBehavior, "increasing");
  assert.equal(result.stationaryNonExtrema.length, 1);
  assert.equal(result.stationaryNonExtrema[0].pointExact, "0");
  assert.equal(result.stationaryNonExtrema[0].multiplicity, 2);
  assert.equal(result.stationaryNonExtrema[0].classification, "stationary-non-extremum");
  assert.deepEqual(result.extrema, []);

  const decreasing = variation(["0", "0", "0", "-2"]);
  assert.equal(decreasing.overallBehavior, "decreasing");
  assert.equal(decreasing.maximalIntervals.length, 1);
  assert.equal(decreasing.stationaryNonExtrema.length, 1);
});

test("実臨界点のない三次関数を最高次係数の符号で全域単調にする", () => {
  const increasing = variation(["4", "1", "0", "1"]);
  assert.equal(increasing.rootAnalysis.rootKind, "no-real");
  assert.deepEqual(increasing.rootAnalysis.roots, []);
  assert.equal(increasing.stationarySet, "empty");
  assert.equal(increasing.overallBehavior, "increasing");
  assert.deepEqual(increasing.intervals.map(({ derivativeSign }) => derivativeSign), [1]);
  assert.deepEqual(increasing.extrema, []);
  assert.equal(increasing.valueReduction, null);

  const decreasing = variation(["-3", "-1", "0", "-1"]);
  assert.equal(decreasing.overallBehavior, "decreasing");
  assert.deepEqual(decreasing.intervals.map(({ derivativeSign }) => derivativeSign), [-1]);
});

test("公開境界は4次・疎配列・末尾0・非ExactRationalをfail closedにする", () => {
  assert.equal(MAX_VARIATION_POLYNOMIAL_DEGREE, 3);
  assert.doesNotThrow(() => variation(["0", "0", "0", "1"]));
  assert.throws(
    () => variation(["0", "0", "0", "0", "1"]),
    (error) => error instanceof ExactPolynomialVariationError
      && error.code === "VARIATION_POLYNOMIAL_DEGREE_TOO_HIGH"
      && error.unsupported === true,
  );
  assert.throws(
    () => evaluateExactPolynomialVariation([q("1"), , q("1")]),
    /疎配列/u,
  );
  assert.throws(
    () => evaluateExactPolynomialVariation([q("1"), q("0")]),
    (error) => error instanceof ExactPolynomialVariationError
      && error.code === "NONCANONICAL_VARIATION_POLYNOMIAL",
  );
  assert.throws(() => evaluateExactPolynomialVariation([]), TypeError);
  assert.throws(() => evaluateExactPolynomialVariation("x^2"), TypeError);
  assert.throws(() => evaluateExactPolynomialVariation([q("1"), 2]), TypeError);

  const inherited = [q("1")];
  inherited.length = 2;
  Object.setPrototypeOf(inherited, { 1: q("2") });
  assert.throws(() => evaluateExactPolynomialVariation(inherited), /疎配列/u);
});

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) {
    assertDeepFrozen(value[key], seen);
  }
}

test("派生型を基底snapshotへ落とし全返却証拠を深く凍結する", () => {
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

  const mutable = [
    new HostileDerivedRational(0n),
    new HostileDerivedRational(-1n),
    new HostileDerivedRational(0n),
    new HostileDerivedRational(1n),
  ];
  const result = evaluateExactPolynomialVariation(mutable);
  mutable[0] = q("999");
  mutable.length = 1;

  assert.deepEqual(result.polynomial.map(String), ["0", "-1", "0", "1"]);
  assert.equal(Object.getPrototypeOf(result.polynomial[1]), ExactRational.prototype);
  assert.equal(Object.getPrototypeOf(result.intervals[0].sample), ExactRational.prototype);
  assertDeepFrozen(result);
  assert.throws(() => result.intervals.push({}), TypeError);
  assert.throws(() => result.maximalIntervals[0].partitionIndexes.push(9), TypeError);

  const hostileCoefficient = new Proxy(q("1"), {
    get(target, property, receiver) {
      if (property === "numerator") throw new Error("numerator参照を拒否");
      return Reflect.get(target, property, receiver);
    },
  });
  assert.throws(
    () => evaluateExactPolynomialVariation([hostileCoefficient]),
    /numerator参照を拒否/u,
  );
});

test("巨大分数の対応可能境界と導関数根profile超過を区別する", () => {
  const hugeConstant = new ExactRational(BigInt("9".repeat(512)));
  const retained = evaluateExactPolynomialVariation([hugeConstant, q("1")]);
  assert.equal(retained.polynomial[0].toString(), hugeConstant.toString());
  assert.equal(retained.verification.verified, true);

  const rootProfileOverflow = new ExactRational(10n ** 101n);
  assert.throws(
    () => evaluateExactPolynomialVariation([
      q("0"),
      q("1"),
      q("0"),
      rootProfileOverflow,
    ]),
    (error) => error?.code === "COEFFICIENT_TOO_LARGE"
      && error?.unsupported === true,
  );

  const derivativeOverflow = new ExactRational(BigInt("9".repeat(512)));
  assert.throws(
    () => evaluateExactPolynomialVariation([
      q("0"),
      q("0"),
      q("0"),
      derivativeOverflow,
    ]),
    (error) => error instanceof RangeError && /大きすぎ/u.test(error.message),
  );
});

function pairAbsolute(value) {
  return value < 0n ? -value : value;
}

function pairGcd(left, right) {
  let a = pairAbsolute(left);
  let b = pairAbsolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function pair(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError("oracle denominator is zero");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = pairGcd(numerator, denominator);
  return Object.freeze({
    numerator: sign * numerator / divisor,
    denominator: pairAbsolute(denominator) / divisor,
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

function pairNegate(value) {
  return pair(-value.numerator, value.denominator);
}

function pairSign(value) {
  return value.numerator < 0n ? -1 : value.numerator > 0n ? 1 : 0;
}

function pairEqual(left, right) {
  return left.numerator === right.numerator
    && left.denominator === right.denominator;
}

function pairText(value) {
  return value.denominator === 1n
    ? String(value.numerator)
    : `${value.numerator}/${value.denominator}`;
}

function pairLcm(left, right) {
  return pairAbsolute(left / pairGcd(left, right) * right);
}

function quadratic(rationalPart, radicalPart = pair(0n), radicand = 0n) {
  if (radicalPart.numerator === 0n || radicand === 0n) {
    return Object.freeze({
      rationalPart,
      radicalPart: pair(0n),
      radicand: 0n,
    });
  }
  return Object.freeze({ rationalPart, radicalPart, radicand });
}

function quadraticAdd(left, right, sign = 1n) {
  const leftRadical = left.radicalPart.numerator !== 0n;
  const rightRadical = right.radicalPart.numerator !== 0n;
  assert.ok(!leftRadical || !rightRadical || left.radicand === right.radicand);
  return quadratic(
    pairAdd(left.rationalPart, right.rationalPart, sign),
    pairAdd(left.radicalPart, right.radicalPart, sign),
    leftRadical ? left.radicand : right.radicand,
  );
}

function quadraticMultiply(left, right) {
  const leftRadical = left.radicalPart.numerator !== 0n;
  const rightRadical = right.radicalPart.numerator !== 0n;
  assert.ok(!leftRadical || !rightRadical || left.radicand === right.radicand);
  const radicand = leftRadical ? left.radicand : right.radicand;
  return quadratic(
    pairAdd(
      pairMultiply(left.rationalPart, right.rationalPart),
      pairMultiply(
        pairMultiply(left.radicalPart, right.radicalPart),
        pair(radicand),
      ),
    ),
    pairAdd(
      pairMultiply(left.rationalPart, right.radicalPart),
      pairMultiply(left.radicalPart, right.rationalPart),
    ),
    radicand,
  );
}

function quadraticEvaluate(coefficients, point) {
  let value = quadratic(pair(0n));
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    value = quadraticAdd(
      quadraticMultiply(value, point),
      quadratic(coefficients[index]),
    );
  }
  return value;
}

function formatQuadraticOracle(value) {
  if (value.radicalPart.numerator === 0n) return pairText(value.rationalPart);
  const denominator = pairLcm(
    value.rationalPart.denominator,
    value.radicalPart.denominator,
  );
  let rationalNumerator = value.rationalPart.numerator
    * (denominator / value.rationalPart.denominator);
  let radicalNumerator = value.radicalPart.numerator
    * (denominator / value.radicalPart.denominator);
  let normalizedDenominator = denominator;
  const divisor = pairGcd(
    pairGcd(rationalNumerator, radicalNumerator),
    normalizedDenominator,
  );
  rationalNumerator /= divisor;
  radicalNumerator /= divisor;
  normalizedDenominator /= divisor;
  const radicalMagnitude = pairAbsolute(radicalNumerator);
  const radical = `${radicalMagnitude === 1n ? "" : radicalMagnitude}√${value.radicand}`;
  const numerator = rationalNumerator === 0n
    ? `${radicalNumerator < 0n ? "-" : ""}${radical}`
    : `${rationalNumerator}${radicalNumerator < 0n ? "-" : "+"}${radical}`;
  if (normalizedDenominator === 1n) return numerator;
  return rationalNumerator === 0n
    ? `${numerator}/${normalizedDenominator}`
    : `(${numerator})/${normalizedDenominator}`;
}

function exactFromPair(value) {
  return new ExactRational(value.numerator, value.denominator);
}

function assertExactPair(actual, expected) {
  assert.equal(actual.numerator, expected.numerator);
  assert.equal(actual.denominator, expected.denominator);
}

function assertQuadraticValue(actual, expected) {
  assertExactPair(actual.rationalPart, expected.rationalPart);
  assertExactPair(actual.radicalPart, expected.radicalPart);
  assert.equal(actual.radicand, expected.radicand);
  assert.equal(actual.exact, formatQuadraticOracle(expected));
}

function assertPoint(actual, expected) {
  if (expected.radicalPart.numerator === 0n) {
    assert.equal(actual.kind, "rational");
    assertExactPair(actual.value, expected.rationalPart);
  } else {
    assert.equal(actual.kind, "quadratic-root");
    assert.equal(actual.radicand, expected.radicand);
    assertExactPair(
      exactFromPair(pair(actual.numeratorConstant, actual.denominator)),
      expected.rationalPart,
    );
    assertExactPair(
      exactFromPair(pair(actual.radicalCoefficient, actual.denominator)),
      expected.radicalPart,
    );
  }
  assert.equal(actual.exact, formatQuadraticOracle(expected));
}

function generatedNonzero(seed) {
  let numerator = BigInt((seed * 11 + 7) % 19 - 9);
  if (numerator === 0n) numerator = seed % 2 === 0 ? 5n : -7n;
  return pair(numerator, BigInt((seed * 3) % 5 + 1));
}

function generatedRational(seed) {
  return pair(
    BigInt((seed * 7 + 3) % 17 - 8),
    BigInt((seed * 5) % 4 + 1),
  );
}

function integrateDerivative(constant, derivative) {
  return [
    constant,
    ...derivative.map((coefficient, index) => (
      pairDivide(coefficient, pair(BigInt(index + 1)))
    )),
  ];
}

function generatedOracleCase(index) {
  const degree = index % 4;
  const constant = generatedRational(index + 31);
  if (degree === 0) {
    return {
      degree,
      coefficients: [constant],
      derivative: [pair(0n)],
      roots: [],
      multiplicities: [],
      signs: [0],
      rootKind: "all-real",
    };
  }
  const leading = generatedNonzero(index + 13);
  if (degree === 1) {
    return {
      degree,
      coefficients: [constant, leading],
      derivative: [leading],
      roots: [],
      multiplicities: [],
      signs: [pairSign(leading)],
      rootKind: "no-real",
    };
  }
  const center = generatedRational(index + 19);
  if (degree === 2) {
    const derivative = [pairNegate(pairMultiply(leading, center)), leading];
    return {
      degree,
      coefficients: integrateDerivative(constant, derivative),
      derivative,
      roots: [quadratic(center)],
      multiplicities: [1],
      signs: [-pairSign(leading), pairSign(leading)],
      rootKind: "one-real",
    };
  }

  const variant = Math.floor(index / 4) % 4;
  let derivative;
  let roots;
  let multiplicities;
  let signs;
  let rootKind;
  if (variant === 0 || variant === 1 || variant === 3) {
    const radicand = variant === 0
      ? 2n
      : variant === 1
        ? 0n
        : [2n, 3n, 5n, 6n, 7n][Math.floor(index / 16) % 5];
    const constantTerm = pairMultiply(
      leading,
      pairAdd(pairMultiply(center, center), pair(radicand), variant === 3 ? -1n : 1n),
    );
    derivative = [
      constantTerm,
      pairMultiply(pair(-2n), pairMultiply(leading, center)),
      leading,
    ];
    if (variant === 0) {
      roots = [];
      multiplicities = [];
      signs = [pairSign(leading)];
      rootKind = "no-real";
    } else if (variant === 1) {
      roots = [quadratic(center)];
      multiplicities = [2];
      signs = [pairSign(leading), pairSign(leading)];
      rootKind = "double";
    } else {
      roots = [
        quadratic(center, pair(-1n), radicand),
        quadratic(center, pair(1n), radicand),
      ];
      multiplicities = [1, 1];
      signs = [pairSign(leading), -pairSign(leading), pairSign(leading)];
      rootKind = "two-real";
    }
  } else {
    const distance = pair(
      BigInt((index % 3) + 1),
      BigInt((index % 2) + 1),
    );
    const lower = pairAdd(center, distance, -1n);
    const upper = pairAdd(center, distance);
    derivative = [
      pairMultiply(leading, pairMultiply(lower, upper)),
      pairNegate(pairMultiply(leading, pairAdd(lower, upper))),
      leading,
    ];
    roots = [quadratic(lower), quadratic(upper)];
    multiplicities = [1, 1];
    signs = [pairSign(leading), -pairSign(leading), pairSign(leading)];
    rootKind = "two-real";
  }
  return {
    degree,
    coefficients: integrateDerivative(constant, derivative),
    derivative,
    roots,
    multiplicities,
    signs,
    rootKind,
  };
}

function expectedClassification(leftSign, rightSign) {
  if (leftSign > 0 && rightSign < 0) return "local-maximum";
  if (leftSign < 0 && rightSign > 0) return "local-minimum";
  return "stationary-non-extremum";
}

test("独立BigInt分数/Qsqrt oracleの500例で根・符号・極値値を照合する", () => {
  const coveredDegrees = new Set();
  const coveredRootKinds = new Set();
  let irrationalCriticalPoints = 0;
  let stationaryNonExtrema = 0;
  let maxima = 0;
  let minima = 0;

  for (let index = 0; index < 500; index += 1) {
    const expected = generatedOracleCase(index);
    const result = evaluateExactPolynomialVariation(
      expected.coefficients.map(exactFromPair),
    );
    coveredDegrees.add(expected.degree);
    coveredRootKinds.add(expected.rootKind);
    assert.equal(result.degree, expected.degree);
    assert.equal(result.verification.verified, true);
    assert.deepEqual(
      result.derivativePolynomial.map(String),
      expected.derivative.map(pairText),
    );
    assert.deepEqual(
      result.intervals.map(({ derivativeSign }) => derivativeSign),
      expected.signs,
    );
    assert.deepEqual(
      result.intervals.map(({ predictedSign }) => predictedSign),
      expected.signs,
    );
    assert.equal(result.criticalPoints.length, expected.roots.length);
    assert.equal(result.rootAnalysis.rootKind, expected.rootKind);
    for (let rootIndex = 0; rootIndex < expected.roots.length; rootIndex += 1) {
      const expectedRoot = expected.roots[rootIndex];
      const actual = result.criticalPoints[rootIndex];
      assertPoint(actual.point, expectedRoot);
      assert.equal(actual.pointExact, formatQuadraticOracle(expectedRoot));
      assert.equal(actual.multiplicity, expected.multiplicities[rootIndex]);
      assert.equal(actual.leftSign, expected.signs[rootIndex]);
      assert.equal(actual.rightSign, expected.signs[rootIndex + 1]);
      assert.equal(
        actual.classification,
        expectedClassification(actual.leftSign, actual.rightSign),
      );
      const expectedValue = quadraticEvaluate(expected.coefficients, expectedRoot);
      assertQuadraticValue(actual.value, expectedValue);
      assertQuadraticValue(actual.valueViaRemainder, expectedValue);
      assert.equal(actual.derivativeValueExact, "0");
      assert.equal(actual.valueDifference.exact, "0");
      if (expectedRoot.radicalPart.numerator !== 0n) irrationalCriticalPoints += 1;
      if (actual.classification === "stationary-non-extremum") stationaryNonExtrema += 1;
      if (actual.classification === "local-maximum") maxima += 1;
      if (actual.classification === "local-minimum") minima += 1;
    }
    const allSameSign = new Set(expected.signs).size === 1;
    assert.equal(
      result.maximalIntervals.length,
      allSameSign ? 1 : expected.signs.length,
    );
    if (allSameSign) {
      assert.equal(result.maximalIntervals[0].lower, null);
      assert.equal(result.maximalIntervals[0].upper, null);
    }
  }

  assert.deepEqual(coveredDegrees, new Set([0, 1, 2, 3]));
  assert.deepEqual(
    coveredRootKinds,
    new Set(["all-real", "no-real", "one-real", "double", "two-real"]),
  );
  assert.ok(irrationalCriticalPoints > 40);
  assert.ok(stationaryNonExtrema > 20);
  assert.ok(maxima > 70);
  assert.ok(minima > 70);
});
