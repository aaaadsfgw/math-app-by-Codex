(() => {
  "use strict";

  const API_KEY = "__mathStudyLogSelectionMathExtractor";
  if (globalThis[API_KEY]) return;

  const ELEMENT_NODE = 1;
  const TEXT_NODE = 3;
  const MAX_VISITED_NODES = 4_096;
  const MAX_DEPTH = 64;
  const MAX_OUTPUT_LENGTH = 10_000;
  const MATHML_NAMESPACE = ["http:", "//www.w3.org/1998/Math/MathML"].join("");
  const TEXT_INPUT_TYPES = new Set(["", "text", "search", "url", "tel", "email"]);
  const MATHML_TAGS = new Set([
    "annotation",
    "annotation-xml",
    "math",
    "merror",
    "mfenced",
    "mfrac",
    "mi",
    "mmultiscripts",
    "mn",
    "mo",
    "mover",
    "mpadded",
    "mphantom",
    "mroot",
    "mrow",
    "ms",
    "mspace",
    "msqrt",
    "mstyle",
    "msub",
    "msubsup",
    "msup",
    "mtable",
    "mtd",
    "mtext",
    "mtr",
    "munder",
    "munderover",
    "semantics",
  ]);
  const MATHML_WRAPPERS = new Set(["math", "mrow", "mstyle", "mpadded"]);
  const FACTOR_END_KINDS = new Set(["number", "identifier", "close", "factor"]);
  const FACTOR_START_KINDS = new Set(["number", "identifier", "open", "factor"]);
  const IGNORED_TEXT_CONTAINERS = new Set(["script", "style", "template", "noscript"]);

  function nodeName(node) {
    const raw = String(node?.localName || node?.tagName || "").toLowerCase();
    return raw.includes(":") ? raw.slice(raw.lastIndexOf(":") + 1) : raw;
  }

  function childNodes(node) {
    const collection = node?.childNodes;
    if (!collection) return [];
    const length = Number(collection.length);
    if (!Number.isSafeInteger(length) || length < 0 || length > MAX_VISITED_NODES) {
      throw new Error("selection DOM is too wide");
    }
    const result = [];
    for (let index = 0; index < length; index += 1) result.push(collection[index]);
    return result;
  }

  function elementChildren(node) {
    return childNodes(node).filter((child) => child?.nodeType === ELEMENT_NODE);
  }

  function textValue(node) {
    if (node?.nodeType !== TEXT_NODE) return "";
    return String(node.data ?? node.nodeValue ?? node.textContent ?? "");
  }

  function getAttribute(node, name) {
    try {
      return node?.getAttribute?.(name) ?? null;
    } catch {
      return null;
    }
  }

  function classTokens(node) {
    const raw = typeof node?.className === "string"
      ? node.className
      : getAttribute(node, "class") || "";
    return String(raw).split(/\s+/u).filter(Boolean);
  }

  function hasClass(node, className) {
    return classTokens(node).includes(className);
  }

  function isMathMlElement(node) {
    if (node?.nodeType !== ELEMENT_NODE) return false;
    return node.namespaceURI === MATHML_NAMESPACE || MATHML_TAGS.has(nodeName(node));
  }

  function rendererKind(node) {
    if (node?.nodeType !== ELEMENT_NODE) return "";
    const name = nodeName(node);
    if (name === "mjx-container") return "mathjax";
    if (hasClass(node, "katex") && !hasClass(node, "katex-display")) return "katex";
    if (hasClass(node, "MathJax")) return "mathjax";
    return "";
  }

  function createBudget() {
    return { depth: 0, visited: 0 };
  }

  function enterNode(budget) {
    budget.visited += 1;
    budget.depth += 1;
    return budget.visited <= MAX_VISITED_NODES && budget.depth <= MAX_DEPTH;
  }

  function leaveNode(budget) {
    budget.depth -= 1;
  }

  function intersectsNode(range, node) {
    try {
      return Boolean(range?.intersectsNode?.(node));
    } catch {
      return false;
    }
  }

  function selectedTextSlice(range, node) {
    const value = textValue(node);
    if (!value || !intersectsNode(range, node)) return "";

    let start = 0;
    let end = value.length;
    if (range.startContainer === node) {
      start = Math.max(0, Math.min(value.length, Number(range.startOffset) || 0));
    }
    if (range.endContainer === node) {
      end = Math.max(0, Math.min(value.length, Number(range.endOffset) || 0));
    }
    return start < end ? value.slice(start, end) : "";
  }

  function textNodeFullySelected(range, node) {
    const value = textValue(node);
    if (!value) return true;
    try {
      if (typeof range?.comparePoint === "function") {
        return range.comparePoint(node, 0) === 0
          && range.comparePoint(node, value.length) === 0;
      }
    } catch {
      return false;
    }
    return selectedTextSlice(range, node) === value;
  }

  function collectTextLeaves(node, budget, { skipSubtree = null } = {}) {
    const leaves = [];

    function visit(current) {
      if (!enterNode(budget)) throw new Error("selection DOM is too large");
      try {
        if (current?.nodeType === TEXT_NODE) {
          if (/\S/u.test(textValue(current))) leaves.push(current);
          return;
        }
        if (
          current?.nodeType !== ELEMENT_NODE
          || IGNORED_TEXT_CONTAINERS.has(nodeName(current))
          || skipSubtree?.(current)
        ) return;
        for (const child of childNodes(current)) visit(child);
      } finally {
        leaveNode(budget);
      }
    }

    visit(node);
    return leaves;
  }

  function presentationChild(node) {
    if (nodeName(node) !== "semantics") return node;
    return elementChildren(node).find((child) => !["annotation", "annotation-xml"].includes(
      nodeName(child),
    )) || null;
  }

  function mathCoverageRoot(node) {
    if (nodeName(node) === "semantics") return presentationChild(node);
    const semantics = elementChildren(node).find((child) => nodeName(child) === "semantics");
    return semantics ? presentationChild(semantics) : node;
  }

  function contentFullySelected(range, node, budget, options = {}) {
    const root = options.mathPresentation ? mathCoverageRoot(node) : node;
    if (!root) return false;
    const leaves = collectTextLeaves(root, budget, { skipSubtree: options.skipSubtree });
    return leaves.length > 0 && leaves.every((leaf) => textNodeFullySelected(range, leaf));
  }

  function boundaryFullySelected(range, node) {
    if (typeof range?.comparePoint !== "function" || node?.nodeType !== ELEMENT_NODE) {
      return false;
    }
    try {
      const children = childNodes(node);
      if (
        children.length > 0
        && range.comparePoint(node, 0) === 0
        && range.comparePoint(node, children.length) === 0
      ) return true;

      const parent = node.parentNode;
      if (!parent) return false;
      const siblings = childNodes(parent);
      const index = siblings.indexOf(node);
      return index >= 0
        && range.comparePoint(parent, index) === 0
        && range.comparePoint(parent, index + 1) === 0;
    } catch {
      return false;
    }
  }

  function hasSelectedContent(range, node, budget, options = {}) {
    const leaves = collectTextLeaves(node, budget, { skipSubtree: options.skipSubtree });
    return leaves.some((leaf) => /\S/u.test(selectedTextSlice(range, leaf)));
  }

  function descendantElements(node, budget, predicate) {
    const results = [];

    function visit(current) {
      if (!enterNode(budget)) throw new Error("selection DOM is too large");
      try {
        if (current !== node && current?.nodeType === ELEMENT_NODE && predicate(current)) {
          results.push(current);
        }
        if (results.length > 2) return;
        for (const child of childNodes(current)) {
          if (child?.nodeType === ELEMENT_NODE) visit(child);
          if (results.length > 2) return;
        }
      } finally {
        leaveNode(budget);
      }
    }

    visit(node);
    return results;
  }

  function hasAncestorClass(node, className, stopNode) {
    for (let current = node?.parentNode; current && current !== stopNode; current = current.parentNode) {
      if (hasClass(current, className)) return true;
    }
    return false;
  }

  function containsNode(ancestor, node) {
    for (let current = node; current; current = current.parentNode) {
      if (current === ancestor) return true;
    }
    return false;
  }

  function rawDescendantText(node, budget) {
    return collectTextLeaves(node, budget).map(textValue).join("");
  }

  function rendererTextSignature(node, budget, { mathPresentation = false } = {}) {
    const root = mathPresentation ? mathCoverageRoot(node) : node;
    if (!root) return "";
    return rawDescendantText(root, budget)
      .normalize("NFKC")
      .replace(/\s+/gu, "")
      .replace(/[−–—﹣－]/gu, "-")
      .replace(/[×·⋅∙]/gu, "*")
      .replace(/÷/gu, "/")
      .replace(/＝/gu, "=")
      .replace(/≤|≦/gu, "<=")
      .replace(/≥|≧/gu, ">=")
      .replace(/\u2062/gu, "*");
  }

  function compactMathToken(value) {
    return String(value ?? "").replace(/\s+/gu, "").trim();
  }

  function normalizeMathOperator(value) {
    const compact = compactMathToken(value);
    const mapped = compact
      .replace(/[−–—﹣－]/gu, "-")
      .replace(/[×·⋅∙]/gu, "*")
      .replace(/÷/gu, "/")
      .replace(/＝/gu, "=")
      .replace(/≤|≦/gu, "<=")
      .replace(/≥|≧/gu, ">=")
      .replace(/\u2062/gu, "*");
    return mapped;
  }

  function piece(text, {
    atomic = false,
    leadingKind = "raw",
    trailingKind = leadingKind,
  } = {}) {
    return { atomic, leadingKind, text, trailingKind };
  }

  function operatorPiece(text) {
    if (["(", "["].includes(text)) {
      return piece(text, { atomic: false, leadingKind: "open", trailingKind: "open" });
    }
    if ([")", "]"].includes(text)) {
      return piece(text, { atomic: false, leadingKind: "close", trailingKind: "close" });
    }
    return piece(text, { atomic: false, leadingKind: "operator", trailingKind: "operator" });
  }

  function hasFactorAdjacency(left, right) {
    return FACTOR_END_KINDS.has(left?.trailingKind)
      && FACTOR_START_KINDS.has(right?.leadingKind);
  }

  function joinMathPieces(parts) {
    if (!parts.length) return null;
    let text = "";
    let previous = null;
    for (const current of parts) {
      if (!current?.text) return null;
      if (previous && hasFactorAdjacency(previous, current)) {
        if (previous.trailingKind === "number" && current.leadingKind === "identifier") {
          text += "*";
        } else {
          return null;
        }
      }
      text += current.text;
      previous = current;
      if (text.length > MAX_OUTPUT_LENGTH) return null;
    }
    return piece(text, {
      atomic: parts.length === 1 && parts[0].atomic,
      leadingKind: parts[0].leadingKind,
      trailingKind: parts.at(-1).trailingKind,
    });
  }

  function mathChildrenAsRow(node, budget) {
    const parts = [];
    for (const child of childNodes(node)) {
      if (child?.nodeType === TEXT_NODE) {
        if (/\S/u.test(textValue(child))) return null;
        continue;
      }
      if (child?.nodeType !== ELEMENT_NODE) continue;
      const serialized = serializeMathNode(child, budget);
      if (!serialized) return null;
      parts.push(serialized);
    }
    return joinMathPieces(parts);
  }

  function scriptOperand(serialized) {
    return serialized.atomic ? serialized.text : `(${serialized.text})`;
  }

  function serializeMathNode(node, budget) {
    if (!enterNode(budget)) return null;
    try {
      if (!isMathMlElement(node)) return null;
      const name = nodeName(node);

      if (name === "semantics") {
        const child = presentationChild(node);
        return child ? serializeMathNode(child, budget) : null;
      }

      if (MATHML_WRAPPERS.has(name)) return mathChildrenAsRow(node, budget);

      if (["mi", "mn", "mo", "mtext"].includes(name)) {
        const value = rawDescendantText(node, budget);
        if (name === "mi") {
          const identifier = compactMathToken(value);
          if (!/^\p{L}$/u.test(identifier)) return null;
          return piece(identifier, {
            atomic: true,
            leadingKind: "identifier",
            trailingKind: "identifier",
          });
        }
        if (name === "mn") {
          const number = compactMathToken(value).normalize("NFKC");
          if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/u.test(number)) return null;
          return piece(number, {
            atomic: true,
            leadingKind: "number",
            trailingKind: "number",
          });
        }
        if (name === "mo") {
          const operator = normalizeMathOperator(value);
          if (!operator || !/^(?:\+|-|\*|\/|=|<|>|<=|>=|\(|\)|\[|\]|,)$/u.test(operator)) {
            return null;
          }
          return operatorPiece(operator);
        }
        const text = String(value).replace(/\s+/gu, " ").trim();
        return text ? piece(text) : null;
      }

      if (["msup", "msub", "msubsup"].includes(name)) {
        const children = elementChildren(node);
        const required = name === "msubsup" ? 3 : 2;
        if (children.length !== required) return null;
        const base = serializeMathNode(children[0], budget);
        const firstScript = serializeMathNode(children[1], budget);
        if (!base || !firstScript) return null;
        const baseText = scriptOperand(base);

        if (name === "msup") {
          return piece(`${baseText}^${scriptOperand(firstScript)}`, {
            atomic: false,
            leadingKind: base.leadingKind,
            trailingKind: "factor",
          });
        }
        if (name === "msub") {
          return piece(`${baseText}_${scriptOperand(firstScript)}`, {
            atomic: false,
            leadingKind: base.leadingKind,
            trailingKind: "identifier",
          });
        }
        const superscript = serializeMathNode(children[2], budget);
        if (!superscript) return null;
        return piece(`${baseText}_${scriptOperand(firstScript)}^${scriptOperand(superscript)}`, {
          atomic: false,
          leadingKind: base.leadingKind,
          trailingKind: "factor",
        });
      }

      if (name === "mfrac") {
        const children = elementChildren(node);
        if (children.length !== 2) return null;
        const numerator = serializeMathNode(children[0], budget);
        const denominator = serializeMathNode(children[1], budget);
        if (!numerator || !denominator) return null;
        return piece(`(${numerator.text})/(${denominator.text})`, {
          atomic: false,
          leadingKind: "factor",
          trailingKind: "factor",
        });
      }

      if (name === "msqrt") {
        const radicand = mathChildrenAsRow(node, budget);
        if (!radicand) return null;
        return piece(`sqrt(${radicand.text})`, {
          atomic: true,
          leadingKind: "factor",
          trailingKind: "factor",
        });
      }

      // An nth root is deliberately not rewritten as a fractional power: doing
      // so can change real-domain and principal-root semantics in existing
      // solvers. Unsupported MathML always falls back to the exact selection.
      return null;
    } finally {
      leaveNode(budget);
    }
  }

  function rendererSemanticMath(node, kind, budget) {
    const candidates = descendantElements(node, budget, (candidate) => {
      if (nodeName(candidate) !== "math") return false;
      return kind !== "katex" || hasAncestorClass(candidate, "katex-mathml", node);
    });
    return candidates.length === 1 ? candidates[0] : null;
  }

  function serializeRenderer(node, kind, range, budget) {
    const semanticMath = rendererSemanticMath(node, kind, budget);
    if (!semanticMath) return null;

    const semanticCovered = contentFullySelected(range, semanticMath, budget, {
      mathPresentation: true,
    });
    if (semanticCovered) return serializeMathNode(semanticMath, budget);

    let visibleCovered = false;
    let visibleRoot = null;

    if (kind === "katex") {
      const visibleRoots = descendantElements(
        node,
        budget,
        (candidate) => hasClass(candidate, "katex-html"),
      );
      visibleRoot = visibleRoots.length === 1 ? visibleRoots[0] : null;
      visibleCovered = Boolean(visibleRoot)
        && (
          contentFullySelected(range, visibleRoot, budget)
          || boundaryFullySelected(range, visibleRoot)
        );
    } else {
      const visibleRoots = elementChildren(node).filter(
        (candidate) => !containsNode(candidate, semanticMath),
      );
      if (visibleRoots.length === 1) {
        [visibleRoot] = visibleRoots;
        visibleCovered = contentFullySelected(range, visibleRoot, budget)
          || boundaryFullySelected(range, visibleRoot);
      }
    }

    if (!visibleCovered || !visibleRoot) return null;
    const visibleSignature = rendererTextSignature(visibleRoot, budget);
    const semanticSignature = rendererTextSignature(semanticMath, budget, {
      mathPresentation: true,
    });
    if (!visibleSignature || visibleSignature !== semanticSignature) return null;
    return serializeMathNode(semanticMath, budget);
  }

  function htmlScriptText(node, budget) {
    const value = rawDescendantText(node, budget).replace(/\s+/gu, " ").trim();
    if (!value || value.length > MAX_OUTPUT_LENGTH) return "";
    const atomic = /^(?:\d+(?:\.\d*)?|\.\d+|\p{L})$/u.test(value);
    return atomic ? value : `(${value})`;
  }

  function serializeSelectedDom(node, range, budget) {
    if (
      (node?.nodeType === TEXT_NODE || node?.nodeType === ELEMENT_NODE)
      && !intersectsNode(range, node)
    ) {
      return { ok: true, parts: [], usedStructure: false };
    }
    if (!enterNode(budget)) return { ok: false, parts: [], usedStructure: false };
    try {
      if (node?.nodeType === TEXT_NODE) {
        const selected = selectedTextSlice(range, node);
        return {
          ok: true,
          parts: selected ? [{ type: "text", text: selected }] : [],
          usedStructure: false,
        };
      }
      if (node?.nodeType !== ELEMENT_NODE) {
        return { ok: true, parts: [], usedStructure: false };
      }

      if (IGNORED_TEXT_CONTAINERS.has(nodeName(node))) {
        return { ok: true, parts: [], usedStructure: false };
      }

      const kind = rendererKind(node);
      if (kind) {
        const serialized = serializeRenderer(node, kind, range, budget);
        return serialized
          ? {
            ok: true,
            parts: [{ type: "structured", text: serialized.text }],
            usedStructure: true,
          }
          : { ok: false, parts: [], usedStructure: false };
      }

      if (isMathMlElement(node)) {
        if (!hasSelectedContent(range, node, budget, {
          skipSubtree: (candidate) => ["annotation", "annotation-xml"].includes(nodeName(candidate)),
        })) {
          return { ok: true, parts: [], usedStructure: false };
        }
        if (!contentFullySelected(range, node, budget, { mathPresentation: true })) {
          return { ok: false, parts: [], usedStructure: false };
        }
        const serialized = serializeMathNode(node, budget);
        return serialized
          ? {
            ok: true,
            parts: [{ type: "structured", text: serialized.text }],
            usedStructure: true,
          }
          : { ok: false, parts: [], usedStructure: false };
      }

      const name = nodeName(node);
      if (name === "sup" || name === "sub") {
        if (!hasSelectedContent(range, node, budget)) {
          return { ok: true, parts: [], usedStructure: false };
        }
        if (!contentFullySelected(range, node, budget)) {
          return { ok: false, parts: [], usedStructure: false };
        }
        const script = htmlScriptText(node, budget);
        return script
          ? {
            ok: true,
            parts: [{ type: name, text: script }],
            usedStructure: true,
          }
          : { ok: false, parts: [], usedStructure: false };
      }

      const combined = { ok: true, parts: [], usedStructure: false };
      for (const child of childNodes(node)) {
        const current = serializeSelectedDom(child, range, budget);
        if (!current.ok) return current;
        combined.parts.push(...current.parts);
        combined.usedStructure ||= current.usedStructure;
        if (combined.parts.length > MAX_VISITED_NODES) {
          return { ok: false, parts: [], usedStructure: false };
        }
      }
      return combined;
    } finally {
      leaveNode(budget);
    }
  }

  function hasPostfixBase(value) {
    const compact = value.trimEnd();
    if (!compact) return false;
    return !/[+\-*/^=<>_,([{]$/u.test(compact);
  }

  function combineDomParts(parts) {
    let output = "";
    for (const current of parts) {
      if (current.type === "sup" || current.type === "sub") {
        if (!hasPostfixBase(output)) return "";
        output = output.trimEnd();
        output += current.type === "sup" ? `^${current.text}` : `_${current.text}`;
      } else {
        output += current.text;
      }
      if (output.length > MAX_OUTPUT_LENGTH) return "";
    }
    return output.replace(/[\t\r\n\f\v\u00a0]+/gu, " ").replace(/ {2,}/gu, " ").trim();
  }

  function nearestContextRoot(range) {
    let root = range?.commonAncestorContainer || null;
    if (root?.nodeType === TEXT_NODE) root = root.parentNode;
    if (!root) return null;

    let mathRoot = null;
    let rendererRoot = null;
    for (let current = root; current?.nodeType === ELEMENT_NODE; current = current.parentNode) {
      if (!mathRoot && nodeName(current) === "math") mathRoot = current;
      if (!rendererRoot && rendererKind(current)) rendererRoot = current;
    }
    return rendererRoot || mathRoot || root;
  }

  function structuredSelectionText(selection) {
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return "";
    let range;
    try {
      range = selection.getRangeAt(0);
    } catch {
      return "";
    }
    if (!range || range.collapsed) return "";

    const root = nearestContextRoot(range);
    if (!root) return "";
    try {
      const serialized = serializeSelectedDom(root, range, createBudget());
      if (!serialized.ok || !serialized.usedStructure) return "";
      return combineDomParts(serialized.parts);
    } catch {
      return "";
    }
  }

  function plainSelectionText(selection) {
    try {
      return String(selection?.toString?.() || "").trim();
    } catch {
      return "";
    }
  }

  function textControlSelection(documentObject) {
    const active = documentObject?.activeElement;
    const name = nodeName(active);
    const type = String(active?.type || getAttribute(active, "type") || "").toLowerCase();
    if (name === "input" && type === "password") {
      return { blocked: true, selected: false, text: "" };
    }

    const isTextArea = name === "textarea";
    const isTextInput = name === "input" && TEXT_INPUT_TYPES.has(type);
    if (!isTextArea && !isTextInput) {
      return { blocked: false, selected: false, text: "" };
    }

    try {
      const start = Number(active.selectionStart ?? 0);
      const end = Number(active.selectionEnd ?? 0);
      const value = String(active.value ?? "");
      return {
        blocked: false,
        selected: start !== end,
        text: start === end ? "" : value.slice(start, end).trim(),
      };
    } catch {
      return { blocked: false, selected: false, text: "" };
    }
  }

  function getSelectionText({ documentObject = globalThis.document, selection = null } = {}) {
    const control = textControlSelection(documentObject);
    if (control.blocked) return "";
    if (control.selected) return control.text;

    const currentSelection = selection ?? globalThis.getSelection?.() ?? null;
    const plain = plainSelectionText(currentSelection);
    const structured = structuredSelectionText(currentSelection);
    return structured || plain;
  }

  globalThis[API_KEY] = Object.freeze({ getSelectionText });
})();
