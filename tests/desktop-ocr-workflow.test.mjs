import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { createCalculator } from "../desktop/services/calculator.js";
import { createEngine } from "../desktop/services/engine.js";
import { createOcrWorkflow } from "../desktop/services/ocr-workflow.js";
import { createShortcutRegistration } from "../desktop/services/shortcuts.js";
import { parseCombinedProblemText } from "../js/problem/problem-input.js";

function recognition(formulaText, {
  questionLabel = "", instructionText = "", rawFormulaText = formulaText, warnings = [],
} = {}) {
  return {
    model: "pix2text",
    structuredCandidate: { questionLabel, instructionText, formulaText, rawFormulaText },
    warnings,
  };
}

function deferred() {
  let resolve;
  const promise = new Promise((finish) => { resolve = finish; });
  return { promise, resolve };
}

function fixture(output, options = {}) {
  const writes = [];
  const notices = [];
  const calculations = [];
  const reviews = [];
  let clipboardText = "previous";
  let clipboardSequence = 1;
  const clipboard = {
    readText: async () => clipboardText,
    captureStamp: async () => clipboardSequence,
    writeText: async (text) => {
      clipboardText = text;
      clipboardSequence += 1;
      writes.push(text);
    },
    async writeIfUnchanged(stamp, text) {
      if (stamp !== clipboardSequence) return false;
      await this.writeText(text);
      return true;
    },
  };
  const workflow = createOcrWorkflow({
    capture: {
      async select({ onOverlayReady, onSelection }) {
        onOverlayReady();
        onSelection();
        return Uint8Array.of(1);
      },
    },
    recognize: async () => output,
    calculator: {
      async calculateOcr(input, { signal }) {
        calculations.push(input);
        signal.throwIfAborted();
        return { answer: "5", kind: "exact", conditions: [] };
      },
    },
    clipboard,
    isCalculationBusy: () => false,
    onChange() {},
    notify: (message) => notices.push(message),
    onReview: () => reviews.push(workflow.getState().phase),
    ...options,
  });
  return { workflow, clipboard, writes, notices, calculations, reviews,
    changeClipboard(text) {
      clipboardText = text;
      clipboardSequence += 1;
    },
  };
}

async function workerFixture(t, output, engine = createEngine()) {
  const calculator = createCalculator({
    engine,
    clipboard: {
      readText: async () => assert.fail("OCR calculation must not read the clipboard"),
      writeText: async () => assert.fail("OCR calculation must leave clipboard writes to the workflow"),
    },
    onChange() {},
  });
  t.after(() => calculator.close());
  await calculator.initialize();
  return fixture(output, { calculator });
}

test("desktop OCR manually copies a reviewed problem with its label and math structure preserved", async () => {
  for (const [formula, expected, label] of [
    ["((x^2-5x+6)/(x-2))", "((x^2-5x+6)/(x-2))", "(1)"],
    ["3a(2a-b)-2b(a+3b)", "3a(2a-b)-2b(a+3b)", ""],
    ["2ab(a+b)/(4a)", "2ab(a+b)/(4a)", "(1)"],
  ]) {
    const { workflow, writes, calculations } = fixture(recognition(formula, {
      questionLabel: label,
      warnings: ["左端の問題番号が不明です。"],
    }));
    await workflow.start();
    assert.equal(workflow.getState().phase, "review");
    assert.deepEqual(writes, []);
    const { id, text } = workflow.getState().preview;
    await workflow.copy(id, text);
    assert.deepEqual(writes, [[label, expected].filter(Boolean).join("\n")]);
    assert.equal(workflow.getState().preview.text, writes[0]);
    assert.deepEqual(calculations, []);
  }
});

const verifiedExamples = [
  { name: "arithmetic", formula: "(+19)+(-14)", answer: "5" },
  { name: "a quadratic equation", formula: "2x^2-7x+3=0", answer: "x=1/2,3" },
  {
    name: "a Japanese expansion instruction",
    formula: "3a(2a-b)-2b(a+3b)",
    answer: "-5*a*b+6*a^2-6*b^2",
    recognitionOptions: {
      questionLabel: "(1)",
      instructionText: "次の式を展開しなさい。",
      rawFormulaText: String.raw`3a\left(2a-b\right)-2b\left(a+3b\right)`,
      warnings: ["指示と数式を別々に認識しました。各欄を画像と照合してください。"],
    },
  },
  {
    name: "a labeled fraction and its domain",
    formula: "((x^2-5x+6)/(x-2))",
    answer: "x-3（ただし x≠2）",
    kind: "conditional",
    conditions: ["x≠2"],
    recognitionOptions: { questionLabel: "(1)", rawFormulaText: String.raw`\frac{x^2-5x+6}{x-2}` },
  },
  { name: "an integral", formula: "∫ 2*x*cos(x^2) dx", answer: "sin(x^2)+C" },
  { name: "a definite integral", formula: "∫_(1)^(3) 2*x dx", answer: "8" },
  { name: "a one-sided limit", formula: "lim_(x->1+) 1/(x-1)", answer: "+∞" },
];

for (const example of verifiedExamples) {
  test(`desktop OCR automatically copies the shared worker's verified answer for ${example.name}`, async (t) => {
    const { formula, answer, kind = "exact", conditions = [], recognitionOptions = {} } = example;
    const { workflow, writes, notices, reviews } = await workerFixture(t, recognition(formula, recognitionOptions));
    await workflow.start();
    const { phase, preview } = workflow.getState();
    assert.equal(phase, "copied");
    assert.deepEqual(writes, [answer], "only the verified answer may be written");
    assert.equal(preview.formula, formula);
    assert.equal(preview.label, recognitionOptions.questionLabel ?? "");
    assert.equal(preview.instruction, recognitionOptions.instructionText ?? "");
    assert.equal(preview.rawFormula, recognitionOptions.rawFormulaText ?? formula);
    assert.equal(preview.model, "pix2text");
    assert.equal(preview.imageUrl, "data:image/png;base64,AQ==");
    assert.ok(preview.submittedText);
    assert.equal(preview.result.answer, answer);
    assert.equal(preview.result.kind, kind);
    assert.deepEqual(preview.result.conditions, conditions);
    for (const stage of ["captureMs", "recognitionMs", "validationMs", "calculationMs", "copyMs", "selectionToCopyMs"]) {
      assert.ok(Number.isFinite(preview.metrics[stage]) && preview.metrics[stage] >= 0, stage);
    }
    assert.ok(preview.metrics.selectionToCopyMs >= preview.metrics.calculationMs);
    assert.ok(notices.length, "the user must be notified");
    assert.deepEqual(reviews, [], "successful tray workflow must not open review");
  });
}

test("desktop OCR validates explicit definite bounds without ignoring ambiguity inside the integrand", async () => {
  const { workflow, writes } = fixture(recognition("∫_(1)^(3) 2*x dx", {
    questionLabel: "(5)",
    warnings: ["元画像との対応を確認できませんでした。"],
  }));
  await workflow.start();
  const { id, text } = workflow.getState().preview;
  await workflow.copy(id, "(5)\n∫_(1)^(3) x2 dx");
  assert.deepEqual(writes, []);
  await workflow.copy(id, text);
  assert.deepEqual(writes, ["(5)\n∫_(1)^(3) 2*x dx"]);
});

test("desktop OCR withholds ambiguous output and validates corrected text before problem copy", async () => {
  for (const [formula, warnings] of [
    ["x2", []],
    ["(1) 2ab(a+b)/(4a)", []],
    ["x+1", ["左端の問題番号が不明です。"]],
    ["x+(", []],
    ["", []],
  ]) {
    const { workflow, writes, calculations } = fixture(recognition(formula, { warnings }));
    await workflow.start();
    assert.deepEqual(writes, []);
    const state = workflow.getState();
    assert.equal(state.phase, formula ? "review" : "error");
    const id = state.preview.id;
    await workflow.copy(id, "x2");
    assert.deepEqual(writes, []);
    await workflow.copy(id, "(1)\nx^2");
    assert.deepEqual(writes, ["(1)\nx^2"]);
    assert.deepEqual(calculations, []);
  }
});

test("desktop OCR withholds structurally valid text when image geometry or instruction intent conflicts", async () => {
  const inconsistentInstruction = recognition("x^2-1", { instructionText: "因数分解せよ" });
  inconsistentInstruction.structuredCandidate.instructionIntent = "expand";
  for (const output of [
    { ...recognition("x+1"), layout: { fractionCount: 1 } },
    inconsistentInstruction,
  ]) {
    const { workflow, calculations, writes, reviews } = fixture(output);
    await workflow.start();
    const { phase, preview } = workflow.getState();
    assert.equal(phase, "review");
    assert.ok(preview.warnings.length > 0);
    assert.deepEqual(reviews, ["review"]);
    assert.deepEqual(calculations, []);
    assert.deepEqual(writes, []);
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
      captureStamp: async () => { throw new Error("clipboard unavailable"); },
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

test("desktop OCR preserves changed clipboard contents even after text returns to its original value", async () => {
  const pending = deferred();
  const entered = deferred();
  const { workflow, clipboard, writes, changeClipboard } = fixture(null, {
    recognize() {
      entered.resolve();
      return pending.promise;
    },
  });
  const started = workflow.start();
  await entered.promise;
  changeClipboard("new user clipboard");
  changeClipboard("previous");
  pending.resolve(recognition("2+3"));
  await started;
  const { phase, preview } = workflow.getState();
  assert.equal(phase, "solved");
  assert.equal(preview.result.answer, "5");
  assert.equal(await clipboard.readText(), "previous");
  assert.deepEqual(writes, []);
  await workflow.copyAnswer(preview.id);
  assert.deepEqual(writes, ["5"]);
});

test("desktop OCR keeps the verified result available when clipboard stamping fails", async () => {
  const writes = [];
  const { workflow, calculations } = fixture(recognition("2+3"), {
    clipboard: {
      captureStamp: async () => { throw new Error("clipboard unavailable"); },
      writeText: async (text) => { writes.push(text); },
    },
  });
  await workflow.start();
  const { phase, preview } = workflow.getState();
  assert.equal(phase, "solved");
  assert.equal(preview.result.answer, "5");
  assert.equal(calculations.length, 1);
  assert.deepEqual(writes, []);
  await workflow.copyAnswer(preview.id);
  assert.deepEqual(writes, ["5"]);
});

test("desktop OCR preserves a recognized but unsupported problem and lets the user recalculate", async (t) => {
  const formula = "2ab(a+b)/(4a)";
  const { workflow, clipboard, writes } = await workerFixture(t, recognition(formula, { questionLabel: "(1)" }));
  await workflow.start();
  const failed = workflow.getState();
  assert.equal(failed.phase, "calculation-error");
  assert.match(failed.message, /簡約|対応/u);
  assert.equal(failed.preview.formula, formula);
  assert.equal(failed.preview.imageUrl, "data:image/png;base64,AQ==");
  assert.equal(await clipboard.readText(), "previous");
  await workflow.copyAnswer(failed.preview.id);
  await workflow.recalculate(failed.preview.id, "x2");
  assert.deepEqual(writes, []);

  await workflow.recalculate(workflow.getState().preview.id, "(1)\nx/x");
  const { phase, preview } = workflow.getState();
  assert.equal(phase, "copied");
  assert.deepEqual(writes, ["1（ただし x≠0）"]);
  assert.equal(preview.result.answer, writes[0]);
  assert.deepEqual(preview.result.conditions, ["x≠0"]);
  assert.equal(preview.imageUrl, failed.preview.imageUrl);
});

test("desktop OCR does not make a previous answer copyable after a failed recalculation", async (t) => {
  const { workflow, writes } = await workerFixture(t, recognition("2+3"));
  await workflow.start();
  const previous = workflow.getState().preview.id;
  await workflow.recalculate(previous, "2ab(a+b)/(4a)");
  const failed = workflow.getState();
  assert.equal(failed.phase, "calculation-error");
  await workflow.copyAnswer(previous);
  await workflow.copyAnswer(failed.preview.id);
  assert.deepEqual(writes, ["5"]);
});

test("desktop OCR revokes an earlier answer when the edited problem is invalid", async () => {
  const { workflow, writes } = fixture(recognition("2+3"));
  await workflow.start();
  const { id } = workflow.getState().preview;
  await workflow.recalculate(id, "x2");
  assert.equal(workflow.getState().phase, "review");
  assert.equal(workflow.getState().preview.result, null);
  assert.equal(workflow.getState().preview.submittedText, "");
  await workflow.copyAnswer(id);
  assert.deepEqual(writes, ["5"]);
});

test("desktop OCR cannot recreate a preview if a cancelled retry is still acquiring the stamp", async () => {
  const { workflow, clipboard, writes } = fixture(recognition("2+3"));
  await workflow.start();
  const { id } = workflow.getState().preview;
  const delayed = deferred();
  clipboard.captureStamp = () => delayed.promise;
  const retry = workflow.retry(id);
  workflow.cancel();
  delayed.resolve(1);
  await retry;
  assert.equal(workflow.getState().phase, "idle");
  assert.equal(workflow.getState().preview, null);
  assert.deepEqual(writes, ["5"]);
});

test("desktop OCR repeats capture and recognition without copying an earlier preview", async () => {
  let count = 0;
  const { workflow, writes, calculations } = fixture(null, {
    recognize: async () => recognition(`${++count}+4`),
  });
  await workflow.start();
  const firstId = workflow.getState().preview.id;
  await workflow.retry(firstId);
  const secondId = workflow.getState().preview.id;
  assert.notEqual(secondId, firstId);
  await workflow.start();
  const thirdId = workflow.getState().preview.id;
  assert.notEqual(thirdId, secondId);
  const completedWrites = writes.length;
  await workflow.copyAnswer(firstId);
  await workflow.copy(secondId, "2+3");
  await workflow.recalculate(firstId, "2+3");
  assert.equal(writes.length, completedWrites);
  assert.equal(workflow.getState().preview.formula, "3+4");
  assert.ok(calculations.length >= 2);
});

test("desktop OCR calculation timeout terminates its worker and cannot write a late answer", async (t) => {
  const workers = [];
  class TimedWorker extends EventEmitter {
    constructor(_url, { workerData }) {
      super();
      workers.push(this);
      if (workerData.mode === "initialize") queueMicrotask(() => this.emit("message", { ok: true }));
    }

    async terminate() {
      this.terminated = true;
      this.emit("exit", 1);
    }
  }

  const engine = createEngine({ timeoutMs: 15, WorkerType: TimedWorker });
  const { workflow, writes } = await workerFixture(t, recognition("2+3"), engine);
  await workflow.start();
  const { phase, message, preview } = workflow.getState();
  assert.equal(phase, "calculation-error");
  assert.match(message, /制限時間/u);
  assert.equal(preview.formula, "2+3");
  assert.equal(workers.length, 2);
  assert.equal(workers[1].terminated, true);
  workers[1].emit("message", { ok: true, answer: "late" });
  assert.deepEqual(writes, []);
});

test("desktop OCR cancels an in-progress calculation before a late answer can be copied", async () => {
  const entered = deferred();
  const pending = deferred();
  const { workflow, writes } = fixture(recognition("2+3"), {
    calculator: {
      async calculateOcr(_input, { signal }) {
        entered.resolve(signal);
        return pending.promise;
      },
    },
  });
  const started = workflow.start();
  const signal = await entered.promise;
  workflow.cancel();
  assert.equal(signal.aborted, true);
  assert.equal(workflow.getState().preview, null);
  pending.resolve({ answer: "5", kind: "exact", conditions: [] });
  await started;
  assert.equal(workflow.getState().phase, "idle");
  assert.deepEqual(writes, []);
});

test("desktop OCR worker permission cannot be granted by a manual input payload", async (t) => {
  const engine = createEngine();
  t.after(() => engine.close());
  const input = { ...parseCombinedProblemText("2+3", { source: "ocr" }), ocrConfirmed: true };
  assert.equal((await engine.run("manual", input)).ok, false);
  assert.deepEqual(await engine.run("ocr", input), {
    ok: true,
    answer: "5",
    kind: "exact",
    conditions: [],
  });
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
