import test from "node:test";
import assert from "node:assert/strict";

import { solveQuestion } from "../js/solver/index.js";
import { solveRationalEquation } from "../js/solver/rational-equation.js";

function assertSolved(question, {
  exactAnswer,
  conditions = [],
  kind = conditions.length ? "conditional" : "exact",
}) {
  const result = solveRationalEquation(question);
  assert.equal(result.supported, true, `${question}: ${result.error}`);
  assert.equal(result.solved, true, `${question}: ${result.error}`);
  assert.equal(result.verified, true, question);
  assert.equal(result.solverId, "rational-equation");
  assert.equal(result.resultKind, kind);
  assert.equal(result.exactAnswer, exactAnswer);
  assert.deepEqual(result.conditions, conditions);
  assert.equal(
    result.answer,
    conditions.length
      ? `${exactAnswer}（ただし ${conditions.join("、")}）`
      : exactAnswer,
  );
  assert.match(result.verification, /厳密/u);
  assert.ok(result.solutionTrace.length >= 5);
  return result;
}

test("分母0の候補と約分で消える穴を厳密に除外する", () => {
  for (const [question, exactAnswer, conditions] of [
    ["1/(x-1)=0", "解なし", ["x≠1"]],
    ["x/(x-1)=0", "x=0", ["x≠1"]],
    ["(x^2-1)/(x-1)=0", "x=-1", ["x≠1"]],
    ["(x-1)/(x-1)=1", "すべての実数", ["x≠1"]],
    ["0/(x-1)=0", "すべての実数", ["x≠1"]],
    ["0*(1/(x-1))=0", "すべての実数", ["x≠1"]],
    ["1/x+0/(x-1)=1/x", "すべての実数", ["x≠0", "x≠1"]],
    ["1/x=(x+1)/(x(x+1))", "すべての実数", ["x≠0", "x≠-1"]],
    ["1/x=0/x", "解なし", ["x≠0"]],
    ["x/(x-1)=1/(x-1)", "解なし", ["x≠1"]],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("重複・比例する分母条件を実数の除外値として正規化する", () => {
  assertSolved("1/(x-1)=2/(2x-2)", {
    exactAnswer: "すべての実数",
    conditions: ["x≠1"],
  });
  assertSolved("1/(x-1)^2=1/(x^2-2x+1)", {
    exactAnswer: "すべての実数",
    conditions: ["x≠1"],
  });
  assertSolved("1/(x^2+1)=1/(x^2+1)", {
    exactAnswer: "すべての実数",
  });
  assertSolved("0/(x^2-2)=0", {
    exactAnswer: "すべての実数",
    conditions: ["x≠-√2", "x≠√2"],
  });
  assertSolved("(x^2-2)/(2x^2-4)=0", {
    exactAnswer: "解なし",
    conditions: ["x≠-√2", "x≠√2"],
  });
});

test("通分後の一次・二次方程式を分数または根号で解く", () => {
  for (const [question, exactAnswer, conditions] of [
    ["1/(x-1)=2", "x=3/2", ["x≠1"]],
    ["1/(x/3-1/2)=2", "x=3", ["x≠3/2"]],
    ["1/(x-1)=x", "x=(1-√5)/2,(1+√5)/2", ["x≠1"]],
    ["1/(x-1)+1/(x+1)=0", "x=0", ["x≠1", "x≠-1"]],
    ["1/(x-1)+1/(x+1)=1", "x=1-√2,1+√2", ["x≠1", "x≠-1"]],
    ["x/(x-1)=2x/(x+1)", "x=0,3", ["x≠1", "x≠-1"]],
    ["(x^2-1/4)/(x-1/2)=0", "x=-1/2", ["x≠1/2"]],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("巨大係数と極接近する穴を浮動小数へ落とさない", () => {
  for (const [question, exactAnswer, conditions] of [
    [
      "1/(x-1)=100000000000000000000",
      "x=100000000000000000001/100000000000000000000",
      ["x≠1"],
    ],
    [
      "(x-1.00000000000000000001)/(x-1)=0",
      "x=100000000000000000001/100000000000000000000",
      ["x≠1"],
    ],
    [
      "(x-1)/(x-1.00000000000000000001)=0",
      "x=1",
      ["x≠100000000000000000001/100000000000000000000"],
    ],
    [
      "(0.1x-0.01)/(x-0.1)=0.1",
      "すべての実数",
      ["x≠1/10"],
    ],
    [
      "(0.1x-0.01)/(x-0.1)=0",
      "解なし",
      ["x≠1/10"],
    ],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("入れ子除算と負指数の全分母条件を保持する", () => {
  for (const [question, exactAnswer, conditions] of [
    ["1/(1/(x-1))=0", "解なし", ["x≠1"]],
    ["1/(1/(x-1))=2", "x=3", ["x≠1"]],
    ["1/(1/(x-1))=x-1", "すべての実数", ["x≠1"]],
    ["1/((x-1)/(x-2))=0", "解なし", ["x≠2", "x≠1"]],
    ["1/((x-1)/(x-2))=2", "x=0", ["x≠2", "x≠1"]],
    ["x^-1=2", "x=1/2", ["x≠0"]],
    ["x^-2=1", "x=-1,1", ["x≠0"]],
    ["(x-1)^-2=1", "x=0,2", ["x≠1"]],
    ["x^0=1", "すべての実数", ["x≠0"]],
    ["(x-1)^0=1", "すべての実数", ["x≠1"]],
    ["x^0=0", "解なし", ["x≠0"]],
    ["((x-1)/(x+1))^-1=0", "解なし", ["x≠-1", "x≠1"]],
    [
      "((x-1)/(x+1))^-1=(x+1)/(x-1)",
      "すべての実数",
      ["x≠-1", "x≠1"],
    ],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("根号解の近似値を厳密解から分離する", () => {
  const result = assertSolved("1/(x-1)+1/(x+1)=1", {
    exactAnswer: "x=1-√2,1+√2",
    conditions: ["x≠1", "x≠-1"],
  });
  assert.match(result.approximateAnswer, /^x≈-0\.414/u);
  assert.doesNotMatch(result.exactAnswer, /≈|0\.414/u);
});

test("日本語・全角入力と明示的な分母範囲を解釈する", () => {
  assertSolved("次の分数方程式を解いて：１／（ｘ－１）＝２。", {
    exactAnswer: "x=3/2",
    conditions: ["x≠1"],
  });
  assertSolved("(1/x)*(x+1)=0", {
    exactAnswer: "x=-1",
    conditions: ["x≠0"],
  });
  assertSolved("1/(x(x+1))=0", {
    exactAnswer: "解なし",
    conditions: ["x≠-1", "x≠0"],
  });
});

test("曖昧な分母範囲・不正入力・未対応形式を検証済みにしない", () => {
  for (const question of [
    "1/x(x+1)=0",
    "1/2x=1",
    "1/x x=1",
    "1/xx=2",
    "1/xX=2",
    "1/xxx=1",
    "1/(x-1)=0 garbage",
    "f(x)=1/(x-1)=0",
    "1/(x-1)==0",
    "1/(x-1)=0<2",
    "1/(x-1)<0",
    "1/(x-1)=",
    "=1/(x-1)",
    "1/(x-1)=0;alert(1)",
    "1/(x-1)=0, x=2",
    "y+1/(x-1)=0",
    "sin(x)/(x-1)=0",
    "sqrt(x)/(x-1)=0",
    "x2/(x-1)=0",
    "1//(x-1)=0",
    "1/0=0",
    "0/(x-x)=0",
    "1/((x-1)-(x-1))=0",
    "1/(x^3-2)=1/(x^3-2)",
    "1/(x-1)=x^2",
  ]) {
    const result = solveRationalEquation(question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }
});

test("全体ルーターが有理式だけを新ソルバーへ渡す", () => {
  for (const question of [
    "1/(x-1)=2",
    "x^-1=2",
    "1/(x^2-1)=0",
  ]) {
    assert.equal(solveQuestion(question).solverId, "rational-equation", question);
    assert.equal(
      solveQuestion(question, { category: "一次方程式" }).solverId,
      "rational-equation",
      question,
    );
  }

  assert.equal(solveQuestion("x/2=1").solverId, "linear-equation");
  assert.equal(solveQuestion("0.5x^2-1=0").solverId, "quadratic-equation");
  assert.equal(solveQuestion("(1/2)*x=1").answer, "x=2");
  assert.equal(solveQuestion("1/2x=1").verified, false);
  assert.equal(solveQuestion("1/xx=2").verified, false);
  assert.equal(solveQuestion("1/xX=2").verified, false);
});

test("巨大な方程式入力を正規化前に拒否する", () => {
  const result = solveRationalEquation(`${"1".repeat(5_001)}=0`);
  assert.equal(result.solved, false);
  assert.equal(result.verified, false);
  assert.equal(result.answer, "");
  assert.match(result.error, /長すぎ/u);
});
