import assert from "node:assert/strict";
import test from "node:test";

import { ExactRational } from "../js/math-core/exact-rational.js";
import {
  ExactRationalFunctionError,
} from "../js/math-core/exact-rational-function.js";
import {
  ExactRationalLimitError,
  INFINITY_APPROACHES,
  LIMIT_DIRECTIONS,
  evaluateExactRationalFunctionLimit,
  evaluateExactRationalFunctionLimitAtInfinity,
  evaluateExactRationalLimit,
  evaluateExactRationalLimitAtInfinity,
  formatExactLimitSide,
} from "../js/math-core/exact-rational-limit.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";

function ast(expression) {
  return parseMathExpression(expression, { symbols: ["x"] }).ast;
}

function evaluate(expression, numerator, denominator = 1n, direction = "both") {
  return evaluateExactRationalLimit(
    ast(expression),
    new ExactRational(numerator, denominator),
    direction,
  );
}

function polynomialText(polynomial) {
  return polynomial.map(String);
}

function sideText(side) {
  return side.kind === "finite" ? side.value.toString() : formatExactLimitSide(side);
}

function assertSide(side, kind, exact = null) {
  assert.equal(side.kind, kind);
  assert.equal(sideText(side), exact ?? formatExactLimitSide(side));
  if (kind === "finite") assert.ok(side.value instanceof ExactRational);
  else assert.equal(side.value, null);
  assert.equal(Object.isFrozen(side), true);
}

test("有限値を直接代入し、分数・有限小数・巨大係数を厳密に保持する", () => {
  const direct = evaluate("(3*x+1)/(2*x+3)", 1n, 2n);
  assert.equal(direct.exact, "5/8");
  assert.equal(direct.outcomeKind, "finite");
  assert.equal(direct.numeratorMultiplicity, 0);
  assert.equal(direct.denominatorMultiplicity, 0);
  assert.equal(direct.canceledMultiplicity, 0);
  assert.equal(direct.leadingRatio.toString(), "5/8");
  assert.equal(direct.pointExcluded, false);
  assertSide(direct.left, "finite", "5/8");
  assertSide(direct.right, "finite", "5/8");

  const decimal = evaluate(
    "(1.25*x-0.125)/(0.5*x+2)",
    1n,
    2n,
  );
  assert.equal(decimal.exact, "2/9");
  assert.equal(decimal.leadingRatio.toString(), "2/9");

  const huge = 10n ** 100n + 1n;
  const hugeResult = evaluate(
    `(${huge}*(x-1)^4)/(2*(x-1)^4)`,
    1n,
  );
  assert.equal(hugeResult.exact, `${huge}/2`);
  assert.equal(hugeResult.numeratorMultiplicity, 4);
  assert.equal(hugeResult.denominatorMultiplicity, 4);
  assert.equal(hugeResult.canceledMultiplicity, 4);
  assert.equal(hugeResult.leadingRatio.toString(), `${huge}/2`);
  assert.equal(hugeResult.pointExcluded, true);
});

test("可除穴・入れ子除算・0乗でも元のdomain ledgerを失わない", () => {
  const cases = [
    {
      expression: "(x^2-1)/(x-1)",
      point: 1n,
      exact: "2",
      numeratorMultiplicity: 1,
      denominatorMultiplicity: 1,
      canceledMultiplicity: 1,
      pointExcluded: true,
    },
    {
      expression: "1/(1/(x-1))",
      point: 1n,
      exact: "0",
      numeratorMultiplicity: 1,
      denominatorMultiplicity: 0,
      canceledMultiplicity: 0,
      pointExcluded: true,
    },
    {
      expression: "1+0/(x-1)",
      point: 1n,
      exact: "1",
      numeratorMultiplicity: 1,
      denominatorMultiplicity: 1,
      canceledMultiplicity: 1,
      pointExcluded: true,
    },
    {
      expression: "(x-1)^0",
      point: 1n,
      exact: "1",
      numeratorMultiplicity: 0,
      denominatorMultiplicity: 0,
      canceledMultiplicity: 0,
      pointExcluded: true,
    },
    {
      expression: "(x-2)/(x-2)",
      point: 1n,
      exact: "1",
      numeratorMultiplicity: 0,
      denominatorMultiplicity: 0,
      canceledMultiplicity: 0,
      pointExcluded: false,
    },
  ];

  for (const expected of cases) {
    const result = evaluate(expected.expression, expected.point);
    assert.equal(result.exact, expected.exact, expected.expression);
    assert.equal(result.outcomeKind, "finite", expected.expression);
    assert.equal(
      result.numeratorMultiplicity,
      expected.numeratorMultiplicity,
      expected.expression,
    );
    assert.equal(
      result.denominatorMultiplicity,
      expected.denominatorMultiplicity,
      expected.expression,
    );
    assert.equal(
      result.canceledMultiplicity,
      expected.canceledMultiplicity,
      expected.expression,
    );
    assert.equal(result.pointExcluded, expected.pointExcluded, expected.expression);
    assert.ok(result.rationalFunction.domainFactors.length >= 1, expected.expression);
    assertSide(result.left, "finite", expected.exact);
    assertSide(result.right, "finite", expected.exact);
  }

  const removable = evaluate("(x^2-1)/(x-1)", 1n);
  assert.deepEqual(polynomialText(removable.numeratorAfterCancellation), ["1", "1"]);
  assert.deepEqual(polynomialText(removable.denominatorAfterCancellation), ["1"]);
  assert.deepEqual(
    removable.rationalFunction.domainFactors.map(polynomialText),
    [["-1", "1"]],
  );
  assert.equal(removable.numeratorIdenticallyZero, false);
  assert.equal(removable.poleOrder, 0);
  assert.equal(removable.targetDefined, false);
  assert.equal(removable.puncturedNeighborhoodCertified, true);
  assert.equal(removable.removableHoleAtTarget, true);
  assert.equal(removable.domainFactorChecks.length, 1);
  assert.equal(removable.domainFactorChecks[0].valueAtPoint.toString(), "0");
  assert.equal(removable.domainFactorChecks[0].multiplicity, 1);
  assert.equal(removable.domainFactorChecks[0].excludesPoint, true);
  assert.equal(removable.excludedDomainFactors.length, 1);
});

test("恒等的0の分子は全木認証後にだけ0とし、穴ledgerを保持する", () => {
  for (const [expression, denominatorMultiplicity] of [
    ["0*(1/(x-1))", 1],
    ["0/(x-1)^4", 4],
    ["((x-1)-(x-1))/(x-1)^2", 2],
  ]) {
    const result = evaluate(expression, 1n);
    assert.equal(result.exact, "0", expression);
    assert.equal(result.outcomeKind, "finite", expression);
    assert.equal(result.numeratorMultiplicity, null, expression);
    assert.equal(result.denominatorMultiplicity, denominatorMultiplicity, expression);
    assert.equal(result.canceledMultiplicity, denominatorMultiplicity, expression);
    assert.equal(result.leadingRatio, null, expression);
    assert.equal(result.numeratorIdenticallyZero, true, expression);
    assert.equal(result.poleOrder, 0, expression);
    assert.equal(result.pointExcluded, true, expression);
    assert.deepEqual(polynomialText(result.numeratorAfterCancellation), ["0"]);
    assert.deepEqual(polynomialText(result.denominatorAfterCancellation), ["1"]);
    assert.ok(result.rationalFunction.domainFactors.length >= 1, expression);
    assertSide(result.left, "finite", "0");
    assert.equal(result.left, result.right, expression);
  }
});

test("奇数極・偶数極・逆向き因子の左右符号とDNEを区別する", () => {
  const cases = [
    [
      "1/(x-1)",
      "negative-infinity",
      "positive-infinity",
      "does-not-exist",
      "存在しない（左極限=-∞、右極限=+∞）",
    ],
    [
      "1/(1-x)",
      "positive-infinity",
      "negative-infinity",
      "does-not-exist",
      "存在しない（左極限=+∞、右極限=-∞）",
    ],
    ["1/(x-1)^2", "positive-infinity", "positive-infinity", "positive-infinity", "+∞"],
    ["-1/(x-1)^2", "negative-infinity", "negative-infinity", "negative-infinity", "-∞"],
    [
      "1/(x-1)^3",
      "negative-infinity",
      "positive-infinity",
      "does-not-exist",
      "存在しない（左極限=-∞、右極限=+∞）",
    ],
    [
      "1/(1-x)^3",
      "positive-infinity",
      "negative-infinity",
      "does-not-exist",
      "存在しない（左極限=+∞、右極限=-∞）",
    ],
    ["1/(x-1)^4", "positive-infinity", "positive-infinity", "positive-infinity", "+∞"],
    ["-1/(1-x)^4", "negative-infinity", "negative-infinity", "negative-infinity", "-∞"],
  ];

  for (const [expression, leftKind, rightKind, outcomeKind, exact] of cases) {
    const result = evaluate(expression, 1n);
    assert.equal(result.outcomeKind, outcomeKind, expression);
    assert.equal(result.exact, exact, expression);
    assertSide(result.left, leftKind);
    assertSide(result.right, rightKind);
    assert.equal(result.pointExcluded, true, expression);
  }

  const left = evaluate("1/(x-1)", 1n, 1n, "left");
  assert.equal(left.outcomeKind, "negative-infinity");
  assert.equal(left.exact, "-∞");
  assertSide(left.left, "negative-infinity");
  assertSide(left.right, "positive-infinity");

  const right = evaluate("1/(x-1)", 1n, 1n, "right");
  assert.equal(right.outcomeKind, "positive-infinity");
  assert.equal(right.exact, "+∞");
  assertSide(right.left, "negative-infinity");
  assertSide(right.right, "positive-infinity");
});

test("分子・分母の零点次数0から4を相殺し、残る極の偶奇を型付きで返す", () => {
  const cases = [
    ["(x-1)^4/(x-1)^2", 4, 2, 2, "finite", "0"],
    ["(1-x)^3/(x-1)^3", 3, 3, 3, "finite", "-1"],
    ["(x-1)^2/(x-1)^4", 2, 4, 2, "positive-infinity", "+∞"],
    [
      "(1-x)/(x-1)^4",
      1,
      4,
      1,
      "does-not-exist",
      "存在しない（左極限=+∞、右極限=-∞）",
    ],
  ];

  for (
    const [
      expression,
      numeratorMultiplicity,
      denominatorMultiplicity,
      canceledMultiplicity,
      outcomeKind,
      exact,
    ] of cases
  ) {
    const result = evaluate(expression, 1n);
    assert.equal(result.numeratorMultiplicity, numeratorMultiplicity, expression);
    assert.equal(result.denominatorMultiplicity, denominatorMultiplicity, expression);
    assert.equal(result.canceledMultiplicity, canceledMultiplicity, expression);
    assert.equal(result.outcomeKind, outcomeKind, expression);
    assert.equal(result.exact, exact, expression);
    assert.ok(result.leadingRatio instanceof ExactRational, expression);
    assert.equal(Object.isFrozen(result), true, expression);
    assert.equal(Object.isFrozen(result.rationalFunction), true, expression);
    assert.equal(Object.isFrozen(result.numeratorAfterCancellation), true, expression);
    assert.equal(Object.isFrozen(result.denominatorAfterCancellation), true, expression);
  }

  assert.deepEqual([...LIMIT_DIRECTIONS].sort(), ["both", "left", "right"]);
  assert.equal(formatExactLimitSide({ kind: "positive-infinity" }), "+∞");
  assert.equal(formatExactLimitSide({ kind: "negative-infinity" }), "-∞");
});

test("異常な公開引数・恒等0分母・5次超過をfail closedにする", () => {
  const one = ExactRational.one();
  const zero = ExactRational.zero();
  const validFunction = Object.freeze({
    numerator: Object.freeze([one]),
    denominator: Object.freeze([one]),
    domainFactors: Object.freeze([]),
    hasVariableDenominator: false,
  });

  assert.throws(
    () => evaluateExactRationalFunctionLimit(null, one),
    TypeError,
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit(validFunction, { numerator: 0n, denominator: 1n }),
    TypeError,
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit(validFunction, one, "two-sided"),
    TypeError,
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [1n],
      denominator: [one],
      domainFactors: [],
    }, one),
    TypeError,
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [one],
      denominator: [one],
    }, one),
    TypeError,
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [one],
      denominator: [zero],
      domainFactors: [],
    }, one),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "ZERO_DENOMINATOR",
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [one],
      denominator: [one],
      domainFactors: [[zero]],
    }, zero),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "NO_PUNCTURED_DOMAIN",
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [one, zero],
      denominator: [one],
      domainFactors: [],
    }, zero),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "NONCANONICAL_POLYNOMIAL",
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [zero, zero, zero, zero, zero, one],
      denominator: [one],
      domainFactors: [],
    }, zero),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "POLYNOMIAL_DEGREE_TOO_HIGH",
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [one],
      denominator: [one],
      domainFactors: Array.from({ length: 11 }, () => [one]),
    }, zero),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "TOO_MANY_DOMAIN_FACTORS",
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [one],
      denominator: [one],
      domainFactors: new Array(1),
    }, zero),
    TypeError,
  );
  for (const fakeLength of [Number.NaN, -1, 0.5, "1", 0]) {
    const hiddenZeroFactor = new Proxy([[zero]], {
      get(target, property, receiver) {
        if (property === "length") return fakeLength;
        return Reflect.get(target, property, receiver);
      },
    });
    assert.throws(
      () => evaluateExactRationalFunctionLimit({
        numerator: [one],
        denominator: [one],
        domainFactors: hiddenZeroFactor,
      }, zero),
      TypeError,
    );
  }
  assert.throws(
    () => evaluateExactRationalFunctionLimit({
      numerator: [one],
      denominator: [one],
      domainFactors: [],
      hasVariableDenominator: "yes",
    }, zero),
    TypeError,
  );
  assert.throws(
    () => formatExactLimitSide({ kind: "finite", value: 1n }),
    TypeError,
  );
  assert.throws(
    () => formatExactLimitSide({ kind: "does-not-exist" }),
    TypeError,
  );
  assert.throws(
    () => evaluate("x^5", 1n),
    (error) => error instanceof ExactRationalFunctionError
      && error.unsupported === true,
  );
  assert.throws(
    () => evaluate("x*x*x*x*x", 1n),
    (error) => error instanceof ExactRationalFunctionError
      && error.unsupported === true,
  );
});

test("公開APIは派生型・可変配列・公開方向一覧から不変snapshotを作る", () => {
  class LiarCoefficient extends ExactRational {
    isZero() {
      return true;
    }

    toString() {
      return "偽装値";
    }
  }

  class LiarPoint extends ExactRational {
    multiply() {
      return ExactRational.zero();
    }
  }

  const one = ExactRational.one();
  const zero = ExactRational.zero();
  const liarResult = evaluateExactRationalFunctionLimit({
    numerator: [new LiarCoefficient(1n)],
    denominator: [one],
    domainFactors: [],
    hasVariableDenominator: false,
  }, zero);
  assert.equal(liarResult.exact, "1");
  assert.equal(liarResult.numeratorIdenticallyZero, false);
  assert.equal(
    formatExactLimitSide({ kind: "finite", value: new LiarCoefficient(1n) }),
    "1",
  );

  const pointResult = evaluateExactRationalFunctionLimit({
    numerator: [one, new ExactRational(-2n), one],
    denominator: [new ExactRational(-1n), one],
    domainFactors: [[new ExactRational(-1n), one]],
    hasVariableDenominator: true,
  }, new LiarPoint(1n));
  assert.equal(pointResult.exact, "0");
  assert.equal(pointResult.numeratorMultiplicity, 2);
  assert.equal(pointResult.denominatorMultiplicity, 1);

  const mutableNumerator = [one];
  const mutableFactor = [new ExactRational(-1n), one];
  const snapshotted = evaluateExactRationalFunctionLimit({
    numerator: mutableNumerator,
    denominator: [one],
    domainFactors: [mutableFactor],
    hasVariableDenominator: true,
  }, one);
  mutableNumerator[0] = zero;
  mutableFactor[0] = one;
  assert.equal(snapshotted.rationalFunction.numerator[0].toString(), "1");
  assert.deepEqual(
    snapshotted.rationalFunction.domainFactors[0].map(String),
    ["-1", "1"],
  );
  assert.deepEqual(
    snapshotted.domainFactorChecks[0].factor.map(String),
    ["-1", "1"],
  );
  assert.equal(Object.isFrozen(snapshotted.rationalFunction), true);
  assert.equal(Object.isFrozen(snapshotted.rationalFunction.numerator), true);
  assert.equal(Object.isFrozen(snapshotted.rationalFunction.domainFactors), true);
  assert.equal(Object.isFrozen(LIMIT_DIRECTIONS), true);
  assert.throws(() => LIMIT_DIRECTIONS.push("diagonal"), TypeError);
  assert.deepEqual(LIMIT_DIRECTIONS, ["both", "left", "right"]);
});

// The generated oracle below intentionally does not import or call production
// rational arithmetic. Production ExactRational is used only to pass the point
// into the core under test; all expected values and signs are derived here with
// independent BigInt normalization and arithmetic.
function oracleAbsolute(value) {
  return value < 0n ? -value : value;
}

function oracleGcd(left, right) {
  let a = oracleAbsolute(left);
  let b = oracleAbsolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function oracleRational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError("oracle denominator is zero");
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = oracleGcd(numerator, denominator);
  return Object.freeze({
    numerator: sign * numerator / divisor,
    denominator: oracleAbsolute(denominator) / divisor,
  });
}

function oracleMultiply(left, right) {
  return oracleRational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function oracleDivide(left, right) {
  if (right.numerator === 0n) throw new RangeError("oracle division by zero");
  return oracleRational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function oraclePower(value, exponent) {
  let output = oracleRational(1n);
  for (let count = 0; count < exponent; count += 1) {
    output = oracleMultiply(output, value);
  }
  return output;
}

function oracleFormat(value) {
  return value.denominator === 1n
    ? value.numerator.toString()
    : `${value.numerator}/${value.denominator}`;
}

function oracleSign(value) {
  return value.numerator < 0n ? -1 : 1;
}

function oracleFactor(denominator, numerator, reversed) {
  const normal = numerator < 0n
    ? `${denominator}*x+${-numerator}`
    : `${denominator}*x-${numerator}`;
  return reversed ? `(-(${normal}))` : `(${normal})`;
}

function oracleFactorPower(factor, exponent, variant) {
  if (exponent === 0) return "1";
  if (exponent === 1) return factor;
  if (variant % 2 === 0) return `${factor}^${exponent}`;
  if (exponent === 2) return `${factor}*${factor}`;
  if (exponent === 3) return `${factor}^2*${factor}`;
  return `${factor}^2*${factor}^2`;
}

function oracleInfiniteSide(sign) {
  return Object.freeze({
    kind: sign < 0 ? "negative-infinity" : "positive-infinity",
    exact: sign < 0 ? "-∞" : "+∞",
  });
}

function oracleFiniteSide(value) {
  return Object.freeze({ kind: "finite", exact: oracleFormat(value) });
}

function oracleOutcome({
  numeratorMultiplicity,
  denominatorMultiplicity,
  leadingRatio,
  direction,
}) {
  let left;
  let right;
  if (numeratorMultiplicity > denominatorMultiplicity) {
    left = oracleFiniteSide(oracleRational(0n));
    right = left;
  } else if (numeratorMultiplicity === denominatorMultiplicity) {
    left = oracleFiniteSide(leadingRatio);
    right = left;
  } else {
    const poleOrder = denominatorMultiplicity - numeratorMultiplicity;
    const rightSign = oracleSign(leadingRatio);
    const leftSign = poleOrder % 2 === 0 ? rightSign : -rightSign;
    left = oracleInfiniteSide(leftSign);
    right = oracleInfiniteSide(rightSign);
  }

  if (direction === "left") {
    return Object.freeze({ left, right, kind: left.kind, exact: left.exact });
  }
  if (direction === "right") {
    return Object.freeze({ left, right, kind: right.kind, exact: right.exact });
  }
  if (left.kind === right.kind && left.exact === right.exact) {
    return Object.freeze({ left, right, kind: left.kind, exact: left.exact });
  }
  return Object.freeze({
    left,
    right,
    kind: "does-not-exist",
    exact: `存在しない（左極限=${left.exact}、右極限=${right.exact}）`,
  });
}

function generatedOracleCase(index) {
  const numeratorMultiplicity = index % 5;
  const denominatorMultiplicity = Math.floor(index / 5) % 5;
  const variant = Math.floor(index / 25);

  let pointDenominator;
  let pointNumerator;
  if (variant % 3 === 0) {
    pointDenominator = 1n;
    pointNumerator = BigInt(((index * 7 + variant * 3) % 23) - 11);
  } else {
    const denominators = variant % 3 === 1 ? [2, 3, 5, 7] : [2, 4, 5, 10];
    pointDenominator = BigInt(denominators[index % denominators.length]);
    pointNumerator = BigInt(((index * 11 + variant * 5) % 29) - 14);
    if (pointNumerator % pointDenominator === 0n) pointNumerator += 1n;
  }
  const point = oracleRational(pointNumerator, pointDenominator);
  pointNumerator = point.numerator;
  pointDenominator = point.denominator;

  const reversedNumerator = (variant & 1) !== 0;
  const reversedDenominator = (variant & 2) !== 0;
  const numeratorFactor = oracleFactor(
    pointDenominator,
    pointNumerator,
    reversedNumerator,
  );
  const denominatorFactor = oracleFactor(
    pointDenominator,
    pointNumerator,
    reversedDenominator,
  );

  let numeratorCoefficient = oracleRational(
    BigInt(((index * 5 + variant * 7) % 19) - 9),
    BigInt((index % 3) + 1),
  );
  if (numeratorCoefficient.numerator === 0n) {
    numeratorCoefficient = oracleRational(variant % 2 ? 11n : -11n, 2n);
  }
  if (variant === 9) {
    numeratorCoefficient = oracleRational(10n ** 80n + 1n, 2n);
  }

  let denominatorCoefficient = oracleRational(
    BigInt(((index * 7 + variant * 11) % 23) - 11),
    BigInt(((index + 1) % 4) + 1),
  );
  if (denominatorCoefficient.numerator === 0n) {
    denominatorCoefficient = oracleRational(variant % 2 ? -13n : 13n, 3n);
  }

  let numeratorResidual = oracleRational(
    BigInt(((index * 3 + variant * 5) % 17) - 8),
    BigInt(((index + 2) % 5) + 1),
  );
  if (numeratorResidual.numerator === 0n) {
    numeratorResidual = oracleRational(7n, 3n);
  }
  let denominatorResidual = oracleRational(
    BigInt(((index * 11 + variant * 2) % 19) - 9),
    BigInt(((index + 3) % 5) + 1),
  );
  if (denominatorResidual.numerator === 0n) {
    denominatorResidual = oracleRational(-5n, 2n);
  }

  const numeratorResidualSource = numeratorMultiplicity < 4
    ? `(${oracleFormat(numeratorResidual)}+${numeratorFactor})`
    : "1";
  const denominatorResidualSource = denominatorMultiplicity < 4
    ? `(${oracleFormat(denominatorResidual)}+${denominatorFactor})`
    : "1";
  const expression = `(${oracleFormat(numeratorCoefficient)}`
    + `*${oracleFactorPower(numeratorFactor, numeratorMultiplicity, variant)}`
    + `*${numeratorResidualSource})`
    + `/(${oracleFormat(denominatorCoefficient)}`
    + `*${oracleFactorPower(denominatorFactor, denominatorMultiplicity, variant + 1)}`
    + `*${denominatorResidualSource})`;

  const numeratorLeading = oracleRational(
    reversedNumerator ? -pointDenominator : pointDenominator,
  );
  const denominatorLeading = oracleRational(
    reversedDenominator ? -pointDenominator : pointDenominator,
  );
  const numeratorLeadingValue = oracleMultiply(
    oracleMultiply(
      numeratorCoefficient,
      numeratorMultiplicity < 4 ? numeratorResidual : oracleRational(1n),
    ),
    oraclePower(numeratorLeading, numeratorMultiplicity),
  );
  const denominatorLeadingValue = oracleMultiply(
    oracleMultiply(
      denominatorCoefficient,
      denominatorMultiplicity < 4 ? denominatorResidual : oracleRational(1n),
    ),
    oraclePower(denominatorLeading, denominatorMultiplicity),
  );
  const leadingRatio = oracleDivide(numeratorLeadingValue, denominatorLeadingValue);
  const direction = ["both", "left", "right"][
    (variant + numeratorMultiplicity + 2 * denominatorMultiplicity) % 3
  ];

  return Object.freeze({
    expression,
    point,
    direction,
    numeratorMultiplicity,
    denominatorMultiplicity,
    leadingRatio,
    outcome: oracleOutcome({
      numeratorMultiplicity,
      denominatorMultiplicity,
      leadingRatio,
      direction,
    }),
  });
}

test("独立BigInt oracleの250ケースで零点次数0から4と全方向を照合する", () => {
  const cases = Array.from({ length: 250 }, (_, index) => generatedOracleCase(index));
  assert.equal(new Set(cases.map(({ expression }) => expression)).size, 250);
  assert.deepEqual(
    new Set(cases.map(({ direction }) => direction)),
    new Set(["both", "left", "right"]),
  );
  assert.equal(
    new Set(cases.map(({ numeratorMultiplicity, denominatorMultiplicity }) => (
      `${numeratorMultiplicity}/${denominatorMultiplicity}`
    ))).size,
    25,
  );

  for (const expected of cases) {
    const result = evaluateExactRationalLimit(
      ast(expected.expression),
      new ExactRational(expected.point.numerator, expected.point.denominator),
      expected.direction,
    );
    assert.equal(result.direction, expected.direction, expected.expression);
    assert.equal(
      result.numeratorMultiplicity,
      expected.numeratorMultiplicity,
      expected.expression,
    );
    assert.equal(
      result.denominatorMultiplicity,
      expected.denominatorMultiplicity,
      expected.expression,
    );
    assert.equal(
      result.canceledMultiplicity,
      Math.min(expected.numeratorMultiplicity, expected.denominatorMultiplicity),
      expected.expression,
    );
    assert.equal(result.leadingRatio.toString(), oracleFormat(expected.leadingRatio));
    assert.equal(result.pointExcluded, expected.denominatorMultiplicity > 0);
    assert.equal(result.outcomeKind, expected.outcome.kind, expected.expression);
    assert.equal(result.exact, expected.outcome.exact, expected.expression);
    assertSide(result.left, expected.outcome.left.kind, expected.outcome.left.exact);
    assertSide(result.right, expected.outcome.right.kind, expected.outcome.right.exact);
  }
});

function infinity(expression, approach) {
  return evaluateExactRationalLimitAtInfinity(ast(expression), approach);
}

test("無限遠では次数差・先頭係数比・奇偶から両方向を厳密に返す", () => {
  const cases = [
    ["(3*x+1)/(2*x^2+1)", "finite", "0", "finite", "0"],
    ["(-3*x^2+x+1)/(2*x^2-7)", "finite", "-3/2", "finite", "-3/2"],
    ["x", "positive-infinity", "+∞", "negative-infinity", "-∞"],
    ["-x", "negative-infinity", "-∞", "positive-infinity", "+∞"],
    ["x^2+1", "positive-infinity", "+∞", "positive-infinity", "+∞"],
    ["-x^3+2", "negative-infinity", "-∞", "positive-infinity", "+∞"],
    ["(2*x^4+1)/(-3*x)", "negative-infinity", "-∞", "positive-infinity", "+∞"],
    ["0/(x^4+1)", "finite", "0", "finite", "0"],
  ];

  for (
    const [
      expression,
      positiveKind,
      positiveExact,
      negativeKind,
      negativeExact,
    ] of cases
  ) {
    for (const approach of INFINITY_APPROACHES) {
      const result = infinity(expression, approach);
      assertSide(result.positiveInfinity, positiveKind, positiveExact);
      assertSide(result.negativeInfinity, negativeKind, negativeExact);
      assert.equal(
        result.exact,
        approach === "positive-infinity" ? positiveExact : negativeExact,
        `${expression} @ ${approach}`,
      );
      assert.equal(
        result.outcomeKind,
        approach === "positive-infinity" ? positiveKind : negativeKind,
        `${expression} @ ${approach}`,
      );
      assert.equal(result.tailDomainCertified, true);
      assert.equal(result.positiveInfinityEvidence.exact, positiveExact);
      assert.equal(result.negativeInfinityEvidence.exact, negativeExact);
      assert.equal(
        result.bothDirectionEvidence.positiveInfinity,
        result.positiveInfinityEvidence,
      );
      assert.equal(
        result.bothDirectionEvidence.negativeInfinity,
        result.negativeInfinityEvidence,
      );
      assert.equal(Object.isFrozen(result.bothDirectionEvidence), true);
    }
  }

  const zero = infinity("0/(x^4+1)", "positive-infinity");
  assert.equal(zero.numeratorIdenticallyZero, true);
  assert.equal(zero.numeratorDegree, null);
  assert.equal(zero.degreeDifference, null);
  assert.equal(zero.numeratorLeadingCoefficient, null);
  assert.equal(zero.leadingRatio, null);
  assert.equal(zero.numeratorTailCheck, null);

  const equalDegree = infinity(
    "(-3*x^2+x+1)/(2*x^2-7)",
    "negative-infinity",
  );
  assert.equal(equalDegree.numeratorDegree, 2);
  assert.equal(equalDegree.denominatorDegree, 2);
  assert.equal(equalDegree.degreeDifference, 0);
  assert.equal(equalDegree.numeratorLeadingCoefficient.toString(), "-3");
  assert.equal(equalDegree.denominatorLeadingCoefficient.toString(), "2");
  assert.equal(equalDegree.leadingRatio.toString(), "-3/2");
});

test("Cauchy境界1+sum|a_i/a_n|で元の定義域を両側のtailまで証明する", () => {
  const q = (numerator, denominator = 1n) => (
    new ExactRational(numerator, denominator)
  );
  const result = evaluateExactRationalFunctionLimitAtInfinity({
    numerator: [q(1n), q(2n)],
    denominator: [q(6n), q(-5n), q(1n)],
    domainFactors: [
      [q(-100n), q(1n)],
      [q(3n, 2n), q(-1n, 2n)],
    ],
    hasVariableDenominator: true,
  }, "positive-infinity");

  assert.equal(result.numeratorTailCheck.sourceKind, "numerator");
  assert.deepEqual(
    result.numeratorTailCheck.lowerCoefficientAbsoluteRatios.map(String),
    ["1/2"],
  );
  assert.equal(
    result.numeratorTailCheck.lowerCoefficientAbsoluteRatioSum.toString(),
    "1/2",
  );
  assert.equal(result.numeratorTailCheck.cauchyRootMagnitudeBound.toString(), "3/2");

  assert.equal(result.denominatorTailCheck.sourceKind, "denominator");
  assert.deepEqual(
    result.denominatorTailCheck.lowerCoefficientAbsoluteRatios.map(String),
    ["6", "5"],
  );
  assert.equal(
    result.denominatorTailCheck.lowerCoefficientAbsoluteRatioSum.toString(),
    "11",
  );
  assert.equal(result.denominatorTailCheck.cauchyRootMagnitudeBound.toString(), "12");
  assert.equal(
    result.denominatorTailCheck.certifiedNonzeroForAbsXGreaterThan.toString(),
    "12",
  );

  assert.equal(result.domainFactorChecks.length, 2);
  assert.equal(result.domainFactorChecks[0].sourceKind, "original-domain-factor");
  assert.equal(result.domainFactorChecks[0].sourceIndex, 0);
  assert.equal(result.domainFactorChecks[0].cauchyRootMagnitudeBound.toString(), "101");
  assert.equal(result.domainFactorChecks[1].sourceIndex, 1);
  assert.equal(result.domainFactorChecks[1].cauchyRootMagnitudeBound.toString(), "4");
  assert.equal(result.originalDomainTailChecks, result.domainFactorChecks);
  assert.equal(result.domainTailChecks.length, 3);
  assert.equal(result.certifiedTailBound.toString(), "101");

  for (const [certificate, approach, comparison] of [
    [
      result.positiveTailDomainCertificate,
      "positive-infinity",
      "x>certifiedTailBound",
    ],
    [
      result.negativeTailDomainCertificate,
      "negative-infinity",
      "x<-certifiedTailBound",
    ],
  ]) {
    assert.equal(certificate.approach, approach);
    assert.equal(certificate.comparison, comparison);
    assert.equal(certificate.absoluteValueMustBeStrictlyGreaterThan.toString(), "101");
    assert.equal(certificate.checkedPolynomialCount, 3);
    assert.equal(certificate.denominatorEventuallyNonzero, true);
    assert.equal(certificate.originalDomainFactorsEventuallyNonzero, true);
    assert.equal(certificate.certified, true);
    assert.equal(certificate.checks, result.domainTailChecks);
    assert.equal(Object.isFrozen(certificate), true);
  }
  assert.deepEqual(
    result.tailDomainCertificates,
    [result.positiveTailDomainCertificate, result.negativeTailDomainCertificate],
  );

  const originalHole = infinity("(x-100)^0", "negative-infinity");
  assert.equal(originalHole.exact, "1");
  assert.deepEqual(originalHole.rationalFunction.denominator.map(String), ["1"]);
  assert.deepEqual(
    originalHole.rationalFunction.domainFactors.map((factor) => factor.map(String)),
    [["-100", "1"]],
  );
  assert.equal(originalHole.denominatorTailCheck.cauchyRootMagnitudeBound.toString(), "1");
  assert.equal(originalHole.originalDomainTailChecks.length, 1);
  assert.equal(
    originalHole.originalDomainTailChecks[0].cauchyRootMagnitudeBound.toString(),
    "101",
  );
  assert.equal(originalHole.certifiedTailBound.toString(), "101");
});

test("無限遠公開APIは入力snapshotと深い凍結を保ち、異常入力をfail closedにする", () => {
  class LiarCoefficient extends ExactRational {
    isZero() {
      return true;
    }

    divide() {
      throw new Error("派生型のdivideを呼び出してはいけない");
    }

    toString() {
      return "偽装値";
    }
  }

  const one = ExactRational.one();
  const zero = ExactRational.zero();
  const numerator = [new LiarCoefficient(1n), new LiarCoefficient(2n)];
  const denominator = [new LiarCoefficient(-3n), new LiarCoefficient(1n)];
  const originalFactor = [new LiarCoefficient(-10n), new LiarCoefficient(1n)];
  const domainFactors = [originalFactor];
  const result = evaluateExactRationalFunctionLimitAtInfinity({
    numerator,
    denominator,
    domainFactors,
    hasVariableDenominator: true,
  }, "negative-infinity");

  numerator[0] = zero;
  denominator[1] = zero;
  originalFactor[0] = one;
  domainFactors.length = 0;
  assert.equal(result.exact, "2");
  assert.deepEqual(result.rationalFunction.numerator.map(String), ["1", "2"]);
  assert.deepEqual(result.rationalFunction.denominator.map(String), ["-3", "1"]);
  assert.deepEqual(
    result.rationalFunction.domainFactors[0].map(String),
    ["-10", "1"],
  );
  assert.equal(result.certifiedTailBound.toString(), "11");

  for (const frozenValue of [
    result,
    result.rationalFunction,
    result.rationalFunction.numerator,
    result.rationalFunction.denominator,
    result.rationalFunction.domainFactors,
    result.rationalFunction.domainFactors[0],
    result.numeratorTailCheck,
    result.numeratorTailCheck.lowerCoefficientAbsoluteRatios,
    result.denominatorTailCheck,
    result.domainFactorChecks,
    result.domainFactorChecks[0],
    result.domainTailChecks,
    result.tailDomainCertificates,
    result.positiveInfinity,
    result.negativeInfinity,
    result.positiveInfinityEvidence,
    result.negativeInfinityEvidence,
    result.bothDirectionEvidence,
  ]) {
    assert.equal(Object.isFrozen(frozenValue), true);
  }
  assert.throws(() => result.domainTailChecks.push(result.denominatorTailCheck), TypeError);

  assert.equal(Object.isFrozen(INFINITY_APPROACHES), true);
  assert.deepEqual(INFINITY_APPROACHES, [
    "positive-infinity",
    "negative-infinity",
  ]);
  assert.throws(() => INFINITY_APPROACHES.push("both"), TypeError);
  const stillValid = infinity("x", "positive-infinity");
  assert.equal(stillValid.exact, "+∞");

  const validFunction = {
    numerator: [one],
    denominator: [one],
    domainFactors: [],
    hasVariableDenominator: false,
  };
  for (const approach of [undefined, null, "both", "+infinity", {}, 1]) {
    assert.throws(
      () => evaluateExactRationalFunctionLimitAtInfinity(validFunction, approach),
      TypeError,
    );
  }
  assert.throws(
    () => evaluateExactRationalFunctionLimitAtInfinity(null, "positive-infinity"),
    TypeError,
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimitAtInfinity({
      numerator: [one],
      denominator: [zero],
      domainFactors: [],
    }, "positive-infinity"),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "ZERO_DENOMINATOR",
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimitAtInfinity({
      numerator: [one],
      denominator: [one, zero],
      domainFactors: [],
    }, "positive-infinity"),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "NONCANONICAL_POLYNOMIAL",
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimitAtInfinity({
      numerator: [one],
      denominator: new Array(2),
      domainFactors: [],
    }, "positive-infinity"),
    TypeError,
  );
  assert.throws(
    () => evaluateExactRationalFunctionLimitAtInfinity({
      numerator: [one],
      denominator: [one],
      domainFactors: [[zero]],
    }, "negative-infinity"),
    (error) => error instanceof ExactRationalLimitError
      && error.code === "NO_PUNCTURED_DOMAIN",
  );
  assert.throws(
    () => infinity("x^5", "positive-infinity"),
    (error) => error instanceof ExactRationalFunctionError
      && error.unsupported === true,
  );
});

function oracleAdd(left, right) {
  return oracleRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function oracleAbsoluteRational(value) {
  return oracleRational(oracleAbsolute(value.numerator), value.denominator);
}

function oracleCompare(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function oraclePolynomialTailBound(polynomial) {
  const leadingCoefficient = polynomial.at(-1);
  let ratioSum = oracleRational(0n);
  const ratios = polynomial.slice(0, -1).map((coefficient) => {
    const ratio = oracleAbsoluteRational(oracleDivide(coefficient, leadingCoefficient));
    ratioSum = oracleAdd(ratioSum, ratio);
    return ratio;
  });
  return Object.freeze({
    ratios: Object.freeze(ratios),
    ratioSum,
    bound: oracleAdd(oracleRational(1n), ratioSum),
  });
}

function generatedInfinityPolynomial(seed, degree) {
  return Object.freeze(Array.from({ length: degree + 1 }, (_, coefficientIndex) => {
    let numerator = BigInt(
      ((seed * 37 + coefficientIndex * 23 + degree * 11) % 47) - 23,
    );
    const denominator = BigInt(
      ((seed * 13 + coefficientIndex * 7 + degree) % 9) + 1,
    );
    if (coefficientIndex === degree && numerator === 0n) {
      numerator = seed % 2 === 0 ? 29n : -31n;
    }
    return oracleRational(numerator, denominator);
  }));
}

function infinityOracleSide(numerator, denominator, approach) {
  const numeratorIsZero = numerator.length === 1 && numerator[0].numerator === 0n;
  if (numeratorIsZero) return oracleFiniteSide(oracleRational(0n));
  const degreeDifference = numerator.length - denominator.length;
  if (degreeDifference < 0) return oracleFiniteSide(oracleRational(0n));
  const leadingRatio = oracleDivide(numerator.at(-1), denominator.at(-1));
  if (degreeDifference === 0) return oracleFiniteSide(leadingRatio);
  let sign = oracleSign(leadingRatio);
  if (approach === "negative-infinity" && degreeDifference % 2 !== 0) {
    sign = -sign;
  }
  return oracleInfiniteSide(sign);
}

function generatedInfinityOracleCase(index) {
  const numeratorIsZero = index % 19 === 0;
  const numeratorDegree = index % 5;
  const denominatorDegree = Math.floor(index / 5) % 5;
  const domainFactorDegree = (Math.floor(index / 25) % 4) + 1;
  const numerator = numeratorIsZero
    ? Object.freeze([oracleRational(0n)])
    : generatedInfinityPolynomial(index + 101, numeratorDegree);
  const denominator = generatedInfinityPolynomial(index + 307, denominatorDegree);
  const domainFactors = Object.freeze([
    generatedInfinityPolynomial(index + 509, domainFactorDegree),
  ]);
  const approach = INFINITY_APPROACHES[index % INFINITY_APPROACHES.length];
  const positiveInfinity = infinityOracleSide(
    numerator,
    denominator,
    "positive-infinity",
  );
  const negativeInfinity = infinityOracleSide(
    numerator,
    denominator,
    "negative-infinity",
  );
  const denominatorTail = oraclePolynomialTailBound(denominator);
  const domainFactorTails = domainFactors.map(oraclePolynomialTailBound);
  const certifiedTailBound = [denominatorTail, ...domainFactorTails]
    .reduce((bound, check) => (
      oracleCompare(check.bound, bound) > 0 ? check.bound : bound
    ), oracleRational(0n));
  return Object.freeze({
    numerator,
    denominator,
    domainFactors,
    approach,
    numeratorIsZero,
    numeratorDegree: numeratorIsZero ? null : numeratorDegree,
    denominatorDegree,
    degreeDifference: numeratorIsZero
      ? null
      : numeratorDegree - denominatorDegree,
    leadingRatio: numeratorIsZero
      ? null
      : oracleDivide(numerator.at(-1), denominator.at(-1)),
    positiveInfinity,
    negativeInfinity,
    denominatorTail,
    domainFactorTails,
    certifiedTailBound,
  });
}

function exactPolynomialFromOracle(polynomial) {
  return polynomial.map(({ numerator, denominator }) => (
    new ExactRational(numerator, denominator)
  ));
}

test("独立BigInt oracleの300ケースで無限遠の次数分類・符号・tail境界を照合する", () => {
  const cases = Array.from(
    { length: 300 },
    (_, index) => generatedInfinityOracleCase(index),
  );
  assert.deepEqual(
    new Set(cases.map(({ approach }) => approach)),
    new Set(INFINITY_APPROACHES),
  );
  assert.deepEqual(
    new Set(cases.filter(({ numeratorIsZero }) => !numeratorIsZero).map((entry) => (
      `${entry.numeratorDegree}/${entry.denominatorDegree}`
    ))),
    new Set(Array.from(
      { length: 25 },
      (_, index) => `${index % 5}/${Math.floor(index / 5)}`,
    )),
  );

  for (const expected of cases) {
    const result = evaluateExactRationalFunctionLimitAtInfinity({
      numerator: exactPolynomialFromOracle(expected.numerator),
      denominator: exactPolynomialFromOracle(expected.denominator),
      domainFactors: expected.domainFactors.map(exactPolynomialFromOracle),
      hasVariableDenominator: true,
    }, expected.approach);
    const selected = expected.approach === "positive-infinity"
      ? expected.positiveInfinity
      : expected.negativeInfinity;
    assert.equal(result.numeratorIdenticallyZero, expected.numeratorIsZero);
    assert.equal(result.numeratorDegree, expected.numeratorDegree);
    assert.equal(result.denominatorDegree, expected.denominatorDegree);
    assert.equal(result.degreeDifference, expected.degreeDifference);
    assert.equal(
      result.leadingRatio?.toString() ?? null,
      expected.leadingRatio ? oracleFormat(expected.leadingRatio) : null,
    );
    assert.equal(result.positiveInfinity.kind, expected.positiveInfinity.kind);
    assert.equal(
      formatExactLimitSide(result.positiveInfinity),
      expected.positiveInfinity.exact,
    );
    assert.equal(result.negativeInfinity.kind, expected.negativeInfinity.kind);
    assert.equal(
      formatExactLimitSide(result.negativeInfinity),
      expected.negativeInfinity.exact,
    );
    assert.equal(result.outcomeKind, selected.kind);
    assert.equal(result.exact, selected.exact);
    assert.equal(
      result.denominatorTailCheck.lowerCoefficientAbsoluteRatioSum.toString(),
      oracleFormat(expected.denominatorTail.ratioSum),
    );
    assert.equal(
      result.denominatorTailCheck.cauchyRootMagnitudeBound.toString(),
      oracleFormat(expected.denominatorTail.bound),
    );
    assert.deepEqual(
      result.denominatorTailCheck.lowerCoefficientAbsoluteRatios.map(String),
      expected.denominatorTail.ratios.map(oracleFormat),
    );
    assert.equal(
      result.domainFactorChecks[0].cauchyRootMagnitudeBound.toString(),
      oracleFormat(expected.domainFactorTails[0].bound),
    );
    assert.equal(
      result.certifiedTailBound.toString(),
      oracleFormat(expected.certifiedTailBound),
    );
  }
});
