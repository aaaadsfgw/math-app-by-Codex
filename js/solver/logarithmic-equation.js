import {
  evaluateExactPolynomial,
  ExactPolynomialError,
  exactPolynomialDegree,
  exactPolynomialFromAst,
  subtractExactPolynomials,
} from "../math-core/exact-polynomial.js";
import { createStrictPositivePolynomialSet } from "../math-core/exact-polynomial-real-set.js";
import {
  analyzeExactQuadraticRoots,
  evaluateExactPolynomialAtQuadraticRoot,
  signOfExactQuadraticValue,
} from "../math-core/exact-quadratic-roots.js";
import {
  ExactRationalFunctionError,
  multiplyExactRationalPolynomials,
  subtractExactRationalPolynomials,
} from "../math-core/exact-rational-function.js";
import { ExactRational } from "../math-core/exact-rational.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { createRealSet, formatRealSet } from "../math-core/real-set.js";
import {
  hasAmbiguousDivisionMultiplication,
  parseEquationInput,
} from "./equation-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const LOGARITHMIC_EQUATION_SOLVER_ID = "logarithmic-equation";

const PLACEHOLDERS = Object.freeze(["a", "b", "c", "k", "m", "n", "t", "y", "z"]);
const MAX_LOG_OCCURRENCES = 12;
const MAX_LOG_TERMS = PLACEHOLDERS.length;
const MAX_EXPLICIT_BASE = 1_000_000_000_000n;
const MAX_ARGUMENT_EXPONENT = 4n;
const MAX_CONSTANT_EXPONENT = 32n;

const SUBSCRIPT_DIGITS = Object.freeze({
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
});

class LogarithmicEquationError extends Error {
  constructor(message, {
    code = "LOGARITHMIC_EQUATION_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "LogarithmicEquationError";
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
  return a;
}

function leastCommonMultiple(left, right) {
  return absolute(left / greatestCommonDivisor(left, right) * right);
}

export function preserveExplicitLogarithmBases(value) {
  return String(value ?? "")
    .replace(
      /(^|[^A-Za-z_Ａ-Ｚａ-ｚ＿])([lＬｌ][oＯｏ][gＧｇ])(?![A-Za-zＡ-Ｚａ-ｚ])/giu,
      "$1log",
    )
    .replace(/＿/gu, "_")
    .replace(
      /(^|[^A-Za-z_])(log)_?([₀₁₂₃₄₅₆₇₈₉]+)(?=\s*[(（])/giu,
      (_, boundary, prefix, digits) => (
        `${boundary}${prefix}_${[...digits].map((digit) => SUBSCRIPT_DIGITS[digit]).join("")}`
      ),
    );
}

function beginsLogKeyword(source, index) {
  const previous = source[index - 1] ?? "";
  if (/[A-Za-z_]/u.test(previous)) return false;
  return /^(?:log|ln)(?![A-Za-z])/iu.test(source.slice(index));
}

function recognizedUnsupportedResult(message) {
  return {
    ...unsupportedResult(message),
    recognized: true,
  };
}

function nextNonWhitespaceIndex(source, start) {
  let index = start;
  while (/\s/u.test(source[index] ?? "")) index += 1;
  return index;
}

function assertLogAtomBoundary(source, closingIndex) {
  const nextIndex = nextNonWhitespaceIndex(source, closingIndex + 1);
  const next = source[nextIndex] ?? "";
  if (/[A-Za-z0-9_.(]/u.test(next)) {
    throw new LogarithmicEquationError(
      "対数項の後で暗黙に掛け算できません。*を明示してください。",
      { code: "AMBIGUOUS_LOG_SUFFIX" },
    );
  }
}

function containsX(node) {
  if (node?.type === "symbol") return node.name === "x";
  if (node?.type === "unary") return containsX(node.argument);
  if (node?.type === "binary") return containsX(node.left) || containsX(node.right);
  if (node?.type === "call") return node.args.some(containsX);
  return false;
}

function polynomialKey(polynomial) {
  return polynomial.map(String).join("|");
}

function formatPolynomial(polynomial) {
  const terms = [];
  for (let degree = polynomial.length - 1; degree >= 0; degree -= 1) {
    const coefficient = polynomial[degree];
    if (coefficient.isZero()) continue;
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? coefficient.negate() : coefficient;
    const variable = degree === 0 ? "" : degree === 1 ? "x" : `x^${degree}`;
    const coefficientText = variable && magnitude.equals(ExactRational.one())
      ? ""
      : variable && magnitude.denominator !== 1n
        ? `(${magnitude})`
        : magnitude.toString();
    const term = `${coefficientText}${variable}`;
    terms.push(`${terms.length ? (negative ? "-" : "+") : (negative ? "-" : "")}${term}`);
  }
  return terms.join("") || "0";
}

function parseHeader(source, index) {
  const match = /^(ln|log(?:_\d+)?)\s*\(/iu.exec(source.slice(index));
  if (!match) return null;
  const token = match[1].toLowerCase();
  const openingOffset = match[0].lastIndexOf("(");
  if (token === "ln" || token === "log") {
    return {
      base: null,
      baseKey: "natural",
      openingIndex: index + openingOffset,
    };
  }
  const digits = token.slice(4);
  const base = ExactRational.parse(digits);
  if (
    base.numerator <= 0n
    || base.equals(ExactRational.one())
  ) {
    throw new LogarithmicEquationError("対数の底は正で、1ではない値にしてください。", {
      code: "INVALID_LOG_BASE",
    });
  }
  if (base.numerator > MAX_EXPLICIT_BASE) {
    throw new LogarithmicEquationError(
      `対数の整数底は${MAX_EXPLICIT_BASE}以下にしてください。`,
      { code: "LOG_BASE_TOO_LARGE", unsupported: true },
    );
  }
  return {
    base,
    baseKey: `rational:${base}`,
    openingIndex: index + openingOffset,
  };
}

function closingParenthesis(source, openingIndex) {
  let depth = 0;
  for (let index = openingIndex; index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function context() {
  return {
    atomsByKey: new Map(),
    atomsBySymbol: new Map(),
    domains: new Map(),
    occurrences: 0,
  };
}

function parseArgument(argumentSource) {
  if (!argumentSource) {
    throw new LogarithmicEquationError("対数の引数が空です。", {
      code: "EMPTY_LOG_ARGUMENT",
    });
  }
  if (/(?:log|ln)/iu.test(argumentSource)) {
    throw new LogarithmicEquationError("対数の入れ子には対応していません。", {
      code: "NESTED_LOGARITHM",
      unsupported: true,
    });
  }
  if (hasAmbiguousDivisionMultiplication(argumentSource)) {
    throw new LogarithmicEquationError(
      "対数の引数に曖昧な割り算と暗黙の掛け算があります。",
      { code: "AMBIGUOUS_LOG_ARGUMENT" },
    );
  }
  const ast = parseMathExpression(argumentSource, { symbols: ["x"] }).ast;
  const polynomial = exactPolynomialFromAst(ast);
  if (exactPolynomialDegree(polynomial) > 2) {
    throw new LogarithmicEquationError("対数の引数は二次式までにしてください。", {
      code: "LOG_ARGUMENT_DEGREE",
      unsupported: true,
    });
  }
  return Object.freeze({
    polynomial,
    hasX: containsX(ast),
  });
}

function registerLogAtom(shared, header, argumentSource) {
  shared.occurrences += 1;
  if (shared.occurrences > MAX_LOG_OCCURRENCES) {
    throw new LogarithmicEquationError("対数項が多すぎます。", {
      code: "TOO_MANY_LOGS",
      unsupported: true,
    });
  }
  const argument = parseArgument(argumentSource);
  const argumentKey = polynomialKey(argument.polynomial);
  if (!shared.domains.has(argumentKey)) {
    shared.domains.set(argumentKey, Object.freeze({
      polynomial: argument.polynomial,
      source: argumentSource,
      hasX: argument.hasX,
    }));
  }
  const key = `${header.baseKey}|${argumentKey}`;
  let atom = shared.atomsByKey.get(key);
  if (!atom) {
    const symbol = PLACEHOLDERS[shared.atomsByKey.size];
    if (!symbol || shared.atomsByKey.size >= MAX_LOG_TERMS) {
      throw new LogarithmicEquationError("異なる対数項が多すぎます。", {
        code: "TOO_MANY_DISTINCT_LOGS",
        unsupported: true,
      });
    }
    atom = Object.freeze({
      key,
      symbol,
      base: header.base,
      baseKey: header.baseKey,
      polynomial: argument.polynomial,
      argumentSource,
      hasX: argument.hasX,
    });
    shared.atomsByKey.set(key, atom);
    shared.atomsBySymbol.set(symbol, atom);
  }
  return atom;
}

function constantLogLinear(value) {
  return { constant: value, coefficients: new Map() };
}

function atomLogLinear(atom) {
  return {
    constant: ExactRational.zero(),
    coefficients: new Map([[atom.key, ExactRational.one()]]),
  };
}

function scaleLogLinear(value, multiplier) {
  const coefficients = new Map();
  for (const [key, coefficient] of value.coefficients) {
    const scaled = coefficient.multiply(multiplier);
    if (!scaled.isZero()) coefficients.set(key, scaled);
  }
  return {
    constant: value.constant.multiply(multiplier),
    coefficients,
  };
}

function addLogLinear(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  const coefficients = new Map(left.coefficients);
  for (const [key, coefficient] of right.coefficients) {
    const next = (coefficients.get(key) ?? ExactRational.zero())
      .add(coefficient.multiply(multiplier));
    if (next.isZero()) coefficients.delete(key);
    else coefficients.set(key, next);
  }
  return {
    constant: left.constant.add(right.constant.multiply(multiplier)),
    coefficients,
  };
}

function logLinearFromAst(node, shared) {
  if (node?.type === "number") return constantLogLinear(ExactRational.parse(node.value));
  if (node?.type === "symbol") {
    const atom = shared.atomsBySymbol.get(node.name);
    if (atom) return atomLogLinear(atom);
    throw new LogarithmicEquationError(
      "対数の外側に変数を置く形には対応していません。",
      { code: "VARIABLE_OUTSIDE_LOG", unsupported: true },
    );
  }
  if (node?.type === "unary") {
    const value = logLinearFromAst(node.argument, shared);
    return node.operator === "-"
      ? scaleLogLinear(value, new ExactRational(-1n))
      : value;
  }
  if (node?.type === "binary") {
    const left = logLinearFromAst(node.left, shared);
    const right = logLinearFromAst(node.right, shared);
    if (node.operator === "+") return addLogLinear(left, right);
    if (node.operator === "-") return addLogLinear(left, right, -1n);
    if (node.operator === "*") {
      if (left.coefficients.size && right.coefficients.size) {
        throw new LogarithmicEquationError("対数項どうしの積には対応していません。", {
          code: "NONLINEAR_LOG_PRODUCT",
          unsupported: true,
        });
      }
      return left.coefficients.size
        ? scaleLogLinear(left, right.constant)
        : scaleLogLinear(right, left.constant);
    }
    if (node.operator === "/") {
      if (right.coefficients.size) {
        throw new LogarithmicEquationError("対数項を含む式では割れません。", {
          code: "LOG_DENOMINATOR",
          unsupported: true,
        });
      }
      if (right.constant.isZero()) {
        throw new LogarithmicEquationError("0では割れません。", {
          code: "DIVISION_BY_ZERO",
        });
      }
      return scaleLogLinear(left, ExactRational.one().divide(right.constant));
    }
    throw new LogarithmicEquationError("対数式の累乗には対応していません。", {
      code: "LOG_POWER",
      unsupported: true,
    });
  }
  throw new LogarithmicEquationError(
    "対数の外側には有理数と四則演算だけを使用してください。",
    { code: "UNSUPPORTED_LOG_OUTER_EXPRESSION", unsupported: true },
  );
}

function parseLogLinear(source, shared) {
  let replaced = "";
  let literal = "";
  let index = 0;
  while (index < source.length) {
    if (beginsLogKeyword(source, index)) {
      const header = parseHeader(source, index);
      if (!header) {
        throw new LogarithmicEquationError(
          "対数は log_2(x)、log₂(x)、log(x)、ln(x) のように括弧付きで入力してください。",
          { code: "INVALID_LOG_SYNTAX" },
        );
      }
      const closingIndex = closingParenthesis(source, header.openingIndex);
      if (closingIndex < 0) {
        throw new LogarithmicEquationError("対数の引数を閉じる括弧がありません。", {
          code: "UNCLOSED_LOG_ARGUMENT",
        });
      }
      const argumentSource = source
        .slice(header.openingIndex + 1, closingIndex)
        .trim();
      const atom = registerLogAtom(shared, header, argumentSource);
      assertLogAtomBoundary(source, closingIndex);
      replaced += atom.symbol;
      index = closingIndex + 1;
      continue;
    }
    replaced += source[index];
    literal += source[index];
    index += 1;
  }

  if (/[A-Za-z_]/u.test(literal)) {
    if (/^[^A-Za-z_]*x[^A-Za-z_]*$/iu.test(literal)) {
      throw new LogarithmicEquationError(
        "対数の外側にxを含む形には対応していません。",
        { code: "VARIABLE_OUTSIDE_LOG", unsupported: true },
      );
    }
    throw new LogarithmicEquationError("対数式の末尾または外側に解釈できない文字があります。", {
      code: "INVALID_LOG_TRAILING_TEXT",
    });
  }
  if (hasAmbiguousDivisionMultiplication(replaced)) {
    throw new LogarithmicEquationError(
      "分数係数の後の暗黙の掛け算は曖昧です。(1/2)*log_2(x)のように入力してください。",
      { code: "AMBIGUOUS_LOG_COEFFICIENT" },
    );
  }
  const ast = parseMathExpression(replaced, {
    symbols: [...shared.atomsBySymbol.keys(), "x"],
  }).ast;
  return logLinearFromAst(ast, shared);
}

function integerLogCoefficients(linear, shared) {
  const effectiveAtoms = [...linear.coefficients.entries()].map(([key, coefficient]) => ({
    atom: shared.atomsByKey.get(key),
    coefficient,
  }));
  const baseKeys = new Set(effectiveAtoms.map(({ atom }) => atom.baseKey));
  if (baseKeys.size > 1) {
    throw new LogarithmicEquationError("異なる底の対数を同じ方程式で結合できません。", {
      code: "MIXED_LOG_BASES",
      unsupported: true,
    });
  }

  let terms = effectiveAtoms;
  if (!linear.constant.isZero()) {
    const [baseKey] = baseKeys;
    if (!baseKey || baseKey === "natural") {
      throw new LogarithmicEquationError(
        "自然対数と0でない定数の方程式は、eの厳密式を実装するまで未対応です。",
        { code: "NATURAL_LOG_CONSTANT", unsupported: true },
      );
    }
    const base = effectiveAtoms[0].atom.base;
    terms = [
      ...terms,
      {
        atom: Object.freeze({
          key: `constant-base:${baseKey}`,
          base,
          baseKey,
          polynomial: Object.freeze([base]),
          argumentSource: base.toString(),
          hasX: false,
          synthetic: true,
        }),
        coefficient: linear.constant,
      },
    ];
  }

  if (!terms.length) return Object.freeze([]);
  const commonDenominator = terms.reduce(
    (value, { coefficient }) => leastCommonMultiple(value, coefficient.denominator),
    1n,
  );
  let integers = terms.map(({ atom, coefficient }) => ({
    atom,
    exponent: coefficient.numerator * (commonDenominator / coefficient.denominator),
  }));
  const divisor = integers.reduce(
    (value, { exponent }) => greatestCommonDivisor(value, exponent),
    0n,
  );
  if (divisor > 1n) {
    integers = integers.map(({ atom, exponent }) => ({
      atom,
      exponent: exponent / divisor,
    }));
  }
  return Object.freeze(integers.map((term) => Object.freeze(term)));
}

function powerPolynomial(base, exponent, synthetic) {
  const limit = synthetic ? MAX_CONSTANT_EXPONENT : MAX_ARGUMENT_EXPONENT;
  if (absolute(exponent) > limit) {
    throw new LogarithmicEquationError(
      `対数法則で使う指数は${limit}以下にしてください。`,
      { code: "LOG_EXPONENT_LIMIT", unsupported: true },
    );
  }
  let output = Object.freeze([ExactRational.one()]);
  for (let count = 0n; count < absolute(exponent); count += 1n) {
    output = multiplyExactRationalPolynomials(output, base);
  }
  return output;
}

function equationPolynomialFromTerms(terms) {
  let positive = Object.freeze([ExactRational.one()]);
  let negative = Object.freeze([ExactRational.one()]);
  for (const { atom, exponent } of terms) {
    if (exponent === 0n) continue;
    const powered = powerPolynomial(atom.polynomial, exponent, atom.synthetic === true);
    if (exponent > 0n) {
      positive = multiplyExactRationalPolynomials(positive, powered);
    } else {
      negative = multiplyExactRationalPolynomials(negative, powered);
    }
  }
  const equation = subtractExactRationalPolynomials(positive, negative);
  if (equation.length - 1 > 2) {
    throw new LogarithmicEquationError("対数法則で変換した方程式が三次以上です。", {
      code: "LOG_RESULT_DEGREE",
      unsupported: true,
    });
  }
  return equation;
}

function rationalCandidate(value) {
  return Object.freeze({
    type: "rational",
    exact: value.toString(),
    value,
  });
}

function solveCandidatePolynomial(polynomial) {
  const degree = exactPolynomialDegree(polynomial);
  if (degree === 0) {
    return {
      state: polynomial[0].isZero() ? "identity" : "none",
      candidates: Object.freeze([]),
    };
  }
  if (degree === 1) {
    return {
      state: "finite",
      candidates: Object.freeze([
        rationalCandidate(polynomial[0].negate().divide(polynomial[1])),
      ]),
    };
  }
  const analysis = analyzeExactQuadraticRoots(polynomial);
  return {
    state: analysis.rootKind === "no-real" ? "none" : "finite",
    candidates: Object.freeze(analysis.roots.map((root) => Object.freeze({
      type: "quadratic",
      exact: root.exact,
      root,
    }))),
  };
}

function candidatePolynomialIsZero(polynomial, candidate) {
  if (candidate.type === "rational") {
    return evaluateExactPolynomial(polynomial, candidate.value).isZero();
  }
  return evaluateExactPolynomialAtQuadraticRoot(polynomial, candidate.root).isZero;
}

function candidatePolynomialIsPositive(polynomial, candidate) {
  if (candidate.type === "rational") {
    return evaluateExactPolynomial(polynomial, candidate.value).numerator > 0n;
  }
  const value = evaluateExactPolynomialAtQuadraticRoot(polynomial, candidate.root);
  return signOfExactQuadraticValue(value, candidate.root.radicand) > 0;
}

function compareRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function identityDomainSet(domains) {
  const unique = [...domains.values()];
  if (unique.some(({ polynomial }) => (
    exactPolynomialDegree(polynomial) === 0
    && polynomial[0].numerator <= 0n
  ))) {
    return createRealSet({ kind: "empty" });
  }
  const nonconstant = unique.filter(({ polynomial }) => (
    exactPolynomialDegree(polynomial) > 0
  ));
  if (!nonconstant.length) return createRealSet({ kind: "all-real" });

  const linear = nonconstant.filter(({ polynomial }) => (
    exactPolynomialDegree(polynomial) === 1
  ));
  const quadratic = nonconstant.filter(({ polynomial }) => (
    exactPolynomialDegree(polynomial) === 2
  ));
  if (quadratic.length > 1) {
    throw new LogarithmicEquationError(
      "複数の異なる二次対数定義域の共通部分は現在未対応です。",
      { code: "MULTIPLE_QUADRATIC_DOMAINS", unsupported: true },
    );
  }
  let lower = null;
  let upper = null;
  for (const { polynomial } of linear) {
    const boundary = polynomial[0].negate().divide(polynomial[1]);
    if (polynomial[1].numerator > 0n) {
      if (!lower || compareRationals(boundary, lower) > 0) lower = boundary;
    } else if (!upper || compareRationals(boundary, upper) < 0) {
      upper = boundary;
    }
  }
  const domainPolynomial = quadratic[0]?.polynomial
    ?? Object.freeze([ExactRational.one()]);
  return createStrictPositivePolynomialSet(domainPolynomial, { lower, upper });
}

function domainConditions(domains) {
  return Object.freeze([...domains.values()]
    .filter(({ polynomial }) => exactPolynomialDegree(polynomial) > 0)
    .map(({ polynomial }) => `${formatPolynomial(polynomial)}>0`));
}

function withConditions(answer, conditions) {
  return conditions.length ? `${answer}（ただし ${conditions.join("、")}）` : answer;
}

function baseSteps(source, shared, equationPolynomial) {
  const domains = [...shared.domains.values()]
    .map(({ polynomial }) => `${formatPolynomial(polynomial)}>0`)
    .join("、");
  return [
    { type: "input", content: source.source },
    {
      type: "domain",
      content: domains || "対数引数の正値条件なし",
      explanation: "相殺または0倍された対数項の引数条件も残します。",
    },
    {
      type: "strategy",
      content: "同じ底の対数法則で積の方程式へ変換",
      explanation: "係数の分母を払い、正係数側と負係数側の積を比較します。",
    },
    {
      type: "transformation",
      content: `${formatPolynomial(equationPolynomial)}=0`,
    },
  ];
}

export function solveLogarithmicEquation(question) {
  const protectedQuestion = preserveExplicitLogarithmBases(question);
  const source = parseEquationInput(protectedQuestion);
  const recognitionText = protectedQuestion.normalize("NFKC");
  const recognized = (
    /(?:^|[^A-Za-z_])(?:log|ln)(?![A-Za-z])/iu.test(recognitionText)
    || /対数/u.test(recognitionText)
  );
  if (!source.recognized || !recognized) {
    return unsupportedResult("対数方程式を検出できません。");
  }
  if (!source.ok) {
    return failedResult(LOGARITHMIC_EQUATION_SOLVER_ID, source.error);
  }

  const shared = context();
  let linear;
  let terms;
  let equationPolynomial;
  try {
    const left = parseLogLinear(source.leftSource, shared);
    const right = parseLogLinear(source.rightSource, shared);
    if (!shared.occurrences) {
      return recognizedUnsupportedResult("対数項を検出できません。");
    }
    if (![...shared.atomsByKey.values()].some(({ hasX }) => hasX)) {
      return recognizedUnsupportedResult("xを含む対数方程式ではありません。");
    }
    linear = addLogLinear(left, right, -1n);
    terms = integerLogCoefficients(linear, shared);
    equationPolynomial = equationPolynomialFromTerms(terms);
  } catch (error) {
    if (
      error instanceof LogarithmicEquationError
      || error instanceof ExactPolynomialError
      || error instanceof ExactRationalFunctionError
    ) {
      return error.unsupported
        ? recognizedUnsupportedResult(error.message)
        : failedResult(LOGARITHMIC_EQUATION_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return failedResult(LOGARITHMIC_EQUATION_SOLVER_ID, error.message);
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ|絶対値/u.test(error.message)) {
      return recognizedUnsupportedResult(error.message);
    }
    return failedResult(
      LOGARITHMIC_EQUATION_SOLVER_ID,
      error.message || "対数方程式を解釈できません。",
    );
  }

  let candidateResult;
  try {
    candidateResult = solveCandidatePolynomial(equationPolynomial);
  } catch (error) {
    return error.unsupported
      ? recognizedUnsupportedResult(error.message)
      : failedResult(
          LOGARITHMIC_EQUATION_SOLVER_ID,
          error.message || "対数方程式の候補を作れません。",
        );
  }
  const steps = baseSteps(source, shared, equationPolynomial);

  if (candidateResult.state === "identity") {
    let solutionSet;
    try {
      solutionSet = identityDomainSet(shared.domains);
    } catch (error) {
      return error.unsupported
        ? recognizedUnsupportedResult(error.message)
        : failedResult(LOGARITHMIC_EQUATION_SOLVER_ID, error.message);
    }
    const answer = formatRealSet(solutionSet);
    return solvedResult({
      answer,
      exactAnswer: answer,
      solutionSet,
      steps: [
        ...steps,
        {
          type: "verification",
          content: "変換後は恒等式。解集合を元の全対数引数の共通正値領域に制限",
        },
        { type: "result", content: answer },
      ],
      verification: "対数法則で恒等式になることと、元の全引数の共通正値領域を厳密に確認しました。",
      solverId: LOGARITHMIC_EQUATION_SOLVER_ID,
    });
  }

  if (candidateResult.state === "none") {
    return solvedResult({
      answer: "解なし",
      exactAnswer: "解なし",
      steps: [
        ...steps,
        { type: "verification", content: "変換後の二次以下の方程式に実数解なし" },
        { type: "result", content: "解なし" },
      ],
      verification: "同値変換後の厳密多項式に、元の定義域を満たす実数候補がないことを確認しました。",
      solverId: LOGARITHMIC_EQUATION_SOLVER_ID,
    });
  }

  const accepted = [];
  try {
    for (const candidate of candidateResult.candidates) {
      const solvesEquation = candidatePolynomialIsZero(equationPolynomial, candidate);
      const satisfiesDomains = [...shared.domains.values()].every(({ polynomial }) => (
        candidatePolynomialIsPositive(polynomial, candidate)
      ));
      if (solvesEquation && satisfiesDomains) accepted.push(candidate);
    }
  } catch (error) {
    return error instanceof RangeError
      ? recognizedUnsupportedResult(error.message)
      : failedResult(
          LOGARITHMIC_EQUATION_SOLVER_ID,
          error.message || "対数方程式の定義域を検証できません。",
        );
  }

  const exactAnswer = accepted.length
    ? `x=${accepted.map(({ exact }) => exact).join(",")}`
    : "解なし";
  const conditions = accepted.length ? domainConditions(shared.domains) : [];
  const answer = withConditions(exactAnswer, conditions);
  return solvedResult({
    answer,
    exactAnswer,
    conditions,
    kind: conditions.length ? "conditional" : "exact",
    steps: [
      ...steps,
      {
        type: "verification",
        content: accepted.length
          ? "各候補で変換後の式が0、かつ元の全対数引数が正"
          : "すべての候補が元の対数定義域から除外",
      },
      { type: "result", content: answer },
    ],
    verification: accepted.length
      ? "各候補を変換後の厳密多項式と元の全対数引数へ代入し、等式と正値条件を確認しました。"
      : "変換後の全候補を元の全対数引数へ厳密代入し、定義域外であることを確認しました。",
    solverId: LOGARITHMIC_EQUATION_SOLVER_ID,
  });
}

export default solveLogarithmicEquation;
