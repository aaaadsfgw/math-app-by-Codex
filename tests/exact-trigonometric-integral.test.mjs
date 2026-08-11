import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactTrigonometricIntegralError,
  MAX_TRIGONOMETRIC_TERMS,
  analyzeExactTrigonometricIntegrand,
  evaluateExactTrigonometricIntegral,
  formatExactElementarySum,
} from "../js/math-core/exact-trigonometric-integral.js";
import { ExactRational } from "../js/math-core/exact-rational.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";

function ast(source) {
  return parseMathExpression(source, { symbols: ["x"] }).ast;
}

function rational(source) {
  if (String(source).includes("/")) {
    const [numerator, denominator] = String(source).split("/");
    return new ExactRational(BigInt(numerator), BigInt(denominator));
  }
  return ExactRational.parse(source);
}

function assertTrigError(source, code, unsupported) {
  assert.throws(
    () => evaluateExactTrigonometricIntegral(ast(source), rational("0"), rational("1")),
    (error) => (
      error instanceof ExactTrigonometricIntegralError
      && error.code === code
      && error.unsupported === unsupported
    ),
    source,
  );
}

test("多項式・exp・affine sin/cosを型付き有限和へ分解する", () => {
  const analyzed = analyzeExactTrigonometricIntegrand(
    ast("x^2+2exp(3x-1)-3sin(-2x+1)+(1/2)*cos(x/3-2)"),
  );

  assert.deepEqual(analyzed.polynomial.map(String), ["0", "0", "1"]);
  assert.deepEqual(
    analyzed.exponentials.map(({ amplitude, slope, intercept }) => ({
      amplitude: String(amplitude),
      slope: String(slope),
      intercept: String(intercept),
    })),
    [{ amplitude: "2", slope: "3", intercept: "-1" }],
  );
  assert.deepEqual(
    analyzed.trigonometric.map(({ functionName, amplitude, slope, intercept }) => ({
      functionName,
      amplitude: String(amplitude),
      slope: String(slope),
      intercept: String(intercept),
    })),
    [
      { functionName: "sin", amplitude: "-3", slope: "-2", intercept: "1" },
      { functionName: "cos", amplitude: "1/2", slope: "1/3", intercept: "-2" },
    ],
  );
  assert.equal(Object.isFrozen(analyzed), true);
  assert.equal(Object.isFrozen(analyzed.trigonometric), true);
  assert.equal(Object.isFrozen(analyzed.trigonometric[0]), true);
});

test("有理端点atomを奇偶性と0特殊値だけで厳密に正規化する", () => {
  const evaluated = evaluateExactTrigonometricIntegral(
    ast("sin(x)+sin(-x)+cos(x)+cos(-x)+3sin(0)+2cos(0)"),
    rational("-1"),
    rational("1"),
  );

  assert.equal(evaluated.exact, "4+4*sin(1)");
  assert.deepEqual(
    evaluated.value.terms.map(({ kind, argument, coefficient }) => ({
      kind,
      argument: argument ? String(argument) : null,
      coefficient: String(coefficient),
    })),
    [
      { kind: "rational", argument: null, coefficient: "4" },
      { kind: "sin", argument: "1", coefficient: "4" },
    ],
  );
  assert.match(evaluated.antiderivative, /sin|cos/u);
});

test("正負・関数種・引数降順のcanonical順を固定する", () => {
  const evaluated = evaluateExactTrigonometricIntegral(
    ast("exp(2x)+cos(2x)+sin(3x)"),
    rational("0"),
    rational("1"),
  );
  assert.equal(evaluated.exact, "exp(2)/2+sin(2)/2-1/6-cos(3)/3");
  assert.deepEqual(
    evaluated.value.terms.map(({ kind }) => kind),
    ["exp", "sin", "rational", "cos"],
  );
});

test("非零傾斜の端点atomと定数関数由来atomを同じmapで相殺する", () => {
  for (const source of [
    "cos(x)-sin(1)",
    "sin(x)+cos(1)-1",
  ]) {
    const evaluated = evaluateExactTrigonometricIntegral(
      ast(source),
      rational("0"),
      rational("1"),
    );
    assert.equal(evaluated.exact, "0", source);
    assert.deepEqual(evaluated.value.terms, [], source);
  }
});

test("sin・cosそれぞれの項数上限を合算前の境界で適用する", () => {
  const sineTerms = Array.from(
    { length: MAX_TRIGONOMETRIC_TERMS },
    (_, index) => `sin(x+${index})`,
  );
  const cosineTerms = Array.from(
    { length: MAX_TRIGONOMETRIC_TERMS },
    (_, index) => `cos(x+${index})`,
  );
  const withinLimit = [...sineTerms, ...cosineTerms].join("+");

  assert.equal(
    analyzeExactTrigonometricIntegrand(ast(withinLimit)).trigonometric.length,
    MAX_TRIGONOMETRIC_TERMS * 2,
  );
  assertTrigError(
    `${sineTerms.join("+")}+sin(x+${MAX_TRIGONOMETRIC_TERMS})`,
    "TOO_MANY_TRIGONOMETRIC_TERMS",
    true,
  );
  assertTrigError(
    `${cosineTerms.join("+")}+cos(x+${MAX_TRIGONOMETRIC_TERMS})`,
    "TOO_MANY_TRIGONOMETRIC_TERMS",
    true,
  );
});

test("非線形・積・変数分母・0除算をformal atomへ通さない", () => {
  assertTrigError("sin(x^2)", "NON_AFFINE_ARGUMENT", true);
  assertTrigError("sin(x)*cos(x)", "UNSUPPORTED_PRODUCT", true);
  assertTrigError("sin(x)/(x+1)", "VARIABLE_DENOMINATOR", true);
  assert.throws(
    () => evaluateExactTrigonometricIntegral(ast("sin(x)/0"), rational("0"), rational("1")),
    (error) => error?.code === "DIVISION_BY_ZERO" && error.unsupported === false,
  );

  for (const source of [
    "0*sin(1/x)",
    "sin(1/x)-sin(1/x)",
    "sin(x)^0",
    "0/sin(x)",
  ]) {
    assert.throws(
      () => evaluateExactTrigonometricIntegral(ast(source), rational("0"), rational("0")),
      (error) => error?.unsupported === true,
      source,
    );
  }
});

test("公開APIは厳密分数境界と型付きformal sum以外を拒否する", () => {
  assert.throws(
    () => evaluateExactTrigonometricIntegral(ast("sin(x)"), 0, rational("1")),
    TypeError,
  );
  assert.throws(() => formatExactElementarySum(null), TypeError);
  assert.throws(() => formatExactElementarySum({ terms: null }), TypeError);
  assert.equal(formatExactElementarySum({ terms: [] }), "0");
});
