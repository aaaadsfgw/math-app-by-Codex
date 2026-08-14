import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  solveFiniteLimit,
  solveQuestion,
  solveQuestionAsync,
  solveRationalEquation,
} from "../js/solver/index.js";
import { createHistoryRecord } from "../js/storage.js";
import { historyInput } from "./storage-fixtures.mjs";

function assertExact(result, answer) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.solverId, "finite-limit");
  assert.equal(result.answer, answer);
  assert.equal(result.exactAnswer, answer);
  assert.equal(result.approximateAnswer, "");
  assert.deepEqual(result.conditions, []);
  assert.equal(result.solutionSet, null);
  assert.ok(result.solutionTrace.length >= 6);
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

test("有限値・可除穴・入れ子除算を有限有理点で厳密に解く", () => {
  const cases = [
    ["lim_(x->2) x^2+1", "5"],
    ["lim_(x->1) (x^2-1)/(x-1)", "2"],
    ["lim_(x->1) (x-1)/(x-1)", "1"],
    ["lim_(x->1) 1/(1/(x-1))", "0"],
    ["lim_(x->1) 1+0/(x-1)", "1"],
    ["lim_(x->1) (x-1)^0", "1"],
    ["lim_(x->1) 0/(x-1)^4", "0"],
    ["lim_(x->1/2) (2x-1)/(x-1/2)", "2"],
    ["lim_(x->1) (x^4-1)/(x-1)", "4"],
    ["lim_(x->-2) (x^3+8)/(x+2)", "12"],
  ];

  for (const [question, expected] of cases) {
    assertExact(solveFiniteLimit(question), expected);
  }
});

test("奇数・偶数の極と左右方向を厳密に区別する", () => {
  const cases = [
    ["lim_(x->1) 1/(x-1)", "存在しない（左極限=-∞、右極限=+∞）"],
    ["lim_(x->1-) 1/(x-1)", "-∞"],
    ["lim_(x->1+) 1/(x-1)", "+∞"],
    ["lim_(x->1) 1/(1-x)", "存在しない（左極限=+∞、右極限=-∞）"],
    ["lim_(x->1) 1/(x-1)^2", "+∞"],
    ["lim_(x->1) -1/(x-1)^2", "-∞"],
    ["lim_(x->1) 1/(1-x)^3", "存在しない（左極限=+∞、右極限=-∞）"],
    ["lim_(x->0) x^-4", "+∞"],
  ];

  for (const [question, expected] of cases) {
    assertExact(solveFiniteLimit(question), expected);
  }
});

test("分類器と同期・非同期ルーターが有限極限を同じ結果へ送る", async () => {
  const cases = [
    ["lim_(x->2) (x^2-4)/(x-2)", "4"],
    ["\\lim_{x \\to 1^+} 1/(x-1)", "+∞"],
    ["lim x→1 1/(x-1)^2 を求めよ", "+∞"],
    ["xを1に右から近づけるとき 1/(x-1) の極限を求めよ", "+∞"],
    ["xを2に近づけたとき x^2", "4"],
    ["xを2に近づけたとき x^2 の極限を求めよ！", "4"],
    ["xを2に近づく とき x^2", "4"],
    ["lim_(x->1) 1/(x-1) の右極限を求めよ", "+∞"],
  ];

  for (const [question, expected] of cases) {
    assert.equal(classifyCategory(question).primary, "極限", question);
    const direct = solveQuestion(question);
    const asynchronous = await solveQuestionAsync(question);
    assertExact(direct, expected);
    assertExact(asynchronous, expected);
    assert.deepEqual(asynchronous, direct);
  }
});

test("積分語が混ざる不正な極限も同期・非同期で同じinvalidへ送る", async () => {
  for (const question of [
    "積分 lim_(x->1) x",
    "lim_(x->1) x 積分",
  ]) {
    assert.equal(classifyCategory(question).primary, "極限", question);
    const direct = solveQuestion(question);
    const asynchronous = await solveQuestionAsync(question);
    assertRejected(direct, "invalid");
    assert.deepEqual(asynchronous, direct);
  }
});

test("未対応関数を含む極限も式内部のカテゴリに奪わせない", async () => {
  for (const question of [
    "lim_(x->1) log(x)+2^x",
    "lim_(x->0) sin(x)^2",
    "lim_(x->1) exp(x)+cos(x)",
  ]) {
    assert.equal(classifyCategory(question).primary, "極限", question);
    const direct = solveQuestion(question);
    const asynchronous = await solveQuestionAsync(question);
    assertRejected(direct, "unsupported");
    assert.deepEqual(asynchronous, direct);
  }
});

test("未対応の範囲と不正・曖昧な入力を検証済みにしない", () => {
  const unsupported = [
    "lim_(x->∞) 1/x",
    "lim_(t->1) (t^2-1)/(t-1)",
    "tを2に近づけたとき t^2",
    "lim_(x->sqrt(2)) x",
    "lim_(x->0) sin(x)/x",
    "lim_(x->0) 0*sin(x)",
    "lim_(x->0) sin(x)-sin(x)",
    "lim_(x->0) sin(x)^0",
    "lim_(x->0) 0/sin(x)",
    "lim_(x->1) 0*x^5",
    "lim_(x->1) x^5-x^5",
    "lim_(x->1) (x^5)^0",
    "lim_(x->1) 0/x^5",
    "lim_(x->1) x*x*x*x*x",
    "lim_(x->1) x^-5",
  ];
  for (const question of unsupported) {
    assertRejected(solveFiniteLimit(question), "unsupported");
  }

  const invalid = [
    "lim_(x->1)",
    "lim_(x->) x",
    "lim_(x->1) x=1",
    "lim_(x->1 2) x",
    "lim_(x->1e2) x",
    "lim_(x->pi2) x",
    "lim_(x->e2) x",
    "lim_(x->1) 1/2x",
    "lim_(x->1+) 1/(x-1) の左極限を求めよ",
    "lim_(x->1) 1/(x-x)",
    "lim_(x->1) 0*(1/(x-x))",
    "lim_(x->1) 5!",
    "lim_(x->1) (x+2)!",
    "lim_(x->1) 5!!",
    "lim_(x->1) e2",
    "lim_(t->2) t=",
    "lim_(x->∞) x=",
  ];
  for (const question of invalid) {
    assertRejected(solveFiniteLimit(question), "invalid");
  }
});

test("極限専用の4次範囲を既存有理方程式へ漏らさない", () => {
  assertExact(solveFiniteLimit("lim_(x->2) x^4"), "16");
  assertExact(solveFiniteLimit("lim_(x->2) x*x*x*x"), "16");
  assertExact(solveFiniteLimit("lim_(x->2) x^-4"), "1/16");

  const equation = solveRationalEquation("x^3=1");
  assert.equal(equation.verified, false);
  assert.equal(equation.resultKind, "unsupported");
});

test("ヒントは極限の最終値を漏らさず、履歴は極限へ分類する", () => {
  const result = solveFiniteLimit("lim_(x->1+) 1/(x-1)");
  assertExact(result, "+∞");

  assert.equal(presentSolution(result, { mode: "answer" }).content, "+∞");
  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  assert.match(hint1, /零点次数/u);
  assert.doesNotMatch(hint1, /[+-]∞|存在しない/u);
  assert.doesNotMatch(hint2, /[+-]∞|存在しない/u);

  const steps = presentSolution(result, { mode: "steps" }).content;
  assert.match(steps, /左極限=-∞、右極限=\+∞/u);
  assert.match(steps, /極限: \+∞/u);

  const explanation = presentSolution(result, {
    mode: "explain",
    category: "極限",
  }).content;
  assert.match(explanation, /分類: 極限/u);
  assert.match(explanation, /最終回答: \+∞/u);

  const record = createHistoryRecord(historyInput({
    question: "lim_(x->1+) 1/(x-1)",
    output: result.answer,
    finalAnswer: result.answer,
    category: "その他",
    solverId: result.solverId,
    resultKind: result.resultKind,
    solutionTrace: result.solutionTrace,
    verificationMessage: result.verification,
  }));
  assert.equal(record.category, "極限");
  assert.equal(record.categoryClassification.primary, "極限");
  assert.equal(record.resultKind, "exact");
  assert.deepEqual(record.conditions, []);
  assert.equal(record.solutionTrace.at(-1).type, "result");
});

test("問題全体の長さ上限を正規化前に拒否する", () => {
  const result = solveFiniteLimit(`lim_(x->1) ${"x+".repeat(2_500)}x`);
  assertRejected(result, "invalid");
  assert.match(result.error, /長すぎ/u);
});
