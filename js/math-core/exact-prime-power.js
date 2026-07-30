import { ExactRational } from "./exact-rational.js";

const MAX_FACTORABLE_COMPONENT = 1_000_000_000_000n;

export class ExactPrimePowerError extends Error {
  constructor(message, { code = "EXACT_PRIME_POWER_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "ExactPrimePowerError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function absolute(value) {
  return value < 0n ? -value : value;
}

function addIntegerExponent(vector, prime, exponent) {
  if (exponent === 0n) return;
  const key = prime.toString();
  const next = (vector.get(key) ?? 0n) + exponent;
  if (next === 0n) vector.delete(key);
  else vector.set(key, next);
}

function factorPositiveInteger(value, sign, output) {
  if (value > MAX_FACTORABLE_COMPONENT) {
    throw new ExactPrimePowerError(
      `素因数分解する整数は${MAX_FACTORABLE_COMPONENT}以下にしてください。`,
      { code: "FACTORING_LIMIT", unsupported: true },
    );
  }
  let remaining = value;
  let exponent = 0n;
  while (remaining % 2n === 0n) {
    remaining /= 2n;
    exponent += 1n;
  }
  addIntegerExponent(output, 2n, sign * exponent);
  for (let factor = 3n; factor * factor <= remaining; factor += 2n) {
    exponent = 0n;
    while (remaining % factor === 0n) {
      remaining /= factor;
      exponent += 1n;
    }
    addIntegerExponent(output, factor, sign * exponent);
  }
  if (remaining > 1n) addIntegerExponent(output, remaining, sign);
}

export function factorPositiveRational(value) {
  if (!(value instanceof ExactRational)) {
    throw new TypeError("厳密分数を指定してください。");
  }
  if (value.numerator <= 0n) {
    throw new ExactPrimePowerError("素因数指数へ変換する値は正である必要があります。", {
      code: "NONPOSITIVE_VALUE",
    });
  }
  const vector = new Map();
  factorPositiveInteger(absolute(value.numerator), 1n, vector);
  factorPositiveInteger(value.denominator, -1n, vector);
  return Object.freeze(
    [...vector.entries()]
      .sort(([left], [right]) => {
        const leftPrime = BigInt(left);
        const rightPrime = BigInt(right);
        return leftPrime < rightPrime ? -1 : leftPrime > rightPrime ? 1 : 0;
      })
      .map(([prime, exponent]) => Object.freeze({ prime, exponent })),
  );
}

function rationalVector(entries, multiplier) {
  return new Map(entries.map(({ prime, exponent }) => [
    prime,
    new ExactRational(exponent).multiply(multiplier),
  ]));
}

function vectorValue(vector, prime) {
  return vector.get(prime) ?? ExactRational.zero();
}

function subtractVectors(left, right) {
  const primes = new Set([...left.keys(), ...right.keys()]);
  const output = new Map();
  for (const prime of primes) {
    const value = vectorValue(left, prime).subtract(vectorValue(right, prime));
    if (!value.isZero()) output.set(prime, value);
  }
  return output;
}

function sortedPrimes(...vectors) {
  return [...new Set(vectors.flatMap((vector) => [...vector.keys()]))]
    .sort((left, right) => {
      const leftPrime = BigInt(left);
      const rightPrime = BigInt(right);
      return leftPrime < rightPrime ? -1 : leftPrime > rightPrime ? 1 : 0;
    });
}

export function createAffinePrimePowerSide(base, exponentConstant, exponentCoefficient) {
  const factors = factorPositiveRational(base);
  return Object.freeze({
    constant: rationalVector(factors, exponentConstant),
    coefficient: rationalVector(factors, exponentCoefficient),
  });
}

export function createConstantPrimePowerSide(value) {
  return createAffinePrimePowerSide(
    value,
    ExactRational.one(),
    ExactRational.zero(),
  );
}

export function solveAffinePrimePowerEquality(left, right) {
  const coefficient = subtractVectors(left.coefficient, right.coefficient);
  const constant = subtractVectors(left.constant, right.constant);
  const primes = sortedPrimes(coefficient, constant);
  const referencePrime = primes.find((prime) => !vectorValue(coefficient, prime).isZero());

  if (!referencePrime) {
    return Object.freeze({
      state: constant.size === 0 ? "identity" : "none",
      candidate: null,
      coefficient,
      constant,
      primes: Object.freeze(primes),
    });
  }

  const candidate = vectorValue(constant, referencePrime)
    .negate()
    .divide(vectorValue(coefficient, referencePrime));
  const exact = primes.every((prime) => (
    vectorValue(coefficient, prime)
      .multiply(candidate)
      .add(vectorValue(constant, prime))
      .isZero()
  ));
  return Object.freeze({
    state: exact ? "exact" : "requires-logarithm",
    candidate: exact ? candidate : null,
    coefficient,
    constant,
    primes: Object.freeze(primes),
  });
}

export function verifyAffinePrimePowerCandidate(relation, candidate) {
  if (!(candidate instanceof ExactRational)) return false;
  return relation.primes.every((prime) => (
    vectorValue(relation.coefficient, prime)
      .multiply(candidate)
      .add(vectorValue(relation.constant, prime))
      .isZero()
  ));
}

export function formatAffinePrimePowerRelation(relation) {
  if (!relation.primes.length) return "素因数指数差はすべて0";
  return relation.primes.map((prime) => {
    const coefficient = vectorValue(relation.coefficient, prime);
    const constant = vectorValue(relation.constant, prime);
    return `素数${prime}: (${coefficient})x+(${constant})`;
  }).join("、");
}
