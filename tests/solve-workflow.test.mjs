import assert from "node:assert/strict";
import test from "node:test";

import {
  createHistoryRecordPayload,
  presentWorkflowResult,
  solveWorkflow,
} from "../js/solve-workflow.js";

function solvedResult(overrides = {}) {
  return {
    supported: true,
    solved: true,
    verified: true,
    answer: "x=4",
    exactAnswer: "x=4",
    approximateAnswer: "",
    steps: ["2x+3=11", "2x=8", "x=4"],
    solutionTrace: [
      { type: "input", content: "2x+3=11", explanation: "問題を整理します。" },
      { type: "transformation", content: "2x=8", explanation: "両辺から3を引きます。" },
      { type: "result", content: "x=4", explanation: "両辺を2で割ります。" },
    ],
    solverId: "linear-equation",
    verification: "x=4を元の式へ代入して一致しました。",
    resultKind: "exact",
    conditions: [],
    solutionSet: null,
    error: null,
    ...overrides,
  };
}

test("分類・注入solver・symbolicOperations・presenterを一つのworkflowへ接続する", async () => {
  const symbolicOperations = Object.freeze({ simplify: () => "unused" });
  const calls = [];
  const result = await solveWorkflow(" 2x + 3 = 11 ", {
    mode: "hint1",
    symbolicOperations,
    solver: async (question, options) => {
      calls.push({ question, options });
      return solvedResult();
    },
  });

  assert.equal(result.question, "2x + 3 = 11");
  assert.equal(result.classification.primary, "一次方程式");
  assert.deepEqual(calls, [{
    question: "2x + 3 = 11",
    options: { category: "一次方程式", symbolicOperations },
  }]);
  assert.equal(result.resultKind, "exact");
  assert.equal(result.outputMode, "hint1");
  assert.equal(result.presentable, true);
  assert.match(result.presentation.content, /変数を含む項と定数項/u);
  assert.doesNotMatch(result.presentation.content, /x=4/u);
  assert.equal(result.presentation.finalAnswer, "x=4");
});

test("exact・approximate・conditionalを変換せず表示可能な結果として保つ", async () => {
  for (const [resultKind, overrides] of [
    ["exact", {}],
    ["approximate", { answer: "x≈1.41", exactAnswer: "", approximateAnswer: "x≈1.41" }],
    ["conditional", { answer: "x=4（ただし a≠0）", conditions: ["a≠0"] }],
  ]) {
    const solverResult = solvedResult({ resultKind, ...overrides });
    const workflow = await solveWorkflow("2x+3=11", {
      solver: async () => solverResult,
    });
    assert.equal(workflow.solverResult, solverResult, resultKind);
    assert.equal(workflow.resultKind, resultKind, resultKind);
    assert.equal(workflow.presentable, true, resultKind);
  }
});

test("unsupportedとinvalidはpresenterへ渡さず同じsolver結果を保持する", async () => {
  for (const solverResult of [
    {
      supported: false,
      solved: false,
      verified: false,
      answer: "",
      resultKind: "unsupported",
      error: "未対応形式です。",
    },
    {
      supported: true,
      solved: false,
      verified: false,
      answer: "",
      resultKind: "invalid",
      error: "入力が不正です。",
    },
  ]) {
    let presenterCalled = false;
    const workflow = await solveWorkflow("未対応問題", {
      solver: async () => solverResult,
      presenter: () => {
        presenterCalled = true;
        throw new Error("呼ばれてはいけません");
      },
    });
    assert.equal(workflow.solverResult, solverResult);
    assert.equal(workflow.resultKind, solverResult.resultKind);
    assert.equal(workflow.presentable, false);
    assert.equal(workflow.presentation, null);
    assert.equal(presenterCalled, false);
  }
});

test("solver例外とhostile問題文をinvalidへ封じ込める", async () => {
  const thrown = await solveWorkflow("2x=4", {
    solver: async () => {
      throw new Error("worker failure");
    },
  });
  assert.equal(thrown.resultKind, "invalid");
  assert.equal(thrown.presentable, false);
  assert.match(thrown.solverResult.error, /worker failure/u);

  let solverCalled = false;
  const hostile = await solveWorkflow({
    toString() {
      throw new Error("coercion blocked");
    },
  }, {
    solver: async () => {
      solverCalled = true;
      return solvedResult();
    },
  });
  assert.equal(hostile.resultKind, "invalid");
  assert.equal(hostile.presentable, false);
  assert.equal(solverCalled, false);
  assert.match(hostile.solverResult.error, /coercion blocked/u);
});

test("未知の出力modeはanswerへ正規化する", async () => {
  const workflow = await solveWorkflow("2x+3=11", {
    mode: "constructor",
    solver: async () => solvedResult(),
  });
  assert.equal(workflow.outputMode, "answer");
  assert.equal(workflow.presentation.content, "x=4");
});

test("同じsolver結果から再計算せず別の表示段階を生成する", async () => {
  let solveCount = 0;
  const initial = await solveWorkflow("2x+3=11", {
    mode: "hint1",
    solver: async () => {
      solveCount += 1;
      return solvedResult();
    },
  });
  const steps = presentWorkflowResult(initial, "steps");
  const answer = presentWorkflowResult(initial, "answer");
  assert.equal(solveCount, 1);
  assert.equal(steps.outputMode, "steps");
  assert.match(steps.presentation.content, /x=4/u);
  assert.equal(answer.presentation.content, "x=4");
  assert.equal(steps.solverResult, initial.solverResult);
});

test("検証済みworkflowからstorage互換payloadを作るが保存は行わない", async () => {
  const workflow = await solveWorkflow("2x+3=11", {
    mode: "steps",
    solver: async () => solvedResult({
      resultKind: "conditional",
      answer: "x=4（ただし a≠0）",
      conditions: ["a≠0"],
    }),
  });
  const payload = createHistoryRecordPayload(workflow, {
    source: "selection",
    selfAssessment: "steps_solved",
    parentHistoryId: "history-1",
    additionalFields: { ocrUsed: false },
  });

  assert.equal(payload.question, "2x+3=11");
  assert.equal(payload.mode, "steps");
  assert.match(payload.output, /x=4/u);
  assert.equal(payload.finalAnswer, "x=4（ただし a≠0）");
  assert.equal(payload.category.primary, "一次方程式");
  assert.equal(payload.solverId, "linear-equation");
  assert.equal(payload.verified, true);
  assert.equal(payload.verificationType, "solver");
  assert.equal(payload.resultKind, "conditional");
  assert.deepEqual(payload.conditions, ["a≠0"]);
  assert.equal(payload.source, "selection");
  assert.equal(payload.selfAssessment, "steps_solved");
  assert.equal(payload.parentHistoryId, "history-1");
  assert.equal(payload.ocrUsed, false);
  assert.equal(Object.isFrozen(payload), true);

  payload.conditions.push("mutated");
  assert.deepEqual(workflow.solverResult.conditions, ["a≠0"]);
});

test("未対応・invalid workflowから履歴payloadを作らない", async () => {
  const workflow = await solveWorkflow("proof", {
    solver: async () => ({
      supported: false,
      solved: false,
      verified: false,
      answer: "",
      resultKind: "unsupported",
      error: "証明は未対応です。",
    }),
  });
  assert.throws(
    () => createHistoryRecordPayload(workflow),
    /表示可能な検証済み結果/u,
  );
});
