import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, Notification, Tray,
} from "electron";
import { createCalculator } from "./services/calculator.js";
import { createEngine, MAX_INPUT_LENGTH } from "./services/engine.js";
import { loadPreferences, savePreferences, validShortcutKey } from "./services/preferences.js";
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
let preferences;
let preferencesPath;
let settingsError = "";
let quitting = false;

function getState() {
  return {
    calculation: calculator.getState(),
    preferences,
    activeKey: shortcuts.active,
    settingsError,
  };
}

function publishState() {
  if (window && !window.isDestroyed() && !window.webContents.isDestroyed()) {
    window.webContents.send("desktop:state-changed", getState());
  }
}

function openWindow() {
  if (quitting || !tray) return;
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
    if (quitting || !preferences.keepInTray) return;
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
  if (!await calculator.solveClipboard() || quitting) return;
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
    && text.length <= MAX_INPUT_LENGTH, (text) => calculator.solveManual(text));
  handle("copy", ([id, ...rest]) => rest.length === 0 && Number.isSafeInteger(id),
    (id) => calculator.copy(id));
  handle("keep-in-tray", ([enabled, ...rest]) => rest.length === 0 && typeof enabled === "boolean",
    (enabled) => updatePreferences({ ...preferences, keepInTray: enabled }));
  handle("shortcut-key", ([key, ...rest]) => rest.length === 0 && validShortcutKey(key),
    (key) => updatePreferences({ ...preferences, shortcutKey: key }, { rebind: true }));
}

async function start() {
  if (process.platform === "win32") {
    app.setAppUserModelId(app.isPackaged ? "MathStudyLog.Desktop" : process.execPath);
  }
  Menu.setApplicationMenu(null);
  preferencesPath = join(app.getPath("userData"), "desktop-preferences.json");
  preferences = loadPreferences(preferencesPath);
  calculator = createCalculator({ engine: createEngine(), clipboard, onChange: publishState });
  shortcuts = createShortcutRegistration({ globalShortcut, onCalculate: onShortcut });
  registerIpc();

  tray = new Tray(ICON);
  tray.setToolTip(APP_NAME);
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: "Math Study Log を開く", click: openWindow },
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

  openWindow();
  await calculator.initialize();
  const state = calculator.getState();
  if (state.phase === "error") logStartupFailure("Engine initialization failed", state.message);
}

app.setName(APP_NAME);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", openWindow);
  app.on("activate", openWindow);
  app.on("window-all-closed", () => { if (!quitting) app.quit(); });
  app.on("before-quit", () => {
    quitting = true;
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
