import test from "node:test";
import assert from "node:assert/strict";

import { solveQuestion } from "../js/solver/index.js";
import { solveLinearEquation } from "../js/solver/linear-equation.js";

function assertExact(question, expected) {
  const result = solveLinearEquation(question);
  assert.equal(result.supported, true, `${question}: ${result.error}`);
  assert.equal(result.solved, true, `${question}: ${result.error}`);
  assert.equal(result.verified, true, question);
  assert.equal(result.solverId, "linear-equation");
  assert.equal(result.resultKind, "exact");
  assert.equal(result.answer, expected);
  assert.equal(result.exactAnswer, expected);
  assert.match(result.verification, /厳密/u);
}

test("整数・有限小数・分数係数の一次方程式を厳密分数で解く", () => {
  for (const [question, expected] of [
    ["2x+3=11", "x=4"],
    ["3x=1", "x=1/3"],
    ["0.1x=0.3", "x=3"],
    ["(1/3)x+1/2=0", "x=-3/2"],
    ["0.0000000001x=1", "x=10000000000"],
    ["100000000000000000000x=1", "x=1/100000000000000000000"],
    ["４＝２ｘ＋８", "x=-2"],
  ]) {
    assertExact(question, expected);
  }
});

test("微小な係数・定数を許容誤差で0扱いしない", () => {
  assertExact("x+0.0000000001=x", "解なし");
  assertExact("0.0000000001x=0", "x=0");
  assertExact("0.0000000001x=0.0000000002", "x=2");
});

test("恒等式・矛盾・次数低下を厳密に区別する", () => {
  assertExact("2(x+1)=2x+2", "すべての実数");
  assertExact("2x+1=2x+3", "解なし");
  assertExact("0x^2+2x-4=0", "x=2");
  assertExact("(x-x)x+2x-4=0", "x=2");
});

test("曖昧・高次・分母変数・不正入力を一次解として検証しない", () => {
  for (const question of [
    "x2-4=0",
    "ｘ２－４＝０",
    "0.0000000001x^2+x=0",
    "1/(x-1)=0",
    "sin x=0",
    "x=1 garbage",
    "x==1",
    "x+=1",
    "0^0=1",
    "(x-x)^0=1",
    "1/(x-x)^0=1",
  ]) {
    const result = solveLinearEquation(question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }

  const routedQuadratic = solveQuestion("0.0000000001x^2+x=0");
  assert.equal(routedQuadratic.solverId, "quadratic-equation");
  assert.equal(routedQuadratic.answer, "x=-10000000000,0");
});
