import assert from "node:assert/strict";
import test from "node:test";

import {
  SYMBOLIC_ENGINE_INFO,
  SymbolicEngineError,
  areSymbolicallyEquivalent,
  assertSafeSymbolicExpression,
  differentiateSymbolic,
  expandSymbolic,
  factorSymbolic,
  integrateSymbolic,
  rootsSymbolic,
  simplifySymbolic,
} from "../js/math-core/symbolic-adapter.js";

test("監査済み記号計算エンジンの版とライセンスを固定する", () => {
  assert.deepEqual(SYMBOLIC_ENGINE_INFO, {
    name: "Algebrite",
    version: "1.4.0",
    license: "MIT",
  });
});

test("式の簡約・展開・因数分解・微分・積分・多項式の根を計算する", () => {
  assert.equal(simplifySymbolic("(x^2-1)/(x-1)"), "x+1");
  assert.equal(expandSymbolic("(x+1)*(x-1)"), "x^2-1");
  assert.equal(factorSymbolic("x^2-1"), "(x-1)*(x+1)");
  assert.equal(differentiateSymbolic("x^3-3*x", "x"), "3*x^2-3");
  assert.equal(integrateSymbolic("sin(x)", "x"), "-cos(x)");
  assert.equal(rootsSymbolic("x^2-5*x+6", "x"), "[2,3]");
});

test("記号的な同値性を差の簡約で判定する", () => {
  assert.equal(areSymbolicallyEquivalent("(x+1)^2", "x^2+2*x+1"), true);
  assert.equal(areSymbolicallyEquivalent("sin(x)^2+cos(x)^2", "1"), true);
  assert.equal(areSymbolicallyEquivalent("x^2", "x"), false);
});

test("許可された数式と識別子だけを記号計算へ渡す", () => {
  assert.equal(assertSafeSymbolicExpression("sqrt(x^2+1)"), "sqrt(x^2+1)");

  for (const expression of [
    "x=1",
    "x);clearall;(",
    "globalThis",
    "clearall(x)",
    "x\nx",
    "[x,1]",
    "x + unknown",
  ]) {
    assert.throws(
      () => assertSafeSymbolicExpression(expression),
      SymbolicEngineError,
      expression,
    );
  }
});

test("不正構文を検証済み結果へ変換しない", () => {
  assert.throws(
    () => simplifySymbolic("2+*3"),
    (error) => error instanceof SymbolicEngineError
      && error.code === "ENGINE_REJECTED_EXPRESSION",
  );
});
