import assert from "node:assert/strict";
import test from "node:test";

import { parseMathExpression } from "../js/math-core/expression-parser.js";
import {
  ExactPolynomialError,
  evaluateExactPolynomial,
  exactPolynomialFromAst,
  subtractExactPolynomials,
} from "../js/math-core/exact-polynomial.js";
import { ExactRational } from "../js/math-core/exact-rational.js";

test("二次式を厳密分数係数へ展開し評価する", () => {
  const left = exactPolynomialFromAst(
    parseMathExpression("0.5(x-1)(x+3)", { symbols: ["x"] }).ast,
  );
  const right = exactPolynomialFromAst(
    parseMathExpression("1", { symbols: ["x"] }).ast,
  );
  const coefficients = subtractExactPolynomials(left, right);
  assert.deepEqual(coefficients.map(String), ["-5/2", "1", "1/2"]);
  assert.equal(
    evaluateExactPolynomial(coefficients, new ExactRational(1n)).toString(),
    "-1",
  );
});

test("三次式・変数分母・0除算を二次多項式として受理しない", () => {
  for (const expression of ["x^3", "1/x"]) {
    assert.throws(
      () => exactPolynomialFromAst(
        parseMathExpression(expression, { symbols: ["x"] }).ast,
      ),
      (error) => error instanceof ExactPolynomialError && error.unsupported,
    );
  }
  assert.throws(
    () => exactPolynomialFromAst(
      parseMathExpression("x/0", { symbols: ["x"] }).ast,
    ),
    /0では割れません/,
  );
});

