import assert from "node:assert/strict";
import test from "node:test";

import { OUTPUT_MODES, presentSolution } from "../js/solution-presenter.js";
import {
  solveQuestion,
  solveQuestionAsync,
} from "../js/solver/index.js";
import { createHistoryRecord } from "../js/storage.js";
import { historyInput } from "./storage-fixtures.mjs";

const SOLVER_ID = "polynomial-concavity";
const QUESTION = "concavity_inflection(x^3-3x+2)";
const EXPECTED = "下に凸: (0,+∞); 上に凸: (-∞,0); 変曲点: (0, 2)";

function assertExactConcavity(result, expected = EXPECTED) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.solverId, SOLVER_ID);
  assert.equal(result.answer, expected);
  assert.equal(result.exactAnswer, expected);
  assert.equal(result.approximateAnswer, "");
  assert.deepEqual(result.conditions, []);
}

test("公開同期・非同期入口は誤カテゴリ指定でもconcavity preflightへ到達する", async () => {
  for (const question of [
    QUESTION,
    "関数 y=x^3-3x+2 の凹凸と変曲点を求めよ",
  ]) {
    const direct = solveQuestion(question);
    const wrongCategory = solveQuestion(question, { category: "数列" });
    const asynchronous = await solveQuestionAsync(question);
    const asynchronousWrongCategory = await solveQuestionAsync(question, {
      category: "二次方程式",
    });

    for (const result of [
      direct,
      wrongCategory,
      asynchronous,
      asynchronousWrongCategory,
    ]) {
      assertExactConcavity(result);
    }
    assert.deepEqual(wrongCategory, direct);
    assert.deepEqual(asynchronous, direct);
    assert.deepEqual(asynchronousWrongCategory, direct);
  }
});

test("concavity preflightの順序は既存8系統を同期・非同期で横取りしない", async () => {
  for (const [question, solverId] of [
    ["tangent_x_[1](x^2)", "polynomial-tangent"],
    ["normal_x_[1](x^2)", "polynomial-normal"],
    ["monotonicity(x^3)", "polynomial-variation"],
    ["lim_(x->0) x", "finite-limit"],
    ["area_[0,1](x;0)", "polynomial-area"],
    ["volume_x_axis_[0,1](x)", "polynomial-volume"],
    ["x^2=4", "quadratic-equation"],
  ]) {
    const direct = solveQuestion(question);
    const asynchronous = await solveQuestionAsync(question);
    for (const result of [direct, asynchronous]) {
      assert.equal(result.verified, true, result.error || question);
      assert.equal(result.solverId, solverId, question);
      assert.notEqual(result.solverId, SOLVER_ID, question);
    }
    assert.deepEqual(asynchronous, direct);
  }

  const derivative = await solveQuestionAsync("f(x)=x^2を微分せよ", {
    category: "微分",
    symbolicOperations: {
      simplify: async () => "2*x",
      equivalent: async () => true,
    },
  });
  assert.equal(derivative.verified, true, derivative.error);
  assert.equal(derivative.solverId, "derivative");
  assert.notEqual(derivative.solverId, SOLVER_ID);
});

test("5表示モードは完成した凹凸区間・変曲点座標をhint1・hint2へ漏らさない", () => {
  const result = solveQuestion(QUESTION);
  assertExactConcavity(result);

  const outputs = Object.fromEntries(OUTPUT_MODES.map((mode) => [
    mode,
    presentSolution(result, { mode, category: "微分" }),
  ]));
  for (const mode of OUTPUT_MODES) {
    assert.equal(outputs[mode].finalAnswer, EXPECTED, mode);
    assert.ok(outputs[mode].content, mode);
  }

  assert.equal(outputs.answer.content, EXPECTED);
  assert.match(outputs.hint1.content, /二階導関数/u);
  for (const mode of ["hint1", "hint2"]) {
    const hint = outputs[mode].content;
    assert.doesNotMatch(hint, /下に凸:|上に凸:|変曲点:/u, mode);
    assert.doesNotMatch(hint, /\(0,\+∞\)|\(-∞,0\)|\(0,\s*2\)/u, mode);
    assert.doesNotMatch(hint, new RegExp(EXPECTED.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"), mode);
  }
  assert.match(outputs.steps.content, new RegExp(`凹凸・変曲点: ${EXPECTED.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
  assert.match(outputs.explain.content, /分類: 微分/u);
  assert.match(outputs.explain.content, new RegExp(`最終回答: ${EXPECTED.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}`, "u"));
  assert.match(outputs.explain.content, /BigInt|厳密/u);
});

test("検証済みconcavity履歴は誤カテゴリを微分へ強制しJSON往復で証拠を保つ", () => {
  const result = solveQuestion(QUESTION);
  assertExactConcavity(result);

  const record = createHistoryRecord(historyInput({
    question: QUESTION,
    output: result.answer,
    finalAnswer: result.answer,
    category: "その他",
    solverId: result.solverId,
    resultKind: result.resultKind,
    conditions: result.conditions,
    solutionTrace: result.solutionTrace,
    verificationMessage: result.verification,
  }));

  assert.equal(record.category, "微分");
  assert.equal(record.categoryClassification.primary, "微分");
  assert.equal(record.solverId, SOLVER_ID);
  assert.equal(record.resultKind, "exact");
  assert.deepEqual(record.conditions, []);

  const roundTrip = JSON.parse(JSON.stringify(record));
  assert.deepEqual(roundTrip, record);
  assert.equal(roundTrip.finalAnswer, EXPECTED);
  assert.equal(roundTrip.solutionTrace.at(-1).content, `凹凸・変曲点: ${EXPECTED}`);
  assert.equal(roundTrip.verificationMessage, result.verification);
});
