import { ExactRational } from "./exact-rational.js";

const MAX_DEGREE = 2;

export class ExactPolynomialError extends Error {
  constructor(message, { code = "EXACT_POLYNOMIAL_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactPolynomialError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function zeroCoefficients() {
  return Array.from({ length: MAX_DEGREE + 1 }, () => ExactRational.zero());
}

function polynomial(coefficients = zeroCoefficients()) {
  return Object.freeze(coefficients);
}

function degree(value) {
  for (let index = MAX_DEGREE; index >= 0; index -= 1) {
    if (!value[index].isZero()) return index;
  }
  return 0;
}

function constant(value) {
  const coefficients = zeroCoefficients();
  coefficients[0] = value;
  return polynomial(coefficients);
}

function variable() {
  const coefficients = zeroCoefficients();
  coefficients[1] = ExactRational.one();
  return polynomial(coefficients);
}

function add(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return polynomial(left.map((coefficient, index) => (
    coefficient.add(right[index].multiply(multiplier))
  )));
}

function multiply(left, right) {
  const coefficients = zeroCoefficients();
  for (let leftDegree = 0; leftDegree <= MAX_DEGREE; leftDegree += 1) {
    for (let rightDegree = 0; rightDegree <= MAX_DEGREE; rightDegree += 1) {
      if (left[leftDegree].isZero() || right[rightDegree].isZero()) continue;
      const resultDegree = leftDegree + rightDegree;
      if (resultDegree > MAX_DEGREE) {
        throw new ExactPolynomialError("三次以上の式には対応していません。", {
          code: "DEGREE_TOO_HIGH",
          unsupported: true,
        });
      }
      coefficients[resultDegree] = coefficients[resultDegree]
        .add(left[leftDegree].multiply(right[rightDegree]));
    }
  }
  return polynomial(coefficients);
}

function divide(left, right) {
  if (degree(right) !== 0) {
    throw new ExactPolynomialError("xを含む式では割れません。", {
      code: "VARIABLE_DENOMINATOR",
      unsupported: true,
    });
  }
  if (right[0].isZero()) {
    throw new ExactPolynomialError("0では割れません。", { code: "DIVISION_BY_ZERO" });
  }
  return polynomial(left.map((coefficient) => coefficient.divide(right[0])));
}

function power(base, exponentPolynomial) {
  if (degree(exponentPolynomial) !== 0 || exponentPolynomial[0].denominator !== 1n) {
    throw new ExactPolynomialError("指数は0以上2以下の整数にしてください。", {
      code: "UNSUPPORTED_EXPONENT",
      unsupported: true,
    });
  }
  const exponent = exponentPolynomial[0].numerator;
  if (exponent < 0n || exponent > BigInt(MAX_DEGREE)) {
    throw new ExactPolynomialError("指数は0以上2以下の整数にしてください。", {
      code: "UNSUPPORTED_EXPONENT",
      unsupported: true,
    });
  }
  if (exponent === 0n && degree(base) === 0 && base[0].isZero()) {
    throw new ExactPolynomialError("0の0乗は扱えません。", {
      code: "ZERO_TO_ZERO",
    });
  }
  if (exponent === 0n && degree(base) > 0) {
    throw new ExactPolynomialError("変数を含む式の0乗は定義域の分岐が必要です。", {
      code: "ZERO_POWER_DOMAIN",
      unsupported: true,
    });
  }
  let output = constant(ExactRational.one());
  for (let count = 0n; count < exponent; count += 1n) {
    output = multiply(output, base);
  }
  return output;
}

export function exactPolynomialFromAst(node) {
  switch (node?.type) {
    case "number":
      return constant(ExactRational.parse(node.value));
    case "symbol":
      if (node.name === "x") return variable();
      throw new ExactPolynomialError(`変数${node.name}には対応していません。`, {
        code: "UNSUPPORTED_SYMBOL",
        unsupported: true,
      });
    case "constant":
    case "call":
      throw new ExactPolynomialError("関数や数学定数を含む多項式には対応していません。", {
        code: "UNSUPPORTED_FUNCTION",
        unsupported: true,
      });
    case "unary": {
      const value = exactPolynomialFromAst(node.argument);
      return node.operator === "-"
        ? polynomial(value.map((coefficient) => coefficient.negate()))
        : value;
    }
    case "binary": {
      const left = exactPolynomialFromAst(node.left);
      const right = exactPolynomialFromAst(node.right);
      if (node.operator === "+") return add(left, right);
      if (node.operator === "-") return add(left, right, -1n);
      if (node.operator === "*") return multiply(left, right);
      if (node.operator === "/") return divide(left, right);
      if (node.operator === "^") return power(left, right);
      throw new ExactPolynomialError(`演算子${node.operator}には対応していません。`, {
        code: "UNSUPPORTED_OPERATOR",
        unsupported: true,
      });
    }
    default:
      throw new ExactPolynomialError("未知の数式要素です。", { code: "UNKNOWN_AST_NODE" });
  }
}

export function subtractExactPolynomials(left, right) {
  return add(left, right, -1n);
}

export function exactPolynomialDegree(value) {
  return degree(value);
}

export function evaluateExactPolynomial(coefficients, x) {
  return coefficients.reduceRight(
    (sum, coefficient) => sum.multiply(x).add(coefficient),
    ExactRational.zero(),
  );
}
