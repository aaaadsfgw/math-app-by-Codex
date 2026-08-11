import assert from "node:assert/strict";
import test from "node:test";

import { ExactLinearPi } from "../js/math-core/exact-linear-pi.js";
import {
  ExactPiTrigonometricIntegralError,
  MAX_PI_TRIGONOMETRIC_TERMS,
  analyzeExactPiTrigonometricIntegrand,
  evaluateExactPiTrigonometricIntegral,
  formatExactPiElementarySum,
} from "../js/math-core/exact-pi-trigonometric-integral.js";
import { ExactRational } from "../js/math-core/exact-rational.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";

function ast(source) {
  return parseMathExpression(source, { symbols: ["x"] }).ast;
}

function rational(numerator, denominator = 1n) {
  return new ExactRational(BigInt(numerator), BigInt(denominator));
}

function angle(numerator, denominator = 1n) {
  return new ExactLinearPi(
    ExactRational.zero(),
    rational(numerator, denominator),
  );
}

function summarizeTerm(term) {
  return {
    functionName: term.functionName,
    amplitude: String(term.amplitude),
    slope: String(term.slope),
    intercept: String(term.intercept),
  };
}

function assertPiError(source, code, unsupported = true) {
  assert.throws(
    () => analyzeExactPiTrigonometricIntegrand(ast(source)),
    (error) => (
      error instanceof ExactPiTrigonometricIntegralError
      && error.code === code
      && error.unsupported === unsupported
    ),
    source,
  );
}

test("pi角sin/cosを有理振幅・有理傾斜・pure-pi切片へ厳密に分解する", () => {
  const analyzed = analyzeExactPiTrigonometricIntegrand(
    ast("(1/2)*sin(2*x+pi/3)-3*cos((-1/2)*x-pi/4)"),
  );

  assert.deepEqual(analyzed.trigonometric.map(summarizeTerm), [
    {
      functionName: "sin",
      amplitude: "1/2",
      slope: "2",
      intercept: "pi/3",
    },
    {
      functionName: "cos",
      amplitude: "-3",
      slope: "-1/2",
      intercept: "-pi/4",
    },
  ]);
  assert.equal(Object.isFrozen(analyzed), true);
  assert.equal(Object.isFrozen(analyzed.trigonometric), true);
  assert.equal(Object.isFrozen(analyzed.trigonometric[0]), true);

  assertPiError("sin(x+1)", "MIXED_RADIAN_PI_PHASE");
  assertPiError("sin(pi*x)", "NON_RATIONAL_PI_SLOPE");
  assertPiError("sin(x/pi)", "NON_RATIONAL_PHASE_DENOMINATOR");
});

test("15度・75度のsin/cosをsqrt(6)±sqrt(2)へexact展開する", () => {
  for (const [source, lower, upper, expected] of [
    ["cos(x)", angle(0), angle(1, 12), "√6/4-√2/4"],
    ["cos(x)", angle(0), angle(5, 12), "√6/4+√2/4"],
    ["sin(x)", angle(0), angle(1, 12), "1-√6/4-√2/4"],
    ["sin(x)", angle(0), angle(5, 12), "1+√2/4-√6/4"],
    ["sin(pi/12)", angle(0), angle(1), "pi*√6/4-pi*√2/4"],
    ["cos(pi/12)", angle(0), angle(1), "pi*√6/4+pi*√2/4"],
    ["cos(5*pi/12)", angle(0), angle(1), "pi*√6/4-pi*√2/4"],
  ]) {
    const evaluated = evaluateExactPiTrigonometricIntegral(
      ast(source),
      lower,
      upper,
    );
    assert.equal(evaluated.exact, expected, source);
    assert.equal(formatExactPiElementarySum(evaluated.value), expected, source);
    assert.equal(Object.isFrozen(evaluated), true, source);
    assert.equal(Object.isFrozen(evaluated.value), true, source);
    assert.equal(Object.isFrozen(evaluated.value.terms), true, source);
    assert.ok(evaluated.value.terms.every(Object.isFrozen), source);
  }
});

test("非標準角を浮動小数なしで周期・象限canonicalへ正規化する", () => {
  for (const [source, lower, upper, expected] of [
    ["cos(x)", angle(2), angle(11, 5), "sin(pi/5)"],
    ["cos(x)", angle(0), angle(6, 5), "-sin(pi/5)"],
    ["sin(x)", angle(0), angle(4, 5), "1+cos(pi/5)"],
    ["sin(x)", angle(0), angle(14, 5), "1+cos(pi/5)"],
    ["cos(-pi/5)", angle(0), angle(1), "pi*cos(pi/5)"],
    ["sin(11*pi/5)", angle(0), angle(1), "pi*sin(pi/5)"],
  ]) {
    const evaluated = evaluateExactPiTrigonometricIntegral(
      ast(source),
      lower,
      upper,
    );
    assert.equal(evaluated.exact, expected, source);
  }
});

test("formatterはscalar・formal atom・pi basisを固定順で直列化する", () => {
  const evaluated = evaluateExactPiTrigonometricIntegral(
    ast("cos(x)+sin(x)+cos(pi/5)+sin(pi/5)"),
    angle(0),
    angle(1, 5),
  );

  assert.equal(
    formatExactPiElementarySum(evaluated.value),
    "1+sin(pi/5)+pi*sin(pi/5)/5+pi*cos(pi/5)/5-cos(pi/5)",
  );
  assert.deepEqual(
    evaluated.value.terms.map((term) => ({
      kind: term.kind,
      argument: term.argument ? String(term.argument) : null,
      piPower: term.piPower,
      radicand: term.radicand,
      coefficient: String(term.coefficient),
    })),
    [
      { kind: "scalar", argument: null, piPower: 0, radicand: 1, coefficient: "1" },
      { kind: "sin", argument: "pi/5", piPower: 0, radicand: 1, coefficient: "1" },
      { kind: "sin", argument: "pi/5", piPower: 1, radicand: 1, coefficient: "1/5" },
      { kind: "cos", argument: "pi/5", piPower: 1, radicand: 1, coefficient: "1/5" },
      { kind: "cos", argument: "pi/5", piPower: 0, radicand: 1, coefficient: "-1" },
    ],
  );
});

test("sin・cosをそれぞれ32項まで受理し33項目を安全に拒否する", () => {
  const sines = Array.from(
    { length: MAX_PI_TRIGONOMETRIC_TERMS },
    () => "sin(x)",
  );
  const cosines = Array.from(
    { length: MAX_PI_TRIGONOMETRIC_TERMS },
    () => "cos(x)",
  );
  const withinLimit = [...sines, ...cosines].join("+");

  const analyzed = analyzeExactPiTrigonometricIntegrand(ast(withinLimit));
  assert.equal(analyzed.trigonometric.length, 2 * MAX_PI_TRIGONOMETRIC_TERMS);
  assert.equal(
    analyzed.trigonometric.filter(({ functionName }) => functionName === "sin").length,
    MAX_PI_TRIGONOMETRIC_TERMS,
  );
  assert.equal(
    analyzed.trigonometric.filter(({ functionName }) => functionName === "cos").length,
    MAX_PI_TRIGONOMETRIC_TERMS,
  );

  assertPiError(
    `${withinLimit}+sin(x)`,
    "TOO_MANY_PI_TRIGONOMETRIC_TERMS",
  );
  assertPiError(
    `${withinLimit}+cos(x)`,
    "TOO_MANY_PI_TRIGONOMETRIC_TERMS",
  );
});

test("zero・相殺・同一境界でも全AST検証後にだけ0を返す", () => {
  for (const source of [
    "sin(x)+sin(-x)",
    "cos(x)-cos(-x)",
    "sin(x+2*pi)-sin(x)",
    "cos(x+2*pi)-cos(x)",
    "0*sin(x)+0*cos(pi/7)",
  ]) {
    const evaluated = evaluateExactPiTrigonometricIntegral(
      ast(source),
      angle(0),
      angle(1),
    );
    assert.equal(evaluated.exact, "0", source);
    assert.deepEqual(evaluated.value.terms, [], source);
  }

  const equalBounds = evaluateExactPiTrigonometricIntegral(
    ast("sin(3*x+pi/7)+cos(-2*x+pi/5)"),
    angle(13, 17),
    angle(13, 17),
  );
  assert.equal(equalBounds.exact, "0");

  for (const source of [
    "0*sin(x^2)",
    "sin(x^2)-sin(x^2)",
    "0/sin(x)",
    "sin(x)^0",
  ]) {
    assert.throws(
      () => evaluateExactPiTrigonometricIntegral(
        ast(source),
        angle(2, 7),
        angle(2, 7),
      ),
      (error) => error instanceof ExactPiTrigonometricIntegralError
        && error.unsupported === true,
      source,
    );
  }

  assert.throws(
    () => evaluateExactPiTrigonometricIntegral(
      ast("sin(x)/0"),
      angle(1, 3),
      angle(1, 3),
    ),
    (error) => error instanceof ExactPiTrigonometricIntegralError
      && error.code === "DIVISION_BY_ZERO"
      && error.unsupported === false,
  );
});

test("公開APIはpure-pi境界とpi formal sum以外を拒否する", () => {
  const source = ast("sin(x)");
  assert.throws(
    () => evaluateExactPiTrigonometricIntegral(source, rational(0), angle(1)),
    TypeError,
  );
  assert.throws(
    () => evaluateExactPiTrigonometricIntegral(
      source,
      new ExactLinearPi(rational(1), rational(1)),
      angle(1),
    ),
    TypeError,
  );
  assert.throws(
    () => evaluateExactPiTrigonometricIntegral(source, angle(0), {}),
    TypeError,
  );
  assert.throws(() => formatExactPiElementarySum(null), TypeError);
  assert.throws(() => formatExactPiElementarySum({ terms: null }), TypeError);
  assert.equal(formatExactPiElementarySum({ terms: [] }), "0");
});
