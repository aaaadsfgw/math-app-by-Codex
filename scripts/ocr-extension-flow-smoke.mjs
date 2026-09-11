import assert from "node:assert/strict";
import { resolve } from "node:path";

const rawArguments = process.argv.slice(2);
const supportedFlags = new Set(["--allow-storage-reset", "--mixed"]);
const unknownFlags = rawArguments.filter(
  (argument) => argument.startsWith("--") && !supportedFlags.has(argument),
);
if (unknownFlags.length > 0) {
  throw new TypeError(`Unknown option: ${unknownFlags.join(", ")}`);
}
const allowStorageReset = rawArguments.includes("--allow-storage-reset");
const useMixedFixture = rawArguments.includes("--mixed");
if (!allowStorageReset) {
  throw new Error(
    "Refusing to clear extension test storage without --allow-storage-reset. "
    + "Use only a disposable Chrome profile.",
  );
}
const positionalArguments = rawArguments.filter((argument) => !argument.startsWith("--"));
const devtoolsPort = Number(positionalArguments[0] || 9333);
if (!Number.isSafeInteger(devtoolsPort) || devtoolsPort < 1 || devtoolsPort > 65_535) {
  throw new TypeError("DevTools port must be an integer between 1 and 65535.");
}
const extensionPath = resolve(positionalArguments[1] || process.cwd());
const providerExpectation = String(positionalArguments[2] || "either");
if (!new Set(["either", "webgpu", "wasm"]).has(providerExpectation)) {
  throw new TypeError("Provider expectation must be either, webgpu, or wasm.");
}
const loopbackHttpBase = ["http:", "//127.0.0.1"].join("");
const fixtureUrl = String(
  positionalArguments[3]
  || `${loopbackHttpBase}:8765/tests/browser/${
    useMixedFixture ? "mixed-ocr-capture-harness.html" : "ocr-capture-harness.html"
  }`,
);
const parsedFixtureUrl = new URL(fixtureUrl);
if (
  parsedFixtureUrl.protocol !== "http:"
  || !new Set(["127.0.0.1", "localhost"]).has(parsedFixtureUrl.hostname)
) {
  throw new TypeError("The OCR fixture must use a loopback HTTP URL.");
}

const devtoolsBase = `${loopbackHttpBase}:${devtoolsPort}`;
const OCR_SESSION_KEY = "ocrCaptureSessionV1";
const LAUNCHER_PATH = "/panel-launcher.html";
const POPUP_PATH = "/popup.html";
const CONFIRM_PATH = "/ocr-confirm.html";
const TEST_QUESTIONS = Object.freeze({
  study: Object.freeze({ question: "2x+3=11", expectedAnswer: "x=4" }),
  quick: Object.freeze({ question: "3x=15", expectedAnswer: "x=5" }),
});

const delay = (milliseconds) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, milliseconds);
});

async function readJson(path, options) {
  const response = await fetch(`${devtoolsBase}${path}`, options);
  if (!response.ok) throw new Error(`DevTools request failed: ${response.status}`);
  return response.json();
}

async function listTargets() {
  const targets = await readJson("/json/list");
  return Array.isArray(targets) ? targets : [];
}

async function waitFor(operation, {
  timeoutMs = 20_000,
  intervalMs = 100,
  label = "condition",
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = await operation();
      if (result) return result;
    } catch (error) {
      if (error?.fatal === true) throw error;
      lastError = error;
    }
    await delay(intervalMs);
  }
  const suffix = lastError ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for ${label}.${suffix}`);
}

function openProtocol(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;
  let closed = false;
  const ready = new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", rejectPromise, { once: true });
  });

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      clearTimeout(request.timer);
      if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
      else request.resolve(message.result);
      return;
    }
    for (const listener of listeners.get(message.method) ?? []) {
      listener(message.params ?? {});
    }
  });
  socket.addEventListener("close", () => {
    closed = true;
    for (const request of pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error("DevTools target closed."));
    }
    pending.clear();
  });

  return Object.freeze({
    get closed() {
      return closed;
    },
    async send(method, params = {}, timeoutMs = 15_000) {
      await ready;
      if (closed) throw new Error("DevTools target is already closed.");
      const id = nextId;
      nextId += 1;
      const result = new Promise((resolvePromise, rejectPromise) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          rejectPromise(new Error(`DevTools command timed out: ${method}`));
        }, timeoutMs);
        pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer, method });
      });
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    on(method, listener) {
      const registered = listeners.get(method) ?? [];
      registered.push(listener);
      listeners.set(method, registered);
    },
    close() {
      if (!closed) socket.close();
    },
  });
}

async function evaluate(protocol, expression, { userGesture = false } = {}) {
  const outcome = await protocol.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    userGesture,
  });
  if (outcome.exceptionDetails) {
    throw new Error(
      outcome.exceptionDetails.exception?.description
      || outcome.exceptionDetails.text
      || "Browser evaluation failed.",
    );
  }
  return outcome.result?.value;
}

async function connectTarget(target) {
  if (!target?.webSocketDebuggerUrl) throw new Error("Target has no debugger URL.");
  const protocol = openProtocol(target.webSocketDebuggerUrl);
  await protocol.send("Runtime.enable");
  if (target.type === "page") await protocol.send("Page.enable");
  return protocol;
}

async function waitForTarget(predicate, options = {}) {
  return waitFor(
    async () => (await listTargets()).find(predicate) ?? null,
    { ...options, label: options.label || "browser target" },
  );
}

function normalizeFilesystemPath(value) {
  return resolve(String(value || "")).replaceAll("\\", "/").toLowerCase();
}

function extensionPageUrl(extensionId, path) {
  return `chrome-extension://${extensionId}${path}`;
}

async function clickElement(protocol, selector) {
  const center = await evaluate(protocol, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) throw new Error("Element not found: ${selector}");
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (
      element.disabled
      || element.hidden
      || style.display === "none"
      || style.visibility === "hidden"
      || rect.width <= 0
      || rect.height <= 0
    ) throw new Error("Element is not actionable: ${selector}");
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: center.x,
    y: center.y,
    button: "none",
    buttons: 0,
    pointerType: "mouse",
  });
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: center.x,
    y: center.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "mouse",
  });
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: center.x,
    y: center.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
  });
}

async function replaceInput(protocol, selector, text) {
  await protocol.send("Page.bringToFront");
  await clickElement(protocol, selector);
  await waitFor(
    async () => evaluate(
      protocol,
      `document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
    ),
    { label: `focus in ${selector}` },
  );
  await protocol.send("Input.dispatchKeyEvent", {
    type: "rawKeyDown",
    key: "a",
    code: "KeyA",
    modifiers: 2,
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
    commands: ["selectAll"],
  });
  await protocol.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "a",
    code: "KeyA",
    modifiers: 2,
    windowsVirtualKeyCode: 65,
    nativeVirtualKeyCode: 65,
  });
  await protocol.send("Input.insertText", { text });
  await waitFor(
    async () => (await evaluate(
      protocol,
      `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(text)}`,
    )) === true,
    { label: `edited value in ${selector}` },
  );
}

async function dragSelection(protocol, rect) {
  const start = { x: rect.left, y: rect.top };
  const end = { x: rect.right, y: rect.bottom };
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...start,
    button: "none",
    buttons: 0,
    pointerType: "mouse",
  });
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    ...start,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "mouse",
  });
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: start.x + ((end.x - start.x) / 2),
    y: start.y + ((end.y - start.y) / 2),
    button: "left",
    buttons: 1,
    pointerType: "mouse",
  });
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    ...end,
    button: "left",
    buttons: 1,
    pointerType: "mouse",
  });
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    ...end,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
  });
}

async function storageItems(storageProtocol, storageArea, keys) {
  if (!new Set(["local", "session"]).has(storageArea)) {
    throw new TypeError("Unsupported extension storage area.");
  }
  return evaluate(
    storageProtocol,
    `chrome.storage.${storageArea}.get(${JSON.stringify(keys ?? null)})`,
  );
}

async function setStorageItems(storageProtocol, storageArea, values) {
  if (!new Set(["local", "session"]).has(storageArea)) {
    throw new TypeError("Unsupported extension storage area.");
  }
  await evaluate(
    storageProtocol,
    `chrome.storage.${storageArea}.set(${JSON.stringify(values)})`,
  );
}

function settingsFor(learningMode) {
  return {
    defaultMode: "answer",
    learningMode,
    shortcutAction: "answer",
    saveHistory: true,
    maxHistory: 500,
  };
}

function assertMetadataOnlySession(session) {
  const visit = (value, path = "session") => {
    if (!value || typeof value !== "object") return;
    for (const [key, nested] of Object.entries(value)) {
      assert.doesNotMatch(
        key,
        /blob|byte|dataurl|image|pixel|previewurl|screenshot/u,
        `Image-bearing field found at ${path}.${key}`,
      );
      visit(nested, `${path}.${key}`);
    }
  };
  visit(session);
  assert.doesNotMatch(JSON.stringify(session), /data:image|blob:chrome-extension/iu);
}

async function installCaptureTrace(workerProtocol, expectedSourceUrl) {
  const status = await evaluate(workerProtocol, `(() => {
    const traceKey = "__mathStudyLogOcrFlowCaptureTraceV3";
    if (!globalThis[traceKey]) {
      const originalCapture = chrome.tabs.captureVisibleTab.bind(chrome.tabs);
      const originalQuery = chrome.tabs.query.bind(chrome.tabs);
      const originalTabMessage = chrome.tabs.sendMessage.bind(chrome.tabs);
      const originalInjection = chrome.scripting.executeScript.bind(chrome.scripting);
      const trace = { calls: [], tabMessages: [], injections: [], queryFallbacks: [] };
      const wrappedCapture = async (windowId, options) => {
        const call = {
          windowId,
          format: String(options?.format || ""),
          completed: false,
          dataUrlPrefix: "",
          dataUrlLength: 0,
          screenshotWidth: 0,
          screenshotHeight: 0,
        };
        trace.calls.push(call);
        try {
          const dataUrl = await originalCapture(windowId, options);
          call.completed = true;
          call.dataUrlPrefix = typeof dataUrl === "string" ? dataUrl.slice(0, 22) : "";
          call.dataUrlLength = typeof dataUrl === "string" ? dataUrl.length : 0;
          if (typeof dataUrl === "string" && dataUrl.startsWith("data:image/png;base64,")) {
            const binary = atob(dataUrl.slice(22, 54));
            const uint32 = (offset) => (
              (binary.charCodeAt(offset) * 0x1000000)
              + (binary.charCodeAt(offset + 1) << 16)
              + (binary.charCodeAt(offset + 2) << 8)
              + binary.charCodeAt(offset + 3)
            );
            call.screenshotWidth = uint32(16);
            call.screenshotHeight = uint32(20);
          }
          return dataUrl;
        } catch (error) {
          call.error = String(error?.message || error);
          throw error;
        }
      };
      const wrappedTabMessage = async (tabId, message, options) => {
        const call = {
          tabId,
          type: String(message?.type || ""),
          documentId: String(options?.documentId || ""),
        };
        trace.tabMessages.push(call);
        try {
          const response = await originalTabMessage(tabId, message, options);
          call.response = response;
          return response;
        } catch (error) {
          call.error = String(error?.message || error);
          throw error;
        }
      };
      const wrappedQuery = async (queryInfo) => {
        const tabs = await originalQuery(queryInfo);
        if (tabs.length > 0 || queryInfo?.currentWindow !== true || queryInfo?.active !== true) {
          return tabs;
        }
        const activeTabs = await originalQuery({ active: true });
        const candidates = activeTabs.filter((tab) => tab.url === trace.expectedSourceUrl);
        trace.queryFallbacks.push({
          requested: { active: true, currentWindow: true },
          expectedSourceUrl: trace.expectedSourceUrl,
          candidateCount: candidates.length,
        });
        return candidates.length === 1 ? candidates : tabs;
      };
      const wrappedInjection = async (details) => {
        const call = {
          tabId: details?.target?.tabId,
          frameIds: details?.target?.frameIds,
          files: details?.files,
        };
        trace.injections.push(call);
        try {
          const result = await originalInjection(details);
          call.result = Array.isArray(result)
            ? result.map(({ frameId, documentId }) => ({ frameId, documentId }))
            : result;
          return result;
        } catch (error) {
          call.error = String(error?.message || error);
          throw error;
        }
      };
      try {
        chrome.tabs.captureVisibleTab = wrappedCapture;
        chrome.tabs.query = wrappedQuery;
        chrome.tabs.sendMessage = wrappedTabMessage;
        chrome.scripting.executeScript = wrappedInjection;
      } catch (error) {
        return { installed: false, error: String(error?.message || error) };
      }
      if (
        chrome.tabs.captureVisibleTab !== wrappedCapture
        || chrome.tabs.query !== wrappedQuery
        || chrome.tabs.sendMessage !== wrappedTabMessage
        || chrome.scripting.executeScript !== wrappedInjection
      ) {
        return { installed: false, error: "Required Chrome APIs are not replaceable" };
      }
      globalThis[traceKey] = trace;
    }
    globalThis[traceKey].expectedSourceUrl = ${JSON.stringify(expectedSourceUrl)};
    globalThis[traceKey].calls.length = 0;
    globalThis[traceKey].tabMessages.length = 0;
    globalThis[traceKey].injections.length = 0;
    globalThis[traceKey].queryFallbacks.length = 0;
    return { installed: true };
  })()`);
  assert.equal(status?.installed, true, status?.error || "Could not install capture trace.");
}

async function fixtureGeometry(sourceProtocol) {
  return waitFor(
    async () => evaluate(sourceProtocol, `(async () => {
      const target = document.querySelector("#ocrCaptureTarget");
      if (!target) return null;
      const image = target instanceof HTMLImageElement ? target : target.querySelector("img");
      if (!(image instanceof HTMLImageElement)) return null;
      try { await image.decode(); } catch { return null; }
      const rect = target.getBoundingClientRect();
      const expectedNaturalWidth = Number(target.dataset.naturalWidth || 145);
      const expectedNaturalHeight = Number(target.dataset.naturalHeight || 60);
      if (
        !image.complete
        || image.naturalWidth !== expectedNaturalWidth
        || image.naturalHeight !== expectedNaturalHeight
      ) return null;
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        viewportWidth: innerWidth,
        viewportHeight: innerHeight,
        devicePixelRatio,
        expectedWidth: Number(target.dataset.captureWidth || 290),
        expectedHeight: Number(target.dataset.captureHeight || 120),
        expectedKind: String(target.dataset.expectedKind || "formula-only"),
        expectedQuestionLabel: String(target.dataset.expectedQuestionLabel || ""),
        expectedInstruction: String(target.dataset.expectedInstruction || ""),
        expectedFormula: String(target.dataset.expectedFormula || "x+y"),
        expectedIntent: String(target.dataset.expectedIntent || ""),
        expectedAnswer: String(target.dataset.expectedAnswer || ""),
      };
    })()`),
    { timeoutMs: 10_000, label: "fixture image" },
  );
}

async function previewEvidence(confirmProtocol) {
  return evaluate(confirmProtocol, `(async () => {
    const frame = document.querySelector("#previewFrame");
    const image = document.querySelector("#previewImage");
    if (!frame || !image || frame.dataset.state !== "ready" || !image.complete) return null;
    try { await image.decode(); } catch { return null; }
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) return null;
    const response = await fetch(image.src);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let darkPixels = 0;
    let lightPixels = 0;
    let magentaPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index];
      const green = pixels[index + 1];
      const blue = pixels[index + 2];
      const alpha = pixels[index + 3];
      if (alpha > 200 && red < 100 && green < 100 && blue < 100) darkPixels += 1;
      if (alpha > 200 && red > 245 && green > 245 && blue > 245) lightPixels += 1;
      if (alpha > 200 && red > 230 && green < 30 && blue > 230) magentaPixels += 1;
    }
    return {
      frameState: frame.dataset.state,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      previewUrl: image.src,
      blobOk: response.ok,
      blobType: response.headers.get("content-type") || "",
      blobBytes: bytes.byteLength,
      pngSignature: [...bytes.slice(0, 8)].map((value) => value.toString(16).padStart(2, "0")).join(""),
      darkPixels,
      lightPixels,
      magentaPixels,
      recognizeDisabled: document.querySelector("#recognizeButton")?.disabled,
      candidatePanelHidden: document.querySelector("#candidatePanel")?.hidden,
    };
  })()`);
}

async function runFlowUnsafe({
  browser,
  extensionId,
  learningMode,
  sourceTarget,
  chromeVersion,
  storageProtocol,
  openedProtocols,
  flowTargetIds,
}) {
  const beforeLocal = await storageItems(storageProtocol, "local", ["history", "pendingQuestion"]);
  const historySnapshot = Array.isArray(beforeLocal.history)
    ? structuredClone(beforeLocal.history)
    : [];
  const historyBefore = historySnapshot.length;
  assert.equal(beforeLocal.pendingQuestion, undefined);
  await setStorageItems(storageProtocol, "local", { settings: settingsFor(learningMode) });

  const sourceProtocol = await connectTarget(sourceTarget);
  openedProtocols.push(sourceProtocol);
  const sourceExceptions = [];
  const sourceLogEntries = [];
  sourceProtocol.on("Runtime.exceptionThrown", ({ exceptionDetails = {} }) => {
    sourceExceptions.push({
      text: String(exceptionDetails.text || ""),
      description: String(exceptionDetails.exception?.description || ""),
      url: String(exceptionDetails.url || ""),
      lineNumber: exceptionDetails.lineNumber,
      columnNumber: exceptionDetails.columnNumber,
      stack: (exceptionDetails.stackTrace?.callFrames || []).map((frame) => ({
        functionName: frame.functionName,
        url: frame.url,
        lineNumber: frame.lineNumber,
        columnNumber: frame.columnNumber,
      })),
    });
  });
  sourceProtocol.on("Log.entryAdded", ({ entry = {} }) => {
    sourceLogEntries.push({
      level: String(entry.level || ""),
      source: String(entry.source || ""),
      text: String(entry.text || ""),
      url: String(entry.url || ""),
      lineNumber: entry.lineNumber,
    });
  });
  await sourceProtocol.send("Log.enable").catch(() => undefined);
  await sourceProtocol.send("Page.bringToFront");
  const tabTarget = await waitFor(async () => {
    const targetInfos = (await browser.send("Target.getTargets", {
      // The default CDP filter intentionally excludes outer tab targets.
      filter: [{ type: "tab" }, { exclude: true }],
    })).targetInfos ?? [];
    return targetInfos.find(
      (target) => target.type === "tab" && target.url === sourceTarget.url,
    ) ?? null;
  }, { timeoutMs: 10_000, label: "tab target for the OCR fixture" });

  const targetsBeforeAction = new Set((await listTargets()).map(({ id }) => id));
  await browser.send("Extensions.triggerAction", {
    id: extensionId,
    targetId: tabTarget.targetId,
  });
  const launcherTarget = await waitForTarget(
    (target) => !targetsBeforeAction.has(target.id)
      && target.url === extensionPageUrl(extensionId, LAUNCHER_PATH),
    { timeoutMs: 10_000, label: "action launcher popup" },
  );
  flowTargetIds.add(launcherTarget.id);
  const launcherProtocol = await connectTarget(launcherTarget);
  openedProtocols.push(launcherProtocol);
  await waitFor(
    async () => evaluate(launcherProtocol, `(() => {
      const button = document.querySelector("#openPanelButton");
      return document.readyState !== "loading" && Boolean(button) && button.disabled === false;
    })()`),
    { label: "Side Panel launcher button" },
  );
  await clickElement(launcherProtocol, "#openPanelButton");
  const popupTarget = await waitForTarget(
    (target) => target.type === "page"
      && target.url === extensionPageUrl(extensionId, POPUP_PATH),
    { timeoutMs: 10_000, label: "Side Panel workspace" },
  );
  flowTargetIds.add(popupTarget.id);
  const popupProtocol = await connectTarget(popupTarget);
  openedProtocols.push(popupProtocol);
  // Reload a Side Panel target that may have survived a previous disposable
  // profile run so it uses the freshly loaded unpacked extension context.
  await popupProtocol.send("Page.reload", { ignoreCache: true });
  await waitFor(
    async () => evaluate(popupProtocol, `(() => {
      const button = document.querySelector("#ocrButton");
      const state = document.querySelector("#appStateBadge")?.textContent || "";
      return document.readyState !== "loading"
        && Boolean(button)
        && button.disabled === false
        && state === "オフライン数式エンジン";
    })()`),
    { label: "OCR action button" },
  );
  await delay(100);
  // Opening the Side Panel narrows the source page viewport. Measure the
  // fixture after that resize so the synthetic drag stays inside the visible
  // page area in headless Chromium as it does for a real user.
  const geometry = await fixtureGeometry(sourceProtocol);
  assert.equal(geometry.width, geometry.expectedWidth);
  assert.equal(geometry.height, geometry.expectedHeight);
  assert.ok(
    geometry.left >= 0
      && geometry.top >= 0
      && geometry.right <= geometry.viewportWidth
      && geometry.bottom <= geometry.viewportHeight,
    `The OCR fixture must be fully visible after the Side Panel opens: ${JSON.stringify(geometry)}`,
  );

  let workerTarget = await waitForTarget(
    (target) => target.type === "service_worker"
      && target.url === extensionPageUrl(extensionId, "/js/background.js"),
    { timeoutMs: 5_000, label: "extension service worker" },
  ).catch(() => null);
  if (!workerTarget) {
    await evaluate(
      popupProtocol,
      "chrome.runtime.sendMessage({ type: 'OCR_E2E_WAKE' }).catch(() => undefined)",
    );
    workerTarget = await waitForTarget(
      (target) => target.type === "service_worker"
        && target.url === extensionPageUrl(extensionId, "/js/background.js"),
      { timeoutMs: 5_000, label: "woken extension service worker" },
    );
  }
  const workerProtocol = await connectTarget(workerTarget);
  openedProtocols.push(workerProtocol);
  await installCaptureTrace(workerProtocol, sourceTarget.url);
  const routingSnapshot = await evaluate(workerProtocol, `(async () => {
    const summarize = (tabs) => tabs.map(({ id, windowId, active, url }) => ({
      id,
      windowId,
      active,
      url,
    }));
    return {
      current: summarize(await chrome.tabs.query({ active: true, currentWindow: true })),
      lastFocused: summarize(await chrome.tabs.query({ active: true, lastFocusedWindow: true })),
      allActive: summarize(await chrome.tabs.query({ active: true })),
      lastWindow: await chrome.windows.getLastFocused().then(({ id, focused, state }) => ({
        id,
        focused,
        state,
      })),
    };
  })()`);
  await evaluate(popupProtocol, `(() => {
    const original = chrome.runtime.sendMessage.bind(chrome.runtime);
    globalThis.__mathStudyLogOcrFlowPopupMessages = [];
    chrome.runtime.sendMessage = async (...args) => {
      try {
        const response = await original(...args);
        globalThis.__mathStudyLogOcrFlowPopupMessages.push({
          type: String(args[0]?.type || ""),
          response,
        });
        return response;
      } catch (error) {
        globalThis.__mathStudyLogOcrFlowPopupMessages.push({
          type: String(args[0]?.type || ""),
          transportError: String(error?.message || error),
        });
        throw error;
      }
    };
    return true;
  })()`);

  // A real Side Panel does not steal the active page tab. Headless Chromium
  // exposes the panel document as an extension page target, so restore the
  // fixture tab as active before exercising page-scoped OCR routing.
  await browser.send("Target.activateTarget", { targetId: tabTarget.targetId });
  await clickElement(popupProtocol, "#ocrButton");
  const selectingSession = await waitFor(async () => {
    const sessionData = await storageItems(storageProtocol, "session", [OCR_SESSION_KEY]);
    if (sessionData[OCR_SESSION_KEY]?.phase === "selecting") {
      return sessionData[OCR_SESSION_KEY];
    }
    if (!popupProtocol.closed) {
      const popupState = await evaluate(popupProtocol, `(() => ({
        appState: document.querySelector("#appStateBadge")?.textContent || "",
        errorHidden: document.querySelector("#errorMessage")?.hidden,
        error: document.querySelector("#errorMessage")?.textContent || "",
        ocrStatus: document.querySelector("#ocrStatus")?.textContent || "",
      }))()`);
      if (!popupState.errorHidden && popupState.error) {
        const messages = await evaluate(
          popupProtocol,
          "structuredClone(globalThis.__mathStudyLogOcrFlowPopupMessages || [])",
        );
        const workerTrace = await evaluate(
          workerProtocol,
          "structuredClone(globalThis.__mathStudyLogOcrFlowCaptureTraceV3 || {})",
        );
        const failure = new Error(`Popup rejected OCR start: ${JSON.stringify({
          popupState,
          messages,
          routingSnapshot,
          workerTrace,
          sourceExceptions,
          sourceLogEntries,
        })}`);
        failure.fatal = true;
        throw failure;
      }
    }
    return null;
  }, { timeoutMs: 10_000, label: "selecting OCR session" });
  assert.equal(selectingSession.sourceUrl, sourceTarget.url);
  assertMetadataOnlySession(selectingSession);
  await waitFor(
    async () => evaluate(
      sourceProtocol,
      "Boolean(document.getElementById('math-study-log-ocr-capture-overlay-v1'))",
    ),
    { timeoutMs: 10_000, label: "trusted selection overlay" },
  );

  const targetsBeforeSelection = new Set((await listTargets()).map(({ id }) => id));
  await dragSelection(sourceProtocol, geometry);
  const confirmTarget = await waitForTarget(
    (target) => !targetsBeforeSelection.has(target.id)
      && target.url.startsWith(extensionPageUrl(extensionId, `${CONFIRM_PATH}?captureId=`)),
    { timeoutMs: 30_000, label: "OCR confirmation tab" },
  );
  flowTargetIds.add(confirmTarget.id);
  const confirmProtocol = await connectTarget(confirmTarget);
  openedProtocols.push(confirmProtocol);
  const preview = await waitFor(
    () => previewEvidence(confirmProtocol),
    { timeoutMs: 15_000, label: "decoded cropped preview" },
  );
  assert.equal(preview.frameState, "ready");
  assert.equal(preview.blobOk, true);
  assert.equal(preview.blobType, "image/png");
  assert.equal(preview.pngSignature, "89504e470d0a1a0a");
  assert.ok(preview.blobBytes > 0);
  assert.ok(preview.darkPixels > 50, "The crop must retain formula ink.");
  assert.ok(preview.lightPixels > (preview.naturalWidth * preview.naturalHeight) / 2);
  assert.ok(
    preview.magentaPixels < (preview.naturalWidth * preview.naturalHeight) * 0.05,
    `The crop contains too much of the magenta area outside the requested image: ${JSON.stringify({
      geometry,
      preview,
    })}`,
  );
  assert.equal(preview.recognizeDisabled, false);
  assert.equal(preview.candidatePanelHidden, true);

  const previewSessionData = await storageItems(storageProtocol, "session", [OCR_SESSION_KEY]);
  const previewSession = previewSessionData[OCR_SESSION_KEY];
  assert.equal(previewSession?.phase, "preview");
  assertMetadataOnlySession(previewSession);
  const confirmationTabId = await evaluate(
    confirmProtocol,
    "chrome.tabs.getCurrent().then((tab) => tab?.id ?? null)",
  );
  assert.equal(previewSession.previewTabId, confirmationTabId);

  const captureTrace = await evaluate(
    workerProtocol,
    "structuredClone(globalThis.__mathStudyLogOcrFlowCaptureTraceV3)",
  );
  assert.ok(Array.isArray(captureTrace.queryFallbacks));
  for (const fallback of captureTrace.queryFallbacks) {
    assert.equal(fallback.candidateCount, 1);
    assert.equal(fallback.expectedSourceUrl, sourceTarget.url);
  }
  const devtoolsWindowRouteFallback = captureTrace.queryFallbacks.length > 0;
  assert.equal(captureTrace.calls.length, 1);
  const captureCall = captureTrace.calls[0];
  assert.equal(captureCall.completed, true);
  assert.equal(captureCall.windowId, previewSession.windowId);
  assert.equal(captureCall.format, "png");
  assert.equal(captureCall.dataUrlPrefix, "data:image/png;base64,");
  assert.ok(captureCall.dataUrlLength > 100);
  assert.ok(captureCall.screenshotWidth > 0 && captureCall.screenshotHeight > 0);
  const scaleX = captureCall.screenshotWidth / previewSession.viewport.width;
  const scaleY = captureCall.screenshotHeight / previewSession.viewport.height;
  const expectedCropWidth = Math.ceil(
    (previewSession.selection.x + previewSession.selection.width) * scaleX,
  ) - Math.floor(previewSession.selection.x * scaleX);
  const expectedCropHeight = Math.ceil(
    (previewSession.selection.y + previewSession.selection.height) * scaleY,
  ) - Math.floor(previewSession.selection.y * scaleY);
  assert.equal(preview.naturalWidth, expectedCropWidth);
  assert.equal(preview.naturalHeight, expectedCropHeight);

  const contexts = await evaluate(workerProtocol, `(async () => {
    const documentUrl = chrome.runtime.getURL("offscreen.html");
    const matches = await chrome.runtime.getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [documentUrl],
    });
    return matches.map(({ contextType, documentUrl: url }) => ({ contextType, documentUrl: url }));
  })()`);
  assert.equal(contexts.length, 1);
  assert.equal(contexts[0].contextType, "OFFSCREEN_DOCUMENT");

  await clickElement(confirmProtocol, "#recognizeButton");
  const recognition = await waitFor(
    async () => {
      const state = await evaluate(confirmProtocol, `(() => ({
        candidate: document.querySelector("#candidateInput")?.value || "",
        questionLabel: document.querySelector("#questionLabelInput")?.value || "",
        instruction: document.querySelector("#instructionInput")?.value || "",
        panelHidden: document.querySelector("#candidatePanel")?.hidden,
        errorHidden: document.querySelector("#recognitionError")?.hidden,
        error: document.querySelector("#recognitionError")?.textContent || "",
        provider: document.querySelector("#providerInfo")?.textContent || "",
        backend: document.querySelector("#backendInfo")?.textContent || "",
        model: document.querySelector("#modelInfo")?.textContent || "",
      }))()`);
      if (!state.errorHidden && state.error) {
        const failure = new Error(`${state.error} Preview: ${JSON.stringify(preview)}`);
        failure.fatal = true;
        throw failure;
      }
      return !state.panelHidden && state.candidate ? state : null;
    },
    { timeoutMs: 150_000, intervalMs: 250, label: "local OCR candidate" },
  );
  assert.equal(recognition.candidate.replaceAll(" ", ""), geometry.expectedFormula.replaceAll(" ", ""));
  assert.equal(recognition.questionLabel, geometry.expectedQuestionLabel);
  if (geometry.expectedInstruction) {
    assert.equal(recognition.instruction, geometry.expectedInstruction);
  } else {
    assert.equal(recognition.instruction, "");
  }
  const provider = recognition.provider === "WebGPU"
    ? "webgpu"
    : recognition.provider === "WASM"
      ? "wasm"
      : "unknown";
  assert.notEqual(provider, "unknown");
  if (providerExpectation !== "either") assert.equal(provider, providerExpectation);
  assert.ok(recognition.backend);
  assert.ok(recognition.model);

  const afterRecognition = await storageItems(storageProtocol, "local", ["history", "pendingQuestion"]);
  assert.deepEqual(
    Array.isArray(afterRecognition.history) ? afterRecognition.history : [],
    historySnapshot,
  );
  assert.equal(afterRecognition.pendingQuestion, undefined);
  const recognitionSession = await storageItems(storageProtocol, "session", [OCR_SESSION_KEY]);
  assert.equal(recognitionSession[OCR_SESSION_KEY]?.phase, "preview");

  const testQuestion = geometry.expectedAnswer
    ? Object.freeze({ question: geometry.expectedFormula, expectedAnswer: geometry.expectedAnswer })
    : TEST_QUESTIONS[learningMode];
  const candidateMatchesSolveInput = recognition.candidate.replaceAll(" ", "")
    === testQuestion.question.replaceAll(" ", "");
  if (!candidateMatchesSolveInput) {
    await replaceInput(confirmProtocol, "#candidateInput", testQuestion.question);
  }
  const solveInstruction = geometry.expectedKind === "mixed"
    ? "方程式を解きなさい"
    : geometry.expectedInstruction;
  if (recognition.instruction !== solveInstruction) {
    await replaceInput(confirmProtocol, "#instructionInput", solveInstruction);
  }
  await clickElement(confirmProtocol, "#solveButton");
  // The confirmation tab intentionally closes after it hands the confirmed
  // candidate to the already-open Side Panel. Observe the persistent panel
  // instead of waiting for the closed tab to navigate to popup.html.
  const solved = await waitFor(
    async () => {
      const state = await evaluate(popupProtocol, `(() => ({
        question: document.querySelector("#questionInput")?.value || "",
        questionLabel: document.querySelector("#questionLabelInput")?.value || "",
        instruction: document.querySelector("#instructionInput")?.value || "",
        source: document.querySelector("#inputSourceStatus")?.textContent || "",
        resultHidden: document.querySelector("#resultPanel")?.hidden,
        result: document.querySelector("#resultOutput")?.textContent || "",
        verification: document.querySelector("#verificationBadge")?.textContent || "",
        verificationKind: document.querySelector("#verificationBadge")?.dataset.verification || "",
      }))()`);
      return !state.resultHidden && state.result ? state : null;
    },
    { timeoutMs: 30_000, intervalMs: 150, label: "deterministic solve result" },
  );
  assert.equal(solved.question, testQuestion.question);
  assert.equal(solved.questionLabel, geometry.expectedQuestionLabel);
  assert.equal(solved.instruction, solveInstruction);
  assert.equal(solved.source, "画像読み取り");
  assert.ok(solved.result.replaceAll(" ", "").includes(testQuestion.expectedAnswer));
  assert.equal(solved.verification, "自作ソルバーで検証済み");
  assert.equal(solved.verificationKind, "solver");

  const expectedHistoryLength = learningMode === "study" ? historyBefore + 1 : historyBefore;
  const finalLocal = await waitFor(async () => {
    const local = await storageItems(storageProtocol, "local", ["history", "pendingQuestion"]);
    const count = Array.isArray(local.history) ? local.history.length : 0;
    return count === expectedHistoryLength ? local : null;
  }, { timeoutMs: 10_000, label: `${learningMode} history state` });
  assert.equal(finalLocal.pendingQuestion, undefined);
  if (learningMode === "study") {
    const record = finalLocal.history[0];
    assert.equal(record.question, testQuestion.question);
    assert.equal(record.learningMode, "study");
    assert.equal(record.source, "ocr");
    assert.equal(record.ocrUsed, true);
    assert.equal(record.ocrConfirmed, true);
    assert.equal(record.verified, true);
    assert.equal(record.verificationType, "solver");
    assert.ok(String(record.finalAnswer || "").replaceAll(" ", "").includes(testQuestion.expectedAnswer));
    if (geometry.expectedKind === "mixed") {
      assert.equal(record.problemInput?.questionLabel, geometry.expectedQuestionLabel);
      assert.equal(record.problemInput?.instructionText, solveInstruction.replace(/[。．.!！?？]+$/u, ""));
      assert.equal(record.problemInput?.instructionIntent, geometry.expectedIntent || "solve_equation");
      assert.equal(record.problemInput?.formulaText, testQuestion.question);
      assert.equal(record.problemInput?.instructionSource, "manual");
      assert.equal(record.problemInput?.formulaSource, candidateMatchesSolveInput ? "ocr" : "manual");
    }
    assert.deepEqual(finalLocal.history.slice(1), historySnapshot);
  } else {
    assert.deepEqual(finalLocal.history, historySnapshot);
  }

  const finalSession = await storageItems(storageProtocol, "session", [OCR_SESSION_KEY]);
  assert.equal(finalSession[OCR_SESSION_KEY], undefined);
  const cleanup = await evaluate(popupProtocol, `(async () => {
    let oldBlobFetchSucceeded = false;
    try {
      const response = await fetch(${JSON.stringify(preview.previewUrl)});
      oldBlobFetchSucceeded = response.ok;
    } catch {
      oldBlobFetchSucceeded = false;
    }
    let previewLookup;
    try {
      previewLookup = await chrome.runtime.sendMessage({
        target: "math-study-log-offscreen",
        type: "GET_OCR_CAPTURE_PREVIEW",
        previewId: ${JSON.stringify(previewSession.captureId)},
      });
    } catch (error) {
      previewLookup = { transportError: String(error?.message || error) };
    }
    return { oldBlobFetchSucceeded, previewLookup };
  })()`);
  assert.equal(cleanup.oldBlobFetchSucceeded, false);
  assert.equal(cleanup.previewLookup?.ok, false);
  assert.equal(cleanup.previewLookup?.error?.code, "OCR_CAPTURE_PREVIEW_NOT_FOUND");

  return Object.freeze({
    chromeVersion,
    learningMode,
    provider,
    recognized: recognition.candidate,
    recognitionKind: geometry.expectedKind,
    questionLabel: recognition.questionLabel,
    instruction: recognition.instruction,
    editedInstruction: solveInstruction,
    editedQuestion: testQuestion.question,
    answerMatched: true,
    devtoolsWindowRouteFallback,
    historyBefore,
    historyAfter: expectedHistoryLength,
    screenshot: Object.freeze({
      width: captureCall.screenshotWidth,
      height: captureCall.screenshotHeight,
    }),
    crop: Object.freeze({
      width: preview.naturalWidth,
      height: preview.naturalHeight,
      bytes: preview.blobBytes,
      darkPixels: preview.darkPixels,
      magentaPixels: preview.magentaPixels,
    }),
    previewRevoked: true,
  });
}

async function runFlow(options) {
  const openedProtocols = [];
  const flowTargetIds = new Set();
  try {
    return await runFlowUnsafe({
      ...options,
      openedProtocols,
      flowTargetIds,
    });
  } finally {
    for (const protocol of openedProtocols) protocol.close();
    for (const targetId of flowTargetIds) {
      await options.browser.send("Target.closeTarget", { targetId }).catch(() => undefined);
    }
  }
}

const browserVersion = await readJson("/json/version");
const browser = openProtocol(browserVersion.webSocketDebuggerUrl);
const createdTargetIds = [];
let storageProtocol = null;

try {
  const fixtureResponse = await fetch(fixtureUrl);
  if (!fixtureResponse.ok) {
    throw new Error(`OCR fixture is unavailable: HTTP ${fixtureResponse.status}`);
  }

  const installed = await browser.send("Extensions.getExtensions");
  const existingExtension = installed.extensions?.find(
    ({ path }) => normalizeFilesystemPath(path) === normalizeFilesystemPath(extensionPath),
  );
  // Loading the same unpacked path again refreshes changed extension files in
  // a long-lived test browser without uninstalling the isolated test copy.
  const loaded = await browser.send("Extensions.loadUnpacked", { path: extensionPath });
  const extension = {
    ...existingExtension,
    id: loaded.id,
    path: extensionPath,
    enabled: true,
  };
  if (!extension?.id) throw new Error("The unpacked extension could not be loaded.");

  const inspectorUrl = extensionPageUrl(extension.id, "/settings.html");
  const inspector = await browser.send("Target.createTarget", { url: inspectorUrl });
  createdTargetIds.push(inspector.targetId);
  const inspectorTarget = await waitForTarget(
    (target) => target.id === inspector.targetId && target.url === inspectorUrl,
    { timeoutMs: 10_000, label: "extension storage inspector" },
  );
  storageProtocol = await connectTarget(inspectorTarget);
  const inspectorEnvironment = await waitFor(async () => {
    const environment = await evaluate(storageProtocol, `({
      href: location.href,
      title: document.title,
      readyState: document.readyState,
      runtimeId: globalThis.chrome?.runtime?.id || "",
      hasStorage: Boolean(globalThis.chrome?.storage?.local && globalThis.chrome?.storage?.session),
    })`);
    if (environment.href !== inspectorUrl || environment.hasStorage !== true) {
      throw new Error(`Extension storage is unavailable: ${JSON.stringify({
        extension,
        environment,
      })}`);
    }
    return environment;
  }, { timeoutMs: 10_000, label: "extension storage inspector readiness" });
  assert.equal(inspectorEnvironment.runtimeId, extension.id);
  await evaluate(storageProtocol, `(async () => {
    await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
    await chrome.storage.local.set({ settings: ${JSON.stringify(settingsFor("study"))} });
    return true;
  })()`);

  const outcomes = [];
  for (const learningMode of ["study", "quick"]) {
    const runUrl = new URL(fixtureUrl);
    runUrl.searchParams.set("mode", learningMode);
    runUrl.searchParams.set("run", `${Date.now()}-${outcomes.length}`);
    const created = await browser.send("Target.createTarget", { url: runUrl.href });
    createdTargetIds.push(created.targetId);
    const sourceTarget = await waitForTarget(
      (target) => target.id === created.targetId && target.url === runUrl.href,
      { timeoutMs: 10_000, label: `${learningMode} fixture target` },
    );
    outcomes.push(await runFlow({
      browser,
      extensionId: extension.id,
      learningMode,
      sourceTarget,
      chromeVersion: browserVersion.Browser,
      storageProtocol,
    }));
  }

  console.log(JSON.stringify({
    ok: true,
    extensionId: extension.id,
    actionTrigger: "Extensions.triggerAction",
    providerExpectation,
    outcomes,
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.stack || error?.message || error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  storageProtocol?.close();
  for (const targetId of createdTargetIds) {
    await browser.send("Target.closeTarget", { targetId }).catch(() => undefined);
  }
  browser.close();
}
