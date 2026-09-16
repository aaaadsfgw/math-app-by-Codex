import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createShortcutCommandCoordinator,
  supportsShortcutPageIntegration,
} from "../js/shortcut-command-coordinator.js";

const HTTP_PAGE = ["http:", "//example.test"].join("");
const HTTPS_PAGE = ["https:", "//example.test/problem"].join("");
const WRONG_HTTPS_PAGE = ["https:", "//wrong.test"].join("");

test("backgroundはcommandのtabを薄いcoordinatorへ渡し非Webを一律拒否しない", async () => {
  const source = await readFile(new URL("../js/background.js", import.meta.url), "utf8");
  assert.match(source, /createShortcutCommandCoordinator\(\{/u);
  assert.match(
    source,
    /chrome\.commands\.onCommand\.addListener\(\(command, tab\) => \{[\s\S]*?coordinateShortcut\(tab\)/u,
  );
  assert.doesNotMatch(source, /このページではショートカットを使用できません/u);
});

function successfulResult(source, action = "answer", historyError = null) {
  return {
    input: { source },
    action,
    clipboardOutput: "x=2",
    historyError,
  };
}

function createHarness({
  queryTab = null,
  queryError = null,
  selection = "",
  selectionError = null,
  clipboard = "2x=4",
  toastError = null,
  settings = { learningMode: "quick", shortcutAction: "answer" },
  workflow = null,
} = {}) {
  const calls = {
    queries: 0,
    selections: [],
    clipboardReads: 0,
    clipboardWrites: [],
    histories: [],
    toasts: [],
    workflows: [],
    warnings: [],
    errors: [],
  };
  const addHistory = async (payload) => {
    calls.histories.push(payload);
    return { id: "history-1", ...payload };
  };
  const defaultWorkflow = async (options) => {
    calls.workflows.push(options);
    const selected = String(await options.getSelectionText() || "").trim();
    const source = selected ? "selection" : "clipboard";
    if (!selected) await options.readClipboardText();
    await options.writeClipboardText("x=2");
    if (
      options.settings.learningMode === "study"
      && options.settings.saveHistory !== false
      && typeof options.addHistory === "function"
    ) {
      await options.addHistory({ source, action: options.settings.shortcutAction });
    }
    return successfulResult(source, options.settings.shortcutAction);
  };

  const coordinator = createShortcutCommandCoordinator({
    queryActiveTab: async () => {
      calls.queries += 1;
      if (queryError) throw queryError;
      return queryTab;
    },
    getSelectionText: async (tabId) => {
      calls.selections.push(tabId);
      if (selectionError) throw selectionError;
      return selection;
    },
    showToast: async (tabId, text, toastType) => {
      calls.toasts.push({ tabId, text, toastType });
      if (toastError) throw toastError;
      return true;
    },
    getSettings: async () => settings,
    runShortcutWorkflow: workflow ?? defaultWorkflow,
    readClipboardText: async () => {
      calls.clipboardReads += 1;
      return clipboard;
    },
    writeClipboardText: async (text) => {
      calls.clipboardWrites.push(text);
      return true;
    },
    addHistory,
    symbolicOperations: { simplify: async () => "unused" },
    logger: {
      warn: (...values) => calls.warnings.push(values),
      error: (...values) => calls.errors.push(values),
    },
  });
  return { calls, coordinator };
}

test("HTTP(S)タブだけをselection・toast利用可能として扱う", () => {
  assert.equal(supportsShortcutPageIntegration({ id: 1, url: HTTP_PAGE }), true);
  assert.equal(supportsShortcutPageIntegration({ id: 1, url: HTTPS_PAGE }), true);
  for (const tab of [
    { id: 1, url: "chrome://settings/" },
    { id: 1, url: "chrome-extension://extension-id/settings.html" },
    { id: 1, url: "devtools://devtools/bundled/devtools_app.html" },
    { id: 1, url: "file:///C:/problem.html" },
    { url: HTTPS_PAGE },
    null,
  ]) {
    assert.equal(supportsShortcutPageIntegration(tab), false, String(tab?.url));
  }
});

test("onCommandから渡されたHTTPタブをqueryより優先してselectionを解く", async () => {
  const invokingTab = { id: 41, url: HTTPS_PAGE };
  const { calls, coordinator } = createHarness({
    queryTab: { id: 99, url: WRONG_HTTPS_PAGE },
    selection: "2x=4",
  });

  const outcome = await coordinator(invokingTab);

  assert.equal(outcome.status, "success");
  assert.equal(outcome.tab, invokingTab);
  assert.equal(calls.queries, 0);
  assert.deepEqual(calls.selections, [41]);
  assert.equal(calls.clipboardReads, 0);
  assert.deepEqual(calls.clipboardWrites, ["x=2"]);
  assert.deepEqual(calls.toasts.map(({ toastType }) => toastType), ["loading", "success"]);
  assert.match(calls.toasts[1].text, /選択範囲から答えをコピー/u);
});

test("invoking tabがない場合だけquery結果をページ連携へ使う", async () => {
  const queriedTab = { id: 42, url: HTTPS_PAGE };
  const { calls, coordinator } = createHarness({ queryTab: queriedTab, selection: "2x=4" });

  const outcome = await coordinator();

  assert.equal(outcome.status, "success");
  assert.equal(outcome.tab, queriedTab);
  assert.equal(calls.queries, 1);
  assert.deepEqual(calls.selections, [42]);
});

test("HTTPタブのselection取得失敗はterminalにせずclipboardへfallbackする", async () => {
  const { calls, coordinator } = createHarness({
    selectionError: new Error("injection blocked"),
    clipboard: "2x=4",
  });

  const outcome = await coordinator({ id: 43, url: HTTPS_PAGE });

  assert.equal(outcome.status, "success");
  assert.equal(outcome.result.input.source, "clipboard");
  assert.deepEqual(calls.selections, [43]);
  assert.equal(calls.clipboardReads, 1);
  assert.deepEqual(calls.clipboardWrites, ["x=2"]);
  assert.equal(calls.warnings.some(([message]) => /selection/u.test(message)), true);
  assert.match(calls.toasts[1].text, /クリップボードから答えをコピー/u);
});

test("非HTTP・tabなしでは注入もtoastも試さずclipboard-onlyで完了する", async () => {
  for (const invokingTab of [
    { id: 51, url: "chrome://version/" },
    { id: 52, url: "chrome-extension://extension-id/settings.html" },
    { id: 53, url: "devtools://devtools/bundled/devtools_app.html" },
    null,
  ]) {
    const { calls, coordinator } = createHarness({ queryTab: null, clipboard: "2x=4" });
    const outcome = await coordinator(invokingTab);

    assert.equal(outcome.status, "success", String(invokingTab?.url));
    assert.equal(outcome.result.input.source, "clipboard", String(invokingTab?.url));
    assert.deepEqual(calls.selections, [], String(invokingTab?.url));
    assert.deepEqual(calls.toasts, [], String(invokingTab?.url));
    assert.equal(calls.clipboardReads, 1, String(invokingTab?.url));
    assert.deepEqual(calls.clipboardWrites, ["x=2"], String(invokingTab?.url));
  }
});

test("active tab query自体が失敗してもclipboard-onlyを継続する", async () => {
  const { calls, coordinator } = createHarness({
    queryError: new Error("no browser window"),
  });

  const outcome = await coordinator();

  assert.equal(outcome.status, "success");
  assert.equal(outcome.tab, null);
  assert.deepEqual(calls.selections, []);
  assert.deepEqual(calls.toasts, []);
  assert.equal(calls.clipboardReads, 1);
  assert.equal(calls.warnings.some(([message]) => /active tab/u.test(message)), true);
});

test("toast失敗はselection・clipboard・Study履歴の成功を反転させない", async () => {
  const { calls, coordinator } = createHarness({
    selection: "2x=4",
    toastError: new Error("page detached"),
    settings: { learningMode: "study", saveHistory: true, shortcutAction: "steps" },
  });

  const outcome = await coordinator({ id: 61, url: HTTPS_PAGE });

  assert.equal(outcome.status, "success");
  assert.deepEqual(calls.clipboardWrites, ["x=2"]);
  assert.deepEqual(calls.histories, [{ source: "selection", action: "steps" }]);
  assert.equal(calls.toasts.length, 2);
  assert.equal(calls.warnings.filter(([message]) => /toast/u.test(message)).length, 2);
});

test("workflow失敗はHTTPならerror toastを試し非HTTPならtoastなしで返す", async () => {
  for (const tab of [
    { id: 71, url: HTTPS_PAGE },
    { id: 72, url: "chrome://settings/" },
  ]) {
    const { calls, coordinator } = createHarness({
      workflow: async () => { throw new Error("unsupported input"); },
    });
    const outcome = await coordinator(tab);

    assert.equal(outcome.status, "error");
    assert.deepEqual(calls.clipboardWrites, []);
    assert.equal(calls.errors.length, 1);
    if (tab.url.startsWith("https:")) {
      assert.deepEqual(calls.toasts.map(({ toastType }) => toastType), ["loading", "error"]);
    } else {
      assert.deepEqual(calls.toasts, []);
    }
  }
});

test("global clipboardを守る単一lockは所有中の2回目をbusyで返す", async () => {
  let releaseWorkflow;
  let startedWorkflow;
  const started = new Promise((resolve) => { startedWorkflow = resolve; });
  const pending = new Promise((resolve) => { releaseWorkflow = resolve; });
  let workflowCalls = 0;
  const { calls, coordinator } = createHarness({
    workflow: async () => {
      workflowCalls += 1;
      startedWorkflow();
      return pending;
    },
  });
  const tab = { id: 81, url: HTTPS_PAGE };

  const first = coordinator(tab);
  await started;
  const second = await coordinator(tab);
  assert.equal(second.status, "busy");
  assert.equal(workflowCalls, 1);

  releaseWorkflow(successfulResult("selection"));
  const completed = await first;
  assert.equal(completed.status, "success");
  assert.equal(workflowCalls, 1);
  assert.deepEqual(calls.toasts.map(({ toastType }) => toastType), ["loading", "loading", "success"]);

  const third = await coordinator(tab);
  assert.equal(third.status, "success");
  assert.equal(workflowCalls, 2);
});
