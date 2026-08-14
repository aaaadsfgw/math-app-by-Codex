import { ExactRational } from "./exact-rational.js";
import {
  exactRationalFunctionForFiniteLimitFromAst,
  exactRationalPolynomialDegree,
  isZeroExactRationalPolynomial,
} from "./exact-rational-function.js";

const LIMIT_DIRECTIONS = Object.freeze(["both", "left", "right"]);
const LIMIT_DIRECTION_SET = new Set(LIMIT_DIRECTIONS);
const MAX_LIMIT_POLYNOMIAL_DEGREE = 4;
const MAX_LIMIT_DOMAIN_FACTORS = 10;

export class ExactRationalLimitError extends Error {
  constructor(message, { code = "EXACT_RATIONAL_LIMIT_ERROR" } = {}) {
    super(message);
    this.name = "ExactRationalLimitError";
    this.code = code;
  }
}

function snapshotExactRational(value, label) {
  if (!(value instanceof ExactRational)) {
    throw new TypeError(`${label}は厳密分数で指定してください。`);
  }
  const numerator = value.numerator;
  const denominator = value.denominator;
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
    throw new TypeError(`${label}の分子と分母はBigIntで指定してください。`);
  }
  return new ExactRational(numerator, denominator);
}

function snapshotArrayLength(value, label, { allowEmpty = false } = {}) {
  const length = value.length;
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !Number.isSafeInteger(length)
    || length < (allowEmpty ? 0 : 1)
    || descriptor?.value !== length
  ) {
    throw new TypeError(`${label}の配列長が正しくありません。`);
  }
  return length;
}

function snapshotPolynomial(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label}は厳密分数係数の多項式で指定してください。`);
  }
  const length = snapshotArrayLength(value, label);
  if (length - 1 > MAX_LIMIT_POLYNOMIAL_DEGREE) {
    throw new ExactRationalLimitError(
      `${label}の次数は${MAX_LIMIT_POLYNOMIAL_DEGREE}以下にしてください。`,
      { code: "POLYNOMIAL_DEGREE_TOO_HIGH" },
    );
  }
  const coefficients = Array.from({ length }, (_, index) => {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`${label}の係数配列を疎配列にしないでください。`);
    }
    return snapshotExactRational(value[index], `${label}の係数${index}`);
  });
  if (coefficients.length > 1 && coefficients.at(-1).isZero()) {
    throw new ExactRationalLimitError(`${label}の末尾に不要な0係数があります。`, {
      code: "NONCANONICAL_POLYNOMIAL",
    });
  }
  return Object.freeze(coefficients);
}

function requireRationalFunction(value) {
  if (!value || typeof value !== "object") {
    throw new TypeError("厳密有理式が必要です。");
  }
  const numeratorSource = value.numerator;
  const denominatorSource = value.denominator;
  const domainFactorsSource = value.domainFactors;
  const hasVariableDenominatorSource = value.hasVariableDenominator;
  const numerator = snapshotPolynomial(numeratorSource, "分子");
  const denominator = snapshotPolynomial(denominatorSource, "分母");
  if (!Array.isArray(domainFactorsSource)) {
    throw new TypeError("元の分母条件が必要です。");
  }
  const domainFactorCount = snapshotArrayLength(
    domainFactorsSource,
    "元の分母条件",
    { allowEmpty: true },
  );
  if (domainFactorCount > MAX_LIMIT_DOMAIN_FACTORS) {
    throw new ExactRationalLimitError(
      `元の分母条件は${MAX_LIMIT_DOMAIN_FACTORS}個以下にしてください。`,
      { code: "TOO_MANY_DOMAIN_FACTORS" },
    );
  }
  const domainFactorMap = new Map();
  for (let index = 0; index < domainFactorCount; index += 1) {
    if (!Object.hasOwn(domainFactorsSource, index)) {
      throw new TypeError("元の分母条件を疎配列にしないでください。");
    }
    const factor = snapshotPolynomial(
      domainFactorsSource[index],
      `分母条件${index + 1}`,
    );
    if (isZeroExactRationalPolynomial(factor)) {
      throw new ExactRationalLimitError(
        "元の分母条件が恒等的に0で、定義された穿孔近傍がありません。",
        { code: "NO_PUNCTURED_DOMAIN" },
      );
    }
    if (exactRationalPolynomialDegree(factor) > 0) {
      domainFactorMap.set(factor.map(String).join("|"), factor);
    }
  }
  if (isZeroExactRationalPolynomial(denominator)) {
    throw new ExactRationalLimitError("分母が恒等的に0です。", {
      code: "ZERO_DENOMINATOR",
    });
  }
  if (
    hasVariableDenominatorSource !== undefined
    && typeof hasVariableDenominatorSource !== "boolean"
  ) {
    throw new TypeError("変数分母フラグは真偽値で指定してください。");
  }
  return Object.freeze({
    numerator,
    denominator,
    domainFactors: Object.freeze([...domainFactorMap.values()]),
    hasVariableDenominator: hasVariableDenominatorSource === true,
  });
}

function evaluatePolynomialAt(polynomial, point) {
  let value = ExactRational.zero();
  for (let index = polynomial.length - 1; index >= 0; index -= 1) {
    value = value.multiply(point).add(polynomial[index]);
  }
  return value;
}

function divideByPointFactor(polynomial, point) {
  const degree = exactRationalPolynomialDegree(polynomial);
  if (degree < 1) {
    throw new ExactRationalLimitError("定数多項式から一次因子を除けません。", {
      code: "INVALID_FACTOR_DIVISION",
    });
  }
  const quotient = Array.from({ length: degree }, () => ExactRational.zero());
  quotient[degree - 1] = polynomial[degree];
  for (let index = degree - 1; index >= 1; index -= 1) {
    quotient[index - 1] = polynomial[index]
      .add(point.multiply(quotient[index]));
  }
  const remainder = polynomial[0].add(point.multiply(quotient[0]));
  if (!remainder.isZero()) {
    throw new ExactRationalLimitError("指定点の一次因子を厳密に除算できません。", {
      code: "NONZERO_FACTOR_REMAINDER",
    });
  }
  return Object.freeze(quotient);
}

function factorMultiplicity(polynomial, point) {
  if (isZeroExactRationalPolynomial(polynomial)) {
    return Object.freeze({ multiplicity: null, residual: polynomial });
  }
  let residual = polynomial;
  let multiplicity = 0;
  while (
    exactRationalPolynomialDegree(residual) > 0
    && evaluatePolynomialAt(residual, point).isZero()
  ) {
    residual = divideByPointFactor(residual, point);
    multiplicity += 1;
  }
  return Object.freeze({ multiplicity, residual });
}

function factorOut(polynomial, point, count) {
  let residual = polynomial;
  for (let index = 0; index < count; index += 1) {
    residual = divideByPointFactor(residual, point);
  }
  return residual;
}

function finiteSide(value) {
  return Object.freeze({ kind: "finite", value });
}

function infiniteSide(sign) {
  return Object.freeze({
    kind: sign < 0 ? "negative-infinity" : "positive-infinity",
    value: null,
  });
}

function sameSideValue(left, right) {
  if (left.kind !== right.kind) return false;
  return left.kind !== "finite" || left.value.equals(right.value);
}

export function formatExactLimitSide(value) {
  if (value?.kind === "finite" && value.value instanceof ExactRational) {
    return snapshotExactRational(value.value, "有限の片側極限値").toString();
  }
  if (value?.kind === "positive-infinity") return "+∞";
  if (value?.kind === "negative-infinity") return "-∞";
  throw new TypeError("厳密な片側極限値が必要です。");
}

function outcomeFor(direction, left, right) {
  if (direction === "left") {
    return Object.freeze({ kind: left.kind, exact: formatExactLimitSide(left) });
  }
  if (direction === "right") {
    return Object.freeze({ kind: right.kind, exact: formatExactLimitSide(right) });
  }
  if (sameSideValue(left, right)) {
    return Object.freeze({ kind: left.kind, exact: formatExactLimitSide(left) });
  }
  return Object.freeze({
    kind: "does-not-exist",
    exact: `存在しない（左極限=${formatExactLimitSide(left)}、右極限=${formatExactLimitSide(right)}）`,
  });
}

export function evaluateExactRationalFunctionLimit(
  rationalFunction,
  point,
  direction = "both",
) {
  const value = requireRationalFunction(rationalFunction);
  const target = snapshotExactRational(point, "有限極限の接近点");
  if (!LIMIT_DIRECTION_SET.has(direction)) {
    throw new TypeError("極限方向はboth、left、rightのいずれかにしてください。");
  }

  const denominator = factorMultiplicity(value.denominator, target);
  const numerator = factorMultiplicity(value.numerator, target);
  const domainFactorChecks = Object.freeze(value.domainFactors.map((factor) => {
    const factorValue = evaluatePolynomialAt(factor, target);
    return Object.freeze({
      factor,
      valueAtPoint: factorValue,
      multiplicity: factorMultiplicity(factor, target).multiplicity,
      excludesPoint: factorValue.isZero(),
    });
  }));
  const excludedDomainFactors = Object.freeze(
    domainFactorChecks.filter(({ excludesPoint }) => excludesPoint),
  );
  const pointExcluded = denominator.multiplicity > 0
    || excludedDomainFactors.length > 0;

  let left;
  let right;
  let leadingRatio = null;
  let canceledMultiplicity;
  let numeratorAfterCancellation;
  let denominatorAfterCancellation;

  if (numerator.multiplicity === null) {
    left = finiteSide(ExactRational.zero());
    right = left;
    canceledMultiplicity = denominator.multiplicity;
    numeratorAfterCancellation = value.numerator;
    denominatorAfterCancellation = denominator.residual;
  } else {
    canceledMultiplicity = Math.min(
      numerator.multiplicity,
      denominator.multiplicity,
    );
    numeratorAfterCancellation = factorOut(
      value.numerator,
      target,
      canceledMultiplicity,
    );
    denominatorAfterCancellation = factorOut(
      value.denominator,
      target,
      canceledMultiplicity,
    );
    leadingRatio = evaluatePolynomialAt(numerator.residual, target)
      .divide(evaluatePolynomialAt(denominator.residual, target));

    if (numerator.multiplicity > denominator.multiplicity) {
      left = finiteSide(ExactRational.zero());
      right = left;
    } else if (numerator.multiplicity === denominator.multiplicity) {
      left = finiteSide(leadingRatio);
      right = left;
    } else {
      const poleOrder = denominator.multiplicity - numerator.multiplicity;
      const rightSign = leadingRatio.numerator < 0n ? -1 : 1;
      const leftSign = poleOrder % 2 === 0 ? rightSign : -rightSign;
      left = infiniteSide(leftSign);
      right = infiniteSide(rightSign);
    }
  }

  const outcome = outcomeFor(direction, left, right);
  const numeratorIdenticallyZero = numerator.multiplicity === null;
  const poleOrder = numeratorIdenticallyZero
    ? 0
    : Math.max(0, denominator.multiplicity - numerator.multiplicity);
  const removableHoleAtTarget = pointExcluded
    && left.kind === "finite"
    && right.kind === "finite"
    && sameSideValue(left, right);
  return Object.freeze({
    rationalFunction: value,
    point: target,
    direction,
    numeratorMultiplicity: numerator.multiplicity,
    denominatorMultiplicity: denominator.multiplicity,
    numeratorIdenticallyZero,
    poleOrder,
    canceledMultiplicity,
    numeratorAfterCancellation,
    denominatorAfterCancellation,
    leadingRatio,
    pointExcluded,
    targetDefined: !pointExcluded,
    domainFactorChecks,
    excludedDomainFactors,
    puncturedNeighborhoodCertified: true,
    removableHoleAtTarget,
    left,
    right,
    outcomeKind: outcome.kind,
    exact: outcome.exact,
  });
}

export function evaluateExactRationalLimit(node, point, direction = "both") {
  return evaluateExactRationalFunctionLimit(
    exactRationalFunctionForFiniteLimitFromAst(node),
    point,
    direction,
  );
}

export { LIMIT_DIRECTIONS };
