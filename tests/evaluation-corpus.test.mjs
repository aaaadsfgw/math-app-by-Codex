import assert from "node:assert/strict";
import test from "node:test";

import { solveQuestion, solveQuestionAsync } from "../js/solver/index.js";

function signedTerm(value, symbol = "") {
  if (value === 0) return "";
  const coefficient = symbol && Math.abs(value) === 1
    ? (value < 0 ? "-" : "")
    : String(value);
  return `${coefficient}${symbol}`;
}

function appendTerm(expression, value, symbol = "") {
  if (value === 0) return expression || "0";
  const term = signedTerm(Math.abs(value), symbol);
  if (!expression) return value < 0 ? `-${term}` : term;
  return `${expression}${value < 0 ? "-" : "+"}${term}`;
}

function linearExpression(xCoefficient, constant) {
  return appendTerm(
    appendTerm("", xCoefficient, "x"),
    constant,
  );
}

function twoVariableExpression(xCoefficient, yCoefficient) {
  return appendTerm(
    appendTerm("", xCoefficient, "x"),
    yCoefficient,
    "y",
  );
}

function generatedLinearEquations() {
  return Array.from({ length: 250 }, (_, index) => {
    const coefficient = (index % 19) - 9 || 10;
    const root = (index % 31) - 15;
    const constant = ((index * 7) % 23) - 11;
    const right = coefficient * root + constant;
    return {
      family: "linear-equation",
      question: `${linearExpression(coefficient, constant)}=${right}`,
      answer: `x=${root}`,
    };
  });
}

function generatedLinearInequalities() {
  const operators = ["<", "<=", ">", ">="];
  const reverse = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };
  return Array.from({ length: 250 }, (_, index) => {
    const coefficient = (index % 17) - 8 || 9;
    const boundary = (index % 29) - 14;
    const constant = -coefficient * boundary;
    const operator = operators[index % operators.length];
    const solvedOperator = coefficient < 0 ? reverse[operator] : operator;
    return {
      family: "linear-inequality",
      question: `${linearExpression(coefficient, constant)}${operator}0`,
      answer: `x${solvedOperator}${boundary}`,
    };
  });
}

function generatedLinearSystems() {
  const cases = [];
  let seed = 0;
  while (cases.length < 250) {
    const x = (seed % 17) - 8;
    const y = ((seed * 3) % 19) - 9;
    const a = (seed % 7) - 3;
    const b = ((seed * 2) % 9) - 4;
    const c = ((seed * 3) % 11) - 5;
    const d = ((seed * 5) % 13) - 6;
    seed += 1;
    if ((!a && !b) || (!c && !d) || a * d - b * c === 0) continue;
    cases.push({
      family: "linear-system",
      question: `${twoVariableExpression(a, b)}=${a * x + b * y}, `
        + `${twoVariableExpression(c, d)}=${c * x + d * y}`,
      answer: `x=${x}, y=${y}`,
    });
  }
  return cases;
}

function generatedBaseConversions() {
  return Array.from({ length: 150 }, (_, index) => {
    const value = index + 1;
    return {
      family: "base-conversion",
      question: `${value.toString(2)}(2)を10進数に変換`,
      answer: String(value),
    };
  });
}

function factorAt(root) {
  return `(x${root < 0 ? "+" : "-"}${Math.abs(root)})`;
}

function generatedQuadraticInequalities() {
  const operators = ["<", "<=", ">", ">="];
  return Array.from({ length: 250 }, (_, index) => {
    const lower = (index % 19) - 12;
    const upper = lower + (index % 7) + 1;
    const leading = index % 2 === 0 ? (index % 5) + 1 : -((index % 5) + 1);
    const operator = operators[index % operators.length];
    const outsidePositive = leading > 0;
    const wantsPositive = operator.startsWith(">");
    const outside = outsidePositive === wantsPositive;
    const inclusive = operator.includes("=");
    const answer = outside
      ? `x${inclusive ? "≤" : "<"}${lower} または ${upper}${inclusive ? "≤" : "<"}x`
      : `${lower}${inclusive ? "≤" : "<"}x${inclusive ? "≤" : "<"}${upper}`;
    return {
      family: "quadratic-inequality",
      question: `${leading}${factorAt(lower)}${factorAt(upper)}${operator}0`,
      answer,
    };
  });
}

function generatedQuadraticEquations() {
  return Array.from({ length: 250 }, (_, index) => {
    const lower = (index % 23) - 15;
    const upper = lower + (index % 8);
    const leading = index % 2 === 0 ? (index % 7) + 1 : -((index % 7) + 1);
    return {
      family: "quadratic-equation",
      question: `${leading}${factorAt(lower)}${factorAt(upper)}=0`,
      answer: lower === upper ? `x=${lower}` : `x=${lower},${upper}`,
    };
  });
}

function generatedRationalEquations() {
  return Array.from({ length: 250 }, (_, index) => {
    const root = (index % 29) - 14;
    let excluded = ((index * 5) % 31) - 15;
    if (excluded === root) excluded += 1;
    const leading = index % 2 === 0 ? (index % 7) + 1 : -((index % 7) + 1);
    return {
      family: "rational-equation",
      question: `${leading}${factorAt(root)}/${factorAt(excluded)}=0`,
      answer: `x=${root}（ただし x≠${excluded}）`,
    };
  });
}

function generatedRationalInequalities() {
  const operators = ["<", "<=", ">", ">="];
  return Array.from({ length: 250 }, (_, index) => {
    const hole = (index % 23) - 15;
    const root = hole + (index % 7) + 1;
    const numeratorLeading = index % 2 === 0 ? (index % 5) + 1 : -((index % 5) + 1);
    const denominatorLeading = index % 3 === 0 ? -((index % 4) + 1) : (index % 4) + 1;
    const operator = operators[index % operators.length];
    const outsidePositive = numeratorLeading * denominatorLeading > 0;
    const wantsPositive = operator.startsWith(">");
    const outside = outsidePositive === wantsPositive;
    const inclusive = operator.includes("=");
    const exactAnswer = outside
      ? `x<${hole} または ${root}${inclusive ? "≤" : "<"}x`
      : `${hole}<x${inclusive ? "≤" : "<"}${root}`;
    return {
      family: "rational-inequality",
      question: `${numeratorLeading}*${factorAt(root)}`
        + `/(${denominatorLeading}*${factorAt(hole)})${operator}0`,
      answer: `${exactAnswer}（ただし x≠${hole}）`,
    };
  });
}

function generatedExponentialEquations() {
  const bases = [2, 3, 5, 6, 10];
  return Array.from({ length: 250 }, (_, index) => {
    const base = bases[index % bases.length];
    const coefficient = (index % 9) - 4 || 5;
    const root = (index % 25) - 12;
    const constant = ((index * 5) % 15) - 7;
    const exponent = coefficient * root + constant;
    return {
      family: "exponential-equation",
      question: `${base}^(${linearExpression(coefficient, constant)})=${base}^(${exponent})`,
      answer: `x=${root}`,
    };
  });
}

function generatedLogarithmicEquations() {
  const bases = [2, 3, 5, 10];
  return Array.from({ length: 250 }, (_, index) => {
    const base = bases[index % bases.length];
    const exponent = index % 5;
    const shift = ((index * 7) % 41) - 20;
    const root = shift + base ** exponent;
    const argument = shift === 0
      ? "x"
      : `x${shift < 0 ? "+" : "-"}${Math.abs(shift)}`;
    return {
      family: "logarithmic-equation",
      question: `log_${base}(${argument})=${exponent}`,
      answer: `x=${root}（ただし ${argument}>0）`,
    };
  });
}

function corpusGcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
}

function corpusRational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new RangeError("zero denominator in corpus");
  if (numerator === 0n) return { numerator: 0n, denominator: 1n };
  const sign = denominator < 0n ? -1n : 1n;
  const signedNumerator = numerator * sign;
  const positiveDenominator = denominator * sign;
  const divisor = corpusGcd(signedNumerator, positiveDenominator);
  return {
    numerator: signedNumerator / divisor,
    denominator: positiveDenominator / divisor,
  };
}

function addCorpusRationals(left, right) {
  return corpusRational(
    left.numerator * right.denominator + right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function subtractCorpusRationals(left, right) {
  return corpusRational(
    left.numerator * right.denominator - right.numerator * left.denominator,
    left.denominator * right.denominator,
  );
}

function multiplyCorpusRationals(left, right) {
  return corpusRational(
    left.numerator * right.numerator,
    left.denominator * right.denominator,
  );
}

function divideCorpusRationals(left, right) {
  if (right.numerator === 0n) throw new RangeError("division by zero in corpus");
  return corpusRational(
    left.numerator * right.denominator,
    left.denominator * right.numerator,
  );
}

function negateCorpusRational(value) {
  return corpusRational(-value.numerator, value.denominator);
}

function compareCorpusRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function equalCorpusRationals(left, right) {
  return compareCorpusRationals(left, right) === 0;
}

function powerCorpusRational(value, exponent) {
  let result = corpusRational(1n);
  for (let count = 0; count < exponent; count += 1) {
    result = corpusRational(
      result.numerator * value.numerator,
      result.denominator * value.denominator,
    );
  }
  return result;
}

function formatCorpusRational(value) {
  return value.denominator === 1n
    ? String(value.numerator)
    : `${value.numerator}/${value.denominator}`;
}

function definiteIntegralExpectedValue(coefficients, lower, upper) {
  let total = corpusRational(0n);
  for (let power = 0; power < coefficients.length; power += 1) {
    const exponent = power + 1;
    const endpointDifference = subtractCorpusRationals(
      powerCorpusRational(upper, exponent),
      powerCorpusRational(lower, exponent),
    );
    const coefficient = typeof coefficients[power] === "number"
      ? corpusRational(BigInt(coefficients[power]))
      : coefficients[power];
    total = addCorpusRationals(total, divideCorpusRationals(
      multiplyCorpusRationals(coefficient, endpointDifference),
      corpusRational(BigInt(exponent)),
    ));
  }
  return total;
}

function definiteIntegralExpectedAnswer(coefficients, lower, upper) {
  return formatCorpusRational(
    definiteIntegralExpectedValue(coefficients, lower, upper),
  );
}

function formatPolynomial(coefficients) {
  const terms = [];
  for (let power = coefficients.length - 1; power >= 0; power -= 1) {
    const coefficient = coefficients[power];
    if (coefficient === 0) continue;
    const magnitude = Math.abs(coefficient);
    const variable = power === 0 ? "" : power === 1 ? "x" : `x^${power}`;
    const body = variable && magnitude === 1 ? variable : `${magnitude}${variable}`;
    if (!terms.length) {
      terms.push(coefficient < 0 ? `-${body}` : body);
    } else {
      terms.push(`${coefficient < 0 ? "-" : "+"}${body}`);
    }
  }
  return terms.join("") || "0";
}

function generatedPolynomialCoefficients(index) {
  const degree = index % 5;
  const coefficients = Array.from({ length: degree + 1 }, (_, power) => (
    ((index * (power + 3) + power * 5) % 9) - 4
  ));
  if (coefficients[degree] === 0) {
    coefficients[degree] = index % 2 === 0 ? 1 : -1;
  }
  return coefficients;
}

function generatedIntegralBounds(index) {
  const sequence = Math.floor(index / 6);
  const integerLower = corpusRational(BigInt((sequence % 7) - 3));
  const integerUpper = addCorpusRationals(
    integerLower,
    corpusRational(BigInt((sequence % 4) + 1)),
  );
  const fractionalLower = corpusRational(
    BigInt((sequence % 13) - 7),
    BigInt((sequence % 3) + 2),
  );
  const fractionalUpper = addCorpusRationals(
    fractionalLower,
    corpusRational(BigInt((sequence % 5) + 1), BigInt((sequence % 4) + 2)),
  );

  switch (index % 6) {
    case 0: return [integerLower, integerUpper];
    case 1: return [integerUpper, integerLower];
    case 2: return [integerLower, integerLower];
    case 3: return [fractionalLower, fractionalUpper];
    case 4: return [fractionalUpper, fractionalLower];
    default: return [fractionalLower, fractionalLower];
  }
}

function generatedDefiniteIntegrals() {
  return Array.from({ length: 250 }, (_, index) => {
    const coefficients = generatedPolynomialCoefficients(index);
    const [lower, upper] = generatedIntegralBounds(index);
    return {
      family: "definite-integral",
      question: `\u222b_(${formatCorpusRational(lower)})^(${formatCorpusRational(upper)}) `
        + `${formatPolynomial(coefficients)} dx`,
      answer: definiteIntegralExpectedAnswer(coefficients, lower, upper),
    };
  });
}

function formatRationalPolynomial(coefficients) {
  let expression = "";
  for (let power = coefficients.length - 1; power >= 0; power -= 1) {
    const coefficient = coefficients[power];
    if (coefficient.numerator === 0n) continue;
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? negateCorpusRational(coefficient) : coefficient;
    const variable = power === 0 ? "" : power === 1 ? "x" : `x^${power}`;
    const magnitudeText = formatCorpusRational(magnitude);
    const body = !variable
      ? magnitudeText
      : equalCorpusRationals(magnitude, corpusRational(1n))
        ? variable
        : magnitude.denominator === 1n
          ? `${magnitudeText}*${variable}`
          : `(${magnitudeText})*${variable}`;
    if (!expression) expression = `${negative ? "-" : ""}${body}`;
    else expression += `${negative ? "-" : "+"}${body}`;
  }
  return expression;
}

function generatedExponentialPolynomial(index) {
  if (index % 7 === 0) return [corpusRational(0n)];
  const degrees = [0, 1, 2, 3, 4, 8, 16, 32];
  const degree = degrees[index % degrees.length];
  const coefficients = Array.from({ length: degree + 1 }, (_, power) => (
    corpusRational(
      BigInt(((index * (power + 5) + power * 7) % 11) - 5),
      BigInt(((index + power * 2) % 3) + 1),
    )
  ));
  if (coefficients[degree].numerator === 0n) {
    coefficients[degree] = corpusRational(
      index % 2 === 0 ? 1n : -1n,
      BigInt((index % 3) + 1),
    );
  }
  return coefficients;
}

function generatedExponentialTerms(index) {
  const terms = Array.from({ length: (index % 4) + 1 }, (_, termIndex) => {
    let amplitudeNumerator = ((index * (termIndex + 2) + termIndex * 3) % 9) - 4;
    if (amplitudeNumerator === 0) amplitudeNumerator = termIndex % 2 === 0 ? 2 : -2;
    let slopeNumerator = (index + termIndex) % 6 === 0
      ? 0
      : ((index * 3 + termIndex * 5) % 7) - 3;
    if (slopeNumerator === 0 && (index + termIndex) % 6 !== 0) {
      slopeNumerator = termIndex % 2 === 0 ? 1 : -1;
    }
    return {
      amplitude: corpusRational(
        BigInt(amplitudeNumerator),
        BigInt(((index + termIndex) % 3) + 1),
      ),
      slope: corpusRational(
        BigInt(slopeNumerator),
        BigInt(((index * 2 + termIndex) % 3) + 1),
      ),
      intercept: corpusRational(
        BigInt(((index * 5 + termIndex * 4) % 9) - 4),
        BigInt(((index + termIndex * 2) % 3) + 1),
      ),
      eAlias: (index + termIndex) % 3 === 0,
    };
  });

  if (index % 10 === 0) {
    terms.push({
      ...terms[0],
      amplitude: negateCorpusRational(terms[0].amplitude),
      eAlias: !terms[0].eAlias,
    });
  }
  return terms;
}

function formatAffineExponent(slope, intercept) {
  let expression = "";
  if (slope.numerator !== 0n) {
    if (equalCorpusRationals(slope, corpusRational(1n))) expression = "x";
    else if (equalCorpusRationals(slope, corpusRational(-1n))) expression = "-x";
    else if (slope.denominator === 1n) expression = `${slope.numerator}*x`;
    else expression = `(${formatCorpusRational(slope)})*x`;
  }
  if (intercept.numerator === 0n) return expression || "0";
  const interceptText = formatCorpusRational(intercept);
  if (!expression) return interceptText;
  return intercept.numerator < 0n
    ? `${expression}${interceptText}`
    : `${expression}+${interceptText}`;
}

function formatExponentialIntegrandTerm(term) {
  const negative = term.amplitude.numerator < 0n;
  const magnitude = negative
    ? negateCorpusRational(term.amplitude)
    : term.amplitude;
  const argument = formatAffineExponent(term.slope, term.intercept);
  const atom = term.eAlias ? `e^(${argument})` : `exp(${argument})`;
  const coefficient = equalCorpusRationals(magnitude, corpusRational(1n))
    ? ""
    : magnitude.denominator === 1n
      ? `${magnitude.numerator}*`
      : `(${formatCorpusRational(magnitude)})*`;
  return `${negative ? "-" : ""}${coefficient}${atom}`;
}

function appendCorpusExpression(expression, term) {
  if (!term) return expression;
  if (!expression) return term;
  return term.startsWith("-") ? `${expression}${term}` : `${expression}+${term}`;
}

function formatExponentialSum(entries) {
  const combined = new Map();
  for (const { exponent, coefficient } of entries) {
    const key = formatCorpusRational(exponent);
    const previous = combined.get(key);
    combined.set(key, {
      exponent,
      coefficient: previous
        ? addCorpusRationals(previous.coefficient, coefficient)
        : coefficient,
    });
  }
  const terms = [...combined.values()]
    .filter(({ coefficient }) => coefficient.numerator !== 0n)
    .sort((left, right) => {
      const leftNegative = left.coefficient.numerator < 0n;
      const rightNegative = right.coefficient.numerator < 0n;
      if (leftNegative !== rightNegative) return leftNegative ? 1 : -1;
      return -compareCorpusRationals(left.exponent, right.exponent);
    });
  if (!terms.length) return "0";

  return terms.map(({ exponent, coefficient }, termIndex) => {
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? negateCorpusRational(coefficient) : coefficient;
    let body;
    if (exponent.numerator === 0n) {
      body = formatCorpusRational(magnitude);
    } else {
      const atom = `exp(${formatCorpusRational(exponent)})`;
      if (magnitude.denominator === 1n) {
        body = magnitude.numerator === 1n ? atom : `${magnitude.numerator}*${atom}`;
      } else {
        body = magnitude.numerator === 1n
          ? `${atom}/${magnitude.denominator}`
          : `${magnitude.numerator}*${atom}/${magnitude.denominator}`;
      }
    }
    if (termIndex === 0) return `${negative ? "-" : ""}${body}`;
    return `${negative ? "-" : "+"}${body}`;
  }).join("");
}

function exponentialIntegralExpectedAnswer(polynomial, terms, lower, upper) {
  const entries = [];
  const polynomialValue = definiteIntegralExpectedValue(polynomial, lower, upper);
  if (polynomialValue.numerator !== 0n) {
    entries.push({ exponent: corpusRational(0n), coefficient: polynomialValue });
  }
  for (const term of terms) {
    if (term.slope.numerator === 0n) {
      entries.push({
        exponent: term.intercept,
        coefficient: multiplyCorpusRationals(
          term.amplitude,
          subtractCorpusRationals(upper, lower),
        ),
      });
      continue;
    }
    const primitiveCoefficient = divideCorpusRationals(term.amplitude, term.slope);
    entries.push({
      exponent: addCorpusRationals(
        multiplyCorpusRationals(term.slope, upper),
        term.intercept,
      ),
      coefficient: primitiveCoefficient,
    });
    entries.push({
      exponent: addCorpusRationals(
        multiplyCorpusRationals(term.slope, lower),
        term.intercept,
      ),
      coefficient: negateCorpusRational(primitiveCoefficient),
    });
  }
  return formatExponentialSum(entries);
}

function generatedExponentialDefiniteIntegrals() {
  return Array.from({ length: 250 }, (_, index) => {
    const polynomial = generatedExponentialPolynomial(index);
    const terms = generatedExponentialTerms(index);
    const [lower, upper] = generatedIntegralBounds(index + 1);
    let integrand = formatRationalPolynomial(polynomial);
    for (const term of terms) {
      integrand = appendCorpusExpression(
        integrand,
        formatExponentialIntegrandTerm(term),
      );
    }
    return {
      family: "exponential-definite-integral",
      question: `\u222b_(${formatCorpusRational(lower)})^(${formatCorpusRational(upper)}) `
        + `${integrand || "0"} dx`,
      answer: exponentialIntegralExpectedAnswer(
        polynomial,
        terms,
        lower,
        upper,
      ),
    };
  });
}

function generatedRejectedInputs() {
  const templates = [
    (value) => `sin x = ${value}`,
    (value) => `log x = ${value}`,
    (value) => `x^3=${value}`,
    (value) => `0<x<${value + 1}`,
    (value) => `2x+=${value}`,
    (value) => `xy=${value}, x+y=${value + 1}`,
    (value) => `図${value}の斜線部分の面積を求めよ`,
    (value) => `命題${value}を証明せよ`,
    (value) => `A(${value},2), B(4,6)間の距離`,
    (value) => `x+globalThis.process.exit()=${value}`,
  ];
  return Array.from({ length: 100 }, (_, index) => ({
    family: "rejected",
    question: templates[index % templates.length](Math.floor(index / templates.length) + 1),
  }));
}

const exponentialDefiniteIntegralCorpus = generatedExponentialDefiniteIntegrals();
const positiveCorpus = [
  ...generatedLinearEquations(),
  ...generatedLinearInequalities(),
  ...generatedLinearSystems(),
  ...generatedBaseConversions(),
  ...generatedQuadraticEquations(),
  ...generatedRationalEquations(),
  ...generatedRationalInequalities(),
  ...generatedQuadraticInequalities(),
  ...generatedExponentialEquations(),
  ...generatedLogarithmicEquations(),
  ...generatedDefiniteIntegrals(),
  ...exponentialDefiniteIntegralCorpus,
];
const rejectedCorpus = generatedRejectedInputs();
export const EVALUATION_CORPUS_SIZE = positiveCorpus.length + rejectedCorpus.length;

test("3,000問の生成評価コーパスで厳密解と安全な未対応を維持する", async () => {
  assert.equal(EVALUATION_CORPUS_SIZE, 3_000);
  assert.equal(exponentialDefiniteIntegralCorpus.length, 250);
  assert.equal(
    new Set(exponentialDefiniteIntegralCorpus.map(({ question }) => question)).size,
    250,
  );

  for (const item of positiveCorpus) {
    const result = item.family.endsWith("definite-integral")
      ? await solveQuestionAsync(item.question)
      : solveQuestion(item.question);
    assert.equal(result.verified, true, `${item.family}: ${item.question}: ${result.error}`);
    assert.equal(result.answer, item.answer, `${item.family}: ${item.question}`);
  }

  for (const item of rejectedCorpus) {
    const result = solveQuestion(item.question);
    assert.equal(result.verified, false, `${item.family}: ${item.question}`);
    assert.equal(result.answer, "", `${item.family}: ${item.question}`);
  }
});
