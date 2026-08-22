import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  solveQuestion,
  solveQuestionAsync,
} from "../js/solver/index.js";
import { solvePolynomialVariation } from "../js/solver/polynomial-variation.js";
import { createHistoryRecord } from "../js/storage.js";
import { historyInput } from "./storage-fixtures.mjs";

const NONE = "なし";
const ALL_REAL = "(-∞,+∞)";

function monotonicityAnswer(increasing, decreasing, constant = NONE) {
  return `増加区間: ${increasing}; 減少区間: ${decreasing}; 一定区間: ${constant}`;
}

function extremaAnswer(maxima, minima, stationary = NONE) {
  return `極大: ${maxima}; 極小: ${minima}; 極値でない停留点: ${stationary}`;
}

function combinedAnswer({
  increasing,
  decreasing,
  constant = NONE,
  maxima = NONE,
  minima = NONE,
  stationary = NONE,
}) {
  return `${monotonicityAnswer(increasing, decreasing, constant)}; `
    + extremaAnswer(maxima, minima, stationary);
}

function assertExact(result, answer) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.solverId, "polynomial-variation");
  assert.equal(result.answer, answer);
  assert.equal(result.exactAnswer, answer);
  assert.equal(result.approximateAnswer, "");
  assert.deepEqual(result.conditions, []);
  assert.equal(result.solutionSet, null);
  assert.ok(result.solutionTrace.length >= 7);
  assert.equal(result.solutionTrace.at(-1).type, "result");
  assert.equal(result.solutionTrace.at(-1).content, `増減・極値: ${answer}`);
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

test("monotonicity modeは最大単調区間を有限臨界端点込みで返す", () => {
  for (const [question, expected] of [
    [
      "monotonicity(x^3-3x)",
      monotonicityAnswer("(-∞,-1] または [1,+∞)", "[-1,1]"),
    ],
    ["monotonicity(x^3)", monotonicityAnswer(ALL_REAL, NONE)],
    ["monotonicity(-x^3)", monotonicityAnswer(NONE, ALL_REAL)],
    ["monotonicity(x^3+x)", monotonicityAnswer(ALL_REAL, NONE)],
    ["monotonicity(x^2)", monotonicityAnswer("[0,+∞)", "(-∞,0]")],
    ["monotonicity(-x^2)", monotonicityAnswer("(-∞,0]", "[0,+∞)")],
    ["monotonicity(2x+1)", monotonicityAnswer(ALL_REAL, NONE)],
    ["monotonicity(-x/2+1)", monotonicityAnswer(NONE, ALL_REAL)],
    ["monotonicity(5/3)", monotonicityAnswer(NONE, NONE, ALL_REAL)],
  ]) {
    assertExact(solvePolynomialVariation(question), expected);
  }
});

test("extrema modeは極大・極小と極値でない停留点を分離する", () => {
  for (const [question, expected] of [
    ["extrema(x^3-3x)", extremaAnswer("(-1,2)", "(1,-2)")],
    ["extrema(x^3)", extremaAnswer(NONE, NONE, "(0,0)")],
    ["extrema(-x^3+2)", extremaAnswer(NONE, NONE, "(0,2)")],
    ["extrema(x^2)", extremaAnswer(NONE, "(0,0)")],
    ["extrema(-x^2+4)", extremaAnswer("(0,4)", NONE)],
    ["extrema(2x+1)", extremaAnswer(NONE, NONE)],
    ["extrema(5/3)", extremaAnswer(NONE, NONE)],
  ]) {
    assertExact(solvePolynomialVariation(question), expected);
  }
});

test("combined modeは6項目を固定順で返し、日本語形式も同じ結果にする", () => {
  const expected = combinedAnswer({
    increasing: "(-∞,-1] または [1,+∞)",
    decreasing: "[-1,1]",
    maxima: "(-1,2)",
    minima: "(1,-2)",
  });
  for (const question of [
    "monotonicity_extrema(x^3-3x)",
    "関数 y=x^3-3x の増減と極値を求めよ",
    "関数 f(x)=x^3-3x の増減を調べ、極値を求めよ",
  ]) {
    assertExact(solvePolynomialVariation(question), expected);
  }

  assertExact(
    solvePolynomialVariation("monotonicity_extrema(x^3)"),
    combinedAnswer({
      increasing: ALL_REAL,
      decreasing: NONE,
      stationary: "(0,0)",
    }),
  );
  assertExact(
    solvePolynomialVariation("monotonicity_extrema(7)"),
    combinedAnswer({
      increasing: NONE,
      decreasing: NONE,
      constant: ALL_REAL,
    }),
  );
});

test("二次無理臨界点と極値を同じ二次体で厳密表示する", () => {
  const result = solvePolynomialVariation("monotonicity_extrema(x^3+x^2-2x)");
  assertExact(result, combinedAnswer({
    increasing: "(-∞,(-1-√7)/3] または [(-1+√7)/3,+∞)",
    decreasing: "[(-1-√7)/3,(-1+√7)/3]",
    maxima: "((-1-√7)/3,(20+14√7)/27)",
    minima: "((-1+√7)/3,(20-14√7)/27)",
  }));
  assert.match(result.solutionTrace.map(({ content }) => content).join("\n"), /√7/u);
  assert.match(result.verification, /BigInt|厳密/u);
  assert.doesNotMatch(result.verification, /数値微分を使/u);
});

test("関数・変数分母・負冪・3次超過をverifiedにしない", () => {
  for (const question of [
    "monotonicity(sin(x))",
    "monotonicity(sqrt(x))",
    "monotonicity(1/x)",
    "monotonicity(x^-1)",
    "monotonicity(x^4)",
    "monotonicity(0*x^4)",
    "monotonicity(x^4-x^4)",
    "monotonicity((x-x)^4)",
    "monotonicity((x^4)^0)",
    "monotonicity(0*x*x*x*x)",
    "monotonicity((x^2-x^2)*x^2+x)",
    "monotonicity((x-x)*(x*x*x)+x)",
    "monotonicity((x^2-x^2)^2+x)",
    "monotonicity(1/((x-x)+1))",
    "monotonicity(x^((x-x)+2))",
    `monotonicity((${"9".repeat(256)}*x)^2)`,
    `monotonicity((${"9".repeat(257)}*x)^2)`,
    `monotonicity(${"9".repeat(513)}*x)`,
  ]) {
    assertRejected(solvePolynomialVariation(question), "unsupported");
  }
});

test("不完全構文・答え付加・関係式・曖昧入力をinvalidにする", () => {
  for (const question of [
    "monotonicity()",
    "monotonicity(x^3",
    "extrema()",
    "monotonicity_extrema()",
    "monotonicity(x^3)=増加",
    "monotonicity(x^3:答え)",
    "monotonicity(x^2=1)",
    "monotonicity(x2)",
    "monotonicity(1 2+x)",
    "monotonicity(x/2x)",
    "monotonicity(5!)",
    "monotonicity(x₋₁)",
    "monotonicity(ⓧ)",
    "monotonicity(x²⁻¹)",
  ]) {
    assertRejected(solvePolynomialVariation(question), "invalid");
  }
});

test("通常の微分・接線・面積・体積・極限・方程式を直接solverで認識しない", () => {
  for (const question of [
    "x^2を微分せよ",
    "tangent_x_[1](x^2)",
    "area_[0,1](x;0)",
    "volume_x_axis_[0,1](x)",
    "lim_(x->0) x",
    "x^2=4",
    "数列a_nの単調性を調べよ",
  ]) {
    const result = solvePolynomialVariation(question);
    assertRejected(result, "unsupported");
    assert.equal(result.recognized, undefined);
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
    const result = solvePolynomialVariation(input);
    assertRejected(result, "invalid");
    assert.equal(result.recognized, true);
  }
});

test("canonical・完全日本語形式を微分へ分類する", () => {
  for (const question of [
    "monotonicity(x^3-3x)",
    "extrema(x^3-3x)",
    "monotonicity_extrema(x^3-3x)",
    "関数 y=x^3-3x の増減と極値を求めよ",
    "関数 f(x)=x^3-3x の増減を調べ、極値を求めよ",
  ]) {
    assert.equal(classifyCategory(question).primary, "微分", question);
  }
  assert.equal(classifyCategory("数列a_nの単調性を調べよ").primary, "数列");
});

test("同期・非同期公開入口と誤カテゴリ指定でもvariation preflightを優先する", async () => {
  const question = "monotonicity_extrema(x^3-3x)";
  const expected = combinedAnswer({
    increasing: "(-∞,-1] または [1,+∞)",
    decreasing: "[-1,1]",
    maxima: "(-1,2)",
    minima: "(1,-2)",
  });
  const direct = solveQuestion(question);
  const wrongCategory = solveQuestion(question, { category: "二次方程式" });
  const asynchronous = await solveQuestionAsync(question);
  assertExact(direct, expected);
  assert.deepEqual(wrongCategory, direct);
  assert.deepEqual(asynchronous, direct);

  for (const unsupportedQuestion of [
    "関数 y=x^3 のグラフを用いて増減を調べよ",
    "関数 y=x^3 のグラフを描いて極値を求めよ",
    "関数 y=x^3 のグラフの増減を調べよ",
    "関数 y=x^3 を図示して極値を求めよ",
    "関数 y=x^3 のグラフを書いて極値を求めよ",
    "関数 y=x^3 のグラフを作成して極値を求めよ",
    "関数 y=x^3 をグラフに表して増減を調べよ",
    "関数 y=x^2（0≦x≦1）の増減を調べよ",
    "関数 y=x^2 (0<x<1) の極値を求めよ",
    "関数 y=x^2, 0<=x<=1 の増減を調べよ",
    "関数 y=x^2（定義域 0≦x≦1）の増減を調べよ",
    "関数 y=x^2 の x=0から1までの増減を調べよ",
    "関数 y=x^2 の 0から1までの増減を調べよ",
    "関数 y=x^2 (x≠0) の増減を調べよ",
    "関数 y=x^2, x≠0 の増減を調べよ",
    "関数 y=x^2 x>=0 の増減を調べよ",
    "関数 y=x^2 の xは0以上で増減を調べよ",
    "関数 y=x^2 の xが0以上で極値を求めよ",
    "関数 y=x^2 の x>0のときの増減を調べよ",
    "関数 y=x^2 の xは0より大きいときの増減を調べよ",
    "関数 y=x^2 の xは0を超えるときの増減を調べよ",
    "関数 y=x^2 の x≠0のときの増減を調べよ",
    "関数 y=x^2 の x>\n0のときの増減を調べよ",
    "関数 y=x^2 の x>0の場合の増減を調べよ",
    "関数 y=x^2 の x≠0での増減を調べよ",
    "関数 y=x^3 の増減表を書け",
    "関数 y=x^3 の増減を証明せよ",
    "関数 y=x^2 の最大、最小を求めよ",
    "関数 y=x^2 の最大および最小を求めよ",
    "関数 y=x^3 のグラフを参照して極値を求めよ",
    "関数 y=x^3 のグラフを参考にして増減を調べよ",
  ]) {
    const routed = solveQuestion(unsupportedQuestion);
    assertRejected(routed, "unsupported");
    assert.deepEqual(
      solveQuestion(unsupportedQuestion, { category: "二次方程式" }),
      routed,
    );
    assert.deepEqual(await solveQuestionAsync(unsupportedQuestion), routed);
  }
});

test("variation preflightは既存の同期・非同期solverを横取りしない", async () => {
  for (const [question, solverId] of [
    ["tangent_x_[1](x^2)", "polynomial-tangent"],
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

test("variation固有ヒントは臨界点・区間・極値を漏らさず履歴は微分分類を保つ", () => {
  const question = "monotonicity_extrema(x^3+x^2-2x)";
  const result = solveQuestion(question);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.solverId, "polynomial-variation");

  assert.equal(presentSolution(result, { mode: "answer" }).content, result.answer);
  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  assert.match(hint1, /導関数/u);
  assert.doesNotMatch(hint1, /√7|増加区間|極大:/u);
  assert.doesNotMatch(hint2, /√7|増加区間|極大:/u);
  assert.match(presentSolution(result, { mode: "steps" }).content, /増減・極値:/u);
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
  assert.equal(record.solverId, "polynomial-variation");
  assert.equal(record.resultKind, "exact");
  const roundTrip = JSON.parse(JSON.stringify(record));
  assert.equal(roundTrip.solutionTrace.at(-1).content, `増減・極値: ${result.answer}`);
  assert.equal(roundTrip.verificationMessage, result.verification);
});
