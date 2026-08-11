import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactLinearPi,
  ExactLinearPiError,
  exactLinearPiConstantFromAst,
  exactPiMultipleFromAst,
} from "../js/math-core/exact-linear-pi.js";
import { ExactRational } from "../js/math-core/exact-rational.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";

function rational(value) {
  const source = String(value);
  if (source.includes("/")) {
    const [numerator, denominator] = source.split("/");
    return new ExactRational(BigInt(numerator), BigInt(denominator));
  }
  return ExactRational.parse(source);
}

function ast(source, symbols = []) {
  return parseMathExpression(source, { symbols }).ast;
}

function linear(rationalPart, piCoefficient) {
  return new ExactLinearPi(rational(rationalPart), rational(piCoefficient));
}

function assertUnsupported(source, code) {
  assert.throws(
    () => exactLinearPiConstantFromAst(ast(source, ["x"])),
    (error) => (
      error instanceof ExactLinearPiError
      && error.code === code
      && error.unsupported === true
    ),
    source,
  );
}

test("Q+Q*piを不変な厳密分数対として保持し基本演算する", () => {
  const left = linear("1", "1/2");
  const right = linear("-3/2", "1/2");

  assert.equal(Object.isFrozen(left), true);
  assert.deepEqual(left.add(right), linear("-1/2", "1"));
  assert.deepEqual(left.subtract(right), linear("5/2", "0"));
  assert.deepEqual(left.negate(), linear("-1", "-1/2"));
  assert.deepEqual(left.scale(rational("-2")), linear("-2", "-1"));
  assert.equal(left.equals(linear("1", "1/2")), true);
  assert.equal(left.equals(right), false);
  assert.equal(left.equals(null), false);
  assert.equal(left.key(), "r:1|pi:1/2");

  assert.throws(() => new ExactLinearPi(1, rational("0")), TypeError);
  assert.throws(() => left.add(rational("1")), TypeError);
  assert.throws(() => left.scale(2), TypeError);
});

test("0・有理数・純pi倍を型述語で重なりなく失わず区別する", () => {
  const zero = linear("0", "0");
  assert.equal(zero.isZero(), true);
  assert.equal(zero.isRational(), true);
  assert.equal(zero.isPurePi(), true);

  const rationalOnly = linear("2/3", "0");
  assert.equal(rationalOnly.isZero(), false);
  assert.equal(rationalOnly.isRational(), true);
  assert.equal(rationalOnly.isPurePi(), false);

  const piOnly = linear("0", "-3/4");
  assert.equal(piOnly.isZero(), false);
  assert.equal(piOnly.isRational(), false);
  assert.equal(piOnly.isPurePi(), true);

  const mixed = linear("1", "1");
  assert.equal(mixed.isZero(), false);
  assert.equal(mixed.isRational(), false);
  assert.equal(mixed.isPurePi(), false);
});

test("Q+Q*piを曖昧さのないcanonical文字列へ整形する", () => {
  for (const [value, expected] of [
    [linear("0", "0"), "0"],
    [linear("-2/3", "0"), "-2/3"],
    [linear("0", "1"), "pi"],
    [linear("0", "-1"), "-pi"],
    [linear("0", "1/2"), "pi/2"],
    [linear("0", "-1/2"), "-pi/2"],
    [linear("0", "3/4"), "3*pi/4"],
    [linear("0", "-3/4"), "-3*pi/4"],
    [linear("0", "3"), "3*pi"],
    [linear("1", "1/2"), "1+pi/2"],
    [linear("1", "-1/2"), "1-pi/2"],
    [linear("-1", "1"), "-1+pi"],
  ]) {
    assert.equal(value.toString(), expected);
  }
});

test("ASTからQ+Q*piの加減と有理数による乗除を厳密に構成する", () => {
  for (const [source, expected] of [
    ["pi", "pi"],
    ["-pi/2", "-pi/2"],
    ["3pi/4", "3*pi/4"],
    ["1+pi/2", "1+pi/2"],
    ["(1/2)*(2+3pi)-1", "3*pi/2"],
    ["(pi-1)/(-2)", "1/2-pi/2"],
    ["pi^0", "1"],
    ["pi^1", "pi"],
    ["2^(-3)+pi", "1/8+pi"],
    ["0*pi", "0"],
    ["pi-pi", "0"],
  ]) {
    assert.equal(exactLinearPiConstantFromAst(ast(source)).toString(), expected, source);
  }
});

test("pure q*piだけをpi倍APIへ通し混合値を拒否する", () => {
  for (const [source, expected] of [
    ["pi", "pi"],
    ["pi/2", "pi/2"],
    ["-3*pi/4", "-3*pi/4"],
    ["0", "0"],
    ["pi-pi", "0"],
  ]) {
    assert.equal(exactPiMultipleFromAst(ast(source)).toString(), expected, source);
  }
  assert.throws(
    () => exactPiMultipleFromAst(ast("1+pi/2")),
    (error) => (
      error instanceof ExactLinearPiError
      && error.code === "NOT_PI_MULTIPLE"
      && error.unsupported === true
    ),
  );
});

test("piの非線形積・分母・高次冪と未対応要素を型付きunsupportedにする", () => {
  for (const [source, code] of [
    ["pi*pi", "NONLINEAR_PI_PRODUCT"],
    ["1/pi", "PI_IN_DENOMINATOR"],
    ["pi^2", "UNSUPPORTED_PI_POWER"],
    ["pi^-1", "UNSUPPORTED_PI_POWER"],
    ["(1+pi)^2", "UNSUPPORTED_PI_POWER"],
    ["e", "UNSUPPORTED_CONSTANT"],
    ["i", "UNSUPPORTED_CONSTANT"],
    ["sin(pi)", "UNSUPPORTED_FUNCTION"],
    ["x", "UNSUPPORTED_SYMBOL"],
  ]) {
    assertUnsupported(source, code);
  }
});

test("0倍・相殺・0乗で未対応のpi非線形部分木を隠さない", () => {
  for (const source of [
    "0*(pi*pi)",
    "(pi*pi)-(pi*pi)",
    "(pi-pi)*pi",
    "(0*pi)*pi",
    "pi*(pi-pi)",
    "pi/(pi-pi+1)",
    "(pi*pi)^0",
    "pi^(pi-pi)",
  ]) {
    assert.throws(
      () => exactLinearPiConstantFromAst(ast(source)),
      (error) => error instanceof ExactLinearPiError && error.unsupported === true,
      source,
    );
  }

  assert.equal(exactLinearPiConstantFromAst(ast("0*pi")).toString(), "0");
  assert.equal(exactLinearPiConstantFromAst(ast("pi-pi")).toString(), "0");
});

test("0除算と0の不定冪をunsupported値へ昇格しない", () => {
  for (const [source, code] of [
    ["pi/0", "DIVISION_BY_ZERO"],
    ["0^0", "ZERO_TO_ZERO"],
    ["0^-1", "ZERO_TO_NEGATIVE_POWER"],
  ]) {
    assert.throws(
      () => exactLinearPiConstantFromAst(ast(source)),
      (error) => (
        error instanceof ExactLinearPiError
        && error.code === code
        && error.unsupported === false
      ),
      source,
    );
  }
});
