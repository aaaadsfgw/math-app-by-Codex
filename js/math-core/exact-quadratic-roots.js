import { ExactPolynomialError } from "./exact-polynomial.js";
import { ExactRational } from "./exact-rational.js";

const MAX_INTEGER_COEFFICIENT = 10n ** 100n;
const MAX_FACTORED_DISCRIMINANT = 1_000_000_000_000n;
const MAX_LARGE_DISCRIMINANT_TRIAL_FACTOR = 10_000n;

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) [a, b] = [b, a % b];
  return a;
}

function leastCommonMultiple(left, right) {
  return absolute(left / greatestCommonDivisor(left, right) * right);
}

function primitiveIntegerCoefficients(coefficients) {
  if (
    !Array.isArray(coefficients)
    || coefficients.length !== 3
    || coefficients.some((coefficient) => !(coefficient instanceof ExactRational))
  ) {
    throw new TypeError("二次式の係数は3個の厳密分数で指定してください。");
  }
  if (coefficients[2].isZero()) {
    throw new ExactPolynomialError("二次式ではありません。", {
      code: "NOT_QUADRATIC",
      unsupported: true,
    });
  }

  const commonDenominator = coefficients.reduce(
    (value, coefficient) => leastCommonMultiple(value, coefficient.denominator),
    1n,
  );
  let integers = coefficients.map((coefficient) => (
    coefficient.numerator * (commonDenominator / coefficient.denominator)
  ));
  const divisor = integers.reduce(
    (value, coefficient) => greatestCommonDivisor(value, coefficient),
    0n,
  );
  integers = integers.map((coefficient) => coefficient / divisor);
  if (integers.some((coefficient) => absolute(coefficient) > MAX_INTEGER_COEFFICIENT)) {
    throw new ExactPolynomialError("二次式の係数が大きすぎます。", {
      code: "COEFFICIENT_TOO_LARGE",
      unsupported: true,
    });
  }
  return Object.freeze(integers);
}

export function integerSquareRoot(value) {
  if (typeof value !== "bigint" || value < 0n) {
    throw new RangeError("0以上のBigIntを指定してください。");
  }
  if (value < 2n) return value;
  const bitLength = value.toString(2).length;
  let estimate = 1n << BigInt(Math.ceil(bitLength / 2));
  while (true) {
    const next = (estimate + value / estimate) / 2n;
    if (next >= estimate) return estimate;
    estimate = next;
  }
}

function simplifiedRadical(value) {
  let inside = value;
  let outside = 1n;
  const maximumFactor = value <= MAX_FACTORED_DISCRIMINANT
    ? integerSquareRoot(value)
    : MAX_LARGE_DISCRIMINANT_TRIAL_FACTOR;
  for (
    let factor = 2n;
    factor <= maximumFactor && factor * factor <= inside;
    factor += 1n
  ) {
    const square = factor * factor;
    while (inside % square === 0n) {
      outside *= factor;
      inside /= square;
    }
  }
  return { outside, inside };
}

function formatAlgebraicRoot({
  numeratorConstant,
  radicalCoefficient,
  radicand,
  denominator,
}) {
  if (radicalCoefficient === 0n) {
    return new ExactRational(numeratorConstant, denominator).toString();
  }
  const radicalMagnitude = absolute(radicalCoefficient);
  const radical = `${radicalMagnitude === 1n ? "" : radicalMagnitude}√${radicand}`;
  let numerator;
  if (numeratorConstant === 0n) {
    numerator = `${radicalCoefficient < 0n ? "-" : ""}${radical}`;
  } else {
    numerator = `${numeratorConstant}${radicalCoefficient < 0n ? "-" : "+"}${radical}`;
  }
  if (denominator === 1n) return numerator;
  return numeratorConstant === 0n
    ? `${numerator}/${denominator}`
    : `(${numerator})/${denominator}`;
}

function createRationalRoot(numerator, denominator) {
  const rational = new ExactRational(numerator, denominator);
  return Object.freeze({
    form: "rational",
    exact: rational.toString(),
    approximate: null,
    numeratorConstant: rational.numerator,
    radicalCoefficient: 0n,
    radicand: 0n,
    denominator: rational.denominator,
  });
}

function createRadicalRoot(numeratorConstant, radicalCoefficient, radicand, denominator) {
  const divisor = greatestCommonDivisor(
    greatestCommonDivisor(numeratorConstant, radicalCoefficient),
    denominator,
  );
  const root = {
    form: "radical",
    numeratorConstant: numeratorConstant / divisor,
    radicalCoefficient: radicalCoefficient / divisor,
    radicand,
    denominator: denominator / divisor,
  };
  return Object.freeze({
    ...root,
    exact: formatAlgebraicRoot(root),
    approximate: null,
  });
}

function finiteApproximation(value) {
  return Number.isFinite(value) ? value : null;
}

function stableRootApproximations(a, b, c, discriminant) {
  const aNumber = Number(a);
  const bNumber = Number(b);
  const cNumber = Number(c);
  const discriminantNumber = Number(discriminant);
  if (![aNumber, bNumber, cNumber, discriminantNumber].every(Number.isFinite)) {
    return [null, null];
  }
  const squareRoot = Math.sqrt(discriminantNumber);
  if (!Number.isFinite(squareRoot)) return [null, null];
  const q = -0.5 * (bNumber + (bNumber < 0 ? -squareRoot : squareRoot));
  const roots = q === 0
    ? [
      (-bNumber - squareRoot) / (2 * aNumber),
      (-bNumber + squareRoot) / (2 * aNumber),
    ]
    : [q / aNumber, cNumber / q];
  roots.sort((left, right) => left - right);
  if (!roots.every(Number.isFinite) || !(roots[0] < roots[1])) return [null, null];
  return roots;
}

function withApproximation(root, approximate) {
  return Object.freeze({
    ...root,
    approximate: finiteApproximation(approximate),
  });
}

export function evaluateExactPolynomialAtQuadraticRoot(coefficients, root) {
  if (
    !Array.isArray(coefficients)
    || coefficients.some((coefficient) => !(coefficient instanceof ExactRational))
    || !root
  ) {
    throw new TypeError("厳密係数と二次根を指定してください。");
  }
  const p = root.numeratorConstant;
  const q = root.radicalCoefficient;
  const r = root.radicand;
  const d = root.denominator;
  if ([p, q, r, d].some((value) => typeof value !== "bigint") || d <= 0n || r < 0n) {
    throw new TypeError("二次根の内部表現が正しくありません。");
  }

  const rootRational = new ExactRational(p, d);
  const rootRadical = new ExactRational(q, d);
  const radicand = new ExactRational(r);
  let rationalPart = ExactRational.zero();
  let radicalPart = ExactRational.zero();
  for (let index = coefficients.length - 1; index >= 0; index -= 1) {
    const nextRational = rationalPart.multiply(rootRational)
      .add(radicalPart.multiply(rootRadical).multiply(radicand))
      .add(coefficients[index]);
    const nextRadical = rationalPart.multiply(rootRadical)
      .add(radicalPart.multiply(rootRational));
    rationalPart = nextRational;
    radicalPart = nextRadical;
  }
  return Object.freeze({
    rationalPart,
    radicalPart,
    isZero: rationalPart.isZero() && radicalPart.isZero(),
  });
}

function rationalSign(value) {
  return value.numerator < 0n ? -1 : value.numerator > 0n ? 1 : 0;
}

export function signOfExactQuadraticValue(value, radicand) {
  const rationalPart = value?.rationalPart;
  const radicalPart = value?.radicalPart;
  if (
    !(rationalPart instanceof ExactRational)
    || !(radicalPart instanceof ExactRational)
    || typeof radicand !== "bigint"
    || radicand < 0n
  ) {
    throw new TypeError("二次体の値と非負の被開平数を指定してください。");
  }
  const rationalPartSign = rationalSign(rationalPart);
  const radicalPartSign = radicand === 0n ? 0 : rationalSign(radicalPart);
  if (rationalPartSign === 0) return radicalPartSign;
  if (radicalPartSign === 0 || rationalPartSign === radicalPartSign) {
    return rationalPartSign;
  }

  const rationalMagnitude = rationalPart.numerator * rationalPart.numerator
    * radicalPart.denominator * radicalPart.denominator;
  const radicalMagnitude = radicalPart.numerator * radicalPart.numerator
    * rationalPart.denominator * rationalPart.denominator
    * radicand;
  const magnitudeComparison = rationalMagnitude < radicalMagnitude
    ? -1
    : rationalMagnitude > radicalMagnitude
      ? 1
      : 0;
  if (magnitudeComparison === 0) return 0;
  return rationalPartSign > 0
    ? magnitudeComparison
    : -magnitudeComparison;
}

function rootComponents(integerCoefficients, discriminant) {
  const [cOriginal, bOriginal, aOriginal] = integerCoefficients;
  let a = aOriginal;
  let b = bOriginal;
  let c = cOriginal;
  if (a < 0n) {
    a = -a;
    b = -b;
    c = -c;
  }
  const denominator = 2n * a;
  const squareRoot = integerSquareRoot(discriminant);
  if (squareRoot * squareRoot === discriminant) {
    if (discriminant === 0n) {
      const root = createRationalRoot(-b, denominator);
      const approximate = -Number(b) / Number(denominator);
      return [withApproximation(root, approximate)];
    }
    const approximations = stableRootApproximations(a, b, c, discriminant);
    return [
      withApproximation(createRationalRoot(-b - squareRoot, denominator), approximations[0]),
      withApproximation(createRationalRoot(-b + squareRoot, denominator), approximations[1]),
    ];
  }

  const radical = simplifiedRadical(discriminant);
  const approximations = stableRootApproximations(a, b, c, discriminant);
  return [
    withApproximation(
      createRadicalRoot(-b, -radical.outside, radical.inside, denominator),
      approximations[0],
    ),
    withApproximation(
      createRadicalRoot(-b, radical.outside, radical.inside, denominator),
      approximations[1],
    ),
  ];
}

export function verifyExactQuadraticRoot(integerCoefficients, root) {
  if (
    !Array.isArray(integerCoefficients)
    || integerCoefficients.length !== 3
    || integerCoefficients.some((coefficient) => typeof coefficient !== "bigint")
    || !root
  ) {
    return false;
  }
  try {
    return evaluateExactPolynomialAtQuadraticRoot(
      integerCoefficients.map((coefficient) => new ExactRational(coefficient)),
      root,
    ).isZero;
  } catch {
    return false;
  }
}

export function analyzeExactQuadraticRoots(coefficients) {
  const integerCoefficients = primitiveIntegerCoefficients(coefficients);
  const [c, b, a] = integerCoefficients;
  const discriminant = b * b - 4n * a * c;
  const rootKind = discriminant < 0n
    ? "no-real"
    : discriminant === 0n
      ? "double"
      : "two-real";
  const roots = discriminant < 0n
    ? Object.freeze([])
    : Object.freeze(rootComponents(integerCoefficients, discriminant));
  if (roots.some((root) => !verifyExactQuadraticRoot(integerCoefficients, root))) {
    throw new ExactPolynomialError("二次方程式の厳密検算に失敗しました。", {
      code: "ROOT_VERIFICATION_FAILED",
    });
  }
  return Object.freeze({
    integerCoefficients,
    discriminant,
    rootKind,
    roots,
  });
}
