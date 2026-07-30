import { ExactRational } from "./exact-rational.js";

const MAX_INTERMEDIATE_DEGREE = 4;
const MAX_DOMAIN_FACTOR_DEGREE = 2;
const MAX_DOMAIN_FACTORS = 10;
const MAX_ABSOLUTE_EXPONENT = 2n;

export class ExactRationalFunctionError extends Error {
  constructor(message, { code = "EXACT_RATIONAL_FUNCTION_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactRationalFunctionError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function zeroPolynomial() {
  return Object.freeze([ExactRational.zero()]);
}

function onePolynomial() {
  return Object.freeze([ExactRational.one()]);
}

function trimPolynomial(coefficients) {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last].isZero()) last -= 1;
  return Object.freeze(coefficients.slice(0, last + 1));
}

function constantPolynomial(value) {
  return Object.freeze([value]);
}

function variablePolynomial() {
  return Object.freeze([ExactRational.zero(), ExactRational.one()]);
}

export function exactRationalPolynomialDegree(polynomial) {
  return polynomial.length - 1;
}

export function isZeroExactRationalPolynomial(polynomial) {
  return polynomial.length === 1 && polynomial[0].isZero();
}

function addPolynomials(left, right, sign = 1n) {
  const length = Math.max(left.length, right.length);
  const multiplier = new ExactRational(sign);
  const output = Array.from({ length }, (_, index) => (
    (left[index] ?? ExactRational.zero())
      .add((right[index] ?? ExactRational.zero()).multiply(multiplier))
  ));
  return trimPolynomial(output);
}

export function subtractExactRationalPolynomials(left, right) {
  return addPolynomials(left, right, -1n);
}

export function multiplyExactRationalPolynomials(left, right) {
  const degree = exactRationalPolynomialDegree(left) + exactRationalPolynomialDegree(right);
  if (degree > MAX_INTERMEDIATE_DEGREE) {
    throw new ExactRationalFunctionError(
      `有理式の途中次数が${MAX_INTERMEDIATE_DEGREE}を超えます。`,
      { code: "INTERMEDIATE_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const output = Array.from(
    { length: degree + 1 },
    () => ExactRational.zero(),
  );
  for (let leftDegree = 0; leftDegree < left.length; leftDegree += 1) {
    for (let rightDegree = 0; rightDegree < right.length; rightDegree += 1) {
      if (left[leftDegree].isZero() || right[rightDegree].isZero()) continue;
      const resultDegree = leftDegree + rightDegree;
      output[resultDegree] = output[resultDegree]
        .add(left[leftDegree].multiply(right[rightDegree]));
    }
  }
  return trimPolynomial(output);
}

function powerPolynomial(base, exponent) {
  let output = onePolynomial();
  for (let count = 0n; count < exponent; count += 1n) {
    output = multiplyExactRationalPolynomials(output, base);
  }
  return output;
}

function polynomialKey(polynomial) {
  return polynomial.map(String).join("|");
}

function mergeDomainFactors(...groups) {
  const factors = new Map();
  for (const group of groups) {
    for (const factor of group) {
      if (isZeroExactRationalPolynomial(factor)) {
        throw new ExactRationalFunctionError("分母が恒等的に0です。", {
          code: "ZERO_DENOMINATOR",
        });
      }
      if (exactRationalPolynomialDegree(factor) === 0) continue;
      if (exactRationalPolynomialDegree(factor) > MAX_DOMAIN_FACTOR_DEGREE) {
        throw new ExactRationalFunctionError(
          "三次以上の式を分母の定義域として解決できません。",
          { code: "DOMAIN_FACTOR_DEGREE_TOO_HIGH", unsupported: true },
        );
      }
      factors.set(polynomialKey(factor), factor);
    }
  }
  if (factors.size > MAX_DOMAIN_FACTORS) {
    throw new ExactRationalFunctionError("分母条件が多すぎます。", {
      code: "TOO_MANY_DOMAIN_FACTORS",
      unsupported: true,
    });
  }
  return Object.freeze([...factors.values()]);
}

function rationalFunction({
  numerator,
  denominator,
  domainFactors = [],
  hasVariableDenominator = false,
}) {
  if (isZeroExactRationalPolynomial(denominator)) {
    throw new ExactRationalFunctionError("分母が恒等的に0です。", {
      code: "ZERO_DENOMINATOR",
    });
  }
  return Object.freeze({
    numerator,
    denominator,
    domainFactors: mergeDomainFactors(domainFactors),
    hasVariableDenominator,
  });
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

function addFunctions(left, right, sign = 1n) {
  const leftNumerator = multiplyExactRationalPolynomials(
    left.numerator,
    right.denominator,
  );
  const rightNumerator = multiplyExactRationalPolynomials(
    right.numerator,
    left.denominator,
  );
  return rationalFunction({
    numerator: addPolynomials(leftNumerator, rightNumerator, sign),
    denominator: multiplyExactRationalPolynomials(left.denominator, right.denominator),
    domainFactors: mergeDomainFactors(left.domainFactors, right.domainFactors),
    hasVariableDenominator: left.hasVariableDenominator || right.hasVariableDenominator,
  });
}

function multiplyFunctions(left, right) {
  return rationalFunction({
    numerator: multiplyExactRationalPolynomials(left.numerator, right.numerator),
    denominator: multiplyExactRationalPolynomials(left.denominator, right.denominator),
    domainFactors: mergeDomainFactors(left.domainFactors, right.domainFactors),
    hasVariableDenominator: left.hasVariableDenominator || right.hasVariableDenominator,
  });
}

function divideFunctions(left, right, rightAst) {
  if (isZeroExactRationalPolynomial(right.numerator)) {
    throw new ExactRationalFunctionError("0では割れません。", {
      code: "DIVISION_BY_ZERO",
    });
  }
  return rationalFunction({
    numerator: multiplyExactRationalPolynomials(left.numerator, right.denominator),
    denominator: multiplyExactRationalPolynomials(left.denominator, right.numerator),
    domainFactors: mergeDomainFactors(
      left.domainFactors,
      right.domainFactors,
      [right.numerator],
    ),
    hasVariableDenominator: left.hasVariableDenominator
      || right.hasVariableDenominator
      || containsVariable(rightAst),
  });
}

function powerFunction(base, exponent, baseAst) {
  if (exponent < -MAX_ABSOLUTE_EXPONENT || exponent > MAX_ABSOLUTE_EXPONENT) {
    throw new ExactRationalFunctionError(
      `有理式の指数は-${MAX_ABSOLUTE_EXPONENT}以上${MAX_ABSOLUTE_EXPONENT}以下の整数にしてください。`,
      { code: "UNSUPPORTED_EXPONENT", unsupported: true },
    );
  }
  if (exponent === 0n) {
    if (isZeroExactRationalPolynomial(base.numerator)) {
      throw new ExactRationalFunctionError("0の0乗は扱えません。", {
        code: "ZERO_TO_ZERO",
      });
    }
    const variableBase = exactRationalPolynomialDegree(base.numerator) > 0;
    return rationalFunction({
      numerator: onePolynomial(),
      denominator: onePolynomial(),
      domainFactors: variableBase
        ? mergeDomainFactors(base.domainFactors, [base.numerator])
        : base.domainFactors,
      hasVariableDenominator: base.hasVariableDenominator || variableBase,
    });
  }
  if (exponent > 0n) {
    return rationalFunction({
      numerator: powerPolynomial(base.numerator, exponent),
      denominator: powerPolynomial(base.denominator, exponent),
      domainFactors: base.domainFactors,
      hasVariableDenominator: base.hasVariableDenominator,
    });
  }
  if (isZeroExactRationalPolynomial(base.numerator)) {
    throw new ExactRationalFunctionError("0を負の指数で累乗できません。", {
      code: "ZERO_TO_NEGATIVE_POWER",
    });
  }
  const magnitude = -exponent;
  return rationalFunction({
    numerator: powerPolynomial(base.denominator, magnitude),
    denominator: powerPolynomial(base.numerator, magnitude),
    domainFactors: mergeDomainFactors(base.domainFactors, [base.numerator]),
    hasVariableDenominator: base.hasVariableDenominator || containsVariable(baseAst),
  });
}

export function exactRationalFunctionFromAst(node) {
  switch (node?.type) {
    case "number":
      return rationalFunction({
        numerator: constantPolynomial(ExactRational.parse(node.value)),
        denominator: onePolynomial(),
      });
    case "symbol":
      if (node.name !== "x") {
        throw new ExactRationalFunctionError(`変数${node.name}には対応していません。`, {
          code: "UNSUPPORTED_SYMBOL",
          unsupported: true,
        });
      }
      return rationalFunction({
        numerator: variablePolynomial(),
        denominator: onePolynomial(),
      });
    case "constant":
    case "call":
      throw new ExactRationalFunctionError(
        "関数や数学定数を含む有理方程式には対応していません。",
        { code: "UNSUPPORTED_FUNCTION", unsupported: true },
      );
    case "unary": {
      const value = exactRationalFunctionFromAst(node.argument);
      if (node.operator !== "-") return value;
      return rationalFunction({
        numerator: Object.freeze(value.numerator.map((coefficient) => coefficient.negate())),
        denominator: value.denominator,
        domainFactors: value.domainFactors,
        hasVariableDenominator: value.hasVariableDenominator,
      });
    }
    case "binary": {
      if (node.operator === "^") {
        const exponent = integerLiteral(node.right);
        if (exponent === null) {
          throw new ExactRationalFunctionError(
            "有理式の指数は整数リテラルで指定してください。",
            { code: "UNSUPPORTED_EXPONENT", unsupported: true },
          );
        }
        return powerFunction(
          exactRationalFunctionFromAst(node.left),
          exponent,
          node.left,
        );
      }
      const left = exactRationalFunctionFromAst(node.left);
      const right = exactRationalFunctionFromAst(node.right);
      if (node.operator === "+") return addFunctions(left, right);
      if (node.operator === "-") return addFunctions(left, right, -1n);
      if (node.operator === "*") return multiplyFunctions(left, right);
      if (node.operator === "/") return divideFunctions(left, right, node.right);
      throw new ExactRationalFunctionError(`演算子${node.operator}には対応していません。`, {
        code: "UNSUPPORTED_OPERATOR",
        unsupported: true,
      });
    }
    default:
      throw new ExactRationalFunctionError("未知の数式要素です。", {
        code: "UNKNOWN_AST_NODE",
      });
  }
}

export function exactRationalEquationPolynomial(left, right) {
  return subtractExactRationalPolynomials(
    multiplyExactRationalPolynomials(left.numerator, right.denominator),
    multiplyExactRationalPolynomials(right.numerator, left.denominator),
  );
}

export function formatExactRationalPolynomial(polynomial) {
  const terms = [];
  for (let degree = polynomial.length - 1; degree >= 0; degree -= 1) {
    const coefficient = polynomial[degree];
    if (coefficient.isZero()) continue;
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? coefficient.negate() : coefficient;
    const variable = degree === 0 ? "" : degree === 1 ? "x" : `x^${degree}`;
    const magnitudeText = magnitude.toString();
    const coefficientText = variable && magnitude.equals(ExactRational.one())
      ? ""
      : variable && magnitude.denominator !== 1n
        ? `(${magnitudeText})`
        : magnitudeText;
    const term = `${coefficientText}${variable}`;
    if (!terms.length) terms.push(`${negative ? "-" : ""}${term}`);
    else terms.push(`${negative ? "-" : "+"}${term}`);
  }
  return terms.join("") || "0";
}
