import assert from "node:assert/strict";
import { resolve } from "node:path";

const rawArguments = process.argv.slice(2);
const supportedFlags = new Set(["--allow-storage-reset"]);
const shortcutArguments = rawArguments.filter((argument) => argument.startsWith("--shortcut="));
if (shortcutArguments.length > 1) throw new TypeError("Specify at most one --shortcut scenario.");
const shortcutScenario = shortcutArguments[0]?.slice("--shortcut=".length) || "http-selection";
const shortcutScenarios = new Set([
  "http-selection",
  "http-clipboard",
  "chrome",
  "extension",
  "devtools",
  "unsupported",
]);
if (!shortcutScenarios.has(shortcutScenario)) {
  throw new TypeError(`Unknown shortcut scenario: ${shortcutScenario}`);
}
const unknownFlags = rawArguments.filter(
  (argument) => argument.startsWith("--")
    && !supportedFlags.has(argument)
    && !argument.startsWith("--shortcut="),
);
if (unknownFlags.length) throw new TypeError(`Unknown option: ${unknownFlags.join(", ")}`);
if (!rawArguments.includes("--allow-storage-reset")) {
  throw new Error(
    "Refusing to clear extension test storage without --allow-storage-reset. "
    + "Use only a disposable Chrome profile.",
  );
}

const positional = rawArguments.filter((argument) => !argument.startsWith("--"));
const port = Number(positional[0] || 9333);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError("DevTools port must be an integer between 1 and 65535.");
}
const extensionPath = resolve(positional[1] || process.cwd());
const loopbackBase = ["http:", "//127.0.0.1"].join("");
const devtoolsBase = `${loopbackBase}:${port}`;
const fixtureUrl = `${loopbackBase}:8765/tests/browser/input-entry-harness.html`;

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
  timeoutMs = 15_000,
  intervalMs = 100,
  label = "condition",
} = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const value = await operation();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await delay(intervalMs);
  }
  throw new Error(
    `Timed out waiting for ${label}.${lastError ? ` Last error: ${lastError.message}` : ""}`,
  );
}

function openProtocol(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  let closed = false;
  const ready = new Promise((resolvePromise, rejectPromise) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", rejectPromise, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(request.timer);
    if (message.error) request.reject(new Error(`${request.method}: ${message.error.message}`));
    else request.resolve(message.result);
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
    get closed() { return closed; },
    async send(method, params = {}, timeoutMs = 15_000) {
      await ready;
      if (closed) throw new Error("DevTools target is closed.");
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
    close() { if (!closed) socket.close(); },
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

async function waitForTarget(predicate, label = "target") {
  return waitFor(
    async () => (await listTargets()).find(predicate) ?? null,
    { timeoutMs: 10_000, label },
  );
}

async function connectTarget(target) {
  if (!target?.webSocketDebuggerUrl) throw new Error("Target has no debugger URL.");
  const protocol = openProtocol(target.webSocketDebuggerUrl);
  await protocol.send("Runtime.enable");
  if (target.type === "page") await protocol.send("Page.enable");
  return protocol;
}

function extensionUrl(extensionId, path) {
  return ["chrome-extension:", `//${extensionId}${path}`].join("");
}

function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/\/+$/u, "").toLowerCase();
}

async function createPage(browser, url, openedTargetIds, openedProtocols) {
  const created = await browser.send("Target.createTarget", { url });
  openedTargetIds.add(created.targetId);
  const target = await waitForTarget((candidate) => candidate.id === created.targetId, url);
  const protocol = await connectTarget(target);
  openedProtocols.push(protocol);
  await waitFor(
    async () => evaluate(protocol, "document.readyState === 'complete'"),
    { label: `ready page ${url}` },
  );
  return { target, protocol };
}

async function activate(browser, target, protocol) {
  await browser.send("Target.activateTarget", { targetId: target.id });
  await protocol.send("Page.bringToFront").catch(() => undefined);
}

async function pressLetter(protocol, letter, modifiers, commands = undefined) {
  const upper = letter.toUpperCase();
  const params = {
    type: "rawKeyDown",
    key: modifiers & 8 ? upper : letter.toLowerCase(),
    code: `Key${upper}`,
    modifiers,
    windowsVirtualKeyCode: upper.charCodeAt(0),
    nativeVirtualKeyCode: upper.charCodeAt(0),
    ...(commands ? { commands } : {}),
  };
  await protocol.send("Input.dispatchKeyEvent", params);
  await protocol.send("Input.dispatchKeyEvent", { ...params, type: "keyUp", commands: undefined });
}

async function clickElement(protocol, selector) {
  const rect = await evaluate(protocol, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return null;
    element.scrollIntoView({ block: "center", inline: "center" });
    const rect = element.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  })()`);
  if (!rect) throw new Error(`Element not found: ${selector}`);
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mousePressed", x: rect.x, y: rect.y, button: "left", buttons: 1, clickCount: 1,
  });
  await protocol.send("Input.dispatchMouseEvent", {
    type: "mouseReleased", x: rect.x, y: rect.y, button: "left", buttons: 0, clickCount: 1,
  });
}

async function clipboardRead(protocol) {
  await browser.send("Target.activateTarget", { targetId: clipboardTargetId });
  await protocol.send("Page.bringToFront").catch(() => undefined);
  return String(await evaluate(
    protocol,
    "navigator.clipboard['readText']()",
    { userGesture: true },
  ));
}

async function clipboardWrite(protocol, value) {
  await browser.send("Target.activateTarget", { targetId: clipboardTargetId });
  await protocol.send("Page.bringToFront").catch(() => undefined);
  return evaluate(
    protocol,
    `navigator.clipboard.writeText(${JSON.stringify(value)}).then(() => true)`,
    { userGesture: true },
  );
}

async function waitForClipboard(protocol, expected, label) {
  let lastValue = "";
  try {
    return await waitFor(async () => {
      lastValue = await clipboardRead(protocol);
      return lastValue === expected ? lastValue : null;
    }, { timeoutMs: 20_000, intervalMs: 100, label });
  } catch (error) {
    throw new Error(`${error.message} Last clipboard: ${JSON.stringify(lastValue)}`, {
      cause: error,
    });
  }
}

async function selectElement(protocol, selector) {
  return evaluate(protocol, `(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!element) return false;
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    element.scrollIntoView({ block: "center" });
    return !selection.isCollapsed;
  })()`);
}

async function pasteIntoQuestion(browser, popupTarget, popupProtocol) {
  await activate(browser, popupTarget, popupProtocol);
  const focused = await evaluate(popupProtocol, `(() => {
    const input = document.querySelector("#questionInput");
    if (!input) return false;
    input.focus();
    input.setSelectionRange(0, input.value.length);
    return document.activeElement === input;
  })()`);
  assert.equal(focused, true);
  await pressLetter(popupProtocol, "v", 2, ["paste"]);
}

async function popupState(protocol) {
  return evaluate(protocol, `(() => ({
    formula: document.querySelector("#questionInput")?.value || "",
    label: document.querySelector("#questionLabelInput")?.value || "",
    instruction: document.querySelector("#instructionInput")?.value || "",
    source: document.querySelector("#inputSourceStatus")?.textContent || "",
    appState: document.querySelector("#appStateBadge")?.textContent || "",
    resultHidden: document.querySelector("#resultPanel")?.hidden,
    result: document.querySelector("#resultOutput")?.textContent || "",
    errorHidden: document.querySelector("#errorMessage")?.hidden,
    error: document.querySelector("#errorMessage")?.textContent || "",
  }))()`);
}

async function triggerShortcut(browser, target, protocol) {
  await activate(browser, target, protocol);
  const control = {
    key: "Control",
    code: "ControlLeft",
    windowsVirtualKeyCode: 17,
    nativeVirtualKeyCode: 17,
    location: 1,
  };
  const shift = {
    key: "Shift",
    code: "ShiftLeft",
    windowsVirtualKeyCode: 16,
    nativeVirtualKeyCode: 16,
    location: 1,
  };
  const y = {
    key: "Y",
    code: "KeyY",
    windowsVirtualKeyCode: 89,
    nativeVirtualKeyCode: 89,
  };
  await protocol.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...control, modifiers: 2 });
  await protocol.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...shift, modifiers: 10 });
  await protocol.send("Input.dispatchKeyEvent", { type: "rawKeyDown", ...y, modifiers: 10 });
  await protocol.send("Input.dispatchKeyEvent", { type: "keyUp", ...y, modifiers: 10 });
  await protocol.send("Input.dispatchKeyEvent", { type: "keyUp", ...shift, modifiers: 2 });
  await protocol.send("Input.dispatchKeyEvent", { type: "keyUp", ...control, modifiers: 0 });
}

const browserVersion = await readJson("/json/version");
const browser = openProtocol(browserVersion.webSocketDebuggerUrl);
const openedTargetIds = new Set();
const openedProtocols = [];
let clipboardProtocol = null;
let clipboardTargetId = null;
let originalClipboard = null;

try {
  const fixtureResponse = await fetch(fixtureUrl);
  if (!fixtureResponse.ok) throw new Error(`Fixture unavailable: HTTP ${fixtureResponse.status}`);

  const installed = await browser.send("Extensions.getExtensions");
  const existing = installed.extensions?.find(
    ({ path }) => normalizePath(path) === normalizePath(extensionPath),
  );
  const loaded = await browser.send("Extensions.loadUnpacked", { path: extensionPath });
  const extensionId = loaded.id || existing?.id;
  if (!extensionId) throw new Error("Could not load the unpacked extension.");
  await browser.send("Browser.grantPermissions", {
    origin: extensionUrl(extensionId, ""),
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });
  await browser.send("Browser.grantPermissions", {
    origin: `${loopbackBase}:8765`,
    permissions: ["clipboardReadWrite", "clipboardSanitizedWrite"],
  });

  const workerTarget = await waitForTarget(
    (candidate) => candidate.type === "service_worker"
      && candidate.url === extensionUrl(extensionId, "/js/background.js"),
    "extension service worker",
  );
  const workerProtocol = await connectTarget(workerTarget);
  openedProtocols.push(workerProtocol);

  const inspector = await createPage(
    browser,
    extensionUrl(extensionId, "/settings.html"),
    openedTargetIds,
    openedProtocols,
  );
  await activate(browser, inspector.target, inspector.protocol);
  clipboardProtocol = inspector.protocol;
  clipboardTargetId = inspector.target.id;
  originalClipboard = await clipboardRead(clipboardProtocol);
  await evaluate(inspector.protocol, `(async () => {
    await Promise.all([chrome.storage.local.clear(), chrome.storage.session.clear()]);
    await chrome.storage.local.set({
      settings: { learningMode: "quick", saveHistory: true, shortcutAction: "answer" },
    });
    return true;
  })()`);
  const commands = await evaluate(inspector.protocol, "chrome.commands.getAll()");
  const solveCommand = commands.find(({ name }) => name === "solve-selection-to-clipboard");
  assert.equal(solveCommand?.shortcut, "Ctrl+Shift+Y");

  const fixture = await createPage(browser, fixtureUrl, openedTargetIds, openedProtocols);
  await activate(browser, fixture.target, fixture.protocol);
  assert.equal(await selectElement(fixture.protocol, "#pasteProblem"), true);
  await pressLetter(fixture.protocol, "c", 2, ["copy"]);
  const copiedPlain = await clipboardRead(clipboardProtocol);
  assert.match(copiedPlain, /^\(2\)\s*x2-5x\+6=0\s*を解け$/u);

  const pastePopup = await createPage(
    browser,
    extensionUrl(extensionId, "/popup.html?paste-smoke=1"),
    openedTargetIds,
    openedProtocols,
  );
  await waitFor(
    async () => evaluate(pastePopup.protocol, "Boolean(document.querySelector('#questionInput'))"),
    { label: "paste popup" },
  );
  await pasteIntoQuestion(browser, pastePopup.target, pastePopup.protocol);
  const structuredPaste = await waitFor(async () => {
    const state = await popupState(pastePopup.protocol);
    return state.formula ? state : null;
  }, { label: "structured HTML paste" });
  assert.equal(structuredPaste.formula, "x^2-5x+6=0");
  assert.equal(structuredPaste.label, "(2)");
  assert.equal(structuredPaste.instruction, "方程式を解け");
  assert.equal(structuredPaste.source, "クリップボード");
  assert.equal(structuredPaste.resultHidden, true, "Paste must not auto-solve.");
  await clickElement(pastePopup.protocol, "#runButton");
  const pasteSolved = await waitFor(async () => {
    const state = await popupState(pastePopup.protocol);
    return !state.resultHidden && state.result ? state : null;
  }, { timeoutMs: 20_000, label: "explicit paste solve" });
  assert.match(pasteSolved.result.replaceAll(" ", ""), /x=2,3/u);

  await clipboardWrite(clipboardProtocol, "2x2-3x+5=0");
  const plainPopup = await createPage(
    browser,
    extensionUrl(extensionId, "/popup.html?paste-smoke=plain"),
    openedTargetIds,
    openedProtocols,
  );
  await pasteIntoQuestion(browser, plainPopup.target, plainPopup.protocol);
  const plainPaste = await waitFor(async () => {
    const state = await popupState(plainPopup.protocol);
    return state.formula ? state : null;
  }, { label: "plain ambiguous paste" });
  assert.equal(plainPaste.formula, "2x2-3x+5=0");
  assert.doesNotMatch(plainPaste.formula, /\^/u);
  assert.equal(plainPaste.resultHidden, true);
  await clickElement(plainPopup.protocol, "#runButton");
  const plainRejected = await waitFor(async () => {
    const state = await popupState(plainPopup.protocol);
    return !state.errorHidden && state.error ? state : null;
  }, { timeoutMs: 20_000, label: "ambiguous plain rejection" });
  assert.equal(plainRejected.resultHidden, true);

  let shortcutResult;
  if (shortcutScenario === "http-selection") {
    await clipboardWrite(clipboardProtocol, "9x=9");
    await activate(browser, fixture.target, fixture.protocol);
    assert.equal(await selectElement(fixture.protocol, "#shortcutProblem"), true);
    await triggerShortcut(browser, fixture.target, fixture.protocol);
    await waitForClipboard(clipboardProtocol, "x=2,3", "HTTP selection shortcut");
    const selectionToast = await evaluate(
      fixture.protocol,
      "document.querySelector('#math-study-log-ai-toast')?.textContent"
        + ".includes('選択範囲から答えをコピー') === true",
    );
    assert.equal(selectionToast, true);
    shortcutResult = { source: "selection", clipboard: "x=2,3", toast: true };
  } else if (shortcutScenario === "http-clipboard") {
    await clipboardWrite(clipboardProtocol, "3x=15");
    await activate(browser, fixture.target, fixture.protocol);
    await evaluate(fixture.protocol, "getSelection().removeAllRanges(); true");
    await triggerShortcut(browser, fixture.target, fixture.protocol);
    await waitForClipboard(clipboardProtocol, "x=5", "HTTP clipboard fallback shortcut");
    const clipboardToast = await evaluate(
      fixture.protocol,
      "document.querySelector('#math-study-log-ai-toast')?.textContent"
        + ".includes('クリップボードから答えをコピー') === true",
    );
    assert.equal(clipboardToast, true);
    shortcutResult = { source: "clipboard", clipboard: "x=5", toast: true };
  } else if (shortcutScenario === "chrome") {
    const chromePage = await createPage(
      browser,
      "chrome://version/",
      openedTargetIds,
      openedProtocols,
    );
    await clipboardWrite(clipboardProtocol, "x^2-5x+6=0");
    await triggerShortcut(browser, chromePage.target, chromePage.protocol);
    await waitForClipboard(clipboardProtocol, "x=2,3", "chrome page clipboard shortcut");
    shortcutResult = { source: "clipboard", clipboard: "x=2,3", page: "chrome://version/" };
  } else if (shortcutScenario === "extension") {
    await clipboardWrite(clipboardProtocol, "4x=20");
    await triggerShortcut(browser, inspector.target, inspector.protocol);
    await waitForClipboard(clipboardProtocol, "x=5", "extension page clipboard shortcut");
    shortcutResult = { source: "clipboard", clipboard: "x=5", page: "extension" };
  } else if (shortcutScenario === "devtools") {
    const devtoolsPage = await createPage(
      browser,
      "devtools://devtools/bundled/devtools_app.html",
      openedTargetIds,
      openedProtocols,
    );
    await clipboardWrite(clipboardProtocol, "5x=30");
    await triggerShortcut(browser, devtoolsPage.target, devtoolsPage.protocol);
    await waitForClipboard(clipboardProtocol, "x=6", "DevTools clipboard shortcut");
    shortcutResult = { source: "clipboard", clipboard: "x=6", page: devtoolsPage.target.url };
  } else {
    const ambiguousClipboard = "2x2-3x+5=0";
    await clipboardWrite(clipboardProtocol, ambiguousClipboard);
    await triggerShortcut(browser, inspector.target, inspector.protocol);
    await delay(1_500);
    assert.equal(await clipboardRead(clipboardProtocol), ambiguousClipboard);
    shortcutResult = {
      source: "clipboard",
      clipboard: ambiguousClipboard,
      preserved: true,
      page: "extension",
    };
  }
  const storage = await evaluate(
    inspector.protocol,
    "chrome.storage.local.get(['history']).then(({ history }) => ({ history: history || [] }))",
  );
  assert.deepEqual(storage.history, []);

  console.log(JSON.stringify({
    ok: true,
    chromeVersion: browserVersion.Browser,
    extensionId,
    commandShortcut: solveCommand.shortcut,
    paste: {
      copiedPlain,
      formula: structuredPaste.formula,
      questionLabel: structuredPaste.label,
      instruction: structuredPaste.instruction,
      answer: pasteSolved.result,
      autoSolved: false,
    },
    ambiguousPlain: {
      formula: plainPaste.formula,
      rejected: true,
      clipboardPreserved: true,
    },
    shortcut: { scenario: shortcutScenario, ...shortcutResult },
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    error: String(error?.stack || error?.message || error),
  }, null, 2));
  process.exitCode = 1;
} finally {
  if (clipboardProtocol && originalClipboard !== null) {
    await clipboardWrite(clipboardProtocol, originalClipboard).catch(() => undefined);
  }
  for (const protocol of openedProtocols) protocol.close();
  for (const targetId of openedTargetIds) {
    await browser.send("Target.closeTarget", { targetId }).catch(() => undefined);
  }
  browser.close();
}
