import assert from "node:assert/strict";
import test from "node:test";
import { solveWorkflow } from "../js/solve-workflow.js";
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
