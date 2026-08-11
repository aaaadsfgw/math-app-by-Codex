import { ExactRational } from "./exact-rational.js";

const MAX_ABSOLUTE_RATIONAL_EXPONENT = 32n;

export class ExactLinearPiError extends Error {
  constructor(message, { code = "EXACT_LINEAR_PI_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactLinearPiError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function requireExactRational(value, label) {
  if (!(value instanceof ExactRational)) {
    throw new TypeError(`${label}は厳密分数で指定してください。`);
  }
  return value;
}

function requireExactLinearPi(value) {
  if (!(value instanceof ExactLinearPi)) {
    throw new TypeError("Q+Q*pi の厳密値を指定してください。");
  }
  return value;
}

function formatPiCoefficient(coefficient) {
  const negative = coefficient.numerator < 0n;
  const numerator = negative ? -coefficient.numerator : coefficient.numerator;
  const denominator = coefficient.denominator;
  let body;
  if (denominator === 1n) {
    body = numerator === 1n ? "pi" : `${numerator}*pi`;
  } else {
    body = numerator === 1n
      ? `pi/${denominator}`
      : `${numerator}*pi/${denominator}`;
  }
  return `${negative ? "-" : ""}${body}`;
}

export class ExactLinearPi {
  constructor(
    rationalPart = ExactRational.zero(),
    piCoefficient = ExactRational.zero(),
  ) {
    this.rationalPart = requireExactRational(rationalPart, "有理数部分");
    this.piCoefficient = requireExactRational(piCoefficient, "pi係数");
    Object.freeze(this);
  }

  add(other) {
    const right = requireExactLinearPi(other);
    return new ExactLinearPi(
      this.rationalPart.add(right.rationalPart),
      this.piCoefficient.add(right.piCoefficient),
    );
  }

  subtract(other) {
    return this.add(requireExactLinearPi(other).negate());
  }

  negate() {
    return new ExactLinearPi(
      this.rationalPart.negate(),
      this.piCoefficient.negate(),
    );
  }

  scale(coefficient) {
    const scalar = requireExactRational(coefficient, "倍率");
    return new ExactLinearPi(
      this.rationalPart.multiply(scalar),
      this.piCoefficient.multiply(scalar),
    );
  }

  equals(other) {
    return other instanceof ExactLinearPi
      && this.rationalPart.equals(other.rationalPart)
      && this.piCoefficient.equals(other.piCoefficient);
  }

  isZero() {
    return this.rationalPart.isZero() && this.piCoefficient.isZero();
  }

  isRational() {
    return this.piCoefficient.isZero();
  }

  isPurePi() {
    return this.rationalPart.isZero();
  }

  toString() {
    if (this.piCoefficient.isZero()) return this.rationalPart.toString();
    const piTerm = formatPiCoefficient(this.piCoefficient);
    if (this.rationalPart.isZero()) return piTerm;
    return this.piCoefficient.numerator < 0n
      ? `${this.rationalPart}${piTerm}`
      : `${this.rationalPart}+${piTerm}`;
  }

  key() {
    return `r:${this.rationalPart}|pi:${this.piCoefficient}`;
  }
}

function rationalValue(value) {
  return new ExactLinearPi(value, ExactRational.zero());
}

function piValue() {
  return new ExactLinearPi(ExactRational.zero(), ExactRational.one());
}

function analyzed(value, piBearing = false) {
  return Object.freeze({ value, piBearing: piBearing === true });
}

function unsupported(message, code) {
  throw new ExactLinearPiError(message, { code, unsupported: true });
}

function multiplyAnalyses(left, right) {
  if (left.piBearing && right.piBearing) {
    unsupported(
      "piを含む値同士の積はQ+Q*piの範囲を越えるため未対応です。",
      "NONLINEAR_PI_PRODUCT",
    );
  }
  if (left.piBearing) {
    if (!right.value.isRational()) {
      unsupported("Q+Q*piには有理数だけを掛けられます。", "NON_RATIONAL_SCALAR");
    }
    return analyzed(
      left.value.scale(right.value.rationalPart),
      true,
    );
  }
  if (right.piBearing) {
    if (!left.value.isRational()) {
      unsupported("Q+Q*piには有理数だけを掛けられます。", "NON_RATIONAL_SCALAR");
    }
    return analyzed(
      right.value.scale(left.value.rationalPart),
      true,
    );
  }
  if (!left.value.isRational() || !right.value.isRational()) {
    unsupported("Q+Q*piには有理数だけを掛けられます。", "NON_RATIONAL_SCALAR");
  }
  return analyzed(rationalValue(
    left.value.rationalPart.multiply(right.value.rationalPart),
  ));
}

function divideAnalyses(left, right) {
  if (right.piBearing || !right.value.isRational()) {
    unsupported(
      "piを含む値では割れません。Q+Q*piは0でない有理数だけで割ってください。",
      "PI_IN_DENOMINATOR",
    );
  }
  if (right.value.rationalPart.isZero()) {
    throw new ExactLinearPiError("0では割れません。", { code: "DIVISION_BY_ZERO" });
  }
  return analyzed(
    left.value.scale(ExactRational.one().divide(right.value.rationalPart)),
    left.piBearing,
  );
}

function powerAnalysis(base, exponent) {
  if (exponent.piBearing || !exponent.value.isRational()) {
    unsupported("指数は有理整数で指定してください。", "UNSUPPORTED_EXPONENT");
  }
  const rationalExponent = exponent.value.rationalPart;
  if (rationalExponent.denominator !== 1n) {
    unsupported("指数は整数で指定してください。", "UNSUPPORTED_EXPONENT");
  }
  const integer = rationalExponent.numerator;

  if (base.piBearing) {
    if (integer === 0n) {
      if (base.value.isZero()) {
        throw new ExactLinearPiError("0の0乗は扱えません。", { code: "ZERO_TO_ZERO" });
      }
      return analyzed(rationalValue(ExactRational.one()));
    }
    if (integer === 1n) return base;
    unsupported(
      "piを含む値の指数は0または1だけにしてください。",
      "UNSUPPORTED_PI_POWER",
    );
  }

  if (!base.value.isRational()) {
    unsupported("Q+Q*piの累乗は未対応です。", "UNSUPPORTED_PI_POWER");
  }
  if (
    integer < -MAX_ABSOLUTE_RATIONAL_EXPONENT
    || integer > MAX_ABSOLUTE_RATIONAL_EXPONENT
  ) {
    unsupported(
      `有理数の指数は絶対値${MAX_ABSOLUTE_RATIONAL_EXPONENT}以下にしてください。`,
      "UNSUPPORTED_EXPONENT",
    );
  }
  if (integer === 0n && base.value.isZero()) {
    throw new ExactLinearPiError("0の0乗は扱えません。", { code: "ZERO_TO_ZERO" });
  }
  if (integer < 0n && base.value.isZero()) {
    throw new ExactLinearPiError("0を負の指数で累乗できません。", {
      code: "ZERO_TO_NEGATIVE_POWER",
    });
  }
  return analyzed(rationalValue(base.value.rationalPart.pow(integer)));
}

function analyzeExactLinearPiConstant(node) {
  switch (node?.type) {
    case "number":
      return analyzed(rationalValue(ExactRational.parse(node.value)));
    case "constant":
      if (node.name === "pi") return analyzed(piValue(), true);
      unsupported(
        `数学定数${node.name}はQ+Q*piの厳密値として扱えません。`,
        "UNSUPPORTED_CONSTANT",
      );
      break;
    case "symbol":
      unsupported(
        `変数${node.name}を定数Q+Q*piとして扱えません。`,
        "UNSUPPORTED_SYMBOL",
      );
      break;
    case "call":
      unsupported(
        `関数${node.name}を定数Q+Q*piとして扱えません。`,
        "UNSUPPORTED_FUNCTION",
      );
      break;
    case "unary": {
      const argument = analyzeExactLinearPiConstant(node.argument);
      return node.operator === "-"
        ? analyzed(argument.value.negate(), argument.piBearing)
        : argument;
    }
    case "binary": {
      const left = analyzeExactLinearPiConstant(node.left);
      const right = analyzeExactLinearPiConstant(node.right);
      if (node.operator === "+") {
        return analyzed(left.value.add(right.value), left.piBearing || right.piBearing);
      }
      if (node.operator === "-") {
        return analyzed(left.value.subtract(right.value), left.piBearing || right.piBearing);
      }
      if (node.operator === "*") return multiplyAnalyses(left, right);
      if (node.operator === "/") return divideAnalyses(left, right);
      if (node.operator === "^") return powerAnalysis(left, right);
      unsupported(`演算子${node.operator}には対応していません。`, "UNSUPPORTED_OPERATOR");
      break;
    }
    default:
      throw new ExactLinearPiError("未知の数式要素です。", { code: "UNKNOWN_AST_NODE" });
  }
  throw new ExactLinearPiError("Q+Q*piの厳密値として解析できません。", {
    code: "INVALID_LINEAR_PI",
  });
}

export function exactLinearPiConstantFromAst(node) {
  return analyzeExactLinearPiConstant(node).value;
}

export function exactPiMultipleFromAst(node) {
  const value = analyzeExactLinearPiConstant(node).value;
  if (!value.isPurePi()) {
    unsupported("値は有理数係数qによるq*piの形にしてください。", "NOT_PI_MULTIPLE");
  }
  return value;
}
