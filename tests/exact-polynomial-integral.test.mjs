import assert from "node:assert/strict";
import test from "node:test";

import { ExactRational } from "../js/math-core/exact-rational.js";
import {
  evaluateExactDefinitePolynomialIntegral,
  evaluateExactPolynomialForIntegral,
  exactPolynomialForIntegralFromAst,
  exactRationalConstantFromAst,
  ExactPolynomialIntegralError,
  formatExactPolynomialForIntegral,
  integrateExactPolynomial,
  MAX_POLYNOMIAL_DEGREE,
} from "../js/math-core/exact-polynomial-integral.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";

function q(value) {
  const [numerator, denominator] = String(value).split("/");
  return denominator
    ? new ExactRational(BigInt(numerator), BigInt(denominator))
    : ExactRational.parse(numerator);
}

function ast(expression, symbols = ["x"]) {
  return parseMathExpression(expression, { symbols }).ast;
}

function polynomial(expression) {
  return exactPolynomialForIntegralFromAst(ast(expression));
}

function coefficientText(coefficients) {
  return coefficients.map(String);
}

function assertIntegralError(operation, { code, unsupported }) {
  assert.throws(
    operation,
    (error) => (
      error instanceof ExactPolynomialIntegralError
      && error.code === code
      && (unsupported === undefined || error.unsupported === unsupported)
    ),
  );
}

test("有理係数多項式を係数配列へ還元し、原始関数を厳密に構成する", () => {
  const coefficients = polynomial("3x^2-2x+5");
  assert.deepEqual(coefficientText(coefficients), ["5", "-2", "3"]);

  const antiderivative = integrateExactPolynomial(coefficients);
  assert.deepEqual(coefficientText(antiderivative), ["0", "5", "-1", "1"]);
  assert.equal(formatExactPolynomialForIntegral(antiderivative), "x^3-x^2+5x");

  const evaluated = evaluateExactDefinitePolynomialIntegral(
    coefficients,
    q("0"),
    q("2"),
  );
  assert.equal(String(evaluated.lowerValue), "0");
  assert.equal(String(evaluated.upperValue), "14");
  assert.equal(String(evaluated.value), "14");
});

test("分数・有限小数係数と分数境界を丸めずに評価する", () => {
  const coefficients = polynomial("(1/2)x^2-0.25x+3/8");
  assert.deepEqual(coefficientText(coefficients), ["3/8", "-1/4", "1/2"]);
  assert.deepEqual(
    coefficientText(integrateExactPolynomial(coefficients)),
    ["0", "3/8", "-1/8", "1/6"],
  );

  const evaluated = evaluateExactDefinitePolynomialIntegral(
    coefficients,
    q("-1/2"),
    q("3/2"),
  );
  assert.equal(String(evaluated.lowerValue), "-23/96");
  assert.equal(String(evaluated.upperValue), "27/32");
  assert.equal(String(evaluated.value), "13/12");
});

test("逆順境界は上端値から下端値を引き、同一境界は0にする", () => {
  const coefficients = polynomial("x^2");
  const reversed = evaluateExactDefinitePolynomialIntegral(
    coefficients,
    q("1"),
    q("0"),
  );
  assert.equal(String(reversed.lowerValue), "1/3");
  assert.equal(String(reversed.upperValue), "0");
  assert.equal(String(reversed.value), "-1/3");

  const equalBounds = evaluateExactDefinitePolynomialIntegral(
    coefficients,
    q("-7/3"),
    q("-7/3"),
  );
  assert.equal(String(equalBounds.value), "0");
});

test("次数32を受理し、次数33と積の途中で上限を超える式を拒否する", () => {
  const boundary = polynomial(`x^${MAX_POLYNOMIAL_DEGREE}`);
  assert.equal(boundary.length, MAX_POLYNOMIAL_DEGREE + 1);
  assert.equal(
    String(evaluateExactDefinitePolynomialIntegral(boundary, q("0"), q("1")).value),
    "1/33",
  );

  for (const expression of ["x^33", "x^17*x^16", "(x^2)^17"]) {
    assertIntegralError(
      () => polynomial(expression),
      { code: "DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  assert.equal(polynomial("x^16*x^16").length, 33);
});

test("定数除算と負の定数冪だけを係数へ取り込み、変数分母と負冪を拒否する", () => {
  assert.deepEqual(coefficientText(polynomial("2^-3*x+x/4")), ["0", "3/8"]);

  for (const expression of ["1/x", "x/(x+1)", "(x-1)^-2", "x/(x-x+1)"]) {
    assertIntegralError(
      () => polynomial(expression),
      { code: "VARIABLE_DENOMINATOR", unsupported: true },
    );
  }
  assertIntegralError(
    () => polynomial("0^-1*x"),
    { code: "ZERO_TO_NEGATIVE_POWER", unsupported: false },
  );
  assertIntegralError(
    () => polynomial("2^-33*x"),
    { code: "UNSUPPORTED_EXPONENT", unsupported: true },
  );
  assertIntegralError(
    () => polynomial("x/0"),
    { code: "DIVISION_BY_ZERO", unsupported: false },
  );
});

test("変数式の0乗で消える未定義点を無視せず、定数の0乗だけを許可する", () => {
  for (const expression of ["x^0", "(x-1)^0", "(x^2+1)^0", "0*(x-1)^0"]) {
    assertIntegralError(
      () => polynomial(expression),
      { code: "ZERO_POWER_DOMAIN", unsupported: true },
    );
  }
  assertIntegralError(
    () => polynomial("(x-x)^0"),
    { code: "ZERO_TO_ZERO", unsupported: false },
  );
  assert.deepEqual(coefficientText(polynomial("2^0*x")), ["0", "1"]);
});

test("関数・数学定数・別変数を有理係数多項式として受理しない", () => {
  for (const expression of ["sin(x)", "exp(x)", "sqrt(x)", "pi*x", "e+x"]) {
    assertIntegralError(
      () => polynomial(expression),
      { code: "UNSUPPORTED_FUNCTION", unsupported: true },
    );
  }
  assertIntegralError(
    () => exactPolynomialForIntegralFromAst(ast("x+y", ["x", "y"])),
    { code: "UNSUPPORTED_SYMBOL", unsupported: true },
  );
});

test("境界の有理式を厳密評価し、変数・定数・関数境界を拒否する", () => {
  for (const [expression, expected] of [
    ["-3/4", "-3/4"],
    ["0.125", "1/8"],
    ["(1+2)/(3*2)", "1/2"],
    ["2^-3", "1/8"],
    ["(-2)^3", "-8"],
  ]) {
    assert.equal(String(exactRationalConstantFromAst(ast(expression, []))), expected);
  }

  for (const expression of ["x", "pi", "e", "sqrt(2)"]) {
    assertIntegralError(
      () => exactRationalConstantFromAst(ast(expression, ["x"])),
      { code: "NON_RATIONAL_BOUND", unsupported: true },
    );
  }
  assertIntegralError(
    () => exactRationalConstantFromAst(ast("2^33", [])),
    { code: "UNSUPPORTED_BOUND_EXPONENT", unsupported: true },
  );
  for (const expression of ["1/0", "0^-1", "0^0"]) {
    assert.throws(
      () => exactRationalConstantFromAst(ast(expression, [])),
      RangeError,
      expression,
    );
  }
});

test("巨大BigInt係数を正確に保持し、上限を超える中間値は安全に拒否する", () => {
  const huge = `1${"0".repeat(400)}`;
  const coefficients = polynomial(`${huge}x`);
  assert.equal(String(coefficients[1]), huge);
  assert.equal(
    String(evaluateExactDefinitePolynomialIntegral(coefficients, q("0"), q("1")).value),
    new ExactRational(BigInt(huge), 2n).toString(),
  );

  const oversizedBound = new ExactRational(BigInt(`1${"0".repeat(200)}`));
  assert.throws(
    () => evaluateExactDefinitePolynomialIntegral(
      polynomial("x^2"),
      q("0"),
      oversizedBound,
    ),
    RangeError,
  );
});

test("生成した有理係数多項式を項別積分公式と独立に照合する", () => {
  let checked = 0;
  for (let degree = 0; degree <= 8; degree += 1) {
    const coefficients = Array.from(
      { length: degree + 1 },
      (_, index) => new ExactRational(BigInt((index + 2) * (degree % 2 ? -1 : 1)), BigInt(index + 1)),
    );
    for (let lowerNumerator = -3; lowerNumerator <= 2; lowerNumerator += 1) {
      const lower = new ExactRational(BigInt(lowerNumerator), 2n);
      const upper = new ExactRational(BigInt(lowerNumerator + 3), 3n);
      const expected = coefficients.reduce((sum, coefficient, index) => {
        const exponent = BigInt(index + 1);
        return sum.add(
          coefficient
            .divide(new ExactRational(exponent))
            .multiply(upper.pow(exponent).subtract(lower.pow(exponent))),
        );
      }, ExactRational.zero());
      const actual = evaluateExactDefinitePolynomialIntegral(
        coefficients,
        lower,
        upper,
      ).value;
      assert.equal(String(actual), String(expected));
      checked += 1;
    }
  }
  assert.equal(checked, 54);
});

test("公開積分APIも次数上限と係数型を検証する", () => {
  const degreeTooHigh = Array.from(
    { length: MAX_POLYNOMIAL_DEGREE + 2 },
    (_, index) => (index === MAX_POLYNOMIAL_DEGREE + 1 ? q("1") : q("0")),
  );
  assertIntegralError(
    () => integrateExactPolynomial(degreeTooHigh),
    { code: "DEGREE_TOO_HIGH", unsupported: true },
  );
  assert.throws(() => integrateExactPolynomial([1]), TypeError);
  assert.throws(() => evaluateExactPolynomialForIntegral([q("1")], "1"), TypeError);
});
