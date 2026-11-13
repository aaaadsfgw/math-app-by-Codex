import assert from "node:assert/strict";
import test from "node:test";
import { ExactRational } from "../../js/math-core/exact-rational.js";
import { createMathAdapter, defaultMath as math } from "../../js/geometry/math-adapter/index.js";

const { parse, format, add, sub, mul, div, sqrt, pow, compare, pi } = math;
const unsupported = { code: "GEOMETRY_UNSUPPORTED" };

test("geometry arithmetic retains exact rational fractions and accepts the shared rational type", () => {
  const first = parse(new ExactRational(2n, 3n));
  const second = parse("０．２５");
  assert.equal(format(add(first, second)), "11/12");
  assert.equal(format(sub(first, second)), "5/12");
  assert.equal(format(mul(first, second)), "1/6");
  assert.equal(format(div(first, second)), "8/3");
  assert.equal(format(pow(first, -2)), "9/4");
  assert.equal(format(parse("0.1+0.2")), "3/10");
  assert.equal(format(parse(1e-7)), "1/10000000");
  assert.equal(compare(parse(123n), parse("123.00")), 0);
  assert.equal(compare(first, second), 1);
});

test("geometry square roots are simplified and verified without rounding", () => {
  const value = sqrt(parse("2/3"));
  assert.equal(format(value), "1/3*√6");
  assert.equal(compare(pow(value, 2), parse("2/3")), 0);
  assert.equal(format(sqrt(parse("12"))), "2*√3");
  assert.equal(format(sqrt(parse("81/121"))), "9/11");
  assert.equal(format(sqrt(parse("0"))), "0");
  assert.equal(format(parse("sqrt(8)+sqrt(18)-5*sqrt(2)")), "0");
});

test("geometry arithmetic supports products of independent radicals and rationalizes bounded denominators", () => {
  assert.equal(format(parse("(sqrt(2)+sqrt(3))^2")), "5+2*√6");
  assert.equal(format(div(parse(1), parse("1+sqrt(2)"))), "-1+√2");
  assert.equal(format(div(parse("sqrt(6)"), parse("sqrt(2)"))), "√3");
  assert.equal(compare(parse("2sqrt(2)"), parse("sqrt(7)")), 1);
  assert.equal(compare(parse("sqrt(2)+sqrt(3)"), parse("3")), 1);
  assert.equal(compare(parse("sqrt(2)+sqrt(3)"), parse("16/5")), -1);
});

test("geometry retains exact pi for circles and for cone lateral areas", () => {
  const lateral = mul(mul(parse(5), sqrt(parse(34))), pi);
  const surface = add(mul(parse(25), pi), lateral);
  assert.equal(format(surface), "25*π+5*√34*π");
  assert.equal(compare(surface, parse(format(surface))), 0);
  assert.equal(compare(pi, parse("22/7")), -1);
  assert.equal(compare(pi, parse("3.1415926")), 1);
  assert.equal(compare(parse("sqrt(2)*pi"), parse("4")), 1);
  assert.equal(compare(parse("2*pi+1"), parse("1+pi+pi")), 0);
  assert.equal(format(div(parse("3π"), pi)), "3");
});

test("geometry adapter delegates linear equations to the verified existing solver", () => {
  assert.equal(format(math.solveLinear(parse(6), parse(0), parse(72))), "12");
  assert.equal(format(math.solveLinear(parse("1/3"), parse("-1/2"), parse("2/5"))), "27/10");
  assert.throws(() => math.solveLinear(parse(0), parse(2), parse(2)), unsupported);
  assert.throws(() => math.solveLinear(parse(0), parse(1), parse(2)), unsupported);
});

test("geometry adapter reuses existing quadratic and system verification", () => {
  const roots = math.solveQuadratic(parse(1), parse(-2), parse(-1));
  assert.deepEqual(roots.map(format), ["1-√2", "1+√2"]);
  assert.equal(Object.isFrozen(roots), true);
  for (const root of roots) {
    assert.equal(format(sub(sub(pow(root, 2), mul(parse(2), root)), parse(1))), "0");
  }
  assert.deepEqual(math.solveQuadratic(parse(1), parse(0), parse(1)), []);
  const { x, y } = math.solveSystem([parse(2), parse(3), parse(7)], [parse(1), parse(-1), parse(0)]);
  assert.equal(format(x), "7/5");
  assert.equal(format(y), "7/5");
  assert.throws(() => math.solveSystem(
    [parse(1), parse(1), parse(2)], [parse(2), parse(2), parse(4)],
  ), unsupported);
});

test("geometry keeps typed values immutable and declines unsupported comparisons and operations", () => {
  const adapter = createMathAdapter();
  const rational = adapter.parse("1/3");
  assert.equal(Object.isFrozen(rational), true);
  assert.equal(Object.isFrozen(rational[0]), true);
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(format(rational), "1/3");
  for (const expression of [
    "1/0", "0^0", "x", "sin(1)", "sqrt(-1)", "sqrt(1+sqrt(2))",
    "pi^2", "1/pi", "2^(1/2)", "1/2π", "1/2√3",
  ]) {
    assert.throws(() => parse(expression), unsupported, expression);
  }
  assert.throws(() => parse(Number.MAX_SAFE_INTEGER + 1), unsupported);
  assert.throws(() => mul([{ radicand: 2n, coefficient: 1 }], pi), unsupported);
  assert.throws(() => compare(pi, parse("3.1415926535897932384626433832795028841971693993751058209749445")), unsupported);
});
