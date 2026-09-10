import assert from "node:assert/strict";
import test from "node:test";

import { createLearningSession } from "../js/learning-session.js";

function workflow(mode, { presentable = true, retryable = false } = {}) {
  return {
    question: "2x=4",
    outputMode: mode,
    classification: { primary: "一次方程式", candidates: ["一次方程式"] },
    resultKind: presentable ? "exact" : "unsupported",
    presentable,
    presentation: presentable ? { content: `${mode} output`, finalAnswer: "x=2" } : null,
    solverResult: presentable
      ? {
          supported: true,
          solved: true,
          verified: true,
          answer: "x=2",
          solverId: "linear-equation",
          resultKind: "exact",
          conditions: [],
          solutionTrace: [],
          solutionSet: null,
          verification: "checked",
        }
      : {
          supported: false,
          solved: false,
          verified: false,
          answer: "",
          resultKind: "unsupported",
          error: "unsupported",
          retryable,
        },
  };
}

function fixture({ presentable = true } = {}) {
  const calls = { solves: [], presents: [], adds: [], views: [] };
  let nextId = 1;
  const session = createLearningSession({
    solve: async (question, { mode }) => {
      calls.solves.push({ question, mode });
      return workflow(mode, { presentable });
    },
    present: (base, mode) => {
      calls.presents.push({ base, mode });
      return workflow(mode, { presentable: base.presentable });
    },
    addHistoryRecord: async (payload) => {
      calls.adds.push(payload);
      return { ...payload, id: `history-${nextId++}` };
    },
    recordView: async (id, mode, patch) => {
      calls.views.push({ id, mode, patch });
      return { id, usage: { viewedModes: [mode] } };
    },
  });
  return { session, calls };
}

test("同じ入力ではsolverを一度だけ実行しStudy履歴を一件にまとめる", async () => {
  const { session, calls } = fixture();
  session.setInput({ question: " 2x=4 ", source: "selection" });

  const first = await session.view("hint1", { learningMode: "study" });
  const second = await session.view("hint2", { learningMode: "study" });
  const third = await session.view("answer", { learningMode: "study" });

  assert.equal(first.solvedFresh, true);
  assert.equal(second.solvedFresh, false);
  assert.equal(calls.solves.length, 1);
  assert.equal(calls.solves[0].question, "2x=4");
  assert.deepEqual(calls.presents.map(({ mode }) => mode), ["hint2", "answer"]);
  assert.equal(calls.adds.length, 1);
  assert.equal(calls.adds[0].source, "selection");
  assert.deepEqual(calls.adds[0].usage.viewedModes, ["hint1"]);
  assert.deepEqual(calls.views.map(({ mode }) => mode), ["hint2", "answer"]);
  assert.equal(third.historyRecord.id, "history-1");
});

test("Quickでは全入力元で履歴APIを呼ばない", async () => {
  for (const source of ["manual", "selection", "clipboard", "ocr", "review"]) {
    const { session, calls } = fixture();
    session.setInput({
      question: "2x=4",
      source,
      ocrConfirmed: source === "ocr",
    });
    await session.view("answer", { learningMode: "quick", saveHistory: true });
    assert.equal(calls.adds.length, 0, source);
    assert.equal(calls.views.length, 0, source);
  }
});

test("Quickを挟んでも同じ入力のStudy履歴は一件を再開しQuick閲覧を混ぜない", async () => {
  const { session, calls } = fixture();
  session.setInput({ question: "2x=4", source: "manual" });
  await session.view("hint1", { learningMode: "study" });
  await session.view("answer", { learningMode: "quick" });
  await session.view("steps", { learningMode: "study" });

  assert.equal(calls.solves.length, 1);
  assert.equal(calls.adds.length, 1);
  assert.deepEqual(calls.adds[0].usage.viewedModes, ["hint1"]);
  assert.deepEqual(calls.views.map(({ id, mode }) => ({ id, mode })), [
    { id: "history-1", mode: "steps" },
  ]);
  assert.deepEqual(session.snapshot.viewedModes, ["hint1", "steps"]);
});

test("同じ表示段階の連打はStudy履歴を再更新しない", async () => {
  const { session, calls } = fixture();
  session.setInput({ question: "2x=4", source: "manual" });
  await session.view("hint1", { learningMode: "study" });
  await session.view("hint1", { learningMode: "study" });

  assert.equal(calls.solves.length, 1);
  assert.equal(calls.adds.length, 1);
  assert.equal(calls.views.length, 0);
});

test("問題または入力元の変更はsolver cacheと履歴をリセットする", async () => {
  const { session, calls } = fixture();
  assert.equal(session.setInput({ question: "2x=4", source: "manual" }), true);
  await session.view("hint1", { learningMode: "study" });
  assert.equal(session.setInput({ question: "2x=4", source: "manual" }), false);
  assert.equal(session.setInput({ question: "2x=4", source: "ocr", ocrConfirmed: true }), true);
  await session.view("answer", { learningMode: "study" });

  assert.equal(calls.solves.length, 2);
  assert.equal(calls.adds.length, 2);
  assert.equal(calls.adds[1].source, "ocr");
  assert.equal(calls.adds[1].ocrUsed, true);
  assert.equal(calls.adds[1].ocrConfirmed, true);
});

test("未確認のOCR入力はsolver呼び出し前に拒否する", async () => {
  const { session, calls } = fixture();
  session.setInput({ question: "x^2=4", source: "ocr", ocrConfirmed: false });

  await assert.rejects(
    session.view("answer", { learningMode: "quick" }),
    (error) => error.code === "OCR_CONFIRMATION_REQUIRED",
  );
  assert.equal(calls.solves.length, 0);
  assert.equal(calls.adds.length, 0);
  assert.equal(session.snapshot.hasCachedResult, false);
});

test("構造化ProblemInputをsolver・snapshot・Study履歴へ保ったまま渡す", async () => {
  let solverInput = null;
  let historyPayload = null;
  const session = createLearningSession({
    solve: async (input, { mode }) => {
      solverInput = input;
      return {
        ...workflow(mode),
        question: input.formulaText,
        problemInput: input,
      };
    },
    addHistoryRecord: async (payload) => {
      historyPayload = payload;
      return { ...payload, id: "history-structured" };
    },
    recordView: async () => null,
  });

  session.setInput({
    question: "この文字列ではなく構造化数式を使う",
    source: "selection",
    problemInput: {
      questionLabel: "(1)",
      formulaText: "2x=4",
      source: "selection",
      formulaSource: "selection",
    },
  });
  const result = await session.view("answer", { learningMode: "study" });

  assert.equal(solverInput.formulaText, "2x=4");
  assert.equal(solverInput.questionLabel, "(1)");
  assert.equal(session.snapshot.input.question, "2x=4");
  assert.equal(session.snapshot.input.problemInput.formulaSource, "selection");
  assert.equal(historyPayload.problemInput.questionLabel, "(1)");
  assert.equal(historyPayload.problemInput.formulaText, "2x=4");
  assert.equal(result.historyRecord.id, "history-structured");
});

test("ProblemInputのsourceまたはfield provenanceがOCRなら明示確認を必須にする", async () => {
  for (const provenance of [
    { source: "ocr", instructionSource: "manual", formulaSource: "manual" },
    { source: "manual", instructionSource: "ocr", formulaSource: "manual" },
    { source: "manual", instructionSource: "none", formulaSource: "ocr" },
  ]) {
    const { session, calls } = fixture();
    const input = {
      question: "2x=4",
      source: "manual",
      problemInput: {
        instructionText: provenance.instructionSource === "none" ? "" : "方程式を解け",
        formulaText: "2x=4",
        ...provenance,
      },
      ocrConfirmed: false,
    };
    session.setInput(input);
    await assert.rejects(
      session.view("answer", { learningMode: "quick" }),
      (error) => error.code === "OCR_CONFIRMATION_REQUIRED",
    );
    assert.equal(calls.solves.length, 0);
    assert.equal(session.snapshot.input.ocrUsed, true);

    session.setInput({ ...input, ocrConfirmed: true });
    await session.view("answer", { learningMode: "quick" });
    assert.equal(calls.solves.length, 1);
    assert.equal(typeof calls.solves[0].question, "object");
  }
});

test("unsupportedは表示も履歴も作らず同じ入力で再実行しない", async () => {
  const { session, calls } = fixture({ presentable: false });
  session.setInput({ question: "proof", source: "manual" });
  const first = await session.view("hint1", { learningMode: "study" });
  const second = await session.view("answer", { learningMode: "study" });
  assert.equal(first.workflow.presentable, false);
  assert.equal(second.workflow.resultKind, "unsupported");
  assert.equal(calls.solves.length, 1);
  assert.equal(calls.presents.length, 0);
  assert.equal(calls.adds.length, 0);
});

test("一時的なworkflow失敗はcacheせず同じ入力で再試行できる", async () => {
  let solveCount = 0;
  const session = createLearningSession({
    solve: async () => {
      solveCount += 1;
      return solveCount === 1
        ? workflow("answer", { presentable: false, retryable: true })
        : workflow("answer");
    },
    present: () => {
      throw new Error("retry後の初回表示ではpresentを呼ばない");
    },
    addHistoryRecord: async (payload) => ({ ...payload, id: "history-1" }),
    recordView: async () => {
      throw new Error("初回Study保存ではrecordViewを呼ばない");
    },
  });
  session.setInput({ question: "2x=4", source: "manual" });

  const failed = await session.view("answer", { learningMode: "study" });
  const retried = await session.view("answer", { learningMode: "study" });

  assert.equal(failed.workflow.presentable, false);
  assert.equal(retried.workflow.presentable, true);
  assert.equal(solveCount, 2);
  assert.equal(session.snapshot.hasCachedResult, true);
});

test("履歴保存失敗は検証済み表示を失敗扱いにしない", async () => {
  const { session, calls } = fixture();
  session._addHistory = async () => {
    calls.adds.push("failed");
    throw new Error("quota");
  };
  session.setInput({ question: "2x=4", source: "manual" });
  const result = await session.view("answer", { learningMode: "study" });
  assert.equal(result.workflow.presentable, true);
  assert.match(result.historyError.message, /quota/u);
  assert.equal(session.snapshot.historyId, null);
});
