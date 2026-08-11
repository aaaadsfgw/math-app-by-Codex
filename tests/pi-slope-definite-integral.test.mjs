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
  assert.match(result.verification, /BigInt|厳密|1\/pi|標準角|周期/u, question);
  assert.ok(result.solutionTrace.length >= 5, question);
  assert.equal(result.solutionTrace[0].type, "input", question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "constraint"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "rule"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "transformation"), question);
  assert.ok(result.solutionTrace.some(({ type }) => type === "verification"), question);
  assert.equal(result.solutionTrace.at(-1).type, "result", question);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

async function assertRejected(question, expectedKind = "unsupported") {
  const result = await solveDefiniteIntegral(question);
  assert.equal(result.solved, false, question);
  assert.equal(result.verified, false, question);
  assert.equal(result.answer, "", question);
  assert.equal(result.exactAnswer, "", question);
  assert.equal(result.approximateAnswer, "", question);
  assert.deepEqual(result.conditions, [], question);
  assert.equal(result.solutionSet, null, question);
  assert.equal(result.resultKind, expectedKind, `${question}: ${result.error}`);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

test("有理数区間のpi係数傾斜を1/pi basisでexactに積分する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 sin(pi*x) dx", "2/pi"],
    ["∫_0^1 cos(pi*x/2) dx", "2/pi"],
    ["∫_0^1 sin(pi*x+pi/3) dx", "1/pi"],
    ["∫_0^1 cos(pi*x+pi/6) dx", "-1/pi"],
    ["∫_0^1 3sin(3*pi*x+pi/6) dx", "√3/pi"],
    ["∫_0^1 (1/3)*sin((2*pi/3)*x) dx", "3/(4*pi)"],
    ["∫_0^1 (3/2)*cos((3*pi/2)*x) dx", "-1/pi"],
    ["∫_(1/2)^(3/2) sin(pi*x-pi/2) dx", "2/pi"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("15度標準角を1/pi付きの既存根号basisへ展開する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 cos(pi*x/12) dx", "3*√6/pi-3*√2/pi"],
    ["∫_0^1 sin(pi*x/12) dx", "12/pi-3*√6/pi-3*√2/pi"],
    ["∫_0^1 cos(5*pi*x/12) dx", "3*√6/(5*pi)+3*√2/(5*pi)"],
    [
      "∫_0^1 sin(5*pi*x/12) dx",
      "12/(5*pi)+3*√2/(5*pi)-3*√6/(5*pi)",
    ],
    ["∫_0^1 sin(pi/12) dx", "√6/4-√2/4"],
    ["∫_0^1 cos(pi/12) dx", "√6/4+√2/4"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("非標準pi角を丸めず周期formal atomとして保持する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 cos(pi*x/5) dx", "5*sin(pi/5)/pi"],
    ["∫_0^1 sin(pi*x/5) dx", "5/pi-5*cos(pi/5)/pi"],
    ["∫_(1/7)^(2/7) cos(pi*x) dx", "sin(2*pi/7)/pi-sin(pi/7)/pi"],
    ["∫_0^1 cos(4*pi*x/5) dx", "5*sin(pi/5)/(4*pi)"],
    ["∫_0^1 cos(6*pi*x/5) dx", "-5*sin(pi/5)/(6*pi)"],
    [
      "∫_0^1 sin(2*pi*x/5+pi/5) dx",
      "5*cos(2*pi/5)/(2*pi)+5*cos(pi/5)/(2*pi)",
    ],
    [
      "∫_0^1 cos(2*pi*x/5+pi/5) dx",
      "5*sin(2*pi/5)/(2*pi)-5*sin(pi/5)/(2*pi)",
    ],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("逆順・同一端・zero slopeと複数項相殺をexactに扱う", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_1^0 sin(pi*x) dx", "-2/pi"],
    ["∫_0^1 sin(-pi*x) dx", "-2/pi"],
    ["∫_0^1 cos(-pi*x+pi/2) dx", "2/pi"],
    ["∫_0^2 3sin(pi/6) dx", "3"],
    ["∫_0^2 3cos(pi/4) dx", "3*√2"],
    ["∫_0^2 sin(pi/5) dx", "2*sin(pi/5)"],
    ["∫_2^0 cos(pi/3) dx", "-1"],
    ["∫_(2/3)^(2/3) sin(7*pi*x/5+pi/11) dx", "0"],
    ["∫_0^1 sin((pi-pi)*x) dx", "0"],
    ["∫_0^1 cos(0*pi*x) dx", "1"],
    ["∫_0^1 (sin(pi*x)+sin(-pi*x)) dx", "0"],
    ["∫_0^1 (cos(pi*x)-cos(-pi*x)) dx", "0"],
    ["∫_0^1 (sin(pi*x)-cos(pi*x/2)) dx", "0"],
    ["∫_0^1 (sin(pi*x)+sin(3*pi*x)) dx", "8/(3*pi)"],
  ]) {
    await assertExact(question, expectedAnswer);
  }
});

test("pi傾斜の暗黙積は既存規則内だけ受理して同じAST意味へ固定する", async () => {
  for (const [question, expectedAnswer] of [
    ["∫_0^1 sin(πx) dx", "2/pi"],
    ["∫_0^1 sin(2pi*x) dx", "0"],
    ["∫_0^1 sin(x*pi) dx", "2/pi"],
    ["∫_0^1 sin((pi/2)*x) dx", "2/pi"],
    ["∫_0^1 sin((1/2)*pi*x) dx", "2/pi"],
    ["∫_0^1 sin(pi*x/2) dx", "2/pi"],
    ["∫_0^1 sin(3*pi*x/2) dx", "2/(3*pi)"],
    ["∫_0^1 sin(0.5*pi*x) dx", "2/pi"],
    ["∫_0^1 sin(pi*x+pi/6) dx", "√3/pi"],
    ["∫_0^1 sin(pi*(x+1/3)) dx", "1/pi"],
    ["∫_0^1 sin((x+1/3)*pi) dx", "1/pi"],
    ["∫_0^1 sin(pi(x+1/3)) dx", "1/pi"],
  ]) {
    const parsed = parseDefiniteIntegralInput(question);
    assert.equal(parsed.recognized, true, question);
    assert.equal(parsed.ok, true, `${question}: ${parsed.error}`);
    await assertExact(question, expectedAnswer);
  }
});

test("曖昧・壊れたpi傾斜記法をinvalidにして推測しない", async () => {
  for (const question of [
    "∫_0^1 sin(pi/2x) dx",
    "∫_0^1 sin(1/2pi*x) dx",
    "∫_0^1 sin(3/4pi*x) dx",
    "∫_0^1 sin(pi*x/2x) dx",
    "∫_0^1 sin(pi2*x) dx",
    "∫_0^1 sin(pi.5*x) dx",
    "∫_0^1 sin(pi 2*x) dx",
    "∫_0^1 sin(pi .5*x) dx",
    "∫_0^1 sin(pi//2*x) dx",
    "∫_0^1 sin(pi**x) dx",
    "∫_0^1 sin(1e-2*pi*x) dx",
  ]) {
    const result = await assertRejected(question, "invalid");
    assert.equal(result.supported, true, question);
  }
});

test("mixed angle・非線形・部分solve対象をwell-formed unsupportedに保つ", async () => {
  for (const question of [
    "∫_0^1 sin((pi+1)*x) dx",
    "∫_0^1 sin(pi*x+x) dx",
    "∫_0^1 sin(pi*x+1) dx",
    "∫_0^1 sin(x/pi) dx",
    "∫_0^1 sin(pi^2*x) dx",
    "∫_0^1 sin(sqrt(2)*pi*x) dx",
    "∫_0^1 sin(pi*x^2) dx",
    "∫_0^1 (sin(pi*x)+sin(x)) dx",
    "∫_0^1 (1+sin(pi*x)) dx",
    "∫_0^1 (exp(x)+sin(pi*x)) dx",
    "∫_0^1 sin(pi*(x+pi/3)) dx",
    "∫_0^1 sin((pi*pi-pi*pi)*x) dx",
    "∫_0^pi sin(pi*x) dx",
  ]) {
    const result = await assertRejected(question, "unsupported");
    assert.equal(result.supported, false, question);
  }
});

test("0倍・相殺・同一端でも未対応subtreeをverified 0へ短絡しない", async () => {
  for (const question of [
    "∫_0^1 0*sin(pi*x^2) dx",
    "∫_0^1 0*sin((pi+1)*x) dx",
    "∫_0^1 (sin(pi*x^2)-sin(pi*x^2)) dx",
    "∫_0^1 sin((pi*pi-pi*pi)*x) dx",
    "∫_(2/3)^(2/3) sin(pi*x^2) dx",
    "∫_0^1 sin(pi*x)^0 dx",
    "∫_0^1 0/sin(pi*x) dx",
  ]) {
    await assertRejected(question, "unsupported");
  }
});

test("pi傾斜もsin・cos各32項のsource上限を相殺前に守る", async () => {
  const sines = Array(32).fill("sin(pi*x)");
  const cosines = Array(32).fill("cos(pi*x/2)");
  await assertExact(
    `∫_0^1 (${[...sines, ...cosines].join("+")}) dx`,
    "128/pi",
  );
  for (const terms of [
    [...sines, "sin(pi*x)"],
    [...cosines, "cos(pi*x/2)"],
  ]) {
    const result = await assertRejected(`∫_0^1 (${terms.join("+")}) dx`);
    assert.match(result.error, /それぞれ32個/u);
  }
});

test("分類と非同期ルーターがpi傾斜を同じverified solverへ接続する", async () => {
  const question = "∫_0^1 sin(pi*x) dx";
  assert.equal(classifyCategory(question).primary, "積分");
  for (const options of [{}, { category: "積分" }]) {
    const result = await solveQuestionAsync(question, options);
    assert.equal(result.supported, true, result.error);
    assert.equal(result.solved, true, result.error);
    assert.equal(result.verified, true, result.error);
    assert.equal(result.resultKind, "exact");
    assert.equal(result.solverId, DEFINITE_INTEGRAL_SOLVER_ID);
    assert.equal(result.answer, "2/pi");
  }

  for (const rejected of [
    "∫_0^1 sin((pi+1)*x) dx",
    "∫_0^1 sin(pi2*x) dx",
  ]) {
    const result = await solveQuestionAsync(rejected);
    assert.equal(result.verified, false, rejected);
    assert.equal(result.answer, "", rejected);
  }
});

test("pi傾斜定積分の5表示モードはhintで最終exact値を漏らさない", async () => {
  const result = await assertExact("∫_0^1 sin(pi*x) dx", "2/pi");
  const outputs = Object.fromEntries(
    ["answer", "hint1", "hint2", "steps", "explain"].map((mode) => [
      mode,
      presentSolution(result, { mode, category: "積分" }),
    ]),
  );
  for (const [mode, output] of Object.entries(outputs)) {
    assert.equal(output.finalAnswer, "2/pi", mode);
    assert.ok(output.content, mode);
  }
  assert.equal(outputs.answer.content, "2/pi");
  assert.doesNotMatch(outputs.hint1.content, /2\/pi|F\(1\)-F\(0\)/u);
  assert.doesNotMatch(outputs.hint2.content, /2\/pi|F\(1\)-F\(0\)=/u);
  assert.match(outputs.hint2.content, /sin|cos|三角|原始関数|傾き/u);
  assert.match(outputs.steps.content, /2\/pi/u);
  assert.match(outputs.explain.content, /2\/pi/u);
  assert.match(outputs.explain.content, /検算|検証/u);
});

test("1/pi formal atomと型付きtraceを履歴・JSONへ安全に往復する", async () => {
  const question = "∫_0^1 cos(pi*x/5) dx";
  const result = await assertExact(question, "5*sin(pi/5)/pi");
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
  assert.equal(record.resultKind, "exact");
  assert.equal(record.solverId, DEFINITE_INTEGRAL_SOLVER_ID);
  assert.equal(record.output, "5*sin(pi/5)/pi");
  assert.deepEqual(
    record.solutionTrace.map(({ type }) => type),
    result.solutionTrace.map(({ type }) => type),
  );
  assert.equal(record.solutionTrace.at(-1).type, "result");
  assert.doesNotThrow(() => JSON.stringify(record));
});
