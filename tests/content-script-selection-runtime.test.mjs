import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const contentScriptUrl = new URL("../js/content-script.js", import.meta.url);
const contentScriptSource = await readFile(contentScriptUrl, "utf8");

class FakeElement {}

class FakeInputElement extends FakeElement {
  constructor({
    type = "text",
    value = "",
    selectionStart = 0,
    selectionEnd = selectionStart,
  } = {}) {
    super();
    this.type = type;
    this.value = value;
    this.selectionStart = selectionStart;
    this.selectionEnd = selectionEnd;
  }
}

class FakeTextAreaElement extends FakeElement {
  constructor({
    value = "",
    selectionStart = 0,
    selectionEnd = selectionStart,
  } = {}) {
    super();
    this.value = value;
    this.selectionStart = selectionStart;
    this.selectionEnd = selectionEnd;
  }
}

function createHarness({
  activeElement = new FakeElement(),
  helper,
  pageSelection = "",
} = {}) {
  let runtimeListener = null;
  const document = {
    activeElement,
    documentElement: { appendChild() {} },
    getElementById: () => null,
  };
  const chrome = {
    runtime: {
      onMessage: {
        addListener(listener) {
          runtimeListener = listener;
        },
      },
    },
  };
  const context = vm.createContext({
    HTMLInputElement: FakeInputElement,
    HTMLTextAreaElement: FakeTextAreaElement,
    chrome,
    console,
    document,
    getSelection: () => ({ toString: () => pageSelection }),
    navigator: {},
  });
  if (helper !== undefined) {
    context.__mathStudyLogSelectionMathExtractor = helper;
  }

  vm.runInContext(contentScriptSource, context, { filename: contentScriptUrl.pathname });
  assert.equal(typeof runtimeListener, "function", "content script should register a listener");

  function getSelectionResponse(type = "GET_SELECTION_TEXT") {
    let response;
    let responseCount = 0;
    const returnValue = runtimeListener({ type }, {}, (value) => {
      response = value;
      responseCount += 1;
    });
    assert.equal(returnValue, false);
    assert.equal(responseCount, 1);
    return response;
  }

  return { context, getSelectionResponse };
}

function assertSelectionResponse(response, { text, source }) {
  assert.equal(response?.ok, true);
  assert.equal(response?.text, text);
  assert.equal(response?.source, source);
}

test("GET_SELECTION_TEXTは構造抽出helperの結果を優先する", () => {
  let calls = 0;
  const harness = createHarness({
    helper: {
      getSelectionText() {
        calls += 1;
        return "  2*x^2+5*x+2=0  ";
      },
    },
    pageSelection: "2x2 + 5x + 2 = 0",
  });

  assertSelectionResponse(harness.getSelectionResponse(), {
    text: "2*x^2+5*x+2=0",
    source: "selection",
  });
  assert.equal(calls, 1);
});

test("helperがない場合もinputとtextareaの選択範囲を維持する", async (t) => {
  const cases = [
    {
      name: "input",
      activeElement: new FakeInputElement({
        type: "search",
        value: "before  x2 + 5x  after",
        selectionStart: 8,
        selectionEnd: 17,
      }),
      expected: "x2 + 5x",
    },
    {
      name: "textarea",
      activeElement: new FakeTextAreaElement({
        value: "line 1\n  x_1 + x_2  \nline 3",
        selectionStart: 9,
        selectionEnd: 20,
      }),
      expected: "x_1 + x_2",
    },
  ];

  for (const scenario of cases) {
    await t.test(scenario.name, () => {
      const harness = createHarness({
        activeElement: scenario.activeElement,
        pageSelection: "page selection must not win",
      });
      assertSelectionResponse(harness.getSelectionResponse(), {
        text: scenario.expected,
        source: "selection",
      });
    });
  }
});

test("空選択はnoneとして返す", () => {
  const harness = createHarness({ pageSelection: "  \n  " });

  assertSelectionResponse(harness.getSelectionResponse(), {
    text: "",
    source: "none",
  });
});

test("password inputはページ選択があっても除外する", () => {
  const harness = createHarness({
    activeElement: new FakeInputElement({
      type: "password",
      value: "secret expression",
      selectionStart: 0,
      selectionEnd: 17,
    }),
    pageSelection: "x^2=1",
  });

  assertSelectionResponse(harness.getSelectionResponse(), {
    text: "",
    source: "none",
  });
});

test("helperの例外時は従来のplain page selectionへ安全にfallbackする", () => {
  const harness = createHarness({
    helper: {
      getSelectionText() {
        throw new Error("unusual DOM");
      },
    },
    pageSelection: "  x2 + 5x + 2 = 0  ",
  });

  assertSelectionResponse(harness.getSelectionResponse(), {
    text: "x2 + 5x + 2 = 0",
    source: "selection",
  });
});
