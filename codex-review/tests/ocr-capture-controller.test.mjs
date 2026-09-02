import assert from "node:assert/strict";
import test from "node:test";

import {
  CREATE_OCR_CAPTURE_PREVIEW,
  createOcrCaptureController,
  createOcrCaptureRuntimeListener,
  DISCARD_OCR_CAPTURE_PREVIEW,
  isOcrCaptureRuntimeMessage,
} from "../js/ocr/capture-controller.js";
import { createOcrCaptureSessionStore } from "../js/ocr/capture-session-store.js";

const PAGE_URL = ["https:", "//example.invalid/problem"].join("");
const EXTENSION_ORIGIN = ["chrome-extension:", "//test-extension"].join("");
const NOW = Date.parse("2026-09-02T00:00:00.000Z");

function message(type, extra = {}) {
  return { target: "math-study-log-background", protocolVersion: 1, type, ...extra };
}

function memoryStorage() {
  const values = {};
  return {
    values,
    async get(key) {
      return Object.hasOwn(values, key) ? { [key]: structuredClone(values[key]) } : {};
    },
    async set(update) {
      Object.assign(values, structuredClone(update));
    },
    async remove(key) {
      delete values[key];
    },
  };
}

function fakeEnvironment({
  activeUrl = PAGE_URL,
  failPreviewTabTransition = false,
  failPreviewCreation = false,
  previewMetadataPatch = null,
} = {}) {
  let clock = NOW;
  const calls = {
    queries: [],
    injections: [],
    tabMessages: [],
    captures: [],
    creates: [],
    gets: [],
    removes: [],
    offscreen: [],
  };
  const activeTab = { id: 12, windowId: 4, url: activeUrl };
  const activationListeners = new Set();
  const previews = new Map();
  const api = {
    runtime: {
      id: "test-extension",
      getURL: (path) => `${EXTENSION_ORIGIN}/${String(path).replace(/^\//u, "")}`,
    },
    tabs: {
      onActivated: {
        addListener(listener) { activationListeners.add(listener); },
        removeListener(listener) { activationListeners.delete(listener); },
      },
      async query(query) {
        calls.queries.push(query);
        return [{ ...activeTab }];
      },
      async sendMessage(tabId, payload, options) {
        calls.tabMessages.push({ tabId, payload, options });
        if (payload.type === "BEGIN_OCR_SELECTION") {
          return { ok: true, captureId: payload.captureId };
        }
        if (payload.type === "PREPARE_OCR_SCREENSHOT") {
          return {
            ok: true,
            protocolVersion: 1,
            captureId: payload.captureId,
            selection: { x: 10, y: 20, width: 80, height: 40 },
            viewport: { width: 800, height: 600, devicePixelRatio: 2 },
          };
        }
        return { ok: true };
      },
      async captureVisibleTab(windowId, options) {
        calls.captures.push({ windowId, options });
        return "data:image/png;base64,AA==";
      },
      async create(options) {
        calls.creates.push(options);
        return { id: 99, ...options };
      },
      async get(tabId) {
        calls.gets.push(tabId);
        return { id: tabId, windowId: 4 };
      },
      async remove(tabId) {
        calls.removes.push(tabId);
      },
    },
    scripting: {
      async executeScript(options) {
        calls.injections.push(options);
        return [{ frameId: 0, documentId: "document-1" }];
      },
    },
    storage: { session: memoryStorage() },
  };
  const runOffscreenRequest = async (type, payload) => {
    calls.offscreen.push({ type, payload });
    if (type === CREATE_OCR_CAPTURE_PREVIEW) {
      if (failPreviewCreation) throw new Error("preview crop failed");
      const preview = {
        previewId: payload.previewId,
        previewUrl: "blob:preview-1",
        source: { width: 1600, height: 1200 },
        crop: { width: 160, height: 80 },
        expiresAt: new Date(clock + 120_000).toISOString(),
        ...(previewMetadataPatch ?? {}),
      };
      previews.set(payload.previewId, preview);
      return preview;
    }
    if (type === "GET_OCR_CAPTURE_PREVIEW") return previews.get(payload.previewId);
    if (type === DISCARD_OCR_CAPTURE_PREVIEW) {
      return previews.delete(payload.previewId);
    }
    throw new Error(`unexpected offscreen type: ${type}`);
  };
  const baseStore = createOcrCaptureSessionStore({
    storageArea: api.storage.session,
    now: () => clock,
  });
  const store = failPreviewTabTransition
    ? Object.freeze({
        get: (...args) => baseStore.get(...args),
        replace: (...args) => baseStore.replace(...args),
        clear: (...args) => baseStore.clear(...args),
        transition(args) {
          if (Object.hasOwn(args?.patch ?? {}, "previewTabId")) {
            throw new Error("preview tab metadata write failed");
          }
          return baseStore.transition(args);
        },
      })
    : baseStore;
  const controller = createOcrCaptureController({
    extensionApi: api,
    sessionStore: store,
    runOffscreenRequest,
    now: () => clock,
    createCaptureId: () => "capture-1",
  });
  return {
    api,
    calls,
    activeTab,
    previews,
    store,
    controller,
    runOffscreenRequest,
    emitActivation(activeInfo) {
      for (const listener of activationListeners) listener(activeInfo);
    },
    setClock(value) { clock = value; },
  };
}

function popupSender() {
  return { id: "test-extension", url: `${EXTENSION_ORIGIN}/popup.html` };
}

function contentSender(overrides = {}) {
  return {
    id: "test-extension",
    url: PAGE_URL,
    frameId: 0,
    documentId: "document-1",
    tab: { id: 12, windowId: 4, url: PAGE_URL },
    ...overrides,
  };
}

function confirmationSender(captureId = "capture-1") {
  return {
    id: "test-extension",
    url: `${EXTENSION_ORIGIN}/ocr-confirm.html?captureId=${captureId}`,
    tab: { id: 99, windowId: 4 },
  };
}

async function start(environment) {
  return environment.controller.handleMessage(message("START_OCR_CAPTURE"), popupSender());
}

async function submit(environment) {
  return environment.controller.handleMessage(message("SUBMIT_OCR_SELECTION", {
    captureId: "capture-1",
    selection: { x: 10, y: 20, width: 80, height: 40 },
    viewport: { width: 800, height: 600, devicePixelRatio: 2 },
  }), contentSender());
}

test("popupからだけmain frameへ範囲選択overlayを開始する", async () => {
  const environment = fakeEnvironment();
  const result = await start(environment);

  assert.deepEqual(result, {
    captureId: "capture-1",
    expiresAt: "2026-09-02T00:02:00.000Z",
    phase: "selecting",
  });
  assert.deepEqual(environment.calls.injections, [{
    target: { tabId: 12, frameIds: [0] },
    files: ["js/ocr/capture-overlay.js"],
  }]);
  assert.equal(environment.calls.tabMessages[0].payload.type, "BEGIN_OCR_SELECTION");
  assert.deepEqual(await environment.store.get(), {
    protocolVersion: 1,
    captureId: "capture-1",
    phase: "selecting",
    expiresAt: "2026-09-02T00:02:00.000Z",
    tabId: 12,
    windowId: 4,
    frameId: 0,
    documentId: "document-1",
    sourceUrl: PAGE_URL,
  });
});

test("外部ページsenderとHTTP(S)以外のactive tabを拒否する", async () => {
  const foreign = fakeEnvironment();
  await assert.rejects(
    foreign.controller.handleMessage(message("START_OCR_CAPTURE"), {
      id: "test-extension",
      url: PAGE_URL,
    }),
    (error) => error.code === "OCR_CAPTURE_SENDER_REJECTED",
  );

  const unsupported = fakeEnvironment({ activeUrl: "chrome://settings/" });
  await assert.rejects(
    start(unsupported),
    (error) => error.code === "OCR_CAPTURE_PAGE_UNSUPPORTED",
  );
  assert.equal(unsupported.calls.injections.length, 0);
});

test("選択を隠してからactive tabを再確認し一度だけPNG captureする", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  const result = await submit(environment);

  assert.deepEqual(result, {
    captureId: "capture-1",
    phase: "preview",
    crop: { width: 160, height: 80 },
  });
  assert.deepEqual(environment.calls.captures, [{ windowId: 4, options: { format: "png" } }]);
  assert.equal(environment.calls.offscreen[0].type, CREATE_OCR_CAPTURE_PREVIEW);
  assert.equal(environment.calls.offscreen[0].payload.screenshotDataUrl.startsWith("data:image/png"), true);
  assert.equal(environment.calls.tabMessages.at(-1).payload.type, "OCR_CAPTURE_COMPLETE");
  assert.match(environment.calls.creates[0].url, /ocr-confirm\.html\?captureId=capture-1$/u);
  assert.equal(environment.calls.creates[0].windowId, 4);
  const stored = await environment.store.get();
  assert.equal(stored.phase, "preview");
  assert.equal(stored.previewTabId, 99);
  assert.equal(Object.hasOwn(stored, "screenshotDataUrl"), false);
  assert.equal(Object.hasOwn(stored, "previewUrl"), false);
});

test("同時STARTは一件だけをoverlay開始へ進める", async () => {
  const environment = fakeEnvironment();
  const results = await Promise.allSettled([start(environment), start(environment)]);

  assert.deepEqual(results.map(({ status }) => status).sort(), ["fulfilled", "rejected"]);
  const rejected = results.find(({ status }) => status === "rejected");
  assert.equal(rejected.reason.code, "OCR_CAPTURE_ALREADY_STARTING");
  assert.equal(environment.calls.injections.length, 1);
  assert.equal((await environment.store.get()).phase, "selecting");
});

test("submit処理中の新しいSTARTは既存captureを置き換えない", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  let releasePrepare;
  const prepareGate = new Promise((resolve) => { releasePrepare = resolve; });
  const originalSend = environment.api.tabs.sendMessage;
  environment.api.tabs.sendMessage = async (...args) => {
    if (args[1].type === "PREPARE_OCR_SCREENSHOT") await prepareGate;
    return originalSend(...args);
  };

  const inFlight = submit(environment);
  await assert.rejects(
    start(environment),
    (error) => error.code === "OCR_CAPTURE_BUSY",
  );
  releasePrepare();
  await inFlight;

  assert.equal(environment.calls.injections.length, 1);
  assert.equal(environment.calls.captures.length, 1);
  assert.equal((await environment.store.get()).phase, "preview");
});

test("senderのtab、frame、document、URLが一致しなければcaptureしない", async () => {
  for (const sender of [
    contentSender({ frameId: 2 }),
    contentSender({ documentId: "document-2" }),
    contentSender({ tab: { id: 13, windowId: 4, url: PAGE_URL } }),
    contentSender({ url: ["https:", "//example.invalid/other"].join("") }),
  ]) {
    const environment = fakeEnvironment();
    await start(environment);
    await assert.rejects(
      environment.controller.handleMessage(message("SUBMIT_OCR_SELECTION", {
        captureId: "capture-1",
        selection: { x: 10, y: 20, width: 80, height: 40 },
        viewport: { width: 800, height: 600, devicePixelRatio: 2 },
      }), sender),
      (error) => error.code === "OCR_CAPTURE_SENDER_MISMATCH",
    );
    assert.equal(environment.calls.captures.length, 0);
    assert.equal((await environment.store.get()).phase, "selecting");
  }
});

test("active tabが切り替わった場合はcaptureせずoverlayとsessionを片付ける", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  environment.activeTab.id = 13;
  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_TAB_CHANGED",
  );
  assert.equal(environment.calls.captures.length, 0);
  assert.equal(await environment.store.get(), null);
  assert.equal(environment.calls.tabMessages.at(-1).payload.type, "CANCEL_OCR_CAPTURE");
});

test("capture中だけ別tabへ切り替えて戻しても画像を採用しない", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  const originalCapture = environment.api.tabs.captureVisibleTab;
  environment.api.tabs.captureVisibleTab = async (...args) => {
    environment.emitActivation({ windowId: 4, tabId: 13 });
    environment.emitActivation({ windowId: 4, tabId: 12 });
    return originalCapture(...args);
  };

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_TAB_CHANGED_DURING_SCREENSHOT",
  );
  assert.equal(environment.calls.captures.length, 1);
  assert.equal(environment.calls.offscreen.length, 0);
  assert.equal(await environment.store.get(), null);
});

test("capture中の同一URL reloadは元documentへの完了確認で拒否する", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  const originalSend = environment.api.tabs.sendMessage;
  environment.api.tabs.sendMessage = async (...args) => {
    if (args[1].type === "OCR_CAPTURE_COMPLETE") throw new Error("No matching document");
    return originalSend(...args);
  };

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_DOCUMENT_CHANGED",
  );
  assert.equal(environment.calls.offscreen.length, 0);
  assert.equal(await environment.store.get(), null);
});

test("選択中にsession期限が切れてもoverlayとmetadataを残さない", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  environment.setClock(NOW + 120_001);

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_SESSION_EXPIRED",
  );
  assert.equal(await environment.store.get(), null);
  assert.equal(environment.calls.captures.length, 0);
  assert.equal(environment.calls.tabMessages.at(-1).payload.type, "CANCEL_OCR_CAPTURE");
});

test("同じselectionの二重送信は1件だけをcaptureへ進める", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  let releasePrepare;
  const gate = new Promise((resolve) => { releasePrepare = resolve; });
  const originalSend = environment.api.tabs.sendMessage;
  environment.api.tabs.sendMessage = async (...args) => {
    if (args[1].type === "PREPARE_OCR_SCREENSHOT") await gate;
    return originalSend(...args);
  };

  const first = submit(environment);
  await Promise.resolve();
  const second = submit(environment);
  releasePrepare();
  const results = await Promise.allSettled([first, second]);

  assert.deepEqual(results.map(({ status }) => status).sort(), ["fulfilled", "rejected"]);
  assert.equal(environment.calls.captures.length, 1);
});

test("PREPARE拒否はscreenshotを撮らずoverlayとsessionを片付ける", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  const originalSend = environment.api.tabs.sendMessage;
  environment.api.tabs.sendMessage = async (...args) => {
    if (args[1].type === "PREPARE_OCR_SCREENSHOT") return { ok: false };
    return originalSend(...args);
  };

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_PREPARE_FAILED",
  );
  assert.equal(environment.calls.captures.length, 0);
  assert.equal(environment.calls.offscreen.length, 0);
  assert.equal(await environment.store.get(), null);
});

test("captureVisibleTab失敗はpreviewを作らずsessionを片付ける", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  environment.api.tabs.captureVisibleTab = async (windowId, options) => {
    environment.calls.captures.push({ windowId, options });
    throw new Error("capture failed");
  };

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_SCREENSHOT_FAILED",
  );
  assert.equal(environment.calls.captures.length, 1);
  assert.equal(environment.calls.offscreen.length, 0);
  assert.equal(await environment.store.get(), null);
});

test("offscreen crop失敗は確認tabとsessionを作らない", async () => {
  const environment = fakeEnvironment({ failPreviewCreation: true });
  await start(environment);

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_SCREENSHOT_FAILED",
  );
  assert.equal(environment.calls.creates.length, 0);
  assert.equal(environment.previews.size, 0);
  assert.equal(await environment.store.get(), null);
});

test("不正なpreview metadataはpreviewを破棄して確認tabを開かない", async () => {
  const environment = fakeEnvironment({
    previewMetadataPatch: { expiresAt: "not-an-expiry" },
  });
  await start(environment);

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_PREVIEW_INVALID",
  );
  assert.equal(environment.calls.creates.length, 0);
  assert.equal(environment.previews.size, 0);
  assert.equal(await environment.store.get(), null);
});

test("preview作成時に確認用の2分期限を新しく開始する", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  environment.setClock(NOW + 119_000);
  await submit(environment);

  assert.equal(
    (await environment.store.get()).expiresAt,
    "2026-09-02T00:03:59.000Z",
  );
});

test("確認tab作成後のmetadata保存失敗は孤児tabとpreviewを残さない", async () => {
  const environment = fakeEnvironment({ failPreviewTabTransition: true });
  await start(environment);

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_SCREENSHOT_FAILED",
  );
  assert.deepEqual(environment.calls.removes, [99]);
  assert.equal(environment.previews.size, 0);
  assert.equal(await environment.store.get(), null);
});

test("確認tabがID保存直後に消えた場合もpreviewとsessionを残さない", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  environment.api.tabs.get = async (tabId) => {
    environment.calls.gets.push(tabId);
    throw new Error("No tab with id");
  };

  await assert.rejects(
    submit(environment),
    (error) => error.code === "OCR_CAPTURE_SCREENSHOT_FAILED",
  );
  assert.deepEqual(environment.calls.gets, [99]);
  assert.deepEqual(environment.calls.removes, [99]);
  assert.equal(environment.previews.size, 0);
  assert.equal(await environment.store.get(), null);
});

test("利用者のcancelはoverlay通知を重複せずsessionを消す", async () => {
  const environment = fakeEnvironment();
  await start(environment);

  const result = await environment.controller.handleMessage(
    message("CANCEL_OCR_CAPTURE", { captureId: "capture-1", reason: "escape" }),
    contentSender(),
  );
  assert.deepEqual(result, { cancelled: true });
  assert.equal(await environment.store.get(), null);
  assert.equal(environment.calls.captures.length, 0);
  assert.equal(
    environment.calls.tabMessages.filter(({ payload }) => payload.type === "CANCEL_OCR_CAPTURE").length,
    0,
  );
});

test("確認ページだけがpreviewを取得・破棄でき、OCRはunavailableのまま", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  await submit(environment);

  await assert.rejects(
    environment.controller.handleMessage(message("GET_OCR_CAPTURE_PREVIEW", {
      captureId: "capture-1",
    }), popupSender()),
    (error) => error.code === "OCR_CAPTURE_SENDER_REJECTED",
  );

  const preview = await environment.controller.handleMessage(
    message("GET_OCR_CAPTURE_PREVIEW", { captureId: "capture-1" }),
    confirmationSender(),
  );
  assert.equal(preview.previewUrl, "blob:preview-1");
  assert.equal(preview.expiresAt, "2026-09-02T00:02:00.000Z");
  assert.equal(preview.candidateText, "");
  assert.equal(preview.availability.available, false);
  assert.equal(preview.availability.code, "OCR_LICENSE_GATE");

  const discarded = await environment.controller.handleMessage(
    message("DISCARD_OCR_CAPTURE", { captureId: "capture-1" }),
    confirmationSender(),
  );
  assert.deepEqual(discarded, { discarded: true });
  assert.equal(await environment.store.get(), null);
  assert.equal(environment.previews.size, 0);
});

test("期限後の破棄はidempotent成功として確認ページを閉じられる", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  await submit(environment);
  environment.setClock(NOW + 120_001);

  const discarded = await environment.controller.handleMessage(
    message("DISCARD_OCR_CAPTURE", { captureId: "capture-1" }),
    confirmationSender(),
  );
  assert.deepEqual(discarded, { discarded: false, alreadyFinished: true });
  assert.equal(await environment.store.get(), null);
  assert.equal(environment.previews.size, 0);
});

test("確認tabを手動で閉じるとpreviewとsessionを即時破棄する", async () => {
  const environment = fakeEnvironment();
  await start(environment);
  await submit(environment);

  assert.equal(await environment.controller.handleTabRemoved(98), false);
  assert.equal(await environment.controller.handleTabRemoved(99), true);
  assert.equal(await environment.store.get(), null);
  assert.equal(environment.previews.size, 0);
});

test("選択中の元tabを閉じるとsessionを即時破棄する", async () => {
  const environment = fakeEnvironment();
  await start(environment);

  assert.equal(await environment.controller.handleTabRemoved(12), true);
  assert.equal(await environment.store.get(), null);
});

test("runtime listenerは対象messageだけを非同期応答へ変換する", async () => {
  assert.equal(isOcrCaptureRuntimeMessage({ type: "unrelated" }), false);
  const responses = [];
  const listener = createOcrCaptureRuntimeListener({
    async handleMessage(value) {
      return { accepted: value.type };
    },
  });
  assert.equal(listener({ type: "unrelated" }, {}, () => {}), false);
  assert.equal(listener(message("START_OCR_CAPTURE"), popupSender(), (value) => responses.push(value)), true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(responses, [{ ok: true, result: { accepted: "START_OCR_CAPTURE" } }]);
});
