import assert from "node:assert/strict";
import test from "node:test";

import { solveQuestion } from "../js/solver/index.js";
import {
  QUADRATIC_INEQUALITY_SOLVER_ID,
  solveQuadraticInequality,
} from "../js/solver/quadratic-inequality.js";

function assertVerified(question, expected) {
  const result = solveQuadraticInequality(question);
  assert.equal(result.supported, true, `${question}: ${result.error}`);
  assert.equal(result.solved, true, `${question}: ${result.error}`);
  assert.equal(result.verified, true, `${question}: ${result.error}`);
  assert.equal(result.solverId, QUADRATIC_INEQUALITY_SOLVER_ID);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.answer, expected, question);
  assert.ok(result.solutionSet, question);
}

test("判別式・最高次係数・不等号の24通りを完全に区別する", () => {
  const cases = [
    ["x^2+1", ["解なし", "解なし", "すべての実数", "すべての実数"]],
    ["-x^2-1", ["すべての実数", "すべての実数", "解なし", "解なし"]],
    ["(x-1)^2", ["解なし", "x=1", "x<1 または 1<x", "すべての実数"]],
    ["-(x-1)^2", ["x<1 または 1<x", "すべての実数", "解なし", "x=1"]],
    ["x^2-1", ["-1<x<1", "-1≤x≤1", "x<-1 または 1<x", "x≤-1 または 1≤x"]],
    ["-x^2+1", ["x<-1 または 1<x", "x≤-1 または 1≤x", "-1<x<1", "-1≤x≤1"]],
  ];
  const operators = ["<", "<=", ">", ">="];
  for (const [expression, expected] of cases) {
    operators.forEach((operator, index) => {
      assertVerified(`${expression}${operator}0`, expected[index]);
    });
  }
});

test("有理根・無理根・有限小数係数を厳密な端点で返す", () => {
  for (const [question, expected] of [
    ["x^2-5x+6<=0", "2≤x≤3"],
    ["2x^2+x-1>0", "x<-1 または 1/2<x"],
    ["0.1x^2-0.3x+0.2<=0", "1≤x≤2"],
    ["x^2-2<0", "-√2<x<√2"],
    ["x^2-8<=0", "-2√2≤x≤2√2"],
    ["2x^2-4x+1>=0", "x≤(2-√2)/2 または (2+√2)/2≤x"],
    [
      "x^2-2000000000x+999999999999999999<0",
      "999999999<x<1000000001",
    ],
  ]) {
    assertVerified(question, expected);
  }
});

test("日本語指示・全角・左右を入れ替えた表記を全面一致で解釈する", () => {
  for (const [question, expected] of [
    ["次の二次不等式を解け：ｘ²－５ｘ＋６≦０", "2≤x≤3"],
    ["（ｘ－１）（ｘ＋２）＜０を解きなさい。", "-2<x<1"],
    ["二次不等式　－ｘ＾２＋４＞０　の解を求めよ", "-2<x<2"],
    ["4>=x^2", "-2≤x≤2"],
  ]) {
    assertVerified(question, expected);
  }
});

test("一次式は一次ソルバーへ渡し、他分野・部分一致・不正入力は検証しない", () => {
  assert.equal(solveQuadraticInequality("2x+3<11").supported, false);
  assert.equal(solveQuestion("2x+3<11").answer, "x<4");

  for (const question of [
    "x^3-x<0",
    "1/(x-1)>0",
    "sin x<2",
    "sqrt(x)<2",
    "y+x^2<4",
    "ax^2+bx+c<0",
    "ｘ２－５ｘ＋６＜０",
    "x^2<4 garbage",
    "f(x)=x^2<4",
    "0<x^2<4",
    "x^2<4;alert(1)",
    "x^2+globalThis.process.exit()<4",
  ]) {
    const result = solveQuestion(question, { category: "不等式" });
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }
});

