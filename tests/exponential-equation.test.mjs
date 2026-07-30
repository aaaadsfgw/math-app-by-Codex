import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import {
  EXPONENTIAL_EQUATION_SOLVER_ID,
  solveExponentialEquation,
} from "../js/solver/exponential-equation.js";
import { solveQuestion } from "../js/solver/index.js";

function assertExact(question, expected) {
  const result = solveExponentialEquation(question);
  assert.equal(result.supported, true, `${question}: ${result.error}`);
  assert.equal(result.solved, true, `${question}: ${result.error}`);
  assert.equal(result.verified, true, question);
  assert.equal(result.solverId, EXPONENTIAL_EQUATION_SOLVER_ID);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.answer, expected);
  assert.equal(result.exactAnswer, expected);
  assert.match(result.verification, /厳密/u);
  assert.ok(result.solutionTrace.length >= 3);
  assert.doesNotThrow(() => JSON.stringify(result));
}

test("同底・従属する整数底・分数底の指数方程式を厳密に解く", () => {
  for (const [question, expected] of [
    ["2^x=8", "x=3"],
    ["4^x=8", "x=3/2"],
    ["2^(x+1)=16", "x=3"],
    ["9^(x-1)=3^(x+1)", "x=3"],
    ["(1/2)^x=8", "x=-3"],
    ["25^(x+1)=125", "x=1/2"],
    ["2^(2x-1)=1/8", "x=-1"],
    ["3^x=3^(2x-1)", "x=1"],
    ["2^x=3^x", "x=0"],
    ["2^(x+1)=3^(x+1)", "x=-1"],
    ["6^x=6", "x=1"],
  ]) {
    assertExact(question, expected);
  }
});

test("恒等式・定数倍率の矛盾・非正値右辺を区別する", () => {
  assertExact("2^(x+1)=4^(x/2+1/2)", "すべての実数");
  assertExact("2^x=4^(x/2+1)", "解なし");
  assertExact("2^x=0", "解なし");
  assertExact("2^x=-1", "解なし");
  assertExact("2^(x-x)=1", "すべての実数");
  assertExact("2^(x-x)=3", "解なし");
});

test("日本語・全角・左右逆の標準表記を全面一致で解く", () => {
  assertExact("次の指数方程式を解け：２＾（ｘ＋１）＝１６", "x=3");
  assertExact("８＝４＾ｘ", "x=3/2");
  assert.equal(classifyCategory("4^x=8").primary, "指数・対数");
  assert.equal(classifyCategory("2^(x+1)=4").primary, "指数・対数");
  assert.equal(classifyCategory("2^-x=8").primary, "指数・対数");
  assert.equal(solveQuestion("4^x=8").solverId, EXPONENTIAL_EQUATION_SOLVER_ID);
  assert.equal(
    solveQuestion("2^(x-x+1)=2").solverId,
    EXPONENTIAL_EQUATION_SOLVER_ID,
  );
});

test("対数比・非正底・非一次指数・部分一致を検証済みにしない", () => {
  for (const question of [
    "2^x=3",
    "2^(x+1)=3^x",
    "e^x=2",
    "(-2)^x=4",
    "0^x=0",
    "1^x=1",
    "x^x=4",
    "2^(x^2)=4",
    "2^(1/x)=4",
    "2^x+1=5",
    "4^x-5*2^x+4=0",
    "2^2x=8",
    "1/2^x=1/8",
    "2^x=8 garbage",
    "2^x==8",
    "2^^x=8",
    "2^(x/2x)=8",
    "2^x=8;alert(1)",
    "2^x=8, x=3",
    "2^x=",
  ]) {
    const result = solveExponentialEquation(question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }
});

test("普通の二次・一次方程式を指数方程式として奪わない", () => {
  assert.equal(solveExponentialEquation("x^2=4").supported, false);
  assert.equal(solveExponentialEquation("2x+1=3").supported, false);
  assert.equal(solveQuestion("x^2=4").solverId, "quadratic-equation");
  assert.equal(solveQuestion("2x+1=3").solverId, "linear-equation");
});
