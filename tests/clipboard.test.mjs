import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  ClipboardError,
  readFromClipboard,
  writeToClipboard,
} from "../js/clipboard.js";

const originalNavigator = globalThis.navigator;
const originalDocument = globalThis.document;

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
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: originalDocument,
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

test("offscreen documentがfocusを持たない場合は権限付きpasteへ限定fallbackする", async () => {
  setNavigator({ clipboard: { readText: async () => { throw new Error("not focused"); } } });
  const textarea = {
    value: "",
    style: {},
    setAttribute() {},
    focus() {},
    remove() {},
  };
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      body: { append() {} },
      createElement: (name) => {
        assert.equal(name, "textarea");
        return textarea;
      },
      execCommand: (command) => {
        assert.equal(command, "paste");
        textarea.value = "3x=15";
        return true;
      },
    },
  });
  assert.equal(await readFromClipboard(), "3x=15");
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
