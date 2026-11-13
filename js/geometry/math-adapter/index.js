import { ExactRational } from "../../math-core/exact-rational.js";
import { parseMathExpression } from "../../math-core/expression-parser.js";
import { factorPositiveRational } from "../../math-core/exact-prime-power.js";
import {
  analyzeExactQuadraticRoots,
  integerSquareRoot,
  signOfExactQuadraticValue,
} from "../../math-core/exact-quadratic-roots.js";
import { hasAmbiguousDivisionMultiplication } from "../../solver/equation-input.js";
import { solveLinearEquation } from "../../solver/linear-equation.js";
import { solveLinearSystem } from "../../solver/linear-system.js";

const ZERO = ExactRational.zero();
const ONE = ExactRational.one();
const MAX_TERMS = 32;
const MAX_EXPONENT = 32;
const values = new WeakSet();

// The decimal truncation and its successor enclose pi. A comparison whose
// intervals overlap remains unsupported, even if a float would give an order.
const PI_LOWER = ExactRational.parse("3.141592653589793238462643383279502884197169399375105820974944");
const PI_UPPER = ExactRational.parse("3.141592653589793238462643383279502884197169399375105820974945");

export class GeometryMathError extends Error {
  constructor(message, { cause } = {}) {
    super(message, { cause });
    this.name = "GeometryMathError";
    this.code = "GEOMETRY_UNSUPPORTED";
  }
}

function checked(fn) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (error) {
      if (error instanceof GeometryMathError) throw error;
      throw new GeometryMathError(error.message, { cause: error });
    }
  };
}

function sign(value) {
  if (value.numerator < 0n) return -1;
  return value.isZero() ? 0 : 1;
}

function valueOf(terms) {
  const merged = new Map();
  for (const { radicand, pi, coefficient } of terms) {
    if (coefficient.isZero()) continue;
    const key = `${pi}:${radicand}`;
    const sum = (merged.get(key)?.coefficient ?? ZERO).add(coefficient);
    if (sum.isZero()) merged.delete(key);
    else merged.set(key, { radicand, pi, coefficient: sum });
  }
  if (merged.size > MAX_TERMS || [...merged.values()].some(({ pi }) => pi < 0 || pi > 1)) {
    throw new GeometryMathError("根号の項が多すぎるか、円周率の次数が対応範囲を超えています。");
  }
  const sorted = [...merged.values()].sort((a, b) => a.pi - b.pi || (a.radicand < b.radicand ? -1 : 1));
  const value = Object.freeze(sorted.map(Object.freeze));
  values.add(value);
  return value;
}

function rationalValue(coefficient) {
  return valueOf([{ radicand: 1n, pi: 0, coefficient }]);
}

function termsOf(value) {
  if (!values.has(value)) throw new GeometryMathError("厳密値は数値アダプターで作成してください。");
  return value;
}

function asRational(value) {
  const terms = termsOf(value);
  if (!terms.length) return ZERO;
  if (terms.length === 1 && terms[0].radicand === 1n && terms[0].pi === 0) {
    return terms[0].coefficient;
  }
  throw new GeometryMathError("この計算の係数には有理数が必要です。");
}

function add(left, right) {
  return valueOf([...termsOf(left), ...termsOf(right)]);
}

function scale(value, coefficient) {
  return valueOf(termsOf(value).map((term) => ({
    ...term, coefficient: term.coefficient.multiply(coefficient),
  })));
}

function sub(left, right) {
  return add(left, scale(right, ONE.negate()));
}

function productTerm(a, b) {
  // For square-free radicands their common factors leave the square root.
  const reduced = new ExactRational(a.radicand, b.radicand);
  const common = a.radicand / reduced.numerator;
  return {
    radicand: reduced.numerator * reduced.denominator,
    pi: a.pi + b.pi,
    coefficient: a.coefficient.multiply(b.coefficient).multiply(common),
  };
}

function mul(left, right) {
  return valueOf(termsOf(left).flatMap((a) => termsOf(right).map((b) => productTerm(a, b))));
}

function divideByTerm(value, divisor) {
  const inverse = {
    radicand: divisor.radicand,
    pi: -divisor.pi,
    coefficient: ONE.divide(divisor.coefficient.multiply(divisor.radicand)),
  };
  return valueOf(termsOf(value).map((term) => productTerm(term, inverse)));
}

function div(left, right) {
  termsOf(left);
  const denominator = termsOf(right);
  if (denominator.length === 0) throw new GeometryMathError("0では割れません。");
  if (denominator.length === 1) return divideByTerm(left, denominator[0]);
  const [constant, radical] = denominator;
  if (denominator.length !== 2 || constant.radicand !== 1n || constant.pi !== 0 || radical.pi !== 0) {
    throw new GeometryMathError("この分母を持つ厳密値の割り算には対応していません。");
  }
  const conjugate = valueOf([constant, { ...radical, coefficient: radical.coefficient.negate() }]);
  const rationalDenominator = asRational(mul(right, conjugate));
  return scale(mul(left, conjugate), ONE.divide(rationalDenominator));
}

function sqrt(value) {
  const radicand = asRational(value);
  if (sign(radicand) < 0) throw new GeometryMathError("実数の平方根は0以上の値に対して定義されます。");
  const numeratorRoot = integerSquareRoot(radicand.numerator);
  const denominatorRoot = integerSquareRoot(radicand.denominator);
  if (numeratorRoot * numeratorRoot === radicand.numerator && denominatorRoot * denominatorRoot === radicand.denominator) {
    return rationalValue(new ExactRational(numeratorRoot, denominatorRoot));
  }

  let coefficient = ONE;
  let squareFree = 1n;
  for (const { prime, exponent } of factorPositiveRational(radicand)) {
    const parity = (exponent % 2n + 2n) % 2n;
    const factor = new ExactRational(BigInt(prime)).pow((exponent - parity) / 2n);
    coefficient = coefficient.multiply(factor);
    if (parity) squareFree *= BigInt(prime);
  }
  const result = valueOf([{ radicand: squareFree, pi: 0, coefficient }]);
  if (sign(coefficient) < 0 || !asRational(mul(result, result)).equals(radicand)) {
    throw new GeometryMathError("平方根を厳密に検算できませんでした。");
  }
  return result;
}

function pow(base, exponent) {
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > MAX_EXPONENT) {
    throw new GeometryMathError(`指数は絶対値${MAX_EXPONENT}以下の整数にしてください。`);
  }
  const terms = termsOf(base);
  if (!terms.length && exponent <= 0) throw new GeometryMathError("0の非正整数乗は扱えません。");
  if (exponent < 0) return div(rationalValue(ONE), pow(base, -exponent));
  if (terms.every((term) => term.radicand === 1n && term.pi === 0)) {
    return rationalValue(asRational(base).pow(exponent));
  }
  let result = rationalValue(ONE);
  for (let i = 0; i < exponent; i += 1) result = mul(result, base);
  return result;
}

function termBounds({ radicand, pi, coefficient }, scale) {
  const lowerInt = integerSquareRoot(radicand * scale * scale);
  const upperInt = radicand === 1n ? lowerInt : lowerInt + 1n;
  let lower = new ExactRational(lowerInt, scale);
  let upper = new ExactRational(upperInt, scale);
  if (pi) {
    lower = lower.multiply(PI_LOWER);
    upper = upper.multiply(PI_UPPER);
  }
  if (sign(coefficient) < 0) [lower, upper] = [upper, lower];
  return [lower.multiply(coefficient), upper.multiply(coefficient)];
}

function compare(left, right) {
  const terms = sub(left, right);
  if (!terms.length) return 0;
  if (terms.length === 1) return sign(terms[0].coefficient);
  if (terms.length === 2 && terms[0].pi === terms[1].pi) {
    const [a, b] = terms;
    // Divide the difference by its positive common pi factor and √a.radicand.
    return signOfExactQuadraticValue(
      { rationalPart: a.coefficient, radicalPart: b.coefficient.divide(a.radicand) },
      a.radicand * b.radicand,
    );
  }
  for (const bits of [16n, 64n, 192n, 384n]) {
    let lower = ZERO;
    let upper = ZERO;
    for (const term of terms) {
      const [min, max] = termBounds(term, 1n << bits);
      lower = lower.add(min);
      upper = upper.add(max);
    }
    if (sign(lower) > 0) return 1;
    if (sign(upper) < 0) return -1;
  }
  throw new GeometryMathError("厳密値の大小を確定できませんでした。");
}

function format(value) {
  const formatted = termsOf(value).map(({ coefficient, pi, radicand }, index) => {
    const negative = sign(coefficient) < 0;
    const magnitude = negative ? coefficient.negate() : coefficient;
    const factors = [];
    if (!magnitude.equals(ONE) || (radicand === 1n && !pi)) factors.push(magnitude.toString());
    if (radicand !== 1n) factors.push(`√${radicand}`);
    if (pi) factors.push("π");
    return `${negative ? "-" : index ? "+" : ""}${factors.join("*")}`;
  });
  return formatted.join("") || "0";
}

const PI = valueOf([{ radicand: 1n, pi: 1, coefficient: ONE }]);
const operations = { "+": add, "-": sub, "*": mul, "/": div };

function evaluate(node) {
  switch (node.type) {
    case "number":
      return rationalValue(ExactRational.parse(node.value));
    case "constant":
      if (node.name === "pi") return PI;
      break;
    case "unary": {
      const value = evaluate(node.argument);
      return node.operator === "-" ? scale(value, ONE.negate()) : value;
    }
    case "binary": {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      if (node.operator !== "^") return operations[node.operator](left, right);
      const exponent = asRational(right);
      if (exponent.denominator === 1n) return pow(left, Number(exponent.numerator));
      break;
    }
    case "call":
      if (node.name === "sqrt") return sqrt(evaluate(node.args[0]));
      break;
  }
  throw new GeometryMathError("図形計算では定数の四則演算、整数乗、平方根と円周率を使用できます。");
}

function parse(value) {
  if (values.has(value)) return value;
  if (value instanceof ExactRational) return rationalValue(value);
  if (typeof value === "bigint") return rationalValue(new ExactRational(value));
  if (typeof value === "number" && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value))) {
    const [mantissa, exponent] = String(value).split("e");
    let decimal = ExactRational.parse(mantissa);
    if (exponent !== undefined) {
      const powerOfTen = new ExactRational(10n ** BigInt(Math.abs(Number(exponent))));
      decimal = Number(exponent) < 0 ? decimal.divide(powerOfTen) : decimal.multiply(powerOfTen);
    }
    return rationalValue(decimal);
  }
  if (typeof value !== "string" || value.length > 512 || !value.trim()) {
    throw new GeometryMathError("図形の厳密値は有限小数、整数または厳密数式で指定してください。");
  }
  const parsed = parseMathExpression(value, { symbols: [] });
  if (hasAmbiguousDivisionMultiplication(parsed.normalized)) {
    throw new GeometryMathError("割り算と暗黙の掛け算の範囲を括弧で明示してください。");
  }
  return evaluate(parsed.ast);
}

function solveLinear(a, b, c) {
  const equation = `(${asRational(a)})*x+(${asRational(b)})=(${asRational(c)})`;
  const result = solveLinearEquation(equation);
  const match = result.verified && /^x=([+-]?\d+(?:\/\d+)?)$/u.exec(result.exactAnswer);
  if (!match) throw new GeometryMathError("一次方程式に一意の厳密解がありません。");
  const x = parse(match[1]);
  if (compare(add(mul(a, x), b), c) !== 0) throw new GeometryMathError("一次方程式の代入検算に失敗しました。");
  return x;
}

function solveQuadratic(a, b, c) {
  const analysis = analyzeExactQuadraticRoots([asRational(c), asRational(b), asRational(a)]);
  return Object.freeze(analysis.roots.map((root) => parse(root.exact)));
}

function solveSystem(first, second) {
  function equation([a, b, c]) {
    return `(${asRational(a)})*x+(${asRational(b)})*y=(${asRational(c)})`;
  }
  const result = solveLinearSystem(`${equation(first)}\n${equation(second)}`);
  const match = result.verified && /^x=([+-]?\d+(?:\/\d+)?), y=([+-]?\d+(?:\/\d+)?)$/u.exec(result.exactAnswer);
  if (!match) throw new GeometryMathError("連立一次方程式に一意の厳密解がありません。");
  const x = parse(match[1]);
  const y = parse(match[2]);
  for (const [a, b, c] of [first, second]) {
    if (compare(add(mul(a, x), mul(b, y)), c) !== 0) throw new GeometryMathError("連立一次方程式の代入検算に失敗しました。");
  }
  return Object.freeze({ x, y });
}

export function createMathAdapter() {
  return Object.freeze({
    parse: checked(parse), format: checked(format),
    add: checked(add), sub: checked(sub), mul: checked(mul), div: checked(div),
    sqrt: checked(sqrt), pow: checked(pow), compare: checked(compare),
    solveLinear: checked(solveLinear), solveQuadratic: checked(solveQuadratic), solveSystem: checked(solveSystem),
    pi: PI,
  });
}

export const defaultMath = createMathAdapter();
