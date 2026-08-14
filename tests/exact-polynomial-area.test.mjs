import assert from "node:assert/strict";
import test from "node:test";

import {
  AREA_BOUND_MODES,
  ExactPolynomialAreaError,
  evaluateExactPolynomialArea,
} from "../js/math-core/exact-polynomial-area.js";
import { exactPolynomialFromAst } from "../js/math-core/exact-polynomial.js";
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

function explicit(first, second, lower, upper) {
  return evaluateExactPolynomialArea(polynomial(first), polynomial(second), {
    lower: q(lower),
    upper: q(upper),
  });
}

test("交点ごとに絶対値積分を分け、符号付き積分の相殺を面積へ持ち込まない", () => {
  const crossing = explicit("x", "0", "-1", "1");
  assert.equal(crossing.exact, "1");
  assert.deepEqual(
    crossing.pieces.map(({ lower, upper, sign, signedExact, areaExact }) => ({
      lower: lower.exact,
      upper: upper.exact,
      sign,
      signedExact,
      areaExact,
    })),
    [
      { lower: "-1", upper: "0", sign: -1, signedExact: "-1/2", areaExact: "1/2" },
      { lower: "0", upper: "1", sign: 1, signedExact: "1/2", areaExact: "1/2" },
    ],
  );

  const twoPieces = explicit("x^2-1", "0", "-1", "2");
  assert.equal(twoPieces.exact, "8/3");
  assert.deepEqual(twoPieces.partitionPoints.map(({ exact }) => exact), ["-1", "1", "2"]);
  assert.deepEqual(twoPieces.pieces.map(({ areaExact }) => areaExact), ["4/3", "4/3"]);
});

test("有理交点・端点交点・同一曲線を厳密分数のまま扱う", () => {
  assert.equal(explicit("x^2", "2x", "0", "2").exact, "4/3");
  assert.equal(explicit("x^2-1", "0", "-1", "1").exact, "4/3");
  assert.equal(explicit("(x-1)^2", "0", "-1", "3").exact, "16/3");
  assert.equal(explicit("x^2+1", "x^2+1", "-5/2", "7/3").exact, "0");
});

test("二次無理交点でQ+Q√dを丸めず分割・加算・整形する", () => {
  const bounded = evaluateExactPolynomialArea(polynomial("x^2"), polynomial("2"), {
    mode: "intersections",
  });
  assert.equal(bounded.lower.exact, "-√2");
  assert.equal(bounded.upper.exact, "√2");
  assert.equal(bounded.exact, "8√2/3");
  assert.equal(bounded.pieces[0].areaExact, "8√2/3");

  const explicitInterval = explicit("x^2", "2", "-2", "2");
  assert.equal(explicitInterval.exact, "(-8+16√2)/3");
  assert.deepEqual(
    explicitInterval.partitionPoints.map(({ exact }) => exact),
    ["-2", "-√2", "√2", "2"],
  );
  assert.deepEqual(
    explicitInterval.pieces.map(({ sign }) => sign),
    [1, -1, 1],
  );
  assert.equal(
    evaluateExactPolynomialArea(polynomial("2"), polynomial("x^2"), {
      mode: "intersections",
    }).exact,
    "8√2/3",
  );
});

test("各曲線を4次まで全面検証し、差が2次以下なら共通高次項を安全に消去する", () => {
  const result = explicit("x^4+x^2", "x^4+1", "-1", "1");
  assert.equal(result.exact, "4/3");
  assert.equal(result.firstPolynomial.length - 1, 4);
  assert.equal(result.secondPolynomial.length - 1, 4);
  assert.equal(result.difference.length - 1, 2);
});

test("交点区間は異なる2実交点を厳密に持つ場合だけ成立させる", () => {
  for (const [first, second] of [
    ["x^2+1", "0"],
    ["x^2", "0"],
    ["x", "0"],
    ["x^2+1", "x^2+1"],
  ]) {
    assert.throws(
      () => evaluateExactPolynomialArea(polynomial(first), polynomial(second), {
        mode: "intersections",
      }),
      (error) => error instanceof ExactPolynomialAreaError
        && error.code === "INTERSECTION_COUNT_MISMATCH",
      `${first}; ${second}`,
    );
  }
});

test("逆順・空区間・競合区間・差の3次超過をfail closedにする", () => {
  for (const [lower, upper] of [["1", "1"], ["2", "-1"]]) {
    assert.throws(
      () => explicit("x", "0", lower, upper),
      (error) => error instanceof ExactPolynomialAreaError
        && error.code === "INVALID_AREA_INTERVAL_ORDER",
    );
  }
  assert.throws(
    () => evaluateExactPolynomialArea(polynomial("x^2"), polynomial("0"), {
      mode: "intersections",
      lower: q("-1"),
      upper: q("1"),
    }),
    (error) => error instanceof ExactPolynomialAreaError
      && error.code === "CONFLICTING_AREA_BOUNDS",
  );
  assert.throws(
    () => explicit("x^3", "0", "-1", "1"),
    (error) => error instanceof ExactPolynomialAreaError
      && error.code === "AREA_DIFFERENCE_DEGREE_TOO_HIGH"
      && error.unsupported,
  );
});

test("公開APIは密な正規配列と基底ExactRationalの不変snapshotだけを保持する", () => {
  const mutableFirst = [q("0"), q("1")];
  const mutableSecond = [q("0")];
  const result = evaluateExactPolynomialArea(mutableFirst, mutableSecond, {
    lower: q("0"),
    upper: q("1"),
  });
  mutableFirst[1] = q("99");
  mutableSecond[0] = q("99");
  assert.equal(result.exact, "1/2");
  assert.equal(result.firstPolynomial[1].toString(), "1");
  assert.equal(Object.getPrototypeOf(result.firstPolynomial[1]), ExactRational.prototype);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.firstPolynomial), true);
  assert.equal(Object.isFrozen(result.pieces), true);
  assert.equal(Object.isFrozen(result.pieces[0]), true);
  assert.equal(Object.isFrozen(result.value), true);

  const sparse = [q("0"), , q("1")];
  assert.throws(
    () => evaluateExactPolynomialArea(sparse, [q("0")], {
      lower: q("0"),
      upper: q("1"),
    }),
    /疎配列/u,
  );
  assert.throws(
    () => evaluateExactPolynomialArea([q("1"), q("0")], [q("0")], {
      lower: q("0"),
      upper: q("1"),
    }),
    (error) => error instanceof ExactPolynomialAreaError
      && error.code === "NONCANONICAL_AREA_POLYNOMIAL",
  );
  assert.throws(
    () => evaluateExactPolynomialArea(
      [q("0"), q("0"), q("0"), q("0"), q("0"), q("1")],
      [q("0")],
      { lower: q("0"), upper: q("1") },
    ),
    (error) => error instanceof ExactPolynomialAreaError
      && error.code === "CURVE_DEGREE_TOO_HIGH"
      && error.unsupported,
  );
  assert.equal(Object.isFrozen(AREA_BOUND_MODES), true);
  assert.throws(() => AREA_BOUND_MODES.push("evil"), TypeError);
});

test("分数係数・分数区間と曲線交換不変性を厳密に保つ", () => {
  const first = explicit("x/2+1/3", "-x/3", "-1/2", "3/2");
  const second = explicit("-x/3", "x/2+1/3", "-1/2", "3/2");
  assert.equal(first.exact, second.exact);
  assert.ok(first.pieces.length >= 1);
  assert.equal(first.pieces.every(({ area }) => (
    area.rationalPart.numerator >= 0n || !area.radicalPart.isZero()
  )), true);
});
