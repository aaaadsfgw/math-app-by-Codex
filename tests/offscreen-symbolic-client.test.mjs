import assert from "node:assert/strict";
import test from "node:test";

import {
  ensureSymbolicOffscreenDocument,
  runOffscreenSymbolicOperation,
} from "../js/math-core/offscreen-symbolic-client.js";

function fakeExtensionApi({
  contexts = [],
  response = { ok: true, result: "x^2-1" },
} = {}) {
  const calls = {
    create: [],
    contexts: [],
    messages: [],
  };
  const api = {
    runtime: {
      getURL: (path) => `chrome-extension://test/${path}`,
      getContexts: async (query) => {
        calls.contexts.push(query);
        return contexts;
      },
      sendMessage: async (message) => {
        calls.messages.push(message);
        return response;
      },
    },
    offscreen: {
      createDocument: async (options) => {
        calls.create.push(options);
      },
    },
  };
  return { api, calls };
}

test("既存文書がなければWORKERS理由でオフスクリーン文書を作る", async () => {
  const { api, calls } = fakeExtensionApi();
  await ensureSymbolicOffscreenDocument(api);
  assert.equal(calls.create.length, 1);
  assert.deepEqual(calls.create[0], {
    url: "offscreen.html",
    reasons: ["WORKERS"],
    justification: "Run bounded offline symbolic calculations in a disposable worker.",
  });
});

test("既存オフスクリーン文書を再利用する", async () => {
  const { api, calls } = fakeExtensionApi({
    contexts: [{ contextType: "OFFSCREEN_DOCUMENT" }],
  });
  await ensureSymbolicOffscreenDocument(api);
  assert.equal(calls.create.length, 0);
});

test("サービスワーカーから隔離記号計算へ要求を中継する", async () => {
  const { api, calls } = fakeExtensionApi();
  const result = await runOffscreenSymbolicOperation("expand", ["(x+1)*(x-1)"], {
    extensionApi: api,
    timeoutMs: 1_500,
  });
  assert.equal(result, "x^2-1");
  assert.deepEqual(calls.messages[0], {
    target: "symbolic-offscreen",
    type: "RUN_SYMBOLIC_OPERATION",
    operation: "expand",
    args: ["(x+1)*(x-1)"],
    timeoutMs: 1_500,
  });
});

test("オフスクリーン側の型付きエラーを呼び出し元へ戻す", async () => {
  const { api } = fakeExtensionApi({
    response: {
      ok: false,
      error: { code: "SYMBOLIC_TIMEOUT", message: "期限超過" },
    },
  });
  await assert.rejects(
    runOffscreenSymbolicOperation("factor", ["x^2-1"], { extensionApi: api }),
    (error) => error.code === "SYMBOLIC_TIMEOUT" && error.message === "期限超過",
  );
});
