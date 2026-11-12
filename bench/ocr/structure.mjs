// Bounded benchmark grammar for the fixture corpus. It builds syntax trees
// without evaluating, simplifying, sorting terms, or repairing model output.
const commands = new Map(Object.entries({
  frac: "frac", dfrac: "frac", tfrac: "frac", cfrac: "frac", sqrt: "sqrt",
  times: "*", cdot: "*", div: "/", leq: "<=", le: "<=", geq: ">=", ge: ">=",
  to: "->", rightarrow: "->", infty: "infinity", int: "∫", lim: "lim",
  sin: "sin", cos: "cos", tan: "tan", log: "log", ln: "ln", pi: "pi", underset: "underset",
}));
const formatting = new Set([
  "left", "right", "big", "Big", "bigg", "Bigg", "bigl", "bigr", "Bigl", "Bigr",
  "biggl", "biggr", "Biggl", "Biggr", "limits", "nolimits",
  "displaystyle", "textstyle", "quad", "qquad", ",", "!", ";", ":", " ",
]);
const functions = new Set(["sin", "cos", "tan", "log", "ln", "sqrt", "root", "integral"]);
const constants = new Set(["pi", "infinity"]);
const groups = new Map([["(", ")"], ["{", "}"], ["[", "]"]]);
const precedence = new Map([["=", 10], ["<=", 10], [">=", 10], ["<", 10], [">", 10],
  ["+", 20], ["-", 20], ["*", 30], ["/", 30], ["^", 40]]);

export function formulaTokens(value, { latex = false } = {}) {
  if (typeof value !== "string" || !value.trim() || value.length > 2000) throw new Error("Empty or oversized formula");
  let source = value.trim()
    .replace(/^\$\$([\s\S]+)\$\$$|^\$([^$]+)\$$|^\\\(([\s\S]+)\\\)$|^\\\[([\s\S]+)\\\]$/u,
      (_match, ...groups) => groups.slice(0, 4).find(Boolean))
    .replace(/\\(?:mathrm|operatorname\*?)\s*\{([a-zA-Z\s]+)\}/gu, (full, name) => {
      const compact = name.replace(/\s+/gu, "");
      return ["d", "sin", "cos", "tan", "log", "ln", "lim"].includes(compact) ? compact : full;
    })
    .replace(/\{\s*(sin|cos|tan|log|ln)\s*\}/gu, "$1")
    .replaceAll("−", "-").replaceAll("×", "*").replaceAll("·", "*")
    .replaceAll("≤", "<=").replaceAll("≥", ">=").replaceAll("→", "->")
    .replaceAll("∞", "infinity").replaceAll("π", "pi");
  if (latex) {
    source = source.replace(/(?<=\d)\s+(?=\d)/gu, "")
      .replace(/(\\(?:dfrac|tfrac|cfrac|frac)\s*)(\d)(\d)(?!\d)/gu, "$1{$2}{$3}")
      .replace(/\{\s*\\(sin|cos|tan)\s*\{\s*\^\s*(?:\{(\d+)\}|(\d))\s*\}\s*\}/gu,
        (_match, name, grouped, single) => `\\${name}^{${grouped ?? single}}`)
      .replace(/([_^])\s*(\d)(\d+)/gu, "$1{$2} $3");
  }
  const scanner = /\s+|\\(?:[A-Za-z]+|.)|infinity|underset|integral|sqrt|root|sin|cos|tan|log|lim|ln|pi|(?:\d+(?:\.\d+)?|\.\d+)|->|<=|>=|[a-zA-Z+\-*/^_()[\]{},=<>∫]/uy;
  const tokens = [];
  while (scanner.lastIndex < source.length) {
    const position = scanner.lastIndex;
    const match = scanner.exec(source);
    if (!match) throw new Error(`Unsupported token at ${position}`);
    const token = match[0];
    if (token.trim() === "") continue;
    if (!token.startsWith("\\")) {
      tokens.push(token);
    } else if (!formatting.has(token.slice(1))) {
      const converted = commands.get(token.slice(1));
      if (!converted) throw new Error(`Unsupported command ${token}`);
      tokens.push(converted);
    }
  }
  if (tokens.length > 512) throw new Error("Too many tokens");
  return tokens;
}

const atom = (token) => /^[0-9.]/u.test(token ?? "") || /^[A-Za-z]$/u.test(token ?? "") || constants.has(token);
const factor = (token) => atom(token) || groups.has(token) || functions.has(token) || ["frac", "lim", "underset", "∫"].includes(token);

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
  }

  peek() { return this.tokens[this.index]; }

  take() { return this.tokens[this.index++]; }

  expect(token) {
    if (this.take() !== token) throw new Error(`Expected ${token}`);
  }

  complete() {
    const node = this.expression();
    if (this.index !== this.tokens.length) throw new Error("Trailing tokens");
    return node;
  }

  expression(minimum = 0) {
    let left = this.prefix();
    while (this.index < this.tokens.length) {
      const next = this.peek();
      const implicit = factor(next);
      const operator = implicit ? "*" : next;
      const binding = precedence.get(operator) ?? -1;
      if (binding < minimum) break;
      if (!implicit) this.take();
      left = [operator, left, this.expression(binding + (operator === "^" ? 0 : 1))];
    }
    return left;
  }

  group(opener) {
    const node = this.expression();
    this.expect(groups.get(opener));
    return node;
  }

  arguments() {
    this.expect("(");
    const nodes = [this.expression()];
    while (this.peek() === ",") {
      this.take();
      nodes.push(this.expression());
    }
    this.expect(")");
    return nodes;
  }

  groupTokens() {
    const opener = this.take();
    if (!groups.has(opener)) throw new Error("Missing limit approach");
    const closing = [groups.get(opener)];
    let end = this.index;
    for (; end < this.tokens.length; end++) {
      const token = this.tokens[end];
      if (groups.has(token)) closing.push(groups.get(token));
      else if (token === closing.at(-1)) closing.pop();
      if (!closing.length) break;
    }
    if (closing.length) throw new Error("Unclosed limit approach");
    const result = this.tokens.slice(this.index, end);
    this.index = end + 1;
    return result;
  }

  limit(approach) {
    const variable = approach.shift();
    if (!/^[a-zA-Z]$/u.test(variable ?? "") || approach.shift() !== "->") throw new Error("Invalid limit approach");
    let direction = "both";
    const suffix = approach.join("").match(/(?:\^\{([+-])\}|\^\(([+-])\)|\^([+-])|([+-]))$/u);
    if (suffix) {
      direction = suffix.slice(1).find(Boolean);
      approach.splice(approach.length - suffix[0].length);
    }
    return ["lim", ["atom", variable], new Parser(approach).complete(), ["direction", direction], this.expression()];
  }

  integral() {
    let lower = null;
    let upper = null;
    for (let i = 0; i < 2; i++) {
      if (this.peek() === "_" && lower === null) {
        this.take();
        lower = this.prefix();
      } else if (this.peek() === "^" && upper === null) {
        this.take();
        upper = this.prefix();
      } else break;
    }
    if ((lower === null) !== (upper === null)) throw new Error("Incomplete integral bounds");
    const closing = [];
    let end = this.index;
    for (; end < this.tokens.length; end++) {
      const token = this.tokens[end];
      if (groups.has(token)) closing.push(groups.get(token));
      else if (token === closing.at(-1)) closing.pop();
      else if (!closing.length && [")", "]", "}", ","].includes(token)) break;
    }
    const variable = this.tokens[end - 1];
    if (!/^[a-zA-Z]$/u.test(variable ?? "") || this.tokens[end - 2] !== "d") throw new Error("Missing differential");
    const body = new Parser(this.tokens.slice(this.index, end - 2)).complete();
    this.index = end;
    return ["integral", lower, upper, body, ["atom", variable]];
  }

  prefix() {
    const token = this.take();
    if (token === "+") return this.expression(35);
    if (token === "-") return ["neg", this.expression(35)];
    if (groups.has(token)) return this.group(token);
    if (token === "frac") return ["/", this.prefix(), this.prefix()];
    if (token === "sqrt") {
      const index = this.peek() === "[" ? this.group(this.take()) : ["atom", "2"];
      return ["root", this.prefix(), index];
    }
    if (token === "root" || token === "integral") {
      const args = this.arguments();
      if (token === "root" && args.length === 2) return [token, ...args];
      if (token === "integral" && args.length === 2) return [token, null, null, ...args];
      if (token === "integral" && args.length === 4) return [token, ...args];
      throw new Error(`Unexpected ${token} argument count`);
    }
    if (token === "lim") {
      this.expect("_");
      return this.limit(this.groupTokens());
    }
    if (token === "underset") {
      const approach = this.groupTokens();
      if (this.groupTokens().join("") !== "lim") throw new Error("Unsupported underset");
      return this.limit(approach);
    }
    if (token === "∫") return this.integral();
    if (functions.has(token)) {
      const base = token === "log" && this.peek() === "_" ? (this.take(), this.prefix()) : null;
      const power = this.peek() === "^" ? (this.take(), this.prefix()) : null;
      const argument = groups.has(this.peek()) ? this.prefix() : this.expression(31);
      const value = [token, argument, base];
      return power ? ["^", value, power] : value;
    }
    if (token === "f" && this.peek() === "(") return ["f", this.prefix()];
    if (atom(token)) return ["atom", token];
    throw new Error(`Unexpected ${token ?? "end of input"}`);
  }
}

export function parseStructure(value, options) {
  return new Parser(formulaTokens(value, options)).complete();
}

function selectedNodes(node, names, includeChildren) {
  if (!Array.isArray(node)) return [];
  const found = names.has(node[0]) ? [includeChildren ? JSON.stringify(node) : node[0]] : [];
  return found.concat(node.slice(1).flatMap((child) => selectedNodes(child, names, includeChildren)));
}

const criticalOperators = new Set(["neg", "+", "-", "=", "<", ">", "<=", ">="]);
const criticalStructures = new Set(["/", "^", "root", "integral", "lim"]);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function compareStructure(expected, observed, options) {
  const reference = parseStructure(expected);
  try {
    const candidate = parseStructure(observed, options);
    const operators = (node) => selectedNodes(node, criticalOperators, false).sort();
    const structures = (node) => selectedNodes(node, criticalStructures, true).sort();
    return {
      structural_match: equal(reference, candidate),
      operator_error: !equal(operators(reference), operators(candidate)),
      structure_error: !equal(structures(reference), structures(candidate)),
      parse_error: null,
    };
  } catch (error) {
    return { structural_match: false, operator_error: null, structure_error: null, parse_error: error.message };
  }
}
