import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  solvePolynomialVolume,
  solveQuestion,
  solveQuestionAsync,
} from "../js/solver/index.js";
import { createHistoryRecord } from "../js/storage.js";
import { historyInput } from "./storage-fixtures.mjs";

function assertExact(result, answer) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.solverId, "polynomial-volume");
  assert.equal(result.answer, answer);
  assert.equal(result.exactAnswer, answer);
  assert.equal(result.approximateAnswer, "");
  assert.deepEqual(result.conditions, []);
  assert.equal(result.solutionSet, null);
  assert.ok(result.solutionTrace.length >= 7);
  assert.equal(result.solutionTrace.at(-1).type, "result");
}

function assertRejected(result, kind) {
  assert.equal(result.verified, false);
  assert.equal(result.solved, false);
  assert.equal(result.answer, "");
  assert.equal(result.exactAnswer, "");
  assert.equal(result.resultKind, kind);
  assert.ok(result.error);
}

test("x軸回転の円板・ワッシャー体積を有理数倍piで厳密に解く", () => {
  for (const [question, expected] of [
    ["volume_x_axis_[0,1](x)", "pi/3"],
    ["volume_xaxis_[-1,1](1-x^2)", "16*pi/15"],
    ["volume_x_[0,2]((x-1)^2)", "2*pi/5"],
    ["volume_x_axis_[0,1](x+2;x+1)", "4*pi"],
    ["volume_x_axis_[-1,1](x^2+1;x^2)", "10*pi/3"],
    ["volume_x_axis_[0,3](2;1)", "9*pi"],
    ["volume_x_axis_[-5/2,7/3](x^2+1;x^2+1)", "0"],
    ["volume_x_axis_[0,3/2](x/2+1/3)", "79*pi/96"],
  ]) {
    assertExact(solvePolynomialVolume(question), expected);
  }
});

test("分類・明示カテゴリ・同期・非同期より先にvolume preflightを通す", async () => {
  for (const [question, expected] of [
    ["volume_x_axis_[0,1](x)", "pi/3"],
    ["volume_x_axis_[0,1](x+2;x+1)", "4*pi"],
  ]) {
    assert.equal(classifyCategory(question).primary, "積分", question);
    const direct = solveQuestion(question);
    const wrongCategory = solveQuestion(question, { category: "二次方程式" });
    const asynchronous = await solveQuestionAsync(question);
    assertExact(direct, expected);
    assert.deepEqual(wrongCategory, direct);
    assert.deepEqual(asynchronous, direct);
  }
});

test("半径の負値・内外逆転・次数超過・非多項式をverifiedにしない", () => {
  for (const question of [
    "volume_x_axis_[0,1](-x)",
    "volume_x_axis_[0,1](2;44/25+x-x^2)",
    "volume_x_axis_[0,1](x^3)",
    "volume_x_axis_[0,1](sin(x))",
    "volume_x_axis_[0,1](sqrt(x))",
    "volume_x_axis_[0,1](1/x)",
    "volume_x_axis_[0,1](x^-1)",
    "volume_x_axis_[0,1](0*x^5)",
    "volume_x_axis_[0,1](x^5-x^5)",
    "volume_x_axis_[0,1]((x^5)^0)",
  ]) {
    assertRejected(solvePolynomialVolume(question), "unsupported");
  }
});

test("不正区間・不完全構文・他軸・図依存・答え付加を安全に拒否する", () => {
  for (const question of [
    "volume_x_axis_[1,1](x)",
    "volume_x_axis_[2,-1](x)",
    "volume_x_axis_[0,1]()",
    "volume_x_axis_[0,1](x;)",
    "volume_x_axis_[0,1](x;0;1)",
    "volume_x_axis_[0,1](x)=pi/3",
    "volume_x_axis_[0,1](x/2x)",
    "volume_x_axis_[0,1](5!)",
  ]) {
    assertRejected(solvePolynomialVolume(question), "invalid");
  }
  assertRejected(solvePolynomialVolume("volume_y_axis_[0,1](x)"), "unsupported");
  assertRejected(
    solvePolynomialVolume("右図の斜線部分をx軸のまわりに回転した立体の体積を求めよ"),
    "unsupported",
  );
});

test("通常の面積・定積分・方程式・一般図形の体積を奪わない", async () => {
  for (const question of [
    "area_[0,1](x;0)",
    "∫_0^1 pi*x^2 dx",
    "x^2=4",
    "半径2、高さ3の円柱の体積を求めよ",
  ]) {
    assert.equal(solvePolynomialVolume(question).recognized, undefined, question);
  }
  assert.equal(solveQuestion("area_[0,1](x;0)").solverId, "polynomial-area");
  assert.equal(solveQuestion("x^2=4").solverId, "quadratic-equation");
  assert.equal((await solveQuestionAsync("∫_0^1 x^2 dx")).solverId, "definite-integral");
});

test("表示と履歴へ半径証明・pi係数・積分分類を保持する", () => {
  const question = "volume_x_axis_[0,1](x+2;x+1)";
  const result = solvePolynomialVolume(question);
  assertExact(result, "4*pi");

  assert.equal(presentSolution(result, { mode: "answer" }).content, "4*pi");
  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  assert.match(hint1, /外半径/u);
  assert.doesNotMatch(hint1, /4\*pi/u);
  assert.doesNotMatch(hint2, /4\*pi/u);
  assert.match(presentSolution(result, { mode: "steps" }).content, /体積: 4\*pi/u);
  const explanation = presentSolution(result, {
    mode: "explain",
    category: "積分",
  }).content;
  assert.match(explanation, /分類: 積分/u);
  assert.match(explanation, /数値積分/u);

  const record = createHistoryRecord(historyInput({
    question,
    output: result.answer,
    finalAnswer: result.answer,
    category: "その他",
    solverId: result.solverId,
    resultKind: result.resultKind,
    conditions: result.conditions,
    solutionTrace: result.solutionTrace,
    verificationMessage: result.verification,
  }));
  assert.equal(record.category, "積分");
  assert.equal(record.categoryClassification.primary, "積分");
  assert.equal(record.solverId, "polynomial-volume");
  assert.equal(record.resultKind, "exact");
  const roundTrip = JSON.parse(JSON.stringify(record));
  assert.equal(roundTrip.solutionTrace.at(-1).content, "体積: 4*pi");
  assert.equal(roundTrip.verificationMessage, result.verification);
});

test("問題文を公開入口で一度だけ文字列化し経路ごとの意味変更を許さない", async () => {
  function changingInput(first, second) {
    let calls = 0;
    return {
      get calls() {
        return calls;
      },
      [Symbol.toPrimitive]() {
        const output = calls === 0 ? first : second;
        calls += 1;
        return output;
      },
    };
  }

  const directInput = changingInput("not a problem", "2x=2");
  const direct = solveQuestion(directInput);
  assert.equal(direct.verified, false);
  assert.equal(directInput.calls, 1);

  const asyncInput = changingInput("not a problem", "area_[0,1](x;0)");
  const asynchronous = await solveQuestionAsync(asyncInput);
  assert.equal(asynchronous.verified, false);
  assert.equal(asyncInput.calls, 1);

  const volumeInput = changingInput("volume_x_axis_[0,1](x)", "2x=2");
  assertExact(solveQuestion(volumeInput), "pi/3");
  assert.equal(volumeInput.calls, 1);
});
