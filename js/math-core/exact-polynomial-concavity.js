import { evaluateExactPolynomialAtQuadraticRoot } from "./exact-quadratic-roots.js";
import {
  ExactPolynomialVariationError,
  evaluateExactPolynomialVariation,
} from "./exact-polynomial-variation.js";
import { ExactRational } from "./exact-rational.js";

const MAX_CONCAVITY_POLYNOMIAL_DEGREE = 4;

export class ExactPolynomialConcavityError extends Error {
  constructor(message, {
    code = "EXACT_POLYNOMIAL_CONCAVITY_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "ExactPolynomialConcavityError";
    this.code = code;
    this.unsupported = unsupported;
  }
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
    throw new TypeError("凹凸を調べる式は厳密分数係数の多項式で指定してください。");
  }
  const length = value.length;
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !Number.isSafeInteger(length)
    || length < 1
    || descriptor?.value !== length
  ) {
    throw new TypeError("凹凸を調べる多項式の配列長が正しくありません。");
  }
  if (length - 1 > MAX_CONCAVITY_POLYNOMIAL_DEGREE) {
    throw new ExactPolynomialConcavityError(
      `凹凸を調べる多項式の次数は${MAX_CONCAVITY_POLYNOMIAL_DEGREE}以下にしてください。`,
      {
        code: "CONCAVITY_POLYNOMIAL_DEGREE_TOO_HIGH",
        unsupported: true,
      },
    );
  }
  const coefficients = Array.from({ length }, (_, index) => {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError("凹凸を調べる多項式の係数配列を疎配列にしないでください。");
    }
    return snapshotExactRational(value[index], `多項式の係数${index}`);
  });
  if (coefficients.length > 1 && coefficients.at(-1).isZero()) {
    throw new ExactPolynomialConcavityError(
      "凹凸を調べる多項式の末尾に不要な0係数があります。",
      { code: "NONCANONICAL_CONCAVITY_POLYNOMIAL" },
    );
  }
  return Object.freeze(coefficients);
}

function zeroPolynomial() {
  return Object.freeze([ExactRational.zero()]);
}

function trimPolynomial(coefficients) {
  let last = coefficients.length - 1;
  while (last > 0 && coefficients[last].isZero()) last -= 1;
  return Object.freeze(coefficients.slice(0, last + 1));
}

function isZeroPolynomial(coefficients) {
  return coefficients.length === 1 && coefficients[0].isZero();
}

function equalPolynomials(left, right) {
  return left.length === right.length
    && left.every((coefficient, index) => coefficient.equals(right[index]));
}

function differentiatePolynomial(coefficients, orderLabel) {
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
  const polynomial = trimPolynomial(terms.map(({ derivativeCoefficient }) => (
    derivativeCoefficient
  )));
  const verified = terms.every(({ verified: termVerified }) => termVerified);
  if (!verified) {
    throw new ExactPolynomialConcavityError(
      `${orderLabel}の係数微分を厳密に再検証できませんでした。`,
      { code: "CONCAVITY_DERIVATIVE_VERIFICATION_FAILED" },
    );
  }
  return Object.freeze({
    polynomial,
    terms: Object.freeze(terms),
    verified,
  });
}

function variationEvidence(firstDerivativePolynomial) {
  try {
    return evaluateExactPolynomialVariation(firstDerivativePolynomial);
  } catch (error) {
    if (!(error instanceof ExactPolynomialVariationError)) throw error;
    throw new ExactPolynomialConcavityError(
      String(error.message).replaceAll("増減", "凹凸"),
      {
        code: String(error.code || "VARIATION_ERROR").replace(
          /^VARIATION_/u,
          "CONCAVITY_",
        ),
        unsupported: error.unsupported,
      },
    );
  }
}

function evaluateRationalPolynomial(coefficients, point) {
  let value = ExactRational.zero();
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    value = value.multiply(point).add(coefficients[index]);
  }
  return value;
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

function evaluatePolynomialAtPoint(coefficients, point) {
  if (point.kind === "rational") {
    return rationalQuadraticValue(
      evaluateRationalPolynomial(coefficients, point.value),
    );
  }
  if (point.kind === "quadratic-root") {
    const value = evaluateExactPolynomialAtQuadraticRoot(coefficients, point);
    return quadraticValue(value.rationalPart, value.radicalPart, point.radicand);
  }
  throw new TypeError("凹凸解析点の厳密実数種別が正しくありません。");
}

function subtractQuadraticValues(left, right) {
  const leftHasRadical = !left.radicalPart.isZero();
  const rightHasRadical = !right.radicalPart.isZero();
  if (
    leftHasRadical
    && rightHasRadical
    && left.radicand !== right.radicand
  ) {
    throw new ExactPolynomialConcavityError(
      "異なる二次体の値を凹凸解析で照合できません。",
      { code: "CONCAVITY_VALUE_FIELD_MISMATCH" },
    );
  }
  return quadraticValue(
    left.rationalPart.subtract(right.rationalPart),
    left.radicalPart.subtract(right.radicalPart),
    leftHasRadical ? left.radicand : right.radicand,
  );
}

function isZeroQuadraticValue(value) {
  return value.rationalPart.isZero() && value.radicalPart.isZero();
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
  if (isZeroPolynomial(divisor)) throw new RangeError("0多項式では割れません。");
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

function valueReduction(polynomial, secondDerivativePolynomial) {
  const division = dividePolynomials(polynomial, secondDerivativePolynomial);
  const reconstructed = addPolynomials(
    multiplyPolynomials(division.quotient, secondDerivativePolynomial),
    division.remainder,
  );
  const reconstructionDifference = addPolynomials(reconstructed, polynomial, -1n);
  const verified = isZeroPolynomial(reconstructionDifference);
  if (!verified) {
    throw new ExactPolynomialConcavityError(
      "変曲点値の検算用多項式除算を再構成できませんでした。",
      { code: "CONCAVITY_VALUE_REDUCTION_VERIFICATION_FAILED" },
    );
  }
  return Object.freeze({
    divisor: secondDerivativePolynomial,
    quotient: division.quotient,
    remainder: division.remainder,
    reconstructed,
    reconstructionDifference,
    verified,
  });
}

function curvatureForSign(sign) {
  if (sign > 0) return "lower-convex";
  if (sign < 0) return "upper-convex";
  return "zero-curvature";
}

function overallCurvature(intervals) {
  const curvatures = new Set(intervals.map(({ curvature }) => curvature));
  return curvatures.size === 1 ? intervals[0].curvature : "mixed";
}

export function evaluateExactPolynomialConcavity(polynomial) {
  const coefficients = snapshotPolynomial(polynomial);
  const degree = coefficients.length - 1;
  const firstDerivative = differentiatePolynomial(coefficients, "一階導関数");
  const secondDerivative = differentiatePolynomial(
    firstDerivative.polynomial,
    "二階導関数",
  );
  const variation = variationEvidence(firstDerivative.polynomial);
  const variationPolynomialMatched = equalPolynomials(
    firstDerivative.polynomial,
    variation.polynomial,
  );
  const secondDerivativePolynomialMatched = equalPolynomials(
    secondDerivative.polynomial,
    variation.derivativePolynomial,
  );
  if (!variationPolynomialMatched || !secondDerivativePolynomialMatched) {
    throw new ExactPolynomialConcavityError(
      "一階・二階導関数と符号解析へ渡した多項式が一致しません。",
      { code: "CONCAVITY_VARIATION_INPUT_VERIFICATION_FAILED" },
    );
  }

  const rootAnalysis = Object.freeze({
    ...variation.rootAnalysis,
    analyzedPolynomial: "second-derivative",
    secondDerivativeDegree: isZeroPolynomial(secondDerivative.polynomial)
      ? null
      : secondDerivative.polynomial.length - 1,
  });
  const intervals = Object.freeze(variation.intervals.map((interval) => {
    const curvature = curvatureForSign(interval.predictedSign);
    const verified = interval.verified
      && interval.derivativeSign === interval.predictedSign;
    return Object.freeze({
      index: interval.index,
      lower: interval.lower,
      upper: interval.upper,
      lowerClosed: interval.lowerClosed,
      upperClosed: interval.upperClosed,
      sample: interval.sample,
      sampleExact: interval.sampleExact,
      secondDerivativeSign: interval.derivativeSign,
      predictedSign: interval.predictedSign,
      curvature,
      verified,
    });
  }));
  const maximalIntervals = Object.freeze(variation.maximalIntervals.map((interval) => {
    const firstPartition = intervals[interval.partitionIndexes[0]];
    const curvature = firstPartition.curvature;
    const verified = interval.verified && interval.partitionIndexes.every((index) => (
      intervals[index].verified && intervals[index].curvature === curvature
    ));
    return Object.freeze({
      index: interval.index,
      lower: interval.lower,
      upper: interval.upper,
      lowerClosed: interval.lowerClosed,
      upperClosed: interval.upperClosed,
      curvature,
      partitionIndexes: interval.partitionIndexes,
      verified,
    });
  }));

  const hasFiniteCandidates = variation.criticalPoints.length > 0;
  const reduction = hasFiniteCandidates
    ? valueReduction(coefficients, secondDerivative.polynomial)
    : null;
  const inflectionCandidates = Object.freeze(variation.criticalPoints.map((critical) => {
    const secondDerivativeValue = evaluatePolynomialAtPoint(
      secondDerivative.polynomial,
      critical.point,
    );
    const secondDerivativeZeroVerified = isZeroQuadraticValue(secondDerivativeValue)
      && critical.derivativeZeroVerified;
    if (!secondDerivativeZeroVerified) {
      throw new ExactPolynomialConcavityError(
        "二階導関数の根への再代入が0になりませんでした。",
        { code: "CONCAVITY_ROOT_VERIFICATION_FAILED" },
      );
    }
    const y = evaluatePolynomialAtPoint(coefficients, critical.point);
    const yViaRemainder = evaluatePolynomialAtPoint(
      reduction.remainder,
      critical.point,
    );
    const yDifference = subtractQuadraticValues(y, yViaRemainder);
    const valueVerified = isZeroQuadraticValue(yDifference);
    if (!valueVerified) {
      throw new ExactPolynomialConcavityError(
        "変曲点候補の関数値を別経路で厳密に再検証できませんでした。",
        { code: "CONCAVITY_POINT_VALUE_VERIFICATION_FAILED" },
      );
    }
    const signChanges = critical.leftSign !== critical.rightSign;
    const classification = signChanges ? "inflection" : "non-inflection";
    const point = Object.freeze({
      x: critical.point,
      y,
      exact: `(${critical.pointExact}, ${y.exact})`,
    });
    return Object.freeze({
      index: critical.index,
      rootIndex: critical.rootIndex,
      x: critical.point,
      xExact: critical.pointExact,
      multiplicity: critical.multiplicity,
      leftSign: critical.leftSign,
      rightSign: critical.rightSign,
      signChanges,
      classification,
      secondDerivativeValue,
      secondDerivativeValueExact: secondDerivativeValue.exact,
      secondDerivativeZeroVerified,
      y,
      yExact: y.exact,
      yViaRemainder,
      yDifference,
      valueVerified,
      point,
      verified: secondDerivativeZeroVerified && valueVerified,
    });
  }));
  const inflectionPoints = Object.freeze(inflectionCandidates.filter(({ signChanges }) => (
    signChanges
  )));
  const nonInflectionCandidates = Object.freeze(
    inflectionCandidates.filter(({ signChanges }) => !signChanges),
  );
  const lowerConvexIntervals = Object.freeze(
    maximalIntervals.filter(({ curvature }) => curvature === "lower-convex"),
  );
  const upperConvexIntervals = Object.freeze(
    maximalIntervals.filter(({ curvature }) => curvature === "upper-convex"),
  );
  const zeroCurvatureIntervals = Object.freeze(
    maximalIntervals.filter(({ curvature }) => curvature === "zero-curvature"),
  );

  const verification = {
    firstDerivativeCoefficientsVerified: firstDerivative.verified,
    secondDerivativeCoefficientsVerified: secondDerivative.verified,
    variationPolynomialMatched,
    secondDerivativePolynomialMatched,
    rootsComplete: rootAnalysis.complete,
    rootsVerified: inflectionCandidates.every(({ secondDerivativeZeroVerified }) => (
      secondDerivativeZeroVerified
    )),
    orderingVerified: rootAnalysis.orderingVerified,
    intervalSignsVerified: intervals.every(({ verified }) => verified),
    maximalIntervalsVerified: maximalIntervals.every(({ verified }) => verified),
    candidateValuesVerified: inflectionCandidates.every(({ valueVerified }) => valueVerified),
    classificationsVerified: inflectionCandidates.every((candidate) => (
      candidate.signChanges === (candidate.leftSign !== candidate.rightSign)
      && candidate.classification === (
        candidate.signChanges ? "inflection" : "non-inflection"
      )
    )),
    filtersVerified: inflectionPoints.length + nonInflectionCandidates.length
      === inflectionCandidates.length,
    valueReductionVerified: reduction === null || reduction.verified,
  };
  const verified = Object.values(verification).every((value) => value === true);
  const completeVerification = Object.freeze({ ...verification, verified });
  if (!verified) {
    throw new ExactPolynomialConcavityError(
      "多項式の凹凸・変曲点を最後まで厳密に検証できませんでした。",
      { code: "CONCAVITY_VERIFICATION_FAILED" },
    );
  }

  return Object.freeze({
    polynomial: coefficients,
    degree,
    firstDerivativePolynomial: firstDerivative.polynomial,
    secondDerivativePolynomial: secondDerivative.polynomial,
    firstDerivativeTerms: firstDerivative.terms,
    secondDerivativeTerms: secondDerivative.terms,
    rootAnalysis,
    intervals,
    maximalIntervals,
    inflectionCandidates,
    inflectionPoints,
    nonInflectionCandidates,
    lowerConvexIntervals,
    upperConvexIntervals,
    zeroCurvatureIntervals,
    overallCurvature: overallCurvature(intervals),
    valueReduction: reduction,
    verification: completeVerification,
  });
}

export { MAX_CONCAVITY_POLYNOMIAL_DEGREE };
