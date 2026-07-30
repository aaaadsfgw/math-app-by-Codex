import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import {
  solveAlgebraTransformation,
} from "../js/solver/algebra-transformation.js";
import { solveQuestionAsync } from "../js/solver/index.js";

function fakeOperations(overrides = {}) {
  return {
    equivalent: async () => true,
    expand: async () => "x^2-1",
    factor: async () => "(x-1)*(x+1)",
    simplify: async () => "1",
    ...overrides,
  };
}

test("展開・因数分解・簡約を安全な共通ASTから実行する", async () => {
  const cases = [
    ["次の式 (x+1)(x-1) を展開せよ", "x^2-1", "展開"],
    ["x^2-1を因数分解せよ", "(x-1)*(x+1)", "因数分解"],
    ["簡約: (x+1)^2-(x^2+2x)", "1", "簡約"],
  ];
  for (const [question, expected, label] of cases) {
    const result = await solveAlgebraTransformation(question, {
      symbolicOperations: fakeOperations(),
    });
    assert.equal(result.supported, true, question);
    assert.equal(result.solved, true, question);
    assert.equal(result.verified, true, question);
    assert.equal(result.answer, expected, question);
    assert.match(result.verification, new RegExp(label), question);
  }
});

test("式変形カテゴリを二次方程式より優先して分類する", () => {
  const classification = classifyCategory("x^2-1を因数分解せよ");
  assert.equal(classification.primary, "式の計算");
});

test("非同期統合ルーターは既存ソルバーを優先し、新分野へフォールスルーする", async () => {
  const linear = await solveQuestionAsync("2x+3=11", {
    symbolicOperations: fakeOperations(),
  });
  assert.equal(linear.solverId, "linear-equation");

  const algebra = await solveQuestionAsync("(x+1)(x-1)を展開せよ", {
    symbolicOperations: fakeOperations(),
  });
  assert.equal(algebra.solverId, "algebra-transformation");
  assert.equal(algebra.answer, "x^2-1");
});

test("不正入力・等式・同値性失敗を検証済みにしない", async () => {
  let transformCalls = 0;
  const unsafe = await solveAlgebraTransformation("x;clearallを展開せよ", {
    symbolicOperations: fakeOperations({
      expand: async () => {
        transformCalls += 1;
        return "bad";
      },
    }),
  });
  assert.equal(unsafe.solved, false);
  assert.equal(unsafe.resultKind, "invalid");
  assert.equal(transformCalls, 0);

  const equation = await solveAlgebraTransformation("x=1を簡約せよ", {
    symbolicOperations: fakeOperations(),
  });
  assert.equal(equation.supported, false);

  const mismatch = await solveAlgebraTransformation("x+xを簡約せよ", {
    symbolicOperations: fakeOperations({ equivalent: async () => false }),
  });
  assert.equal(mismatch.solved, false);
  assert.equal(mismatch.verified, false);
  assert.match(mismatch.error, /同値性/);
});

test("約分で消える分母条件を保持し、条件付き結果として返す", async () => {
  const result = await solveAlgebraTransformation("(x^2-1)/(x-1)を簡約せよ", {
    symbolicOperations: fakeOperations({ simplify: async () => "x+1" }),
  });
  assert.equal(result.verified, true);
  assert.equal(result.resultKind, "conditional");
  assert.deepEqual(result.conditions, ["(x-1)≠0"]);
  assert.equal(result.answer, "x+1（ただし (x-1)≠0）");
  assert.match(result.verification, /定義域/);
});
