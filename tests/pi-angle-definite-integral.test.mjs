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
  assert.match(result.verification, /厳密|微分|BigInt|標準角|周期|ラジアン/u, question);
  assert.ok(result.solutionTrace.length >= 5, question);
  assert.equal(result.solutionTrace[0].type, "input", question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "constraint"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "rule"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "transformation"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "verification"), question);
  assert.equal(result.solutionTrace.at(-1).type, "result", question);
  const ruleText = result.solutionTrace
    .filter(({ type }) => type === "rule")
    .map(({ content, explanation }) => `${content} ${explanation}`)
    .join("\n");
  assert.match(ruleText, /sin|cos|三角/u, question);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

async function assertRejected(question, expectedKind = null) {
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

test("有理数倍pi境界の標準角を既存互換の根号でexact化する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^pi sin(x) dx", "2"],
    ["∫_0^(pi/2) cos(x) dx", "1"],
    ["∫_0^(pi/6) cos(x) dx", "1/2"],
    ["∫_0^(pi/4) cos(x) dx", "√2/2"],
    ["∫_0^(pi/3) cos(x) dx", "√3/2"],
    ["∫_0^(pi/3) sin(x) dx", "1/2"],
    ["∫_0^(pi/4) sin(x) dx", "1-√2/2"],
    ["∫_(-pi/4)^(pi/4) cos(x) dx", "√2"],
    ["∫_0^(2*pi) sin(x) dx", "0"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("有理係数・有理傾き・pi位相shiftを標準角表と結合する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^(pi/2) 2sin(2x) dx", "2"],
    ["∫_0^(pi/6) 3cos(3x) dx", "1"],
    ["∫_0^(pi/3) 2sin(2x+pi/3) dx", "3/2"],
    ["∫_0^(pi/2) (1/2)*sin(2x) dx", "1/2"],
    ["∫_0^(pi/3) (3/2)*cos((3/2)x) dx", "1"],
    ["∫_0^(pi/2) 2sin(-2x) dx", "-2"],
    [
      "∫_0^(pi/3) (1/2)*cos((3/2)x+pi/6) dx",
      "√3/6-1/6",
    ],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("非標準角を近似せず周期・奇偶・補角でformal atomへ正規化する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^(pi/5) cos(x) dx", "sin(pi/5)"],
    ["∫_0^(pi/5) sin(x) dx", "1-cos(pi/5)"],
    ["∫_(pi/7)^(2*pi/7) cos(x) dx", "sin(2*pi/7)-sin(pi/7)"],
    ["∫_0^(4*pi/5) cos(x) dx", "sin(pi/5)"],
    ["∫_0^(6*pi/5) cos(x) dx", "-sin(pi/5)"],
    [
      "∫_0^(pi/5) 2sin(2x+pi/5) dx",
      "cos(2*pi/5)+cos(pi/5)",
    ],
    [
      "∫_0^(pi/5) 2cos(2x+pi/5) dx",
      "sin(2*pi/5)-sin(pi/5)",
    ],
    ["∫_0^(pi/8) cos(x) dx", "sin(pi/8)"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("逆順・同一端・zero slopeをpi係数basisでexactに扱う", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_(pi/2)^0 sin(x) dx", "-1"],
    ["∫_(pi/5)^0 cos(x) dx", "-sin(pi/5)"],
    ["∫_(pi/7)^(pi/7) (sin(3x+pi/5)+cos(-2x+pi/3)) dx", "0"],
    ["∫_0^0 sin(pi/5) dx", "0"],
    ["∫_0^pi 3sin(pi/6) dx", "3*pi/2"],
    ["∫_0^pi 2cos(pi/4) dx", "pi*√2"],
    ["∫_0^pi sin(pi/5) dx", "pi*sin(pi/5)"],
    ["∫_pi^0 cos(pi/3) dx", "-pi/2"],
    ["∫_0^pi sin(0) dx", "0"],
    ["∫_0^pi cos(0) dx", "pi"],
    ["∫_0^pi 3sin(-pi/6) dx", "-3*pi/2"],
    ["∫_0^pi cos(-pi/5) dx", "pi*cos(pi/5)"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("異なる三角項から生じる根号・周期formal atomを相殺する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^(pi/4) (sin(x)+cos(x)) dx", "1"],
    ["∫_0^(pi/2) (sin(x)-cos(x)) dx", "0"],
    ["∫_0^pi (sin(x)+sin(-x)) dx", "0"],
    ["∫_0^pi (cos(x)-cos(-x)) dx", "0"],
    ["∫_0^pi (sin(x+2*pi)-sin(x)) dx", "0"],
    ["∫_0^pi (cos(x+2*pi)-cos(x)) dx", "0"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("piとUnicode πの明示的な有理数倍境界表記を同じexact値へ正規化する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^π sin(x) dx", "2"],
    ["∫_0^(π/2) cos(x) dx", "1"],
    ["∫_0^(0.5*pi) cos(x) dx", "1"],
    ["∫_0^((1/4)*pi) cos(x) d x", "√2/2"],
    ["∫_0^(3/4*pi) cos(x) dx", "√2/2"],
    ["∫_(-3*pi/4)^(3*pi/4) cos(x) dx", "√2"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("pi境界でPやexpを部分的に解かず全体をunsupportedに保つ", async () => {
  for (const question of [
    "∫_0^pi x dx",
    "∫_0^pi (x+sin(x)) dx",
    "∫_0^pi exp(x) dx",
    "∫_0^pi (exp(x)+sin(x)) dx",
    "∫_0^pi (x^2+exp(x)+sin(x)+cos(x)) dx",
    "∫_pi^pi (x+sin(x)) dx",
  ]) {
    const result = await assertRejected(question, "unsupported");
    assert.equal(result.supported, false, question);
  }
});

test("mixed/non-rational境界と範囲外のpi依存引数をunsupportedにする", async () => {
  for (const question of [
    "∫_1^pi sin(x) dx",
    "∫_0^(pi+1) sin(x) dx",
    "∫_0^(pi^2) sin(x) dx",
    "∫_0^(sqrt(2)*pi) sin(x) dx",
    "∫_0^(1/pi) sin(x) dx",
    "∫_0^(pi/pi) sin(x) dx",
    "∫_0^infinity sin(x) dx",
    "∫_0^pi sin(pi*x) dx",
    "∫_0^pi cos((pi/2)*x) dx",
    "∫_0^pi sin(x/pi) dx",
    "∫_0^pi sin(x+1) dx",
    "∫_0^pi sin(x+a*pi) dx",
  ]) {
    const result = await assertRejected(question, "unsupported");
    assert.equal(result.supported, false, question);
  }
});

test("非線形・積・冪・変数分母・未対応関数はpi等端でも0へ短絡しない", async () => {
  for (const question of [
    "∫_0^pi sin(x^2) dx",
    "∫_0^pi x*sin(x) dx",
    "∫_0^pi sin(x)*cos(x) dx",
    "∫_0^pi sin(x)^2 dx",
    "∫_0^pi sin(x)/(x+1) dx",
    "∫_0^pi tan(x) dx",
    "∫_0^pi arcsin(x) dx",
    "∫_pi^pi tan(x) dx",
  ]) {
    const result = await assertRejected(question, "unsupported");
    assert.equal(result.supported, false, question);
  }
});

test("壊れたpi境界記法・不完全入力・答え付き入力をinvalidにする", async () => {
  for (const question of [
    "∫_0^(pi/0) sin(x) dx",
    "∫_0^(pi//2) sin(x) dx",
    "∫_0^(2**pi) sin(x) dx",
    "∫_0^(3/4pi) sin(x) dx",
    "∫_0^(pi/2x) sin(x) dx",
    "∫_0^(pi/2 sin(x) dx",
    "∫_0^(pi/2) sin(x)",
    "∫_0^(pi/2) sin(x) dx=1",
  ]) {
    await assertRejected(question, "invalid");
  }
});

test("分類と非同期ルーターがpi角定積分を同じsolverへ接続する", async () => {
  assert.equal(classifyCategory("∫_0^pi sin(x) dx").primary, "積分");

  for (const options of [{}, { category: "積分" }]) {
    const result = await solveQuestionAsync("∫_0^pi sin(x) dx", options);
    assert.equal(result.supported, true, result.error);
    assert.equal(result.solved, true, result.error);
    assert.equal(result.verified, true, result.error);
    assert.equal(result.resultKind, "exact");
    assert.equal(result.solverId, DEFINITE_INTEGRAL_SOLVER_ID);
    assert.equal(result.answer, "2");
  }

  for (const question of [
    "∫_0^pi (x+sin(x)) dx",
    "∫_0^pi sin(pi*x) dx",
  ]) {
    const result = await solveQuestionAsync(question);
    assert.equal(result.verified, false, question);
    assert.equal(result.resultKind, "unsupported", question);
    assert.equal(result.answer, "", question);
  }
});

test("pi角定積分の5表示モードはhintで標準角exact値を漏らさない", async () => {
  const result = await assertExact("∫_0^(pi/4) sin(x) dx", "1-√2/2");
  const outputs = Object.fromEntries(
    ["answer", "hint1", "hint2", "steps", "explain"].map((mode) => [
      mode,
      presentSolution(result, { mode, category: "積分" }),
    ]),
  );

  for (const [mode, output] of Object.entries(outputs)) {
    assert.equal(output.finalAnswer, "1-√2/2", mode);
    assert.ok(output.content, mode);
  }
  assert.equal(outputs.answer.content, "1-√2/2");
  assert.doesNotMatch(outputs.hint1.content, /1-√2\/2|cos\(pi\/4\)=√2\/2/u);
  assert.doesNotMatch(outputs.hint2.content, /1-√2\/2|cos\(pi\/4\)=√2\/2/u);
  assert.match(outputs.hint2.content, /sin|cos|三角|標準角|ラジアン|原始関数/u);
  assert.match(outputs.steps.content, /1-√2\/2/u);
  assert.match(outputs.steps.content, /pi\/4|標準角|sin|cos/u);
  assert.match(outputs.explain.content, /積分/u);
  assert.match(outputs.explain.content, /1-√2\/2/u);
  assert.match(outputs.explain.content, /検算|検証/u);
});

test("pi formal atom・根号・型付きtraceを履歴とJSONへ安全に往復する", async () => {
  const question = "∫_0^pi sin(pi/5) dx";
  const result = await assertExact(question, "pi*sin(pi/5)");
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
  assert.equal(record.output, "pi*sin(pi/5)");
  assert.deepEqual(
    record.solutionTrace.map(({ type }) => type),
    result.solutionTrace.map(({ type }) => type),
  );
  assert.equal(record.solutionTrace.at(-1).type, "result");
  assert.doesNotThrow(() => JSON.stringify(record));
});
