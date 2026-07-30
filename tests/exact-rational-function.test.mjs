import test from "node:test";
import assert from "node:assert/strict";

import { parseMathExpression } from "../js/math-core/expression-parser.js";
import {
  ExactRationalFunctionError,
  exactRationalEquationPolynomial,
  exactRationalFunctionFromAst,
  formatExactRationalPolynomial,
} from "../js/math-core/exact-rational-function.js";

function reduce(expression) {
  return exactRationalFunctionFromAst(
    parseMathExpression(expression, { symbols: ["x"] }).ast,
  );
}

function polynomialText(polynomial) {
  return polynomial.map(String);
}

test("有理式を厳密な分子・分母・消えない定義域因子へ還元する", () => {
  const reduced = reduce("(x^2-1)/(x-1)");
  assert.deepEqual(polynomialText(reduced.numerator), ["-1", "0", "1"]);
  assert.deepEqual(polynomialText(reduced.denominator), ["-1", "1"]);
  assert.deepEqual(
    reduced.domainFactors.map(polynomialText),
    [["-1", "1"]],
  );
  assert.equal(reduced.hasVariableDenominator, true);
});

test("入れ子除算・0倍・負指数でも元の穴を失わない", () => {
  const nested = reduce("1/(1/(x-1))");
  assert.deepEqual(polynomialText(nested.numerator), ["-1", "1"]);
  assert.deepEqual(polynomialText(nested.denominator), ["1"]);
  assert.deepEqual(nested.domainFactors.map(polynomialText), [["-1", "1"]]);

  const cancelled = reduce("0*(1/(x-1))");
  assert.deepEqual(polynomialText(cancelled.numerator), ["0"]);
  assert.deepEqual(cancelled.domainFactors.map(polynomialText), [["-1", "1"]]);

  const negativePower = reduce("(x-1)^-2");
  assert.deepEqual(polynomialText(negativePower.numerator), ["1"]);
  assert.deepEqual(polynomialText(negativePower.denominator), ["1", "-2", "1"]);
  assert.deepEqual(negativePower.domainFactors.map(polynomialText), [["-1", "1"]]);

  const zeroPower = reduce("(x-1)^0");
  assert.deepEqual(polynomialText(zeroPower.numerator), ["1"]);
  assert.deepEqual(zeroPower.domainFactors.map(polynomialText), [["-1", "1"]]);
  assert.equal(zeroPower.hasVariableDenominator, true);
});

test("左右の有理式を通分した候補多項式を厳密に構成する", () => {
  const left = reduce("1/(x-1)+1/(x+1)");
  const right = reduce("1");
  const equation = exactRationalEquationPolynomial(left, right);
  assert.deepEqual(polynomialText(equation), ["1", "2", "-1"]);
  assert.equal(formatExactRationalPolynomial(equation), "-x^2+2x+1");
});

test("恒等的0の分母・0の0乗・制限超過を受理しない", () => {
  for (const expression of [
    "1/(x-x)",
    "0/(x-x)",
    "(x-x)^-1",
    "(x-x)^0",
  ]) {
    assert.throws(
      () => reduce(expression),
      (error) => error instanceof ExactRationalFunctionError && !error.unsupported,
      expression,
    );
  }
  assert.throws(
    () => reduce("1/(x^3-1)"),
    (error) => error instanceof ExactRationalFunctionError && error.unsupported,
  );
  assert.throws(
    () => reduce("(x+1)^3"),
    (error) => error instanceof ExactRationalFunctionError && error.unsupported,
  );
});

test("恒真な定数分母は定義域条件へ残さない", () => {
  const reduced = reduce("x/2");
  assert.deepEqual(reduced.domainFactors, []);
  assert.equal(reduced.hasVariableDenominator, false);
});
