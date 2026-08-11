import { ExactRational } from "./exact-rational.js";

const MAX_POLYNOMIAL_DEGREE = 32;
const MAX_ABSOLUTE_CONSTANT_EXPONENT = 32n;

export class ExactPolynomialIntegralError extends Error {
  constructor(message, { code = "EXACT_POLYNOMIAL_INTEGRAL_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactPolynomialIntegralError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function trim(coefficients) {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last].isZero()) last -= 1;
  return Object.freeze(coefficients.slice(0, last + 1));
}

function zeroPolynomial() {
  return Object.freeze([ExactRational.zero()]);
}

function onePolynomial() {
  return Object.freeze([ExactRational.one()]);
}

function constantPolynomial(value) {
  return Object.freeze([value]);
}

function variablePolynomial() {
  return Object.freeze([ExactRational.zero(), ExactRational.one()]);
}

function degree(polynomial) {
  return polynomial.length - 1;
}

function isZeroPolynomial(polynomial) {
  return polynomial.length === 1 && polynomial[0].isZero();
}

function add(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return trim(Array.from(
    { length: Math.max(left.length, right.length) },
    (_, index) => (left[index] ?? ExactRational.zero())
      .add((right[index] ?? ExactRational.zero()).multiply(multiplier)),
  ));
}

function multiply(left, right) {
  const resultDegree = degree(left) + degree(right);
  if (resultDegree > MAX_POLYNOMIAL_DEGREE) {
    throw new ExactPolynomialIntegralError(
      `定積分する多項式の次数は${MAX_POLYNOMIAL_DEGREE}以下にしてください。`,
      { code: "DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const coefficients = Array.from(
    { length: resultDegree + 1 },
    () => ExactRational.zero(),
  );
  for (let leftDegree = 0; leftDegree < left.length; leftDegree += 1) {
    for (let rightDegree = 0; rightDegree < right.length; rightDegree += 1) {
      if (left[leftDegree].isZero() || right[rightDegree].isZero()) continue;
      const resultIndex = leftDegree + rightDegree;
      coefficients[resultIndex] = coefficients[resultIndex]
        .add(left[leftDegree].multiply(right[rightDegree]));
    }
  }
  return trim(coefficients);
}

function containsVariable(node) {
  if (node?.type === "symbol") return node.name === "x";
  if (node?.type === "unary") return containsVariable(node.argument);
  if (node?.type === "binary") {
    return containsVariable(node.left) || containsVariable(node.right);
  }
  if (node?.type === "call") return node.args.some(containsVariable);
  return false;
}

function integerLiteral(node) {
  if (node?.type === "number") {
    const value = ExactRational.parse(node.value);
    return value.denominator === 1n ? value.numerator : null;
  }
  if (node?.type === "unary" && ["+", "-"].includes(node.operator)) {
    const value = integerLiteral(node.argument);
    if (value === null) return null;
    return node.operator === "-" ? -value : value;
  }
  return null;
}

function polynomialPower(base, exponent, baseAst) {
  if (exponent < -MAX_ABSOLUTE_CONSTANT_EXPONENT) {
    throw new ExactPolynomialIntegralError(
      `定数係数の負の指数は-${MAX_ABSOLUTE_CONSTANT_EXPONENT}以上にしてください。`,
      { code: "UNSUPPORTED_EXPONENT", unsupported: true },
    );
  }
  if (exponent < 0n) {
    if (containsVariable(baseAst)) {
      throw new ExactPolynomialIntegralError(
        "変数を含む分母や負の累乗の定積分は、区間内の極を完全に検査できる段階まで未対応です。",
        { code: "VARIABLE_DENOMINATOR", unsupported: true },
      );
    }
    if (isZeroPolynomial(base)) {
      throw new ExactPolynomialIntegralError("0を負の指数で累乗できません。", {
        code: "ZERO_TO_NEGATIVE_POWER",
      });
    }
    return constantPolynomial(base[0].pow(exponent));
  }
  if (exponent > BigInt(MAX_POLYNOMIAL_DEGREE)) {
    throw new ExactPolynomialIntegralError(
      `定積分する多項式の次数は${MAX_POLYNOMIAL_DEGREE}以下にしてください。`,
      { code: "DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  if (exponent === 0n) {
    if (isZeroPolynomial(base)) {
      throw new ExactPolynomialIntegralError("0の0乗は扱えません。", {
        code: "ZERO_TO_ZERO",
      });
    }
    if (containsVariable(baseAst)) {
      throw new ExactPolynomialIntegralError(
        "変数を含む式の0乗は、元の式の未定義点を失うため定積分では扱えません。",
        { code: "ZERO_POWER_DOMAIN", unsupported: true },
      );
    }
    return onePolynomial();
  }
  let output = onePolynomial();
  for (let count = 0n; count < exponent; count += 1n) {
    output = multiply(output, base);
  }
  return output;
}

function divide(left, right, rightAst) {
  if (containsVariable(rightAst) || degree(right) !== 0) {
    throw new ExactPolynomialIntegralError(
      "変数を含む分母の定積分は、区間内の極を完全に検査できる段階まで未対応です。",
      { code: "VARIABLE_DENOMINATOR", unsupported: true },
    );
  }
  if (right[0].isZero()) {
    throw new ExactPolynomialIntegralError("0では割れません。", {
      code: "DIVISION_BY_ZERO",
    });
  }
  return trim(left.map((coefficient) => coefficient.divide(right[0])));
}

export function exactPolynomialForIntegralFromAst(node) {
  switch (node?.type) {
    case "number":
      return constantPolynomial(ExactRational.parse(node.value));
    case "symbol":
      if (node.name === "x") return variablePolynomial();
      throw new ExactPolynomialIntegralError(`変数${node.name}には対応していません。`, {
        code: "UNSUPPORTED_SYMBOL",
        unsupported: true,
      });
    case "constant":
    case "call":
      throw new ExactPolynomialIntegralError(
        "関数や数学定数を含む定積分は未対応です。初期の厳密定積分は有理係数多項式だけに対応しています。",
        { code: "UNSUPPORTED_FUNCTION", unsupported: true },
      );
    case "unary": {
      const value = exactPolynomialForIntegralFromAst(node.argument);
      return node.operator === "-"
        ? trim(value.map((coefficient) => coefficient.negate()))
        : value;
    }
    case "binary": {
      if (node.operator === "^") {
        const exponent = integerLiteral(node.right);
        if (exponent === null) {
          throw new ExactPolynomialIntegralError(
            "多項式の指数は整数リテラルで指定してください。",
            { code: "UNSUPPORTED_EXPONENT", unsupported: true },
          );
        }
        const base = exactPolynomialForIntegralFromAst(node.left);
        return polynomialPower(base, exponent, node.left);
      }
      const left = exactPolynomialForIntegralFromAst(node.left);
      const right = exactPolynomialForIntegralFromAst(node.right);
      if (node.operator === "+") return add(left, right);
      if (node.operator === "-") return add(left, right, -1n);
      if (node.operator === "*") return multiply(left, right);
      if (node.operator === "/") return divide(left, right, node.right);
      throw new ExactPolynomialIntegralError(`演算子${node.operator}には対応していません。`, {
        code: "UNSUPPORTED_OPERATOR",
        unsupported: true,
      });
    }
    default:
      throw new ExactPolynomialIntegralError("未知の数式要素です。", {
        code: "UNKNOWN_AST_NODE",
      });
  }
}

export function exactRationalConstantFromAst(node) {
  switch (node?.type) {
    case "number":
      return ExactRational.parse(node.value);
    case "unary": {
      const value = exactRationalConstantFromAst(node.argument);
      return node.operator === "-" ? value.negate() : value;
    }
    case "binary": {
      if (node.operator === "^") {
        const exponent = integerLiteral(node.right);
        if (
          exponent === null
          || exponent < -MAX_ABSOLUTE_CONSTANT_EXPONENT
          || exponent > MAX_ABSOLUTE_CONSTANT_EXPONENT
        ) {
          throw new ExactPolynomialIntegralError(
            `端点の指数は絶対値${MAX_ABSOLUTE_CONSTANT_EXPONENT}以下の整数にしてください。`,
            { code: "UNSUPPORTED_BOUND_EXPONENT", unsupported: true },
          );
        }
        return exactRationalConstantFromAst(node.left).pow(exponent);
      }
      const left = exactRationalConstantFromAst(node.left);
      const right = exactRationalConstantFromAst(node.right);
      if (node.operator === "+") return left.add(right);
      if (node.operator === "-") return left.subtract(right);
      if (node.operator === "*") return left.multiply(right);
      if (node.operator === "/") return left.divide(right);
      break;
    }
    case "symbol":
    case "constant":
    case "call":
      throw new ExactPolynomialIntegralError(
        "定積分の上下限は、順序と値を厳密に確定できる有理数で指定してください。",
        { code: "NON_RATIONAL_BOUND", unsupported: true },
      );
    default:
      break;
  }
  throw new ExactPolynomialIntegralError("定積分の上下限を厳密分数として解釈できません。", {
    code: "INVALID_BOUND",
  });
}

export function integrateExactPolynomial(coefficients) {
  if (
    !Array.isArray(coefficients)
    || !coefficients.length
    || coefficients.some((coefficient) => !(coefficient instanceof ExactRational))
  ) {
    throw new TypeError("厳密多項式の係数が必要です。");
  }
  if (coefficients.length - 1 > MAX_POLYNOMIAL_DEGREE) {
    throw new ExactPolynomialIntegralError(
      `定積分する多項式の次数は${MAX_POLYNOMIAL_DEGREE}以下にしてください。`,
      { code: "DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  return Object.freeze([
    ExactRational.zero(),
    ...coefficients.map((coefficient, index) => (
      coefficient.divide(new ExactRational(BigInt(index + 1)))
    )),
  ]);
}

export function evaluateExactPolynomialForIntegral(coefficients, value) {
  if (
    !Array.isArray(coefficients)
    || !coefficients.length
    || coefficients.some((coefficient) => !(coefficient instanceof ExactRational))
  ) {
    throw new TypeError("厳密多項式の係数が必要です。");
  }
  if (!(value instanceof ExactRational)) {
    throw new TypeError("代入値は厳密分数で指定してください。");
  }
  return coefficients.reduceRight(
    (sum, coefficient) => sum.multiply(value).add(coefficient),
    ExactRational.zero(),
  );
}

export function evaluateExactDefinitePolynomialIntegral(coefficients, lower, upper) {
  const antiderivative = integrateExactPolynomial(coefficients);
  const lowerValue = evaluateExactPolynomialForIntegral(antiderivative, lower);
  const upperValue = evaluateExactPolynomialForIntegral(antiderivative, upper);
  return Object.freeze({
    antiderivative,
    lowerValue,
    upperValue,
    value: upperValue.subtract(lowerValue),
  });
}

export function formatExactPolynomialForIntegral(coefficients) {
  const terms = [];
  for (let exponent = coefficients.length - 1; exponent >= 0; exponent -= 1) {
    const coefficient = coefficients[exponent];
    if (coefficient.isZero()) continue;
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? coefficient.negate() : coefficient;
    const variable = exponent === 0 ? "" : exponent === 1 ? "x" : `x^${exponent}`;
    const coefficientText = variable && magnitude.equals(ExactRational.one())
      ? ""
      : variable && magnitude.denominator !== 1n
        ? `(${magnitude})`
        : String(magnitude);
    const term = `${coefficientText}${variable}`;
    if (!terms.length) terms.push(`${negative ? "-" : ""}${term}`);
    else terms.push(`${negative ? "-" : "+"}${term}`);
  }
  return terms.join("") || "0";
}

export { MAX_POLYNOMIAL_DEGREE };
