import { ExactLinearPi } from "./exact-linear-pi.js";
import { ExactRational } from "./exact-rational.js";

const MAX_VOLUME_RADIUS_DEGREE = 2;
const MAX_VOLUME_CROSS_SECTION_DEGREE = 4;

export class ExactPolynomialVolumeError extends Error {
  constructor(message, {
    code = "EXACT_POLYNOMIAL_VOLUME_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "ExactPolynomialVolumeError";
    this.code = code;
    this.unsupported = unsupported;
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

function snapshotRadiusPolynomial(value, label) {
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
  if (length - 1 > MAX_VOLUME_RADIUS_DEGREE) {
    throw new ExactPolynomialVolumeError(
      `${label}の次数は${MAX_VOLUME_RADIUS_DEGREE}以下にしてください。`,
      { code: "RADIUS_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const coefficients = Array.from({ length }, (_, index) => {
    if (!Object.hasOwn(value, index)) {
      throw new TypeError(`${label}の係数配列を疎配列にしないでください。`);
    }
    return snapshotExactRational(value[index], `${label}の係数${index}`);
  });
  if (coefficients.length > 1 && coefficients.at(-1).isZero()) {
    throw new ExactPolynomialVolumeError(`${label}の末尾に不要な0係数があります。`, {
      code: "NONCANONICAL_VOLUME_POLYNOMIAL",
    });
  }
  return Object.freeze(coefficients);
}

function compareRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
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

function multiplyPolynomials(left, right) {
  const resultDegree = left.length + right.length - 2;
  if (resultDegree > MAX_VOLUME_CROSS_SECTION_DEGREE) {
    throw new ExactPolynomialVolumeError(
      `回転断面の次数は${MAX_VOLUME_CROSS_SECTION_DEGREE}以下にしてください。`,
      { code: "CROSS_SECTION_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const coefficients = Array.from(
    { length: resultDegree + 1 },
    () => ExactRational.zero(),
  );
  for (let leftDegree = 0; leftDegree < left.length; leftDegree += 1) {
    for (let rightDegree = 0; rightDegree < right.length; rightDegree += 1) {
      if (left[leftDegree].isZero() || right[rightDegree].isZero()) continue;
      const resultIndex = leftDegree + rightDegree;
      coefficients[resultIndex] = coefficients[resultIndex].add(
        left[leftDegree].multiply(right[rightDegree]),
      );
    }
  }
  return trimPolynomial(coefficients);
}

function evaluatePolynomial(coefficients, value) {
  return coefficients.reduceRight(
    (sum, coefficient) => sum.multiply(value).add(coefficient),
    ExactRational.zero(),
  );
}

function integratePolynomial(coefficients) {
  return trimPolynomial([
    ExactRational.zero(),
    ...coefficients.map((coefficient, index) => (
      coefficient.divide(new ExactRational(BigInt(index + 1)))
    )),
  ]);
}

function certificateCandidate(kind, x, polynomial) {
  const labels = Object.freeze({
    "lower-endpoint": "下端",
    "upper-endpoint": "上端",
    vertex: "頂点",
  });
  return Object.freeze({
    kind,
    label: labels[kind],
    x,
    value: evaluatePolynomial(polynomial, x),
  });
}

function nonnegativeCertificate(polynomial, lower, upper, label) {
  const candidates = [
    certificateCandidate("lower-endpoint", lower, polynomial),
    certificateCandidate("upper-endpoint", upper, polynomial),
  ];
  const degree = polynomial.length - 1;
  if (degree === 2 && polynomial[2].numerator > 0n) {
    const vertex = polynomial[1].negate().divide(
      polynomial[2].multiply(new ExactRational(2n)),
    );
    if (
      compareRationals(lower, vertex) < 0
      && compareRationals(vertex, upper) < 0
    ) {
      candidates.push(certificateCandidate("vertex", vertex, polynomial));
    }
  }
  const witness = candidates.reduce((minimum, candidate) => (
    compareRationals(candidate.value, minimum.value) < 0 ? candidate : minimum
  ));
  return Object.freeze({
    label,
    verified: witness.value.numerator >= 0n,
    degree,
    minimum: witness.value,
    witness,
    candidates: Object.freeze(candidates),
    checkpoints: Object.freeze(candidates),
  });
}

function requireNonnegative(certificate, label, code) {
  if (certificate.verified) return;
  throw new ExactPolynomialVolumeError(
    `${label}が区間内のx=${certificate.witness.x}で${certificate.minimum}となり、0未満です。`,
    { code, unsupported: true },
  );
}

function explicitBounds(lower, upper) {
  if (lower === null || lower === undefined || upper === null || upper === undefined) {
    throw new ExactPolynomialVolumeError(
      "回転体の区間の下端と上端を指定してください。",
      { code: "MISSING_VOLUME_BOUNDS" },
    );
  }
  const lowerValue = snapshotExactRational(lower, "回転体区間の下端");
  const upperValue = snapshotExactRational(upper, "回転体区間の上端");
  if (compareRationals(lowerValue, upperValue) >= 0) {
    throw new ExactPolynomialVolumeError(
      "回転体区間の下端が上端より小さくなるように指定してください。",
      { code: "INVALID_VOLUME_INTERVAL_ORDER" },
    );
  }
  return Object.freeze({ lower: lowerValue, upper: upperValue });
}

export function evaluateExactPolynomialVolume(
  outerRadius,
  innerRadius,
  { lower = null, upper = null } = {},
) {
  const outerRadiusPolynomial = snapshotRadiusPolynomial(outerRadius, "外側半径");
  const innerRadiusPolynomial = snapshotRadiusPolynomial(innerRadius, "内側半径");
  const bounds = explicitBounds(lower, upper);
  const radiusDifference = addPolynomials(
    outerRadiusPolynomial,
    innerRadiusPolynomial,
    -1n,
  );

  const innerCertificate = nonnegativeCertificate(
    innerRadiusPolynomial,
    bounds.lower,
    bounds.upper,
    "内側半径r(x)",
  );
  requireNonnegative(innerCertificate, "内側半径", "INNER_RADIUS_NEGATIVE");
  const outerCertificate = nonnegativeCertificate(
    outerRadiusPolynomial,
    bounds.lower,
    bounds.upper,
    "外側半径R(x)",
  );
  requireNonnegative(outerCertificate, "外側半径", "OUTER_RADIUS_NEGATIVE");
  const orderCertificate = nonnegativeCertificate(
    radiusDifference,
    bounds.lower,
    bounds.upper,
    "半径差R(x)-r(x)",
  );
  requireNonnegative(
    orderCertificate,
    "外側半径と内側半径の差",
    "RADIUS_ORDER_VIOLATION",
  );

  const outerSquared = multiplyPolynomials(
    outerRadiusPolynomial,
    outerRadiusPolynomial,
  );
  const innerSquared = multiplyPolynomials(
    innerRadiusPolynomial,
    innerRadiusPolynomial,
  );
  const crossSectionPolynomial = addPolynomials(outerSquared, innerSquared, -1n);
  const antiderivative = integratePolynomial(crossSectionPolynomial);
  const lowerValue = evaluatePolynomial(antiderivative, bounds.lower);
  const upperValue = evaluatePolynomial(antiderivative, bounds.upper);
  const volumeCoefficient = upperValue.subtract(lowerValue);
  if (volumeCoefficient.numerator < 0n) {
    throw new ExactPolynomialVolumeError(
      "回転断面の厳密積分が負になり、非負性の検算に失敗しました。",
      { code: "NEGATIVE_VOLUME_VERIFICATION_FAILED" },
    );
  }
  const value = new ExactLinearPi(ExactRational.zero(), volumeCoefficient);

  return Object.freeze({
    outerRadiusPolynomial,
    innerRadiusPolynomial,
    radiusDifference,
    outerSquared,
    innerSquared,
    crossSectionPolynomial,
    antiderivative,
    lower: bounds.lower,
    upper: bounds.upper,
    outerCertificate,
    innerCertificate,
    orderCertificate,
    volumeCoefficient,
    value,
    exact: value.toString(),
  });
}

export {
  MAX_VOLUME_CROSS_SECTION_DEGREE,
  MAX_VOLUME_RADIUS_DEGREE,
};
