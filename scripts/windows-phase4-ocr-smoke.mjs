// Run on an interactive Windows desktop with Pix2Text set up:
// electron scripts/windows-phase4-ocr-smoke.mjs output.json
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, nativeImage,
  protocol, screen, session, Tray } from "electron";
import { createCalculator } from "../desktop/services/calculator.js";
import { createEngine } from "../desktop/services/engine.js";
import { createLocalOcr, registerOcrScheme } from "../desktop/services/local-ocr.js";
import { createOcrClipboard } from "../desktop/services/ocr-clipboard.js";
import { createOcrWorkflow } from "../desktop/services/ocr-workflow.js";
import { createPix2TextService } from "../desktop/services/pix2text.js";
import { createScreenCapture } from "../desktop/services/screen-capture.js";
import { createShortcutRegistration } from "../desktop/services/shortcuts.js";
import { compareStructure } from "../bench/ocr/structure.mjs";

const [, , output] = process.argv;
assert.ok(output, "Usage: electron scripts/windows-phase4-ocr-smoke.mjs output.json");
registerOcrScheme(protocol);
app.setPath("userData", await mkdtemp(join(tmpdir(), "math-study-log-phase4-smoke-")));
app.on("window-all-closed", () => {});

const powershell = join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const args = (source) => ["-NoProfile", "-NonInteractive", "-STA",
  "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")];

async function waitFor(get, message, timeout = 30_000) {
  const until = performance.now() + timeout;
  while (performance.now() < until) {
    const value = await get();
    if (value) return value;
    await delay(20);
  }
  throw new Error(message);
}

async function press(key) {
  assert.match(key, /^[A-Z]$/u);
  await promisify(execFile)(powershell, args(
    `(New-Object -ComObject WScript.Shell).SendKeys('^+${key.toLowerCase()}')`,
  ), { windowsHide: true, timeout: 15_000 });
}

async function preserveClipboard() {
  const source = await readFile(new URL("./windows-smoke-clipboard.ps1", import.meta.url), "utf8");
  const process = spawn(powershell, args(source), { windowsHide: true });
  const exit = once(process, "exit");
  const lines = createInterface({ input: process.stdout })[Symbol.asyncIterator]();
  // Do not print any clipboard data. The snapshot is held by the native helper.
  process.stderr.resume();
  const { value: status } = await lines.next();
  if (!/^ready [0-9]+$/u.test(status ?? "")) {
    process.stdin.end();
    await exit;
    throw new Error("The current Windows clipboard could not be preserved. The test has made no changes.");
  }
  async function ask(command) {
    process.stdin.write(command + "\n");
    const { value } = await lines.next();
    if (value === undefined || value === "unavailable") throw new Error("The clipboard helper failed.");
    return value;
  }
  let lastSequence = status.slice(6);
  let lastWritten;
  const writes = [];
  return {
    writes,
    async assertUnchanged() {
      assert.equal(await ask("sequence"), "sequence " + lastSequence, "Windows clipboard changed outside this test.");
    },
    async noteWrite(text) {
      // We can restore only while the test still owns the last value.
      lastSequence = (await ask("sequence")).slice(9);
      lastWritten = text;
      writes.push(text);
    },
    async verifyPaste(answer) {
      await this.assertUnchanged();
      const reply = await ask("paste");
      const text = Buffer.from(reply.slice(7), "base64").toString("utf8");
      assert.ok(reply.startsWith("pasted ") && text === answer, "WinForms paste did not receive the verified answer.");
    },
    async restore() {
      try {
        if (lastWritten === undefined) return "untouched";
        if (await clipboard.readText() !== lastWritten) return "changed-externally";
        const result = await ask("restore " + lastSequence);
        return result === "restored" ? "restored" : "changed-externally";
      } finally {
        process.stdin.end();
        await exit;
      }
    },
  };
}

const expectedAnswers = [
  ["04-arithmetic", "5"],
  ["07-quadratic-equation", "x=1/2,3"],
  ["28-japanese-expand", "x^2-x-6"],
  ["01-labelled-fraction", "x-3（ただし x≠2）"],
  ["16-integral", "sin(x^2)+C"],
  ["19-limit-removable", "2"],
  ["04-arithmetic", "5"],
];

async function smoke() {
  assert.equal(process.platform, "win32");
  const pix2text = createPix2TextService();
  assert.ok(pix2text.isAvailable(), "Pix2Text setup is required.");
  const local = createLocalOcr({ BrowserWindow, ipcMain, session, pix2text });
  const guard = await preserveClipboard();
  const safe = createOcrClipboard(clipboard);
  const trackedClipboard = {
    readText: () => clipboard.readText(),
    async writeText(text) {
      await guard.assertUnchanged();
      await clipboard.writeText(text);
      await guard.noteWrite(text);
    },
  };
  const calculator = createCalculator({ engine: createEngine(), clipboard: trackedClipboard, onChange() {} });
  const workflow = createOcrWorkflow({
    capture: createScreenCapture({ BrowserWindow, desktopCapturer, ipcMain, screen }),
    recognize: (png, options) => {
      const image = nativeImage.createFromBuffer(png);
      const pixels = image.toBitmap();
      // The tinted white padding identifies the harness fixture even if an
      // unrelated window appears over it while the overlay is being dismissed.
      assert.ok(pixels[0] === 253 && pixels[1] === 251 && pixels[2] === 243,
        "The captured region did not originate from the test fixture.");
      return local.recognize(png, { ...options, model: "pix2text" });
    },
    calculator,
    clipboard: {
      ...trackedClipboard,
      captureStamp: (options) => safe.captureStamp(options),
      async writeIfUnchanged(stamp, text) {
        await guard.assertUnchanged();
        const copied = await safe.writeIfUnchanged(stamp, text);
        if (copied) await guard.noteWrite(text);
        return copied;
      },
    },
    isCalculationBusy: () => ["starting", "working"].includes(calculator.getState().phase),
    onChange() {}, notify() {}, onReview() {},
  });

  let captureKey = "X";
  const shortcuts = createShortcutRegistration({
    globalShortcut: {
      register(accelerator, callback) {
        if (globalShortcut.register(accelerator, callback)) return true;
        if (accelerator !== "Control+Shift+X") return false;
        captureKey = "W";
        return globalShortcut.register(`Control+Shift+${captureKey}`, callback);
      },
      unregister: (accelerator) => globalShortcut.unregister(accelerator),
      unregisterAll: () => globalShortcut.unregisterAll(),
    },
    onCalculate: () => calculator.solveClipboard(),
    onCapture: () => workflow.start(),
  });
  const tray = new Tray(nativeImage.createFromPath(join(import.meta.dirname, "../desktop/icon.png")));
  const { bounds, scaleFactor } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const fixture = new BrowserWindow({
    title: "Math Study Log OCR Test Fixture",
    x: bounds.x + Math.max(0, bounds.width - 720), y: bounds.y + 70, width: 650, height: 330,
    frame: false, show: false,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
  });
  const rows = [];
  let calculationKey = "Y";
  let restoration;
  let shortcutVerified = false;
  try {
    await calculator.initialize();
    assert.equal(calculator.getState().phase, "ready");
    try {
      shortcuts.bind(calculationKey);
    } catch {
      calculationKey = "Q";
      shortcuts.bind(calculationKey);
    }
    shortcuts.bindCapture();
    const data = new URL("../bench/ocr/data/", import.meta.url);
    const { cases } = JSON.parse(await readFile(new URL("manifest.json", data)));
    for (const [id, answer] of expectedAnswers) {
      const item = cases.find((entry) => entry.id === id);
      const png = await readFile(new URL(item.image, data));
      const imageWidth = Math.ceil(item.width / scaleFactor);
      const imageHeight = Math.ceil(item.height / scaleFactor);
      const width = imageWidth + 24;
      const height = imageHeight + 24;
      const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>Math Study Log OCR Test Fixture</title>
        <body style="margin:0;background:#f0f">
        <div style="position:absolute;top:48px;left:48px;padding:14px;background:#f3fbfd">
        <img src="data:image/png;base64,${png.toString("base64")}" style="display:block;width:${imageWidth}px;height:${imageHeight}px">
        </div></body>`;
      await fixture.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
      fixture.setAlwaysOnTop(true, "screen-saver");
      fixture.show();
      fixture.focus();
      await fixture.webContents.executeJavaScript(`(async () => {
        await document.images[0].decode();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      await waitFor(() => fixture.isFocused(), "The test fixture did not receive foreground focus.");
      await guard.assertUnchanged();
      const before = await clipboard.readText();
      const writeCount = guard.writes.length;
      const trigger = press(captureKey);
      const overlay = await waitFor(() => {
        const focused = BrowserWindow.getFocusedWindow();
        return focused?.getTitle() === "Math Study Log 画面範囲選択" && focused.isVisible() && focused;
      }, `The registered Ctrl+Shift+${captureKey} did not show the selection overlay.`);
      await trigger;
      const content = fixture.getContentBounds();
      const x = content.x - bounds.x + 50;
      const y = content.y - bounds.y + 50;
      overlay.webContents.sendInputEvent({ type: "mouseDown", x, y, button: "left", clickCount: 1 });
      overlay.webContents.sendInputEvent({ type: "mouseMove", x: x + width, y: y + height, modifiers: ["leftButtonDown"] });
      overlay.webContents.sendInputEvent({ type: "mouseUp", x: x + width, y: y + height, button: "left", clickCount: 1 });
      const { phase, message, preview } = await waitFor(() => {
        const state = workflow.getState();
        return !workflow.busy && state.preview && state;
      }, "OCR did not complete.", 95_000);
      assert.ok(overlay.isDestroyed());
      assert.ok(preview.imageUrl, `${id}: no capture preview`);
      const shot = nativeImage.createFromDataURL(preview.imageUrl);
      const size = shot.getSize();
      assert.ok(Math.abs(size.width - width * scaleFactor) <= 2);
      assert.ok(Math.abs(size.height - height * scaleFactor) <= 2);
      const pixels = shot.toBitmap();
      for (let index = 0; index + 3 < pixels.length; index += 4) {
        assert.ok(!(pixels[index] > 170 && pixels[index + 1] < 70 && pixels[index + 2] > 170),
          "The capture included the fixture border.");
      }
      const comparison = compareStructure(item.canonical, preview.formula ?? "");
      const complete = comparison.structural_match && preview.label === item.label
        && preview.instruction?.replace(/。$/u, "") === item.instruction;
      if (phase === "copied") {
        assert.ok(complete, `${id}: automatic copying requires an exact fixture interpretation.`);
        assert.deepEqual(guard.writes.slice(writeCount), [answer], `${id}: only the verified answer can be written.`);
        assert.equal(preview.result.answer, answer);
        assert.ok(preview.submittedText);
        await guard.verifyPaste(answer);
      } else {
        assert.equal(guard.writes.length, writeCount, `${id}: an unsuccessful case wrote to the clipboard.`);
        assert.ok(await clipboard.readText() === before, `${id}: the prior clipboard value changed.`);
      }
      rows.push({ id, phase, complete, size, message, copied: phase === "copied",
        answer: preview.result?.answer ?? null, formula: preview.formula, warnings: preview.warnings,
        metrics: preview.metrics });
      // Report only fixture identifiers and metrics. A stolen foreground
      // window must never cause its recognized content to be printed.
      console.log(JSON.stringify({ id, phase, complete, metrics: preview.metrics }));
      workflow.cancel();
    }
    assert.ok(rows.filter((row) => row.id === "04-arithmetic").every((row) => row.copied && row.complete),
      "Cold and warm arithmetic must automatically copy the expected answer.");

    await trackedClipboard.writeText("2+3");
    fixture.focus();
    await press(calculationKey);
    await waitFor(async () => await clipboard.readText() === "5" && calculator.getState().phase === "success",
      `Ctrl+Shift+${calculationKey} did not copy the verified result.`);
    shortcutVerified = true;
  } finally {
    workflow.cancel();
    local.close();
    pix2text.close();
    calculator.close();
    shortcuts.close();
    tray.destroy();
    fixture.destroy();
    restoration = await guard.restore();
    console.log("Windows clipboard", restoration);
    await writeFile(resolve(output), JSON.stringify({ platform: process.platform, scaleFactor,
      clipboard: "windows", restoration, pasteTarget: "WinForms TextBox", tray: true, captureKey, calculationKey,
      shortcutVerified, rows,
    }, null, 2) + "\n");
  }
  assert.equal(restoration, "restored", "The test did not restore the original Windows clipboard.");
}

void app.whenReady().then(smoke).then(() => app.quit(), (error) => {
  console.error(error);
  app.exit(1);
});
