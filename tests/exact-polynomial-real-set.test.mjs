import assert from "node:assert/strict";
import test from "node:test";

import { parseMathExpression } from "../js/math-core/expression-parser.js";
import { exactPolynomialFromAst } from "../js/math-core/exact-polynomial.js";
import { createStrictPositivePolynomialSet } from "../js/math-core/exact-polynomial-real-set.js";
import { ExactRational } from "../js/math-core/exact-rational.js";
import { formatRealSet } from "../js/math-core/real-set.js";

function positiveSet(expression) {
  const ast = parseMathExpression(expression, { symbols: ["x"] }).ast;
  return formatRealSet(createStrictPositivePolynomialSet(exactPolynomialFromAst(ast)));
}

test("定数・一次式の正値領域を厳密な開区間で返す", () => {
  assert.equal(positiveSet("1"), "すべての実数");
  assert.equal(positiveSet("0"), "解なし");
  assert.equal(positiveSet("2x-1"), "1/2<x");
  assert.equal(positiveSet("-3x+6"), "x<2");
});

test("二次式の正値領域で重解・内側・外側を区別する", () => {
  assert.equal(positiveSet("x^2+1"), "すべての実数");
  assert.equal(positiveSet("-x^2-1"), "解なし");
  assert.equal(positiveSet("(x-1)^2"), "x<1 または 1<x");
  assert.equal(positiveSet("1-x^2"), "-1<x<1");
  assert.equal(positiveSet("x^2-2"), "x<-√2 または √2<x");
});

test("二次正値領域を有理数の開区間で浮動小数なしに切る", () => {
  const rational = (value) => {
    const [numerator, denominator = "1"] = String(value).split("/");
    return denominator === "1"
      ? ExactRational.parse(numerator)
      : new ExactRational(BigInt(numerator), BigInt(denominator));
  };
  const bounded = (expression, lower, upper) => {
    const ast = parseMathExpression(expression, { symbols: ["x"] }).ast;
    return formatRealSet(createStrictPositivePolynomialSet(
      exactPolynomialFromAst(ast),
      {
        lower: lower === null ? null : rational(lower),
        upper: upper === null ? null : rational(upper),
      },
    ));
  };
  assert.equal(bounded("x^2", "0", null), "0<x");
  assert.equal(bounded("4-x^2", "1", null), "1<x<2");
  assert.equal(bounded("x^2-2", null, "3/2"), "x<-√2 または √2<x<3/2");
  assert.equal(bounded("x^2-2", null, "7/5"), "x<-√2");
  assert.equal(bounded("4-x^2", "2", null), "解なし");
  assert.equal(
    bounded("x^2-2", null, "1.414213562373095"),
    "x<-√2",
  );
});
