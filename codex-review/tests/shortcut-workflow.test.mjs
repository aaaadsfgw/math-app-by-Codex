import assert from "node:assert/strict";
import test from "node:test";

import {
  getShortcutInput,
  runShortcutWorkflow,
} from "../js/shortcut-workflow.js";

function solvedWorkflow(mode = "answer") {
  return {
    question: "2x=4",
    outputMode: mode,
    classification: { primary: "一次方程式", candidates: ["一次方程式"] },
    resultKind: "exact",
    presentable: true,
    presentation: {
      content: mode === "answer" ? "x=2" : "両辺を同じ数で割ることを考えます。",
      finalAnswer: "x=2",
    },
    solverResult: {
      supported: true,
      solved: true,
      verified: true,
      answer: "x=2",
      solverId: "linear-equation",
      resultKind: "exact",
      conditions: [],
      solutionTrace: [],
      solutionSet: null,
      verification: "代入検証済み",
    },
  };
}

test("選択テキストをclipboardより優先する", async () => {
  let clipboardReads = 0;
  const input = await getShortcutInput({
    getSelectionText: async () => "  2x=4  ",
    readClipboardText: async () => {
      clipboardReads += 1;
      return "3x=9";
    },
  });
  assert.deepEqual(input, { question: "2x=4", source: "selection" });
  assert.equal(clipboardReads, 0);
});

test("選択がなければclipboardから問題を取得する", async () => {
  const input = await getShortcutInput({
    getSelectionText: async () => "",
    readClipboardText: async () => " 3x=9 ",
  });
  assert.deepEqual(input, { question: "3x=9", source: "clipboard" });
});

test("Quick Modeはコピーしても履歴へ保存しない", async () => {
  const writes = [];
  let saves = 0;
  const result = await runShortcutWorkflow({
    getSelectionText: async () => "2x=4",
    readClipboardText: async () => "unused",
    writeClipboardText: async (text) => writes.push(text),
    addHistory: async () => { saves += 1; },
    settings: { learningMode: "quick", saveHistory: true, shortcutAction: "answer" },
    solve: async (_question, { mode }) => solvedWorkflow(mode),
  });
  assert.deepEqual(writes, ["x=2"]);
  assert.equal(saves, 0);
  assert.equal(result.input.source, "selection");
});

test("Study Modeは入力元と閲覧modeを履歴payloadへ記録する", async () => {
  let saved = null;
  const result = await runShortcutWorkflow({
    getSelectionText: async () => "",
    readClipboardText: async () => "2x=4",
    writeClipboardText: async () => true,
    addHistory: async (payload) => {
      saved = payload;
      return { id: "history-1", ...payload };
    },
    settings: { learningMode: "study", saveHistory: true, shortcutAction: "hint1" },
    solve: async (_question, { mode }) => solvedWorkflow(mode),
  });
  assert.match(result.clipboardOutput, /同じ数/u);
  assert.equal(saved.source, "clipboard");
  assert.equal(saved.entryPoint, "shortcut");
  assert.equal(saved.learningMode, "study");
  assert.deepEqual(saved.usage.viewedModes, ["hint1"]);
});

test("unsupportedとinvalidはclipboardも履歴も変更しない", async () => {
  for (const resultKind of ["unsupported", "invalid"]) {
    let writes = 0;
    let saves = 0;
    await assert.rejects(
      runShortcutWorkflow({
        getSelectionText: async () => "problem",
        readClipboardText: async () => "unused",
        writeClipboardText: async () => { writes += 1; },
        addHistory: async () => { saves += 1; },
        settings: { learningMode: "study", saveHistory: true },
        solve: async () => ({
          resultKind,
          presentable: false,
          solverResult: { error: `${resultKind} problem` },
        }),
      }),
      (error) => error.code === (resultKind === "invalid" ? "INVALID_INPUT" : "UNSUPPORTED_INPUT"),
    );
    assert.equal(writes, 0);
    assert.equal(saves, 0);
  }
});

test("clipboard書き込み失敗時は履歴へ保存しない", async () => {
  let saves = 0;
  await assert.rejects(
    runShortcutWorkflow({
      getSelectionText: async () => "2x=4",
      readClipboardText: async () => "unused",
      writeClipboardText: async () => {
        const error = new Error("permission denied");
        error.code = "WRITE_FAILED";
        throw error;
      },
      addHistory: async () => { saves += 1; },
      settings: { learningMode: "study", saveHistory: true },
      solve: async (_question, { mode }) => solvedWorkflow(mode),
    }),
    (error) => error.code === "WRITE_FAILED",
  );
  assert.equal(saves, 0);
});

test("履歴保存失敗は成功したclipboard出力を無効にしない", async () => {
  const result = await runShortcutWorkflow({
    getSelectionText: async () => "2x=4",
    readClipboardText: async () => "unused",
    writeClipboardText: async () => true,
    addHistory: async () => { throw new Error("quota"); },
    settings: { learningMode: "study", saveHistory: true },
    solve: async (_question, { mode }) => solvedWorkflow(mode),
  });
  assert.equal(result.clipboardOutput, "x=2");
  assert.match(result.historyError.message, /quota/u);
});
