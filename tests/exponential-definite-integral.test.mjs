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
  assert.match(result.verification, /厳密|微分|BigInt|指数/u, question);
  assert.ok(result.solutionTrace.length >= 5, question);
  assert.equal(result.solutionTrace[0].type, "input", question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "rule"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "transformation"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "verification"), question);
  assert.equal(result.solutionTrace.at(-1).type, "result", question);
  assert.equal(
    result.solutionTrace.some(({ content, explanation }) => (
      /exp|指数/u.test(`${content} ${explanation ?? ""}`)
    )),
    true,
    question,
  );
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

async function assertNotVerified(question, expectedKind = null) {
  const result = await solveDefiniteIntegral(question);
  assert.equal(result.solved, false, question);
  assert.equal(result.verified, false, question);
  assert.equal(result.answer, "", question);
  assert.equal(result.exactAnswer, "", question);
  assert.equal(result.approximateAnswer, "", question);
  assert.deepEqual(result.conditions, [], question);
  assert.equal(result.solutionSet, null, question);
  assert.notEqual(result.resultKind, "exact", question);
  assert.notEqual(result.resultKind, "conditional", question);
  if (expectedKind) assert.equal(result.resultKind, expectedKind, question);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

test("指数関数の定積分を指定されたcanonical exact表現で返す", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 exp(x) dx", "exp(1)-1"],
    ["∫_1^0 exp(3x) dx", "1/3-exp(3)/3"],
    ["∫_0^1 2exp(2x+1) dx", "exp(3)-exp(1)"],
    ["∫_0^1 (x+exp(x)) dx", "exp(1)-1/2"],
    ["∫_0^2 3exp(1) dx", "6*exp(1)"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("有理係数・有理線形引数・有理上下限を浮動小数なしで処理する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^2 (1/2)*exp((3/2)x-1) dx", "exp(2)/3-exp(-1)/3"],
    ["∫_(1/2)^(3/2) exp(2x-1) dx", "exp(2)/2-1/2"],
    ["∫_0^1 exp(x+1/2) dx", "exp(3/2)-exp(1/2)"],
    ["∫_0^1 0.5*exp(2x) dx", "exp(2)/4-1/4"],
    ["∫_0^1 2exp(-2x+1) dx", "exp(1)-exp(-1)"],
    ["∫_0^1 (x^32+exp(x)) dx", "exp(1)-32/33"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("和・相殺・逆順・同一端とeの累乗aliasを同じexact代数で扱う", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 e^(x) dx", "exp(1)-1"],
    ["∫_0^1 2e^(2x+1) dx", "exp(3)-exp(1)"],
    ["∫_0^1 e^x*2 dx", "2*exp(1)-2"],
    ["∫_0^1 e^x*0 dx", "0"],
    ["∫_0^2 3e^(1) dx", "6*exp(1)"],
    ["∫_0^1 (exp(x)+2exp(x)) dx", "3*exp(1)-3"],
    ["∫_0^1 (exp(x)-exp(x)) dx", "0"],
    ["∫_0^1 (exp(x)-exp(x)+x^2) dx", "1/3"],
    ["∫_0^1 (exp(x)+exp(-x)) dx", "exp(1)-exp(-1)"],
    ["∫_2^2 (x^4+exp(-3x+1)) dx", "0"],
    ["∫_2^0 3exp(1) dx", "-6*exp(1)"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("線形引数指数和の対応範囲を越える有効な数式はunsupportedにする", async () => {
  for (const question of [
    "∫_0^1 exp(x^2) dx",
    "∫_0^1 e^(x^2) dx",
    "∫_0^1 x*exp(x) dx",
    "∫_0^1 exp(exp(x)) dx",
    "∫_0^1 exp(1/x) dx",
    "∫_0^1 exp(x)/(x+1) dx",
    "∫_0^1 exp(x)/exp(x) dx",
    "∫_0^1 exp(x)*exp(x) dx",
    "∫_0^1 exp(x)^2 dx",
    "∫_0^1 2^x dx",
    "∫_0^1 3^(2x+1) dx",
    "∫_0^1 exp(x+pi) dx",
    "∫_0^1 a*exp(x) dx",
    "∫_0^1 (x^33+exp(x)) dx",
  ]) {
    const result = await assertNotVerified(question, "unsupported");
    assert.equal(result.supported, false, question);
  }
});

test("非有理端点をexact指数積分へ混ぜない", async () => {
  for (const question of [
    "∫_0^pi exp(x) dx",
    "∫_0^(sqrt(2)) exp(x) dx",
    "∫_e^2 exp(x) dx",
    "∫_a^1 exp(x) dx",
    "∫_0^infinity exp(-x) dx",
  ]) {
    const result = await assertNotVerified(question, "unsupported");
    assert.equal(result.supported, false, question);
  }
});

test("曖昧・不完全な指数関数表記を推測して検証済みにしない", async () => {
  for (const question of [
    "∫_0^1 exp x dx",
    "∫_0^1 expx dx",
    "∫_0^1 exp dx",
    "∫_0^1 exp() dx",
    "∫_0^1 exponential(x) dx",
    "∫_0^1 exp(x dx",
    "∫_0^1 exp(x) dx=exp(1)-1",
    "∫_0^1 1e2 dx",
    "∫_0^1 1e-2 dx",
    "∫_0^1 2.5E3 dx",
  ]) {
    await assertNotVerified(question);
  }
});

test("分類と非同期ルーターが指数定積分だけを検証済み結果へ接続する", async () => {
  assert.equal(classifyCategory("∫_0^1 exp(x) dx").primary, "積分");

  for (const options of [{}, { category: "積分" }]) {
    const result = await solveQuestionAsync("∫_0^1 exp(x) dx", options);
    assert.equal(result.supported, true, result.error);
    assert.equal(result.solved, true, result.error);
    assert.equal(result.verified, true, result.error);
    assert.equal(result.resultKind, "exact");
    assert.equal(result.solverId, DEFINITE_INTEGRAL_SOLVER_ID);
    assert.equal(result.answer, "exp(1)-1");
  }

  const nonlinear = await solveQuestionAsync("∫_0^1 exp(x^2) dx");
  assert.equal(nonlinear.verified, false);
  assert.equal(nonlinear.resultKind, "unsupported");
  assert.equal(nonlinear.answer, "");

  const ambiguous = await solveQuestionAsync("∫_0^1 expx dx");
  assert.equal(ambiguous.verified, false);
  assert.equal(ambiguous.answer, "");
});

test("指数定積分の5表示モードはヒントで最終exact値を漏らさない", async () => {
  const result = await assertExact("∫_0^1 exp(x) dx", "exp(1)-1");
  const outputs = Object.fromEntries(
    ["answer", "hint1", "hint2", "steps", "explain"].map((mode) => [
      mode,
      presentSolution(result, { mode, category: "積分" }),
    ]),
  );

  for (const [mode, output] of Object.entries(outputs)) {
    assert.equal(output.finalAnswer, "exp(1)-1", mode);
    assert.ok(output.content, mode);
  }
  assert.equal(outputs.answer.content, "exp(1)-1");
  assert.doesNotMatch(outputs.hint1.content, /exp\(1\)-1|F\(1\)-F\(0\)/u);
  assert.doesNotMatch(outputs.hint2.content, /exp\(1\)-1|F\(1\)-F\(0\)=/u);
  assert.match(outputs.hint2.content, /exp|指数|原始関数|内側/u);
  assert.match(outputs.steps.content, /exp\(1\)-1/u);
  assert.match(outputs.steps.content, /exp|指数/u);
  assert.match(outputs.explain.content, /積分/u);
  assert.match(outputs.explain.content, /exp\(1\)-1/u);
  assert.match(outputs.explain.content, /検算|検証/u);
});

test("指数定積分のexact結果と型付きtraceを履歴へ安全に往復する", async () => {
  const question = "∫_0^1 2exp(2x+1) dx";
  const result = await assertExact(question, "exp(3)-exp(1)");
  const record = createHistoryRecord(historyInput({
    question,
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
  assert.equal(record.output, "exp(3)-exp(1)");
  assert.deepEqual(
    record.solutionTrace.map(({ type }) => type),
    result.solutionTrace.map(({ type }) => type),
  );
  assert.equal(record.solutionTrace.at(-1).type, "result");
  assert.doesNotThrow(() => JSON.stringify(record));
});
