import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  solveQuestion,
  solveQuestionAsync,
} from "../js/solver/index.js";
import { solvePolynomialNormal } from "../js/solver/polynomial-normal.js";
import { createHistoryRecord } from "../js/storage.js";
import { historyInput } from "./storage-fixtures.mjs";

function assertExact(result, answer) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.solverId, "polynomial-normal");
  assert.equal(result.answer, answer);
  assert.equal(result.exactAnswer, answer);
  assert.equal(result.approximateAnswer, "");
  assert.deepEqual(result.conditions, []);
  assert.equal(result.solutionSet, null);
  assert.equal(result.solutionTrace.length, 7);
  assert.deepEqual(
    result.solutionTrace.map(({ type }) => type),
    ["input", "constraint", "transformation", "verification", "rule", "verification", "result"],
  );
  assert.equal(result.solutionTrace.at(-1).content, `法線: ${answer}`);
}

function assertRejected(result, kind) {
  assert.equal(result.verified, false);
  assert.equal(result.solved, false);
  assert.equal(result.answer, "");
  assert.equal(result.exactAnswer, "");
  assert.equal(result.approximateAnswer, "");
  assert.equal(result.resultKind, kind);
  assert.ok(result.error);
}

test("x座標指定から多項式の法線を厳密に解く", () => {
  for (const [question, expected] of [
    ["normal_x_[1](x^2)", "y=-(1/2)x+3/2"],
    ["normal_[1](x^2)", "y=-(1/2)x+3/2"],
    ["normal_x_[0](x^2+3)", "x=0"],
    ["normal_x_[-2](5/3)", "x=-2"],
    ["normal_x_[(1/2)](x^2)", "y=-x+3/4"],
    ["normal_x_[1](x^4-2x)", "y=-(1/2)x-1/2"],
    ["normal_x_[-1](x^2)", "y=(1/2)x+3/2"],
    ["曲線 y=x^2 の x=1 における法線の方程式を求めよ", "y=-(1/2)x+3/2"],
  ]) {
    assertExact(solvePolynomialNormal(question), expected);
  }
});

test("明示点が曲線上にあることを検証してから同じ法線を返す", () => {
  for (const [question, expected] of [
    ["normal_point_(1,1)(x^2)", "y=-(1/2)x+3/2"],
    ["normal_point_((1/2),(1/4))(x^2)", "y=-x+3/4"],
    ["normal_point_(-2,5/3)(5/3)", "x=-2"],
    ["normal_point_(0,3)(x^2+3)", "x=0"],
    ["曲線 y=x^2 上の点 (1,1) における法線の方程式を求めよ", "y=-(1/2)x+3/2"],
  ]) {
    const result = solvePolynomialNormal(question);
    assertExact(result, expected);
    assert.match(result.solutionTrace[0].content, /指定点/u);
    assert.match(result.solutionTrace[3].content, /曲線所属/u);
  }
});

test("分数係数・分数接点でも浮動小数へ落とさず直交証拠を残す", () => {
  const result = solvePolynomialNormal("normal_point_((1/2),(1/8))(x^3)");
  assertExact(result, "y=-(4/3)x+19/24");
  assert.match(result.solutionTrace[0].content, /\(1\/2, 1\/8\)/u);
  assert.match(result.solutionTrace[4].content, /f'\(1\/2\)=3\/4/u);
  assert.match(result.solutionTrace[4].content, /x-1\/2\+3\/4\(y-1\/8\)=0/u);
  assert.match(result.solutionTrace[2].content, /3x\^2/u);
  assert.match(result.solutionTrace[5].content, /直交: 成立/u);
  assert.match(result.solutionTrace[5].content, /傾き=-1/u);
  assert.match(result.verification, /BigInt|厳密/u);
  assert.doesNotMatch(result.verification, /数値微分を使/u);
});

test("接線が水平なら0除算せず鉛直法線を返す", () => {
  for (const question of [
    "normal_x_[0](x^2)",
    "normal_x_[2](x^3-12x)",
    "normal_point_(3,7)(7)",
  ]) {
    const result = solvePolynomialNormal(question);
    const expectedX = question.includes("[0]") ? "0" : question.includes("[2]") ? "2" : "3";
    assertExact(result, `x=${expectedX}`);
    assert.match(result.solutionTrace[5].content, /傾き積は適用外/u);
    assert.doesNotMatch(JSON.stringify(result), /Infinity|NaN/u);
  }
});

test("曲線上にない偽の指定点をverifiedにしない", () => {
  for (const question of [
    "normal_point_(1,2)(x^2)",
    "normal_point_((1/2),(1/3))(x^2)",
    "normal_point_(0,0)(x^2+1)",
  ]) {
    assertRejected(solvePolynomialNormal(question), "invalid");
  }
});

test("関数・変数分母・負冪・4次超過を対応済みと偽装しない", () => {
  for (const question of [
    "normal_x_[0](sin(x))",
    "normal_x_[1](sqrt(x))",
    "normal_x_[1](1/x)",
    "normal_x_[1](x^-1)",
    "normal_x_[1](x^5)",
    "normal_x_[1](0*x^5)",
    "normal_x_[1](x^5-x^5)",
    "normal_x_[1]((x^5)^0)",
  ]) {
    assertRejected(solvePolynomialNormal(question), "unsupported");
  }
});

test("不完全構文・答え付加・曖昧な式と座標をinvalidにする", () => {
  for (const question of [
    "normal_x_[](x^2)",
    "normal_x_[1]()",
    "normal_x_[1](x^2",
    "normal_point_(1)(x^2)",
    "normal_point_(1,1,1)(x^2)",
    "normal_point_(1,)(x^2)",
    "normal_x_[1](x^2)=y=-(1/2)x+3/2",
    "normal_x_[1](x/2x)",
    "normal_x_[1](5!)",
    "normal_x_[1 2](x^2)",
    "normal_point_(1,1 2)(x^2)",
    "normal_x_[1](x₋₁)",
    "normal_x_[1](ⓧ)",
    "normal_x_[1](x²⁻¹)",
  ]) {
    assertRejected(solvePolynomialNormal(question), "invalid");
  }
});

test("通常の微分・方程式を横取りせず、図依存は認識したまま未対応にする", () => {
  for (const question of [
    "x^2を微分せよ",
    "x^2=4",
  ]) {
    const result = solvePolynomialNormal(question);
    assertRejected(result, "unsupported");
    assert.equal(result.recognized, undefined);
  }
  for (const question of [
    "右図の曲線に点Aで引いた法線を求めよ",
    "グラフから法線の方程式を求めよ",
  ]) {
    const result = solvePolynomialNormal(question);
    assertRejected(result, "unsupported");
    assert.equal(result.recognized, true);
  }
});

test("危険な文字列化例外をsolver境界のinvalidへ封じ込める", () => {
  for (const input of [
    {
      [Symbol.toPrimitive]() {
        throw new Error("coercion failed");
      },
    },
    {
      [Symbol.toPrimitive]() {
        throw null;
      },
    },
    {
      [Symbol.toPrimitive]() {
        throw {
          get message() {
            throw new Error("message getter failed");
          },
        };
      },
    },
  ]) {
    const result = solvePolynomialNormal(input);
    assertRejected(result, "invalid");
    assert.equal(result.recognized, true);
  }
});

test("法線のcanonical・日本語形式は微分、一般の幾何法線は図形へ分類する", () => {
  for (const question of [
    "normal_x_[1](x^2)",
    "normal_point_(1,1)(x^2)",
    "曲線 y=x^2 の x=1 における法線の方程式を求めよ",
    "曲線 y=x^2 上の点 (1,1) における法線の方程式を求めよ",
  ]) {
    assert.equal(classifyCategory(question).primary, "微分", question);
  }
  for (const question of [
    "円の法線を求めよ",
    "右図の円の法線について角度を求めよ",
  ]) {
    assert.equal(classifyCategory(question).primary, "図形", question);
  }
});

test("一般の幾何法線は公開ルーターでもinvalidにせず未対応として残す", () => {
  for (const question of [
    "円の中心を通る法線を求めよ",
    "放物線 y^2=4x 上の点(1,2)における法線の方程式を求めよ",
    "双曲線 x^2-y^2=1 上の点における法線の方程式を求めよ",
    "関数 f(x)=x^2 の x=1 における法線の方程式を求めよ",
  ]) {
    const result = solveQuestion(question);
    assertRejected(result, "unsupported");
    assert.notEqual(result.solverId, "polynomial-normal");
  }
});

test("公開同期・非同期ルーターと誤カテゴリ指定でも法線preflightを優先する", async () => {
  for (const [question, expected] of [
    ["normal_x_[1](x^2)", "y=-(1/2)x+3/2"],
    ["normal_point_((1/2),(1/4))(x^2)", "y=-x+3/4"],
    ["曲線 y=x^2 の x=1 における法線の方程式を求めよ", "y=-(1/2)x+3/2"],
    ["normal_x_[0](x^2)", "x=0"],
  ]) {
    const direct = solveQuestion(question);
    const wrongCategory = solveQuestion(question, { category: "二次方程式" });
    const asynchronous = await solveQuestionAsync(question);
    assertExact(direct, expected);
    assert.deepEqual(wrongCategory, direct);
    assert.deepEqual(asynchronous, direct);
  }
});

test("法線preflightは接線・増減・面積・体積・極限・通常微分・方程式を横取りしない", async () => {
  for (const [question, solverId] of [
    ["tangent_x_[1](x^2)", "polynomial-tangent"],
    ["monotonicity(x^3)", "polynomial-variation"],
    ["area_[0,1](x;0)", "polynomial-area"],
    ["volume_x_axis_[0,1](x)", "polynomial-volume"],
    ["lim_(x->0) x", "finite-limit"],
    ["x^2=4", "quadratic-equation"],
  ]) {
    const result = solveQuestion(question);
    assert.equal(result.verified, true, result.error || question);
    assert.equal(result.solverId, solverId, question);
  }

  const derivative = await solveQuestionAsync("f(x)=x^2を微分せよ", {
    symbolicOperations: {
      simplify: async () => "2*x",
      equivalent: async () => true,
    },
  });
  assert.equal(derivative.verified, true, derivative.error);
  assert.equal(derivative.solverId, "derivative");
});

test("法線固有のヒントは最終方程式・数値傾き・切片を漏らさず、履歴は微分根拠を保持する", () => {
  const question = "normal_point_(1,1)(x^2)";
  const result = solveQuestion(question);
  assertExact(result, "y=-(1/2)x+3/2");

  assert.equal(presentSolution(result, { mode: "answer" }).content, result.answer);
  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  assert.match(hint1, /接点/u);
  assert.match(hint1, /導関数/u);
  for (const hint of [hint1, hint2]) {
    assert.doesNotMatch(hint, /y=-\(1\/2\)x\+3\/2/u);
    assert.doesNotMatch(hint, /-1\/2|3\/2|x-1\+2\(y-1\)=0/u);
  }
  assert.match(presentSolution(result, { mode: "steps" }).content, /法線: y=-\(1\/2\)x\+3\/2/u);
  const explanation = presentSolution(result, {
    mode: "explain",
    category: "微分",
  }).content;
  assert.match(explanation, /分類: 微分/u);
  assert.match(explanation, /BigInt|厳密/u);

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
  assert.equal(record.category, "微分");
  assert.equal(record.categoryClassification.primary, "微分");
  assert.equal(record.solverId, "polynomial-normal");
  assert.equal(record.resultKind, "exact");
  const roundTrip = JSON.parse(JSON.stringify(record));
  assert.equal(roundTrip.solutionTrace.at(-1).content, "法線: y=-(1/2)x+3/2");
  assert.equal(roundTrip.verificationMessage, result.verification);
});
