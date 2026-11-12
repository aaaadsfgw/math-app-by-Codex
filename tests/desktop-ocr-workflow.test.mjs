import assert from "node:assert/strict";
import test from "node:test";
import { createOcrWorkflow } from "../desktop/services/ocr-workflow.js";
import { createShortcutRegistration } from "../desktop/services/shortcuts.js";

function recognition(formulaText, { questionLabel = "", instructionText = "", warnings = [] } = {}) {
  return {
    structuredCandidate: { questionLabel, instructionText, formulaText, rawFormulaText: formulaText },
    warnings,
  };
}

function fixture(output, options = {}) {
  const writes = [];
  const notices = [];
  let clipboardText = "previous";
  const workflow = createOcrWorkflow({
    capture: { select: async () => Uint8Array.of(1) },
    recognize: async () => output,
    clipboard: {
      readText: async () => clipboardText,
      writeText: async (text) => { writes.push(text); },
    },
    isCalculationBusy: () => false,
    onChange() {},
    notify: (message) => notices.push(message),
    ...options,
  });
  return { workflow, writes, notices, changeClipboard: (text) => { clipboardText = text; } };
}

test("desktop OCR copies a candidate with its label and math structure preserved", async () => {
  for (const [formula, expected, label] of [
    ["((x^2-5x+6)/(x-2))", "((x^2-5x+6)/(x-2))", "(1)"],
    ["3a(2a-b)-2b(a+3b)", "3a(2a-b)-2b(a+3b)", ""],
    ["2ab(a+b)/(4a)", "2ab(a+b)/(4a)", "(1)"],
  ]) {
    const { workflow, writes, notices } = fixture(recognition(formula, { questionLabel: label }));
    await workflow.start();
    assert.equal(workflow.getState().phase, "review");
    assert.deepEqual(writes, []);
    const { id, text } = workflow.getState().preview;
    await workflow.copy(id, text);
    assert.equal(workflow.getState().phase, "copied");
    assert.deepEqual(writes, [[label, expected].filter(Boolean).join("\n")]);
    assert.equal(workflow.getState().preview.text, writes[0]);
    assert.deepEqual(notices, []);
  }
});

test("desktop OCR preserves a recognized Japanese instruction for the calculator", async () => {
  const { workflow, writes } = fixture(recognition("x^2-1", {
    questionLabel: "(1)",
    instructionText: "因数分解せよ",
    warnings: ["指示と数式を別々に認識しました。各欄を画像と照合してください。"],
  }));
  await workflow.start();
  const { id, text } = workflow.getState().preview;
  await workflow.copy(id, text);
  assert.deepEqual(writes, ["(1)\n因数分解せよ\nx^2-1"]);
});

test("desktop OCR validates explicit definite bounds without ignoring ambiguity inside the integrand", async () => {
  const { workflow, writes } = fixture(recognition("∫_(1)^(3) 2*x dx", { questionLabel: "(5)" }));
  await workflow.start();
  const { id, text } = workflow.getState().preview;
  await workflow.copy(id, "(5)\n∫_(1)^(3) x2 dx");
  assert.deepEqual(writes, []);
  await workflow.copy(id, text);
  assert.deepEqual(writes, ["(5)\n∫_(1)^(3) 2*x dx"]);
});

test("desktop OCR withholds ambiguous output and validates corrected text before copying", async () => {
  for (const [formula, warnings] of [
    ["x2", []],
    ["(1) 2ab(a+b)/(4a)", []],
    ["x+1", ["左端の問題番号が不明です。"]],
    ["x+(", []],
    ["", []],
  ]) {
    const { workflow, writes } = fixture(recognition(formula, { warnings }));
    await workflow.start();
    assert.deepEqual(writes, []);
    const state = workflow.getState();
    assert.equal(state.phase, formula ? "review" : "error");
    const id = state.preview.id;
    await workflow.copy(id, "x2");
    assert.deepEqual(writes, []);
    await workflow.copy(id, "(1)\nx^2");
    assert.deepEqual(writes, ["(1)\nx^2"]);
  }
});

test("desktop OCR does not expose or copy control characters", async () => {
  const { workflow, writes } = fixture(recognition("x\u202e+1"));
  await workflow.start();
  assert.equal(workflow.getState().phase, "error");
  assert.equal(workflow.getState().preview.text, "");
  assert.deepEqual(writes, []);
});

test("desktop OCR exposes raw LaTeX even when conversion requires manual correction", async () => {
  const writes = [];
  const { workflow } = fixture({
    model: "pix2text",
    structuredCandidate: { questionLabel: "", instructionText: "", formulaText: "", rawFormulaText: "\\unknown{x}" },
    warnings: ["未対応の構文"],
  }, {
    clipboard: {
      readText: async () => { throw new Error("clipboard unavailable"); },
      writeText: async (text) => { writes.push(text); },
    },
  });
  await workflow.start();
  assert.equal(workflow.getState().phase, "review");
  const { preview } = workflow.getState();
  assert.equal(preview.text, "");
  assert.equal(preview.rawFormula, "\\unknown{x}");
  assert.equal(preview.model, "pix2text");
  assert.match(preview.warnings[0], /未対応/u);
  assert.deepEqual(writes, []);
  await workflow.copy(preview.id, "x+1");
  assert.deepEqual(writes, ["x+1"]);
});

test("desktop OCR does not overwrite changed clipboard text and a retry needs an explicit copy", async () => {
  let finish;
  const pending = new Promise((resolve) => { finish = resolve; });
  const { workflow, writes, changeClipboard } = fixture(null, { recognize: () => pending });
  const started = workflow.start();
  changeClipboard("new user clipboard");
  finish(recognition("x+1"));
  await started;
  const previous = workflow.getState().preview.id;
  assert.equal(workflow.getState().phase, "review");
  await workflow.retry(previous);
  const next = workflow.getState().preview.id;
  assert.notEqual(next, previous);
  await workflow.copy(previous, "x+1");
  assert.deepEqual(writes, []);
  await workflow.copy(next, "x+1");
  assert.deepEqual(writes, ["x+1"]);
});

test("desktop OCR blocks repeat capture, aborts recognition, and discards a late candidate", async () => {
  let recognizeSignal;
  let finish;
  let entered;
  let captures = 0;
  const pending = new Promise((resolve) => { finish = resolve; });
  const recognizing = new Promise((resolve) => { entered = resolve; });
  const { workflow, writes } = fixture(null, {
    capture: { select: async () => { captures += 1; return Uint8Array.of(1); } },
    recognize: (_png, { signal }) => {
      recognizeSignal = signal;
      entered();
      return pending;
    },
  });
  const started = workflow.start();
  await recognizing;
  await workflow.start();
  assert.equal(captures, 1);
  workflow.cancel();
  assert.equal(recognizeSignal.aborted, true);
  assert.equal(workflow.getState().preview, null);
  finish(recognition("x+1"));
  await started;
  assert.equal(workflow.busy, false);
  assert.equal(workflow.getState().phase, "idle");
  assert.deepEqual(writes, []);
});

test("desktop OCR honors selection cancellation, OCR failures, and the calculation lock", async () => {
  for (const [options, phase] of [
    [{ capture: { select: async () => null } }, "idle"],
    [{ recognize: async () => { throw new Error("タイムアウト"); } }, "error"],
    [{ isCalculationBusy: () => true }, "idle"],
  ]) {
    const { workflow, writes } = fixture(recognition("x+1"), options);
    await workflow.start();
    assert.equal(workflow.getState().phase, phase);
    assert.deepEqual(writes, []);
  }
});

test("desktop OCR shortcut coexists with calculation and reports its own registration conflict", () => {
  const callbacks = new Map();
  const actions = [];
  let conflict = true;
  const shortcuts = createShortcutRegistration({
    globalShortcut: {
      register(key, callback) {
        if (key === "Control+Shift+X" && conflict) return false;
        callbacks.set(key, callback);
        return true;
      },
      unregister: (key) => callbacks.delete(key),
      unregisterAll: () => callbacks.clear(),
    },
    onCalculate: () => actions.push("calculate"),
    onCapture: () => actions.push("capture"),
  });
  shortcuts.bind("Y");
  assert.throws(() => shortcuts.bindCapture(), /Ctrl\+Shift\+X/u);
  assert.equal(shortcuts.active, "Y");
  conflict = false;
  shortcuts.bindCapture();
  const capture = callbacks.get("Control+Shift+X");
  capture();
  callbacks.get("Control+Shift+Y")();
  assert.throws(() => shortcuts.bind("X"), /画像認識/u);
  assert.deepEqual(actions, ["capture", "calculate"]);
  shortcuts.close();
  capture();
  assert.deepEqual(actions, ["capture", "calculate"]);
});
