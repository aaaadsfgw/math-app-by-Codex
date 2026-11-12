import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app, BrowserWindow, clipboard, desktopCapturer, dialog, globalShortcut, ipcMain, Menu,
  Notification, protocol, screen, session, Tray,
} from "electron";
import { createCalculator } from "./services/calculator.js";
import { createEngine, MAX_INPUT_LENGTH } from "./services/engine.js";
import { createLocalOcr, registerOcrScheme } from "./services/local-ocr.js";
import { createOcrWorkflow } from "./services/ocr-workflow.js";
import { loadPreferences, savePreferences, validOcrModel, validShortcutKey } from "./services/preferences.js";
import { createPix2TextService } from "./services/pix2text.js";
import { createScreenCapture } from "./services/screen-capture.js";
import { createShortcutRegistration } from "./services/shortcuts.js";
import { logStartupFailure } from "./startup-log.js";

const APP_NAME = "Math Study Log";
const PAGE = new URL("./renderer/index.html", import.meta.url);
const ICON = fileURLToPath(new URL("./icon.png", import.meta.url));
const PRELOAD = fileURLToPath(new URL("./preload.cjs", import.meta.url));
let window;
let tray;
let calculator;
let shortcuts;
let ocr;
let localOcr;
let pix2text;
let pix2textAvailable = false;
let preferences;
let preferencesPath;
let settingsError = "";
let ocrShortcutError = "";
let quitting = false;

function getState() {
  return {
    calculation: calculator.getState(),
    preferences,
    activeKey: shortcuts.active,
    settingsError,
    ocr: ocr?.getState() ?? { phase: "idle", message: "", preview: null },
    ocrShortcutActive: shortcuts.captureActive,
    ocrShortcutError,
    pix2textAvailable,
    calculationBlocked: ocr?.busy === true,
  };
}

function publishState() {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send("desktop:state-changed", getState());
  }
}

function openWindow() {
  if (quitting || !tray || ocr?.getState().phase === "selecting") return;
  if (window) {
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    return;
  }

  window = new BrowserWindow({
    title: APP_NAME,
    icon: ICON,
    width: 580,
    height: 760,
    minWidth: 370,
    minHeight: 460,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: PRELOAD,
      partition: "math-study-log-desktop",
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const contents = window.webContents;
  contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  contents.session.setPermissionCheckHandler(() => false);
  contents.setWindowOpenHandler(() => ({ action: "deny" }));
  contents.on("will-navigate", (event) => event.preventDefault());
  contents.on("will-frame-navigate", (event) => event.preventDefault());
  window.once("ready-to-show", () => window?.show());
  window.on("close", (event) => {
    if (quitting) return;
    if (ocr?.busy) ocr.cancel();
    if (!preferences.keepInTray) return;
    event.preventDefault();
    window.hide();
  });
  window.on("closed", () => { window = undefined; });
  void window.loadFile(fileURLToPath(PAGE)).catch((error) => {
    if (quitting) return;
    logStartupFailure("Window load failed", error);
    dialog.showErrorBox(APP_NAME, "操作画面を読み込めませんでした。");
    app.quit();
  });
}

function notify(message) {
  if (quitting) return;
  const balloon = () => {
    if (process.platform === "win32" && tray && !tray.isDestroyed()) {
      try {
        tray.displayBalloon({ title: APP_NAME, content: message, icon: ICON });
      } catch {
        // The same status stays available in the application window.
      }
    }
  };
  try {
    if (!Notification.isSupported()) {
      balloon();
      return;
    }
    const notification = new Notification({ title: APP_NAME, body: message, icon: ICON });
    notification.on("click", openWindow);
    notification.on("failed", balloon);
    notification.show();
  } catch {
    balloon();
  }
}

async function onShortcut() {
  if (ocr?.busy || !await calculator.solveClipboard() || quitting) return;
  const { result, message } = calculator.getState();
  notify(result ? `計算完了：${result.answer.slice(0, 140)}\nクリップボードにコピーしました。` : message);
}

function updatePreferences(next, { rebind = false } = {}) {
  try {
    if (rebind && next.shortcutKey !== shortcuts.active) {
      shortcuts.bind(next.shortcutKey, () => savePreferences(preferencesPath, next));
    } else {
      savePreferences(preferencesPath, next);
    }
    preferences = next;
    if (rebind || shortcuts.active) settingsError = "";
  } catch (error) {
    settingsError = error.code ? "設定を保存できませんでした。" : error.message;
    notify(settingsError);
  }
  publishState();
  return getState();
}

function registerIpc() {
  const handle = (channel, validate, action) => {
    ipcMain.handle(`desktop:${channel}`, async (event, ...args) => {
      const contents = window?.webContents;
      if (!contents || event.sender !== contents || event.senderFrame !== contents.mainFrame
          || event.senderFrame?.url !== PAGE.href || !validate(args)) {
        throw new Error("操作の入力が正しくありません。");
      }
      await action(...args);
      return getState();
    });
  };
  handle("state", (args) => args.length === 0, () => {});
  handle("solve", ([text, ...rest]) => rest.length === 0 && typeof text === "string"
    && text.length <= MAX_INPUT_LENGTH, (text) => !ocr?.busy && calculator.solveManual(text));
  handle("copy", ([id, ...rest]) => rest.length === 0 && Number.isSafeInteger(id),
    (id) => !ocr?.busy && calculator.copy(id));
  handle("ocr-copy", ([id, text, ...rest]) => rest.length === 0 && Number.isSafeInteger(id)
    && typeof text === "string" && text.length <= MAX_INPUT_LENGTH, (id, text) => ocr?.copy(id, text));
  handle("ocr-retry", ([id, ...rest]) => rest.length === 0 && Number.isSafeInteger(id), (id) => ocr?.retry(id));
  handle("ocr-cancel", (args) => args.length === 0, () => ocr?.cancel());
  handle("keep-in-tray", ([enabled, ...rest]) => rest.length === 0 && typeof enabled === "boolean",
    (enabled) => updatePreferences({ ...preferences, keepInTray: enabled }));
  handle("shortcut-key", ([key, ...rest]) => rest.length === 0 && validShortcutKey(key),
    (key) => updatePreferences({ ...preferences, shortcutKey: key }, { rebind: true }));
  handle("ocr-model", ([model, ...rest]) => rest.length === 0 && validOcrModel(model),
    (model) => !ocr?.busy && updatePreferences({ ...preferences, ocrModel: model }));
}

async function start() {
  if (process.platform === "win32") {
    app.setAppUserModelId(app.isPackaged ? "MathStudyLog.Desktop" : process.execPath);
  }
  Menu.setApplicationMenu(null);
  preferencesPath = join(app.getPath("userData"), "desktop-preferences.json");
  preferences = loadPreferences(preferencesPath);
  calculator = createCalculator({ engine: createEngine(), clipboard, onChange: publishState });
  shortcuts = createShortcutRegistration({ globalShortcut, onCalculate: onShortcut, onCapture: () => ocr?.start() });
  registerIpc();

  tray = new Tray(ICON);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Math Study Log を開く", click: openWindow },
    { label: "画像認識を中止", click: () => ocr?.cancel() },
    { type: "separator" },
    { label: "完全終了", click: () => app.quit() },
  ]));
  tray.on("click", openWindow);
  tray.on("balloon-click", openWindow);
  try {
    shortcuts.bind(preferences.shortcutKey);
  } catch (error) {
    settingsError = error.message;
    notify(settingsError);
  }
  try {
    pix2text = createPix2TextService();
    pix2textAvailable = pix2text.isAvailable();
    localOcr = createLocalOcr({ BrowserWindow, ipcMain, session, pix2text });
    ocr = createOcrWorkflow({
      capture: createScreenCapture({ BrowserWindow, desktopCapturer, ipcMain, screen }),
      recognize: (png, options) => {
        pix2textAvailable = pix2text.isAvailable();
        const model = preferences.ocrModel === "auto"
          ? (pix2textAvailable ? "pix2text" : "ibem")
          : preferences.ocrModel;
        return localOcr.recognize(png, { ...options, model });
      },
      clipboard,
      isCalculationBusy: () => ["starting", "working"].includes(calculator.getState().phase),
      onChange: publishState,
      notify,
      onReview: openWindow,
    });
  } catch (error) {
    logStartupFailure("OCR service initialization failed", error);
    ocrShortcutError = "画像認識の初期化に失敗しました。";
  }
  if (ocr) {
    try {
      shortcuts.bindCapture();
    } catch (error) {
      ocrShortcutError = error.message;
    }
  }
  if (ocrShortcutError) notify(ocrShortcutError);

  openWindow();
  await calculator.initialize();
  const state = calculator.getState();
  if (state.phase === "error") logStartupFailure("Engine initialization failed", state.message);
}

app.setName(APP_NAME);
registerOcrScheme(protocol);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", openWindow);
  app.on("activate", openWindow);
  app.on("window-all-closed", () => { if (!quitting && !preferences?.keepInTray) app.quit(); });
  app.on("before-quit", () => {
    quitting = true;
    ocr?.cancel();
    localOcr?.close();
    pix2text?.close();
    calculator?.close();
  });
  app.on("will-quit", () => {
    shortcuts?.close();
    tray?.destroy();
  });
  void app.whenReady().then(start).catch((error) => {
    logStartupFailure("Electron startup failed", error);
    dialog.showErrorBox(APP_NAME, "Windows 版を起動できませんでした。");
    app.quit();
  });
}
