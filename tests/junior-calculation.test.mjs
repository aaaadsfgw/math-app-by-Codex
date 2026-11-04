import assert from "node:assert/strict";
import test from "node:test";
import { solveWorkflow } from "../js/solve-workflow.js";
import { parseCombinedProblemText } from "../js/problem/problem-input.js";
import { areSymbolicallyEquivalent, expandSymbolic, factorSymbolic, simplifySymbolic } from "../js/math-core/symbolic-adapter.js";

export const symbolicOperations = {
  simplify: simplifySymbolic, expand: expandSymbolic,
  factor: factorSymbolic, equivalent: areSymbolicallyEquivalent,
};

test("等号なしの基本計算は有理数と式として検証し、=0を補わない", async () => {
  for (const [input, expected] of [
    ["3+5", "8"], ["(-3)+(-7)", "-10"], ["(-4)*(-5)", "20"],
    ["2/3+1/4", "11/12"], ["3x+5x", "8*x"], ["2(x+3)-x", "x+6"],
    ["(x+2)(x+3)", "x^2+5*x+6"], ["x²-5x+6", "x^2-5*x+6"],
    ["x²-5x+6=0", "x=2,3"], ["0.1+0.2", "3/10"], ["2^5", "32"],
    ["9007199254740993+1", "9007199254740994"], ["3a+5a", "8*a"],
    ["√12", "2√3"], ["√0", "0"], ["√9", "3"], ["sqrt(12/25)", "2√3/5"],
  ]) {
    const result = await solveWorkflow(input, { symbolicOperations });
    assert.equal(result.presentable, true, input);
    assert.equal(result.solverResult.verified, true, input);
    assert.equal(result.solverResult.exactAnswer, expected, input);
    if (!input.includes("=")) assert.equal(result.classification.primary, "式の計算", input);
  }
});

test("元の分母条件を保持し、未対応・欠損・定義域違反を表示しない", async () => {
  const conditional = await solveWorkflow("(x^2-1)/(x-1)", { symbolicOperations });
  assert.deepEqual(conditional.solverResult.conditions, ["x≠1"]);
  const zeroPower = await solveWorkflow("x^0", { symbolicOperations });
  assert.deepEqual(zeroPower.solverResult.conditions, ["x≠0"]);
  for (const input of ["3+", "(x+2", "1/0", "0*(1/0)", "0^0", "x/(x-x)", "√(-12)", "sqrt(x^2)", "sin(1)", "x+y", "3+5\n2+4", "x2+1"]) {
    const result = await solveWorkflow(input, { symbolicOperations });
    assert.equal(result.presentable, false, input);
    assert.equal(result.solverResult.verified, false, input);
  }
});

test("数値結果はCASの同値判定だけでも誤って検証済みにならない", async () => {
  const result = await solveWorkflow("2/3+1/4", {
    symbolicOperations: { ...symbolicOperations, simplify: () => "0.916667", equivalent: () => true },
  });
  assert.equal(result.presentable, false);
});

test("番号を構造的に分離し数学的な括弧と小数点を保持する", async () => {
  for (const label of ["(1)", "（1）", "①", "②", "③", "1.", "1)", "問1", "問題1"]) {
    const input = `${label} 3+5`;
    const result = await solveWorkflow(input, { symbolicOperations });
    assert.equal(result.problemInput.questionLabel, label, input);
    assert.equal(result.problemInput.formulaText, "3+5", input);
    assert.equal(result.solverResult.exactAnswer, "8", input);
  }
  const labeled = await solveWorkflow("(2) 2x+3x", { symbolicOperations });
  assert.equal(labeled.solverResult.exactAnswer, "5*x");
  for (const [input, answer] of [["(1+x)(2+x)", "x^2+3*x+2"], ["(2)x²", "2*x^2"], ["(1/2)x", "1/2*x"], ["1.5+2", "7/2"], ["(1)+3", "4"]]) {
    const parsed = parseCombinedProblemText(input);
    assert.equal(parsed.questionLabel, "", input);
    assert.equal(parsed.formulaText, input, input);
    const result = await solveWorkflow(input, { symbolicOperations });
    assert.equal(result.solverResult.exactAnswer, answer, input);
  }
  for (const input of ["(2) x²", "(1) (x+1)", "(1) +3", "1.5+", "① 3+5 ② 2+4"]) {
    const result = await solveWorkflow(input, { symbolicOperations });
    assert.equal(result.presentable, false, input);
  }
});

test("日本語指示を単一の式へ結び付け、明示された操作を維持する", async () => {
  for (const [input, answer, intent] of [
    ["次の式を計算しなさい。3x+5x", "8*x", "simplify"],
    ["次の計算をしなさい。2/3+1/4", "11/12", "simplify"],
    ["計算せよ。(-4)*(-5)", "20", "simplify"],
    ["② 次の式を計算しなさい。(-3)+5", "2", "simplify"],
    ["次の式を簡単にしなさい。2(x+3)-x", "x+6", "simplify"],
    ["次の式を展開しなさい。(x+2)(x+3)", "x^2+5*x+6", "expand"],
    ["次の式を因数分解しなさい。x²-5x+6", "(x-3)*(x-2)", "factor"],
    ["次の方程式を解きなさい。x²-5x+6=0", "x=2,3", "solve_equation"],
    ["次の式を計算しなさい。\n√12", "2√3", "simplify"],
    ["3+5 を計算せよ", "8", "simplify"],
    ["次の式を計算しなさい。\n① 3+5", "8", "simplify"],
    ["次の式を計算しなさい。(2) 2x+3x", "5*x", "simplify"],
  ]) {
    const result = await solveWorkflow(input, { symbolicOperations });
    assert.equal(result.presentable, true, input);
    assert.equal(result.problemInput.instructionIntent, intent, input);
    assert.equal(result.solverResult.exactAnswer, answer, input);
  }
  for (const input of ["計算せよ。x=2", "計算せよ。3+", "計算せよ。3+5,2+4", "計算せよ。3+5\n2+4", "計算せよ。りんご3個と5個", "次の式を2倍して計算せよ。3+5", "次の式を2倍して展開せよ。3+5", "次の式を展開しなさい。x=2", "次の方程式を解きなさい。x²-5x+6"]) {
    const result = await solveWorkflow(input, { symbolicOperations });
    assert.equal(result.presentable, false, input);
  }
  for (const input of ["次の式を簡単にしなさい。sqrt(x)^2", "① 次の式を計算しなさい。② 3+5", "次の式を計算しなさい。\n(2) x²"]) {
    assert.equal((await solveWorkflow(input, { symbolicOperations })).presentable, false, input);
  }
});
