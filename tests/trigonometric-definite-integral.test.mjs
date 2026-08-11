import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  DEFINITE_INTEGRAL_SOLVER_ID,
  solveDefiniteIntegral,
} from "../js/solver/calculus.js";
import { parseDefiniteIntegralInput } from "../js/solver/definite-integral-input.js";
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
  assert.match(result.verification, /厳密|微分|BigInt|三角関数/u, question);
  assert.ok(result.solutionTrace.length >= 5, question);
  assert.equal(result.solutionTrace[0].type, "input", question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "rule"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "transformation"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "verification"), question);
  assert.equal(result.solutionTrace.at(-1).type, "result", question);
  const rules = result.solutionTrace
    .filter(({ type }) => type === "rule")
    .map(({ content, explanation }) => `${content} ${explanation}`)
    .join("\n");
  assert.match(rules, /sin|cos|三角/u, question);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

async function assertNotVerified(question, expectedKind = "unsupported") {
  const result = await solveDefiniteIntegral(question);
  assert.equal(result.solved, false, question);
  assert.equal(result.verified, false, question);
  assert.equal(result.answer, "", question);
  assert.equal(result.exactAnswer, "", question);
  assert.equal(result.approximateAnswer, "", question);
  assert.deepEqual(result.conditions, [], question);
  assert.equal(result.solutionSet, null, question);
  assert.equal(result.resultKind, expectedKind, question);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

test("affine sin/cosの必須例をradian formal atomでexactに返す", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 sin(x) dx", "1-cos(1)"],
    ["∫_0^1 cos(x) dx", "sin(1)"],
    ["∫_0^1 2sin(2x+1) dx", "cos(1)-cos(3)"],
    ["∫_0^1 3cos(3x) dx", "sin(3)"],
    [
      "∫_0^1 (x+exp(x)+sin(x)+cos(x)) dx",
      "exp(1)+1/2+sin(1)-cos(1)",
    ],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("正項優先とexp系(Q=exp(0))→sin→cosのcanonical順を固定する", async () => {
  for (const [question, expectedAnswer] of [
    [
      "∫_0^1 (exp(2x)+cos(2x)+sin(3x)) dx",
      "exp(2)/2+sin(2)/2-1/6-cos(3)/3",
    ],
    [
      "∫_0^1 (2cos(3x)+cos(x)+2sin(2x)+sin(x)) dx",
      "2+2*sin(3)/3+sin(1)-cos(2)-cos(1)",
    ],
    ["∫_0^1 (sin(x)+cos(x)+exp(x)) dx", "exp(1)+sin(1)-cos(1)"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("負引数のsin奇関数・cos偶関数と同一atom相殺を正規化する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_(-1)^1 sin(x) dx", "0"],
    ["∫_(-1)^1 cos(x) dx", "2*sin(1)"],
    ["∫_0^1 sin(-x) dx", "cos(1)-1"],
    ["∫_0^1 cos(-x) dx", "sin(1)"],
    ["∫_0^1 (sin(x)+sin(-x)) dx", "0"],
    ["∫_0^1 (cos(x)-cos(-x)) dx", "0"],
    ["∫_(-1)^0 sin(x) dx", "cos(1)-1"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("逆順・同一端・傾き0とsin(0)/cos(0)の規則をexactに適用する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_1^0 sin(x) dx", "cos(1)-1"],
    ["∫_1^0 cos(x) dx", "-sin(1)"],
    ["∫_2^2 (x^32+exp(x)+sin(3x-1)+cos(-2x)) dx", "0"],
    ["∫_0^2 3sin(1) dx", "6*sin(1)"],
    ["∫_0^2 3sin(-1) dx", "-6*sin(1)"],
    ["∫_0^2 3cos(-1) dx", "6*cos(1)"],
    ["∫_0^2 3sin(0) dx", "0"],
    ["∫_0^2 3cos(0) dx", "6"],
    ["∫_0^1 0*sin(x) dx", "0"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("分数係数・分数線形引数・分数境界をBigInt分数のまま処理する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 (1/2)*sin(2x) dx", "1/4-cos(2)/4"],
    ["∫_0^1 (3/2)*cos(3x) dx", "sin(3)/2"],
    ["∫_(1/2)^(3/2) sin(2x-1) dx", "1/2-cos(2)/2"],
    ["∫_0^1 cos((1/2)x+1/2) dx", "2*sin(1)-2*sin(1/2)"],
    ["∫_0^1 (1/3)*sin((3/2)x-1/2) dx", "2*cos(1/2)/9-2*cos(1)/9"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("入力parserが三角関数を含む完全な定積分記法だけを境界付きで渡す", async () => {
  const parsed = parseDefiniteIntegralInput(
    "∫_(-1/2)^(3/2) (sin(2x+1)+cos(x)+exp(x)) d x",
  );
  assert.equal(parsed.recognized, true);
  assert.equal(parsed.ok, true, parsed.error);
  assert.equal(parsed.lowerSource, "-1/2");
  assert.equal(parsed.upperSource, "3/2");
  assert.equal(parsed.expression, "(sin(2x+1)+cos(x)+exp(x))");

  for (const question of [
    "∫_(0)^(1) sin(x) d x",
    "∫_{0}^{1} sin(x) dx",
    "0から1まで sin(x) を定積分せよ",
    "sin(x)を0から1まで定積分せよ",
  ]) {
    await assertExact(question, "1-cos(1)");
  }
});

test("非線形・積・冪・変数分母・tanを部分的にverifiedへ昇格しない", async () => {
  for (const question of [
    "∫_0^1 sin(x^2) dx",
    "∫_0^1 cos(x^2+1) dx",
    "∫_0^1 cos(1/x) dx",
    "∫_0^1 sin(exp(x)) dx",
    "∫_0^1 x*sin(x) dx",
    "∫_0^1 sin(x)*cos(x) dx",
    "∫_0^1 exp(x)*sin(x) dx",
    "∫_0^1 sin(x)^2 dx",
    "∫_0^1 cos(x)^3 dx",
    "∫_0^1 sin(x)/(x+1) dx",
    "∫_0^1 tan(2x+1) dx",
    "∫_0^1 arcsin(x) dx",
    "∫_0^1 sin((pi+1)*x) dx",
    "∫_0^1 0*sin(1/x) dx",
    "∫_0^1 sin(1/x)-sin(1/x) dx",
    "∫_0^1 sin(x)^0 dx",
    "∫_0^1 0/sin(x) dx",
    "∫_0^0 sin(1/x) dx",
    "∫_0^0 0/sin(x) dx",
    "∫_0^0 sin(x)^0 dx",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.supported, false, question);
  }

  const tangent = await assertNotVerified("∫_0^1 tan(x) dx");
  assert.match(tangent.error, /三角関数|sin|cos/u);
});

test("曖昧な係数・除算範囲・科学記数法を三角関数として推測しない", async () => {
  for (const question of [
    "∫_0^1 1/2sin(x) dx",
    "∫_0^1 sin(x)/2x dx",
    "∫_0^1 sin(1/2x) dx",
    "∫_0^1 cos(x/2x) dx",
    "∫_0^1 1e2*sin(x) dx",
    "∫_0^1 sin(1e-2*x) dx",
  ]) {
    const result = await assertNotVerified(question, "invalid");
    assert.equal(result.supported, true, question);
  }
});

test("sin・cosを各32項まで受理し、各familyの33項目を安全に拒否する", async () => {
  const sines = Array(32).fill("sin(x)");
  const cosines = Array(32).fill("cos(x)");
  await assertExact(
    `∫_0^1 (${[...sines, ...cosines].join("+")}) dx`,
    "32+32*sin(1)-32*cos(1)",
  );

  for (const terms of [
    [...sines, "sin(x)"],
    [...cosines, "cos(x)"],
  ]) {
    const result = await assertNotVerified(`∫_0^1 (${terms.join("+")}) dx`);
    assert.match(result.error, /それぞれ32個/u);
  }
});

test("mixed pi・無理数・無限境界をradian formal atom対応と混同しない", async () => {
  for (const question of [
    "∫_1^pi sin(x) dx",
    "∫_0^(pi+1) cos(x) dx",
    "∫_0^(sqrt(2)) sin(x) dx",
    "∫_e^2 cos(x) dx",
    "∫_0^infinity sin(x) dx",
  ]) {
    const result = await assertNotVerified(question);
    assert.equal(result.supported, false, question);
  }
});

test("分類と非同期ルーターが三角関数定積分を同じsolverへ接続する", async () => {
  assert.equal(classifyCategory("∫_0^1 sin(x) dx").primary, "積分");

  for (const options of [{}, { category: "積分" }]) {
    const result = await solveQuestionAsync("∫_0^1 sin(x) dx", options);
    assert.equal(result.supported, true, result.error);
    assert.equal(result.solved, true, result.error);
    assert.equal(result.verified, true, result.error);
    assert.equal(result.resultKind, "exact");
    assert.equal(result.solverId, DEFINITE_INTEGRAL_SOLVER_ID);
    assert.equal(result.answer, "1-cos(1)");
  }

  const nonlinear = await solveQuestionAsync("∫_0^1 sin(x^2) dx");
  assert.equal(nonlinear.verified, false);
  assert.equal(nonlinear.resultKind, "unsupported");
  assert.equal(nonlinear.answer, "");
});

test("三角関数定積分の5表示モードはhintで最終exact値を漏らさない", async () => {
  const result = await assertExact("∫_0^1 sin(x) dx", "1-cos(1)");
  const outputs = Object.fromEntries(
    ["answer", "hint1", "hint2", "steps", "explain"].map((mode) => [
      mode,
      presentSolution(result, { mode, category: "積分" }),
    ]),
  );

  for (const [mode, output] of Object.entries(outputs)) {
    assert.equal(output.finalAnswer, "1-cos(1)", mode);
    assert.ok(output.content, mode);
  }
  assert.equal(outputs.answer.content, "1-cos(1)");
  assert.doesNotMatch(outputs.hint1.content, /1-cos\(1\)|F\(1\)-F\(0\)/u);
  assert.doesNotMatch(outputs.hint2.content, /1-cos\(1\)|F\(1\)-F\(0\)=/u);
  assert.match(outputs.hint2.content, /sin|cos|三角|原始関数|内側/u);
  assert.match(outputs.steps.content, /1-cos\(1\)/u);
  assert.match(outputs.steps.content, /sin|cos|三角/u);
  assert.match(outputs.explain.content, /積分/u);
  assert.match(outputs.explain.content, /1-cos\(1\)/u);
  assert.match(outputs.explain.content, /検算|検証/u);
});

test("三角関数formal atomと型付きtraceを履歴・JSONへ安全に往復する", async () => {
  const question = "∫_0^1 2sin(2x+1) dx";
  const result = await assertExact(question, "cos(1)-cos(3)");
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
  assert.equal(record.output, "cos(1)-cos(3)");
  assert.deepEqual(
    record.solutionTrace.map(({ type }) => type),
    result.solutionTrace.map(({ type }) => type),
  );
  assert.equal(record.solutionTrace.at(-1).type, "result");
  assert.doesNotThrow(() => JSON.stringify(record));
});
