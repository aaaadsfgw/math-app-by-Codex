import assert from "node:assert/strict";
import test from "node:test";

import {
  RESULT_KINDS,
  createInvalidMathResult,
  createSolvedMathResult,
  createUnsupportedMathResult,
  isPresentableMathResult,
  toLegacySolverResult,
} from "../js/math-core/result.js";

const verification = {
  method: "substitution",
  evidence: "元の式へ代入すると両辺が一致します。",
};

test("厳密・近似・条件付きの解答結果を区別する", () => {
  const exact = createSolvedMathResult({
    answer: "x=4",
    steps: ["2x=8", "x=4"],
    verification,
    domain: "equation",
    solverId: "linear-equation",
  });
  assert.equal(exact.kind, RESULT_KINDS.EXACT);
  assert.equal(exact.exactAnswer, "x=4");
  assert.equal(isPresentableMathResult(exact), true);
  assert.equal(Object.isFrozen(exact), true);

  const approximate = createSolvedMathResult({
    kind: RESULT_KINDS.APPROXIMATE,
    answer: "x≈1.414",
    approximateAnswer: "1.414",
    steps: ["数値計算"],
    verification,
  });
  assert.equal(approximate.approximateAnswer, "1.414");

  const conditional = createSolvedMathResult({
    kind: RESULT_KINDS.CONDITIONAL,
    answer: "x=a",
    conditions: ["a>0"],
    steps: ["条件を場合分け"],
    verification,
  });
  assert.deepEqual(conditional.conditions, ["a>0"]);
});

test("未対応と不正入力を別の状態にする", () => {
  const unsupported = createUnsupportedMathResult({
    reason: "図を必要とする問題は対象外です。",
    domain: "geometry",
  });
  const invalid = createInvalidMathResult({
    reason: "括弧が閉じていません。",
    code: "UNBALANCED_PARENTHESES",
  });
  assert.equal(unsupported.kind, RESULT_KINDS.UNSUPPORTED);
  assert.equal(unsupported.supported, false);
  assert.equal(invalid.kind, RESULT_KINDS.INVALID);
  assert.equal(invalid.supported, true);
  assert.equal(isPresentableMathResult(unsupported), false);
  assert.equal(isPresentableMathResult(invalid), false);
});

test("検証根拠や条件が欠けた結果を作れない", () => {
  assert.throws(
    () => createSolvedMathResult({ answer: "4", verification: {} }),
    /検証方法と検証根拠/,
  );
  assert.throws(
    () => createSolvedMathResult({
      kind: RESULT_KINDS.CONDITIONAL,
      answer: "x=a",
      verification,
    }),
    /条件付き結果には条件/,
  );
});

test("共通結果を既存UI用ソルバー形式へ移行できる", () => {
  const core = createSolvedMathResult({
    answer: "x=4",
    steps: ["2x=8", "x=4"],
    verification,
    solverId: "linear-equation",
  });
  assert.deepEqual(toLegacySolverResult(core), {
    supported: true,
    solved: true,
    answer: "x=4",
    exactAnswer: "x=4",
    approximateAnswer: "",
    steps: ["2x=8", "x=4"],
    solutionTrace: [
      { type: "transformation", content: "2x=8", explanation: "" },
      { type: "transformation", content: "x=4", explanation: "" },
    ],
    verified: true,
    verification: verification.evidence,
    solverId: "linear-equation",
    error: null,
    resultKind: "exact",
    conditions: [],
    solutionSet: null,
  });
});
