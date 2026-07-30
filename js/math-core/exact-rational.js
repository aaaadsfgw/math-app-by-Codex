const MAX_COMPONENT_DIGITS = 512;
const MAX_ABSOLUTE_EXPONENT = 32;

function absolute(value) {
  return value < 0n ? -value : value;
}

function greatestCommonDivisor(left, right) {
  let a = absolute(left);
  let b = absolute(right);
  while (b !== 0n) {
    [a, b] = [b, a % b];
  }
  return a || 1n;
}

function assertBounded(value) {
  if (absolute(value).toString().length > MAX_COMPONENT_DIGITS) {
    throw new RangeError("厳密計算の数値が大きすぎます。");
  }
}

function asRational(value) {
  if (value instanceof ExactRational) return value;
  if (typeof value === "bigint") return new ExactRational(value);
  return ExactRational.parse(value);
}

export class ExactRational {
  constructor(numerator, denominator = 1n) {
    if (typeof numerator !== "bigint" || typeof denominator !== "bigint") {
      throw new TypeError("分子と分母はBigIntで指定してください。");
    }
    if (denominator === 0n) throw new RangeError("0では割れません。");

    const sign = denominator < 0n ? -1n : 1n;
    const divisor = greatestCommonDivisor(numerator, denominator);
    const normalizedNumerator = sign * numerator / divisor;
    const normalizedDenominator = absolute(denominator) / divisor;
    assertBounded(normalizedNumerator);
    assertBounded(normalizedDenominator);

    this.numerator = normalizedNumerator;
    this.denominator = normalizedDenominator;
    Object.freeze(this);
  }

  static zero() {
    return new ExactRational(0n);
  }

  static one() {
    return new ExactRational(1n);
  }

  static parse(value) {
    const source = String(value ?? "").trim();
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))$/u.exec(source);
    if (!match) throw new TypeError(`有限小数として解釈できません: ${source}`);

    const sign = match[1] === "-" ? -1n : 1n;
    const whole = match[2] || "0";
    const fraction = match[3] ?? match[4] ?? "";
    if (whole.length + fraction.length > MAX_COMPONENT_DIGITS) {
      throw new RangeError("厳密計算の入力数値が長すぎます。");
    }
    const denominator = 10n ** BigInt(fraction.length);
    const numerator = BigInt(`${whole}${fraction}` || "0");
    return new ExactRational(sign * numerator, denominator);
  }

  add(other) {
    const right = asRational(other);
    return new ExactRational(
      this.numerator * right.denominator + right.numerator * this.denominator,
      this.denominator * right.denominator,
    );
  }

  subtract(other) {
    return this.add(asRational(other).negate());
  }

  multiply(other) {
    const right = asRational(other);
    return new ExactRational(
      this.numerator * right.numerator,
      this.denominator * right.denominator,
    );
  }

  divide(other) {
    const right = asRational(other);
    if (right.isZero()) throw new RangeError("0では割れません。");
    return new ExactRational(
      this.numerator * right.denominator,
      this.denominator * right.numerator,
    );
  }

  negate() {
    return new ExactRational(-this.numerator, this.denominator);
  }

  pow(exponent) {
    const integer = typeof exponent === "bigint" ? exponent : BigInt(exponent);
    if (integer < -BigInt(MAX_ABSOLUTE_EXPONENT) || integer > BigInt(MAX_ABSOLUTE_EXPONENT)) {
      throw new RangeError(`指数の絶対値は${MAX_ABSOLUTE_EXPONENT}以下にしてください。`);
    }
    if (integer === 0n) {
      if (this.isZero()) throw new RangeError("0の0乗は扱えません。");
      return ExactRational.one();
    }
    if (integer < 0n) {
      if (this.isZero()) throw new RangeError("0の負の累乗は扱えません。");
      return new ExactRational(this.denominator, this.numerator).pow(-integer);
    }
    return new ExactRational(
      this.numerator ** integer,
      this.denominator ** integer,
    );
  }

  isZero() {
    return this.numerator === 0n;
  }

  equals(other) {
    const right = asRational(other);
    return this.numerator === right.numerator && this.denominator === right.denominator;
  }

  toString() {
    return this.denominator === 1n
      ? this.numerator.toString()
      : `${this.numerator}/${this.denominator}`;
  }
}

export function rational(value) {
  return asRational(value);
}

