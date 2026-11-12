import assert from "node:assert/strict";
import test from "node:test";
import { createOcrClipboard } from "../desktop/services/ocr-clipboard.js";

test("desktop OCR clipboard reads only a stamp and delegates one guarded native write", async () => {
  const calls = [];
  let reply = "25:4660";
  const controller = new AbortController();
  const clipboard = createOcrClipboard({
    writeText: (text) => calls.push({ explicit: text }),
  }, {
    invoke: async (...args) => { calls.push(args); return reply; },
  });
  const stamp = await clipboard.captureStamp({ signal: controller.signal });
  assert.equal(stamp, "25:4660");
  reply = "changed";
  assert.equal(await clipboard.writeIfUnchanged(stamp, "5"), false);
  reply = "written";
  assert.equal(await clipboard.writeIfUnchanged(stamp, "5"), true);
  await clipboard.writeText("4+1");
  assert.deepEqual(calls, [
    [null, null, controller.signal], ["25:4660", "5"], ["25:4660", "5"], { explicit: "4+1" },
  ]);
});

test("desktop OCR clipboard rejects invalid stamps, aborted reads and invalid writes", async () => {
  let calls = 0;
  let reply = "0:0";
  const clipboard = createOcrClipboard({}, { invoke: async () => { calls++; return reply; } });
  await assert.rejects(clipboard.captureStamp(), /状態を確認/u);
  await assert.rejects(clipboard.captureStamp({ signal: AbortSignal.abort() }), { name: "AbortError" });
  await assert.rejects(clipboard.writeIfUnchanged(null, "5"), /正しくありません/u);
  await assert.rejects(clipboard.writeIfUnchanged("25:0", "5\0"), /正しくありません/u);
  assert.equal(calls, 1);
  reply = "";
  await assert.rejects(clipboard.writeIfUnchanged("25:0", "5"), /書き込めません/u);
});
