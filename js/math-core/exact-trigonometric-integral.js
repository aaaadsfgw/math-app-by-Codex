import {
  ExactExponentialIntegralError,
  MAX_EXPONENTIAL_TERMS,
  analyzeExactExponentialIntegrand,
  evaluateExactExponentialAnalysis,
} from "./exact-exponential-integral.js";
import {
  ExactPolynomialIntegralError,
  exactPolynomialForIntegralFromAst,
  exactRationalConstantFromAst,
} from "./exact-polynomial-integral.js";
import { ExactRational } from "./exact-rational.js";

const MAX_TRIGONOMETRIC_TERMS = 32;
const ATOM_ORDER = Object.freeze({ exp: 0, rational: 0, sin: 1, cos: 2 });
const TRIGONOMETRIC_FUNCTION_NAMES = new Set([
  "arccos",
  "arcsin",
  "arctan",
  "cos",
  "sin",
  "tan",
]);

export class ExactTrigonometricIntegralError extends Error {
  constructor(message, { code = "EXACT_TRIGONOMETRIC_INTEGRAL_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactTrigonometricIntegralError";
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

function analysis(
  polynomial = zeroPolynomial(),
  exponentials = [],
  trigonometric = [],
) {
  const filteredExponentials = exponentials.filter(({ amplitude }) => !amplitude.isZero());
  const filteredTrigonometric = trigonometric.filter(({ amplitude }) => !amplitude.isZero());
  if (filteredExponentials.length > MAX_EXPONENTIAL_TERMS) {
    throw new ExactTrigonometricIntegralError(
      `指数関数の項は${MAX_EXPONENTIAL_TERMS}個以下にしてください。`,
      { code: "TOO_MANY_EXPONENTIAL_TERMS", unsupported: true },
    );
  }
  const sineCount = filteredTrigonometric
    .filter(({ functionName }) => functionName === "sin").length;
  const cosineCount = filteredTrigonometric
    .filter(({ functionName }) => functionName === "cos").length;
  if (
    sineCount > MAX_TRIGONOMETRIC_TERMS
    || cosineCount > MAX_TRIGONOMETRIC_TERMS
  ) {
    throw new ExactTrigonometricIntegralError(
      `sin・cosの項はそれぞれ${MAX_TRIGONOMETRIC_TERMS}個以下にしてください。`,
      { code: "TOO_MANY_TRIGONOMETRIC_TERMS", unsupported: true },
    );
  }
  return Object.freeze({
    polynomial,
    exponentials: Object.freeze(filteredExponentials.map((term) => Object.freeze(term))),
    trigonometric: Object.freeze(filteredTrigonometric.map((term) => Object.freeze(term))),
  });
}

function liftExponentialAnalysis(value) {
  return analysis(value.polynomial, value.exponentials);
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
    [
      ...left.trigonometric,
      ...right.trigonometric.map((term) => ({
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
    value.trigonometric.map((term) => ({
      ...term,
      amplitude: term.amplitude.multiply(scalar),
    })),
  );
}

function containsTrigonometricFamilyCall(node) {
  if (node?.type === "call" && TRIGONOMETRIC_FUNCTION_NAMES.has(node.name)) return true;
  if (node?.type === "unary") return containsTrigonometricFamilyCall(node.argument);
  if (node?.type === "binary") {
    return containsTrigonometricFamilyCall(node.left)
      || containsTrigonometricFamilyCall(node.right);
  }
  if (node?.type === "call") return node.args.some(containsTrigonometricFamilyCall);
  return false;
}

function tryExponentialAnalysis(node) {
  try {
    return analyzeExactExponentialIntegrand(node);
  } catch (error) {
    if (
      containsTrigonometricFamilyCall(node)
      && error instanceof ExactExponentialIntegralError
      && error.unsupported
    ) {
      return null;
    }
    throw error;
  }
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

function affineArgument(node) {
  let coefficients;
  try {
    coefficients = exactPolynomialForIntegralFromAst(node);
  } catch (error) {
    if (error instanceof ExactPolynomialIntegralError && error.unsupported) {
      throw new ExactTrigonometricIntegralError(
        "sin・cosの引数は有理係数の一次式 ax+b にしてください。",
        { code: "NON_AFFINE_ARGUMENT", unsupported: true },
      );
    }
    throw error;
  }
  if (coefficients.length > 2) {
    throw new ExactTrigonometricIntegralError(
      "sin・cosの引数は有理係数の一次式 ax+b にしてください。",
      { code: "NON_AFFINE_ARGUMENT", unsupported: true },
    );
  }
  return Object.freeze({
    intercept: coefficients[0],
    slope: coefficients[1] ?? ExactRational.zero(),
  });
}

function trigonometricTerm(functionName, argument) {
  const affine = affineArgument(argument);
  return analysis(zeroPolynomial(), [], [{
    functionName,
    amplitude: ExactRational.one(),
    ...affine,
  }]);
}

export function analyzeExactTrigonometricIntegrand(node) {
  const exponential = tryExponentialAnalysis(node);
  if (exponential) return liftExponentialAnalysis(exponential);

  if (
    node?.type === "call"
    && ["sin", "cos"].includes(node.name)
    && node.args.length === 1
  ) {
    return trigonometricTerm(node.name, node.args[0]);
  }
  if (node?.type === "unary") {
    const value = analyzeExactTrigonometricIntegrand(node.argument);
    return node.operator === "-"
      ? scaleAnalysis(value, new ExactRational(-1n))
      : value;
  }
  if (node?.type === "binary") {
    if (node.operator === "+" || node.operator === "-") {
      return combineAnalyses(
        analyzeExactTrigonometricIntegrand(node.left),
        analyzeExactTrigonometricIntegrand(node.right),
        node.operator === "-" ? -1n : 1n,
      );
    }
    if (node.operator === "*") {
      const leftScalar = tryExactRational(node.left);
      if (leftScalar) {
        return scaleAnalysis(analyzeExactTrigonometricIntegrand(node.right), leftScalar);
      }
      const rightScalar = tryExactRational(node.right);
      if (rightScalar) {
        return scaleAnalysis(analyzeExactTrigonometricIntegrand(node.left), rightScalar);
      }
      throw new ExactTrigonometricIntegralError(
        "三角関数とxや別の関数との積は、初期の厳密定積分では未対応です。",
        { code: "UNSUPPORTED_PRODUCT", unsupported: true },
      );
    }
    if (node.operator === "/") {
      const denominator = tryExactRational(node.right);
      if (!denominator) {
        throw new ExactTrigonometricIntegralError(
          "三角関数を変数式や関数で割る定積分は未対応です。",
          { code: "VARIABLE_DENOMINATOR", unsupported: true },
        );
      }
      if (denominator.isZero()) {
        throw new ExactTrigonometricIntegralError("0では割れません。", {
          code: "DIVISION_BY_ZERO",
        });
      }
      return scaleAnalysis(
        analyzeExactTrigonometricIntegrand(node.left),
        ExactRational.one().divide(denominator),
      );
    }
  }

  throw new ExactTrigonometricIntegralError(
    "初期の三角関数定積分は、P(x)とq*exp(ax+b)、q*sin(ax+b)、q*cos(ax+b)の有限和に対応しています。",
    { code: "UNSUPPORTED_TRIGONOMETRIC_FORM", unsupported: true },
  );
}

function compareRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function normalizedEntry(kind, argument, coefficient) {
  if (!(coefficient instanceof ExactRational) || coefficient.isZero()) return null;
  if (kind === "rational") return { kind, argument: null, coefficient };
  if (!(argument instanceof ExactRational)) {
    throw new TypeError("関数端点の厳密な有理数引数が必要です。");
  }
  if (kind === "sin") {
    if (argument.isZero()) return null;
    if (argument.numerator < 0n) {
      return { kind, argument: argument.negate(), coefficient: coefficient.negate() };
    }
  }
  if (kind === "cos") {
    if (argument.isZero()) return { kind: "rational", argument: null, coefficient };
    if (argument.numerator < 0n) {
      return { kind, argument: argument.negate(), coefficient };
    }
  }
  if (kind === "exp" && argument.isZero()) {
    return { kind: "rational", argument: null, coefficient };
  }
  return { kind, argument, coefficient };
}

function exactElementarySum(entries) {
  const combined = new Map();
  for (const rawEntry of entries) {
    const entry = normalizedEntry(
      rawEntry.kind,
      rawEntry.argument ?? null,
      rawEntry.coefficient,
    );
    if (!entry) continue;
    const key = entry.kind === "rational"
      ? "rational"
      : `${entry.kind}:${entry.argument}`;
    const previous = combined.get(key);
    combined.set(key, {
      ...entry,
      coefficient: previous
        ? previous.coefficient.add(entry.coefficient)
        : entry.coefficient,
    });
  }
  const terms = [...combined.values()]
    .filter(({ coefficient }) => !coefficient.isZero())
    .sort((left, right) => {
      const leftNegative = left.coefficient.numerator < 0n;
      const rightNegative = right.coefficient.numerator < 0n;
      if (leftNegative !== rightNegative) return leftNegative ? 1 : -1;
      const order = ATOM_ORDER[left.kind] - ATOM_ORDER[right.kind];
      if (order) return order;
      const leftArgument = left.kind === "rational"
        ? ExactRational.zero()
        : left.argument;
      const rightArgument = right.kind === "rational"
        ? ExactRational.zero()
        : right.argument;
      return -compareRationals(leftArgument, rightArgument);
    })
    .map((term) => Object.freeze(term));
  return Object.freeze({ terms: Object.freeze(terms) });
}

function magnitudeTerm(kind, argument, magnitude) {
  if (kind === "rational") return magnitude.toString();
  const atom = `${kind}(${argument})`;
  const numerator = magnitude.numerator;
  const denominator = magnitude.denominator;
  if (denominator === 1n) return numerator === 1n ? atom : `${numerator}*${atom}`;
  return numerator === 1n
    ? `${atom}/${denominator}`
    : `${numerator}*${atom}/${denominator}`;
}

export function formatExactElementarySum(value) {
  if (!value || !Array.isArray(value.terms)) {
    throw new TypeError("厳密な初等関数和が必要です。");
  }
  if (!value.terms.length) return "0";
  return value.terms.map(({ kind, argument, coefficient }, index) => {
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? coefficient.negate() : coefficient;
    const body = magnitudeTerm(kind, argument, magnitude);
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

function trigonometricAntiderivativeTerm(term) {
  if (term.slope.isZero()) {
    return primitiveTermText(
      term.amplitude,
      `${term.functionName}(${term.intercept})*x`,
    );
  }
  const quotient = term.amplitude.divide(term.slope);
  if (!quotient.multiply(term.slope).equals(term.amplitude)) {
    throw new ExactTrigonometricIntegralError(
      "三角関数の原始関数係数を厳密に検算できませんでした。",
      { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
    );
  }
  const primitiveCoefficient = term.functionName === "sin"
    ? quotient.negate()
    : quotient;
  const primitiveFunction = term.functionName === "sin" ? "cos" : "sin";
  return primitiveTermText(
    primitiveCoefficient,
    `${primitiveFunction}(${affineText(term.slope, term.intercept)})`,
  );
}

function formatAntiderivative(analyzed, baseAntiderivative) {
  const pieces = [];
  if (!isZeroPolynomial(analyzed.polynomial) || analyzed.exponentials.length) {
    pieces.push(baseAntiderivative);
  }
  pieces.push(...analyzed.trigonometric.map(trigonometricAntiderivativeTerm));
  return pieces.join(" + ").replace(/ \+ -/gu, " - ") || "0";
}

function appendTrigonometricEndpointEntries(entries, term, lower, upper) {
  if (term.slope.isZero()) {
    entries.push({
      kind: term.functionName,
      argument: term.intercept,
      coefficient: term.amplitude.multiply(upper.subtract(lower)),
    });
    return;
  }
  const quotient = term.amplitude.divide(term.slope);
  if (!quotient.multiply(term.slope).equals(term.amplitude)) {
    throw new ExactTrigonometricIntegralError(
      "三角関数の原始関数係数を厳密に検算できませんでした。",
      { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
    );
  }
  const upperArgument = term.slope.multiply(upper).add(term.intercept);
  const lowerArgument = term.slope.multiply(lower).add(term.intercept);
  if (term.functionName === "sin") {
    entries.push({ kind: "cos", argument: upperArgument, coefficient: quotient.negate() });
    entries.push({ kind: "cos", argument: lowerArgument, coefficient: quotient });
    return;
  }
  entries.push({ kind: "sin", argument: upperArgument, coefficient: quotient });
  entries.push({ kind: "sin", argument: lowerArgument, coefficient: quotient.negate() });
}

export function evaluateExactTrigonometricIntegral(node, lower, upper) {
  if (!(lower instanceof ExactRational) || !(upper instanceof ExactRational)) {
    throw new TypeError("三角関数定積分の上下限は厳密分数で指定してください。");
  }
  const analyzed = analyzeExactTrigonometricIntegrand(node);
  const base = evaluateExactExponentialAnalysis(
    { polynomial: analyzed.polynomial, exponentials: analyzed.exponentials },
    lower,
    upper,
  );
  const entries = base.value.terms.map(({ exponent, coefficient }) => (
    exponent.isZero()
      ? { kind: "rational", argument: null, coefficient }
      : { kind: "exp", argument: exponent, coefficient }
  ));
  for (const term of analyzed.trigonometric) {
    appendTrigonometricEndpointEntries(entries, term, lower, upper);
  }
  const value = exactElementarySum(entries);
  return Object.freeze({
    analyzed,
    value,
    exact: formatExactElementarySum(value),
    antiderivative: formatAntiderivative(analyzed, base.antiderivative),
  });
}

export { MAX_TRIGONOMETRIC_TERMS };
