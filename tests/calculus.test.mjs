import assert from "node:assert/strict";
import test from "node:test";

import { differentiateExpressionAst } from "../js/math-core/calculus-rules.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";
import { solveQuestionAsync } from "../js/solver/index.js";
import {
  DERIVATIVE_SOLVER_ID,
  INDEFINITE_INTEGRAL_SOLVER_ID,
  solveDerivative,
  solveIndefiniteIntegral,
} from "../js/solver/calculus.js";

function verified(result, solverId) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.solverId, solverId);
}

function operations(overrides = {}) {
  return {
    equivalent: async () => true,
    integrate: async (expression) => (
      expression === "(x^2)" || expression === "x^2" ? "1/3*x^3" : "-cos(x)"
    ),
    simplify: async (expression) => {
      if (expression.includes("x)^(2)")) return "3*x^2-2";
      if (expression.includes("/(x)")) return "1/x";
      return expression;
    },
    ...overrides,
  };
}

test("プロジェクト側の微分規則で積・商・合成関数を構成する", () => {
  for (const expression of [
    "x^3",
    "(x+1)(x-1)",
    "sin(x^2)",
    "x/(x+1)",
    "exp(2x)",
  ]) {
    const parsed = parseMathExpression(expression, { symbols: ["x"] });
    const derivative = differentiateExpressionAst(parsed.ast);
    assert.ok(derivative.expression);
  }
});

test("多項式の導関数を整理し、規則適用前の式と同値検証する", async () => {
  const result = await solveDerivative("f(x)=x^3-2x を微分せよ", {
    symbolicOperations: operations(),
  });
  verified(result, DERIVATIVE_SOLVER_ID);
  assert.equal(result.answer, "3*x^2-2");
  assert.equal(result.resultKind, "exact");
});

test("定義域が必要な微分結果を条件付きとして保持する", async () => {
  const result = await solveDerivative("log(x)を微分せよ", {
    symbolicOperations: operations(),
  });
  verified(result, DERIVATIVE_SOLVER_ID);
  assert.equal(result.resultKind, "conditional");
  assert.deepEqual(result.conditions, ["x>0"]);
  assert.match(result.answer, /ただし x>0/);

  const routed = await solveQuestionAsync("f(x)=log(x)を微分せよ", {
    symbolicOperations: operations(),
  });
  verified(routed, DERIVATIVE_SOLVER_ID);
  assert.equal(routed.resultKind, "conditional");
  assert.deepEqual(routed.conditions, ["x>0"]);
});

test("不定積分候補を独自微分規則で戻してから採用する", async () => {
  const result = await solveIndefiniteIntegral("∫x^2 dx を求めよ", {
    symbolicOperations: operations(),
  });
  verified(result, INDEFINITE_INTEGRAL_SOLVER_ID);
  assert.equal(result.answer, "1/3*x^3+C");

  const routed = await solveQuestionAsync("x^2を積分せよ", {
    category: "積分",
    symbolicOperations: operations(),
  });
  verified(routed, INDEFINITE_INTEGRAL_SOLVER_ID);
});

test("検証失敗・定積分・未対応関数を検証済みにしない", async () => {
  const mismatch = await solveIndefiniteIntegral("x^2を積分せよ", {
    symbolicOperations: operations({ equivalent: async () => false }),
  });
  assert.equal(mismatch.solved, false);
  assert.equal(mismatch.verified, false);

  const definite = await solveIndefiniteIntegral("0から1までx^2を定積分せよ", {
    symbolicOperations: operations(),
  });
  assert.equal(definite.supported, false);

  const absolute = await solveDerivative("abs(x)を微分せよ", {
    symbolicOperations: operations(),
  });
  assert.equal(absolute.supported, false);
  assert.equal(absolute.verified, false);
});

test("危険な識別子や不完全な微積分指示を実行しない", async () => {
  for (const operation of [solveDerivative, solveIndefiniteIntegral]) {
    const result = await operation("globalThis.process.exit()を微分せよ", {
      symbolicOperations: operations(),
    });
    assert.equal(result.solved, false);
    assert.equal(result.verified, false);
  }
});
