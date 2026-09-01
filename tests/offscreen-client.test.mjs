import assert from "node:assert/strict";
import test from "node:test";

import {
  OffscreenHostError,
  ensureOffscreenDocument,
  runOffscreenRequest,
} from "../js/offscreen-client.js";

function fakeApi({ contexts = [], response = { ok: true, result: "value" } } = {}) {
  const calls = { create: [], messages: [] };
  const api = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      getContexts: async () => contexts,
      sendMessage: async (message) => {
        calls.messages.push(message);
        return response;
      },
    },
    offscreen: {
      createDocument: async (options) => calls.create.push(options),
    },
  };
  return { api, calls };
}

test("共有offscreen hostを必要時だけ作成する", async () => {
  const { api, calls } = fakeApi();
  await ensureOffscreenDocument(api);
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.create[0].reasons, ["WORKERS", "CLIPBOARD"]);

  const existing = fakeApi({ contexts: [{}] });
  await ensureOffscreenDocument(existing.api);
  assert.equal(existing.calls.create.length, 0);
});

test("型付き要求をoffscreen hostへ送り結果を返す", async () => {
  const { api, calls } = fakeApi({ response: { ok: true, result: "x=2" } });
  const result = await runOffscreenRequest(
    "READ_CLIPBOARD_TEXT",
    { sample: true },
    { extensionApi: api },
  );
  assert.equal(result, "x=2");
  assert.deepEqual(calls.messages[0], {
    target: "math-study-log-offscreen",
    type: "READ_CLIPBOARD_TEXT",
    sample: true,
  });
});

test("offscreen hostのエラーコードを保持する", async () => {
  const { api } = fakeApi({
    response: { ok: false, error: { code: "READ_FAILED", message: "拒否" } },
  });
  await assert.rejects(
    runOffscreenRequest("READ_CLIPBOARD_TEXT", {}, { extensionApi: api }),
    (error) => error instanceof OffscreenHostError
      && error.code === "READ_FAILED"
      && error.message === "拒否",
  );
});

test("応答しないoffscreen hostをtimeoutにする", async () => {
  const { api } = fakeApi();
  api.runtime.sendMessage = () => new Promise(() => {});
  await assert.rejects(
    runOffscreenRequest("READ_CLIPBOARD_TEXT", {}, { extensionApi: api, timeoutMs: 5 }),
    (error) => error.code === "OFFSCREEN_TIMEOUT",
  );
});
