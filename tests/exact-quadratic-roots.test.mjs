import test from "node:test";
import assert from "node:assert/strict";

import {
  analyzeExactQuadraticRoots,
  evaluateExactPolynomialAtQuadraticRoot,
  integerSquareRoot,
  verifyExactQuadraticRoot,
} from "../js/math-core/exact-quadratic-roots.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

function coefficients(c, b, a) {
  return [c, b, a].map((value) => ExactRational.parse(value));
}

test("有理係数の二次式を整数比へ直し、根を厳密に検算する", () => {
  const analysis = analyzeExactQuadraticRoots(coefficients("6", "-5", "1"));
  assert.deepEqual(analysis.integerCoefficients, [6n, -5n, 1n]);
  assert.equal(analysis.discriminant, 1n);
  assert.equal(analysis.rootKind, "two-real");
  assert.deepEqual(analysis.roots.map((root) => root.exact), ["2", "3"]);
  assert.ok(analysis.roots.every((root) => (
    verifyExactQuadraticRoot(analysis.integerCoefficients, root)
  )));
});

test("有限小数・分数係数の無理数解を簡約根号で保持する", () => {
  const decimal = analyzeExactQuadraticRoots(coefficients("-1", "0", "0.5"));
  assert.deepEqual(decimal.integerCoefficients, [-2n, 0n, 1n]);
  assert.deepEqual(decimal.roots.map((root) => root.exact), ["-√2", "√2"]);

  const fraction = analyzeExactQuadraticRoots([
    new ExactRational(-1n, 3n),
    ExactRational.zero(),
    new ExactRational(1n, 2n),
  ]);
  assert.deepEqual(fraction.roots.map((root) => root.exact), ["-√6/3", "√6/3"]);
  assert.ok(fraction.roots.every((root) => (
    verifyExactQuadraticRoot(fraction.integerCoefficients, root)
  )));
});

test("判別式が0付近でも浮動小数の許容誤差で根を潰さない", () => {
  const positive = analyzeExactQuadraticRoots(
    coefficients("0.99999999999999999999", "-2", "1"),
  );
  assert.equal(positive.discriminant, 400000000000000000000n);
  assert.deepEqual(
    positive.roots.map((root) => root.exact),
    ["9999999999/10000000000", "10000000001/10000000000"],
  );

  const negative = analyzeExactQuadraticRoots(
    coefficients("1.00000000000000000001", "-2", "1"),
  );
  assert.equal(negative.rootKind, "no-real");
  assert.equal(negative.discriminant, -400000000000000000000n);
  assert.deepEqual(negative.roots, []);
});

test("巨大係数・桁落ち・巨大平方根をBigIntで処理する", () => {
  const cancellation = analyzeExactQuadraticRoots(
    coefficients("999999999999999999", "-2000000000", "1"),
  );
  assert.deepEqual(
    cancellation.roots.map((root) => root.exact),
    ["999999999", "1000000001"],
  );

  const irrational = analyzeExactQuadraticRoots(
    coefficients(
      "9999999999999999999999999999999999999998",
      "-200000000000000000000",
      "1",
    ),
  );
  assert.deepEqual(
    irrational.roots.map((root) => root.exact),
    [
      "100000000000000000000-√2",
      "100000000000000000000+√2",
    ],
  );

  const hugeRoot = 10n ** 100n + 123n;
  assert.equal(integerSquareRoot(hugeRoot * hugeRoot), hugeRoot);
  assert.equal(integerSquareRoot(hugeRoot * hugeRoot - 1n), hugeRoot - 1n);
});

test("二次でない式・上限超過係数・改変した根を受理しない", () => {
  assert.throws(
    () => analyzeExactQuadraticRoots(coefficients("1", "2", "0")),
    /二次式ではありません/,
  );
  assert.throws(
    () => analyzeExactQuadraticRoots(
      coefficients("1", "0", `1${"0".repeat(101)}`),
    ),
    /係数が大きすぎます/,
  );

  const analysis = analyzeExactQuadraticRoots(coefficients("-2", "0", "1"));
  assert.equal(verifyExactQuadraticRoot(
    analysis.integerCoefficients,
    { ...analysis.roots[0], radicalCoefficient: -2n },
  ), false);
});

test("二次根へ任意の有界多項式を有理部・根号部に分けて代入する", () => {
  const analysis = analyzeExactQuadraticRoots(coefficients("-2", "0", "1"));
  for (const root of analysis.roots) {
    const zero = evaluateExactPolynomialAtQuadraticRoot(
      coefficients("-2", "0", "1"),
      root,
    );
    assert.equal(zero.isZero, true);
    assert.equal(zero.rationalPart.toString(), "0");
    assert.equal(zero.radicalPart.toString(), "0");

    const nonzero = evaluateExactPolynomialAtQuadraticRoot(
      coefficients("-1", "1", "0"),
      root,
    );
    assert.equal(nonzero.isZero, false);
  }
});
