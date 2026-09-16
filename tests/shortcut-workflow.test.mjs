import assert from "node:assert/strict";
import test from "node:test";

import {
  getShortcutInput,
  runShortcutWorkflow,
  ShortcutWorkflowError,
} from "../js/shortcut-workflow.js";

function solvedWorkflow(mode = "answer") {
  const contentByMode = {
    answer: "x=2",
    hint1: "両辺を同じ数で割ることを考えます。",
    hint2: "両辺を2で割る直前まで整理します。",
    steps: "2x=4\nx=2",
  };
  return {
    question: "2x=4",
    outputMode: mode,
    classification: { primary: "一次方程式", candidates: ["一次方程式"] },
    resultKind: "exact",
    presentable: true,
    presentation: {
      content: contentByMode[mode] ?? contentByMode.answer,
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
  assert.equal(input.question, "3x=9");
  assert.equal(input.source, "clipboard");
  assert.equal(input.problemInput.status, "ready");
  assert.equal(input.problemInput.formulaText, "3x=9");
  assert.equal(input.problemInput.source, "clipboard");
});

test("行構造で裏付けられた選択だけをProblemInputへ分離する", async () => {
  const input = await getShortcutInput({
    getSelectionText: async () => " (1) 次の方程式を解け。\n2x=4 ",
    readClipboardText: async () => "unused",
  });

  assert.equal(input.question, "(1) 次の方程式を解け。\n2x=4");
  assert.equal(input.source, "selection");
  assert.equal(input.problemInput.questionLabel, "(1)");
  assert.equal(input.problemInput.instructionText, "次の方程式を解け");
  assert.equal(input.problemInput.instructionIntent, "solve_equation");
  assert.equal(input.problemInput.formulaText, "2x=4");
  assert.equal(input.problemInput.instructionSource, "selection");
  assert.equal(input.problemInput.formulaSource, "selection");
});

test("同一行selectionも明確な日本語指示境界だけをProblemInputへ分離する", async () => {
  const input = await getShortcutInput({
    getSelectionText: async () => "x^2-5x+6=0 を解け",
    readClipboardText: async () => "unused",
  });
  assert.equal(input.source, "selection");
  assert.equal(input.problemInput.instructionText, "方程式を解け");
  assert.equal(input.problemInput.instructionIntent, "solve_equation");
  assert.equal(input.problemInput.formulaText, "x^2-5x+6=0");
});

test("番号か係数か曖昧な同一行selectionはverified結果にもclipboardにも進めない", async () => {
  let clipboardWrites = 0;
  const result = await assert.rejects(
    runShortcutWorkflow({
      getSelectionText: async () => "(3) 1/x+2/(x+1)",
      readClipboardText: async () => "original",
      writeClipboardText: async () => { clipboardWrites += 1; },
      settings: { shortcutAction: "answer", learningMode: "quick" },
    }),
    (error) => error instanceof ShortcutWorkflowError
      && error.code === "UNSUPPORTED_INPUT"
      && /問題番号か数式の係数か判別できない/u.test(error.message),
  );
  assert.equal(result, undefined);
  assert.equal(clipboardWrites, 0);
});

test("小数係数の先頭を問題番号と誤認せずverified結果だけclipboardへ書く", async () => {
  const writes = [];
  let observedProblemInput = null;
  const result = await runShortcutWorkflow({
    getSelectionText: async () => "2.0*x+1=5 を解け",
    readClipboardText: async () => "original clipboard",
    writeClipboardText: async (text) => writes.push(text),
    settings: { shortcutAction: "answer", learningMode: "quick" },
    solve: async (problemInput, { mode }) => {
      observedProblemInput = problemInput;
      return solvedWorkflow(mode);
    },
  });

  assert.equal(observedProblemInput.status, "ready");
  assert.equal(observedProblemInput.instructionIntent, "solve_equation");
  assert.equal(observedProblemInput.formulaText, "2.0*x+1=5");
  assert.deepEqual(writes, ["x=2"]);
  assert.equal(result.workflow.solverResult.verified, true);
});

test("plain selectionのx2は従来どおり推測変換せず文字列のまま渡す", async () => {
  const input = await getShortcutInput({
    getSelectionText: async () => " x2 + 5x + 2 = 0 ",
    readClipboardText: async () => "unused",
  });
  assert.deepEqual(input, { question: "x2 + 5x + 2 = 0", source: "selection" });
  assert.equal(Object.hasOwn(input, "problemInput"), false);
});

test("clipboardの問題全文もProblemInputへ安全に分離する", async () => {
  const input = await getShortcutInput({
    getSelectionText: async () => "",
    readClipboardText: async () => "次の方程式を解け。\n2x=4",
  });
  assert.equal(input.question, "次の方程式を解け。\n2x=4");
  assert.equal(input.source, "clipboard");
  assert.equal(input.problemInput.status, "ready");
  assert.equal(input.problemInput.instructionText, "次の方程式を解け");
  assert.equal(input.problemInput.instructionIntent, "solve_equation");
  assert.equal(input.problemInput.formulaText, "2x=4");
  assert.equal(input.problemInput.source, "clipboard");
  assert.equal(input.problemInput.instructionSource, "clipboard");
  assert.equal(input.problemInput.formulaSource, "clipboard");
});

test("同一行clipboardの明確な数式と指示もProblemInputへ分離する", async () => {
  const input = await getShortcutInput({
    getSelectionText: async () => "",
    readClipboardText: async () => "x^2-5x+6=0 を解け",
  });
  assert.equal(input.problemInput.status, "ready");
  assert.equal(input.problemInput.instructionIntent, "solve_equation");
  assert.equal(input.problemInput.formulaText, "x^2-5x+6=0");
  assert.equal(input.problemInput.source, "clipboard");
});

test("clipboardの問題全文を既存quadratic solverへ通しverified answerだけを書く", async () => {
  const writes = [];
  const result = await runShortcutWorkflow({
    getSelectionText: async () => "",
    readClipboardText: async () => "x^2-5x+6=0 を解け",
    writeClipboardText: async (text) => writes.push(text),
    settings: { learningMode: "quick", shortcutAction: "answer" },
  });

  assert.deepEqual(writes, ["x=2,3"]);
  assert.equal(result.input.source, "clipboard");
  assert.equal(result.workflow.problemInput.formulaText, "x^2-5x+6=0");
  assert.equal(result.workflow.solverResult.solverId, "quadratic-equation");
  assert.equal(result.workflow.solverResult.verified, true);
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

test("構造化selectionをsolverへ渡しProblemInputを履歴へ保持する", async () => {
  let clipboardReads = 0;
  const writes = [];
  let saved = null;
  const result = await runShortcutWorkflow({
    getSelectionText: async () => "(1) 次の方程式を解け。\n2x=4",
    readClipboardText: async () => {
      clipboardReads += 1;
      return "original clipboard";
    },
    writeClipboardText: async (text) => writes.push(text),
    addHistory: async (payload) => {
      saved = payload;
      return { id: "history-structured", ...payload };
    },
    settings: { learningMode: "study", saveHistory: true, shortcutAction: "answer" },
  });

  assert.equal(clipboardReads, 0);
  assert.deepEqual(writes, ["x=2"]);
  assert.equal(result.workflow.question, "2x=4");
  assert.equal(result.workflow.problemInput.instructionIntent, "solve_equation");
  assert.deepEqual(saved.problemInput, {
    schemaVersion: 1,
    rawText: "(1) 次の方程式を解け。\n2x=4",
    questionLabel: "(1)",
    instructionText: "次の方程式を解け",
    instructionIntent: "solve_equation",
    formulaText: "2x=4",
    conditions: [],
    source: "selection",
    instructionSource: "selection",
    formulaSource: "selection",
  });
});

test("labelだけを分離したselectionもrawとprovenanceを履歴へ保持する", async () => {
  let saved = null;
  const result = await runShortcutWorkflow({
    getSelectionText: async () => "(2)\n2x=4",
    readClipboardText: async () => "unused",
    writeClipboardText: async () => true,
    addHistory: async (payload) => {
      saved = payload;
      return { id: "history-label-only", ...payload };
    },
    settings: { learningMode: "study", saveHistory: true, shortcutAction: "answer" },
  });

  assert.equal(result.workflow.problemInput.questionLabel, "(2)");
  assert.equal(result.workflow.problemInput.instructionIntent, null);
  assert.deepEqual(saved.problemInput, {
    schemaVersion: 1,
    rawText: "(2)\n2x=4",
    questionLabel: "(2)",
    instructionText: "",
    instructionIntent: null,
    formulaText: "2x=4",
    conditions: [],
    source: "selection",
    instructionSource: "none",
    formulaSource: "selection",
  });
});

test("selectionの明示指示が競合する場合はterminal failureとなりclipboardを保つ", async () => {
  for (const selection of [
    "展開して因数分解せよ。\nx^2-1",
    "因数分解せよ。\nx^2-1=0",
  ]) {
    let clipboardReads = 0;
    let writes = 0;
    let saves = 0;
    await assert.rejects(
      runShortcutWorkflow({
        getSelectionText: async () => selection,
        readClipboardText: async () => {
          clipboardReads += 1;
          return "original clipboard";
        },
        writeClipboardText: async () => { writes += 1; },
        addHistory: async () => { saves += 1; },
        settings: { learningMode: "study", saveHistory: true },
      }),
      (error) => error.code === "INVALID_INPUT"
        && (!error.result || error.result.solverResult?.solverId === "problem-input"),
    );
    assert.equal(clipboardReads, 0);
    assert.equal(writes, 0);
    assert.equal(saves, 0);
  }
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

test("clipboard解析でterminal statusになった入力はsolver・clipboard・履歴へ進めない", async () => {
  for (const [clipboard, expectedCode] of [
    ["(3) 1/x+2/(x+1)", "UNSUPPORTED_INPUT"],
    ["2x=4\u0001", "INVALID_INPUT"],
  ]) {
    let solves = 0;
    let writes = 0;
    let saves = 0;
    await assert.rejects(
      runShortcutWorkflow({
        getSelectionText: async () => "",
        readClipboardText: async () => clipboard,
        writeClipboardText: async () => { writes += 1; },
        addHistory: async () => { saves += 1; },
        settings: { learningMode: "study", saveHistory: true },
        solve: async () => {
          solves += 1;
          return solvedWorkflow();
        },
      }),
      (error) => error instanceof ShortcutWorkflowError && error.code === expectedCode,
    );
    assert.equal(solves, 0);
    assert.equal(writes, 0);
    assert.equal(saves, 0);
  }
});

test("presentableを偽装しても未検証solver結果はclipboardへ書かない", async () => {
  let writes = 0;
  let saves = 0;
  await assert.rejects(
    runShortcutWorkflow({
      getSelectionText: async () => "2x=4",
      readClipboardText: async () => "unused",
      writeClipboardText: async () => { writes += 1; },
      addHistory: async () => { saves += 1; },
      settings: { learningMode: "study", saveHistory: true },
      solve: async (_question, { mode }) => {
        const workflow = solvedWorkflow(mode);
        return {
          ...workflow,
          solverResult: { ...workflow.solverResult, verified: false },
        };
      },
    }),
    (error) => error instanceof ShortcutWorkflowError && error.code === "UNSUPPORTED_INPUT",
  );
  assert.equal(writes, 0);
  assert.equal(saves, 0);
});

test("answer・hint1・hint2・stepsの設定値を対応するclipboard出力へ維持する", async () => {
  const expectedByAction = {
    answer: "x=2",
    hint1: "両辺を同じ数で割ることを考えます。",
    hint2: "両辺を2で割る直前まで整理します。",
    steps: "2x=4\nx=2",
  };
  for (const [shortcutAction, expected] of Object.entries(expectedByAction)) {
    const writes = [];
    const result = await runShortcutWorkflow({
      getSelectionText: async () => "2x=4",
      readClipboardText: async () => "unused",
      writeClipboardText: async (text) => writes.push(text),
      settings: { learningMode: "quick", shortcutAction },
      solve: async (_question, { mode }) => solvedWorkflow(mode),
    });
    assert.equal(result.action, shortcutAction);
    assert.deepEqual(writes, [expected]);
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
