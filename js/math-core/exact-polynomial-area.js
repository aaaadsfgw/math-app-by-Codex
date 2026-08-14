import {
  analyzeExactQuadraticRoots,
  evaluateExactPolynomialAtQuadraticRoot,
  signOfExactQuadraticValue,
} from "./exact-quadratic-roots.js";
import {
  compareExactRealPoints,
  createExactQuadraticRootPoint,
  createExactRationalPoint,
  exactRealPointEndpoint,
  rationalSampleBetweenExactPoints,
  signOfExactPolynomialAtRationalSample,
} from "./exact-real-point.js";
import {
  exactPolynomialDegree,
  subtractExactPolynomials,
} from "./exact-polynomial.js";
import {
  evaluateExactPolynomialForIntegral,
  integrateExactPolynomial,
} from "./exact-polynomial-integral.js";
import { ExactRational } from "./exact-rational.js";

const MAX_AREA_CURVE_DEGREE = 4;
const MAX_AREA_DIFFERENCE_DEGREE = 2;
const AREA_BOUND_MODES = Object.freeze(["explicit", "intersections"]);
const AREA_BOUND_MODE_SET = new Set(AREA_BOUND_MODES);

export class ExactPolynomialAreaError extends Error {
  constructor(message, {
    code = "EXACT_POLYNOMIAL_AREA_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "ExactPolynomialAreaError";
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

function snapshotPolynomial(value, label) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${label}は厳密分数係数の多項式で指定してください。`);
  }
  const length = value.length;
  const descriptor = Object.getOwnPropertyDescriptor(value, "length");
  if (
    !Number.isSafeInteger(length)
    || length < 1
    || descriptor?.value !== length
  ) {
    throw new TypeError(`${label}の配列長が正しくありません。`);
  }
  if (length - 1 > MAX_AREA_CURVE_DEGREE) {
    throw new ExactPolynomialAreaError(
      `${label}の次数は${MAX_AREA_CURVE_DEGREE}以下にしてください。`,
      { code: "CURVE_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const coefficients = Array.from({ length }, (_, index) => {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`${label}の係数配列を疎配列にしないでください。`);
    }
    return snapshotExactRational(value[index], `${label}の係数${index}`);
  });
  if (coefficients.length > 1 && coefficients.at(-1).isZero()) {
    throw new ExactPolynomialAreaError(`${label}の末尾に不要な0係数があります。`, {
      code: "NONCANONICAL_AREA_POLYNOMIAL",
    });
  }
  return Object.freeze(coefficients);
}

function compareRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function linearRadicalValue(rationalPart, radicalPart, radicand) {
  let rational = snapshotExactRational(rationalPart, "二次体の有理数部分");
  let radical = snapshotExactRational(radicalPart, "二次体の根号係数");
  if (typeof radicand !== "bigint" || radicand < 0n) {
    throw new TypeError("二次体の被開平数は0以上のBigIntで指定してください。");
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
  return Object.freeze({
    rationalPart: rational,
    radicalPart: radical,
    radicand: normalizedRadicand,
  });
}

function rationalLinearRadical(value) {
  return linearRadicalValue(value, ExactRational.zero(), 0n);
}

function addLinearRadicals(left, right) {
  const leftHasRadical = !left.radicalPart.isZero();
  const rightHasRadical = !right.radicalPart.isZero();
  if (
    leftHasRadical
    && rightHasRadical
    && left.radicand !== right.radicand
  ) {
    throw new ExactPolynomialAreaError(
      "異なる二次体の面積値を同じ結果へ結合できません。",
      { code: "INCOMPATIBLE_AREA_RADICANDS" },
    );
  }
  const radicand = leftHasRadical ? left.radicand : right.radicand;
  return linearRadicalValue(
    left.rationalPart.add(right.rationalPart),
    left.radicalPart.add(right.radicalPart),
    radicand,
  );
}

function negateLinearRadical(value) {
  return linearRadicalValue(
    value.rationalPart.negate(),
    value.radicalPart.negate(),
    value.radicand,
  );
}

function subtractLinearRadicals(left, right) {
  return addLinearRadicals(left, negateLinearRadical(right));
}

function signOfLinearRadical(value) {
  return signOfExactQuadraticValue(value, value.radicand);
}

function absoluteLinearRadical(value) {
  return signOfLinearRadical(value) < 0 ? negateLinearRadical(value) : value;
}

function formatRadicalTerm(coefficient, radicand) {
  const magnitude = absolute(coefficient);
  return `${magnitude === 1n ? "" : magnitude}√${radicand}`;
}

function formatLinearRadical(value) {
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

function realRootsOfDifference(coefficients) {
  const degree = exactPolynomialDegree(coefficients);
  if (degree === 0) return Object.freeze([]);
  if (degree === 1) {
    return Object.freeze([
      createExactRationalPoint(coefficients[0].negate().divide(coefficients[1])),
    ]);
  }
  if (degree !== 2) {
    throw new ExactPolynomialAreaError(
      `面積の符号分割は差の次数が${MAX_AREA_DIFFERENCE_DEGREE}以下の場合だけ対応しています。`,
      { code: "AREA_DIFFERENCE_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const analysis = analyzeExactQuadraticRoots(coefficients);
  return Object.freeze(analysis.roots.map((_, index) => (
    createExactQuadraticRootPoint(analysis, index)
  )));
}

function uniqueSortedPoints(points) {
  const sorted = [...points].sort(compareExactRealPoints);
  const unique = [];
  for (const point of sorted) {
    if (
      !unique.length
      || compareExactRealPoints(unique.at(-1), point) !== 0
    ) {
      unique.push(point);
    }
  }
  return Object.freeze(unique);
}

function endpointRecord(point) {
  return Object.freeze({
    point,
    ...exactRealPointEndpoint(point),
  });
}

function evaluateAntiderivativeAtPoint(antiderivative, point) {
  if (point.kind === "rational") {
    return rationalLinearRadical(
      evaluateExactPolynomialForIntegral(antiderivative, point.value),
    );
  }
  if (point.kind === "quadratic-root") {
    const value = evaluateExactPolynomialAtQuadraticRoot(
      antiderivative,
      point.root,
    );
    return linearRadicalValue(
      value.rationalPart,
      value.radicalPart,
      point.root.radicand,
    );
  }
  throw new TypeError("面積区間の端点種別が正しくありません。");
}

function explicitBounds(lower, upper) {
  if (lower === null || lower === undefined || upper === null || upper === undefined) {
    throw new ExactPolynomialAreaError("面積を求める有限区間の両端を指定してください。", {
      code: "MISSING_AREA_BOUNDS",
    });
  }
  const lowerValue = snapshotExactRational(lower, "面積区間の下端");
  const upperValue = snapshotExactRational(upper, "面積区間の上端");
  if (compareRationals(lowerValue, upperValue) >= 0) {
    throw new ExactPolynomialAreaError("面積区間は下端が上端より小さくなるように指定してください。", {
      code: "INVALID_AREA_INTERVAL_ORDER",
    });
  }
  return Object.freeze({
    lower: createExactRationalPoint(lowerValue),
    upper: createExactRationalPoint(upperValue),
  });
}

function intersectionBounds(roots, lower, upper) {
  if (lower !== null && lower !== undefined || upper !== null && upper !== undefined) {
    throw new ExactPolynomialAreaError(
      "交点区間形式と明示区間を同時に指定しないでください。",
      { code: "CONFLICTING_AREA_BOUNDS" },
    );
  }
  if (roots.length !== 2 || compareExactRealPoints(roots[0], roots[1]) === 0) {
    throw new ExactPolynomialAreaError(
      "2曲線には面積を囲む異なる2個の実交点がありません。",
      { code: "INTERSECTION_COUNT_MISMATCH" },
    );
  }
  const sorted = uniqueSortedPoints(roots);
  if (sorted.length !== 2) {
    throw new ExactPolynomialAreaError(
      "2曲線には面積を囲む異なる2個の実交点がありません。",
      { code: "INTERSECTION_COUNT_MISMATCH" },
    );
  }
  return Object.freeze({ lower: sorted[0], upper: sorted[1] });
}

export function evaluateExactPolynomialArea(
  firstPolynomial,
  secondPolynomial,
  {
    mode = "explicit",
    lower = null,
    upper = null,
  } = {},
) {
  if (!AREA_BOUND_MODE_SET.has(mode)) {
    throw new TypeError("面積区間形式はexplicitまたはintersectionsにしてください。");
  }
  const first = snapshotPolynomial(firstPolynomial, "第1曲線");
  const second = snapshotPolynomial(secondPolynomial, "第2曲線");
  const difference = subtractExactPolynomials(first, second);
  if (exactPolynomialDegree(difference) > MAX_AREA_DIFFERENCE_DEGREE) {
    throw new ExactPolynomialAreaError(
      `2曲線の差は${MAX_AREA_DIFFERENCE_DEGREE}次以下にしてください。`,
      { code: "AREA_DIFFERENCE_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const roots = realRootsOfDifference(difference);
  const bounds = mode === "intersections"
    ? intersectionBounds(roots, lower, upper)
    : explicitBounds(lower, upper);
  const intersections = Object.freeze(roots.filter((point) => (
    compareExactRealPoints(point, bounds.lower) >= 0
    && compareExactRealPoints(point, bounds.upper) <= 0
  )));
  const partitionPoints = uniqueSortedPoints([
    bounds.lower,
    ...intersections,
    bounds.upper,
  ]);
  const antiderivative = integrateExactPolynomial(difference);
  const pieces = [];
  let total = rationalLinearRadical(ExactRational.zero());

  for (let index = 0; index + 1 < partitionPoints.length; index += 1) {
    const left = partitionPoints[index];
    const right = partitionPoints[index + 1];
    const sample = rationalSampleBetweenExactPoints(left, right);
    const sign = signOfExactPolynomialAtRationalSample(difference, sample);
    const signedIntegral = subtractLinearRadicals(
      evaluateAntiderivativeAtPoint(antiderivative, right),
      evaluateAntiderivativeAtPoint(antiderivative, left),
    );
    const integralSign = signOfLinearRadical(signedIntegral);
    if (integralSign !== sign) {
      throw new ExactPolynomialAreaError(
        "区間上の符号と厳密積分値の符号が一致しません。",
        { code: "AREA_SIGN_VERIFICATION_FAILED" },
      );
    }
    const area = absoluteLinearRadical(signedIntegral);
    total = addLinearRadicals(total, area);
    pieces.push(Object.freeze({
      lower: endpointRecord(left),
      upper: endpointRecord(right),
      sign,
      upperCurve: sign > 0 ? "first" : sign < 0 ? "second" : "equal",
      signedIntegral,
      signedExact: formatLinearRadical(signedIntegral),
      area,
      areaExact: formatLinearRadical(area),
    }));
  }

  if (signOfLinearRadical(total) < 0) {
    throw new ExactPolynomialAreaError("面積の合計が負になりました。", {
      code: "NEGATIVE_AREA_VERIFICATION_FAILED",
    });
  }
  return Object.freeze({
    firstPolynomial: first,
    secondPolynomial: second,
    difference,
    antiderivative,
    mode,
    lower: endpointRecord(bounds.lower),
    upper: endpointRecord(bounds.upper),
    intersections: Object.freeze(intersections.map(endpointRecord)),
    partitionPoints: Object.freeze(partitionPoints.map(endpointRecord)),
    pieces: Object.freeze(pieces),
    value: total,
    exact: formatLinearRadical(total),
  });
}

export {
  AREA_BOUND_MODES,
  MAX_AREA_CURVE_DEGREE,
  MAX_AREA_DIFFERENCE_DEGREE,
};
