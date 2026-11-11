import { execFile } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { planScreenshotCrop, validateViewportSelection } from "../../js/ocr/capture-geometry.js";
import { OCR_CAPTURE_IMAGE_LIMITS } from "../../js/ocr/capture-image.js";
import { OCR_IMAGE_LIMITS } from "../../js/ocr/ocr-config.js";

const PAGE = new URL("../capture-overlay/index.html", import.meta.url);
const PRELOAD = fileURLToPath(new URL("../capture-overlay/preload.cjs", import.meta.url));
const SELECT = "desktop:capture-select";
const CANCEL = "desktop:capture-cancel";
const DISPLAY_EVENTS = ["display-added", "display-removed", "display-metrics-changed"];
const runFile = promisify(execFile);
const COPY_SCREEN_RECT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -Namespace MathStudyLog -Name Dpi -MemberDefinition @'
[System.Runtime.InteropServices.DllImport("user32.dll")]
public static extern System.IntPtr SetThreadDpiAwarenessContext(System.IntPtr value);
'@
if ([MathStudyLog.Dpi]::SetThreadDpiAwarenessContext([IntPtr](-4)) -eq [IntPtr]::Zero) { exit 1 }
$values = $env:MATH_STUDY_LOG_CAPTURE_RECT.Split(',') | ForEach-Object { [int]$_ }
$size = [Drawing.Size]::new($values[2], $values[3])
$bitmap = [Drawing.Bitmap]::new($size.Width, $size.Height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
$graphics = [Drawing.Graphics]::FromImage($bitmap)
$stream = [IO.MemoryStream]::new()
try {
  $graphics.CopyFromScreen($values[0], $values[1], 0, 0, $size, [Drawing.CopyPixelOperation]::SourceCopy)
  $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
  [Console]::Write([Convert]::ToBase64String($stream.ToArray()))
} finally {
  $stream.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}
`;

async function captureWindowsRect({ x, y, width, height }, signal) {
  const executable = join(process.env.SystemRoot || "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  try {
    const { stdout } = await runFile(executable, [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-Command", COPY_SCREEN_RECT,
    ], {
      windowsHide: true,
      timeout: 5_000,
      maxBuffer: Math.ceil(OCR_IMAGE_LIMITS.maxBytes * 4 / 3) + 16,
      env: { ...process.env, MATH_STUDY_LOG_CAPTURE_RECT: [x, y, width, height].join(",") },
      signal,
    });
    const png = Buffer.from(stdout, "base64");
    if (png.length > OCR_IMAGE_LIMITS.maxBytes) throw new Error("PNG exceeds the capture limit.");
    const { nativeImage } = await import("electron");
    return nativeImage.createFromBuffer(png);
  } catch (cause) {
    throw new Error("選択したモニターの画像を Windows から取得できませんでした。", { cause });
  }
}

function sameBounds(a, b) {
  return ["x", "y", "width", "height"].every((key) => a[key] === b[key]);
}

function overlayWindow(BrowserWindow, bounds) {
  const window = new BrowserWindow({
    ...bounds,
    title: "Math Study Log 画面範囲選択",
    show: false,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      partition: "math-study-log-screen-selection",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      devTools: false,
    },
  });
  window.setAlwaysOnTop(true, "screen-saver");
  window.setContentProtection(true);
  const contents = window.webContents;
  contents.session.setPermissionRequestHandler((_sender, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-frame-navigate", (event) => event.preventDefault());
  return window;
}

async function selectRegion({ BrowserWindow, ipcMain, screen, signal }) {
  let resolve;
  let reject;
  const promise = new Promise((resolveSelection, rejectSelection) => {
    resolve = resolveSelection;
    reject = rejectSelection;
  });
  const overlays = new Map();
  const displays = screen.getAllDisplays();
  const cursorDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  let active = true;
  let ready = false;
  const cancel = () => {
    active = false;
    resolve(null);
  };
  const fail = (error) => {
    active = false;
    reject(error);
  };
  const displayChanged = () => fail(new Error("画面の構成が変わりました。もう一度範囲を選択してください。"));

  function getOverlay(event) {
    const overlay = overlays.get(event.sender);
    if (!active || !ready || !overlay || event.senderFrame !== event.sender.mainFrame
        || event.senderFrame?.url !== PAGE.href) return null;
    return overlay;
  }

  function onSelect(event, selection) {
    const overlay = getOverlay(event);
    if (!overlay) return;
    try {
      const { display, window } = overlay;
      if (!sameBounds(window.getContentBounds(), display.bounds)) {
        displayChanged();
        return;
      }
      const viewport = { width: display.bounds.width, height: display.bounds.height };
      const validated = validateViewportSelection(selection, viewport);
      if (validated.wasClamped) {
        throw new Error("同じモニター内で範囲を選択してください。");
      }
      active = false;
      resolve({ display, viewport, selection: validated.selectionCss });
    } catch (error) {
      fail(error);
    }
  }
  const onCancel = (event) => { if (getOverlay(event)) cancel(); };

  ipcMain.on(SELECT, onSelect);
  ipcMain.on(CANCEL, onCancel);
  for (const event of DISPLAY_EVENTS) screen.on(event, displayChanged);
  signal?.addEventListener("abort", cancel, { once: true });
  const timeout = setTimeout(cancel, 60_000);
  try {
    if (signal?.aborted) return null;
    if (!displays.length) throw new Error("選択できるモニターが見つかりませんでした。");
    const loading = displays.map((display) => {
      const window = overlayWindow(BrowserWindow, display.bounds);
      const contents = window.webContents;
      overlays.set(contents, { window, display });
      window.on("closed", cancel);
      contents.on("render-process-gone", cancel);
      contents.on("before-input-event", (event, input) => {
        if (input.type === "keyDown" && input.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      });
      return window.loadFile(fileURLToPath(PAGE));
    });
    void Promise.all(loading).then(() => {
      if (!active) return;
      for (const { window, display } of overlays.values()) {
        window.setBounds(display.bounds);
        window.showInactive();
      }
      ready = true;
      const focused = [...overlays.values()].find(({ display }) => display.id === cursorDisplay.id);
      (focused ?? overlays.values().next().value).window.focus();
    }).catch(fail);
    return await promise;
  } finally {
    active = false;
    clearTimeout(timeout);
    signal?.removeEventListener("abort", cancel);
    ipcMain.removeListener(SELECT, onSelect);
    ipcMain.removeListener(CANCEL, onCancel);
    for (const event of DISPLAY_EVENTS) screen.removeListener(event, displayChanged);
    await Promise.all([...overlays.values()].map(({ window }) => {
      if (window.isDestroyed()) return;
      return new Promise((closed) => {
        window.once("closed", closed);
        window.destroy();
      });
    }));
  }
}

function verifyDisplay(screen, display) {
  const current = screen.getAllDisplays().find(({ id }) => id === display.id);
  if (!current || !sameBounds(current.bounds, display.bounds)
      || current.scaleFactor !== display.scaleFactor || current.rotation !== display.rotation) {
    throw new Error("画面の構成が変わりました。もう一度範囲を選択してください。");
  }
}

function hasVisibleContrast(image) {
  const bitmap = image.toBitmap();
  // Screen capture returns an opaque BGRA bitmap. Uniform and transparent
  // regions include surfaces that Windows or the displayed app blanks out.
  if (bitmap.length < 8) return false;
  const first = bitmap.readUInt32LE(0);
  for (let i = 4; i + 3 < bitmap.length; i += 4) {
    if (bitmap[i + 3] && bitmap.readUInt32LE(i) !== first) return true;
  }
  return false;
}

function validateCropSize({ width, height }) {
  if (width * height > OCR_IMAGE_LIMITS.maxPixels
      || Math.max(width, height) > OCR_IMAGE_LIMITS.maxDimension) {
    throw new Error("画像認識の範囲が大きすぎます。数式の周囲だけを選択してください。");
  }
}

async function getScreenSources(desktopCapturer, thumbnailSize, signal) {
  let abort;
  let timer;
  const stopped = new Promise((resolve, reject) => {
    abort = () => resolve([]);
    timer = setTimeout(() => reject(new Error("モニターの画像取得がタイムアウトしました。")), 8_000);
    signal?.addEventListener("abort", abort, { once: true });
  });
  try {
    return await Promise.race([desktopCapturer.getSources({ types: ["screen"], thumbnailSize }), stopped]);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}

async function captureRegion({ desktopCapturer, screen, region, captureWindows, signal }) {
  const { display, viewport, selection } = region;
  const thumbnailSize = {
    width: Math.round(display.bounds.width * display.scaleFactor),
    height: Math.round(display.bounds.height * display.scaleFactor),
  };
  if (thumbnailSize.width * thumbnailSize.height > OCR_CAPTURE_IMAGE_LIMITS.maxImagePixels) {
    throw new Error("モニターの解像度が画面キャプチャの上限を超えています。");
  }

  // The overlays were excluded from screen capture before being shown. Wait
  // for all native closed events before creating the desktop capture source.
  verifyDisplay(screen, display);
  const sources = await getScreenSources(desktopCapturer, thumbnailSize, signal);
  if (signal?.aborted) return null;
  verifyDisplay(screen, display);
  const onlyScreen = screen.getAllDisplays().length === 1 && sources.length === 1
    && !sources[0].display_id ? sources[0] : undefined;
  const source = sources.find(({ display_id }) => display_id === String(display.id)) ?? onlyScreen;
  let image;
  if (source && !source.thumbnail.isEmpty()) {
    const screenshot = source.thumbnail.getSize();
    const { cropPixels } = planScreenshotCrop({ selection, viewport, screenshot });
    validateCropSize(cropPixels);
    image = source.thumbnail.crop(cropPixels);
  } else if (!source && sources.some(({ display_id }) => !display_id)) {
    // Some Windows backends omit display_id. Guessing from source order
    // could capture the wrong monitor, especially with mirrored DPI/layout.
    const physicalBounds = screen.dipToScreenRect(null, display.bounds);
    const { cropPixels } = planScreenshotCrop({ selection, viewport, screenshot: physicalBounds });
    validateCropSize(cropPixels);
    image = await captureWindows({
      ...cropPixels,
      x: physicalBounds.x + cropPixels.x,
      y: physicalBounds.y + cropPixels.y,
    }, signal);
    if (signal?.aborted) return null;
    verifyDisplay(screen, display);
  } else {
    throw new Error("選択したモニターの画像を取得できませんでした。");
  }

  if (image.isEmpty() || !hasVisibleContrast(image)) {
    throw new Error("選択範囲の画面を取得できないか、数式のない単色の領域です。");
  }
  const png = image.toPNG();
  if (!png.byteLength || png.byteLength > OCR_IMAGE_LIMITS.maxBytes) {
    throw new Error("選択範囲の画像が大きすぎます。数式の周囲だけを選択してください。");
  }
  return png;
}

export function createScreenCapture({
  BrowserWindow, desktopCapturer, ipcMain, screen, captureWindows = captureWindowsRect,
}) {
  let active = false;
  return Object.freeze({
    async select({ signal } = {}) {
      if (active || signal?.aborted) return null;
      active = true;
      try {
        const region = await selectRegion({ BrowserWindow, ipcMain, screen, signal });
        if (!region || signal?.aborted) return null;
        return await captureRegion({ desktopCapturer, screen, region, captureWindows, signal });
      } catch (error) {
        if (signal?.aborted) return null;
        throw error;
      } finally {
        active = false;
      }
    },
  });
}
