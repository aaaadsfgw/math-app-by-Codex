import assert from "node:assert/strict";
import test from "node:test";

import {
  areSymbolicallyEquivalent,
  expandSymbolic,
  factorSymbolic,
  integrateSymbolic,
  simplifySymbolic,
} from "../js/math-core/symbolic-adapter.js";
import { parseCombinedProblemText } from "../js/problem/problem-input.js";
import { solveWorkflow } from "../js/solve-workflow.js";

const symbolicOperations = Object.freeze({
  equivalent: async (left, right) => areSymbolicallyEquivalent(left, right),
  expand: async (expression) => expandSymbolic(expression),
  factor: async (expression) => factorSymbolic(expression),
  integrate: async (expression, variable) => integrateSymbolic(expression, variable),
  simplify: async (expression) => simplifySymbolic(expression),
});

test("分数式の計算instructionを簡約へ限定し元の定義域を保持する", async () => {
  const workflow = await solveWorkflow({
    instructionText: "分数式を計算せよ。",
    formulaText: "1/x+2/(x+1)",
    source: "manual",
    instructionSource: "manual",
    formulaSource: "manual",
  }, { symbolicOperations });

  assert.equal(workflow.presentable, true, workflow.solverResult.error);
  assert.equal(workflow.solverResult.solverId, "algebra-transformation");
  assert.equal(workflow.solverResult.exactAnswer, "(3*x+1)/(x*(x+1))");
  assert.deepEqual(workflow.solverResult.conditions, ["x≠0", "x≠-1"]);
  assert.equal(workflow.resultKind, "conditional");
});

test("約分後に消える穴をProblemInput簡約でも失わない", async () => {
  const workflow = await solveWorkflow({
    instructionText: "次の式を簡単にせよ。",
    formulaText: "1/(x^2-1)-1/(x-1)",
  }, { symbolicOperations });

  assert.equal(workflow.presentable, true, workflow.solverResult.error);
  assert.equal(workflow.solverResult.exactAnswer, "-x/(x^2-1)");
  assert.deepEqual(
    workflow.solverResult.conditions,
    ["x≠-1", "x≠1"],
  );
  assert.equal(workflow.resultKind, "conditional");
});

test("問題番号付き有理方程式を番号なしで専用equation群へ終端dispatchする", async () => {
  const workflow = await solveWorkflow({
    questionLabel: "(1)",
    instructionText: "次の方程式を解け。",
    formulaText: "(4*x-6)/(x^2-5*x+6)=1",
  }, { symbolicOperations });

  assert.equal(workflow.presentable, true, workflow.solverResult.error);
  assert.equal(workflow.problemInput.questionLabel, "(1)");
  assert.equal(workflow.solverResult.solverId, "rational-equation");
  assert.equal(workflow.solverResult.exactAnswer, "x=(9-√33)/2,(9+√33)/2");
  assert.deepEqual(workflow.solverResult.conditions, ["x≠2", "x≠3"]);
  assert.equal(workflow.solverResult.verified, true);
});

test("factorとexpandの手動instructionを実symbolic engineで検証する", async () => {
  const factor = await solveWorkflow({
    instructionText: "因数分解せよ",
    formulaText: "x^2-1",
  }, { symbolicOperations });
  assert.equal(factor.solverResult.exactAnswer, "(x-1)*(x+1)");
  assert.equal(factor.solverResult.verified, true);

  const expand = await solveWorkflow({
    instructionText: "展開せよ",
    formulaText: "(x+1)(x-1)",
  }, { symbolicOperations });
  assert.equal(expand.solverResult.exactAnswer, "x^2-1");
  assert.equal(expand.solverResult.verified, true);
});

test("13種類すべての明示intentを対応solverへ終端dispatchする", async () => {
  const cases = [
    ["simplify", "x^2-1", "algebra-transformation", "x^2-1"],
    ["expand", "(x+1)(x-1)", "algebra-transformation", "x^2-1"],
    ["factor", "x^2-1", "algebra-transformation", "(x-1)*(x+1)"],
    ["solve_equation", "x^2-1=0", "quadratic-equation", "x=-1,1"],
    ["differentiate", "x^3-2x", "derivative", "3*x^2-2"],
    ["integrate", "x^2", "indefinite-integral", "1/3*x^3+C"],
    ["definite_integral", "∫_0^1 x^2 dx", "definite-integral", "1/3"],
    ["limit", "lim_(x->1) (x^2-1)/(x-1)", "finite-limit", "2"],
    ["tangent", "tangent_x_[1](x^2)", "polynomial-tangent", "y=2x-1"],
    ["normal", "normal_x_[1](x^2)", "polynomial-normal", "y=-(1/2)x+3/2"],
    [
      "monotonicity",
      "y=x^3",
      "polynomial-variation",
      "増加区間: (-∞,+∞); 減少区間: なし; 一定区間: なし",
    ],
    [
      "extrema",
      "f(x)=x^2",
      "polynomial-variation",
      "極大: なし; 極小: (0,0); 極値でない停留点: なし",
    ],
    [
      "monotonicity_extrema",
      "x^3-3x",
      "polynomial-variation",
      "増加区間: (-∞,-1] または [1,+∞); 減少区間: [-1,1]; 一定区間: なし; 極大: (-1,2); 極小: (1,-2); 極値でない停留点: なし",
    ],
  ];

  for (const [instructionIntent, formulaText, solverId, exactAnswer] of cases) {
    const workflow = await solveWorkflow({ instructionIntent, formulaText }, {
      symbolicOperations,
    });
    assert.equal(workflow.presentable, true, instructionIntent);
    assert.equal(workflow.resultKind, "exact", instructionIntent);
    assert.equal(workflow.solverResult.solverId, solverId, instructionIntent);
    assert.equal(workflow.solverResult.exactAnswer, exactAnswer, instructionIntent);
    assert.equal(workflow.solverResult.verified, true, instructionIntent);
  }
});

test("明示intentの失敗後に別solverへfallbackしない", async () => {
  const conflict = await solveWorkflow({
    instructionText: "因数分解せよ",
    formulaText: "x^2-1=0",
  }, { symbolicOperations });
  assert.equal(conflict.presentable, false);
  assert.equal(conflict.resultKind, "invalid");
  assert.equal(conflict.solverResult.solverId, "problem-input");

  const unsupportedDerivative = await solveWorkflow({
    instructionText: "微分せよ",
    formulaText: "x^2=4",
  }, { symbolicOperations });
  assert.equal(unsupportedDerivative.presentable, false);
  assert.notEqual(unsupportedDerivative.solverResult.solverId, "quadratic-equation");
  assert.equal(unsupportedDerivative.solverResult.verified, false);
});

test("指示なしformulaは従来routerでそのまま解ける", async () => {
  const workflow = await solveWorkflow({ formulaText: "x^2-5x+6=0" }, {
    symbolicOperations,
  });
  assert.equal(workflow.presentable, true, workflow.solverResult.error);
  assert.equal(workflow.solverResult.solverId, "quadratic-equation");
  assert.equal(workflow.solverResult.verified, true);
});

test("同一行の日本語指示と数式を分離して5つの既存solverへ接続する", async () => {
  const cases = [
    ["x^2-5x+6=0 を解け", "solve_equation", "x^2-5x+6=0", "quadratic-equation", "x=2,3"],
    ["2.0*x+1=5 を解け", "solve_equation", "2.0*x+1=5", "linear-equation", "x=2"],
    ["y=x^3-2x を微分せよ", "differentiate", "y=x^3-2x", "derivative", "3*x^2-2"],
    ["(x+1)^2 を展開せよ", "expand", "(x+1)^2", "algebra-transformation", "x^2+2*x+1"],
    ["次の式「(x+1)^2」を展開せよ", "expand", "(x+1)^2", "algebra-transformation", "x^2+2*x+1"],
    ["x^2-1 を因数分解せよ", "factor", "x^2-1", "algebra-transformation", "(x-1)*(x+1)"],
    ["次の式『x^2-1』を因数分解せよ", "factor", "x^2-1", "algebra-transformation", "(x-1)*(x+1)"],
    ["1/x+2/(x+1) を簡単にせよ", "simplify", "1/x+2/(x+1)", "algebra-transformation", "(3*x+1)/(x*(x+1))"],
  ];

  for (const [source, intent, formula, solverId, exactAnswer] of cases) {
    const problemInput = parseCombinedProblemText(source, { source: "selection" });
    const workflow = await solveWorkflow(problemInput, { symbolicOperations });
    assert.equal(problemInput.instructionIntent, intent, source);
    assert.equal(problemInput.formulaText, formula, source);
    assert.equal(workflow.presentable, true, source);
    assert.equal(workflow.solverResult.solverId, solverId, source);
    assert.equal(workflow.solverResult.exactAnswer, exactAnswer, source);
    assert.equal(workflow.solverResult.verified, true, source);
  }
});
