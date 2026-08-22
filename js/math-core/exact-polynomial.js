import { ExactRational } from "./exact-rational.js";

const MAX_INTERMEDIATE_DEGREE = 4;

export class ExactPolynomialError extends Error {
  constructor(message, { code = "EXACT_POLYNOMIAL_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactPolynomialError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function trimCoefficients(coefficients) {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last].isZero()) last -= 1;
  return coefficients.slice(0, last + 1);
}

function polynomial(coefficients = [ExactRational.zero()]) {
  return Object.freeze(trimCoefficients(coefficients));
}

function degree(value) {
  return value.length - 1;
}

function constant(value) {
  return polynomial([value]);
}

function variable() {
  return polynomial([ExactRational.zero(), ExactRational.one()]);
}

function add(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  const length = Math.max(left.length, right.length);
  return polynomial(Array.from({ length }, (_, index) => (
    (left[index] ?? ExactRational.zero())
      .add((right[index] ?? ExactRational.zero()).multiply(multiplier))
  )));
}

function multiply(left, right, maxIntermediateDegree = MAX_INTERMEDIATE_DEGREE) {
  const resultDegree = degree(left) + degree(right);
  if (resultDegree > maxIntermediateDegree) {
    throw new ExactPolynomialError(
      `多項式の途中次数が${maxIntermediateDegree}を超えます。`,
      {
        code: "DEGREE_TOO_HIGH",
        unsupported: true,
      },
    );
  }
  const coefficients = Array.from(
    { length: resultDegree + 1 },
    () => ExactRational.zero(),
  );
  for (let leftDegree = 0; leftDegree < left.length; leftDegree += 1) {
    for (let rightDegree = 0; rightDegree < right.length; rightDegree += 1) {
      if (left[leftDegree].isZero() || right[rightDegree].isZero()) continue;
      const termDegree = leftDegree + rightDegree;
      coefficients[termDegree] = coefficients[termDegree]
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

function power(base, exponentPolynomial, maxIntermediateDegree = MAX_INTERMEDIATE_DEGREE) {
  if (degree(exponentPolynomial) !== 0 || exponentPolynomial[0].denominator !== 1n) {
    throw new ExactPolynomialError(
      `指数は0以上${maxIntermediateDegree}以下の整数にしてください。`,
      {
        code: "UNSUPPORTED_EXPONENT",
        unsupported: true,
      },
    );
  }
  const exponent = exponentPolynomial[0].numerator;
  if (exponent < 0n || exponent > BigInt(maxIntermediateDegree)) {
    throw new ExactPolynomialError(
      `指数は0以上${maxIntermediateDegree}以下の整数にしてください。`,
      {
        code: "UNSUPPORTED_EXPONENT",
        unsupported: true,
      },
    );
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
    output = multiply(output, base, maxIntermediateDegree);
  }
  return output;
}

function parsedPolynomial(coefficients, sourceDegree) {
  return { coefficients, sourceDegree };
}

function requireSourceDegree(sourceDegree, maxIntermediateDegree) {
  if (sourceDegree <= maxIntermediateDegree) return sourceDegree;
  throw new ExactPolynomialError(
    `多項式の途中次数が${maxIntermediateDegree}を超えます。`,
    {
      code: "DEGREE_TOO_HIGH",
      unsupported: true,
    },
  );
}

function normalizeMaxIntermediateDegree(value) {
  if (
    !Number.isSafeInteger(value)
    || value < 1
    || value > MAX_INTERMEDIATE_DEGREE
  ) {
    throw new ExactPolynomialError(
      `途中次数の上限は1以上${MAX_INTERMEDIATE_DEGREE}以下の整数にしてください。`,
      { code: "INVALID_MAX_INTERMEDIATE_DEGREE" },
    );
  }
  return value;
}

function polynomialFromAst(node, maxIntermediateDegree) {
  switch (node?.type) {
    case "number":
      return parsedPolynomial(constant(ExactRational.parse(node.value)), 0);
    case "symbol":
      if (node.name === "x") return parsedPolynomial(variable(), 1);
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
      const value = polynomialFromAst(node.argument, maxIntermediateDegree);
      return parsedPolynomial(
        node.operator === "-"
          ? polynomial(value.coefficients.map((coefficient) => coefficient.negate()))
          : value.coefficients,
        value.sourceDegree,
      );
    }
    case "binary": {
      const left = polynomialFromAst(node.left, maxIntermediateDegree);
      const right = polynomialFromAst(node.right, maxIntermediateDegree);
      if (node.operator === "+" || node.operator === "-") {
        return parsedPolynomial(
          add(
            left.coefficients,
            right.coefficients,
            node.operator === "-" ? -1n : 1n,
          ),
          Math.max(left.sourceDegree, right.sourceDegree),
        );
      }
      if (node.operator === "*") {
        const sourceDegree = requireSourceDegree(
          left.sourceDegree + right.sourceDegree,
          maxIntermediateDegree,
        );
        return parsedPolynomial(
          multiply(left.coefficients, right.coefficients, maxIntermediateDegree),
          sourceDegree,
        );
      }
      if (node.operator === "/") {
        if (right.sourceDegree !== 0) {
          throw new ExactPolynomialError("xを含む式では割れません。", {
            code: "VARIABLE_DENOMINATOR",
            unsupported: true,
          });
        }
        return parsedPolynomial(
          divide(left.coefficients, right.coefficients),
          left.sourceDegree,
        );
      }
      if (node.operator === "^") {
        if (right.sourceDegree !== 0) {
          throw new ExactPolynomialError(
            `指数は0以上${maxIntermediateDegree}以下の整数にしてください。`,
            {
              code: "UNSUPPORTED_EXPONENT",
              unsupported: true,
            },
          );
        }
        const exponent = right.coefficients.length === 1
          && right.coefficients[0].denominator === 1n
          ? right.coefficients[0].numerator
          : null;
        const coefficients = power(
          left.coefficients,
          right.coefficients,
          maxIntermediateDegree,
        );
        const sourceDegree = requireSourceDegree(
          left.sourceDegree * Number(exponent),
          maxIntermediateDegree,
        );
        return parsedPolynomial(
          coefficients,
          sourceDegree,
        );
      }
      throw new ExactPolynomialError(`演算子${node.operator}には対応していません。`, {
        code: "UNSUPPORTED_OPERATOR",
        unsupported: true,
      });
    }
    default:
      throw new ExactPolynomialError("未知の数式要素です。", { code: "UNKNOWN_AST_NODE" });
  }
}

export function exactPolynomialFromAst(
  node,
  { maxIntermediateDegree = MAX_INTERMEDIATE_DEGREE } = {},
) {
  return polynomialFromAst(
    node,
    normalizeMaxIntermediateDegree(maxIntermediateDegree),
  ).coefficients;
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
