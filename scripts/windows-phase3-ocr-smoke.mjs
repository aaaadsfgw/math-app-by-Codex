// Run on an interactive Windows desktop. Report alternative keys if defaults are occupied.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { app, BrowserWindow, clipboard, desktopCapturer, globalShortcut, ipcMain, Menu, nativeImage,
  protocol, screen, session, Tray } from "electron";
import { createCalculator } from "../desktop/services/calculator.js";
import { createEngine } from "../desktop/services/engine.js";
import { createLocalOcr, registerOcrScheme } from "../desktop/services/local-ocr.js";
import { createOcrWorkflow } from "../desktop/services/ocr-workflow.js";
import { createPix2TextService } from "../desktop/services/pix2text.js";
import { createScreenCapture } from "../desktop/services/screen-capture.js";
import { createShortcutRegistration } from "../desktop/services/shortcuts.js";
import { compareStructure } from "../bench/ocr/structure.mjs";

const [, , output, pythonPath, modelDirectory] = process.argv;
assert.ok(output && Boolean(pythonPath) === Boolean(modelDirectory),
  "Usage: electron scripts/windows-phase3-ocr-smoke.mjs output.json [python.exe model-directory]");
registerOcrScheme(protocol);
app.setPath("userData", await mkdtemp(join(tmpdir(), "math-study-log-phase3-smoke-")));
app.on("window-all-closed", () => {});
const startupAt = performance.now();

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
  const source = `
    Add-Type -TypeDefinition 'using System.Runtime.InteropServices; public static class Keyboard {
      [DllImport("user32.dll")] public static extern void keybd_event(byte key, byte scan, uint flags, System.UIntPtr extra);
    }'
    $keys = @(0x11, 0x10, ${key.charCodeAt(0)})
    foreach ($key in $keys) { [Keyboard]::keybd_event($key, 0, 0, [UIntPtr]::Zero) }
    Start-Sleep -Milliseconds 75
    [array]::Reverse($keys)
    foreach ($key in $keys) { [Keyboard]::keybd_event($key, 0, 2, [UIntPtr]::Zero) }`;
  await promisify(execFile)(join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(source, "utf16le").toString("base64")],
    { windowsHide: true, timeout: 15_000 });
}

async function smoke() {
  assert.equal(process.platform, "win32");
  const pix2text = createPix2TextService(pythonPath ? {
    pythonPath: resolve(pythonPath), modelDirectory: resolve(modelDirectory),
  } : {});
  assert.ok(pix2text.isAvailable(), "Pix2Text setup is required.");
  const local = createLocalOcr({ BrowserWindow, ipcMain, session, pix2text });
  const snapshot = await clipboard.read();
  const useSystemClipboard = snapshot.every((item) => item.types.every((format) => format === "text/plain"));
  let text = "OCR smoke sentinel";
  let lastWritten;
  const clip = {
    readText: () => useSystemClipboard ? clipboard.readText() : text,
    async writeText(value) {
      if (useSystemClipboard) await clipboard.writeText(value);
      else text = value;
      lastWritten = value;
    },
  };
  const calculator = createCalculator({ engine: createEngine(), clipboard: clip, onChange() {} });
  const workflow = createOcrWorkflow({
    capture: createScreenCapture({ BrowserWindow, desktopCapturer, ipcMain, screen }),
    recognize: (png, options) => local.recognize(png, { ...options, model: "pix2text" }),
    clipboard: clip,
    isCalculationBusy: () => ["starting", "working"].includes(calculator.getState().phase),
    onChange() {},
    notify() {},
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
  tray.setContextMenu(Menu.buildFromTemplate([{ label: "終了", click: () => app.quit() }]));
  const { bounds, scaleFactor } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const fixture = new BrowserWindow({
    title: "Math Study Log OCR Test Fixture",
    x: bounds.x + Math.max(0, bounds.width - 680), y: bounds.y + 70, width: 620, height: 330,
    frame: false, show: false, alwaysOnTop: true,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
  });
  const rows = [];
  try {
    const readyMs = performance.now() - startupAt;
    await calculator.initialize();
    assert.equal(calculator.getState().phase, "ready");
    let calculationKey = "Y";
    try {
      shortcuts.bind(calculationKey);
    } catch {
      calculationKey = "Q";
      shortcuts.bind(calculationKey);
    }
    shortcuts.bindCapture();
    const startupMs = performance.now() - startupAt;
    const data = new URL("../bench/ocr/data/", import.meta.url);
    const { cases } = JSON.parse(await readFile(new URL("manifest.json", data)));
    for (const id of ["04-arithmetic", "01-labelled-fraction", "28-japanese-expand"]) {
      const item = cases.find((entry) => entry.id === id);
      const png = await readFile(new URL(item.image, data));
      const imageWidth = Math.ceil(item.width / scaleFactor);
      const imageHeight = Math.ceil(item.height / scaleFactor);
      const width = imageWidth + 24;
      const height = imageHeight + 24;
      const document = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src 'unsafe-inline'; img-src data:"><title>Math Study Log OCR Test Fixture</title>
        <body style="margin:0;background:#f0f">
        <div style="position:absolute;top:48px;left:48px;padding:14px;background:white">
        <img src="data:image/png;base64,${png.toString("base64")}" style="display:block;width:${imageWidth}px;height:${imageHeight}px">
        </div></body>`;
      await fixture.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
      fixture.show();
      fixture.setAlwaysOnTop(true, "screen-saver");
      await fixture.webContents.executeJavaScript(`(async () => {
        await document.images[0].decode();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      })()`);
      await delay(150);
      const before = await clip.readText();
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
        return ["review", "error"].includes(state.phase) && !workflow.busy && state;
      }, "OCR did not return a review candidate.", 95_000);
      assert.equal(await clip.readText(), before, "Clipboard changed before review.");
      assert.ok(overlay.isDestroyed());
      assert.ok(preview?.imageUrl, `${id}: ${message}`);
      const shot = nativeImage.createFromDataURL(preview.imageUrl);
      const size = shot.getSize();
      assert.ok(Math.abs(size.width - width * scaleFactor) <= 2);
      assert.ok(Math.abs(size.height - height * scaleFactor) <= 2);
      const comparison = compareStructure(item.canonical, preview.formula ?? "");
      const complete = comparison.structural_match && preview.label === item.label
        && preview.instruction?.replace(/。$/u, "") === item.instruction;
      if (id === "04-arithmetic") assert.ok(complete, message);
      if (complete) {
        await workflow.copy(preview.id, preview.text);
        assert.equal(await clip.readText(), preview.text);
        assert.equal(workflow.getState().phase, "copied");
      }
      if (id === "04-arithmetic") {
        await press(calculationKey);
        await waitFor(async () => await clip.readText() === "5" && calculator.getState().phase === "success",
          `Ctrl+Shift+${calculationKey} did not copy the verified result.`);
        assert.equal(calculator.getState().result.answer, "5");
      }
      rows.push({ id, phase, complete, size, text: preview.text, latex: preview.rawFormula, warnings: preview.warnings,
        copied: complete, verifiedShortcutResult: id === "04-arithmetic" ? "5" : null,
        metrics: workflow.getState().preview.metrics });
      workflow.cancel();
    }
    await writeFile(resolve(output), JSON.stringify({ platform: process.platform, scaleFactor,
      readyMs, startupMs, clipboard: useSystemClipboard ? "windows" : "isolated",
      tray: true, captureKey, calculationKey, rows,
    }, null, 2) + "\n");
  } finally {
    workflow.cancel();
    local.close();
    pix2text.close();
    calculator.close();
    shortcuts.close();
    tray.destroy();
    fixture.destroy();
    if (useSystemClipboard && lastWritten !== undefined && await clipboard.readText() === lastWritten) {
      if (snapshot.length) await clipboard.write(snapshot);
      else clipboard.clear();
    }
  }
}

void app.whenReady().then(smoke).then(() => app.quit(), (error) => {
  console.error(error);
  app.exit(1);
});
