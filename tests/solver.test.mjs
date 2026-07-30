import test from "node:test";
import assert from "node:assert/strict";

import { solveQuestion } from "../js/solver/index.js";
import { solveLinearEquation } from "../js/solver/linear-equation.js";
import { solveQuadraticEquation } from "../js/solver/quadratic-equation.js";
import { solveBaseConversion } from "../js/solver/base-conversion.js";
import { solvePercentage } from "../js/solver/percentage.js";

function assertVerified(result, solverId) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.solverId, solverId);
  assert.equal(result.error, null);
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
  }
});

test("将来対応の指数・対数はソルバーエラーではなく未対応として返す", () => {
  for (const [question, category] of [
    ["2^x = 16 を解け", "指数・対数"],
    ["log₂8 を求めよ", "指数・対数"],
  ]) {
    const result = solveQuestion(question, { category });
    assert.equal(result.supported, false, question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
  }

  assert.equal(solveBaseConversion("log₂8 を求めよ").supported, false);
});

test("統合ルーターは対応形式の矛盾・不正入力をエラーとして保持する", () => {
  const malformedLinear = solveQuestion("2x+=11", { category: "一次方程式" });
  assert.equal(malformedLinear.supported, true);
  assert.equal(malformedLinear.solved, false);
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
  assert.equal(coefficient.answer, "x=-2,0.5");
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
  }
});

test("統合ソルバーが分類結果に応じて適切な実装へ振り分ける", () => {
  assert.equal(solveQuestion("2x+3=11").solverId, "linear-equation");
  assert.equal(solveQuestion("x^2-5x+6=0").solverId, "quadratic-equation");
  assert.equal(solveQuestion("800円の25%").solverId, "percentage");
  assert.equal(solveQuestion("A(1,2), B(4,6)間の距離").supported, false);
  assert.equal(solveQuestion("対応外の証明問題").supported, false);
});
