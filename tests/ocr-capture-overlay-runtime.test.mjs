import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const overlayUrl = new URL("../js/ocr/capture-overlay.js", import.meta.url);
const overlaySource = await readFile(overlayUrl, "utf8");

const EXTENSION_ID = "math-study-log-test-extension";
const BACKGROUND_TARGET = "math-study-log-background";
const CAPTURE_ID = "capture-runtime-1";
const PAGE_URL = ["https:", "//example.test/problem"].join("");

class FakeStyle {
  constructor() {
    this.declarations = new Map();
  }

  setProperty(property, value, priority = "") {
    this.declarations.set(property, { value: String(value), priority: String(priority) });
  }

  getPropertyValue(property) {
    return this.declarations.get(property)?.value ?? "";
  }
}

class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
  }

  addEventListener(type, listener, options) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push({ listener, options });
    this.listeners.set(type, listeners);
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    this.listeners.set(
      type,
      listeners.filter((entry) => entry.listener !== listener),
    );
  }

  dispatchEvent(event) {
    for (const { listener } of [...(this.listeners.get(event.type) ?? [])]) {
      listener.call(this, event);
    }
    return !event.defaultPrevented;
  }

  listenerCount() {
    return [...this.listeners.values()].reduce((total, listeners) => total + listeners.length, 0);
  }
}

class FakeNode extends FakeEventTarget {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.style = new FakeStyle();
    this.dataset = Object.create(null);
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.isConnected = false;
    this.className = "";
    this.id = "";
    this.textContent = "";
    this.hidden = false;
    this.open = false;
    this.modal = false;
    this.removed = false;
    this.pointerCaptures = new Set();
    this.shadowRootForTest = null;
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.children.push(child);
      child.setConnected(this.isConnected);
    }
  }

  setConnected(isConnected) {
    this.isConnected = isConnected;
    for (const child of this.children) child.setConnected(isConnected);
    if (this.shadowRootForTest) this.shadowRootForTest.setConnected(isConnected);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "open") this.open = true;
  }

  attachShadow() {
    if (this.tagName === "DIALOG") {
      throw new Error("This element does not support attachShadow");
    }
    this.shadowRootForTest = new FakeNode("shadow-root", this.ownerDocument);
    this.shadowRootForTest.setConnected(this.isConnected);
    return this.shadowRootForTest;
  }

  showModal() {
    this.open = true;
    this.modal = true;
  }

  show() {
    this.open = true;
    this.modal = false;
  }

  close() {
    this.open = false;
    this.modal = false;
    this.dispatchEvent(createEvent("close", { isTrusted: false, cancelable: false }));
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.children = this.parentNode.children.filter((child) => child !== this);
      this.parentNode = null;
    }
    this.removed = true;
    this.setConnected(false);
  }

  focus() {
    this.ownerDocument.activeElement = this;
  }

  setPointerCapture(pointerId) {
    this.pointerCaptures.add(pointerId);
  }

  hasPointerCapture(pointerId) {
    return this.pointerCaptures.has(pointerId);
  }

  releasePointerCapture(pointerId) {
    this.pointerCaptures.delete(pointerId);
  }
}

class FakeDocument {
  constructor() {
    this.elements = [];
    this.documentElement = new FakeNode("html", this);
    this.documentElement.setConnected(true);
    this.activeElement = new FakeNode("button", this);
    this.activeElement.setConnected(true);
  }

  createElement(tagName) {
    const element = new FakeNode(tagName, this);
    this.elements.push(element);
    return element;
  }
}

class FakeWindow extends FakeEventTarget {
  constructor(timerHarness) {
    super();
    this.top = this;
    this.innerWidth = 120;
    this.innerHeight = 90;
    this.devicePixelRatio = 2;
    this.setTimeout = timerHarness.setTimeout;
    this.clearTimeout = timerHarness.clearTimeout;
  }
}

function createEvent(type, overrides = {}) {
  return {
    type,
    cancelable: true,
    defaultPrevented: false,
    immediatePropagationStopped: false,
    isTrusted: true,
    preventDefault() {
      if (this.cancelable) this.defaultPrevented = true;
    },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
    },
    ...overrides,
  };
}

function protocolMessage(type, extra = {}) {
  return {
    protocolVersion: 1,
    target: BACKGROUND_TARGET,
    type,
    ...extra,
  };
}

function beginMessage(extra = {}) {
  return protocolMessage("BEGIN_OCR_SELECTION", {
    captureId: CAPTURE_ID,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    documentId: "document-runtime-1",
    sourceUrl: PAGE_URL,
    ...extra,
  });
}

function createHarness({ respondToBackground = () => Promise.resolve({ ok: true }) } = {}) {
  let nextTimerId = 1;
  const timers = new Map();
  const animationFrames = [];
  const outboundMessages = [];
  const outboundSnapshots = [];
  let runtimeListener = null;

  const timerHarness = {
    setTimeout: (callback, delay) => {
      const id = nextTimerId;
      nextTimerId += 1;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout: (id) => {
      timers.delete(id);
    },
  };
  const document = new FakeDocument();
  const window = new FakeWindow(timerHarness);

  const currentHost = () => document.elements.find(
    (element) => element.id === "math-study-log-ocr-capture-overlay-v1" && !element.removed,
  ) ?? null;

  const chrome = {
    runtime: {
      id: EXTENSION_ID,
      onMessage: {
        addListener(listener) {
          runtimeListener = listener;
        },
      },
      sendMessage(message) {
        outboundMessages.push(message);
        outboundSnapshots.push({
          type: message.type,
          hostConnected: currentHost()?.isConnected ?? false,
          windowListenerCount: window.listenerCount(),
          pendingTimerCount: timers.size,
        });
        return respondToBackground(message);
      },
    },
  };

  const context = vm.createContext({
    chrome,
    console,
    document,
    requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    },
    URL,
    window,
  });
  vm.runInContext(overlaySource, context, { filename: overlayUrl.pathname });
  assert.equal(typeof runtimeListener, "function", "overlay should register its runtime listener");

  function dispatchMessage(message, sender = { id: EXTENSION_ID }) {
    const result = {
      response: undefined,
      responseCount: 0,
      returnValue: undefined,
    };
    result.returnValue = runtimeListener(message, sender, (response) => {
      result.response = response;
      result.responseCount += 1;
    });
    return result;
  }

  function startCapture(captureId = CAPTURE_ID) {
    return dispatchMessage(beginMessage({ captureId }));
  }

  function dragSelection({
    pointerId = 7,
    startX = 100,
    startY = 80,
    endX = -10,
    endY = 20,
  } = {}) {
    window.dispatchEvent(createEvent("pointerdown", {
      button: 0,
      clientX: startX,
      clientY: startY,
      isPrimary: true,
      pointerId,
    }));
    window.dispatchEvent(createEvent("pointermove", {
      button: 0,
      clientX: endX,
      clientY: endY,
      isPrimary: true,
      pointerId,
    }));
    window.dispatchEvent(createEvent("pointerup", {
      button: 0,
      clientX: endX,
      clientY: endY,
      isPrimary: true,
      pointerId,
    }));
  }

  function runNextAnimationFrame() {
    const callback = animationFrames.shift();
    assert.equal(typeof callback, "function", "an animation frame should be queued");
    callback(Date.now());
  }

  return {
    animationFrames,
    currentHost,
    dispatchMessage,
    document,
    dragSelection,
    outboundMessages,
    outboundSnapshots,
    runNextAnimationFrame,
    startCapture,
    timers,
    window,
  };
}

async function flushPromiseCallbacks() {
  await Promise.resolve();
  await Promise.resolve();
}

test("valid BEGIN creates the on-demand overlay", () => {
  const harness = createHarness();

  const result = harness.startCapture();
  const host = harness.currentHost();

  assert.equal(result.returnValue, false);
  assert.equal(result.responseCount, 1);
  assert.equal(result.response.ok, true);
  assert.equal(result.response.captureId, CAPTURE_ID);
  assert.ok(host);
  assert.equal(host.isConnected, true);
  assert.equal(host.open, true);
  assert.equal(host.modal, true);
  assert.equal(host.dataset.phase, "selecting");
  assert.ok(harness.window.listenerCount() > 0);
  assert.equal(harness.timers.size, 1);
});

test("trusted primary drag submits a viewport-normalized selection", () => {
  const harness = createHarness();
  harness.startCapture();

  harness.dragSelection();

  const submitted = harness.outboundMessages.find(
    (message) => message.type === "SUBMIT_OCR_SELECTION",
  );
  assert.ok(submitted);
  assert.equal(submitted.captureId, CAPTURE_ID);
  assert.deepEqual(
    {
      x: submitted.selection.x,
      y: submitted.selection.y,
      width: submitted.selection.width,
      height: submitted.selection.height,
    },
    { x: 0, y: 20, width: 100, height: 60 },
  );
  assert.deepEqual(
    {
      width: submitted.viewport.width,
      height: submitted.viewport.height,
      devicePixelRatio: submitted.viewport.devicePixelRatio,
    },
    { width: 120, height: 90, devicePixelRatio: 2 },
  );
  assert.equal(harness.currentHost().dataset.phase, "submitted");
});

test("PREPARE responds after two queued animation frames and clears the shield paint", () => {
  const harness = createHarness();
  harness.startCapture();
  harness.dragSelection();

  const prepare = harness.dispatchMessage(
    protocolMessage("PREPARE_OCR_SCREENSHOT", { captureId: CAPTURE_ID }),
  );
  const shield = harness.document.elements.find((element) => element.className === "shield");

  assert.equal(prepare.returnValue, true);
  assert.equal(prepare.responseCount, 0);
  assert.equal(harness.animationFrames.length, 1);
  assert.equal(shield.style.getPropertyValue("background"), "transparent");
  assert.equal(harness.currentHost().dataset.captureReady, "true");
  assert.equal(harness.currentHost().open, true);
  assert.equal(harness.currentHost().modal, false);

  harness.runNextAnimationFrame();
  assert.equal(prepare.responseCount, 0);
  assert.equal(harness.animationFrames.length, 1);

  harness.runNextAnimationFrame();
  assert.equal(prepare.responseCount, 1);
  assert.equal(prepare.response.ok, true);
  assert.equal(prepare.response.captureId, CAPTURE_ID);
  assert.equal(harness.currentHost().dataset.phase, "capture-ready");
});

test("COMPLETE removes the overlay, timers, and window listeners", () => {
  const harness = createHarness();
  harness.startCapture();
  harness.dragSelection();
  const host = harness.currentHost();
  assert.ok(harness.timers.size >= 1);

  const complete = harness.dispatchMessage(
    protocolMessage("OCR_CAPTURE_COMPLETE", { captureId: CAPTURE_ID }),
  );

  assert.equal(complete.response.ok, true);
  assert.equal(host.isConnected, false);
  assert.equal(host.removed, true);
  assert.equal(harness.currentHost(), null);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.window.listenerCount(), 0);
});

test("trusted Esc removes the overlay before sending CANCEL", () => {
  const harness = createHarness();
  harness.startCapture();
  const host = harness.currentHost();

  harness.window.dispatchEvent(createEvent("keydown", { key: "Escape" }));

  const cancel = harness.outboundMessages.at(-1);
  const cancelSnapshot = harness.outboundSnapshots.at(-1);
  assert.equal(cancel.type, "CANCEL_OCR_CAPTURE");
  assert.equal(cancel.captureId, CAPTURE_ID);
  assert.equal(cancel.reason, "escape-key");
  assert.equal(host.isConnected, false);
  assert.equal(cancelSnapshot.hostConnected, false);
  assert.equal(cancelSnapshot.windowListenerCount, 0);
  assert.equal(cancelSnapshot.pendingTimerCount, 0);
});

test("a rejected SUBMIT response cleans up the overlay", async () => {
  const harness = createHarness({
    respondToBackground(message) {
      if (message.type === "SUBMIT_OCR_SELECTION") {
        return Promise.resolve({
          ok: false,
          error: { code: "OCR_CAPTURE_REJECTED", message: "rejected for test" },
        });
      }
      return Promise.resolve({ ok: true });
    },
  });
  harness.startCapture();
  const host = harness.currentHost();

  harness.dragSelection();
  await flushPromiseCallbacks();

  assert.equal(host.isConnected, false);
  assert.equal(harness.currentHost(), null);
  assert.equal(harness.window.listenerCount(), 0);
  assert.equal(harness.timers.size, 0);
  assert.equal(harness.outboundMessages.at(-1).type, "CANCEL_OCR_CAPTURE");
  assert.equal(harness.outboundMessages.at(-1).reason, "background-rejected");
});

test("invalid routing and capture identity cannot affect an active overlay", async (t) => {
  const cases = [
    {
      name: "wrong target",
      message: protocolMessage("OCR_CAPTURE_COMPLETE", {
        captureId: CAPTURE_ID,
        target: "not-the-background",
      }),
      sender: { id: EXTENSION_ID },
    },
    {
      name: "missing sender id",
      message: protocolMessage("OCR_CAPTURE_COMPLETE", { captureId: CAPTURE_ID }),
      sender: {},
    },
    {
      name: "missing capture id",
      message: protocolMessage("OCR_CAPTURE_COMPLETE"),
      sender: { id: EXTENSION_ID },
    },
    {
      name: "mismatched capture id",
      message: protocolMessage("OCR_CAPTURE_COMPLETE", { captureId: "capture-runtime-other" }),
      sender: { id: EXTENSION_ID },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const harness = createHarness();
      harness.startCapture();
      const host = harness.currentHost();

      harness.dispatchMessage(scenario.message, scenario.sender);

      assert.equal(host.isConnected, true);
      assert.equal(harness.currentHost(), host);
      assert.ok(harness.window.listenerCount() > 0);
      assert.equal(harness.timers.size, 1);
    });
  }
});

test("invalid BEGIN routing or identity is ignored", async (t) => {
  const cases = [
    {
      name: "wrong target",
      message: beginMessage({ target: "not-the-background" }),
      sender: { id: EXTENSION_ID },
    },
    {
      name: "missing sender id",
      message: beginMessage(),
      sender: {},
    },
    {
      name: "missing capture id",
      message: (() => {
        const message = beginMessage();
        delete message.captureId;
        return message;
      })(),
      sender: { id: EXTENSION_ID },
    },
    {
      name: "invalid document id",
      message: beginMessage({ documentId: "" }),
      sender: { id: EXTENSION_ID },
    },
    {
      name: "non-canonical source URL",
      message: beginMessage({
        sourceUrl: ["https:", "//example.test:443/problem"].join(""),
      }),
      sender: { id: EXTENSION_ID },
    },
    {
      name: "invalid expiry",
      message: beginMessage({ expiresAt: "not-an-expiry" }),
      sender: { id: EXTENSION_ID },
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const harness = createHarness();

      const result = harness.dispatchMessage(scenario.message, scenario.sender);

      assert.equal(result.responseCount, 0);
      assert.equal(harness.currentHost(), null);
      assert.equal(harness.window.listenerCount(), 0);
      assert.equal(harness.timers.size, 0);
    });
  }
});
