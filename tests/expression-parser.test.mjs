import assert from "node:assert/strict";
import test from "node:test";

import {
  MathParseError,
  parseMathExpression,
  tokenizeMathExpression,
} from "../js/math-core/expression-parser.js";
import { normalizeMathNotation } from "../js/math-core/notation.js";

test("日本語教材で使う全角記号・上付き指数・平方根を正規化する", () => {
  assert.equal(normalizeMathNotation("２ｘ＋３＝１１"), "2x+3=11");
  assert.equal(normalizeMathNotation("−ｘ²＋√（ｘ＋１）"), "-x^2+sqrt (x+1)");
  assert.equal(normalizeMathNotation("\\left(x\\right)\\times\\pi"), "(x)*pi");
});

test("暗黙の掛け算を含む式を安全なASTとCAS文字列へ変換する", () => {
  const parsed = parseMathExpression("2x + 3(x-1)");
  assert.equal(parsed.normalized, "2x + 3(x-1)");
  assert.deepEqual(parsed.symbols, ["x"]);
  assert.equal(parsed.cas, "((2*x)+(3*(x-1)))");
  assert.equal(Object.isFrozen(parsed.ast), true);
});

test("累乗は右結合、単項マイナスは累乗の外側として解釈する", () => {
  assert.equal(parseMathExpression("2^3^2").cas, "(2^(3^2))");
  assert.equal(parseMathExpression("-x²").cas, "(-(x^2))");
  assert.equal(parseMathExpression("2^-3").cas, "(2^(-3))");
});

test("括弧付き関数と教材でよくある関数の空白表記を解釈する", () => {
  assert.equal(parseMathExpression("sqrt(x²+1)").cas, "sqrt(((x^2)+1))");
  assert.equal(parseMathExpression("sin x + cos(x)").cas, "(sin(x)+cos(x))");
  assert.equal(parseMathExpression("sinx").cas, "sin(x)");
});

test("トークン位置を保持し、危険・曖昧・未許可の入力を拒否する", () => {
  const tokenized = tokenizeMathExpression("2x+1");
  assert.deepEqual(
    tokenized.tokens.slice(0, 4).map(({ type, value, position }) => ({ type, value, position })),
    [
      { type: "number", value: "2", position: 0 },
      { type: "identifier", value: "x", position: 1 },
      { type: "operator", value: "+", position: 2 },
      { type: "number", value: "1", position: 3 },
    ],
  );

  for (const expression of [
    "x=1",
    "x;clearall",
    "process.exit()",
    "g+1",
    "x..2",
    "(x+1",
    "log(x,2)",
  ]) {
    assert.throws(() => parseMathExpression(expression), MathParseError, expression);
  }
});
