import assert from "node:assert/strict";
import test from "node:test";

import { ExactRational } from "../js/math-core/exact-rational.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";
import {
  LinearExpressionError,
  evaluateLinearExpression,
  linearizeExpressionAst,
} from "../js/math-core/linear-expression.js";

test("有限小数と分数を丸めず既約分数として計算する", () => {
  const half = ExactRational.parse("0.5");
  const third = new ExactRational(1n, 3n);
  assert.equal(half.add(third).toString(), "5/6");
  assert.equal(half.multiply(third).toString(), "1/6");
  assert.equal(third.divide(half).toString(), "2/3");
  assert.equal(new ExactRational(-2n, -4n).toString(), "1/2");
});

test("一次式ASTをx・y・定数の厳密係数へ変換する", () => {
  const parsed = parseMathExpression("2(x+y)-0.5x+3", { symbols: ["x", "y"] });
  const expression = linearizeExpressionAst(parsed.ast);
  assert.equal(expression.x.toString(), "3/2");
  assert.equal(expression.y.toString(), "2");
  assert.equal(expression.constant.toString(), "3");
  assert.equal(
    evaluateLinearExpression(expression, {
      x: new ExactRational(2n),
      y: new ExactRational(-3n),
    }).toString(),
    "0",
  );
});

test("非線形演算と0除算を一次式として受理しない", () => {
  assert.throws(
    () => linearizeExpressionAst(
      parseMathExpression("xy", { symbols: ["x", "y"] }).ast,
    ),
    (error) => error instanceof LinearExpressionError && error.unsupported,
  );
  assert.throws(
    () => linearizeExpressionAst(
      parseMathExpression("x/0", { symbols: ["x", "y"] }).ast,
    ),
    /0では割れません/,
  );
});

