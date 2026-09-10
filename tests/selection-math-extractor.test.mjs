import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

import { runShortcutWorkflow, ShortcutWorkflowError } from "../js/shortcut-workflow.js";
import { solveQuestion } from "../js/solver/index.js";

const extractorUrl = new URL("../js/selection-math-extractor.js", import.meta.url);
const extractorSource = await readFile(extractorUrl, "utf8");
const MATHML_NAMESPACE = ["http:", "//www.w3.org/1998/Math/MathML"].join("");

class FakeText {
  constructor(data) {
    this.nodeType = 3;
    this.data = String(data);
    this.nodeValue = this.data;
    this.parentNode = null;
    this.__start = 0;
    this.__end = 0;
  }
}

class FakeElement {
  constructor(name, attributes = {}, children = []) {
    this.nodeType = 1;
    this.localName = name.toLowerCase();
    this.tagName = name.toUpperCase();
    this.namespaceURI = attributes.namespaceURI || null;
    this.attributes = new Map();
    this.childNodes = [];
    this.parentNode = null;
    this.className = attributes.class || "";
    this.type = attributes.type || "";
    this.value = attributes.value || "";
    this.selectionStart = attributes.selectionStart ?? 0;
    this.selectionEnd = attributes.selectionEnd ?? 0;
    this.__start = 0;
    this.__end = 0;
    for (const [key, value] of Object.entries(attributes)) {
      if (!["namespaceURI", "selectionStart", "selectionEnd", "value"].includes(key)) {
        this.attributes.set(key, String(value));
      }
    }
    this.append(...children);
  }

  append(...children) {
    for (const child of children) {
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }
}

class FakeDocument {
  constructor(activeElement = html("div")) {
    this.activeElement = activeElement;
  }
}

class FakeRange {
  constructor(root, startContainer, startOffset, endContainer, endOffset) {
    indexTree(root);
    this.startContainer = startContainer;
    this.startOffset = startOffset;
    this.endContainer = endContainer;
    this.endOffset = endOffset;
    this.__start = boundaryPosition(startContainer, startOffset);
    this.__end = boundaryPosition(endContainer, endOffset);
    this.commonAncestorContainer = commonAncestor(startContainer, endContainer);
    this.collapsed = this.__start === this.__end;
  }

  intersectsNode(node) {
    return this.__start < node.__end && this.__end > node.__start;
  }

  comparePoint(node, offset) {
    const point = boundaryPosition(node, offset);
    if (point < this.__start) return -1;
    if (point > this.__end) return 1;
    return 0;
  }
}

class FakeSelection {
  constructor(range, plainText) {
    this.range = range;
    this.rangeCount = range ? 1 : 0;
    this.isCollapsed = !range || range.collapsed;
    this.plainText = plainText;
  }

  getRangeAt(index) {
    if (index !== 0 || !this.range) throw new RangeError("range unavailable");
    return this.range;
  }

  toString() {
    return this.plainText;
  }
}

function text(value) {
  return new FakeText(value);
}

function html(name, attributes = {}, ...children) {
  return new FakeElement(name, attributes, children.flat());
}

function math(name, ...children) {
  return new FakeElement(name, { namespaceURI: MATHML_NAMESPACE }, children.flat());
}

function indexTree(root) {
  let cursor = 0;
  function visit(node) {
    node.__start = cursor;
    if (node.nodeType === 3) cursor += node.data.length;
    else for (const child of node.childNodes) visit(child);
    node.__end = cursor;
  }
  visit(root);
}

function boundaryPosition(node, offset) {
  if (node.nodeType === 3) {
    return node.__start + Math.max(0, Math.min(node.data.length, offset));
  }
  if (offset <= 0 || node.childNodes.length === 0) return node.__start;
  if (offset >= node.childNodes.length) return node.__end;
  return node.childNodes[offset].__start;
}

function commonAncestor(left, right) {
  const ancestors = new Set();
  for (let node = left; node; node = node.parentNode) ancestors.add(node);
  for (let node = right; node; node = node.parentNode) {
    if (ancestors.has(node)) return node;
  }
  return null;
}

function textLeaves(root) {
  if (root.nodeType === 3) return [root];
  return root.childNodes.flatMap(textLeaves);
}

function fullSelection(root, plainText) {
  const leaves = textLeaves(root).filter((leaf) => leaf.data.length > 0);
  const first = leaves[0];
  const last = leaves.at(-1);
  return new FakeSelection(
    new FakeRange(root, first, 0, last, last.data.length),
    plainText,
  );
}

function selectionBetween(root, startNode, startOffset, endNode, endOffset, plainText) {
  return new FakeSelection(
    new FakeRange(root, startNode, startOffset, endNode, endOffset),
    plainText,
  );
}

function loadExtractor() {
  const context = vm.createContext({ console });
  vm.runInContext(extractorSource, context, { filename: extractorUrl.pathname });
  const api = context.__mathStudyLogSelectionMathExtractor;
  assert.equal(typeof api?.getSelectionText, "function");
  return api;
}

const extractor = loadExtractor();

function extract(root, plainText, selection = fullSelection(root, plainText)) {
  return extractor.getSelectionText({
    documentObject: new FakeDocument(),
    selection,
  });
}

function mi(value) {
  return math("mi", text(value));
}

function mn(value) {
  return math("mn", text(value));
}

function mo(value) {
  return math("mo", text(value));
}

function msup(base, exponent) {
  return math("msup", base, exponent);
}

function polynomial(value = "quadratic") {
  if (value === "quadratic") {
    return math(
      "math",
      mn("2"),
      msup(mi("x"), mn("2")),
      mo("+"),
      mn("5"),
      mi("x"),
      mo("+"),
      mn("2"),
      mo("="),
      mn("0"),
    );
  }
  return math(
    "math",
    math(
      "mfrac",
      math("mrow", mn("4"), mi("x"), mo("-"), mn("6")),
      math(
        "mrow",
        msup(mi("x"), mn("2")),
        mo("-"),
        mn("5"),
        mi("x"),
        mo("+"),
        mn("6"),
      ),
    ),
    mo("="),
    mn("1"),
  );
}

test("plain text never guesses lost exponent, subscript, or logarithm structure", () => {
  for (const source of [
    "x2 + 5x + 2 = 0",
    "x1 + x2",
    "12",
    "log2(x)",
  ]) {
    const root = html("p", {}, text(source));
    assert.equal(extract(root, source), source);
  }
});

test("complete HTML sup and sub elements preserve their proven structure", () => {
  const squared = html("span", {}, text("x"), html("sup", {}, text("2")));
  assert.equal(extract(squared, "x2"), "x^2");

  const indexed = html(
    "span",
    {},
    text("x"),
    html("sub", {}, text("1")),
    text(" + x"),
    html("sub", {}, text("2")),
  );
  assert.equal(extract(indexed, "x1 + x2"), "x_1 + x_2");
});

test("non-rendered script, style, template, and noscript text never joins structured output", () => {
  for (const tag of ["script", "style", "template", "noscript"]) {
    const root = html(
      "span",
      {},
      text("x"),
      html("sup", {}, text("2")),
      html(tag, {}, text("+999=999")),
      text("+1=0"),
    );
    assert.equal(extract(root, "x2+1=0"), "x^2+1=0", tag);
  }
});

test("MathML msup, msub, mfrac, and msqrt use explicit solver-safe syntax", () => {
  const cases = [
    [math("math", msup(mi("x"), mn("2"))), "x2", "x^2"],
    [math("math", math("msub", mi("x"), mn("1"))), "x1", "x_1"],
    [math("math", math("mfrac", mn("1"), mn("2"))), "12", "(1)/(2)"],
    [
      math("math", math("msqrt", math("mrow", mi("x"), mo("+"), mn("1")))),
      "x+1",
      "sqrt(x+1)",
    ],
  ];
  for (const [root, plain, expected] of cases) {
    assert.equal(extract(root, plain), expected);
  }
});

test("compound bases and scripts keep grouping before the verified solver sees them", () => {
  const fractionSquared = math(
    "math",
    msup(math("mfrac", mi("x"), mn("2")), mn("2")),
    mo("="),
    mn("1"),
  );
  const question = extract(fractionSquared, "x221");
  const result = solveQuestion(question);

  assert.equal(question, "((x)/(2))^2=1");
  assert.equal(result.solverId, "quadratic-equation");
  assert.equal(result.answer, "x=-2,2");
  assert.equal(result.verified, true);

  const htmlExponent = html("span", {}, text("x"), html("sup", {}, text("n+1")));
  assert.equal(extract(htmlExponent, "xn+1"), "x^(n+1)");
});

test("nested MathML fraction keeps numerator and denominator boundaries", () => {
  const root = math(
    "math",
    math(
      "mfrac",
      math("mrow", msup(mi("x"), mn("2")), mo("-"), mn("1")),
      math("mrow", mi("x"), mo("-"), mn("1")),
    ),
    mo("="),
    mn("3"),
  );
  assert.equal(extract(root, "x2-1x-1=3"), "(x^2-1)/(x-1)=3");
});

test("MathML only inserts multiplication where separate number and identifier nodes prove it", () => {
  const root = polynomial("quadratic");
  assert.equal(extract(root, "2x2+5x+2=0"), "2*x^2+5*x+2=0");

  const adjacentIdentifiers = math("math", mi("x"), mi("y"));
  assert.equal(extract(adjacentIdentifiers, "xy"), "xy");

  const multiCharacterIdentifier = math("math", mi("velocity"), mo("="), mn("2"));
  assert.equal(extract(multiCharacterIdentifier, "velocity=2"), "velocity=2");
});

test("KaTeX-like DOM uses its single semantic MathML instead of visual span reconstruction", () => {
  const presentation = polynomial("quadratic").childNodes;
  const semanticMath = math(
    "math",
    math(
      "semantics",
      math("mrow", ...presentation),
      math("annotation", text("2x^2+5x+2=0")),
    ),
  );
  const semantic = html("span", { class: "katex-mathml" }, semanticMath);
  const visualText = text("2x2+5x+2=0");
  const visual = html("span", { class: "katex-html", "aria-hidden": "true" }, visualText);
  const root = html("span", { class: "katex" }, semantic, visual);
  const selection = selectionBetween(
    root,
    visualText,
    0,
    visualText,
    visualText.data.length,
    "2x2+5x+2=0",
  );
  assert.equal(extract(root, "unused", selection), "2*x^2+5*x+2=0");
});

test("MathJax-like DOM uses a single assistive MathML only for a full visual selection", () => {
  const visualText = text("x2+1=0");
  const visual = html("mjx-math", {}, visualText);
  const assistive = html(
    "mjx-assistive-mml",
    {},
    math("math", msup(mi("x"), mn("2")), mo("+"), mn("1"), mo("="), mn("0")),
  );
  const root = html("mjx-container", { class: "MathJax" }, visual, assistive);
  const selection = selectionBetween(
    root,
    visualText,
    0,
    visualText,
    visualText.data.length,
    "x2+1=0",
  );
  assert.equal(extract(root, "unused", selection), "x^2+1=0");
});

test("renderer MathML must correspond to the selected visible text", () => {
  for (const kind of ["katex", "mathjax"]) {
    const semanticMath = math(
      "math",
      msup(mi("x"), mn("2")),
      mo("="),
      mn("1"),
    );
    const visualText = text("2+2=4");
    let root;
    let visual;
    if (kind === "katex") {
      visual = html("span", { class: "katex-html" }, visualText);
      root = html(
        "span",
        { class: "katex" },
        html("span", { class: "katex-mathml" }, semanticMath),
        visual,
      );
    } else {
      visual = html("mjx-math", {}, visualText);
      root = html(
        "mjx-container",
        { class: "MathJax" },
        visual,
        html("mjx-assistive-mml", {}, semanticMath),
      );
    }
    const selection = selectionBetween(root, visualText, 0, visualText, 5, "2+2=4");
    assert.equal(extract(root, "unused", selection), "2+2=4", kind);
  }
});

test("mixed Japanese and complete MathML preserve order without duplicating renderer text", () => {
  const root = html(
    "p",
    {},
    text("次の式 "),
    polynomial("quadratic"),
    text(" を解け"),
  );
  assert.equal(
    extract(root, "次の式 2x2+5x+2=0 を解け"),
    "次の式 2*x^2+5*x+2=0 を解け",
  );
});

test("selected block boundaries preserve label, instruction, and MathML as separate lines", () => {
  const label = text("(1)");
  const instruction = text("次の方程式を解け");
  const root = html(
    "section",
    {},
    html("div", {}, text("選択外の前文")),
    html("div", {}, label),
    html("p", {}, instruction),
    html("div", {}, polynomial("quadratic")),
    html("div", {}, text("選択外の後文")),
  );
  const formulaLeaves = textLeaves(root.childNodes[3]);
  const lastFormulaLeaf = formulaLeaves.at(-1);
  const selection = selectionBetween(
    root,
    label,
    0,
    lastFormulaLeaf,
    lastFormulaLeaf.data.length,
    "(1)\n次の方程式を解け\n2x2+5x+2=0",
  );

  assert.equal(
    extract(root, "unused", selection),
    "(1)\n次の方程式を解け\n2*x^2+5*x+2=0",
  );
});

test("block-structured Japanese and MathML reach ProblemInput and a verified shortcut", async () => {
  const root = html(
    "section",
    {},
    html("div", {}, text("(1)")),
    html("p", {}, text("次の方程式を解け")),
    html("div", {}, polynomial("quadratic")),
  );
  const question = extract(root, "(1)\n次の方程式を解け\n2x2+5x+2=0");
  const writes = [];
  const result = await runShortcutWorkflow({
    getSelectionText: async () => question,
    readClipboardText: async () => "original clipboard",
    writeClipboardText: async (value) => writes.push(value),
    settings: { learningMode: "quick", shortcutAction: "answer" },
  });

  assert.equal(result.input.problemInput.questionLabel, "(1)");
  assert.equal(result.input.problemInput.instructionText, "次の方程式を解け");
  assert.equal(result.input.problemInput.instructionIntent, "solve_equation");
  assert.equal(result.input.problemInput.formulaText, "2*x^2+5*x+2=0");
  assert.equal(result.workflow.solverResult.solverId, "quadratic-equation");
  assert.equal(result.workflow.solverResult.verified, true);
  assert.equal(result.clipboardOutput, "x=-2,-1/2");
  assert.deepEqual(writes, ["x=-2,-1/2"]);
});

test("partial structured selections never expand to the complete formula", () => {
  const exponent = text("12");
  const htmlRoot = html("span", {}, text("x"), html("sup", {}, exponent), text("+1"));
  const partialHtml = selectionBetween(htmlRoot, htmlRoot.childNodes[0], 0, exponent, 1, "x1");
  assert.equal(extract(htmlRoot, "unused", partialHtml), "x1");

  const mathRoot = polynomial("quadratic");
  const leaves = textLeaves(mathRoot);
  const exponentLeaf = leaves[2];
  const last = leaves.at(-1);
  const partialMath = selectionBetween(
    mathRoot,
    exponentLeaf,
    0,
    last,
    last.data.length,
    "2+5x+2=0",
  );
  assert.equal(extract(mathRoot, "unused", partialMath), "2+5x+2=0");
});

test("unsupported nth roots and non-unique renderer semantics fall back without guessing", () => {
  const root = math("math", math("mroot", mi("x"), mn("3")));
  assert.equal(extract(root, "x3"), "x3");

  const first = html("span", { class: "katex-mathml" }, math("math", mi("x")));
  const second = html("span", { class: "katex-mathml" }, math("math", mi("y")));
  const visualText = text("xy");
  const visual = html("span", { class: "katex-html" }, visualText);
  const katex = html("span", { class: "katex" }, first, second, visual);
  const selection = selectionBetween(katex, visualText, 0, visualText, 2, "xy");
  assert.equal(extract(katex, "unused", selection), "xy");
});

test("a DOM wider than the extraction budget falls back as one unchanged selection", () => {
  const root = html(
    "div",
    {},
    ...Array.from({ length: 4_097 }, () => html("span", {}, text("x"))),
  );
  const plain = "x".repeat(4_097);
  assert.equal(extract(root, plain), plain);
});

test("input and textarea selections remain literal while password input is excluded", () => {
  const domRoot = html("p", {}, text("x2"));
  const domSelection = fullSelection(domRoot, "x2");
  for (const active of [
    html("input", { type: "text", value: "AA x2 BB", selectionStart: 3, selectionEnd: 5 }),
    html("textarea", { value: "AA x1 BB", selectionStart: 3, selectionEnd: 5 }),
  ]) {
    assert.equal(
      extractor.getSelectionText({ documentObject: new FakeDocument(active), selection: domSelection }),
      active.value.slice(active.selectionStart, active.selectionEnd),
    );
  }

  const password = html("input", {
    type: "password",
    value: "secret",
    selectionStart: 0,
    selectionEnd: 6,
  });
  assert.equal(
    extractor.getSelectionText({ documentObject: new FakeDocument(password), selection: domSelection }),
    "",
  );

  const whitespace = html("textarea", {
    value: "   ",
    selectionStart: 0,
    selectionEnd: 3,
  });
  assert.equal(
    extractor.getSelectionText({ documentObject: new FakeDocument(whitespace), selection: domSelection }),
    "",
  );
  assert.equal(
    extractor.getSelectionText({ documentObject: new FakeDocument(), selection: new FakeSelection(null, "") }),
    "",
  );
});

test("structured quadratic selection reaches a verified shortcut result", async () => {
  const question = extract(polynomial("quadratic"), "2x2+5x+2=0");
  const writes = [];
  let clipboardReads = 0;
  const result = await runShortcutWorkflow({
    getSelectionText: async () => question,
    readClipboardText: async () => {
      clipboardReads += 1;
      return "old clipboard";
    },
    writeClipboardText: async (value) => writes.push(value),
    settings: { learningMode: "quick", shortcutAction: "answer" },
  });

  assert.equal(question, "2*x^2+5*x+2=0");
  assert.equal(result.workflow.solverResult.solverId, "quadratic-equation");
  assert.equal(result.workflow.solverResult.verified, true);
  assert.equal(result.clipboardOutput, "x=-2,-1/2");
  assert.deepEqual(writes, ["x=-2,-1/2"]);
  assert.equal(clipboardReads, 0);
});

test("structured rational selection reaches the verified rational-equation solver", () => {
  const question = extract(polynomial("rational"), "4x-6x2-5x+6=1");
  const result = solveQuestion(question);

  assert.equal(question, "(4*x-6)/(x^2-5*x+6)=1");
  assert.equal(result.solverId, "rational-equation");
  assert.equal(result.resultKind, "conditional");
  assert.equal(result.verified, true);
  assert.equal(result.exactAnswer, "x=(9-√33)/2,(9+√33)/2");
  assert.deepEqual(result.conditions, ["x≠2", "x≠3"]);
});

test("plain ambiguous x2 stays unverified and never overwrites the clipboard", async () => {
  const root = html("p", {}, text("x2+5x+2=0"));
  const question = extract(root, "x2+5x+2=0");
  const writes = [];

  await assert.rejects(
    runShortcutWorkflow({
      getSelectionText: async () => question,
      readClipboardText: async () => "original clipboard",
      writeClipboardText: async (value) => writes.push(value),
      settings: { learningMode: "quick", shortcutAction: "answer" },
    }),
    (error) => error instanceof ShortcutWorkflowError
      && ["INVALID_INPUT", "UNSUPPORTED_INPUT"].includes(error.code),
  );
  assert.equal(question, "x2+5x+2=0");
  assert.deepEqual(writes, []);
});
