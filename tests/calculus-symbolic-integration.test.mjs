import assert from "node:assert/strict";
import test from "node:test";

import {
  areSymbolicallyEquivalent,
  integrateSymbolic,
  simplifySymbolic,
} from "../js/math-core/symbolic-adapter.js";
import {
  solveDerivative,
  solveIndefiniteIntegral,
} from "../js/solver/calculus.js";

const symbolicOperations = Object.freeze({
  equivalent: async (left, right) => areSymbolicallyEquivalent(left, right),
  integrate: async (expression, variable) => integrateSymbolic(expression, variable),
  simplify: async (expression) => simplifySymbolic(expression),
});

test("実記号エンジンで独自微分規則を整理・照合する", async () => {
  const polynomial = await solveDerivative("f(x)=x^3-2x を微分せよ", {
    symbolicOperations,
  });
  assert.equal(polynomial.verified, true, polynomial.error);
  assert.equal(polynomial.answer, "3*x^2-2");

  const chain = await solveDerivative("sin(x^2)を微分せよ", {
    symbolicOperations,
  });
  assert.equal(chain.verified, true, chain.error);
  assert.equal(
    areSymbolicallyEquivalent(chain.answer, "2*x*cos(x^2)"),
    true,
  );
});

test("実記号エンジンの不定積分候補を独自微分規則で検証する", async () => {
  for (const question of [
    "∫x^2 dx を求めよ",
    "sin(x)を積分せよ",
    "exp(x)を積分せよ",
  ]) {
    const result = await solveIndefiniteIntegral(question, { symbolicOperations });
    assert.equal(result.verified, true, `${question}: ${result.error}`);
    assert.match(result.answer, /\+C$/u);
  }
});

