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

test("四次までを厳密展開し、変数分母・上限超過・0除算を受理しない", () => {
  const cancelled = subtractExactPolynomials(
    exactPolynomialFromAst(
      parseMathExpression("x^4-x^3+x", { symbols: ["x"] }).ast,
    ),
    exactPolynomialFromAst(
      parseMathExpression("x^4-x^3", { symbols: ["x"] }).ast,
    ),
  );
  assert.deepEqual(cancelled.map(String), ["0", "1"]);

  for (const expression of ["x^5", "1/x"]) {
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
  assert.throws(
    () => exactPolynomialFromAst(
      parseMathExpression("(x-x)^0", { symbols: ["x"] }).ast,
    ),
    /0の0乗/,
  );
  assert.throws(
    () => exactPolynomialFromAst(
      parseMathExpression("x^0", { symbols: ["x"] }).ast,
    ),
    (error) => error instanceof ExactPolynomialError && error.unsupported,
  );
});

test("呼び出し側が途中次数を3次へ制限でき、高次項の相殺も受理しない", () => {
  const parse = (expression) => parseMathExpression(expression, { symbols: ["x"] }).ast;
  const cubic = exactPolynomialFromAst(parse("(x-1)^3"), {
    maxIntermediateDegree: 3,
  });
  assert.deepEqual(cubic.map(String), ["-1", "3", "-3", "1"]);

  for (const expression of ["x^4-x^4", "0*x^4", "(x-x)^4"]) {
    assert.throws(
      () => exactPolynomialFromAst(parse(expression), { maxIntermediateDegree: 3 }),
      (error) => (
        error instanceof ExactPolynomialError
        && error.unsupported
        && error.code === "UNSUPPORTED_EXPONENT"
      ),
    );
  }

  for (const expression of [
    "0*x*x*x*x",
    "(x^2-x^2)*x^2+x",
    "(x-x)*(x*x*x)+x",
    "(x^2-x^2)^2+x",
  ]) {
    assert.throws(
      () => exactPolynomialFromAst(parse(expression), { maxIntermediateDegree: 3 }),
      (error) => (
        error instanceof ExactPolynomialError
        && error.unsupported
        && error.code === "DEGREE_TOO_HIGH"
      ),
    );
  }

  assert.throws(
    () => exactPolynomialFromAst(parse("x^2*x^2"), { maxIntermediateDegree: 3 }),
    (error) => (
      error instanceof ExactPolynomialError
      && error.unsupported
      && error.code === "DEGREE_TOO_HIGH"
    ),
  );

  for (const maxIntermediateDegree of [0, 5, 1.5]) {
    assert.throws(
      () => exactPolynomialFromAst(parse("x"), { maxIntermediateDegree }),
      (error) => (
        error instanceof ExactPolynomialError
        && error.code === "INVALID_MAX_INTERMEDIATE_DEGREE"
        && !error.unsupported
      ),
    );
  }


  for (const expression of ["1/((x-x)+1)", "x^((x-x)+2)"]) {
    assert.throws(
      () => exactPolynomialFromAst(parse(expression), { maxIntermediateDegree: 3 }),
      (error) => error instanceof ExactPolynomialError && error.unsupported,
    );
  }
});
