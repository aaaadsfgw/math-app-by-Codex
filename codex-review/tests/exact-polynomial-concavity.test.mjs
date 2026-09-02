import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactPolynomialConcavityError,
  MAX_CONCAVITY_POLYNOMIAL_DEGREE,
  evaluateExactPolynomialConcavity,
} from "../js/math-core/exact-polynomial-concavity.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

function q(value) {
  const [numerator, denominator = "1"] = String(value).split("/");
  return new ExactRational(BigInt(numerator), BigInt(denominator));
}

function concavity(coefficients) {
  return evaluateExactPolynomialConcavity(coefficients.map(q));
}

function curvatureSummary(result) {
  return result.intervals.map(({ curvature, secondDerivativeSign }) => (
    [curvature, secondDerivativeSign]
  ));
}

test("定数・一次関数は全実数をzero-curvatureとして変曲点を作らない", () => {
  for (const [coefficients, firstDerivative] of [
    [["5"], ["0"]],
    [["-2", "3/7"], ["3/7"]],
  ]) {
    const result = concavity(coefficients);
    assert.deepEqual(result.firstDerivativePolynomial.map(String), firstDerivative);
    assert.deepEqual(result.secondDerivativePolynomial.map(String), ["0"]);
    assert.equal(result.rootAnalysis.rootKind, "all-real");
    assert.equal(result.rootAnalysis.secondDerivativeDegree, null);
    assert.deepEqual(curvatureSummary(result), [["zero-curvature", 0]]);
    assert.equal(result.maximalIntervals.length, 1);
    assert.equal(result.maximalIntervals[0].lower, null);
    assert.equal(result.maximalIntervals[0].upper, null);
    assert.equal(result.overallCurvature, "zero-curvature");
    assert.equal(result.zeroCurvatureIntervals.length, 1);
    assert.deepEqual(result.inflectionCandidates, []);
    assert.deepEqual(result.inflectionPoints, []);
    assert.equal(result.verification.verified, true);
  }
});

test("二次関数は二階導関数の符号どおり全実数で下に凸・上に凸になる", () => {
  const lower = concavity(["1", "-3", "2/5"]);
  assert.deepEqual(lower.firstDerivativePolynomial.map(String), ["-3", "4/5"]);
  assert.deepEqual(lower.secondDerivativePolynomial.map(String), ["4/5"]);
  assert.deepEqual(curvatureSummary(lower), [["lower-convex", 1]]);
  assert.equal(lower.overallCurvature, "lower-convex");
  assert.equal(lower.lowerConvexIntervals.length, 1);
  assert.equal(lower.upperConvexIntervals.length, 0);

  const upper = concavity(["7", "1/2", "-3/11"]);
  assert.deepEqual(upper.secondDerivativePolynomial.map(String), ["-6/11"]);
  assert.deepEqual(curvatureSummary(upper), [["upper-convex", -1]]);
  assert.equal(upper.overallCurvature, "upper-convex");
  assert.equal(upper.lowerConvexIntervals.length, 0);
  assert.equal(upper.upperConvexIntervals.length, 1);
});

test("三次関数は二階導関数の単根だけを有理変曲点にする", () => {
  const origin = concavity(["0", "0", "0", "1"]);
  assert.deepEqual(origin.firstDerivativePolynomial.map(String), ["0", "0", "3"]);
  assert.deepEqual(origin.secondDerivativePolynomial.map(String), ["0", "6"]);
  assert.equal(origin.rootAnalysis.rootKind, "one-real");
  assert.deepEqual(curvatureSummary(origin), [
    ["upper-convex", -1],
    ["lower-convex", 1],
  ]);
  assert.equal(origin.inflectionCandidates.length, 1);
  assert.equal(origin.inflectionPoints.length, 1);
  assert.equal(origin.nonInflectionCandidates.length, 0);
  assert.deepEqual(
    {
      x: origin.inflectionPoints[0].xExact,
      y: origin.inflectionPoints[0].yExact,
      classification: origin.inflectionPoints[0].classification,
      point: origin.inflectionPoints[0].point.exact,
    },
    { x: "0", y: "0", classification: "inflection", point: "(0, 0)" },
  );

  const fractional = concavity(["0", "0", "1/2", "1/6"]);
  assert.deepEqual(fractional.secondDerivativePolynomial.map(String), ["1", "1"]);
  assert.equal(fractional.inflectionPoints[0].xExact, "-1");
  assert.equal(fractional.inflectionPoints[0].yExact, "1/3");
  assert.equal(fractional.inflectionPoints[0].valueVerified, true);
  assert.equal(fractional.inflectionPoints[0].yDifference.exact, "0");
});

test("四次関数の二次無理根とQ+Q√dの変曲点値を丸めず再検証する", () => {
  const result = concavity(["0", "1", "-2", "0", "1"]);
  assert.deepEqual(result.secondDerivativePolynomial.map(String), ["-4", "0", "12"]);
  assert.equal(result.rootAnalysis.rootKind, "two-real");
  assert.deepEqual(result.rootAnalysis.rootExacts, ["-√3/3", "√3/3"]);
  assert.deepEqual(curvatureSummary(result), [
    ["lower-convex", 1],
    ["upper-convex", -1],
    ["lower-convex", 1],
  ]);
  assert.deepEqual(
    result.inflectionPoints.map(({ xExact, yExact, multiplicity }) => (
      [xExact, yExact, multiplicity]
    )),
    [
      ["-√3/3", "(-5-3√3)/9", 1],
      ["√3/3", "(-5+3√3)/9", 1],
    ],
  );
  for (const point of result.inflectionPoints) {
    assert.equal(point.y.kind, "quadratic");
    assert.equal(point.secondDerivativeValueExact, "0");
    assert.equal(point.secondDerivativeZeroVerified, true);
    assert.equal(point.valueVerified, true);
    assert.equal(point.yDifference.exact, "0");
  }
  assert.equal(result.lowerConvexIntervals.length, 2);
  assert.equal(result.upperConvexIntervals.length, 1);
  assert.equal(result.overallCurvature, "mixed");
  assert.equal(result.valueReduction.verified, true);
});

test("二階導関数の二重根は変曲点にせず同符号区間を全実数へ結合する", () => {
  const result = concavity(["1", "2", "0", "0", "1"]);
  assert.deepEqual(result.secondDerivativePolynomial.map(String), ["0", "0", "12"]);
  assert.equal(result.rootAnalysis.rootKind, "double");
  assert.deepEqual(curvatureSummary(result), [
    ["lower-convex", 1],
    ["lower-convex", 1],
  ]);
  assert.equal(result.inflectionCandidates.length, 1);
  assert.equal(result.inflectionPoints.length, 0);
  assert.equal(result.nonInflectionCandidates.length, 1);
  assert.equal(result.nonInflectionCandidates[0].xExact, "0");
  assert.equal(result.nonInflectionCandidates[0].yExact, "1");
  assert.equal(result.nonInflectionCandidates[0].multiplicity, 2);
  assert.equal(result.nonInflectionCandidates[0].signChanges, false);
  assert.equal(result.nonInflectionCandidates[0].classification, "non-inflection");
  assert.equal(result.maximalIntervals.length, 1);
  assert.equal(result.maximalIntervals[0].lower, null);
  assert.equal(result.maximalIntervals[0].upper, null);
  assert.deepEqual(result.maximalIntervals[0].partitionIndexes, [0, 1]);
  assert.equal(result.overallCurvature, "lower-convex");
});

test("二階導関数に実根がない四次関数は全実数で同じ凹凸を保つ", () => {
  const lower = concavity(["0", "0", "1", "0", "1"]);
  assert.equal(lower.rootAnalysis.rootKind, "no-real");
  assert.deepEqual(curvatureSummary(lower), [["lower-convex", 1]]);
  assert.equal(lower.inflectionCandidates.length, 0);
  assert.equal(lower.maximalIntervals.length, 1);

  const upper = concavity(["0", "0", "-1", "0", "-1"]);
  assert.equal(upper.rootAnalysis.rootKind, "no-real");
  assert.deepEqual(curvatureSummary(upper), [["upper-convex", -1]]);
  assert.equal(upper.inflectionCandidates.length, 0);
  assert.equal(upper.maximalIntervals.length, 1);
});

test("公開境界は4次以下の密な正規配列だけを受理する", () => {
  assert.equal(MAX_CONCAVITY_POLYNOMIAL_DEGREE, 4);
  assert.doesNotThrow(() => concavity(["0", "0", "0", "0", "1"]));
  assert.throws(
    () => concavity(["0", "0", "0", "0", "0", "1"]),
    (error) => error instanceof ExactPolynomialConcavityError
      && error.code === "CONCAVITY_POLYNOMIAL_DEGREE_TOO_HIGH"
      && error.unsupported === true,
  );
  assert.throws(
    () => evaluateExactPolynomialConcavity([q("1"), , q("1")]),
    /疎配列/u,
  );
  assert.throws(
    () => evaluateExactPolynomialConcavity([q("1"), q("0")]),
    (error) => error instanceof ExactPolynomialConcavityError
      && error.code === "NONCANONICAL_CONCAVITY_POLYNOMIAL",
  );
  assert.throws(() => evaluateExactPolynomialConcavity([]), TypeError);
  assert.throws(() => evaluateExactPolynomialConcavity("x^4"), TypeError);
  assert.throws(() => evaluateExactPolynomialConcavity([q("1"), 2]), TypeError);

  const inherited = [q("1")];
  inherited.length = 2;
  Object.setPrototypeOf(inherited, { 1: q("2") });
  assert.throws(() => evaluateExactPolynomialConcavity(inherited), /疎配列/u);
});

function assertDeepFrozen(value, seen = new WeakSet()) {
  if (value === null || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  assert.equal(Object.isFrozen(value), true);
  for (const key of Reflect.ownKeys(value)) assertDeepFrozen(value[key], seen);
}

test("派生ExactRationalを基底snapshotへ落とし返却木をdeep freezeする", () => {
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
    new HostileDerivedRational(1n),
    new HostileDerivedRational(-2n),
    new HostileDerivedRational(0n),
    new HostileDerivedRational(1n),
  ];
  const result = evaluateExactPolynomialConcavity(mutable);
  mutable[0] = q("999");
  mutable.length = 1;

  assert.deepEqual(result.polynomial.map(String), ["0", "1", "-2", "0", "1"]);
  assert.equal(Object.getPrototypeOf(result.polynomial[1]), ExactRational.prototype);
  assert.equal(
    Object.getPrototypeOf(result.inflectionPoints[0].y.rationalPart),
    ExactRational.prototype,
  );
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
    () => evaluateExactPolynomialConcavity([hostileCoefficient]),
    /numerator参照を拒否/u,
  );
});

test("巨大BigIntの対応可能境界を保持し中間値超過はfail closedにする", () => {
  const hugeConstant = new ExactRational(BigInt("9".repeat(512)));
  const retained = evaluateExactPolynomialConcavity([hugeConstant, q("1")]);
  assert.equal(retained.polynomial[0].toString(), hugeConstant.toString());
  assert.equal(retained.overallCurvature, "zero-curvature");
  assert.equal(retained.verification.verified, true);

  const derivativeOverflow = new ExactRational(BigInt("9".repeat(512)));
  assert.throws(
    () => evaluateExactPolynomialConcavity([
      q("0"),
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

function derivativePairs(coefficients) {
  if (coefficients.length === 1) return [pair(0n)];
  return coefficients.slice(1).map((coefficient, index) => (
    pairMultiply(coefficient, pair(BigInt(index + 1)))
  ));
}

function integrateTwice(constant, linear, secondDerivative) {
  return [
    constant,
    linear,
    ...secondDerivative.map((coefficient, index) => pairDivide(
      coefficient,
      pair(BigInt((index + 1) * (index + 2))),
    )),
  ];
}

function generatedOracleCase(index) {
  const degree = index % 5;
  const constant = generatedRational(index + 31);
  if (degree === 0) {
    return {
      degree,
      coefficients: [constant],
      secondDerivative: [pair(0n)],
      roots: [],
      multiplicities: [],
      signs: [0],
      rootKind: "all-real",
    };
  }
  const linear = generatedNonzero(index + 17);
  if (degree === 1) {
    return {
      degree,
      coefficients: [constant, linear],
      secondDerivative: [pair(0n)],
      roots: [],
      multiplicities: [],
      signs: [0],
      rootKind: "all-real",
    };
  }
  const leading = generatedNonzero(index + 13);
  if (degree === 2) {
    return {
      degree,
      coefficients: integrateTwice(constant, linear, [leading]),
      secondDerivative: [leading],
      roots: [],
      multiplicities: [],
      signs: [pairSign(leading)],
      rootKind: "no-real",
    };
  }
  const center = generatedRational(index + 19);
  if (degree === 3) {
    const secondDerivative = [
      pairNegate(pairMultiply(leading, center)),
      leading,
    ];
    return {
      degree,
      coefficients: integrateTwice(constant, linear, secondDerivative),
      secondDerivative,
      roots: [quadratic(center)],
      multiplicities: [1],
      signs: [-pairSign(leading), pairSign(leading)],
      rootKind: "one-real",
    };
  }

  const variant = Math.floor(index / 5) % 4;
  let secondDerivative;
  let roots;
  let multiplicities;
  let signs;
  let rootKind;
  if (variant < 3) {
    const radicand = variant === 0
      ? 2n
      : variant === 1
        ? 0n
        : [2n, 3n, 5n, 7n][Math.floor(index / 20) % 4];
    secondDerivative = [
      pairMultiply(
        leading,
        pairAdd(
          pairMultiply(center, center),
          pair(radicand),
          variant === 2 ? -1n : 1n,
        ),
      ),
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
      BigInt(index % 3 + 1),
      BigInt(index % 2 + 1),
    );
    const lower = pairAdd(center, distance, -1n);
    const upper = pairAdd(center, distance);
    secondDerivative = [
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
    coefficients: integrateTwice(constant, linear, secondDerivative),
    secondDerivative,
    roots,
    multiplicities,
    signs,
    rootKind,
  };
}

function curvatureFromSign(sign) {
  if (sign > 0) return "lower-convex";
  if (sign < 0) return "upper-convex";
  return "zero-curvature";
}

test("独立BigInt分数/Qsqrt oracleの500例で二階微分・符号・変曲点値を照合する", () => {
  const coveredDegrees = new Set();
  const coveredRootKinds = new Set();
  let irrationalInflectionPoints = 0;
  let nonInflectionCandidates = 0;
  let inflectionPoints = 0;

  for (let index = 0; index < 500; index += 1) {
    const expected = generatedOracleCase(index);
    const result = evaluateExactPolynomialConcavity(
      expected.coefficients.map(exactFromPair),
    );
    coveredDegrees.add(expected.degree);
    coveredRootKinds.add(expected.rootKind);
    assert.equal(result.degree, expected.degree);
    assert.equal(result.verification.verified, true);
    assert.deepEqual(
      result.firstDerivativePolynomial.map(String),
      derivativePairs(expected.coefficients).map(pairText),
    );
    assert.deepEqual(
      result.secondDerivativePolynomial.map(String),
      expected.secondDerivative.map(pairText),
    );
    assert.equal(result.rootAnalysis.rootKind, expected.rootKind);
    assert.deepEqual(
      result.intervals.map(({ secondDerivativeSign }) => secondDerivativeSign),
      expected.signs,
    );
    assert.deepEqual(
      result.intervals.map(({ curvature }) => curvature),
      expected.signs.map(curvatureFromSign),
    );
    assert.equal(result.inflectionCandidates.length, expected.roots.length);
    for (let rootIndex = 0; rootIndex < expected.roots.length; rootIndex += 1) {
      const expectedRoot = expected.roots[rootIndex];
      const actual = result.inflectionCandidates[rootIndex];
      assertPoint(actual.x, expectedRoot);
      assert.equal(actual.multiplicity, expected.multiplicities[rootIndex]);
      assert.equal(actual.leftSign, expected.signs[rootIndex]);
      assert.equal(actual.rightSign, expected.signs[rootIndex + 1]);
      assert.equal(actual.signChanges, actual.leftSign !== actual.rightSign);
      assert.equal(
        actual.classification,
        actual.signChanges ? "inflection" : "non-inflection",
      );
      const expectedY = quadraticEvaluate(expected.coefficients, expectedRoot);
      assertQuadraticValue(actual.y, expectedY);
      assertQuadraticValue(actual.yViaRemainder, expectedY);
      assert.equal(actual.secondDerivativeValueExact, "0");
      assert.equal(actual.yDifference.exact, "0");
      assert.equal(actual.verified, true);
      if (actual.signChanges) {
        inflectionPoints += 1;
        if (expectedRoot.radicalPart.numerator !== 0n) irrationalInflectionPoints += 1;
      } else {
        nonInflectionCandidates += 1;
      }
    }
    assert.equal(
      result.inflectionPoints.length,
      expected.roots.filter((_, rootIndex) => (
        expected.signs[rootIndex] !== expected.signs[rootIndex + 1]
      )).length,
    );
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

  assert.deepEqual(coveredDegrees, new Set([0, 1, 2, 3, 4]));
  assert.deepEqual(
    coveredRootKinds,
    new Set(["all-real", "no-real", "one-real", "double", "two-real"]),
  );
  assert.ok(irrationalInflectionPoints > 30);
  assert.ok(nonInflectionCandidates > 20);
  assert.ok(inflectionPoints > 100);
});
