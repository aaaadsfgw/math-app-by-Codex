// Restricted grammar for one printed OCR formula. It neither evaluates the
// expression nor repairs missing operators, delimiters, or script markers.
const MAX_LENGTH = 2_000;
const MAX_TOKENS = 384;
const MAX_NESTING = 48;
const FUNCTIONS = new Set(["sin", "cos", "tan", "arcsin", "arccos", "arctan", "log", "ln", "exp"]);
const SYMBOLS = new Set(["pi", "alpha", "beta", "gamma", "theta"]);
const COMMANDS = new Map(Object.entries({
  frac: "frac", dfrac: "frac", tfrac: "frac", cfrac: "frac", sqrt: "sqrt",
  times: "*", cdot: "*", div: "/", leq: "<=", le: "<=", geq: ">=", ge: ">=",
  to: "->", rightarrow: "->", infty: "infinity", int: "integral", lim: "lim", underset: "underset",
  mathop: "mathop",
}));
const DISPLAY = new Set(["displaystyle", "textstyle", "scriptstyle", "!"]);
const SPACING = new Set(["quad", "qquad", ",", ";", ":", " "]);
const SIZING = /^(?:[bB]ig{1,2}[lr]?)$/u;
const GROUPS = new Map([["(", ")"], ["[", "]"], ["{", "}"]]);
const RELATIONS = new Set(["=", "<", ">", "<=", ">="]);
const BINDING = new Map([["+", 1], ["-", 1], ["*", 2], ["/", 2]]);
const UNARY_BINDING = 3;
const POWER_BINDING = 4;
const ATOM_BINDING = 5;
const DIGIT = /^[0-9]$/u;
const LETTER = /^[a-z]$/u;
const FUNCTION_VARIABLES = new Set(["f", "g", "h"]);
const STYLED_NAME = /\\(?:mathrm|operatorname\*?)\s*\{([A-Za-z\s]+)\}/uy;

function unsupported(message) {
  const error = new Error(message);
  error.code = "OCR_LATEX_UNSUPPORTED";
  throw error;
}

function tokenize(input) {
  if (typeof input !== "string" || input.length > MAX_LENGTH || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(input.replace(/\t/gu, ""))) {
    unsupported("LaTeX に使用できない文字が含まれているか、入力が長すぎます。");
  }
  const source = input.trim().replace(/^\$\$([^$]+)\$\$$|^\$([^$]+)\$$|^\\\((.+)\\\)$|^\\\[(.+)\\\]$/u,
    (_match, display, inline, parens, brackets) => display ?? inline ?? parens ?? brackets)
    .replaceAll("−", "-").replaceAll("×", "*").replaceAll("·", "*")
    .replaceAll("≤", "<=").replaceAll("≥", ">=").replaceAll("→", "->")
    .replaceAll("π", "\\pi ").replaceAll("∞", "\\infty ");
  const scanner = /\s+|\\(?:[A-Za-z]+|.)|->|<=|>=|[a-z0-9.+\-*/^_()[\]{}=<>]/uy;
  const tokens = [];
  const sizing = [];
  let position = 0;
  while (position < source.length) {
    STYLED_NAME.lastIndex = position;
    const styled = STYLED_NAME.exec(source);
    if (styled) {
      const name = styled[1].replace(/\s+/gu, "");
      if (!FUNCTIONS.has(name) && name !== "lim" && name !== "d") {
        unsupported("未対応の LaTeX 演算子名です。");
      }
      tokens.push(name);
      position = STYLED_NAME.lastIndex;
      continue;
    }
    scanner.lastIndex = position;
    const match = scanner.exec(source);
    if (!match) unsupported("未対応の LaTeX 記号です。");
    const token = match[0];
    position = scanner.lastIndex;
    if (!token.trim()) continue;
    if (!token.startsWith("\\")) {
      tokens.push(token);
      continue;
    }
    const command = token.slice(1);
    if (DISPLAY.has(command)) continue;
    if (SPACING.has(command)) {
      if (/^[.0-9]$/u.test(tokens.at(-1) ?? "") && /^\s*[.0-9]/u.test(source.slice(position))) {
        unsupported("空白で区切られた数字を画像と照合してください。");
      }
      continue;
    }
    if (command === "limits" || command === "nolimits") {
      if (!["lim", "integral"].includes(tokens.at(-1))) unsupported("上下限指定の位置が不正です。");
      continue;
    }
    if (command === "left" || command === "right" || SIZING.test(command)) {
      const delimiter = /^\s*([()[\]])/u.exec(source.slice(position));
      if (!delimiter) unsupported("未対応の LaTeX 区切り記号です。");
      const glyph = delimiter[1];
      if (command === "left") {
        if (!GROUPS.has(glyph)) unsupported("LaTeX の開始括弧が不正です。");
        sizing.push(GROUPS.get(glyph));
      } else if (command === "right" && sizing.pop() !== glyph) {
        unsupported("LaTeX の左右の括弧が対応していません。");
      }
      tokens.push(glyph);
      position += delimiter[0].length;
      continue;
    }
    const converted = COMMANDS.get(command);
    if (converted) tokens.push(converted);
    else if (FUNCTIONS.has(command) || SYMBOLS.has(command)) tokens.push(command);
    else unsupported("未対応の LaTeX コマンドです。");
  }
  if (sizing.length) unsupported("LaTeX の右括弧がありません。");
  if (!tokens.length || tokens.length > MAX_TOKENS) unsupported("LaTeX が空であるか、複雑すぎます。");
  return tokens;
}

const atom = (value) => ({ kind: "atom", value });
const binary = (operator, left, right) => ({ kind: "binary", operator, left, right });
const power = (base, exponent) => ({ kind: "power", base, exponent });
const isNumberStart = (token) => DIGIT.test(token ?? "") || token === ".";
const isFactor = (token) => isNumberStart(token) || LETTER.test(token ?? "")
  || SYMBOLS.has(token) || FUNCTIONS.has(token) || GROUPS.has(token) || token === "frac" || token === "sqrt";

class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.index = 0;
    this.depth = 0;
  }

  peek() { return this.tokens[this.index]; }
  take() { return this.tokens[this.index++]; }

  expect(token) {
    if (this.take() !== token) unsupported("LaTeX の項や括弧が不足しています。");
  }

  complete(read = () => this.expression()) {
    const result = read();
    if (this.index !== this.tokens.length) unsupported("LaTeX の末尾に未対応の構造があります。");
    return result;
  }

  expression(minimum = 1) {
    if (++this.depth > MAX_NESTING) unsupported("LaTeX の入れ子が深すぎます。");
    let left = this.prefix();
    while (true) {
      const token = this.peek();
      const implicit = isFactor(token);
      const operator = implicit ? "*" : token;
      const binding = BINDING.get(operator) ?? 0;
      if (binding < minimum) break;
      if (implicit && (isNumberStart(token) || (left.kind === "binary" && left.operator === "/"))) {
        unsupported("数字の位置または除算後の掛け算を画像と照合してください。");
      }
      if (!implicit) this.take();
      left = binary(operator, left, this.expression(binding + 1));
    }
    this.depth--;
    return left;
  }

  prefix() {
    if (["+", "-"].includes(this.peek())) {
      const operator = this.take();
      return { kind: "unary", operator, argument: this.expression(UNARY_BINDING) };
    }
    const base = this.factor();
    if (this.peek() !== "^") return base;
    if (base.kind === "power") unsupported("上付き記号の範囲を画像と照合してください。");
    this.take();
    return power(base, this.argument());
  }

  digits() {
    let value = "";
    while (DIGIT.test(this.peek() ?? "")) value += this.take();
    return value;
  }

  number(first) {
    const whole = first === "." ? "" : first + this.digits();
    if (first !== "." && this.peek() !== ".") return atom(whole);
    if (first !== ".") this.take();
    const decimals = this.digits();
    if (!decimals) unsupported("LaTeX の小数点に続く数字がありません。");
    return atom(`${whole}.${decimals}`);
  }

  group(opener) {
    const expression = this.expression();
    this.expect(GROUPS.get(opener));
    return expression;
  }

  argument() {
    const token = this.take();
    if (token === "{") return this.group(token);
    // An unbraced TeX argument consists of one token, including a single digit.
    if (DIGIT.test(token ?? "") || LETTER.test(token ?? "") || SYMBOLS.has(token)) return atom(token);
    unsupported("LaTeX の分数・根号・指数の引数を確認してください。");
  }

  func(name) {
    let base = null;
    if (name === "log" && this.peek() === "_") {
      this.take();
      const argument = this.argument();
      if (argument.kind !== "atom" || !/^\d+$/u.test(argument.value)) {
        unsupported("対数の底は明示された整数に対応しています。");
      }
      base = argument.value;
    }
    let exponent = null;
    if (this.peek() === "^") {
      this.take();
      exponent = this.argument();
      // Trigonometric superscript -1 conventionally denotes the inverse.
      // Keep that notation in the raw OCR and ask for an explicit spelling.
      if (exponent.kind !== "atom" || !/^\d+$/u.test(exponent.value)) {
        unsupported("関数の上付き記号の意味を画像と照合してください。");
      }
    }
    const next = this.peek();
    const grouped = next === "(" || (next === "{" && this.tokens[this.index + 1] === "(");
    const argument = grouped ? this.factor() : this.expression(UNARY_BINDING);
    if (!grouped && isFactor(this.peek())) unsupported("関数の引数の範囲を画像と照合してください。");
    const call = { kind: "call", name: base === null ? name : `log_${base}`, argument };
    return exponent ? power(call, exponent) : call;
  }

  factor() {
    const token = this.take();
    if (token === "(") return { kind: "group", expression: this.group(token) };
    if (FUNCTION_VARIABLES.has(token) && this.peek() === "(") {
      unsupported("関数と掛け算の区別を画像と照合してください。");
    }
    if (token === "{") {
      if (FUNCTIONS.has(this.peek()) && this.tokens[this.index + 1] === "}") {
        const name = this.take();
        this.take();
        return this.func(name);
      }
      const expression = this.group(token);
      if (expression.kind === "binary" || expression.kind === "unary") {
        unsupported("表示されていないグループの範囲を画像と照合してください。");
      }
      return expression;
    }
    if (token === "frac") return { kind: "fraction", numerator: this.argument(), denominator: this.argument() };
    if (token === "sqrt") {
      if (this.peek() === "[") unsupported("指数付きの根号は自動変換できません。");
      return { kind: "call", name: "sqrt", argument: this.argument() };
    }
    if (FUNCTIONS.has(token)) return this.func(token);
    if (isNumberStart(token)) return this.number(token);
    if (LETTER.test(token ?? "") || SYMBOLS.has(token)) return atom(token);
    unsupported("LaTeX に未対応の項または記号があります。");
  }

  integral() {
    this.expect("integral");
    let lower = null;
    let upper = null;
    while (this.peek() === "_" || this.peek() === "^") {
      const side = this.take();
      if (side === "_" && lower === null) lower = this.argument();
      else if (side === "^" && upper === null) upper = this.argument();
      else unsupported("積分の上下限が重複しています。");
    }
    if (Boolean(lower) !== Boolean(upper)) unsupported("定積分の上下限がそろっていません。");
    if (this.tokens.at(-2) !== "d" || this.tokens.at(-1) !== "x" || this.index >= this.tokens.length - 2) {
      unsupported("積分の被積分関数と微分記号 dx を確認してください。");
    }
    const integrand = new Parser(this.tokens.slice(this.index, -2)).complete();
    const bounds = lower ? `_(${inside(lower)})^(${inside(upper)})` : "";
    return `∫${bounds} ${inside(integrand)} dx`;
  }

  limit() {
    const marker = this.take();
    if (marker === "lim") this.expect("_");
    this.expect("{");
    this.expect("x");
    // Math operator styling may wrap the explicit approach arrow only.
    const styledArrow = this.peek() === "mathop";
    if (styledArrow) this.take();
    const groupedArrow = styledArrow && this.peek() === "{";
    if (groupedArrow) this.take();
    this.expect("->");
    if (groupedArrow) this.expect("}");
    const start = this.index;
    let depth = 1;
    while (depth > 0 && this.index < this.tokens.length) {
      const token = this.take();
      if (token === "{") depth++;
      if (token === "}") depth--;
    }
    if (depth) unsupported("極限の接近先が閉じていません。");
    let approach = this.tokens.slice(start, this.index - 1);
    const direction = approach.slice(-4).join("").match(/^\^\{([+-])\}$/u)?.[1]
      ?? approach.slice(-2).join("").match(/^\^([+-])$/u)?.[1]
      ?? "";
    if (direction) approach = approach.slice(0, approach.at(-1) === "}" ? -4 : -2);
    const literal = approach.join("");
    const target = /^[+-]?infinity$/u.test(literal) && !direction
      ? literal : inside(new Parser(approach).complete());
    if (marker === "underset") {
      this.expect("{");
      this.expect("lim");
      this.expect("}");
    }
    return `lim_(x->${target}${direction}) ${inside(this.complete())}`;
  }

  formula() {
    if (this.peek() === "integral") return this.integral();
    if (["lim", "underset"].includes(this.peek())) return this.limit();
    if (this.tokens.slice(0, 5).join("") === "f(x)=") {
      this.index = 5;
      return `f(x)=${serialize(this.complete())}`;
    }
    const left = this.expression();
    if (!RELATIONS.has(this.peek())) return this.complete(() => serialize(left));
    return `${serialize(left)}${this.take()}${serialize(this.complete())}`;
  }
}

function inside(node) {
  return serialize(node.kind === "group" ? node.expression : node);
}

function serialize(node, minimum = 0) {
  let value;
  let binding = ATOM_BINDING;
  switch (node.kind) {
    case "atom": return node.value;
    case "group": return `(${serialize(node.expression)})`;
    case "call": return `${node.name}(${inside(node.argument)})`;
    case "fraction":
      value = `(${inside(node.numerator)})/(${inside(node.denominator)})`;
      binding = BINDING.get("/");
      break;
    case "unary":
      value = `${node.operator}${serialize(node.argument, UNARY_BINDING)}`;
      binding = UNARY_BINDING;
      break;
    case "binary":
      binding = BINDING.get(node.operator);
      value = `${serialize(node.left, binding)}${node.operator}${serialize(node.right, binding + 1)}`;
      break;
    case "power":
      value = `${serialize(node.base, POWER_BINDING + 1)}^${serialize(node.exponent, ATOM_BINDING)}`;
      binding = POWER_BINDING;
      break;
    default: unsupported("未対応の数式構造です。");
  }
  return binding < minimum ? `(${value})` : value;
}

export function convertMfrLatex(latex) {
  const formula = new Parser(tokenize(latex)).formula();
  if (formula.length > MAX_LENGTH) unsupported("変換した数式が長すぎます。");
  return formula;
}
