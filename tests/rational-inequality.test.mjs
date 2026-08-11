import assert from "node:assert/strict";
import test from "node:test";

import { presentSolution } from "../js/solution-presenter.js";
import { solveQuestion, solveQuestionAsync } from "../js/solver/index.js";
import {
  RATIONAL_INEQUALITY_SOLVER_ID,
  solveRationalInequality,
} from "../js/solver/rational-inequality.js";

function assertSolved(question, {
  exactAnswer,
  conditions = [],
}) {
  const result = solveRationalInequality(question);
  assert.equal(result.supported, true, `${question}: ${result.error}`);
  assert.equal(result.solved, true, `${question}: ${result.error}`);
  assert.equal(result.verified, true, question);
  assert.equal(result.solverId, RATIONAL_INEQUALITY_SOLVER_ID);
  assert.equal(result.resultKind, conditions.length ? "conditional" : "exact");
  assert.equal(result.exactAnswer, exactAnswer, question);
  assert.deepEqual(result.conditions, conditions, question);
  assert.equal(
    result.answer,
    conditions.length
      ? `${exactAnswer}（ただし ${conditions.join("、")}）`
      : exactAnswer,
    question,
  );
  assert.ok(result.solutionSet, question);
  assert.match(result.verification, /厳密/u);
  assert.ok(result.solutionTrace.length >= 6);
  for (const interval of result.solutionSet.intervals ?? []) {
    assert.equal(interval.lower?.approximate ?? null, null, question);
    assert.equal(interval.upper?.approximate ?? null, null, question);
  }
  return result;
}

test("一次分子・一次分母で4種類の不等号と端点開閉を区別する", () => {
  const cases = [
    ["(x-1)/(x+1)<0", "-1<x<1"],
    ["(x-1)/(x+1)<=0", "-1<x≤1"],
    ["(x-1)/(x+1)>0", "x<-1 または 1<x"],
    ["(x-1)/(x+1)>=0", "x<-1 または 1≤x"],
  ];
  for (const [question, exactAnswer] of cases) {
    assertSolved(question, { exactAnswer, conditions: ["x≠-1"] });
  }
});

test("偶数重根では符号を反転せず、零点だけを包含判定する", () => {
  for (const [operator, exactAnswer] of [
    ["<", "x<-2"],
    ["<=", "x<-2 または x=1"],
    [">", "-2<x<1 または 1<x"],
    [">=", "-2<x"],
  ]) {
    assertSolved(`(x-1)^2/(x+2)${operator}0`, {
      exactAnswer,
      conditions: ["x≠-2"],
    });
  }
  assertSolved("1/(x-1)^2>0", {
    exactAnswer: "x<1 または 1<x",
    conditions: ["x≠1"],
  });
  assertSolved("1/(x-1)^2<=0", {
    exactAnswer: "解なし",
    conditions: ["x≠1"],
  });
});

test("約分・0倍・0乗の後も元の穴だけを開端点として残す", () => {
  for (const [question, exactAnswer, conditions] of [
    ["(x^2-1)/(x-1)>=0", "-1≤x<1 または 1<x", ["x≠1"]],
    ["(x-1)/(x-1)>0", "x<1 または 1<x", ["x≠1"]],
    ["(x-1)/(x-1)>1", "解なし", ["x≠1"]],
    ["(x-1)/(x-1)>=1", "x<1 または 1<x", ["x≠1"]],
    ["1+0/(x-1)>0", "x<1 または 1<x", ["x≠1"]],
    ["0/(x-1)>=0", "x<1 または 1<x", ["x≠1"]],
    ["0/(x-1)>0", "解なし", ["x≠1"]],
    ["(x-1)^0>0", "x<1 または 1<x", ["x≠1"]],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("入れ子除算・負指数・複数の有理極を厳密に処理する", () => {
  for (const [question, exactAnswer, conditions] of [
    ["1/(1/(x-1))>=0", "1<x", ["x≠1"]],
    ["x^-1>=0", "0<x", ["x≠0"]],
    ["x^-2>0", "x<0 または 0<x", ["x≠0"]],
    ["x^-2<=0", "解なし", ["x≠0"]],
    ["1/(x-1)+1/(x+1)>0", "-1<x<0 または 1<x", ["x≠-1", "x≠1"]],
    ["1/(x-1)<=1/(x+1)", "-1<x<1", ["x≠-1", "x≠1"]],
    ["1/(x-1)>1/(x+1)", "x<-1 または 1<x", ["x≠-1", "x≠1"]],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("有理数・同一根号・異なる根号の臨界点を厳密に並べる", () => {
  for (const [question, exactAnswer, conditions] of [
    ["(x^2-2)/(x-2)>=0", "-√2≤x≤√2 または 2<x", ["x≠2"]],
    ["(x-2)/(x^2-2)>0", "-√2<x<√2 または 2<x", ["x≠-√2", "x≠√2"]],
    ["1/(x^2-2)>0", "x<-√2 または √2<x", ["x≠-√2", "x≠√2"]],
    ["(x^2-2)/(x^2-2)>=0", "x<-√2 または -√2<x<√2 または √2<x", ["x≠-√2", "x≠√2"]],
    ["(x^2-2)/(5x-7)>0", "-√2<x<7/5 または √2<x", ["x≠7/5"]],
    ["(x^2-2)/(2x-3)>0", "-√2<x<√2 または 3/2<x", ["x≠3/2"]],
    ["(x^2-2)/(x^2-3)>0", "x<-√3 または -√2<x<√2 または √3<x", ["x≠-√3", "x≠√3"]],
    [
      "1/(x^2-2)+1/(x^2-3)>0",
      "x<-√3 または -√10/2<x<-√2 または √2<x<√10/2 または √3<x",
      ["x≠-√3", "x≠-√2", "x≠√2", "x≠√3"],
    ],
    [
      "1/(x-1)+1/(x+1)>1/(x-2)",
      "-1<x<2-√3 または 1<x<2 または 2+√3<x",
      ["x≠-1", "x≠1", "x≠2"],
    ],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("実数の極がない二次分母は余計な条件を付けない", () => {
  for (const [question, exactAnswer] of [
    ["1/(x^2+1)>0", "すべての実数"],
    ["1/(x^2+1)<=0", "解なし"],
    ["1/(-x^2-1)<0", "すべての実数"],
  ]) {
    assertSolved(question, { exactAnswer });
  }
});

test("日本語・全角・左右逆の入力を全面一致で解釈する", () => {
  for (const [question, exactAnswer, conditions] of [
    ["次の分数不等式を解け：１／（ｘ－１）≧０", "1<x", ["x≠1"]],
    ["次の有理不等式を解いてください：0＜1／（x－1）", "1<x", ["x≠1"]],
    ["ｘ⁻¹＜２", "x<0 または 1/2<x", ["x≠0"]],
  ]) {
    assertSolved(question, { exactAnswer, conditions });
  }
});

test("曖昧・危険・次数上限外の入力を検証済みにしない", () => {
  for (const question of [
    "1/x(x+1)>0",
    "1/2x>0",
    "1/x x>0",
    "1/(x-1)2>0",
    "0<1/(x-1)<2",
    "1/(x-1)>0=1",
    "1/(x-1)>0 garbage",
    "1/(x-1)>0;alert(1)",
    "f(x)=1/(x-1)>0",
    "1/(x-x)>0",
    "sin(x)/(x-1)>0",
    "sqrt(x)/(x-1)>0",
    "y/(x-1)>0",
    "1/(x^3-1)>0",
    "x^-3>0",
    "(x^2-1)/(x-2)>x^2",
  ]) {
    const result = solveRationalInequality(question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }
});

test("統合ルーターは有理不等式を優先し通常の多項式不等式を奪わない", async () => {
  for (const question of ["1/(x-1)>0", "x^-1>=0", "(x^2-2)/(x^2-3)>0"]) {
    const direct = solveQuestion(question);
    assert.equal(direct.solverId, RATIONAL_INEQUALITY_SOLVER_ID, question);
    const asynchronous = await solveQuestionAsync(question);
    assert.equal(asynchronous.solverId, RATIONAL_INEQUALITY_SOLVER_ID, question);
    assert.equal(asynchronous.answer, direct.answer, question);
  }
  assert.equal(solveQuestion("x/2<1").solverId, "linear-inequality");
  assert.equal(solveQuestion("(1/2)*x<1").solverId, "linear-inequality");
  assert.equal(solveQuestion("x^2-1>=0").solverId, "quadratic-inequality");
  assert.equal(solveQuestion("x/(x-1)=0").solverId, "rational-equation");
  for (const question of ["1/2x<1", "1/x(x+1)>0", "x 2<4"]) {
    assert.equal(solveQuestion(question).verified, false, question);
  }
});

test("認識済み次数超過理由と5つの表示モードを安全に保持する", async () => {
  const unsupported = solveQuestion("1/(x-1)>x^2");
  assert.equal(unsupported.verified, false);
  assert.match(unsupported.error, /二次式まで/u);
  const asyncUnsupported = await solveQuestionAsync("1/(x-1)>x^2");
  assert.match(asyncUnsupported.error, /二次式まで/u);

  for (const question of [
    "x^(-3)>0",
    "x⁻³>0",
    "１／（ｘ³－１）＞０",
    "１÷（ｘ³－１）＞０",
  ]) {
    assert.match(solveQuestion(question).error, /指数は-2以上2以下/u, question);
    assert.match((await solveQuestionAsync(question)).error, /指数は-2以上2以下/u, question);
  }
  for (const question of ["x^3>=0", "sin(x)<2"]) {
    assert.match(solveQuestion(question).error, /不等式は現在の対応範囲外/u, question);
    assert.match(
      (await solveQuestionAsync(question)).error,
      /不等式は現在の対応範囲外/u,
      question,
    );
  }

  const result = assertSolved("(x^2-1)/(x-1)>=0", {
    exactAnswer: "-1≤x<1 または 1<x",
    conditions: ["x≠1"],
  });
  for (const mode of ["answer", "hint1", "hint2", "steps", "explain"]) {
    const presented = presentSolution(result, { mode, category: "不等式" });
    assert.equal(presented.finalAnswer, result.answer, mode);
    assert.ok(presented.content, mode);
  }
  assert.doesNotMatch(presentSolution(result, { mode: "hint1" }).content, /-1≤x/u);
  assert.doesNotMatch(presentSolution(result, { mode: "hint2" }).content, /区間符号|-1≤x/u);
  assert.match(presentSolution(result, { mode: "steps" }).content, /区間符号|-1≤x/u);
  assert.match(presentSolution(result, { mode: "explain" }).content, /区間符号/u);
  assert.doesNotThrow(() => JSON.stringify(result));
});

test("巨大な不等式入力を正規化前に拒否する", () => {
  const result = solveRationalInequality(`1/${"1".repeat(5_001)}>0`);
  assert.equal(result.solved, false);
  assert.equal(result.verified, false);
  assert.match(result.error, /長すぎ/u);
});

function parseExactRational(value) {
  const [numerator, denominator = "1"] = String(value).split("/");
  return { numerator: BigInt(numerator), denominator: BigInt(denominator) };
}

function compareRationalValues(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function solutionContainsRational(solutionSet, numerator, denominator) {
  if (solutionSet.kind === "all-real") return true;
  if (solutionSet.kind === "empty") return false;
  const value = { numerator: BigInt(numerator), denominator: BigInt(denominator) };
  return solutionSet.intervals.some((interval) => {
    const lowerComparison = interval.lower
      ? compareRationalValues(value, parseExactRational(interval.lower.exact))
      : 1;
    const upperComparison = interval.upper
      ? compareRationalValues(value, parseExactRational(interval.upper.exact))
      : -1;
    const lowerAccepted = interval.lower
      ? lowerComparison > 0 || (lowerComparison === 0 && interval.lowerClosed)
      : true;
    const upperAccepted = interval.upper
      ? upperComparison < 0 || (upperComparison === 0 && interval.upperClosed)
      : true;
    return lowerAccepted && upperAccepted;
  });
}

test("整数根から生成した240ケースを元の有理式への独立代入と照合する", () => {
  const operators = ["<", "<=", ">", ">="];
  const accepts = (operator, sign) => (
    operator === "<" ? sign < 0
      : operator === "<=" ? sign <= 0
        : operator === ">" ? sign > 0
          : sign >= 0
  );
  for (let index = 0; index < 240; index += 1) {
    const numeratorRoots = [(index % 9) - 4, ((index * 5) % 11) - 5];
    const denominatorRoots = [((index * 3) % 13) - 6, ((index * 7) % 15) - 7];
    const leadingNumerator = index % 2 ? -((index % 4) + 1) : (index % 4) + 1;
    const leadingDenominator = index % 3 ? (index % 5) + 1 : -((index % 5) + 1);
    const operator = operators[index % operators.length];
    const factor = (root) => `(x${root < 0 ? "+" : "-"}${Math.abs(root)})`;
    const question = `${leadingNumerator}*${factor(numeratorRoots[0])}`
      + `*${factor(numeratorRoots[1])}`
      + `/(${leadingDenominator}*${factor(denominatorRoots[0])}`
      + `*${factor(denominatorRoots[1])})${operator}0`;
    const result = solveRationalInequality(question);
    assert.equal(result.verified, true, `${question}: ${result.error}`);

    for (let doubled = -19; doubled <= 19; doubled += 1) {
      const numeratorFactors = numeratorRoots.map((root) => doubled - 2 * root);
      const denominatorFactors = denominatorRoots.map((root) => doubled - 2 * root);
      const isHole = denominatorFactors.some((value) => value === 0);
      const signedValue = leadingNumerator * leadingDenominator
        * numeratorFactors.reduce((product, value) => product * value, 1)
        * denominatorFactors.reduce((product, value) => product * value, 1);
      const expected = !isHole && accepts(operator, Math.sign(signedValue));
      assert.equal(
        solutionContainsRational(result.solutionSet, doubled, 2),
        expected,
        `${question} at x=${doubled}/2`,
      );
    }
  }
});
