import assert from "node:assert/strict";
import test from "node:test";

import { classifyCategory } from "../js/category-classifier.js";
import {
  areSymbolicallyEquivalent,
  simplifySymbolic,
} from "../js/math-core/symbolic-adapter.js";
import {
  solveAlgebraTransformation,
} from "../js/solver/algebra-transformation.js";
import { solveQuestionAsync } from "../js/solver/index.js";
import { presentSolution } from "../js/solution-presenter.js";

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
  assert.deepEqual(result.conditions, ["x≠1"]);
  assert.equal(result.answer, "x+1（ただし x≠1）");
  assert.match(result.verification, /定義域/);
});

test("簡約前の一次・二次分母を厳密な除外値として保持する", async () => {
  const first = await solveAlgebraTransformation("1/x+2/(x+1)を簡約せよ", {
    symbolicOperations: fakeOperations({ simplify: async () => "(3*x+1)/(x*(x+1))" }),
  });
  assert.deepEqual(first.conditions, ["x≠0", "x≠-1"]);

  const second = await solveAlgebraTransformation("1/(x^2-1)-1/(x-1)を簡約せよ", {
    symbolicOperations: fakeOperations({ simplify: async () => "-x/(x^2-1)" }),
  });
  assert.deepEqual(second.conditions, ["x≠-1", "x≠1"]);
});

test("有理式の通分を検証済み途中式と問題固有Hintへ展開する", async () => {
  const result = await solveAlgebraTransformation("1/x+2/(x+1)を簡約せよ", {
    symbolicOperations: fakeOperations({
      simplify: async () => "(3*x+1)/(x*(x+1))",
    }),
  });

  assert.equal(result.verified, true);
  assert.deepEqual(result.steps, [
    "入力式: 1/x+2/(x+1)",
    "定義域: x≠0、x≠-1",
    "共通分母: x*(x+1)",
    "(x+1)/(x*(x+1))+2*x/(x*(x+1))",
    "(x+1+2*x)/(x*(x+1))",
    "簡約結果: (3*x+1)/(x*(x+1))（ただし x≠0、x≠-1）",
  ]);

  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  const steps = presentSolution(result, { mode: "steps" }).content;
  assert.match(hint1, /分母 x と x\+1/u);
  assert.match(hint1, /共通分母 x\*\(x\+1\)/u);
  assert.match(hint2, /1\/x=\(x\+1\)\/\(x\*\(x\+1\)\)/u);
  assert.match(hint2, /2\/\(x\+1\)=2\*x\/\(x\*\(x\+1\)\)/u);
  for (const hint of [hint1, hint2]) {
    assert.doesNotMatch(hint, /3\*x\+1/u);
  }
  assert.match(steps, /\(x\+1\+2\*x\)\/\(x\*\(x\+1\)\)/u);
  assert.match(steps, /定義域: x≠0、x≠-1/u);
});

test("途中の同値性を確認できない有理式は従来の安全なStepsへ戻す", async () => {
  let equivalenceCalls = 0;
  const result = await solveAlgebraTransformation("1/x+2/(x+1)を簡約せよ", {
    symbolicOperations: fakeOperations({
      simplify: async () => "(3*x+1)/(x*(x+1))",
      equivalent: async () => {
        equivalenceCalls += 1;
        return equivalenceCalls === 1;
      },
    }),
  });
  assert.equal(result.verified, true);
  assert.match(result.steps.join("\n"), /簡約規則を順に適用/u);
  assert.doesNotMatch(result.steps.join("\n"), /共通分母/u);
});

test("入れ子の累乗を含む有理式でも括弧を保ち、各分数を個別検証する", async () => {
  const equivalencePairs = [];
  const result = await solveAlgebraTransformation(
    "1/((x^1)^2)-1/((x^1)^2)を簡約せよ",
    {
      symbolicOperations: {
        ...fakeOperations(),
        equivalent: async (left, right) => {
          equivalencePairs.push([left, right]);
          return areSymbolicallyEquivalent(left, right);
        },
        simplify: async (expression) => simplifySymbolic(expression),
      },
    },
  );

  assert.equal(result.verified, true);
  assert.equal(result.exactAnswer, "0");
  assert.match(result.steps.join("\n"), /\(x\^1\)\^2/u);
  assert.doesNotMatch(result.steps.join("\n"), /1\/x\^1\^2/u);
  assert.ok(equivalencePairs.length >= 5);
  assert.ok(equivalencePairs.some(([left]) => left !== equivalencePairs[0][0]));
});
