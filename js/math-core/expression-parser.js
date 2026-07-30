import { normalizeMathNotation } from "./notation.js";

const MAX_EXPRESSION_LENGTH = 2_000;
const MAX_AST_NODES = 512;
const MAX_AST_DEPTH = 64;
const FUNCTION_NAMES = new Set([
  "abs",
  "arccos",
  "arcsin",
  "arctan",
  "cos",
  "exp",
  "log",
  "sin",
  "sqrt",
  "tan",
]);
const CONSTANT_NAMES = new Set(["e", "i", "pi"]);
const MULTI_CHARACTER_SYMBOLS = new Set(["alpha", "beta", "gamma", "theta"]);
const DEFAULT_SYMBOLS = Object.freeze([
  "a",
  "b",
  "c",
  "k",
  "m",
  "n",
  "t",
  "x",
  "y",
  "z",
]);

export class MathParseError extends Error {
  constructor(message, { code = "PARSE_ERROR", position = null, cause } = {}) {
    super(message, { cause });
    this.name = "MathParseError";
    this.code = code;
    this.position = position;
  }
}

function token(type, value, position) {
  return Object.freeze({ type, value, position });
}

function expandIdentifier(raw, position) {
  const value = raw.toLowerCase();
  if (
    FUNCTION_NAMES.has(value)
    || CONSTANT_NAMES.has(value)
    || MULTI_CHARACTER_SYMBOLS.has(value)
  ) {
    return [token("identifier", value, position)];
  }

  const result = [];
  let remaining = value;
  let offset = 0;
  while (remaining) {
    const prefix = [...FUNCTION_NAMES, ...CONSTANT_NAMES]
      .sort((left, right) => right.length - left.length)
      .find((name) => remaining.startsWith(name));
    if (prefix) {
      result.push(token("identifier", prefix, position + offset));
      remaining = remaining.slice(prefix.length);
      offset += prefix.length;
      continue;
    }
    result.push(token("identifier", remaining[0], position + offset));
    remaining = remaining.slice(1);
    offset += 1;
  }
  return result;
}

export function tokenizeMathExpression(value) {
  const source = normalizeMathNotation(value);
  if (!source) {
    throw new MathParseError("数式が空です。", { code: "EMPTY_EXPRESSION", position: 0 });
  }
  if (source.length > MAX_EXPRESSION_LENGTH) {
    throw new MathParseError("数式が長すぎます。", {
      code: "EXPRESSION_TOO_LONG",
      position: MAX_EXPRESSION_LENGTH,
    });
  }

  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const character = source[index];
    if (character === " " || character === "\t") {
      index += 1;
      continue;
    }
    if (/[0-9.]/u.test(character)) {
      const match = /^(?:\d+(?:\.\d*)?|\.\d+)/u.exec(source.slice(index));
      if (!match) {
        throw new MathParseError("数値の形式が正しくありません。", {
          code: "INVALID_NUMBER",
          position: index,
        });
      }
      const raw = match[0];
      if (source[index + raw.length] === ".") {
        throw new MathParseError("数値の小数点が多すぎます。", {
          code: "INVALID_NUMBER",
          position: index + raw.length,
        });
      }
      tokens.push(token("number", raw, index));
      index += raw.length;
      continue;
    }
    if (/[A-Za-z]/u.test(character)) {
      const match = /^[A-Za-z]+/u.exec(source.slice(index))[0];
      tokens.push(...expandIdentifier(match, index));
      index += match.length;
      continue;
    }
    if ("+-*/^".includes(character)) {
      tokens.push(token("operator", character, index));
      index += 1;
      continue;
    }
    if (character === "(" || character === ")") {
      tokens.push(token(character === "(" ? "lparen" : "rparen", character, index));
      index += 1;
      continue;
    }
    if (character === ",") {
      tokens.push(token("comma", character, index));
      index += 1;
      continue;
    }
    throw new MathParseError(`数式に使用できない文字です: ${character}`, {
      code: "UNEXPECTED_CHARACTER",
      position: index,
    });
  }
  tokens.push(token("eof", "", source.length));
  return Object.freeze({ source, tokens: Object.freeze(tokens) });
}

function freezeAst(node) {
  if (node.type === "unary") freezeAst(node.argument);
  if (node.type === "binary") {
    freezeAst(node.left);
    freezeAst(node.right);
  }
  if (node.type === "call") node.args.forEach(freezeAst);
  if (Array.isArray(node.args)) Object.freeze(node.args);
  return Object.freeze(node);
}

function isImplicitFactorStart(current) {
  return ["number", "identifier", "lparen"].includes(current.type);
}

class Parser {
  constructor(tokens, allowedSymbols) {
    this.tokens = tokens;
    this.allowedSymbols = allowedSymbols;
    this.index = 0;
    this.nodeCount = 0;
    this.depth = 0;
  }

  current() {
    return this.tokens[this.index];
  }

  consume(type, value = null) {
    const current = this.current();
    if (current.type !== type || (value !== null && current.value !== value)) {
      throw new MathParseError("数式の並びが正しくありません。", {
        code: "UNEXPECTED_TOKEN",
        position: current.position,
      });
    }
    this.index += 1;
    return current;
  }

  node(value) {
    this.nodeCount += 1;
    if (this.nodeCount > MAX_AST_NODES) {
      throw new MathParseError("数式が複雑すぎます。", {
        code: "AST_TOO_LARGE",
        position: this.current().position,
      });
    }
    return value;
  }

  withDepth(operation) {
    this.depth += 1;
    if (this.depth > MAX_AST_DEPTH) {
      throw new MathParseError("数式の入れ子が深すぎます。", {
        code: "AST_TOO_DEEP",
        position: this.current().position,
      });
    }
    try {
      return operation();
    } finally {
      this.depth -= 1;
    }
  }

  parse() {
    const ast = this.parseAdditive();
    if (this.current().type !== "eof") {
      throw new MathParseError("数式の末尾に解釈できない要素があります。", {
        code: "TRAILING_INPUT",
        position: this.current().position,
      });
    }
    return freezeAst(ast);
  }

  parseAdditive() {
    let left = this.parseMultiplicative();
    while (this.current().type === "operator" && ["+", "-"].includes(this.current().value)) {
      const operator = this.consume("operator").value;
      const right = this.parseMultiplicative();
      left = this.node({ type: "binary", operator, left, right });
    }
    return left;
  }

  parseMultiplicative() {
    let left = this.parseUnary();
    while (true) {
      const current = this.current();
      const explicit = current.type === "operator" && ["*", "/"].includes(current.value);
      const implicit = isImplicitFactorStart(current);
      if (!explicit && !implicit) break;
      const operator = explicit ? this.consume("operator").value : "*";
      const right = this.parseUnary();
      left = this.node({ type: "binary", operator, implicit: !explicit, left, right });
    }
    return left;
  }

  parseUnary() {
    if (this.current().type === "operator" && ["+", "-"].includes(this.current().value)) {
      const operator = this.consume("operator").value;
      return this.node({ type: "unary", operator, argument: this.parseUnary() });
    }
    return this.parsePower();
  }

  parsePower() {
    const base = this.parsePrimary();
    if (this.current().type === "operator" && this.current().value === "^") {
      this.consume("operator", "^");
      const exponent = this.parseUnary();
      return this.node({ type: "binary", operator: "^", left: base, right: exponent });
    }
    return base;
  }

  parsePrimary() {
    return this.withDepth(() => {
      const current = this.current();
      if (current.type === "number") {
        this.consume("number");
        return this.node({ type: "number", value: current.value });
      }
      if (current.type === "identifier") {
        this.consume("identifier");
        if (FUNCTION_NAMES.has(current.value)) return this.parseFunction(current);
        if (!CONSTANT_NAMES.has(current.value) && !this.allowedSymbols.has(current.value)) {
          throw new MathParseError(`許可されていない変数です: ${current.value}`, {
            code: "UNSUPPORTED_SYMBOL",
            position: current.position,
          });
        }
        return this.node({
          type: CONSTANT_NAMES.has(current.value) ? "constant" : "symbol",
          name: current.value,
        });
      }
      if (current.type === "lparen") {
        this.consume("lparen");
        const expression = this.parseAdditive();
        this.consume("rparen");
        return expression;
      }
      throw new MathParseError("数値、変数、関数、または括弧が必要です。", {
        code: "EXPECTED_PRIMARY",
        position: current.position,
      });
    });
  }

  parseFunction(functionToken) {
    let argument;
    if (this.current().type === "lparen") {
      this.consume("lparen");
      argument = this.parseAdditive();
      if (this.current().type === "comma") {
        throw new MathParseError("この関数の引数は1つだけです。", {
          code: "UNSUPPORTED_ARITY",
          position: this.current().position,
        });
      }
      this.consume("rparen");
    } else {
      argument = this.parseUnary();
    }
    return this.node({ type: "call", name: functionToken.value, args: [argument] });
  }
}

export function serializeExpressionAst(node) {
  switch (node?.type) {
    case "number":
      return node.value;
    case "symbol":
    case "constant":
      return node.name;
    case "unary":
      return `(${node.operator}${serializeExpressionAst(node.argument)})`;
    case "binary":
      return `(${serializeExpressionAst(node.left)}${node.operator}${serializeExpressionAst(node.right)})`;
    case "call":
      return `${node.name}(${node.args.map(serializeExpressionAst).join(",")})`;
    default:
      throw new MathParseError("未知の数式ノードです。", { code: "UNKNOWN_AST_NODE" });
  }
}

function collectSymbols(node, symbols = new Set()) {
  if (node.type === "symbol") symbols.add(node.name);
  if (node.type === "unary") collectSymbols(node.argument, symbols);
  if (node.type === "binary") {
    collectSymbols(node.left, symbols);
    collectSymbols(node.right, symbols);
  }
  if (node.type === "call") node.args.forEach((argument) => collectSymbols(argument, symbols));
  return symbols;
}

function numericAstValue(node) {
  if (node.type === "number") return Number(node.value);
  if (node.type === "unary") {
    const value = numericAstValue(node.argument);
    if (!Number.isFinite(value)) return null;
    return node.operator === "-" ? -value : value;
  }
  return null;
}

export function collectNonzeroDomainConditions(node, conditions = new Set()) {
  if (!node || typeof node !== "object") return Object.freeze([...conditions]);
  if (node.type === "binary") {
    if (node.operator === "/") {
      conditions.add(`${serializeExpressionAst(node.right)}≠0`);
    }
    if (node.operator === "^") {
      const exponent = numericAstValue(node.right);
      if (exponent !== null && exponent < 0) {
        conditions.add(`${serializeExpressionAst(node.left)}≠0`);
      }
    }
    collectNonzeroDomainConditions(node.left, conditions);
    collectNonzeroDomainConditions(node.right, conditions);
  }
  if (node.type === "unary") collectNonzeroDomainConditions(node.argument, conditions);
  if (node.type === "call") {
    node.args.forEach((argument) => collectNonzeroDomainConditions(argument, conditions));
  }
  return Object.freeze([...conditions]);
}

export function parseMathExpression(value, { symbols = DEFAULT_SYMBOLS } = {}) {
  const tokenized = tokenizeMathExpression(value);
  const allowedSymbols = new Set(symbols.map((symbol) => String(symbol).toLowerCase()));
  const ast = new Parser(tokenized.tokens, allowedSymbols).parse();
  return Object.freeze({
    source: String(value ?? ""),
    normalized: tokenized.source,
    ast,
    symbols: Object.freeze([...collectSymbols(ast)].sort()),
    cas: serializeExpressionAst(ast),
  });
}

export { DEFAULT_SYMBOLS, FUNCTION_NAMES };
