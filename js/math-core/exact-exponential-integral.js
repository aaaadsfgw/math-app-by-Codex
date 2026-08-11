import {
  ExactPolynomialIntegralError,
  evaluateExactDefinitePolynomialIntegral,
  exactPolynomialForIntegralFromAst,
  exactRationalConstantFromAst,
  formatExactPolynomialForIntegral,
  integrateExactPolynomial,
} from "./exact-polynomial-integral.js";
import { ExactRational } from "./exact-rational.js";

const MAX_EXPONENTIAL_TERMS = 32;

export class ExactExponentialIntegralError extends Error {
  constructor(message, { code = "EXACT_EXPONENTIAL_INTEGRAL_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactExponentialIntegralError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function zeroPolynomial() {
  return Object.freeze([ExactRational.zero()]);
}

function isZeroPolynomial(coefficients) {
  return coefficients.length === 1 && coefficients[0].isZero();
}

function trimPolynomial(coefficients) {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last].isZero()) last -= 1;
  return Object.freeze(coefficients.slice(0, last + 1));
}

function addPolynomials(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return trimPolynomial(Array.from(
    { length: Math.max(left.length, right.length) },
    (_, index) => (left[index] ?? ExactRational.zero())
      .add((right[index] ?? ExactRational.zero()).multiply(multiplier)),
  ));
}

function scalePolynomial(coefficients, scalar) {
  return trimPolynomial(coefficients.map((coefficient) => coefficient.multiply(scalar)));
}

function analysis(polynomial = zeroPolynomial(), exponentials = []) {
  const filteredExponentials = exponentials.filter(({ amplitude }) => !amplitude.isZero());
  if (filteredExponentials.length > MAX_EXPONENTIAL_TERMS) {
    throw new ExactExponentialIntegralError(
      `指数関数の項は${MAX_EXPONENTIAL_TERMS}個以下にしてください。`,
      { code: "TOO_MANY_EXPONENTIAL_TERMS", unsupported: true },
    );
  }
  return Object.freeze({
    polynomial,
    exponentials: Object.freeze(filteredExponentials.map((term) => Object.freeze(term))),
  });
}

function combineAnalyses(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return analysis(
    addPolynomials(left.polynomial, right.polynomial, sign),
    [
      ...left.exponentials,
      ...right.exponentials.map((term) => ({
        ...term,
        amplitude: term.amplitude.multiply(multiplier),
      })),
    ],
  );
}

function scaleAnalysis(value, scalar) {
  return analysis(
    scalePolynomial(value.polynomial, scalar),
    value.exponentials.map((term) => ({
      ...term,
      amplitude: term.amplitude.multiply(scalar),
    })),
  );
}

function tryExactRational(node) {
  try {
    return exactRationalConstantFromAst(node);
  } catch (error) {
    if (
      error instanceof ExactPolynomialIntegralError
      && [
        "INVALID_BOUND",
        "NON_RATIONAL_BOUND",
        "UNSUPPORTED_BOUND_EXPONENT",
      ].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}

function tryExactPolynomial(node) {
  try {
    return exactPolynomialForIntegralFromAst(node);
  } catch (error) {
    if (
      error instanceof ExactPolynomialIntegralError
      && [
        "UNSUPPORTED_EXPONENT",
        "UNSUPPORTED_FUNCTION",
        "UNSUPPORTED_SYMBOL",
      ].includes(error.code)
    ) {
      return null;
    }
    throw error;
  }
}

function affineExponent(node) {
  let coefficients;
  try {
    coefficients = exactPolynomialForIntegralFromAst(node);
  } catch (error) {
    if (error instanceof ExactPolynomialIntegralError && error.unsupported) {
      throw new ExactExponentialIntegralError(
        "expの指数は有理係数の一次式 ax+b にしてください。",
        { code: "NON_AFFINE_EXPONENT", unsupported: true },
      );
    }
    throw error;
  }
  if (coefficients.length > 2) {
    throw new ExactExponentialIntegralError(
      "expの指数は有理係数の一次式 ax+b にしてください。",
      { code: "NON_AFFINE_EXPONENT", unsupported: true },
    );
  }
  return Object.freeze({
    intercept: coefficients[0],
    slope: coefficients[1] ?? ExactRational.zero(),
  });
}

function exponentialTerm(argument, amplitude = ExactRational.one()) {
  const affine = affineExponent(argument);
  return analysis(zeroPolynomial(), [{ amplitude, ...affine }]);
}

function isEulerConstant(node) {
  return node?.type === "constant" && node.name === "e";
}

export function analyzeExactExponentialIntegrand(node) {
  const polynomial = tryExactPolynomial(node);
  if (polynomial) return analysis(polynomial);

  if (isEulerConstant(node)) {
    return analysis(zeroPolynomial(), [{
      amplitude: ExactRational.one(),
      slope: ExactRational.zero(),
      intercept: ExactRational.one(),
    }]);
  }
  if (node?.type === "call" && node.name === "exp" && node.args.length === 1) {
    return exponentialTerm(node.args[0]);
  }
  if (node?.type === "unary") {
    const value = analyzeExactExponentialIntegrand(node.argument);
    return node.operator === "-"
      ? scaleAnalysis(value, new ExactRational(-1n))
      : value;
  }
  if (node?.type === "binary") {
    if (node.operator === "^" && isEulerConstant(node.left)) {
      return exponentialTerm(node.right);
    }
    if (node.operator === "+" || node.operator === "-") {
      return combineAnalyses(
        analyzeExactExponentialIntegrand(node.left),
        analyzeExactExponentialIntegrand(node.right),
        node.operator === "-" ? -1n : 1n,
      );
    }
    if (node.operator === "*") {
      const leftScalar = tryExactRational(node.left);
      if (leftScalar) {
        return scaleAnalysis(analyzeExactExponentialIntegrand(node.right), leftScalar);
      }
      const rightScalar = tryExactRational(node.right);
      if (rightScalar) {
        return scaleAnalysis(analyzeExactExponentialIntegrand(node.left), rightScalar);
      }
      throw new ExactExponentialIntegralError(
        "指数関数とxや別の関数との積は、初期の厳密定積分では未対応です。",
        { code: "UNSUPPORTED_PRODUCT", unsupported: true },
      );
    }
    if (node.operator === "/") {
      const denominator = tryExactRational(node.right);
      if (!denominator) {
        throw new ExactExponentialIntegralError(
          "指数関数を変数式で割る定積分は未対応です。",
          { code: "VARIABLE_DENOMINATOR", unsupported: true },
        );
      }
      if (denominator.isZero()) {
        throw new ExactExponentialIntegralError("0では割れません。", {
          code: "DIVISION_BY_ZERO",
        });
      }
      return scaleAnalysis(
        analyzeExactExponentialIntegrand(node.left),
        ExactRational.one().divide(denominator),
      );
    }
  }

  throw new ExactExponentialIntegralError(
    "初期の指数関数定積分は、P(x)+Σq*exp(ax+b) の形に対応しています。",
    { code: "UNSUPPORTED_EXPONENTIAL_FORM", unsupported: true },
  );
}

function compareRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function exactExponentialSum(entries) {
  const combined = new Map();
  for (const { exponent, coefficient } of entries) {
    if (!(exponent instanceof ExactRational) || !(coefficient instanceof ExactRational)) {
      throw new TypeError("指数関数の厳密指数と係数が必要です。");
    }
    const key = exponent.toString();
    const previous = combined.get(key);
    combined.set(key, {
      exponent,
      coefficient: previous ? previous.coefficient.add(coefficient) : coefficient,
    });
  }
  const terms = [...combined.values()]
    .filter(({ coefficient }) => !coefficient.isZero())
    .sort((left, right) => {
      const leftNegative = left.coefficient.numerator < 0n;
      const rightNegative = right.coefficient.numerator < 0n;
      if (leftNegative !== rightNegative) return leftNegative ? 1 : -1;
      return -compareRationals(left.exponent, right.exponent);
    })
    .map((term) => Object.freeze(term));
  return Object.freeze({ terms: Object.freeze(terms) });
}

function magnitudeTerm(exponent, magnitude) {
  if (exponent.isZero()) return magnitude.toString();
  const atom = `exp(${exponent})`;
  const numerator = magnitude.numerator;
  const denominator = magnitude.denominator;
  if (denominator === 1n) return numerator === 1n ? atom : `${numerator}*${atom}`;
  return numerator === 1n
    ? `${atom}/${denominator}`
    : `${numerator}*${atom}/${denominator}`;
}

export function formatExactExponentialSum(value) {
  if (!value || !Array.isArray(value.terms)) {
    throw new TypeError("厳密指数関数和が必要です。");
  }
  if (!value.terms.length) return "0";
  return value.terms.map(({ exponent, coefficient }, index) => {
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? coefficient.negate() : coefficient;
    const body = magnitudeTerm(exponent, magnitude);
    if (index === 0) return `${negative ? "-" : ""}${body}`;
    return `${negative ? "-" : "+"}${body}`;
  }).join("");
}

function affineText(slope, intercept) {
  const slopeText = slope.isZero()
    ? ""
    : slope.equals(ExactRational.one())
      ? "x"
      : slope.equals(new ExactRational(-1n))
        ? "-x"
        : slope.denominator === 1n
          ? `${slope}*x`
          : `(${slope})*x`;
  if (intercept.isZero()) return slopeText || "0";
  if (!slopeText) return intercept.toString();
  return intercept.numerator < 0n
    ? `${slopeText}${intercept}`
    : `${slopeText}+${intercept}`;
}

function primitiveTermText(coefficient, body) {
  if (coefficient.equals(ExactRational.one())) return body;
  if (coefficient.equals(new ExactRational(-1n))) return `-${body}`;
  return coefficient.denominator === 1n
    ? `${coefficient}*${body}`
    : `(${coefficient})*${body}`;
}

function formatAntiderivative(value) {
  const pieces = [];
  if (!isZeroPolynomial(value.polynomial)) {
    pieces.push(formatExactPolynomialForIntegral(
      integrateExactPolynomial(value.polynomial),
    ));
  }
  for (const term of value.exponentials) {
    if (term.slope.isZero()) {
      pieces.push(primitiveTermText(
        term.amplitude,
        `exp(${term.intercept})*x`,
      ));
      continue;
    }
    const primitiveCoefficient = term.amplitude.divide(term.slope);
    if (!primitiveCoefficient.multiply(term.slope).equals(term.amplitude)) {
      throw new ExactExponentialIntegralError(
        "指数関数の原始関数係数を厳密に検算できませんでした。",
        { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
      );
    }
    pieces.push(primitiveTermText(
      primitiveCoefficient,
      `exp(${affineText(term.slope, term.intercept)})`,
    ));
  }
  return pieces.join(" + ").replace(/ \+ -/gu, " - ") || "0";
}

export function evaluateExactExponentialAnalysis(analyzed, lower, upper) {
  if (!(lower instanceof ExactRational) || !(upper instanceof ExactRational)) {
    throw new TypeError("指数関数定積分の上下限は厳密分数で指定してください。");
  }
  if (
    !analyzed
    || !Array.isArray(analyzed.polynomial)
    || !Array.isArray(analyzed.exponentials)
    || analyzed.polynomial.some((coefficient) => !(coefficient instanceof ExactRational))
    || analyzed.exponentials.some(({ amplitude, slope, intercept }) => (
      !(amplitude instanceof ExactRational)
      || !(slope instanceof ExactRational)
      || !(intercept instanceof ExactRational)
    ))
  ) {
    throw new TypeError("型付き指数関数被積分関数が必要です。");
  }
  if (analyzed.exponentials.length > MAX_EXPONENTIAL_TERMS) {
    throw new ExactExponentialIntegralError(
      `指数関数の項数は${MAX_EXPONENTIAL_TERMS}個以下にしてください。`,
      { code: "TOO_MANY_EXPONENTIAL_TERMS", unsupported: true },
    );
  }
  const entries = [];
  if (!isZeroPolynomial(analyzed.polynomial)) {
    const polynomialValue = evaluateExactDefinitePolynomialIntegral(
      analyzed.polynomial,
      lower,
      upper,
    ).value;
    entries.push({ exponent: ExactRational.zero(), coefficient: polynomialValue });
  }
  for (const term of analyzed.exponentials) {
    if (term.slope.isZero()) {
      entries.push({
        exponent: term.intercept,
        coefficient: term.amplitude.multiply(upper.subtract(lower)),
      });
      continue;
    }
    const primitiveCoefficient = term.amplitude.divide(term.slope);
    if (!primitiveCoefficient.multiply(term.slope).equals(term.amplitude)) {
      throw new ExactExponentialIntegralError(
        "指数関数の原始関数係数を厳密に検算できませんでした。",
        { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
      );
    }
    entries.push({
      exponent: term.slope.multiply(upper).add(term.intercept),
      coefficient: primitiveCoefficient,
    });
    entries.push({
      exponent: term.slope.multiply(lower).add(term.intercept),
      coefficient: primitiveCoefficient.negate(),
    });
  }
  const value = exactExponentialSum(entries);
  return Object.freeze({
    analyzed,
    value,
    exact: formatExactExponentialSum(value),
    antiderivative: formatAntiderivative(analyzed),
  });
}

export function evaluateExactExponentialIntegral(node, lower, upper) {
  return evaluateExactExponentialAnalysis(
    analyzeExactExponentialIntegrand(node),
    lower,
    upper,
  );
}

export { MAX_EXPONENTIAL_TERMS };
