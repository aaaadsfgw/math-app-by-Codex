import assert from "node:assert/strict";
import test from "node:test";

import {
  createExactQuadraticRootPoint,
  createExactRationalPoint,
  compareExactRealPoints,
  rationalSampleBetweenExactPoints,
  signOfExactPolynomialAtRationalSample,
} from "../js/math-core/exact-real-point.js";
import { analyzeExactQuadraticRoots } from "../js/math-core/exact-quadratic-roots.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

const q = (value) => {
  const [numerator, denominator] = String(value).split("/");
  return denominator
    ? new ExactRational(BigInt(numerator), BigInt(denominator))
    : ExactRational.parse(numerator);
};
const analysis = (constant, linear, quadratic) => analyzeExactQuadraticRoots([
  q(constant),
  q(linear),
  q(quadratic),
]);

test("有理端点と異なる二次無理根を浮動小数なしで全順序化する", () => {
  const sqrt2 = analysis("-2", "0", "1");
  const sqrt3 = analysis("-3", "0", "1");
  const points = [
    createExactQuadraticRootPoint(sqrt3, 1),
    createExactRationalPoint(q("3/2")),
    createExactQuadraticRootPoint(sqrt2, 0),
    createExactQuadraticRootPoint(sqrt3, 0),
    createExactRationalPoint(q("7/5")),
    createExactQuadraticRootPoint(sqrt2, 1),
  ].sort(compareExactRealPoints);
  assert.deepEqual(points.map((point) => (
    point.kind === "rational" ? point.value.toString() : point.root.exact
  )), ["-√3", "-√2", "7/5", "√2", "3/2", "√3"]);
});

test("別の二次式が共有する根を厳密に同一点と判定する", () => {
  const first = analysis("-2", "0", "1");
  const second = analysis("-4", "0", "2");
  assert.equal(compareExactRealPoints(
    createExactQuadraticRootPoint(first, 0),
    createExactQuadraticRootPoint(second, 0),
  ), 0);
  assert.equal(compareExactRealPoints(
    createExactQuadraticRootPoint(first, 1),
    createExactQuadraticRootPoint(second, 1),
  ), 0);
});

test("隣接する厳密端点の間と外側へ有理標本点を構成する", () => {
  const sqrt2 = analysis("-2", "0", "1");
  const lower = createExactQuadraticRootPoint(sqrt2, 1);
  const upper = createExactRationalPoint(q("3/2"));
  const middle = rationalSampleBetweenExactPoints(lower, upper);
  assert.equal(signOfExactPolynomialAtRationalSample([q("-2"), q("0"), q("1")], middle), 1);
  assert.equal(signOfExactPolynomialAtRationalSample([q("-3/2"), q("1")], middle), -1);

  const left = rationalSampleBetweenExactPoints(null, createExactQuadraticRootPoint(sqrt2, 0));
  const right = rationalSampleBetweenExactPoints(createExactQuadraticRootPoint(sqrt2, 1), null);
  assert.equal(signOfExactPolynomialAtRationalSample([q("-2"), q("0"), q("1")], left), 1);
  assert.equal(signOfExactPolynomialAtRationalSample([q("-2"), q("0"), q("1")], right), 1);
});

test("512桁の有理境界でも有界分数の減算へ落とさず比較する", () => {
  const sqrt2 = analysis("-2", "0", "1");
  const lower = createExactQuadraticRootPoint(sqrt2, 1);
  const boundary = createExactRationalPoint(
    new ExactRational(BigInt(`1${"0".repeat(511)}`)),
  );
  assert.equal(compareExactRealPoints(lower, boundary), -1);
  const sample = rationalSampleBetweenExactPoints(lower, boundary);
  assert.equal(signOfExactPolynomialAtRationalSample(
    [boundary.value.negate(), q("1")],
    sample,
  ), -1);
});

test("小係数から作った異なる二次根の比較は全順序と数値監査に一致する", () => {
  const points = [];
  for (let quadratic = 1; quadratic <= 4; quadratic += 1) {
    for (let linear = -7; linear <= 7; linear += 2) {
      for (let constant = -6; constant <= 6; constant += 3) {
        const current = analysis(String(constant), String(linear), String(quadratic));
        if (current.rootKind !== "two-real") continue;
        current.roots.forEach((root, index) => {
          if (root.form === "radical" && root.approximate !== null) {
            points.push(createExactQuadraticRootPoint(current, index));
          }
        });
      }
    }
  }
  const sample = points.slice(0, 180);
  for (let leftIndex = 0; leftIndex < sample.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < sample.length; rightIndex += 1) {
      const left = sample[leftIndex];
      const right = sample[rightIndex];
      const comparison = compareExactRealPoints(left, right);
      assert.equal(compareExactRealPoints(right, left), -comparison);
      const difference = left.root.approximate - right.root.approximate;
      if (Math.abs(difference) > 1e-10) {
        assert.equal(Math.sign(comparison), Math.sign(difference));
      }
    }
  }
  const sorted = [...sample].sort(compareExactRealPoints);
  for (let index = 1; index < sorted.length; index += 1) {
    assert.ok(compareExactRealPoints(sorted[index - 1], sorted[index]) <= 0);
  }
});
