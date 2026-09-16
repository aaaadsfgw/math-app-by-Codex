import assert from "node:assert/strict";
import test from "node:test";

import { acquirePastedProblem } from "../js/problem/paste-input.js";
import { solveWorkflow } from "../js/solve-workflow.js";

function clipboardData(values = {}) {
  return {
    getData(type) {
      return values[type] ?? "";
    },
  };
}

test("structured clipboard HTML keeps canonical math while raw plain text is retained", async () => {
  const plainText = "(2) 2x2+5x+2=0 を解け";
  const extraction = Object.freeze({
    text: "(2) 2x^2+5x+2=0 を解け",
    rawText: plainText,
    usedStructure: true,
    format: "html",
    fallbackReason: "",
  });
  let observed = null;
  const acquired = acquirePastedProblem(
    clipboardData({ "text/plain": plainText, "text/html": "<span>fixture</span>" }),
    {
      extractor: {
        extractClipboardHtml(payload) {
          observed = payload;
          return extraction;
        },
      },
      documentObject: { marker: "inert-owner" },
    },
  );

  assert.equal(observed.plainText, plainText);
  assert.equal(observed.htmlText, "<span>fixture</span>");
  assert.equal(acquired.handled, true);
  assert.equal(acquired.problemInput.status, "ready");
  assert.equal(acquired.problemInput.rawText, plainText);
  assert.equal(acquired.problemInput.questionLabel, "(2)");
  assert.equal(acquired.problemInput.instructionText, "方程式を解け");
  assert.equal(acquired.problemInput.instructionIntent, "solve_equation");
  assert.equal(acquired.problemInput.formulaText, "2x^2+5x+2=0");
  assert.equal(acquired.problemInput.source, "clipboard");
  assert.equal(acquired.problemInput.instructionSource, "clipboard");
  assert.equal(acquired.problemInput.formulaSource, "clipboard");

  const workflow = await solveWorkflow(acquired.problemInput);
  assert.equal(workflow.presentable, true);
  assert.equal(workflow.solverResult.solverId, "quadratic-equation");
  assert.equal(workflow.solverResult.verified, true);
  assert.equal(workflow.solverResult.exactAnswer, "x=-2,-1/2");
});

test("plain full-problem paste uses the shared parser without guessing notation", () => {
  const acquired = acquirePastedProblem(clipboardData({
    "text/plain": "(1) 1/x+2/(x+1) を簡単にせよ",
  }), { extractor: null });

  assert.equal(acquired.extraction.usedStructure, false);
  assert.equal(acquired.problemInput.status, "ready");
  assert.equal(acquired.problemInput.questionLabel, "(1)");
  assert.equal(acquired.problemInput.instructionIntent, "simplify");
  assert.equal(acquired.problemInput.formulaText, "1/x+2/(x+1)");

  const ambiguous = acquirePastedProblem(clipboardData({
    "text/plain": "2x2-3x+5=0",
  }), { extractor: null });
  assert.equal(ambiguous.problemInput.formulaText, "2x2-3x+5=0");
  assert.doesNotMatch(ambiguous.problemInput.formulaText, /\^/u);
});

test("代表的な問題全文4形式を同じProblemInput境界で一意に分離する", () => {
  const cases = [
    {
      source: "(2) x^2-5x+6=0 を解け",
      label: "(2)",
      instruction: "方程式を解け",
      intent: "solve_equation",
      formula: "x^2-5x+6=0",
    },
    {
      source: "問題3 次の式 (x+1)^2 を展開せよ",
      label: "問題3",
      instruction: "次の式を展開せよ",
      intent: "expand",
      formula: "(x+1)^2",
    },
    {
      source: "(1) 1/x+2/(x+1) を簡単にせよ",
      label: "(1)",
      instruction: "を簡単にせよ",
      intent: "simplify",
      formula: "1/x+2/(x+1)",
    },
    {
      source: "次の関数 y=x^3-2x を微分せよ",
      label: "",
      instruction: "次の関数を微分せよ",
      intent: "differentiate",
      formula: "y=x^3-2x",
    },
  ];

  for (const expected of cases) {
    const acquired = acquirePastedProblem(clipboardData({
      "text/plain": expected.source,
    }), { extractor: null });
    assert.equal(acquired.problemInput.status, "ready", expected.source);
    assert.equal(acquired.problemInput.questionLabel, expected.label, expected.source);
    assert.equal(acquired.problemInput.instructionText, expected.instruction, expected.source);
    assert.equal(acquired.problemInput.instructionIntent, expected.intent, expected.source);
    assert.equal(acquired.problemInput.formulaText, expected.formula, expected.source);
    assert.equal(acquired.problemInput.source, "clipboard", expected.source);
  }
});

test("Unicode superscript is explicit inline evidence but remains literal acquisition data", () => {
  const acquired = acquirePastedProblem(clipboardData({
    "text/plain": "x² を展開せよ",
  }), { extractor: null });

  assert.equal(acquired.problemInput.status, "ready");
  assert.equal(acquired.problemInput.instructionIntent, "expand");
  assert.equal(acquired.problemInput.formulaText, "x²");
});

test("Unicode上付きと明示演算記号は推測せず既存notation正規化からverifiedへ進む", async () => {
  const superscript = acquirePastedProblem(clipboardData({
    "text/plain": "x²-5x+6=0 を解け",
  }), { extractor: null });
  const quadratic = await solveWorkflow(superscript.problemInput);
  assert.equal(quadratic.solverResult.solverId, "quadratic-equation");
  assert.equal(quadratic.solverResult.exactAnswer, "x=2,3");
  assert.equal(quadratic.solverResult.verified, true);

  const explicitMultiply = acquirePastedProblem(clipboardData({
    "text/plain": "2×x＝4 を解け",
  }), { extractor: null });
  assert.equal(explicitMultiply.problemInput.formulaText, "2×x＝4");
  const linear = await solveWorkflow(explicitMultiply.problemInput);
  assert.equal(linear.solverResult.solverId, "linear-equation");
  assert.equal(linear.solverResult.exactAnswer, "x=2");
  assert.equal(linear.solverResult.verified, true);
});

test("a parenthesized coefficient without separator or closed instruction is never removed", () => {
  for (const source of [
    "(2)x^2 を展開せよ",
    "(2)*(x+1) を展開せよ",
    "(1+x) を展開せよ",
    "(1+x)(1-x)",
    "f((2+x))",
    "(2) x^2",
  ]) {
    const acquired = acquirePastedProblem(clipboardData({ "text/plain": source }), {
      extractor: null,
    });
    assert.equal(acquired.problemInput.questionLabel, "", source);
    assert.equal(
      acquired.problemInput.formulaText,
      source === "(1+x) を展開せよ" ? "(1+x)" : source,
      source,
    );
    if (source.startsWith("(2)")) assert.equal(acquired.problemInput.status, "unsupported", source);
  }
});

test("unreadable or empty clipboard data is left to the browser", () => {
  const unreadable = acquirePastedProblem({
    getData() {
      throw new Error("unavailable");
    },
  });
  assert.equal(unreadable.handled, false);
  assert.equal(unreadable.problemInput, null);

  const empty = acquirePastedProblem(clipboardData());
  assert.equal(empty.handled, false);
});
