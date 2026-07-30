import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { solveQuestion } from "../js/solver/index.js";
import {
  LINEAR_INEQUALITY_SOLVER_ID,
  solveLinearInequality,
} from "../js/solver/linear-inequality.js";

function assertVerified(result, expected) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.solverId, LINEAR_INEQUALITY_SOLVER_ID);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.answer, expected);
  assert.ok(result.solutionSet);
}

test("一次不等式を厳密な境界値で解く", () => {
  for (const [question, expected] of [
    ["2x+3<11", "x<4"],
    ["-3x+6>=0", "x<=2"],
    ["0.5x>1", "x>2"],
    ["3(x-1)≤6", "x<=3"],
    ["x/2+1<3 を解け", "x<4"],
  ]) {
    assertVerified(solveLinearInequality(question), expected);
  }
});

test("xの項が消える一次不等式の真偽を区別する", () => {
  assertVerified(solveLinearInequality("0x<1"), "すべての実数");
  assertVerified(solveLinearInequality("0x>1"), "解なし");
  assertVerified(solveLinearInequality("2(x+1)<=2x+2"), "すべての実数");
});

test("二次・連立・不正入力を一次不等式として検証しない", () => {
  const quadratic = solveLinearInequality("x^2<4");
  assert.equal(quadratic.supported, false);
  assert.equal(quadratic.verified, false);

  const chained = solveLinearInequality("0<x<2");
  assert.equal(chained.supported, true);
  assert.equal(chained.solved, false);
  assert.equal(chained.resultKind, "invalid");

  const injection = solveLinearInequality("不等式 x+globalThis.process.exit()<2");
  assert.equal(injection.solved, false);
  assert.equal(injection.verified, false);
});

test("分類と統合ルーターが一次不等式へ接続される", () => {
  assert.equal(classifyCategory("-2x+1≥5").primary, "不等式");
  assert.equal(solveQuestion("-2x+1≥5").answer, "x<=-2");
});

test("関数・別変数・末尾文字列を部分的な一次不等式として解かない", () => {
  for (const question of [
    "sin x<2",
    "sqrt(x)<2",
    "y+x<2",
    "ax+1<2",
    "f(x)=x<2",
    "x<2 garbage",
    "ｘ２－５ｘ＋６＜０",
  ]) {
    const result = solveLinearInequality(question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }
});
