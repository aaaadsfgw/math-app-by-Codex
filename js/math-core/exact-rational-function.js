import { ExactRational } from "./exact-rational.js";

const MAX_INTERMEDIATE_DEGREE = 4;
const MAX_DOMAIN_FACTOR_DEGREE = 2;
const MAX_DOMAIN_FACTORS = 10;
const MAX_ABSOLUTE_EXPONENT = 2n;

const DEFAULT_PROFILE = Object.freeze({
  maxIntermediateDegree: MAX_INTERMEDIATE_DEGREE,
  maxDomainFactorDegree: MAX_DOMAIN_FACTOR_DEGREE,
  maxDomainFactors: MAX_DOMAIN_FACTORS,
  maxAbsoluteExponent: MAX_ABSOLUTE_EXPONENT,
});

const FINITE_LIMIT_PROFILE = Object.freeze({
  maxIntermediateDegree: 4,
  maxDomainFactorDegree: 4,
  maxDomainFactors: 10,
  maxAbsoluteExponent: 4n,
});

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

function multiplyPolynomials(left, right, profile) {
  const degree = exactRationalPolynomialDegree(left) + exactRationalPolynomialDegree(right);
  if (degree > profile.maxIntermediateDegree) {
    throw new ExactRationalFunctionError(
      `有理式の途中次数が${profile.maxIntermediateDegree}を超えます。`,
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

export function multiplyExactRationalPolynomials(left, right) {
  return multiplyPolynomials(left, right, DEFAULT_PROFILE);
}

function powerPolynomial(base, exponent, profile) {
  let output = onePolynomial();
  for (let count = 0n; count < exponent; count += 1n) {
    output = multiplyPolynomials(output, base, profile);
  }
  return output;
}

function polynomialKey(polynomial) {
  return polynomial.map(String).join("|");
}

function mergeDomainFactors(profile, ...groups) {
  const factors = new Map();
  for (const group of groups) {
    for (const factor of group) {
      if (isZeroExactRationalPolynomial(factor)) {
        throw new ExactRationalFunctionError("分母が恒等的に0です。", {
          code: "ZERO_DENOMINATOR",
        });
      }
      if (exactRationalPolynomialDegree(factor) === 0) continue;
      if (exactRationalPolynomialDegree(factor) > profile.maxDomainFactorDegree) {
        throw new ExactRationalFunctionError(
          profile.maxDomainFactorDegree === 2
            ? "三次以上の式を分母の定義域として解決できません。"
            : `${profile.maxDomainFactorDegree + 1}次以上の式を分母の定義域として解決できません。`,
          { code: "DOMAIN_FACTOR_DEGREE_TOO_HIGH", unsupported: true },
        );
      }
      factors.set(polynomialKey(factor), factor);
    }
  }
  if (factors.size > profile.maxDomainFactors) {
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
}, profile) {
  if (isZeroExactRationalPolynomial(denominator)) {
    throw new ExactRationalFunctionError("分母が恒等的に0です。", {
      code: "ZERO_DENOMINATOR",
    });
  }
  return Object.freeze({
    numerator,
    denominator,
    domainFactors: mergeDomainFactors(profile, domainFactors),
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

function addFunctions(left, right, sign, profile) {
  const leftNumerator = multiplyPolynomials(
    left.numerator,
    right.denominator,
    profile,
  );
  const rightNumerator = multiplyPolynomials(
    right.numerator,
    left.denominator,
    profile,
  );
  return rationalFunction({
    numerator: addPolynomials(leftNumerator, rightNumerator, sign),
    denominator: multiplyPolynomials(left.denominator, right.denominator, profile),
    domainFactors: mergeDomainFactors(profile, left.domainFactors, right.domainFactors),
    hasVariableDenominator: left.hasVariableDenominator || right.hasVariableDenominator,
  }, profile);
}

function multiplyFunctions(left, right, profile) {
  return rationalFunction({
    numerator: multiplyPolynomials(left.numerator, right.numerator, profile),
    denominator: multiplyPolynomials(left.denominator, right.denominator, profile),
    domainFactors: mergeDomainFactors(profile, left.domainFactors, right.domainFactors),
    hasVariableDenominator: left.hasVariableDenominator || right.hasVariableDenominator,
  }, profile);
}

function divideFunctions(left, right, rightAst, profile) {
  if (isZeroExactRationalPolynomial(right.numerator)) {
    throw new ExactRationalFunctionError("0では割れません。", {
      code: "DIVISION_BY_ZERO",
    });
  }
  return rationalFunction({
    numerator: multiplyPolynomials(left.numerator, right.denominator, profile),
    denominator: multiplyPolynomials(left.denominator, right.numerator, profile),
    domainFactors: mergeDomainFactors(
      profile,
      left.domainFactors,
      right.domainFactors,
      [right.numerator],
    ),
    hasVariableDenominator: left.hasVariableDenominator
      || right.hasVariableDenominator
      || containsVariable(rightAst),
  }, profile);
}

function powerFunction(base, exponent, baseAst, profile) {
  if (
    exponent < -profile.maxAbsoluteExponent
    || exponent > profile.maxAbsoluteExponent
  ) {
    throw new ExactRationalFunctionError(
      `有理式の指数は-${profile.maxAbsoluteExponent}以上${profile.maxAbsoluteExponent}以下の整数にしてください。`,
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
        ? mergeDomainFactors(profile, base.domainFactors, [base.numerator])
        : base.domainFactors,
      hasVariableDenominator: base.hasVariableDenominator || variableBase,
    }, profile);
  }
  if (exponent > 0n) {
    return rationalFunction({
      numerator: powerPolynomial(base.numerator, exponent, profile),
      denominator: powerPolynomial(base.denominator, exponent, profile),
      domainFactors: base.domainFactors,
      hasVariableDenominator: base.hasVariableDenominator,
    }, profile);
  }
  if (isZeroExactRationalPolynomial(base.numerator)) {
    throw new ExactRationalFunctionError("0を負の指数で累乗できません。", {
      code: "ZERO_TO_NEGATIVE_POWER",
    });
  }
  const magnitude = -exponent;
  return rationalFunction({
    numerator: powerPolynomial(base.denominator, magnitude, profile),
    denominator: powerPolynomial(base.numerator, magnitude, profile),
    domainFactors: mergeDomainFactors(profile, base.domainFactors, [base.numerator]),
    hasVariableDenominator: base.hasVariableDenominator || containsVariable(baseAst),
  }, profile);
}

function rationalFunctionFromAst(node, profile) {
  switch (node?.type) {
    case "number":
      return rationalFunction({
        numerator: constantPolynomial(ExactRational.parse(node.value)),
        denominator: onePolynomial(),
      }, profile);
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
      }, profile);
    case "constant":
    case "call":
      throw new ExactRationalFunctionError(
        "関数や数学定数を含む有理方程式には対応していません。",
        { code: "UNSUPPORTED_FUNCTION", unsupported: true },
      );
    case "unary": {
      const value = rationalFunctionFromAst(node.argument, profile);
      if (node.operator !== "-") return value;
      return rationalFunction({
        numerator: Object.freeze(value.numerator.map((coefficient) => coefficient.negate())),
        denominator: value.denominator,
        domainFactors: value.domainFactors,
        hasVariableDenominator: value.hasVariableDenominator,
      }, profile);
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
          rationalFunctionFromAst(node.left, profile),
          exponent,
          node.left,
          profile,
        );
      }
      const left = rationalFunctionFromAst(node.left, profile);
      const right = rationalFunctionFromAst(node.right, profile);
      if (node.operator === "+") return addFunctions(left, right, 1n, profile);
      if (node.operator === "-") return addFunctions(left, right, -1n, profile);
      if (node.operator === "*") return multiplyFunctions(left, right, profile);
      if (node.operator === "/") return divideFunctions(left, right, node.right, profile);
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

export function exactRationalFunctionFromAst(node) {
  return rationalFunctionFromAst(node, DEFAULT_PROFILE);
}

export function exactRationalFunctionForFiniteLimitFromAst(node) {
  return rationalFunctionFromAst(node, FINITE_LIMIT_PROFILE);
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
