import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createCalculator } from "../desktop/services/calculator.js";
import { createEngine, MAX_INPUT_LENGTH } from "../desktop/services/engine.js";
import { loadPreferences, savePreferences, validShortcutKey } from "../desktop/services/preferences.js";
import { createShortcutRegistration } from "../desktop/services/shortcuts.js";

const examples = [
  ["(+19)+(-14)", "5"],
  ["2x^2-7x+3=0", "x=1/2,3"],
  ["f(x)=sin(3x^2) を微分せよ", "6*x*cos(3*x^2)"],
  ["∫ 2*x*cos(x^2) dx", "sin(x^2)+C"],
  ["lim_(x->1+) 1/(x-1)", "+∞"],
];

function deferred() {
  let resolve;
  const promise = new Promise((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function fixture({ text = "", engine = createEngine() } = {}) {
  const writes = [];
  let now = 0;
  const clipboard = {
    text,
    async readText() { return this.text; },
    async writeText(value) {
      this.text = value;
      writes.push(value);
    },
  };
  const calculator = createCalculator({ engine, clipboard, onChange() {}, now: () => now });
  await calculator.initialize();
  assert.equal(calculator.getState().phase, "ready");
  return { calculator, clipboard, writes, advance: () => { now += 1_000; } };
}

test("desktop manual and shortcut paths use the same verified worker results", async (t) => {
  const { calculator, clipboard, writes, advance } = await fixture();
  t.after(() => calculator.close());
  for (const [problem, answer] of examples) {
    clipboard.text = problem;
    const count = writes.length;
    await calculator.solveManual(problem);
    assert.equal(calculator.getState().result?.answer, answer, problem);
    assert.equal(writes.length, count, "manual calculation must not write to the clipboard");
    await calculator.solveClipboard();
    assert.equal(clipboard.text, answer, problem);
    assert.equal(writes.length, count + 1);
    advance();
  }
});

test("desktop preserves empty, ambiguous, unsupported, and oversized clipboard input", async (t) => {
  const { calculator, clipboard, writes, advance } = await fixture();
  t.after(() => calculator.close());
  for (const text of ["", "   ", "x2", "円の面積を求めよ", "1".repeat(MAX_INPUT_LENGTH + 1)]) {
    clipboard.text = text;
    assert.equal(await calculator.solveClipboard(), true);
    const state = calculator.getState();
    assert.equal(state.phase, "error");
    assert.equal(state.result, null);
    assert.doesNotMatch(state.message, /OCRも利用できます/u);
    assert.equal(clipboard.text, text);
    advance();
  }
  assert.deepEqual(writes, []);
});

test("desktop drops repeat shortcuts and preserves text changed while calculating", async () => {
  const pending = deferred();
  const modes = [];
  const engine = {
    run(mode) {
      modes.push(mode);
      return mode === "initialize" ? { ok: true } : pending.promise;
    },
    close() {},
  };
  const { calculator, clipboard, writes } = await fixture({ text: "1+1", engine });
  const first = calculator.solveClipboard();
  assert.equal(await calculator.solveClipboard(), false);
  assert.equal(await calculator.solveManual("2+2"), false);
  clipboard.text = "new clipboard text";
  pending.resolve({ ok: true, answer: "2" });
  await first;
  assert.equal(await calculator.solveClipboard(), false, "ignore the immediate repeat after completion");
  assert.deepEqual(modes, ["initialize", "shortcut"]);
  assert.equal(calculator.getState().phase, "error");
  assert.equal(clipboard.text, "new clipboard text");
  assert.deepEqual(writes, []);
});

test("desktop manual copy accepts only the ID of the current verified answer", async (t) => {
  const { calculator, clipboard, writes } = await fixture({ text: "original" });
  t.after(() => calculator.close());
  await calculator.solveManual("1+1");
  const old = calculator.getState().result.id;
  await calculator.solveManual("x/x");
  const current = calculator.getState().result;
  assert.equal(current.kind, "conditional");
  assert.deepEqual(current.conditions, ["x≠0"]);
  await calculator.copy(old);
  await calculator.copy("custom text");
  assert.equal(clipboard.text, "original");
  await calculator.copy(current.id);
  assert.deepEqual(writes, ["1（ただし x≠0）"]);
  await calculator.solveManual("x2");
  await calculator.copy(current.id);
  assert.equal(writes.length, 1);
});

test("desktop timeout terminates the worker, skips the write, and permits a retry", async (t) => {
  const instances = [];
  class TestWorker extends EventEmitter {
    constructor(_url, { workerData }) {
      super();
      instances.push(this);
      if (workerData.mode === "initialize" || instances.length === 3) {
        queueMicrotask(() => this.emit("message", { ok: true, answer: "2" }));
      }
    }
    async terminate() {
      this.terminated = true;
      this.emit("exit", 1);
    }
  }
  const engine = createEngine({ WorkerType: TestWorker, timeoutMs: 10 });
  const { calculator, clipboard, writes, advance } = await fixture({ text: "1+1", engine });
  t.after(() => calculator.close());
  await calculator.solveClipboard();
  assert.match(calculator.getState().message, /制限時間/u);
  assert.equal(instances[1].terminated, true);
  instances[1].emit("message", { ok: true, answer: "late" });
  assert.deepEqual(writes, []);
  assert.equal(clipboard.text, "1+1");
  advance();
  await calculator.solveClipboard();
  assert.deepEqual(writes, ["2"]);
});

test("desktop shutdown revokes an in-flight calculation's clipboard write", async () => {
  const pending = deferred();
  let closed = false;
  const engine = {
    run: (mode) => mode === "initialize" ? { ok: true } : pending.promise,
    close: () => { closed = true; },
  };
  const { calculator, writes } = await fixture({ text: "1+1", engine });
  const calculation = calculator.solveClipboard();
  await Promise.resolve();
  calculator.close();
  pending.resolve({ ok: true, answer: "2" });
  await calculation;
  assert.equal(closed, true);
  assert.deepEqual(writes, []);
});

test("desktop shortcut conflict and settings failure preserve the previous registration", () => {
  const registered = new Map();
  let calls = 0;
  const shortcuts = createShortcutRegistration({
    globalShortcut: {
      register(key, callback) {
        if (key === "Control+Shift+Z") return false;
        registered.set(key, callback);
        return true;
      },
      unregister: (key) => registered.delete(key),
      unregisterAll: () => registered.clear(),
    },
    onCalculate: () => { calls += 1; },
  });
  assert.throws(() => shortcuts.bind("Z"), /登録できません/u);
  assert.equal(shortcuts.active, null);
  shortcuts.bind("Y");
  const oldCallback = registered.get("Control+Shift+Y");
  assert.throws(() => shortcuts.bind("Z"), /登録できません/u);
  assert.throws(() => shortcuts.bind("A", () => { throw new Error("disk error"); }), /disk error/u);
  assert.deepEqual([...registered.keys()], ["Control+Shift+Y"]);
  oldCallback();
  assert.equal(calls, 1);
  shortcuts.bind("A");
  assert.equal(shortcuts.active, "A");
  oldCallback();
  assert.equal(calls, 1);
  shortcuts.close();
  assert.equal(registered.size, 0);
  assert.equal(shortcuts.active, null);
});

test("desktop preferences survive restart and validate malformed data and the reserved key", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "math-study-log-desktop-"));
  const path = join(directory, "preferences.json");
  t.after(async () => {
    await unlink(path).catch((error) => { if (error.code !== "ENOENT") throw error; });
    await rmdir(directory);
  });
  assert.deepEqual(loadPreferences(path), { keepInTray: true, shortcutKey: "Y", ocrModel: "auto" });
  assert.equal(validShortcutKey("X"), false);
  assert.equal(validShortcutKey("Ctrl+Y"), false);
  savePreferences(path, { keepInTray: false, shortcutKey: "A" });
  assert.deepEqual(loadPreferences(path), { keepInTray: false, shortcutKey: "A", ocrModel: "auto" });
  savePreferences(path, { keepInTray: true, shortcutKey: "Z", ocrModel: "pix2text" });
  assert.deepEqual(loadPreferences(path), { keepInTray: true, shortcutKey: "Z", ocrModel: "pix2text" });
  await writeFile(path, '{"keepInTray":"true","shortcutKey":"X"}', "utf8");
  assert.deepEqual(loadPreferences(path), { keepInTray: true, shortcutKey: "Y", ocrModel: "auto" });
});
