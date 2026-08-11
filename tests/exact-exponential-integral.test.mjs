import assert from "node:assert/strict";
import test from "node:test";

import {
  ExactExponentialIntegralError,
  MAX_EXPONENTIAL_TERMS,
  analyzeExactExponentialIntegrand,
  evaluateExactExponentialIntegral,
  formatExactExponentialSum,
} from "../js/math-core/exact-exponential-integral.js";
import { ExactPolynomialIntegralError } from "../js/math-core/exact-polynomial-integral.js";
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

function assertIntegralError(source, ErrorType, code, unsupported) {
  assert.throws(
    () => evaluateExactExponentialIntegral(ast(source), rational("0"), rational("1")),
    (error) => (
      error instanceof ErrorType
      && error.code === code
      && error.unsupported === unsupported
    ),
    source,
  );
}

test("多項式と有理係数の一次指数項を型付き内部表現へ分解する", () => {
  const analyzed = analyzeExactExponentialIntegrand(
    ast("x^2+2exp(3x-1)-exp(-x+2)+5"),
  );

  assert.deepEqual(analyzed.polynomial.map(String), ["5", "0", "1"]);
  assert.deepEqual(
    analyzed.exponentials.map(({ amplitude, slope, intercept }) => ({
      amplitude: String(amplitude),
      slope: String(slope),
      intercept: String(intercept),
    })),
    [
      { amplitude: "2", slope: "3", intercept: "-1" },
      { amplitude: "-1", slope: "-1", intercept: "2" },
    ],
  );
  assert.equal(Object.isFrozen(analyzed), true);
  assert.equal(Object.isFrozen(analyzed.polynomial), true);
  assert.equal(Object.isFrozen(analyzed.exponentials), true);
  assert.equal(Object.isFrozen(analyzed.exponentials[0]), true);
});

test("同じ有理指数の係数を厳密にまとめ、0指数を有理定数へ統合する", () => {
  const evaluated = evaluateExactExponentialIntegral(
    ast("exp(x)+2exp(x)+3exp(0)-x"),
    rational("0"),
    rational("1"),
  );

  assert.equal(evaluated.exact, "3*exp(1)-1/2");
  assert.deepEqual(
    evaluated.value.terms.map(({ exponent, coefficient }) => ({
      exponent: String(exponent),
      coefficient: String(coefficient),
    })),
    [
      { exponent: "1", coefficient: "3" },
      { exponent: "0", coefficient: "-1/2" },
    ],
  );
  assert.match(evaluated.antiderivative, /exp\(x\)/u);
});

test("逆順・同一端・e累乗aliasを同じ原始関数差で評価する", () => {
  const forward = evaluateExactExponentialIntegral(
    ast("2e^(2x+1)"),
    rational("0"),
    rational("1"),
  );
  const reverse = evaluateExactExponentialIntegral(
    ast("2e^(2x+1)"),
    rational("1"),
    rational("0"),
  );
  const equal = evaluateExactExponentialIntegral(
    ast("exp(x^1)-exp(x)"),
    rational("7/3"),
    rational("7/3"),
  );

  assert.equal(forward.exact, "exp(3)-exp(1)");
  assert.equal(reverse.exact, "exp(1)-exp(3)");
  assert.equal(equal.exact, "0");
  assert.deepEqual(equal.value.terms, []);
});

test("指数項数上限を境界で適用し、相殺を理由に上限を迂回しない", () => {
  const withinLimit = Array.from(
    { length: MAX_EXPONENTIAL_TERMS },
    (_, index) => `exp(x+${index})`,
  ).join("+");
  const overLimit = `${withinLimit}+exp(x+${MAX_EXPONENTIAL_TERMS})`;

  assert.equal(
    analyzeExactExponentialIntegrand(ast(withinLimit)).exponentials.length,
    MAX_EXPONENTIAL_TERMS,
  );
  assertIntegralError(
    overLimit,
    ExactExponentialIntegralError,
    "TOO_MANY_EXPONENTIAL_TERMS",
    true,
  );
});

test("非線形指数・指数関数積・変数分母・次数超過をexact結果へ通さない", () => {
  assertIntegralError(
    "exp(x^2)",
    ExactExponentialIntegralError,
    "NON_AFFINE_EXPONENT",
    true,
  );
  assertIntegralError(
    "x*exp(x)",
    ExactExponentialIntegralError,
    "UNSUPPORTED_PRODUCT",
    true,
  );
  assertIntegralError(
    "exp(x)/(x+1)",
    ExactExponentialIntegralError,
    "VARIABLE_DENOMINATOR",
    true,
  );
  assertIntegralError(
    "exp(x)/0",
    ExactExponentialIntegralError,
    "DIVISION_BY_ZERO",
    false,
  );
  assertIntegralError(
    "exp(x)+x^33",
    ExactPolynomialIntegralError,
    "DEGREE_TOO_HIGH",
    true,
  );
});

test("公開APIは厳密分数境界と厳密指数和以外を拒否する", () => {
  assert.throws(
    () => evaluateExactExponentialIntegral(ast("exp(x)"), 0, rational("1")),
    TypeError,
  );
  assert.throws(() => formatExactExponentialSum(null), TypeError);
  assert.throws(() => formatExactExponentialSum({ terms: null }), TypeError);
  assert.equal(formatExactExponentialSum({ terms: [] }), "0");
});
