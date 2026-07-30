import test from "node:test";
import assert from "node:assert/strict";

import { solveQuestion } from "../js/solver/index.js";
import { solveLinearEquation } from "../js/solver/linear-equation.js";
import { solveLinearSystem } from "../js/solver/linear-system.js";
import { solveQuadraticEquation } from "../js/solver/quadratic-equation.js";
import { solveBaseConversion } from "../js/solver/base-conversion.js";
import { solvePercentage } from "../js/solver/percentage.js";

function assertVerified(result, solverId) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.solverId, solverId);
  assert.equal(result.error, null);
  assert.equal(result.resultKind, "exact");
  assert.ok(result.verification);
}

test("一次方程式の仕様例を解き、代入検証する", () => {
  for (const [question, expected] of [
    ["2x + 3 = 11", "x=4"],
    ["5x - 7 = 18", "x=5"],
    ["4 = 2x + 8", "x=-2"],
    ["3(x + 2) = 15", "x=3"],
    ["２ｘ＋３＝１１", "x=4"],
  ]) {
    const result = solveLinearEquation(question);
    assertVerified(result, "linear-equation");
    assert.equal(result.answer, expected);
  }
});

test("一次方程式の解なし・不定解を区別する", () => {
  const noSolution = solveLinearEquation("2x+1=2x+3");
  assertVerified(noSolution, "linear-equation");
  assert.equal(noSolution.answer, "解なし");

  const identity = solveLinearEquation("2(x+1)=2x+2");
  assertVerified(identity, "linear-equation");
  assert.equal(identity.answer, "すべての実数");
});

test("2元連立一次方程式を厳密な整数・分数で解く", () => {
  for (const [question, expected] of [
    ["連立方程式 x+y=3, x-y=1 を解け", "x=2, y=1"],
    ["2x+3y=7; 4x-y=5", "x=11/7, y=9/7"],
    ["0.5x+y=2\nx-y=1", "x=2, y=1"],
    ["{ 2(x+y)=10, x-y=1 }", "x=3, y=2"],
  ]) {
    const result = solveLinearSystem(question);
    assertVerified(result, "linear-system");
    assert.equal(result.answer, expected);
    assert.match(result.verification, /厳密に0/);
  }
});

test("連立一次方程式の解なし・無数解・恒等式を区別する", () => {
  const none = solveLinearSystem("x+y=1, 2x+2y=3");
  assertVerified(none, "linear-system");
  assert.equal(none.answer, "解なし");

  const infinite = solveLinearSystem("x+y=1, 2x+2y=2");
  assertVerified(infinite, "linear-system");
  assert.equal(infinite.answer, "解は無数にある");

  const all = solveLinearSystem("0=0, 0=0");
  assertVerified(all, "linear-system");
  assert.equal(all.answer, "すべての実数の組 (x,y)");
});

test("非線形・不足・危険な連立入力を検証済みにしない", () => {
  const nonlinear = solveLinearSystem("xy=1, x+y=2");
  assert.equal(nonlinear.supported, false);
  assert.equal(nonlinear.verified, false);

  const missing = solveLinearSystem("連立方程式 x+y=2");
  assert.equal(missing.supported, true);
  assert.equal(missing.solved, false);
  assert.equal(missing.resultKind, "invalid");

  const injection = solveLinearSystem(
    "連立方程式 x+globalThis.process.exit()=1, x+y=2",
  );
  assert.equal(injection.solved, false);
  assert.equal(injection.verified, false);
});

test("一次方程式は不正構文と危険な式を実行しない", () => {
  const malformed = solveLinearEquation("2x+=11");
  assert.equal(malformed.solved, false);
  assert.match(malformed.error, /不正|位置|途中|必要/);

  const injection = solveLinearEquation("x+globalThis.process.exit()=1");
  assert.equal(injection.solved, false);
  assert.equal(injection.verified, false);
});

test("未対応の関数・指数・根号を式の一部だけで検証しない", () => {
  for (const question of ["sin x = 0", "tan x = 1", "log x = 2", "e^x = 2", "√x = 3"]) {
    const result = solveQuestion(question);
    assert.equal(result.supported, false, question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
    assert.equal(result.resultKind, "unsupported", question);
  }
});

test("対応済み指数は検証し、未対応の対数は安全に拒否する", () => {
  const exponential = solveQuestion("2^x = 16 を解け", { category: "指数・対数" });
  assertVerified(exponential, "exponential-equation");
  assert.equal(exponential.answer, "x=4");

  const logarithm = solveQuestion("log₂8 を求めよ", { category: "指数・対数" });
  assert.equal(logarithm.supported, false);
  assert.equal(logarithm.solved, false);
  assert.equal(logarithm.verified, false);

  assert.equal(solveBaseConversion("log₂8 を求めよ").supported, false);
});

test("統合ルーターは対応形式の矛盾・不正入力をエラーとして保持する", () => {
  const malformedLinear = solveQuestion("2x+=11", { category: "一次方程式" });
  assert.equal(malformedLinear.supported, true);
  assert.equal(malformedLinear.solved, false);
  assert.equal(malformedLinear.resultKind, "invalid");
  assert.ok(malformedLinear.error);

  const invalidBase = solveQuestion("102(2)を10進数に変換", { category: "基数変換" });
  assert.equal(invalidBase.supported, true);
  assert.equal(invalidBase.solved, false);
  assert.match(invalidBase.error, /使用できません/);
});

test("二次方程式の異なる実数解と重解を解く", () => {
  const standard = solveQuadraticEquation("x^2 - 5x + 6 = 0");
  assertVerified(standard, "quadratic-equation");
  assert.equal(standard.answer, "x=2,3");

  const superscript = solveQuadraticEquation("x² - 5x + 6 = 0");
  assertVerified(superscript, "quadratic-equation");
  assert.equal(superscript.answer, "x=2,3");

  const repeated = solveQuadraticEquation("x^2 - 4x + 4 = 0");
  assertVerified(repeated, "quadratic-equation");
  assert.equal(repeated.answer, "x=2");

  const coefficient = solveQuadraticEquation("2x^2 + 3x - 2 = 0");
  assertVerified(coefficient, "quadratic-equation");
  assert.equal(coefficient.answer, "x=-2,1/2");
});

test("二次方程式の無理数解と実数解なしを扱う", () => {
  const irrational = solveQuadraticEquation("x^2 - 2 = 0");
  assertVerified(irrational, "quadratic-equation");
  assert.match(irrational.answer, /√2/);

  const noRealRoot = solveQuadraticEquation("x^2 + 1 = 0");
  assertVerified(noRealRoot, "quadratic-equation");
  assert.equal(noRealRoot.answer, "実数解なし");
});

test("基数変換の2種類の表記を10進数へ変換する", () => {
  const parenthesized = solveBaseConversion("1011(2)を10進数に変換");
  assertVerified(parenthesized, "base-conversion");
  assert.equal(parenthesized.answer, "11");

  const subscript = solveBaseConversion("110101₂を10進数に変換");
  assertVerified(subscript, "base-conversion");
  assert.equal(subscript.answer, "53");

  const invalidDigit = solveBaseConversion("102(2)を10進数に変換");
  assert.equal(invalidDigit.supported, true);
  assert.equal(invalidDigit.solved, false);
  assert.match(invalidDigit.error, /使用できません/);
});

test("パーセントの仕様例を計算し、対象外の割引を誤計算しない", () => {
  for (const [question, expected] of [
    ["800円の25%", "200"],
    ["1200の15%を求めよ", "180"],
    ["８００円の２５％", "200"],
    ["800円の25パーセント", "200"],
  ]) {
    const result = solvePercentage(question);
    assertVerified(result, "percentage");
    assert.equal(result.answer, expected);
  }
  assert.equal(solvePercentage("800円を25%引き").supported, false);
  assert.equal(solvePercentage("-800円の25%").solved, false);
});

test("図や作図を必要とする問題は推測せず未対応にする", () => {
  for (const question of [
    "A(1,2), B(4,6)間の距離",
    "三角形の2つの内角が50度、60度です。残りの角を求めよ",
    "図の斜線部分の面積を求めよ",
  ]) {
    const result = solveQuestion(question, { category: "図形" });
    assert.equal(result.supported, false, question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
    assert.equal(result.resultKind, "unsupported", question);
  }
});

test("統合ソルバーが分類結果に応じて適切な実装へ振り分ける", () => {
  assert.equal(solveQuestion("2x+3=11").solverId, "linear-equation");
  assert.equal(solveQuestion("x+y=3, x-y=1").solverId, "linear-system");
  assert.equal(solveQuestion("x^2-5x+6=0").solverId, "quadratic-equation");
  assert.equal(solveQuestion("800円の25%").solverId, "percentage");
  assert.equal(solveQuestion("A(1,2), B(4,6)間の距離").supported, false);
  assert.equal(solveQuestion("対応外の証明問題").supported, false);
});
