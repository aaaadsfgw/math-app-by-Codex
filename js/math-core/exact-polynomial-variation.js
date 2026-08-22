import {
  analyzeExactQuadraticRoots,
  evaluateExactPolynomialAtQuadraticRoot,
} from "./exact-quadratic-roots.js";
import {
  compareExactRealPoints,
  createExactQuadraticRootPoint,
  createExactRationalPoint,
  rationalSampleBetweenExactPoints,
  signOfExactPolynomialAtRationalSample,
} from "./exact-real-point.js";
import { ExactRational } from "./exact-rational.js";

const MAX_VARIATION_POLYNOMIAL_DEGREE = 3;

export class ExactPolynomialVariationError extends Error {
  constructor(message, {
    code = "EXACT_POLYNOMIAL_VARIATION_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "ExactPolynomialVariationError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function signOfBigInt(value) {
  return value < 0n ? -1 : value > 0n ? 1 : 0;
}

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}

function leastCommonMultiple(left, right) {
  return absolute(left / greatestCommonDivisor(left, right) * right);
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

function snapshotPolynomial(value) {
  if (!Array.isArray(value)) {
    throw new TypeError("増減を調べる式は厳密分数係数の多項式で指定してください。");
  }
  const length = value.length;
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !Number.isSafeInteger(length)
    || length < 1
    || descriptor?.value !== length
  ) {
    throw new TypeError("増減を調べる多項式の配列長が正しくありません。");
  }
  if (length - 1 > MAX_VARIATION_POLYNOMIAL_DEGREE) {
    throw new ExactPolynomialVariationError(
      `増減を調べる多項式の次数は${MAX_VARIATION_POLYNOMIAL_DEGREE}以下にしてください。`,
      {
        code: "VARIATION_POLYNOMIAL_DEGREE_TOO_HIGH",
        unsupported: true,
      },
    );
  }
  const coefficients = Array.from({ length }, (_, index) => {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError("増減を調べる多項式の係数配列を疎配列にしないでください。");
    }
    return snapshotExactRational(value[index], `多項式の係数${index}`);
  });
  if (coefficients.length > 1 && coefficients.at(-1).isZero()) {
    throw new ExactPolynomialVariationError(
      "増減を調べる多項式の末尾に不要な0係数があります。",
      { code: "NONCANONICAL_VARIATION_POLYNOMIAL" },
    );
  }
  return Object.freeze(coefficients);
}

function trimPolynomial(coefficients) {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last].isZero()) last -= 1;
  return Object.freeze(coefficients.slice(0, last + 1));
}

function zeroPolynomial() {
  return Object.freeze([ExactRational.zero()]);
}

function isZeroPolynomial(coefficients) {
  return coefficients.length === 1 && coefficients[0].isZero();
}

function evaluateRationalPolynomial(coefficients, point) {
  let value = ExactRational.zero();
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    value = value.multiply(point).add(coefficients[index]);
  }
  return value;
}

function differentiatePolynomial(coefficients) {
  if (coefficients.length === 1) {
    return Object.freeze({
      polynomial: zeroPolynomial(),
      terms: Object.freeze([]),
      verified: true,
    });
  }
  const terms = coefficients.slice(1).map((coefficient, index) => {
    const sourcePower = index + 1;
    const multiplier = BigInt(sourcePower);
    const derivativeCoefficient = coefficient.multiply(multiplier);
    const independentlyConstructed = new ExactRational(
      coefficient.numerator * multiplier,
      coefficient.denominator,
    );
    const difference = derivativeCoefficient.subtract(independentlyConstructed);
    return Object.freeze({
      sourcePower,
      sourceCoefficient: coefficient,
      multiplier,
      derivativePower: index,
      derivativeCoefficient,
      difference,
      verified: difference.isZero(),
    });
  });
  const derivative = Object.freeze(terms.map(({ derivativeCoefficient }) => (
    derivativeCoefficient
  )));
  const verified = terms.every((term) => term.verified);
  if (!verified) {
    throw new ExactPolynomialVariationError(
      "係数微分を厳密に再検証できませんでした。",
      { code: "VARIATION_DERIVATIVE_VERIFICATION_FAILED" },
    );
  }
  return Object.freeze({
    polynomial: derivative,
    terms: Object.freeze(terms),
    verified,
  });
}

function formatRadicalTerm(coefficient, radicand) {
  const magnitude = absolute(coefficient);
  return `${magnitude === 1n ? "" : magnitude}√${radicand}`;
}

function formatQuadraticValue(value) {
  if (value.radicalPart.isZero()) return value.rationalPart.toString();
  const commonDenominator = leastCommonMultiple(
    value.rationalPart.denominator,
    value.radicalPart.denominator,
  );
  let rationalNumerator = value.rationalPart.numerator
    * (commonDenominator / value.rationalPart.denominator);
  let radicalNumerator = value.radicalPart.numerator
    * (commonDenominator / value.radicalPart.denominator);
  let denominator = commonDenominator;
  const divisor = greatestCommonDivisor(
    greatestCommonDivisor(rationalNumerator, radicalNumerator),
    denominator,
  );
  rationalNumerator /= divisor;
  radicalNumerator /= divisor;
  denominator /= divisor;

  const radicalTerm = formatRadicalTerm(radicalNumerator, value.radicand);
  let numerator;
  if (rationalNumerator === 0n) {
    numerator = `${radicalNumerator < 0n ? "-" : ""}${radicalTerm}`;
  } else {
    numerator = `${rationalNumerator}`
      + `${radicalNumerator < 0n ? "-" : "+"}${radicalTerm}`;
  }
  if (denominator === 1n) return numerator;
  return rationalNumerator === 0n
    ? `${numerator}/${denominator}`
    : `(${numerator})/${denominator}`;
}

function quadraticValue(rationalPart, radicalPart, radicand) {
  let rational = snapshotExactRational(rationalPart, "二次体値の有理数部分");
  let radical = snapshotExactRational(radicalPart, "二次体値の根号係数");
  if (typeof radicand !== "bigint" || radicand < 0n) {
    throw new TypeError("二次体値の被開平数は0以上のBigIntで指定してください。");
  }
  let normalizedRadicand = radicand;
  if (radical.isZero() || normalizedRadicand === 0n) {
    radical = ExactRational.zero();
    normalizedRadicand = 0n;
  } else if (normalizedRadicand === 1n) {
    rational = rational.add(radical);
    radical = ExactRational.zero();
    normalizedRadicand = 0n;
  }
  const value = {
    kind: radical.isZero() ? "rational" : "quadratic",
    rationalPart: rational,
    radicalPart: radical,
    radicand: normalizedRadicand,
  };
  return Object.freeze({ ...value, exact: formatQuadraticValue(value) });
}

function rationalQuadraticValue(value) {
  return quadraticValue(value, ExactRational.zero(), 0n);
}

function subtractQuadraticValues(left, right) {
  const leftHasRadical = !left.radicalPart.isZero();
  const rightHasRadical = !right.radicalPart.isZero();
  if (
    leftHasRadical
    && rightHasRadical
    && left.radicand !== right.radicand
  ) {
    throw new ExactPolynomialVariationError(
      "異なる二次体の値を増減検証で比較できません。",
      { code: "VARIATION_VALUE_FIELD_MISMATCH" },
    );
  }
  const radicand = leftHasRadical ? left.radicand : right.radicand;
  return quadraticValue(
    left.rationalPart.subtract(right.rationalPart),
    left.radicalPart.subtract(right.radicalPart),
    radicand,
  );
}

function isZeroQuadraticValue(value) {
  return value.rationalPart.isZero() && value.radicalPart.isZero();
}

function publicPoint(point) {
  if (point.kind === "rational") {
    const value = snapshotExactRational(point.value, "有理臨界点");
    return Object.freeze({
      kind: "rational",
      value,
      exact: value.toString(),
    });
  }
  if (point.kind === "quadratic-root") {
    const root = point.root;
    const definingPolynomial = Object.freeze(
      point.integerCoefficients.map((coefficient) => BigInt(coefficient)),
    );
    return Object.freeze({
      kind: "quadratic-root",
      numeratorConstant: BigInt(root.numeratorConstant),
      radicalCoefficient: BigInt(root.radicalCoefficient),
      radicand: BigInt(root.radicand),
      denominator: BigInt(root.denominator),
      rootIndex: point.rootIndex,
      definingPolynomial,
      exact: String(root.exact),
    });
  }
  throw new TypeError("臨界点の厳密実数種別が正しくありません。");
}

function evaluatePolynomialAtPoint(coefficients, point) {
  if (point.kind === "rational") {
    return rationalQuadraticValue(
      evaluateRationalPolynomial(coefficients, point.value),
    );
  }
  if (point.kind === "quadratic-root") {
    const value = evaluateExactPolynomialAtQuadraticRoot(coefficients, point.root);
    return quadraticValue(
      value.rationalPart,
      value.radicalPart,
      point.root.radicand,
    );
  }
  throw new TypeError("多項式を評価する臨界点種別が正しくありません。");
}

function analyzeDerivativeRoots(derivative) {
  if (derivative.length === 1) {
    const identicallyZero = derivative[0].isZero();
    return {
      evidence: {
        kind: identicallyZero ? "identically-zero" : "constant",
        derivativeDegree: identicallyZero ? null : 0,
        rootKind: identicallyZero ? "all-real" : "no-real",
        integerCoefficients: null,
        discriminant: null,
        rootCount: identicallyZero ? null : 0,
        complete: true,
      },
      roots: [],
      stationarySet: identicallyZero ? "all-real" : "empty",
    };
  }
  if (derivative.length === 2) {
    const point = createExactRationalPoint(
      derivative[0].negate().divide(derivative[1]),
    );
    return {
      evidence: {
        kind: "linear",
        derivativeDegree: 1,
        rootKind: "one-real",
        integerCoefficients: null,
        discriminant: null,
        rootCount: 1,
        complete: true,
      },
      roots: [{ point, multiplicity: 1, analysisRootIndex: 0 }],
      stationarySet: "finite",
    };
  }
  if (derivative.length !== 3) {
    throw new ExactPolynomialVariationError(
      "導関数の実根解析は二次式までです。",
      {
        code: "VARIATION_DERIVATIVE_DEGREE_TOO_HIGH",
        unsupported: true,
      },
    );
  }

  const analysis = analyzeExactQuadraticRoots(derivative);
  const multiplicity = analysis.rootKind === "double" ? 2 : 1;
  const roots = analysis.roots.map((_, index) => ({
    point: createExactQuadraticRootPoint(analysis, index),
    multiplicity,
    analysisRootIndex: index,
  }));
  return {
    evidence: {
      kind: "quadratic",
      derivativeDegree: 2,
      rootKind: analysis.rootKind,
      integerCoefficients: Object.freeze([...analysis.integerCoefficients]),
      discriminant: analysis.discriminant,
      rootCount: roots.length,
      complete: true,
    },
    roots,
    stationarySet: roots.length ? "finite" : "empty",
  };
}

function orderedRootEntries(rootData) {
  const entries = [...rootData.roots].sort((left, right) => (
    compareExactRealPoints(left.point, right.point)
  ));
  const comparisons = [];
  for (let index = 1; index < entries.length; index += 1) {
    const comparison = compareExactRealPoints(
      entries[index - 1].point,
      entries[index].point,
    );
    comparisons.push(Object.freeze({
      leftIndex: index - 1,
      rightIndex: index,
      comparison,
      verified: comparison < 0,
    }));
    if (comparison >= 0) {
      throw new ExactPolynomialVariationError(
        "導関数の異なる実根を厳密に順序づけられませんでした。",
        { code: "VARIATION_ROOT_ORDER_VERIFICATION_FAILED" },
      );
    }
  }
  entries.forEach((entry) => {
    entry.publicPoint = publicPoint(entry.point);
  });
  return Object.freeze({
    entries,
    comparisons: Object.freeze(comparisons),
    verified: comparisons.every((item) => item.verified),
  });
}

function predictedIntervalSigns(derivative, entries) {
  if (isZeroPolynomial(derivative)) return Object.freeze([0]);
  const signs = Array(entries.length + 1);
  signs[entries.length] = signOfBigInt(derivative.at(-1).numerator);
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    signs[index] = entries[index].multiplicity % 2 === 0
      ? signs[index + 1]
      : -signs[index + 1];
  }
  return Object.freeze(signs);
}

function behaviorForSign(sign) {
  if (sign > 0) return "increasing";
  if (sign < 0) return "decreasing";
  return "constant";
}

function createSignIntervals(derivative, entries) {
  const predictedSigns = predictedIntervalSigns(derivative, entries);
  const intervals = Array.from({ length: entries.length + 1 }, (_, index) => {
    const lowerEntry = index === 0 ? null : entries[index - 1];
    const upperEntry = index === entries.length ? null : entries[index];
    const sampleRaw = rationalSampleBetweenExactPoints(
      lowerEntry?.point ?? null,
      upperEntry?.point ?? null,
    );
    const sample = new ExactRational(sampleRaw.numerator, sampleRaw.denominator);
    const derivativeSign = signOfExactPolynomialAtRationalSample(
      derivative,
      sampleRaw,
    );
    const predictedSign = predictedSigns[index];
    const verified = derivativeSign === predictedSign
      && (isZeroPolynomial(derivative) || derivativeSign !== 0);
    if (!verified) {
      throw new ExactPolynomialVariationError(
        "導関数の根の符号遷移と区間標本の符号が一致しません。",
        { code: "VARIATION_INTERVAL_SIGN_VERIFICATION_FAILED" },
      );
    }
    return Object.freeze({
      index,
      lower: lowerEntry?.publicPoint ?? null,
      upper: upperEntry?.publicPoint ?? null,
      lowerClosed: false,
      upperClosed: false,
      sample,
      sampleExact: sample.toString(),
      derivativeSign,
      predictedSign,
      behavior: behaviorForSign(predictedSign),
      verified,
    });
  });
  return Object.freeze(intervals);
}

function createMaximalIntervals(intervals) {
  const maximal = [];
  let start = 0;
  while (start < intervals.length) {
    let end = start;
    while (
      end + 1 < intervals.length
      && intervals[end + 1].behavior === intervals[start].behavior
    ) {
      end += 1;
    }
    const lower = intervals[start].lower;
    const upper = intervals[end].upper;
    const partitionIndexes = Object.freeze(
      Array.from({ length: end - start + 1 }, (_, offset) => start + offset),
    );
    const behavior = intervals[start].behavior;
    const verified = partitionIndexes.every((index) => intervals[index].verified)
      && (start === 0 || intervals[start - 1].behavior !== behavior)
      && (end === intervals.length - 1 || intervals[end + 1].behavior !== behavior);
    maximal.push(Object.freeze({
      index: maximal.length,
      lower,
      upper,
      lowerClosed: lower !== null,
      upperClosed: upper !== null,
      behavior,
      partitionIndexes,
      verified,
    }));
    start = end + 1;
  }
  return Object.freeze(maximal);
}

function addPolynomials(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  const length = Math.max(left.length, right.length);
  return trimPolynomial(Array.from({ length }, (_, index) => (
    (left[index] ?? ExactRational.zero()).add(
      (right[index] ?? ExactRational.zero()).multiply(multiplier),
    )
  )));
}

function multiplyPolynomials(left, right) {
  const coefficients = Array.from(
    { length: left.length + right.length - 1 },
    () => ExactRational.zero(),
  );
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      coefficients[leftIndex + rightIndex] = coefficients[leftIndex + rightIndex]
        .add(left[leftIndex].multiply(right[rightIndex]));
    }
  }
  return trimPolynomial(coefficients);
}

function dividePolynomials(dividend, divisor) {
  if (isZeroPolynomial(divisor)) {
    throw new RangeError("0多項式では割れません。");
  }
  if (dividend.length < divisor.length) {
    return Object.freeze({ quotient: zeroPolynomial(), remainder: dividend });
  }
  const quotient = Array.from(
    { length: dividend.length - divisor.length + 1 },
    () => ExactRational.zero(),
  );
  let remainder = Object.freeze([...dividend]);
  while (!isZeroPolynomial(remainder) && remainder.length >= divisor.length) {
    const shift = remainder.length - divisor.length;
    const factor = remainder.at(-1).divide(divisor.at(-1));
    quotient[shift] = quotient[shift].add(factor);
    const next = [...remainder];
    for (let index = 0; index < divisor.length; index += 1) {
      const target = index + shift;
      next[target] = next[target].subtract(divisor[index].multiply(factor));
    }
    remainder = trimPolynomial(next);
  }
  return Object.freeze({
    quotient: trimPolynomial(quotient),
    remainder,
  });
}

function valueReduction(polynomial, derivative) {
  const division = dividePolynomials(polynomial, derivative);
  const reconstructed = addPolynomials(
    multiplyPolynomials(division.quotient, derivative),
    division.remainder,
  );
  const reconstructionDifference = addPolynomials(reconstructed, polynomial, -1n);
  const verified = isZeroPolynomial(reconstructionDifference);
  if (!verified) {
    throw new ExactPolynomialVariationError(
      "極値計算用の多項式除算を再構成できませんでした。",
      { code: "VARIATION_VALUE_REDUCTION_VERIFICATION_FAILED" },
    );
  }
  return Object.freeze({
    divisor: derivative,
    quotient: division.quotient,
    remainder: division.remainder,
    reconstructed,
    reconstructionDifference,
    verified,
  });
}

function classificationForSigns(leftSign, rightSign) {
  if (leftSign > 0 && rightSign < 0) return "local-maximum";
  if (leftSign < 0 && rightSign > 0) return "local-minimum";
  return "stationary-non-extremum";
}

function overallBehavior(intervals) {
  const behaviors = new Set(intervals.map(({ behavior }) => behavior));
  return behaviors.size === 1 ? intervals[0].behavior : "mixed";
}

export function evaluateExactPolynomialVariation(polynomial) {
  const coefficients = snapshotPolynomial(polynomial);
  const degree = coefficients.length - 1;
  const derivative = differentiatePolynomial(coefficients);
  const rootData = analyzeDerivativeRoots(derivative.polynomial);
  const ordered = orderedRootEntries(rootData);
  const entries = ordered.entries;
  const rootPoints = Object.freeze(entries.map(({ publicPoint: point }) => point));
  const rootAnalysis = Object.freeze({
    ...rootData.evidence,
    roots: rootPoints,
    rootExacts: Object.freeze(rootPoints.map(({ exact }) => exact)),
    orderingComparisons: ordered.comparisons,
    orderingVerified: ordered.verified,
  });
  const intervals = createSignIntervals(derivative.polynomial, entries);
  const maximalIntervals = createMaximalIntervals(intervals);
  const reduction = entries.length
    ? valueReduction(coefficients, derivative.polynomial)
    : null;

  const criticalPoints = Object.freeze(entries.map((entry, index) => {
    const derivativeValue = evaluatePolynomialAtPoint(
      derivative.polynomial,
      entry.point,
    );
    const derivativeZeroVerified = isZeroQuadraticValue(derivativeValue);
    if (!derivativeZeroVerified) {
      throw new ExactPolynomialVariationError(
        "導関数の臨界点への再代入が0になりませんでした。",
        { code: "VARIATION_ROOT_VERIFICATION_FAILED" },
      );
    }
    const value = evaluatePolynomialAtPoint(coefficients, entry.point);
    const valueViaRemainder = evaluatePolynomialAtPoint(
      reduction.remainder,
      entry.point,
    );
    const valueDifference = subtractQuadraticValues(value, valueViaRemainder);
    const valueVerified = isZeroQuadraticValue(valueDifference);
    if (!valueVerified) {
      throw new ExactPolynomialVariationError(
        "臨界点での関数値を別経路で厳密に再検証できませんでした。",
        { code: "VARIATION_CRITICAL_VALUE_VERIFICATION_FAILED" },
      );
    }
    const leftSign = intervals[index].predictedSign;
    const rightSign = intervals[index + 1].predictedSign;
    const classification = classificationForSigns(leftSign, rightSign);
    return Object.freeze({
      index,
      rootIndex: entry.analysisRootIndex,
      point: entry.publicPoint,
      pointExact: entry.publicPoint.exact,
      multiplicity: entry.multiplicity,
      derivativeValue,
      derivativeValueExact: derivativeValue.exact,
      derivativeZeroVerified,
      leftSign,
      rightSign,
      classification,
      value,
      valueExact: value.exact,
      valueViaRemainder,
      valueDifference,
      valueVerified,
      global: degree === 2 && classification !== "stationary-non-extremum",
    });
  }));

  const localMaxima = Object.freeze(criticalPoints.filter(({ classification }) => (
    classification === "local-maximum"
  )));
  const localMinima = Object.freeze(criticalPoints.filter(({ classification }) => (
    classification === "local-minimum"
  )));
  const extrema = Object.freeze(criticalPoints.filter(({ classification }) => (
    classification !== "stationary-non-extremum"
  )));
  const stationaryNonExtrema = Object.freeze(criticalPoints.filter(({ classification }) => (
    classification === "stationary-non-extremum"
  )));

  const verification = Object.freeze({
    derivativeCoefficientsVerified: derivative.verified,
    rootsComplete: rootAnalysis.complete,
    rootsVerified: criticalPoints.every(({ derivativeZeroVerified }) => (
      derivativeZeroVerified
    )),
    orderingVerified: ordered.verified,
    intervalSignsVerified: intervals.every(({ verified }) => verified),
    maximalIntervalsVerified: maximalIntervals.every(({ verified }) => verified),
    criticalValuesVerified: criticalPoints.every(({ valueVerified }) => valueVerified),
    extremaVerified: criticalPoints.every((point, index) => (
      point.classification === classificationForSigns(
        intervals[index].predictedSign,
        intervals[index + 1].predictedSign,
      )
    )),
  });
  const verified = Object.values(verification).every((value) => value === true);
  const completeVerification = Object.freeze({ ...verification, verified });
  if (!verified) {
    throw new ExactPolynomialVariationError(
      "多項式の増減・極値を最後まで厳密に検証できませんでした。",
      { code: "VARIATION_VERIFICATION_FAILED" },
    );
  }

  return Object.freeze({
    polynomial: coefficients,
    degree,
    derivativePolynomial: derivative.polynomial,
    derivativeTerms: derivative.terms,
    stationarySet: rootData.stationarySet,
    rootAnalysis,
    criticalPoints,
    intervals,
    maximalIntervals,
    overallBehavior: overallBehavior(intervals),
    extrema,
    localMaxima,
    localMinima,
    stationaryNonExtrema,
    valueReduction: reduction,
    verification: completeVerification,
  });
}

export { MAX_VARIATION_POLYNOMIAL_DEGREE };
