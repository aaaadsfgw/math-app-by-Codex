import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { setImmediate } from "node:timers/promises";
import test from "node:test";
import { createScreenCapture } from "../desktop/services/screen-capture.js";

const SELECT = "desktop:capture-select";
const CANCEL = "desktop:capture-cancel";
const page = new URL("../desktop/capture-overlay/index.html", import.meta.url).href;

function fixture({ scale = 1.5, sourceMissing = false, blank = false, unidentifiedSources = false } = {}) {
  const display = { id: -123, bounds: { x: -1600, y: -100, width: 1600, height: 900 }, scaleFactor: scale };
  const displays = [
    { id: 456, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 },
    display,
  ];
  const ipcMain = new EventEmitter();
  const screen = Object.assign(new EventEmitter(), {
    getAllDisplays: () => displays,
    getCursorScreenPoint: () => ({ x: -5, y: 10 }),
    getDisplayNearestPoint: () => display,
    dipToScreenRect: (_window, bounds) => {
      assert.deepEqual(bounds, display.bounds);
      return { x: -2400, y: -150, width: 1600 * scale, height: 900 * scale };
    },
  });
  const windows = [];
  const steps = [];
  let crop;
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
  const image = {
    isEmpty: () => false,
    toBitmap: () => Buffer.from([0, 0, 0, 255, blank ? 0 : 255, 0, 0, 255]),
    toPNG: () => png,
  };
  class Window extends EventEmitter {
    constructor(options) {
      super();
      assert.equal(options.webPreferences.sandbox, true);
      assert.equal(options.webPreferences.nodeIntegration, false);
      this.webContents = Object.assign(new EventEmitter(), {
        mainFrame: { url: page },
        session: { setPermissionCheckHandler() {}, setPermissionRequestHandler() {} },
        setWindowOpenHandler() {},
      });
      windows.push(this);
    }
    setAlwaysOnTop(value, level) {
      assert.equal(value, true);
      assert.equal(level, "screen-saver");
    }
    setContentProtection(value) { assert.equal(value, true); }
    setBounds(bounds) { this.bounds = bounds; }
    getContentBounds() { return this.bounds; }
    showInactive() { this.visible = true; }
    focus() { this.focused = true; }
    loadFile() { return Promise.resolve(); }
    isDestroyed() { return !!this.destroyed; }
    destroy() {
      this.destroyed = true;
      this.emit("closed");
    }
  }
  const capture = createScreenCapture({
    BrowserWindow: Window,
    ipcMain,
    screen,
    captureWindows: (rect) => {
      steps.push("physical capture");
      crop = rect;
      return image;
    },
    desktopCapturer: {
      async getSources(options) {
        steps.push("capture");
        assert.ok(windows.every((window) => window.destroyed));
        assert.deepEqual(options, {
          types: ["screen"],
          thumbnailSize: { width: 1600 * scale, height: 900 * scale },
        });
        return sourceMissing ? [] : [{
          display_id: unidentifiedSources ? "" : String(display.id),
          thumbnail: {
            isEmpty: () => false,
            getSize: () => ({ width: 1600 * scale, height: 900 * scale }),
            crop: (rect) => {
              crop = rect;
              return image;
            },
          },
        }];
      },
    },
  });
  const event = (index = 1) => {
    const sender = windows[index].webContents;
    return { sender, senderFrame: sender.mainFrame };
  };
  return { capture, ipcMain, screen, windows, event, png, steps, crop: () => crop };
}

for (const scale of [1, 1.25, 1.5]) {
  test(`desktop selects a reverse drag on a negative-origin display at ${scale * 100}%`, async () => {
    const { capture, ipcMain, windows, event, png, steps, crop } = fixture({ scale });
    const selection = capture.select();
    assert.equal(await capture.select(), null);
    await setImmediate();
    assert.equal(windows.length, 2);
    assert.ok(windows.every((window) => window.visible));
    assert.equal(windows[1].focused, true);
    const rect = { x: 143, y: 99, width: -88, height: -56 };
    ipcMain.emit(SELECT, { ...event(), senderFrame: { url: page } }, rect);
    assert.deepEqual(steps, []);
    ipcMain.emit(SELECT, event(), rect);
    assert.equal(await selection, png);
    const x = Math.floor(55 * scale);
    const y = Math.floor(43 * scale);
    assert.deepEqual(crop(), {
      x, y, width: Math.ceil(143 * scale) - x, height: Math.ceil(99 * scale) - y,
    });
    assert.deepEqual(steps, ["capture"]);
    assert.equal(ipcMain.listenerCount(SELECT), 0);
    assert.equal(ipcMain.listenerCount(CANCEL), 0);
  });
}

test("desktop falls back to the physical rectangle when multi-display source IDs are missing", async () => {
  const { capture, ipcMain, event, png, steps, crop } = fixture({ unidentifiedSources: true });
  const selection = capture.select();
  await setImmediate();
  ipcMain.emit(SELECT, event(), { x: 40, y: 30, width: 80, height: 60 });
  assert.equal(await selection, png);
  assert.deepEqual(steps, ["capture", "physical capture"]);
  assert.deepEqual(crop(), { x: -2340, y: -105, width: 120, height: 90 });
});

test("desktop Escape and external cancellation remove the overlays without requesting a screenshot", async () => {
  const { capture, windows, steps } = fixture();
  const selection = capture.select();
  await setImmediate();
  let prevented = false;
  windows[1].webContents.emit("before-input-event", { preventDefault() { prevented = true; } }, {
    type: "keyDown", key: "Escape",
  });
  assert.equal(prevented, true);
  assert.equal(await selection, null);
  const controller = new AbortController();
  const second = capture.select({ signal: controller.signal });
  controller.abort();
  assert.equal(await second, null);
  assert.ok(windows.every((window) => window.destroyed));
  assert.deepEqual(steps, []);
});

test("desktop rejects tiny or cross-display selections before requesting a screenshot", async () => {
  for (const [rect, message] of [
    [{ x: 100, y: 30, width: 2, height: 50 }, /24 CSS px/u],
    [{ x: 1500, y: 30, width: 200, height: 50 }, /同じモニター/u],
  ]) {
    const { capture, ipcMain, event, windows, steps } = fixture();
    const selection = capture.select();
    await setImmediate();
    ipcMain.emit(SELECT, event(), rect);
    await assert.rejects(selection, message);
    assert.ok(windows.every((window) => window.destroyed));
    assert.deepEqual(steps, []);
  }
});

test("desktop rejects a changed display, missing source, or blank capture", async () => {
  const changed = fixture();
  const pending = changed.capture.select();
  await setImmediate();
  changed.screen.emit("display-metrics-changed");
  await assert.rejects(pending, /画面の構成/u);
  assert.deepEqual(changed.steps, []);
  for (const [options, message] of [
    [{ sourceMissing: true }, /モニターの画像を取得できません/u],
    [{ blank: true }, /単色/u],
  ]) {
    const { capture, ipcMain, event } = fixture(options);
    const selection = capture.select();
    await setImmediate();
    ipcMain.emit(SELECT, event(), { x: 10, y: 10, width: 60, height: 50 });
    await assert.rejects(selection, message);
  }
});
