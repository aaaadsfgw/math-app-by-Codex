import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  DEFINITE_INTEGRAL_SOLVER_ID,
  solveDefiniteIntegral,
} from "../js/solver/calculus.js";
import { solveQuestionAsync } from "../js/solver/index.js";
import { createHistoryRecord } from "../js/storage.js";
import { historyInput } from "./storage-fixtures.mjs";

async function assertExact(question, expectedAnswer) {
  const result = await solveDefiniteIntegral(question);
  assert.equal(result.supported, true, `${question}: ${result.error}`);
  assert.equal(result.solved, true, `${question}: ${result.error}`);
  assert.equal(result.verified, true, `${question}: ${result.error}`);
  assert.equal(result.solverId, DEFINITE_INTEGRAL_SOLVER_ID, question);
  assert.equal(result.resultKind, "exact", question);
  assert.equal(result.answer, expectedAnswer, question);
  assert.equal(result.exactAnswer, expectedAnswer, question);
  assert.equal(result.approximateAnswer, "", question);
  assert.deepEqual(result.conditions, [], question);
  assert.equal(result.solutionSet, null, question);
  assert.match(result.verification, /厳密|BigInt|分数/u, question);
  assert.ok(result.solutionTrace.length >= 5, question);
  assert.equal(result.solutionTrace[0].type, "input", question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "rule"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "verification"), question);
  assert.equal(result.solutionTrace.at(-1).type, "result", question);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

async function assertNotVerified(question) {
  const result = await solveDefiniteIntegral(question);
  assert.equal(result.solved, false, question);
  assert.equal(result.verified, false, question);
  assert.equal(result.answer, "", question);
  assert.notEqual(result.resultKind, "exact", question);
  assert.notEqual(result.resultKind, "conditional", question);
  return result;
}

test("有理係数多項式を有理上下限で項別に厳密積分する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 x^2 dx", "1/3"],
    ["∫_(-2)^1 (3x^2-2x+1) dx", "15"],
    ["∫_(1/2)^(3/2) (2x+1) dx", "3"],
    ["∫_0.1^0.3 x dx", "1/25"],
    ["∫_(-1)^3 5/2 dx", "10"],
    ["∫_0^2 x/2 dx", "1"],
    ["∫_0^1 0 dx", "0"],
    ["∫_0^1 x^32 dx", "1/33"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("標準記法・括弧付き境界・日本語・全角入力を全面一致で解釈する", async () => {
  for (const question of [
    "∫_0^1 x^2dx",
    "∫_(0)^(1) x^2 dx",
    "∫_{0}^{1} x^2 dx",
    "0から1まで x^2 を定積分せよ",
    "x^2を0から1まで定積分せよ",
    "0から1まで x^2 を積分せよ",
    "x^2を0から1まで積分せよ",
    "∫_０^１ ｘ² ｄｘ",
  ]) {
    await assertExact(question, "1/3");
  }
});

test("逆順境界は符号を反転し、同一境界は定義済み多項式についてだけ0にする", async () => {
  await assertExact("∫_1^0 x^2 dx", "-1/3");
  await assertExact("∫_3^(-1) 5/2 dx", "-10");
  await assertExact("∫_2^2 (x^32-7x+4) dx", "0");

  const undefinedAtEqualBound = await assertNotVerified("∫_0^0 1/x dx");
  assert.equal(undefinedAtEqualBound.resultKind, "unsupported");
});

test("固定境界で定義域を解決済みでも初期範囲外の結果をconditionalで通さない", async () => {
  for (const question of [
    "∫_1^2 1/x dx",
    "∫_1^2 log(x) dx",
    "∫_0^1 sqrt(x) dx",
    "∫_0^1 pi*x dx",
    "∫_0^1 e*x dx",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.resultKind, "unsupported", question);
    assert.equal(result.conditions.length, 0, question);
  }
});

test("変数分母と負指数は穴が区間内外のどこにあっても多項式として受理しない", async () => {
  for (const question of [
    "∫_0^1 1/(x-2) dx",
    "∫_0^1 1/(x^2+1) dx",
    "∫_0^1 (x^2-4)/(x-2) dx",
    "∫_0^2 (x^2-1)/(x-1) dx",
    "∫_0^1 0/(x-2) dx",
    "∫_1^2 x^-1 dx",
    "∫_1^2 (x-10)^-2 dx",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.resultKind, "unsupported", question);
    assert.match(result.error, /多項式|分母|負の指数|穴/u, question);
  }
});

test("端点・内部の特異点と無限境界を広義積分として推測しない", async () => {
  for (const question of [
    "∫_0^1 1/x dx",
    "∫_(-1)^1 1/x dx",
    "∫_0^2 1/(x-1) dx",
    "∫_1^2 1/(x-1) dx",
    "∫_0^infinity x^2 dx",
    "∫_(-infinity)^0 x^2 dx",
    "0から∞まで x^2 を定積分せよ",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.resultKind, "unsupported", question);
  }
});

test("有理数でない境界・変数境界・複素定数を初期対応へ混ぜない", async () => {
  for (const question of [
    "∫_0^pi x dx",
    "∫_0^(sqrt(2)) x dx",
    "∫_0^e x dx",
    "∫_0^i x dx",
    "∫_0^a x dx",
    "∫_x^1 x dx",
    "aから1まで x を定積分せよ",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.resultKind, "unsupported", question);
    assert.equal(result.conditions.length, 0, question);
  }
});

test("次数上限・非整数指数・0の0乗を安全な未対応または不正入力にする", async () => {
  for (const question of [
    "∫_0^1 x^33 dx",
    "∫_0^1 (x+1)^33 dx",
    "∫_0^1 x^(1/2) dx",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.resultKind, "unsupported", question);
  }

  for (const question of [
    "∫_0^1 0^0 dx",
    "∫_0^1 (x-x)^0 dx",
    "∫_0^1 1/0 dx",
  ]) {
    await assertNotVerified(question);
  }
});

test("不完全記法・答え付き等式・余分な関係式を部分的に解かない", async () => {
  for (const question of [
    "∫ x^2 dx",
    "∫_^1 x^2 dx",
    "∫_0^ x^2 dx",
    "∫_0^1 dx",
    "∫_0^1 x^2",
    "∫_0^1 x^2 dy",
    "∫_0^1 x^2 dx=1/3",
    "∫_0^1 x^2 dx<1",
    "∫_0^1 x^2 dx garbage",
    "0から1まで定積分せよ",
    "定積分を求めよ",
  ]) {
    await assertNotVerified(question);
  }
});

test("曖昧な割り算範囲と数字の暗黙積を検証済みにしない", async () => {
  for (const question of [
    "∫_0^1 1/2x dx",
    "∫_0^1 x/2x dx",
    "∫_0^1 x2 dx",
    "∫_0^1 x 2 dx",
    "∫_0^1 1 2 dx",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.resultKind, "invalid", question);
  }
});

test("危険な入力と過大入力を実行せず検証済みにしない", async () => {
  for (const question of [
    "∫_0^1 globalThis.process.exit() dx",
    "∫_0^1 x;alert(1) dx",
    "∫_0^1 constructor(x) dx",
    "∫_0^1 x\nprocess.exit() dx",
    `∫_0^1 ${"1".repeat(5_001)} dx`,
  ]) {
    await assertNotVerified(question);
  }
});

test("分類・非同期ルーター・認識済み未対応理由を定積分へ接続する", async () => {
  assert.equal(classifyCategory("∫_0^1 x^2 dx").primary, "積分");

  for (const options of [{}, { category: "積分" }]) {
    const routed = await solveQuestionAsync("∫_0^1 x^2 dx", options);
    assert.equal(routed.verified, true, routed.error);
    assert.equal(routed.solverId, DEFINITE_INTEGRAL_SOLVER_ID);
    assert.equal(routed.answer, "1/3");
  }

  const unsupported = await solveQuestionAsync("∫_0^1 tan(x) dx");
  assert.equal(unsupported.verified, false);
  assert.equal(unsupported.resultKind, "unsupported");
  assert.match(unsupported.error, /三角関数|有限和|対応/u);
});

test("定積分の検証済み履歴から5つの表示モードを安全に生成する", async () => {
  const result = await assertExact("∫_0^1 x^2 dx", "1/3");
  const outputs = Object.fromEntries(
    ["answer", "hint1", "hint2", "steps", "explain"].map((mode) => [
      mode,
      presentSolution(result, { mode, category: "積分" }),
    ]),
  );

  for (const [mode, output] of Object.entries(outputs)) {
    assert.equal(output.finalAnswer, "1/3", mode);
    assert.ok(output.content, mode);
  }
  assert.equal(outputs.answer.content, "1/3");
  assert.doesNotMatch(outputs.hint1.content, /1\/3|F\(1\)-F\(0\)/u);
  assert.doesNotMatch(outputs.hint2.content, /1\/3|F\(1\)-F\(0\)|上端値.*下端値.*1\/3/u);
  assert.match(outputs.steps.content, /1\/3/u);
  assert.match(outputs.steps.content, /上端|下端|F\(1\)|原始関数/u);
  assert.match(outputs.explain.content, /分類: 積分/u);
  assert.match(outputs.explain.content, /最終回答: 1\/3/u);
  assert.match(outputs.explain.content, /検算:/u);
});

test("定積分のexact結果・型付き履歴・積分分類を保存往復で維持する", async () => {
  const result = await assertExact("∫_0^1 x^2 dx", "1/3");
  const record = createHistoryRecord(historyInput({
    question: "∫_0^1 x^2 dx",
    output: result.answer,
    finalAnswer: result.answer,
    category: "その他",
    solverId: result.solverId,
    resultKind: result.resultKind,
    conditions: result.conditions,
    solutionTrace: result.solutionTrace,
    solutionSet: result.solutionSet,
    verificationMessage: result.verification,
  }));

  assert.equal(record.category, "積分");
  assert.equal(record.categoryClassification.primary, "積分");
  assert.equal(record.resultKind, "exact");
  assert.deepEqual(record.conditions, []);
  assert.equal(record.solutionSet, null);
  assert.equal(record.solverId, DEFINITE_INTEGRAL_SOLVER_ID);
  assert.deepEqual(
    record.solutionTrace.map(({ type }) => type),
    result.solutionTrace.map(({ type }) => type),
  );
  assert.equal(record.solutionTrace.at(-1).type, "result");
});
