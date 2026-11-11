// Run on an interactive Windows desktop: npm exec -- electron scripts/windows-screen-capture-smoke.mjs
import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import { app, BrowserWindow, desktopCapturer, ipcMain, nativeImage, screen } from "electron";
import { createScreenCapture } from "../desktop/services/screen-capture.js";

async function getOverlay() {
  for (let count = 0; count < 150; count++) {
    const window = BrowserWindow.getFocusedWindow();
    if (window?.getTitle() === "Math Study Log 画面範囲選択" && window.isVisible()) return window;
    await delay(20);
  }
  throw new Error("The selection overlay did not receive focus.");
}

async function smoke() {
  assert.equal(process.platform, "win32");
  const forcePhysicalCapture = process.argv.includes("--physical-capture");
  const { bounds, scaleFactor } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const fixture = new BrowserWindow({
    x: bounds.x + Math.round((bounds.width - 440) / 2),
    y: bounds.y + Math.round((bounds.height - 250) / 2),
    width: 440, height: 250,
    frame: false, show: false, alwaysOnTop: true,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true },
  });
  try {
    const document = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#f0f">
      <div style="margin:40px;width:360px;height:170px;background:white;display:grid;place-items:center;color:black;font:bold 44px Cambria">X / 2 = 3</div>`;
    const painted = new Promise((resolve) => fixture.once("ready-to-show", resolve));
    await fixture.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
    await painted;
    fixture.setAlwaysOnTop(true, "screen-saver");
    fixture.show();
    const fixtureBounds = fixture.getContentBounds();
    const capture = createScreenCapture({
      BrowserWindow, ipcMain, screen,
      desktopCapturer: {
        async getSources(options) {
          const sources = await desktopCapturer.getSources(options);
          if (forcePhysicalCapture) {
            // Exercise the native rectangle fallback even on a single display.
            return [{ display_id: "" }, { display_id: "" }];
          }
          return sources;
        },
      },
    });
    const pending = capture.select({ signal: AbortSignal.timeout(15_000) });
    const overlay = await getOverlay();
    const left = fixtureBounds.x - bounds.x + 65;
    const top = fixtureBounds.y - bounds.y + 63;
    const width = 310;
    const height = 124;
    // Electron's input events enter Chromium as trusted pointer events.
    overlay.webContents.sendInputEvent({
      type: "mouseDown", x: left + width, y: top + height, button: "left", clickCount: 1,
    });
    overlay.webContents.sendInputEvent({
      type: "mouseMove", x: left, y: top, modifiers: ["leftButtonDown"],
    });
    overlay.webContents.sendInputEvent({
      type: "mouseUp", x: left, y: top, button: "left", clickCount: 1,
    });
    const png = await pending;
    assert.ok(png, "Trusted reverse drag must return a crop.");
    const image = nativeImage.createFromBuffer(png);
    const size = image.getSize();
    assert.ok(Math.abs(size.width - width * scaleFactor) <= 2);
    assert.ok(Math.abs(size.height - height * scaleFactor) <= 2);

    const pixels = image.toBitmap();
    let white = 0;
    let dark = 0;
    let magenta = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const blue = pixels[index];
      const green = pixels[index + 1];
      const red = pixels[index + 2];
      if (red > 240 && green > 240 && blue > 240) white++;
      if (red < 50 && green < 50 && blue < 50) dark++;
      if (red > 170 && green < 70 && blue > 170) magenta++;
    }
    const count = size.width * size.height;
    assert.ok(white > count * 0.85, `Expected undimmed fixture, got ${white}/${count} white pixels.`);
    assert.ok(dark > 100, "The crop must include the fixture formula.");
    assert.equal(magenta, 0, "The crop must exclude the fixture's colored margins.");
    assert.equal(overlay.isDestroyed(), true);
    const path = forcePhysicalCapture ? "Win32 rectangle" : "Electron desktop";
    console.log(`${path} capture: ${size.width}×${size.height}px, scale ${scaleFactor}, ${white} white, ${dark} dark, ${magenta} magenta pixels.`);

    const cancelled = capture.select({ signal: AbortSignal.timeout(15_000) });
    const secondOverlay = await getOverlay();
    secondOverlay.webContents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
    assert.equal(await cancelled, null);
    assert.equal(secondOverlay.isDestroyed(), true);
    console.log("Windows capture: Escape removed the selection overlay.");
  } finally {
    fixture.destroy();
  }
}

void app.whenReady().then(smoke).then(() => app.quit(), (error) => {
  console.error(error);
  app.exit(1);
});
