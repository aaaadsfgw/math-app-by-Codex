import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import { presentSolution } from "../js/solution-presenter.js";
import {
  LOGARITHMIC_EQUATION_SOLVER_ID,
  preserveExplicitLogarithmBases,
  solveLogarithmicEquation,
} from "../js/solver/logarithmic-equation.js";
import { solveQuestion, solveQuestionAsync } from "../js/solver/index.js";

function assertExactAnswer(question, expectedExact, expectedConditions = []) {
  const result = solveLogarithmicEquation(question);
  assert.equal(result.supported, true, `${question}: ${result.error}`);
  assert.equal(result.solved, true, `${question}: ${result.error}`);
  assert.equal(result.verified, true, question);
  assert.equal(result.solverId, LOGARITHMIC_EQUATION_SOLVER_ID);
  assert.equal(result.exactAnswer, expectedExact, question);
  assert.deepEqual(result.conditions, expectedConditions, question);
  assert.equal(
    result.resultKind,
    expectedConditions.length ? "conditional" : "exact",
    question,
  );
  assert.ok(result.solutionTrace.length >= 5, question);
  assert.doesNotThrow(() => JSON.stringify(result), question);
  return result;
}

test("整数底の対数方程式を有理数・二次無理数まで厳密に解く", () => {
  assert.equal(
    assertExactAnswer("log_2(x)=3", "x=8", ["x>0"]).answer,
    "x=8（ただし x>0）",
  );
  assertExactAnswer("log_4(x)=1/2", "x=2", ["x>0"]);
  assertExactAnswer("2*log_2(x)=1", "x=√2", ["x>0"]);
  assertExactAnswer("2log_2(x)=6", "x=8", ["x>0"]);
  assertExactAnswer("(1/2)*log_2(x)=1", "x=4", ["x>0"]);
  assertExactAnswer("log_2(x)=-2", "x=1/4", ["x>0"]);
  assertExactAnswer("log_2(x^2)=2", "x=-2,2", ["x^2>0"]);
  assertExactAnswer("log_2(x^2)=log_2(4)", "x=-2,2", ["x^2>0"]);
});

test("対数の検証済み履歴から5つの表示モードを安全に生成する", () => {
  const result = assertExactAnswer("log_2(x)=3", "x=8", ["x>0"]);
  assert.equal(
    presentSolution(result, { mode: "answer" }).content,
    "x=8（ただし x>0）",
  );
  for (const mode of ["hint1", "hint2"]) {
    const hint = presentSolution(result, { mode }).content;
    assert.match(hint, /対数|引数|定義域/u);
    assert.doesNotMatch(hint, /x=8/u);
  }
  assert.match(presentSolution(result, { mode: "steps" }).content, /x=8/u);
  assert.match(
    presentSolution(result, { mode: "explain", category: "指数・対数" }).content,
    /最終回答: x=8/u,
  );
});

test("積へまとめても元の各対数引数の正値条件を失わない", () => {
  assertExactAnswer(
    "log_2(x-1)+log_2(x+1)=3",
    "x=3",
    ["x-1>0", "x+1>0"],
  );
  assertExactAnswer(
    "log_2(x-1)=log_2((x-1)^2)",
    "x=2",
    ["x-1>0", "x^2-2x+1>0"],
  );
  assertExactAnswer(
    "log_2(x^2-2)=log_2(x+1)",
    "x=(1+√13)/2",
    ["x^2-2>0", "x+1>0"],
  );
  assert.equal(
    assertExactAnswer(
      "log_2(x)+log_2(-x)=log_2(x)+log_2(-x)",
      "解なし",
    ).answer,
    "解なし",
  );
});

test("自然対数は定数0または同じ自然対数との比較だけを厳密に解く", () => {
  assertExactAnswer("ln(x)=ln(3)", "x=3", ["x>0"]);
  assert.equal(
    assertExactAnswer("log(x)=ln(x)", "0<x").answer,
    "0<x",
  );
  assertExactAnswer(
    "ln(x-1)+ln(x+1)=0",
    "x=√2",
    ["x-1>0", "x+1>0"],
  );
  assertExactAnswer("log(x)=0", "x=1", ["x>0"]);

  for (const question of ["ln(x)=2", "log(x)=1/2"]) {
    const result = solveLogarithmicEquation(question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }
});

test("相殺や0倍の後も定義域を解集合として厳密に保持する", () => {
  assert.equal(
    assertExactAnswer("log_2(x)-log_2(x)=0", "0<x").answer,
    "0<x",
  );
  assert.equal(
    assertExactAnswer("0*log_2(x-1)=0", "1<x").answer,
    "1<x",
  );
  assert.equal(
    assertExactAnswer(
      "log_2(x)+0*log_2(x-1)=log_2(x)",
      "1<x",
    ).answer,
    "1<x",
  );
  assert.equal(
    assertExactAnswer(
      "log_2(x^2-2)-log_2(x^2-2)=0",
      "x<-√2 または √2<x",
    ).answer,
    "x<-√2 または √2<x",
  );
  assert.equal(
    assertExactAnswer("log_2(2x)-log_2(x)=1", "0<x").answer,
    "0<x",
  );
  assert.equal(
    assertExactAnswer("log_2(-2x)-log_2(-x)=1", "x<0").answer,
    "x<0",
  );
  assert.equal(
    assertExactAnswer("log_2(x^2)=2*log_2(x)", "0<x").answer,
    "0<x",
  );
  assert.equal(
    assertExactAnswer(
      "0*log_2(4-x^2)+0*log_2(x-1)=0",
      "1<x<2",
    ).answer,
    "1<x<2",
  );
  assert.equal(
    assertExactAnswer(
      "0*log_2(x^2-2)+0*log_2(3/2-x)=0",
      "x<-√2 または √2<x<3/2",
    ).answer,
    "x<-√2 または √2<x<3/2",
  );
  assert.equal(
    assertExactAnswer(
      "0*log_2(4-x^2)+0*log_2(x-2)=0",
      "解なし",
    ).answer,
    "解なし",
  );

  const huge = `1${"0".repeat(400)}`;
  assert.equal(
    assertExactAnswer(
      `0*log_2(x^2-2)+0*log_2(x-${huge})=0`,
      `${huge}<x`,
    ).answer,
    `${huge}<x`,
  );
});

test("Unicode下付き・全角表記を底として保護してから正規化する", () => {
  assert.equal(preserveExplicitLogarithmBases("log₂(x)=3"), "log_2(x)=3");
  assert.equal(preserveExplicitLogarithmBases("log₁₀(x)=2"), "log_10(x)=2");
  assert.equal(preserveExplicitLogarithmBases("log_₂(x)=3"), "log_2(x)=3");
  assert.equal(preserveExplicitLogarithmBases("log₂8(x)=1"), "log₂8(x)=1");
  assertExactAnswer("log₂(x)=3", "x=8", ["x>0"]);
  assertExactAnswer("ＬＯＧ₂（ｘ）＝３", "x=8", ["x>0"]);
  assertExactAnswer("ｌｏｇ＿２（ｘ）＝３", "x=8", ["x>0"]);
  assertExactAnswer("lＯg₂（ｘ）＝３", "x=8", ["x>0"]);
});

test("不正・曖昧・現在の厳密表現外の対数入力は検証済みにしない", () => {
  for (const question of [
    "log2(x)=3",
    "log_2 x=3",
    "log_1(x)=0",
    "log_0(x)=0",
    "log_a(x)=3",
    "log_(1/2)(x)=3",
    "log_2(log_2(x))=1",
    "log_2(1/x)=1",
    "log_2(x)*log_2(x-1)=1",
    "log_2(x)+x=3",
    "log_2(x^3+1)=1",
    "log_2(x)=1/3",
    "log_2(x)=log_3(x)",
    "1/2log_2(x)=1",
    "log_2(1/x(x+1))=1",
    "log_2(x)==3",
    "log_2(x)=3 garbage",
    "log_2(x)=3;alert(1)",
    "log_2(x)=",
    "log₂2(x)=1",
    "log₂8(x)=1",
    "log₂８(x)=1",
    "log_2(x)2=6",
    "log_2(x)(2)=6",
    "log_2(x).5=1.5",
    "log_2(x)1/2=3",
  ]) {
    const result = solveLogarithmicEquation(question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }
});

test("対数分類とルーティングを行い、通常の代数・指数問題は奪わない", () => {
  assert.equal(classifyCategory("log_2(x)=3").primary, "指数・対数");
  assert.equal(classifyCategory("2log_2(x)=6").primary, "指数・対数");
  assert.equal(classifyCategory("ln(x)=0").primary, "指数・対数");
  assert.equal(solveQuestion("log_2(x)=3").solverId, LOGARITHMIC_EQUATION_SOLVER_ID);
  assert.equal(solveQuestion("log₂(x)=3").solverId, LOGARITHMIC_EQUATION_SOLVER_ID);
  assert.equal(solveQuestion("2log_2(x)=6").solverId, LOGARITHMIC_EQUATION_SOLVER_ID);
  assert.equal(solveLogarithmicEquation("2^x=8").supported, false);
  assert.equal(solveLogarithmicEquation("x^2=4").supported, false);
  assert.equal(solveLogarithmicEquation("2x+1=3").supported, false);
  assert.equal(solveQuestion("2^x=8").solverId, "exponential-equation");
  assert.equal(solveQuestion("x^2=4").solverId, "quadratic-equation");
  assert.equal(solveQuestion("2x+1=3").solverId, "linear-equation");
});

test("単語中のlogを奪わず、認識済み未対応の理由を統合ルーターでも保持する", () => {
  const identifier = solveLogarithmicEquation("catalog₂(x)=3");
  assert.equal(identifier.supported, false);
  assert.equal(identifier.verified, false);
  assert.notEqual(classifyCategory("catalog(x)=3").primary, "指数・対数");
  assert.notEqual(classifyCategory("login(x)=3").primary, "指数・対数");

  for (const [question, reason] of [
    ["log_2(x)=log_3(x)", /異なる底/u],
    ["ln(x)=2", /自然対数/u],
    ["log_2(x)=1/3", /三次以上/u],
  ]) {
    const result = solveQuestion(question);
    assert.equal(result.supported, false, question);
    assert.equal(result.resultKind, "unsupported", question);
    assert.match(result.error, reason, question);
  }
});

test("有効な式でも現在の次数上限外なら不正入力ではなく未対応にする", () => {
  for (const question of [
    "log_2(x^2+1)+log_2(x^2+2)+log_2(x^2+3)=1",
    "4*log_2(x^2+1)=1",
  ]) {
    const result = solveQuestion(question);
    assert.equal(result.supported, false, question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.resultKind, "unsupported", question);
  }
});

test("非同期ルーターでも認識済み対数の未対応理由を上書きしない", async () => {
  for (const [question, reason] of [
    ["ln(x)=2", /自然対数/u],
    ["log_2(x)=1/3", /三次以上/u],
    ["log_2(x)=log_3(x)", /異なる底/u],
  ]) {
    const result = await solveQuestionAsync(question);
    assert.equal(result.supported, false, question);
    assert.equal(result.resultKind, "unsupported", question);
    assert.match(result.error, reason, question);
  }
});
