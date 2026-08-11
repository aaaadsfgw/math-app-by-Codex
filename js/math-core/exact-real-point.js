import { integerSquareRoot } from "./exact-quadratic-roots.js";
import { ExactRational } from "./exact-rational.js";

const MAX_ISOLATION_BITS = 4_096;

export class ExactRealPointError extends Error {
  constructor(message, { code = "EXACT_REAL_POINT_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactRealPointError";
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

function rawRational(numerator, denominator = 1n) {
  if (typeof numerator !== "bigint" || typeof denominator !== "bigint" || denominator === 0n) {
    throw new TypeError("内部標本点は0でないBigInt分母を持つ分数で指定してください。");
  }
  const sign = denominator < 0n ? -1n : 1n;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return Object.freeze({
    numerator: sign * numerator / divisor,
    denominator: absolute(denominator) / divisor,
  });
}

function compareRawRationals(left, right) {
  return signOfBigInt(
    left.numerator * right.denominator - right.numerator * left.denominator,
  );
}

function signOfIntegerSurd(rationalPart, radicalPart, radicand) {
  if (
    typeof rationalPart !== "bigint"
    || typeof radicalPart !== "bigint"
    || typeof radicand !== "bigint"
    || radicand < 0n
  ) {
    throw new TypeError("整数化した二次体の値を指定してください。");
  }
  const rationalSign = signOfBigInt(rationalPart);
  const radicalSign = radicand === 0n ? 0 : signOfBigInt(radicalPart);
  if (rationalSign === 0) return radicalSign;
  if (radicalSign === 0 || rationalSign === radicalSign) return rationalSign;

  const rationalMagnitude = rationalPart * rationalPart;
  const radicalMagnitude = radicalPart * radicalPart * radicand;
  const magnitudeComparison = signOfBigInt(rationalMagnitude - radicalMagnitude);
  if (magnitudeComparison === 0) return 0;
  return rationalSign > 0 ? magnitudeComparison : -magnitudeComparison;
}

function assertRoot(root) {
  if (
    !root
    || typeof root.numeratorConstant !== "bigint"
    || typeof root.radicalCoefficient !== "bigint"
    || typeof root.radicand !== "bigint"
    || typeof root.denominator !== "bigint"
    || root.radicand < 0n
    || root.denominator <= 0n
  ) {
    throw new TypeError("二次根の内部表現が正しくありません。");
  }
}

function signOfRootMinusRational(root, rational) {
  assertRoot(root);
  if (!(rational instanceof ExactRational)) {
    throw new TypeError("比較対象は厳密分数で指定してください。");
  }
  return signOfIntegerSurd(
    root.numeratorConstant * rational.denominator
      - rational.numerator * root.denominator,
    root.radicalCoefficient * rational.denominator,
    root.radicand,
  );
}

function signOfIntegerQuadraticAtRoot(coefficients, root) {
  assertRoot(root);
  if (
    !Array.isArray(coefficients)
    || coefficients.length !== 3
    || coefficients.some((coefficient) => typeof coefficient !== "bigint")
  ) {
    throw new TypeError("二次式は3個のBigInt係数で指定してください。");
  }
  const [constant, linear, quadratic] = coefficients;
  const p = root.numeratorConstant;
  const q = root.radicalCoefficient;
  const r = root.radicand;
  const d = root.denominator;
  const rationalPart = constant * d * d
    + linear * p * d
    + quadratic * (p * p + q * q * r);
  const radicalPart = linear * q * d + 2n * quadratic * p * q;
  return signOfIntegerSurd(rationalPart, radicalPart, r);
}

export function createExactRationalPoint(value) {
  if (!(value instanceof ExactRational)) {
    throw new TypeError("有理端点は厳密分数で指定してください。");
  }
  return Object.freeze({ kind: "rational", value });
}

export function createExactQuadraticRootPoint(analysis, rootIndex) {
  if (
    !analysis
    || !Array.isArray(analysis.integerCoefficients)
    || !Array.isArray(analysis.roots)
    || !Number.isInteger(rootIndex)
    || rootIndex < 0
    || rootIndex >= analysis.roots.length
  ) {
    throw new TypeError("二次根の解析結果と根番号を指定してください。");
  }
  const root = analysis.roots[rootIndex];
  assertRoot(root);
  if (root.form === "rational") {
    return createExactRationalPoint(
      new ExactRational(root.numeratorConstant, root.denominator),
    );
  }
  if (root.form !== "radical" || analysis.roots.length !== 2) {
    throw new TypeError("二次無理根の解析結果が正しくありません。");
  }
  return Object.freeze({
    kind: "quadratic-root",
    root,
    rootIndex,
    integerCoefficients: analysis.integerCoefficients,
  });
}

function compareQuadraticRootPoints(left, right) {
  const valueSign = signOfIntegerQuadraticAtRoot(
    left.integerCoefficients,
    right.root,
  );
  const [, linear, quadratic] = left.integerCoefficients;
  const vertex = new ExactRational(-linear, 2n * quadratic);
  const rightVsVertex = signOfRootMinusRational(right.root, vertex);

  if (valueSign === 0) {
    const matchingIndex = rightVsVertex < 0 ? 0 : rightVsVertex > 0 ? 1 : null;
    if (matchingIndex === left.rootIndex) return 0;
    return left.rootIndex < (matchingIndex ?? 0) ? -1 : 1;
  }

  const outside = valueSign * signOfBigInt(quadratic) > 0;
  if (left.rootIndex === 0) {
    return outside && rightVsVertex < 0 ? 1 : -1;
  }
  return outside && rightVsVertex > 0 ? -1 : 1;
}

export function compareExactRealPoints(left, right) {
  if (!left || !right) throw new TypeError("比較する2つの厳密実数端点が必要です。");
  if (left.kind === "rational" && right.kind === "rational") {
    return signOfBigInt(
      left.value.numerator * right.value.denominator
        - right.value.numerator * left.value.denominator,
    );
  }
  if (left.kind === "quadratic-root" && right.kind === "rational") {
    return signOfRootMinusRational(left.root, right.value);
  }
  if (left.kind === "rational" && right.kind === "quadratic-root") {
    return -signOfRootMinusRational(right.root, left.value);
  }
  if (left.kind === "quadratic-root" && right.kind === "quadratic-root") {
    return compareQuadraticRootPoints(left, right);
  }
  throw new TypeError("厳密実数端点の種類が正しくありません。");
}

export function exactRealPointEndpoint(point) {
  if (point?.kind === "rational") {
    return Object.freeze({ exact: point.value.toString(), approximate: null });
  }
  if (point?.kind === "quadratic-root") {
    return Object.freeze({ exact: point.root.exact, approximate: null });
  }
  throw new TypeError("厳密実数端点が必要です。");
}

function pointBounds(point, bits) {
  if (point.kind === "rational") {
    const value = rawRational(point.value.numerator, point.value.denominator);
    return { lower: value, upper: value };
  }
  if (point.kind !== "quadratic-root") {
    throw new TypeError("厳密実数端点が必要です。");
  }
  const { root } = point;
  const scale = 1n << BigInt(bits);
  const scaledSquareRoot = integerSquareRoot(root.radicand * scale * scale);
  const lowerRadical = root.radicalCoefficient >= 0n
    ? scaledSquareRoot
    : scaledSquareRoot + 1n;
  const upperRadical = root.radicalCoefficient >= 0n
    ? scaledSquareRoot + 1n
    : scaledSquareRoot;
  const denominator = root.denominator * scale;
  return {
    lower: rawRational(
      root.numeratorConstant * scale + root.radicalCoefficient * lowerRadical,
      denominator,
    ),
    upper: rawRational(
      root.numeratorConstant * scale + root.radicalCoefficient * upperRadical,
      denominator,
    ),
  };
}

function midpoint(left, right) {
  return rawRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    2n * left.denominator * right.denominator,
  );
}

export function rationalSampleBetweenExactPoints(left, right) {
  if (left && right && compareExactRealPoints(left, right) >= 0) {
    throw new RangeError("標本区間の下端は上端より小さくしてください。");
  }
  if (!left && !right) return rawRational(0n);
  if (!left) {
    const lower = pointBounds(right, 4).lower;
    return rawRational(lower.numerator - lower.denominator, lower.denominator);
  }
  if (!right) {
    const upper = pointBounds(left, 4).upper;
    return rawRational(upper.numerator + upper.denominator, upper.denominator);
  }

  for (let bits = 4; bits <= MAX_ISOLATION_BITS; bits *= 2) {
    const leftUpper = pointBounds(left, bits).upper;
    const rightLower = pointBounds(right, bits).lower;
    if (compareRawRationals(leftUpper, rightLower) < 0) {
      return midpoint(leftUpper, rightLower);
    }
  }
  throw new ExactRealPointError("臨界点の間に厳密な有理標本点を分離できません。", {
    code: "POINT_ISOLATION_LIMIT",
    unsupported: true,
  });
}

export function signOfExactPolynomialAtRationalSample(coefficients, sample) {
  if (
    !Array.isArray(coefficients)
    || !coefficients.length
    || coefficients.some((coefficient) => !(coefficient instanceof ExactRational))
    || !sample
    || typeof sample.numerator !== "bigint"
    || typeof sample.denominator !== "bigint"
    || sample.denominator <= 0n
  ) {
    throw new TypeError("厳密多項式と有理標本点を指定してください。");
  }
  const degree = coefficients.length - 1;
  const commonDenominator = coefficients.reduce(
    (value, coefficient) => value * coefficient.denominator,
    1n,
  );
  let value = 0n;
  for (let index = 0; index <= degree; index += 1) {
    const coefficient = coefficients[index];
    if (coefficient.numerator === 0n) continue;
    value += coefficient.numerator
      * (commonDenominator / coefficient.denominator)
      * sample.numerator ** BigInt(index)
      * sample.denominator ** BigInt(degree - index);
  }
  return signOfBigInt(value);
}
