import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  solvePolynomialArea,
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
  assert.equal(result.solverId, "polynomial-area");
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

test("明示区間の多項式面積を全交点で分割して厳密に解く", () => {
  for (const [question, expected] of [
    ["area_[0,2](x^2;2x)", "4/3"],
    ["area_[-1,1](x;0)", "1"],
    ["area_[-1,2](x;0)", "5/2"],
    ["area_[-2,2](x^2;1)", "4"],
    ["area_[-1,3]((x-1)^2;0)", "16/3"],
    ["area_[-1,1](x^4+x^2;x^4+1)", "4/3"],
    ["area_[-5/2,7/3](x^2+1;x^2+1)", "0"],
  ]) {
    assertExact(solvePolynomialArea(question), expected);
  }
});

test("異なる2交点の区間と二次無理交点を浮動小数なしで解く", () => {
  for (const [question, expected] of [
    ["area_intersections(x^2;2x)", "4/3"],
    ["area_intersections(x^2-1;0)", "4/3"],
    ["area_intersections(x^2;2)", "8√2/3"],
    ["area_[-2,2](x^2;2)", "(-8+16√2)/3"],
    ["area_intersections(2;x^2)", "8√2/3"],
  ]) {
    assertExact(solvePolynomialArea(question), expected);
  }
});

test("日本語・x軸・全角入力を同じ面積solverへ正規化する", () => {
  for (const [question, expected] of [
    ["x=0からx=2までの区間で、y=x^2とy=2xの間の面積を求めよ", "4/3"],
    ["x=-1からx=1まで、曲線 y=x^2-1 と x軸 の間の面積を求めなさい！", "4/3"],
    ["曲線 y=x^2 と直線 y=2x の異なる2交点の間にある面積を求めよ", "4/3"],
    ["曲線 y=x^2-1 と x軸 で囲まれた部分の面積を求めてください", "4/3"],
    ["x=0からx=2までの区間で、y=x^2とy=2xの間の面積を求めよ。", "4/3"],
    ["y=x^2とy=2xで囲まれる部分の面積を求めよ？", "4/3"],
    ["放物線 y=x^2 と直線 y=2x の異なる2交点の間にある面積を求めよ.", "4/3"],
    ["ａｒｅａ＿［－１，１］（ｘ；０）", "1"],
  ]) {
    assertExact(solvePolynomialArea(question), expected);
  }
});

test("分類・明示カテゴリ・同期・非同期ルーターより先にarea preflightを通す", async () => {
  const cases = [
    ["area_[0,2](x^2;2x)", "4/3"],
    ["x=0からx=2まで、y=x^2とy=2xの間の面積を求めよ", "4/3"],
    ["area_intersections(x^2;2)", "8√2/3"],
  ];
  for (const [question, expected] of cases) {
    assert.equal(classifyCategory(question).primary, "積分", question);
    const direct = solveQuestion(question);
    const wrongExplicitCategory = solveQuestion(question, { category: "二次方程式" });
    const asynchronous = await solveQuestionAsync(question);
    assertExact(direct, expected);
    assert.deepEqual(wrongExplicitCategory, direct);
    assert.deepEqual(asynchronous, direct);
  }
});

test("構文正常でも対応外の関数・変数分母・高次差・4次超過をverifiedにしない", () => {
  for (const question of [
    "area_[0,1](sin(x);0)",
    "area_[0,1](sqrt(x);0)",
    "area_[0,1](1/x;0)",
    "area_[0,1](x^-1;0)",
    "area_[0,1](x^3;0)",
    "area_[0,1](x^4;x)",
    "area_[0,1](x^5;0)",
    "area_[0,1](0*x^5;0)",
    "area_[0,1](x^5-x^5;0)",
    "area_[0,1]((x^5)^0;0)",
  ]) {
    assertRejected(solvePolynomialArea(question), "unsupported");
  }
});

test("交点modeの偽前提・不完全入力・答え付加をinvalidにする", () => {
  for (const question of [
    "area_intersections(x^2+1;0)",
    "area_intersections(x^2;0)",
    "area_intersections(x;0)",
    "area_intersections(x^2+1;x^2+1)",
    "area_[1,1](x;0)",
    "area_[2,-1](x;0)",
    "area_[0,1](x)",
    "area_[0,1](x;0)=1/2",
    "area_[0,1](x/2x;0)",
    "area_[0,1](5!;0)",
  ]) {
    assertRejected(solvePolynomialArea(question), "invalid");
  }
  assertRejected(
    solvePolynomialArea("右図のy=x^2とy=2xで囲まれた部分の面積を求めよ"),
    "unsupported",
  );
});

test("通常の方程式・定積分・図だけの面積を奪わない", async () => {
  assert.equal(solvePolynomialArea("x^2=4").recognized, undefined);
  assert.equal(solvePolynomialArea("∫_0^1 x^2 dx").recognized, undefined);
  assert.equal(solvePolynomialArea("図の斜線部分の面積を求めよ").recognized, undefined);

  const equation = solveQuestion("x^2=4");
  assert.equal(equation.solverId, "quadratic-equation");
  assert.equal(equation.verified, true);

  const integral = await solveQuestionAsync("∫_0^1 x^2 dx");
  assert.equal(integral.solverId, "definite-integral");
  assert.equal(integral.answer, "1/3");

  const diagram = solveQuestion("図の斜線部分の面積を求めよ", { category: "図形" });
  assertRejected(diagram, "unsupported");
});

test("ヒントは最終面積を漏らさず、解法・説明・履歴は面積根拠を保持する", () => {
  const question = "area_[-2,2](x^2;2)";
  const result = solvePolynomialArea(question);
  assertExact(result, "(-8+16√2)/3");

  assert.equal(presentSolution(result, { mode: "answer" }).content, result.answer);
  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  assert.match(hint1, /全交点/u);
  assert.doesNotMatch(hint1, /16√2/u);
  assert.doesNotMatch(hint2, /16√2/u);

  const steps = presentSolution(result, { mode: "steps" }).content;
  assert.match(steps, /-√2 < √2/u);
  assert.match(steps, /面積: \(-8\+16√2\)\/3/u);
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
  assert.equal(record.solverId, "polynomial-area");
  assert.equal(record.resultKind, "exact");
  const roundTrip = JSON.parse(JSON.stringify(record));
  assert.equal(roundTrip.solutionTrace.at(-1).content, `面積: ${result.answer}`);
  assert.equal(roundTrip.verificationMessage, result.verification);
});

test("問題全体の長さ上限を正規化前に同期・非同期で拒否する", async () => {
  for (const question of [
    `area_[0,1](${"x+".repeat(2_500)}x;0)`,
    `∫_0^1 x dx${" ".repeat(5_001)}area_[0,1](x;0)`,
    `${" ".repeat(5_001)}area_[0,1](x;0)`,
  ]) {
    const direct = solveQuestion(question);
    const asynchronous = await solveQuestionAsync(question);
    assertRejected(direct, "invalid");
    assert.deepEqual(asynchronous, direct);
  }
});

test("互換上付き文字を別の式へ崩さず厳密解または安全な未対応にする", () => {
  for (const [question, expected] of [
    ["area_[0,1](2\u00B2;0)", "4"],
    ["area_[0,1]((x+1)\u00B2;0)", "7/3"],
    ["area_[0,1](1\u00D710\u00B2;0)", "100"],
    ["area_[0,1](x\u207A\u00B2;0)", "1/3"],
  ]) {
    assertExact(solvePolynomialArea(question), expected);
  }
  for (const question of [
    "area_[0,1](2\u207B\u00B9;0)",
    "area_[1,2](x\u207B\u00B9;0)",
    "area_[0,1](10\u207B\u00B2;0)",
  ]) {
    assertRejected(solvePolynomialArea(question), "unsupported");
  }
  for (const question of [
    "area_[0,1](x\u208B\u2081;0)",
    "area_[0,1](2\u2082;0)",
  ]) {
    assertRejected(solvePolynomialArea(question), "invalid");
  }
  for (const character of [
    "\u02E3",
    "\u2169",
    "\u2179",
    "\u24CD",
    "\u24E7",
    "\u{1F147}",
    "\u2461",
  ]) {
    assertRejected(
      solvePolynomialArea(`area_[0,1](${character};0)`),
      "invalid",
    );
  }
  for (const question of [
    "area_[0,1](1\\left2;0)",
    "area_[0,1](x\\right;0)",
    "area_[0,1](x;0)\\left\\right",
    "\\leftarea_[0,1](x;0)",
    "area_[0,1](1\uFF3Cleft2;0)",
    "area_[0,1](1\uFF3C\uFF4C\uFF45\uFF46\uFF542;0)",
    "area_[0,1](1\uFE68left2;0)",
    "area_[0,1](x;0)\uFF3Cleft\uFF3Cright",
    "\uFF3Cleftarea_[0,1](x;0)",
  ]) {
    assertRejected(solvePolynomialArea(question), "invalid");
  }
  for (const question of [
    "area_[0,1](2\u00B2\u207B\u00B9;0)",
    "area_[0,1](2\u00B9\u207A\u00B9;0)",
    "area_[0,1](x\u00B2\u207B\u00B9;0)",
    "area_[0,1](x\u00B9\u207A\u00B9;0)",
    "area_[0,1]((x+1)\u00B2\u207B\u00B9;0)",
    "area_[0,1](x\u207A;0)",
  ]) {
    assertRejected(solvePolynomialArea(question), "invalid");
  }
  for (const question of [
    "area_[0,1](x\u20701;0)",
    "area_[0,1](x\u20702;0)",
    "area_[0,1](2\u20700;0)",
    "area_[0,1](2\u20701;0)",
    "area_[0,1](2\u20702;0)",
    "area_[0,1](2\u2070\uFF12;0)",
    "area_[0,1](x\u00B2.5;0)",
    "area_[0,1](2\u00B9 \u00B2;0)",
    "area_[0,1](2\u00B9\t\u00B2;0)",
    "area_[0,1](2\u00B9\u3000\u00B2;0)",
    "area_[0,1](2\u00B9\u00A0\u00B2;0)",
    "area_[0,1](2\u00B9\u2000\u00B2;0)",
    "area_[0,1](2\u00B9\u2002\u00B2;0)",
    "area_[0,1](2\u00B9\u2003\u00B2;0)",
    "area_[0,1](2\u00B9\u2009\u00B2;0)",
    "area_[0,1](2\u00B9\u202F\u00B2;0)",
    "area_[0,1](2\u00B9\u205F\u00B2;0)",
    "area_[0,1](x\u00B9 \u00B2;0)",
  ]) {
    assertRejected(solvePolynomialArea(question), "invalid");
  }
});

test("area preflightの入力変換例外を同期・非同期ルーター内へ封じ込める", async () => {
  const cases = [
    {
      input: {
        [Symbol.toPrimitive]() {
          throw new Error("coercion failed");
        },
      },
      expectedReason: /coercion failed/u,
    },
    {
      input: {
        [Symbol.toPrimitive]() {
          throw null;
        },
      },
      expectedReason: /詳細不明の例外/u,
    },
    {
      input: {
        [Symbol.toPrimitive]() {
          throw {
            get message() {
              throw new Error("message getter failed");
            },
          };
        },
      },
      expectedReason: /詳細不明の例外/u,
    },
  ];
  for (const { input, expectedReason } of cases) {
    for (const result of [
      solveQuestion(input),
      await solveQuestionAsync(input),
    ]) {
      assert.equal(result.verified, false);
      assert.equal(result.solved, false);
      assert.equal(result.answer, "");
      assert.equal(result.resultKind, "invalid");
      assert.equal(result.exactAnswer, "");
      assert.equal(result.approximateAnswer, "");
      assert.deepEqual(result.conditions, []);
      assert.equal(result.solutionSet, null);
      assert.deepEqual(result.solutionTrace, []);
      assert.equal(result.solverId, "polynomial-area");
      assert.match(result.error, /ソルバー処理中にエラー/u);
      assert.match(result.error, expectedReason);
    }
  }
});
