import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const helperPath = "js/selection-math-extractor.js";
const contentScriptPath = "js/content-script.js";
const expectedInjectionFiles = [helperPath, contentScriptPath];

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

function injectedFileLists(script) {
  const executeScriptCall = /chrome\.scripting\.executeScript\(\s*\{[\s\S]*?\bfiles\s*:\s*\[([^\]]*)\][\s\S]*?\}\s*\)/gu;
  return [...script.matchAll(executeScriptCall)].map((match) => (
    [...match[1].matchAll(/["']([^"']+)["']/gu)].map((entry) => entry[1])
  ));
}

function createContentScriptHarness({ helper, plainSelection = " x2 + 5x + 2 = 0 " } = {}) {
  let runtimeListener = null;

  class HTMLInputElement {}
  class HTMLTextAreaElement {}

  const context = vm.createContext({
    __mathStudyLogSelectionMathExtractor: helper,
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            runtimeListener = listener;
          },
        },
      },
    },
    console,
    document: { activeElement: {} },
    getSelection: () => ({ toString: () => plainSelection }),
    HTMLInputElement,
    HTMLTextAreaElement,
  });

  return {
    context,
    listener() {
      assert.equal(typeof runtimeListener, "function", "content script should register a listener");
      return runtimeListener;
    },
  };
}

function requestSelection(listener) {
  let response;
  const returnValue = listener({ type: "GET_SELECTION_TEXT" }, {}, (value) => {
    response = value;
  });
  assert.equal(returnValue, false);
  return {
    ok: response?.ok,
    text: response?.text,
    source: response?.source,
  };
}

test("backgroundとpopupは構造抽出helperをcontent scriptより先にオンデマンド注入する", async () => {
  const [background, popup, manifestSource] = await Promise.all([
    source("js/background.js"),
    source("js/popup.js"),
    source("manifest.json"),
  ]);

  assert.deepEqual(injectedFileLists(background), [expectedInjectionFiles]);
  assert.deepEqual(injectedFileLists(popup), [expectedInjectionFiles]);

  const manifest = JSON.parse(manifestSource);
  assert.equal(Object.hasOwn(manifest, "content_scripts"), false);
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("scripting"));
});

test("content scriptは構造抽出helperを使用する", async () => {
  let calls = 0;
  const harness = createContentScriptHarness({
    helper: {
      getSelectionText() {
        calls += 1;
        return "  x^2 + 1 = 0  ";
      },
    },
  });
  vm.runInContext(await source(contentScriptPath), harness.context, { filename: contentScriptPath });

  assert.deepEqual(requestSelection(harness.listener()), {
    ok: true,
    text: "x^2 + 1 = 0",
    source: "selection",
  });
  assert.equal(calls, 1);
});

test("構造抽出helperが失敗してもplain selectionを変更せず使用する", async () => {
  const harness = createContentScriptHarness({
    helper: {
      getSelectionText() {
        throw new Error("unusual DOM");
      },
    },
  });
  vm.runInContext(await source(contentScriptPath), harness.context, { filename: contentScriptPath });

  assert.deepEqual(requestSelection(harness.listener()), {
    ok: true,
    text: "x2 + 5x + 2 = 0",
    source: "selection",
  });
});
