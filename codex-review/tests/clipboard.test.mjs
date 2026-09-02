import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  ClipboardError,
  readFromClipboard,
  writeToClipboard,
} from "../js/clipboard.js";

const originalNavigator = globalThis.navigator;

function setNavigator(value) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value,
  });
}

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: originalNavigator,
  });
});

test("clipboardの問題文を内容を変えずに読む", async () => {
  setNavigator({ clipboard: { readText: async () => "  x+1=2  " } });
  assert.equal(await readFromClipboard(), "  x+1=2  ");
});

test("空clipboardと権限拒否を型付きエラーにする", async () => {
  setNavigator({ clipboard: { readText: async () => " \n " } });
  await assert.rejects(
    readFromClipboard(),
    (error) => error instanceof ClipboardError && error.code === "EMPTY_CLIPBOARD",
  );

  setNavigator({ clipboard: { readText: async () => { throw new Error("denied"); } } });
  await assert.rejects(
    readFromClipboard(),
    (error) => error instanceof ClipboardError && error.code === "READ_FAILED",
  );
});

test("空文字はclipboardへ書かない", async () => {
  let writes = 0;
  setNavigator({ clipboard: { writeText: async () => { writes += 1; } } });
  await assert.rejects(
    writeToClipboard("   "),
    (error) => error instanceof ClipboardError && error.code === "EMPTY_TEXT",
  );
  assert.equal(writes, 0);
});

test("有効な値だけclipboardへ書く", async () => {
  const values = [];
  setNavigator({ clipboard: { writeText: async (value) => values.push(value) } });
  assert.equal(await writeToClipboard("x=2"), true);
  assert.deepEqual(values, ["x=2"]);
});
