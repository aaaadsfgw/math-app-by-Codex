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

function generatedTrigonometricTerms(index, functionName) {
  const functionOffset = functionName === "sin" ? 0 : 1;
  const count = functionName === "sin"
    ? (index % 4) + 1
    : ((index * 3 + 1) % 4) + 1;
  return Array.from({ length: count }, (_, termIndex) => {
    let amplitudeNumerator = (
      (index * (termIndex + functionOffset + 3) + termIndex * 5 + functionOffset * 2) % 11
    ) - 5;
    if (amplitudeNumerator === 0) {
      amplitudeNumerator = (index + termIndex + functionOffset) % 2 === 0 ? 2 : -2;
    }
    const zeroSlope = (index + termIndex * 2 + functionOffset) % 7 === 0;
    let slopeNumerator = zeroSlope
      ? 0
      : ((index * (functionOffset + 2) + termIndex * 3 + functionOffset) % 7) - 3;
    if (!zeroSlope && slopeNumerator === 0) {
      slopeNumerator = (index + termIndex) % 2 === 0 ? 1 : -1;
    }
    return {
      functionName,
      amplitude: corpusRational(
        BigInt(amplitudeNumerator),
        BigInt(((index + termIndex + functionOffset) % 3) + 1),
      ),
      slope: corpusRational(
        BigInt(slopeNumerator),
        BigInt(((index * 2 + termIndex + functionOffset) % 3) + 1),
      ),
      intercept: corpusRational(
        BigInt(((index * 4 + termIndex * 5 + functionOffset * 3) % 9) - 4),
        BigInt(((index + termIndex * 2 + functionOffset) % 3) + 1),
      ),
    };
  });
}

function forceTrigonometricCoverage(index, sinTerms, cosTerms, upper) {
  if (index % 12 === 2) {
    sinTerms[0] = {
      ...sinTerms[0],
      slope: corpusRational(0n),
      intercept: corpusRational(0n),
    };
  }
  if (index % 12 === 3) {
    cosTerms[0] = {
      ...cosTerms[0],
      slope: corpusRational(0n),
      intercept: corpusRational(-1n, 2n),
    };
  }
  if (index % 12 === 4) {
    const slope = sinTerms[0].slope.numerator === 0n
      ? corpusRational(1n, 2n)
      : sinTerms[0].slope;
    sinTerms[0] = {
      ...sinTerms[0],
      slope,
      intercept: negateCorpusRational(multiplyCorpusRationals(slope, upper)),
    };
  }
  if (index % 12 === 5) {
    sinTerms[0] = {
      ...sinTerms[0],
      slope: corpusRational(-1n, BigInt((index % 3) + 1)),
    };
  }
}

function addCrossSourceCancellation(index, sinTerms, cosTerms, lower, upper) {
  const intervalLength = subtractCorpusRationals(upper, lower);
  if (intervalLength.numerator === 0n) return false;

  if (index % 8 === 0) {
    const source = {
      ...sinTerms[0],
      slope: sinTerms[0].slope.numerator === 0n
        ? corpusRational(index % 2 === 0 ? 1n : -1n)
        : sinTerms[0].slope,
    };
    sinTerms[0] = source;
    const endpointArgument = addCorpusRationals(
      multiplyCorpusRationals(source.slope, upper),
      source.intercept,
    );
    cosTerms[0] = {
      functionName: "cos",
      amplitude: divideCorpusRationals(
        divideCorpusRationals(source.amplitude, source.slope),
        intervalLength,
      ),
      slope: corpusRational(0n),
      intercept: endpointArgument,
    };
    return true;
  }

  if (index % 8 === 1) {
    const source = {
      ...cosTerms[0],
      slope: cosTerms[0].slope.numerator === 0n
        ? corpusRational(index % 2 === 0 ? 1n : -1n)
        : cosTerms[0].slope,
    };
    cosTerms[0] = source;
    const endpointArgument = addCorpusRationals(
      multiplyCorpusRationals(source.slope, upper),
      source.intercept,
    );
    sinTerms[0] = {
      functionName: "sin",
      amplitude: negateCorpusRational(divideCorpusRationals(
        divideCorpusRationals(source.amplitude, source.slope),
        intervalLength,
      )),
      slope: corpusRational(0n),
      intercept: endpointArgument,
    };
    return true;
  }
  return false;
}

function formatTrigonometricIntegrandTerm(term) {
  const negative = term.amplitude.numerator < 0n;
  const magnitude = negative
    ? negateCorpusRational(term.amplitude)
    : term.amplitude;
  const argument = formatAffineExponent(term.slope, term.intercept);
  const coefficient = equalCorpusRationals(magnitude, corpusRational(1n))
    ? ""
    : magnitude.denominator === 1n
      ? `${magnitude.numerator}*`
      : `(${formatCorpusRational(magnitude)})*`;
  return `${negative ? "-" : ""}${coefficient}${term.functionName}(${argument})`;
}

function normalizeCorpusElementaryEntry(rawEntry) {
  if (rawEntry.coefficient.numerator === 0n) return null;
  if (rawEntry.kind === "rational") {
    return { kind: "rational", argument: null, coefficient: rawEntry.coefficient };
  }
  if (rawEntry.kind === "exp" && rawEntry.argument.numerator === 0n) {
    return { kind: "rational", argument: null, coefficient: rawEntry.coefficient };
  }
  if (rawEntry.kind === "sin") {
    if (rawEntry.argument.numerator === 0n) return null;
    if (rawEntry.argument.numerator < 0n) {
      return {
        kind: "sin",
        argument: negateCorpusRational(rawEntry.argument),
        coefficient: negateCorpusRational(rawEntry.coefficient),
      };
    }
  }
  if (rawEntry.kind === "cos") {
    if (rawEntry.argument.numerator === 0n) {
      return { kind: "rational", argument: null, coefficient: rawEntry.coefficient };
    }
    if (rawEntry.argument.numerator < 0n) {
      return {
        kind: "cos",
        argument: negateCorpusRational(rawEntry.argument),
        coefficient: rawEntry.coefficient,
      };
    }
  }
  return rawEntry;
}

function formatCorpusElementarySum(entries) {
  const atomOrder = { exp: 0, rational: 0, sin: 1, cos: 2 };
  const combined = new Map();
  for (const rawEntry of entries) {
    const entry = normalizeCorpusElementaryEntry(rawEntry);
    if (!entry) continue;
    const key = entry.kind === "rational"
      ? "rational"
      : `${entry.kind}:${formatCorpusRational(entry.argument)}`;
    const previous = combined.get(key);
    combined.set(key, {
      ...entry,
      coefficient: previous
        ? addCorpusRationals(previous.coefficient, entry.coefficient)
        : entry.coefficient,
    });
  }

  const terms = [...combined.values()]
    .filter(({ coefficient }) => coefficient.numerator !== 0n)
    .sort((left, right) => {
      const leftNegative = left.coefficient.numerator < 0n;
      const rightNegative = right.coefficient.numerator < 0n;
      if (leftNegative !== rightNegative) return leftNegative ? 1 : -1;
      const order = atomOrder[left.kind] - atomOrder[right.kind];
      if (order) return order;
      const leftArgument = left.kind === "rational"
        ? corpusRational(0n)
        : left.argument;
      const rightArgument = right.kind === "rational"
        ? corpusRational(0n)
        : right.argument;
      return -compareCorpusRationals(leftArgument, rightArgument);
    });
  if (!terms.length) return "0";

  return terms.map(({ kind, argument, coefficient }, termIndex) => {
    const negative = coefficient.numerator < 0n;
    const magnitude = negative ? negateCorpusRational(coefficient) : coefficient;
    let body;
    if (kind === "rational") {
      body = formatCorpusRational(magnitude);
    } else {
      const atom = `${kind}(${formatCorpusRational(argument)})`;
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

function appendExponentialEndpointEntries(entries, terms, lower, upper) {
  for (const term of terms) {
    if (term.slope.numerator === 0n) {
      entries.push({
        kind: "exp",
        argument: term.intercept,
        coefficient: multiplyCorpusRationals(
          term.amplitude,
          subtractCorpusRationals(upper, lower),
        ),
      });
      continue;
    }
    const primitiveCoefficient = divideCorpusRationals(term.amplitude, term.slope);
    entries.push({
      kind: "exp",
      argument: addCorpusRationals(
        multiplyCorpusRationals(term.slope, upper),
        term.intercept,
      ),
      coefficient: primitiveCoefficient,
    });
    entries.push({
      kind: "exp",
      argument: addCorpusRationals(
        multiplyCorpusRationals(term.slope, lower),
        term.intercept,
      ),
      coefficient: negateCorpusRational(primitiveCoefficient),
    });
  }
}

function appendTrigonometricEndpointEntries(entries, terms, lower, upper) {
  for (const term of terms) {
    if (term.slope.numerator === 0n) {
      entries.push({
        kind: term.functionName,
        argument: term.intercept,
        coefficient: multiplyCorpusRationals(
          term.amplitude,
          subtractCorpusRationals(upper, lower),
        ),
      });
      continue;
    }
    const quotient = divideCorpusRationals(term.amplitude, term.slope);
    const upperArgument = addCorpusRationals(
      multiplyCorpusRationals(term.slope, upper),
      term.intercept,
    );
    const lowerArgument = addCorpusRationals(
      multiplyCorpusRationals(term.slope, lower),
      term.intercept,
    );
    if (term.functionName === "sin") {
      entries.push({
        kind: "cos",
        argument: upperArgument,
        coefficient: negateCorpusRational(quotient),
      });
      entries.push({ kind: "cos", argument: lowerArgument, coefficient: quotient });
    } else {
      entries.push({ kind: "sin", argument: upperArgument, coefficient: quotient });
      entries.push({
        kind: "sin",
        argument: lowerArgument,
        coefficient: negateCorpusRational(quotient),
      });
    }
  }
}

function trigonometricIntegralExpectedAnswer({
  polynomial,
  exponentialTerms,
  sinTerms,
  cosTerms,
  lower,
  upper,
}) {
  const entries = [];
  const polynomialValue = definiteIntegralExpectedValue(polynomial, lower, upper);
  if (polynomialValue.numerator !== 0n) {
    entries.push({ kind: "rational", argument: null, coefficient: polynomialValue });
  }
  appendExponentialEndpointEntries(entries, exponentialTerms, lower, upper);
  appendTrigonometricEndpointEntries(entries, sinTerms, lower, upper);
  appendTrigonometricEndpointEntries(entries, cosTerms, lower, upper);
  return formatCorpusElementarySum(entries);
}

function trigonometricCoverage({
  polynomial,
  exponentialTerms,
  sinTerms,
  cosTerms,
  lower,
  upper,
  crossSourceCancellation,
}) {
  const terms = [...sinTerms, ...cosTerms];
  const endpointArguments = terms.flatMap((term) => [lower, upper].map((bound) => (
    addCorpusRationals(
      multiplyCorpusRationals(term.slope, bound),
      term.intercept,
    )
  )));
  const direction = compareCorpusRationals(lower, upper);
  return {
    polynomialNonzero: polynomial.some(({ numerator }) => numerator !== 0n),
    exponentialCount: exponentialTerms.length,
    sinCount: sinTerms.length,
    cosCount: cosTerms.length,
    intervalKind: direction < 0 ? "normal" : direction > 0 ? "reverse" : "equal",
    fractionalBounds: lower.denominator !== 1n || upper.denominator !== 1n,
    zeroSlope: terms.some(({ slope }) => slope.numerator === 0n),
    negativeSlope: terms.some(({ slope }) => slope.numerator < 0n),
    zeroArgument: endpointArguments.some(({ numerator }) => numerator === 0n),
    negativeArgument: endpointArguments.some(({ numerator }) => numerator < 0n),
    crossSourceCancellation,
  };
}

function generatedTrigonometricDefiniteIntegrals() {
  return Array.from({ length: 250 }, (_, index) => {
    const polynomial = [...generatedExponentialPolynomial(index + 401)];
    if (polynomial.every(({ numerator }) => numerator === 0n)) {
      polynomial[0] = corpusRational(BigInt((index % 5) + 1), BigInt((index % 3) + 1));
    }
    const exponentialTerms = generatedExponentialTerms(index + 503);
    const sinTerms = generatedTrigonometricTerms(index, "sin")
      .map((term) => ({ ...term }));
    const cosTerms = generatedTrigonometricTerms(index, "cos")
      .map((term) => ({ ...term }));
    const [lower, upper] = generatedIntegralBounds(index + 3);
    forceTrigonometricCoverage(index, sinTerms, cosTerms, upper);
    const crossSourceCancellation = addCrossSourceCancellation(
      index,
      sinTerms,
      cosTerms,
      lower,
      upper,
    );

    let integrand = formatRationalPolynomial(polynomial);
    for (const term of exponentialTerms) {
      integrand = appendCorpusExpression(integrand, formatExponentialIntegrandTerm(term));
    }
    for (const term of [...sinTerms, ...cosTerms]) {
      integrand = appendCorpusExpression(integrand, formatTrigonometricIntegrandTerm(term));
    }
    return {
      family: "trigonometric-definite-integral",
      question: `\u222b_(${formatCorpusRational(lower)})^(${formatCorpusRational(upper)}) `
        + `${integrand} dx`,
      answer: trigonometricIntegralExpectedAnswer({
        polynomial,
        exponentialTerms,
        sinTerms,
        cosTerms,
        lower,
        upper,
      }),
      coverage: trigonometricCoverage({
        polynomial,
        exponentialTerms,
        sinTerms,
        cosTerms,
        lower,
        upper,
        crossSourceCancellation,
      }),
    };
  });
}

const CORPUS_PI_STANDARD_REFERENCES = [
  corpusRational(0n),
  corpusRational(1n, 12n),
  corpusRational(1n, 6n),
  corpusRational(1n, 4n),
  corpusRational(1n, 3n),
  corpusRational(5n, 12n),
  corpusRational(1n, 2n),
];

function formatCorpusPiMultiple(coefficient) {
  if (coefficient.numerator === 0n) return "0";
  const negative = coefficient.numerator < 0n;
  const numerator = negative ? -coefficient.numerator : coefficient.numerator;
  const denominator = coefficient.denominator;
  let body;
  if (denominator === 1n) {
    body = numerator === 1n ? "pi" : `${numerator}*pi`;
  } else {
    body = numerator === 1n
      ? `pi/${denominator}`
      : `${numerator}*pi/${denominator}`;
  }
  return `${negative ? "-" : ""}${body}`;
}

function euclideanCorpusPiTurn(coefficient) {
  const modulus = 2n * coefficient.denominator;
  const numerator = ((coefficient.numerator % modulus) + modulus) % modulus;
  return corpusRational(numerator, coefficient.denominator);
}

function firstQuadrantCorpusPi(functionName, coefficient) {
  const turn = euclideanCorpusPiTurn(coefficient);
  const half = corpusRational(1n, 2n);
  const one = corpusRational(1n);
  const threeHalves = corpusRational(3n, 2n);
  if (compareCorpusRationals(turn, half) <= 0) {
    return { turn, reference: turn, sign: 1n };
  }
  if (compareCorpusRationals(turn, one) <= 0) {
    return {
      turn,
      reference: subtractCorpusRationals(one, turn),
      sign: functionName === "sin" ? 1n : -1n,
    };
  }
  if (compareCorpusRationals(turn, threeHalves) <= 0) {
    return {
      turn,
      reference: subtractCorpusRationals(turn, one),
      sign: -1n,
    };
  }
  return {
    turn,
    reference: subtractCorpusRationals(corpusRational(2n), turn),
    sign: functionName === "sin" ? -1n : 1n,
  };
}

function corpusPiSpecialAngleVector(functionName, reference) {
  const quarter = corpusRational(1n, 4n);
  const negativeQuarter = negateCorpusRational(quarter);
  const half = corpusRational(1n, 2n);
  const one = corpusRational(1n);
  const sine = new Map([
    ["0", []],
    ["1/12", [[6, quarter], [2, negativeQuarter]]],
    ["1/6", [[1, half]]],
    ["1/4", [[2, half]]],
    ["1/3", [[3, half]]],
    ["5/12", [[6, quarter], [2, quarter]]],
    ["1/2", [[1, one]]],
  ]);
  const cosine = new Map([
    ["0", [[1, one]]],
    ["1/12", [[6, quarter], [2, quarter]]],
    ["1/6", [[3, half]]],
    ["1/4", [[2, half]]],
    ["1/3", [[1, half]]],
    ["5/12", [[6, quarter], [2, negativeQuarter]]],
    ["1/2", []],
  ]);
  const table = functionName === "sin" ? sine : cosine;
  return table.has(formatCorpusRational(reference))
    ? table.get(formatCorpusRational(reference))
    : null;
}

function normalizedCorpusPiFunctionEntries({
  functionName,
  argument,
  coefficient,
  piPower = 0,
}) {
  if (coefficient.numerator === 0n) return [];
  const quadrant = firstQuadrantCorpusPi(functionName, argument);
  const signedCoefficient = multiplyCorpusRationals(
    coefficient,
    corpusRational(quadrant.sign),
  );
  const vector = corpusPiSpecialAngleVector(functionName, quadrant.reference);
  if (vector) {
    return vector.map(([radicand, factor]) => ({
      kind: "scalar",
      argument: null,
      piPower,
      radicand,
      coefficient: multiplyCorpusRationals(signedCoefficient, factor),
    }));
  }
  return [{
    kind: functionName,
    argument: quadrant.reference,
    piPower,
    radicand: 1,
    coefficient: signedCoefficient,
  }];
}

function formatCorpusPiElementarySum(entries) {
  const combined = new Map();
  for (const entry of entries) {
    if (entry.coefficient.numerator === 0n) continue;
    const argumentKey = entry.kind === "scalar"
      ? "scalar"
      : formatCorpusRational(entry.argument);
    const key = [
      entry.kind,
      argumentKey,
      `pi:${entry.piPower}`,
      `sqrt:${entry.radicand}`,
    ].join("|");
    const previous = combined.get(key);
    combined.set(key, {
      ...entry,
      coefficient: previous
        ? addCorpusRationals(previous.coefficient, entry.coefficient)
        : entry.coefficient,
    });
  }

  const groupOrder = { scalar: 0, sin: 1, cos: 2 };
  const radicalOrder = { 1: 0, 6: 1, 3: 2, 2: 3 };
  const terms = [...combined.values()]
    .filter(({ coefficient }) => coefficient.numerator !== 0n)
    .sort((left, right) => {
      const leftNegative = left.coefficient.numerator < 0n;
      const rightNegative = right.coefficient.numerator < 0n;
      if (leftNegative !== rightNegative) return leftNegative ? 1 : -1;
      const group = groupOrder[left.kind] - groupOrder[right.kind];
      if (group) return group;
      if (left.kind !== "scalar") {
        const argument = -compareCorpusRationals(left.argument, right.argument);
        if (argument) return argument;
      }
      if (left.piPower !== right.piPower) return left.piPower - right.piPower;
      return radicalOrder[left.radicand] - radicalOrder[right.radicand];
    });
  if (!terms.length) return "0";

  return terms.map((term, termIndex) => {
    const negative = term.coefficient.numerator < 0n;
    const magnitude = negative
      ? negateCorpusRational(term.coefficient)
      : term.coefficient;
    const factors = [];
    if (term.piPower === 1) factors.push("pi");
    else if (term.piPower !== 0) factors.push(`pi^${term.piPower}`);
    if (term.radicand !== 1) factors.push(`√${term.radicand}`);
    if (term.kind !== "scalar") {
      factors.push(`${term.kind}(${formatCorpusPiMultiple(term.argument)})`);
    }
    let body;
    if (!factors.length) {
      body = formatCorpusRational(magnitude);
    } else {
      const product = factors.join("*");
      if (magnitude.denominator === 1n) {
        body = magnitude.numerator === 1n
          ? product
          : `${magnitude.numerator}*${product}`;
      } else {
        body = magnitude.numerator === 1n
          ? `${product}/${magnitude.denominator}`
          : `${magnitude.numerator}*${product}/${magnitude.denominator}`;
      }
    }
    if (termIndex === 0) return `${negative ? "-" : ""}${body}`;
    return `${negative ? "-" : "+"}${body}`;
  }).join("");
}

function generatedCorpusPiBounds(index) {
  const sequence = Math.floor(index / 6);
  const integerLower = corpusRational(BigInt((sequence % 7) - 3));
  const integerUpper = addCorpusRationals(
    integerLower,
    corpusRational(BigInt((sequence % 3) + 1)),
  );
  const denominators = [5n, 7n, 8n, 10n, 12n];
  const denominator = denominators[sequence % denominators.length];
  const fractionalLower = corpusRational(
    BigInt(((sequence * 3) % 13) - 6),
    denominator,
  );
  const fractionalUpper = addCorpusRationals(
    fractionalLower,
    corpusRational(BigInt((sequence % 5) + 1), denominator),
  );
  const nonzeroIntegerEqual = integerLower.numerator === 0n
    ? corpusRational(1n)
    : integerLower;
  const nonzeroFractionalEqual = fractionalLower.numerator === 0n
    ? corpusRational(1n, denominator)
    : fractionalLower;
  switch (index % 6) {
    case 0: return [integerLower, integerUpper];
    case 1: return [integerUpper, integerLower];
    case 2: return [nonzeroIntegerEqual, nonzeroIntegerEqual];
    case 3: return [fractionalLower, fractionalUpper];
    case 4: return [fractionalUpper, fractionalLower];
    default: return [nonzeroFractionalEqual, nonzeroFractionalEqual];
  }
}

function generatedCorpusPiTerms(index, functionName) {
  const functionOffset = functionName === "sin" ? 0 : 1;
  const count = functionName === "sin"
    ? (index % 4) + 1
    : ((index * 3 + 1) % 4) + 1;
  const phaseDenominators = [1n, 2n, 3n, 4n, 5n, 6n, 7n, 8n, 12n];
  return Array.from({ length: count }, (_, termIndex) => {
    let amplitudeNumerator = (
      (index * (termIndex + 3 + functionOffset) + termIndex * 5 + functionOffset) % 11
    ) - 5;
    if (amplitudeNumerator === 0) {
      amplitudeNumerator = (index + termIndex + functionOffset) % 2 === 0 ? 2 : -2;
    }
    const zeroSlope = (index + termIndex * 2 + functionOffset) % 9 === 0;
    let slopeNumerator = zeroSlope
      ? 0
      : ((index * (functionOffset + 2) + termIndex * 3 + functionOffset) % 9) - 4;
    if (!zeroSlope && slopeNumerator === 0) {
      slopeNumerator = (index + termIndex) % 2 === 0 ? 1 : -1;
    }
    const phaseDenominator = phaseDenominators[
      (index + termIndex * 2 + functionOffset) % phaseDenominators.length
    ];
    return {
      functionName,
      amplitude: corpusRational(
        BigInt(amplitudeNumerator),
        BigInt(((index + termIndex + functionOffset) % 3) + 1),
      ),
      slope: corpusRational(
        BigInt(slopeNumerator),
        BigInt(((index * 2 + termIndex + functionOffset) % 3) + 1),
      ),
      intercept: corpusRational(
        BigInt(((index * 7 + termIndex * 5 + functionOffset * 3) % 25) - 12),
        phaseDenominator,
      ),
    };
  });
}

function forceCorpusPiCoverage(index, sinTerms, cosTerms, upper) {
  const selector = index % 14;
  if (selector < CORPUS_PI_STANDARD_REFERENCES.length) {
    const target = CORPUS_PI_STANDARD_REFERENCES[selector];
    const slope = sinTerms[0].slope.numerator === 0n
      ? corpusRational(selector % 2 === 0 ? 1n : -1n, BigInt((selector % 3) + 1))
      : sinTerms[0].slope;
    sinTerms[0] = {
      ...sinTerms[0],
      slope,
      intercept: subtractCorpusRationals(
        target,
        multiplyCorpusRationals(slope, upper),
      ),
    };
    return;
  }
  const nonstandard = [
    corpusRational(1n, 5n),
    corpusRational(1n, 7n),
    corpusRational(1n, 8n),
    corpusRational(2n, 5n),
  ];
  if (selector <= 10) {
    const target = nonstandard[selector - 7];
    const slope = cosTerms[0].slope.numerator === 0n
      ? corpusRational(selector % 2 === 0 ? 1n : -1n)
      : cosTerms[0].slope;
    cosTerms[0] = {
      ...cosTerms[0],
      slope,
      intercept: subtractCorpusRationals(
        target,
        multiplyCorpusRationals(slope, upper),
      ),
    };
    return;
  }
  if (selector === 11) {
    sinTerms[0] = {
      ...sinTerms[0],
      slope: corpusRational(0n),
      intercept: corpusRational(1n, 12n),
    };
    return;
  }
  if (selector === 12) {
    cosTerms[0] = {
      ...cosTerms[0],
      slope: corpusRational(0n),
      intercept: corpusRational(1n, 5n),
    };
    return;
  }
  sinTerms[0] = {
    ...sinTerms[0],
    slope: corpusRational(-1n, BigInt((index % 3) + 1)),
    intercept: addCorpusRationals(sinTerms[0].intercept, corpusRational(2n)),
  };
}

function addCorpusPiCancellation(index, sinTerms, cosTerms) {
  if (index % 9 === 0 && sinTerms.length >= 2) {
    const source = sinTerms[0];
    sinTerms[1] = {
      ...source,
      amplitude: negateCorpusRational(source.amplitude),
      intercept: addCorpusRationals(source.intercept, corpusRational(2n)),
    };
    return true;
  }
  if (index % 9 === 1 && cosTerms.length >= 2) {
    const source = cosTerms[0];
    cosTerms[1] = {
      ...source,
      amplitude: negateCorpusRational(source.amplitude),
      slope: negateCorpusRational(source.slope),
      intercept: negateCorpusRational(source.intercept),
    };
    return true;
  }
  return false;
}

function formatCorpusPiPhase(slope, intercept) {
  let expression = "";
  if (slope.numerator !== 0n) {
    if (equalCorpusRationals(slope, corpusRational(1n))) expression = "x";
    else if (equalCorpusRationals(slope, corpusRational(-1n))) expression = "-x";
    else if (slope.denominator === 1n) expression = `${slope.numerator}*x`;
    else expression = `(${formatCorpusRational(slope)})*x`;
  }
  if (intercept.numerator === 0n) return expression || "0";
  const interceptText = formatCorpusPiMultiple(intercept);
  if (!expression) return interceptText;
  return intercept.numerator < 0n
    ? `${expression}${interceptText}`
    : `${expression}+${interceptText}`;
}

function formatCorpusPiIntegrandTerm(term) {
  const negative = term.amplitude.numerator < 0n;
  const magnitude = negative
    ? negateCorpusRational(term.amplitude)
    : term.amplitude;
  const coefficient = equalCorpusRationals(magnitude, corpusRational(1n))
    ? ""
    : magnitude.denominator === 1n
      ? `${magnitude.numerator}*`
      : `(${formatCorpusRational(magnitude)})*`;
  return `${negative ? "-" : ""}${coefficient}${term.functionName}(`
    + `${formatCorpusPiPhase(term.slope, term.intercept)})`;
}

function appendCorpusPiEndpointEntries(entries, term, lower, upper) {
  if (term.slope.numerator === 0n) {
    entries.push(...normalizedCorpusPiFunctionEntries({
      functionName: term.functionName,
      argument: term.intercept,
      coefficient: multiplyCorpusRationals(
        term.amplitude,
        subtractCorpusRationals(upper, lower),
      ),
      piPower: 1,
    }));
    return;
  }
  const quotient = divideCorpusRationals(term.amplitude, term.slope);
  const upperArgument = addCorpusRationals(
    multiplyCorpusRationals(term.slope, upper),
    term.intercept,
  );
  const lowerArgument = addCorpusRationals(
    multiplyCorpusRationals(term.slope, lower),
    term.intercept,
  );
  if (term.functionName === "sin") {
    entries.push(...normalizedCorpusPiFunctionEntries({
      functionName: "cos",
      argument: upperArgument,
      coefficient: negateCorpusRational(quotient),
    }));
    entries.push(...normalizedCorpusPiFunctionEntries({
      functionName: "cos",
      argument: lowerArgument,
      coefficient: quotient,
    }));
  } else {
    entries.push(...normalizedCorpusPiFunctionEntries({
      functionName: "sin",
      argument: upperArgument,
      coefficient: quotient,
    }));
    entries.push(...normalizedCorpusPiFunctionEntries({
      functionName: "sin",
      argument: lowerArgument,
      coefficient: negateCorpusRational(quotient),
    }));
  }
}

function corpusPiIntegralExpectedAnswer(sinTerms, cosTerms, lower, upper) {
  const entries = [];
  for (const term of [...sinTerms, ...cosTerms]) {
    appendCorpusPiEndpointEntries(entries, term, lower, upper);
  }
  return formatCorpusPiElementarySum(entries);
}

function corpusPiCoverage(sinTerms, cosTerms, lower, upper, cancellationPattern) {
  const terms = [...sinTerms, ...cosTerms];
  const angles = [];
  for (const term of terms) {
    const endpointArguments = term.slope.numerator === 0n
      ? [term.intercept]
      : [lower, upper].map((bound) => addCorpusRationals(
        multiplyCorpusRationals(term.slope, bound),
        term.intercept,
      ));
    for (const argument of endpointArguments) {
      const normalized = firstQuadrantCorpusPi(term.functionName, argument);
      const vector = corpusPiSpecialAngleVector(term.functionName, normalized.reference);
      angles.push({
        raw: argument,
        normalized,
        vector,
        piPower: term.slope.numerator === 0n ? 1 : 0,
      });
    }
  }
  const direction = compareCorpusRationals(lower, upper);
  return {
    sinCount: sinTerms.length,
    cosCount: cosTerms.length,
    intervalKind: direction < 0 ? "normal" : direction > 0 ? "reverse" : "equal",
    fractionalBounds: lower.denominator !== 1n || upper.denominator !== 1n,
    zeroSlope: terms.some(({ slope }) => slope.numerator === 0n),
    negativeSlope: terms.some(({ slope }) => slope.numerator < 0n),
    negativeAngle: angles.some(({ raw }) => raw.numerator < 0n),
    periodicReduction: angles.some(({ raw, normalized }) => (
      !equalCorpusRationals(raw, normalized.turn)
    )),
    complementaryReduction: angles.some(({ normalized }) => (
      !equalCorpusRationals(normalized.turn, normalized.reference)
    )),
    standardReferences: angles
      .filter(({ vector }) => vector !== null)
      .map(({ normalized }) => formatCorpusRational(normalized.reference)),
    radicands: angles.flatMap(({ vector }) => (
      vector ? vector.map(([radicand]) => radicand) : []
    )),
    formalAtom: angles.some(({ vector }) => vector === null),
    piPower: angles.some(({ piPower }) => piPower === 1),
    cancellationPattern,
  };
}

function generatedPiAngleDefiniteIntegrals() {
  return Array.from({ length: 250 }, (_, index) => {
    const [lower, upper] = generatedCorpusPiBounds(index);
    const sinTerms = generatedCorpusPiTerms(index, "sin").map((term) => ({ ...term }));
    const cosTerms = generatedCorpusPiTerms(index, "cos").map((term) => ({ ...term }));
    forceCorpusPiCoverage(index, sinTerms, cosTerms, upper);
    const cancellationPattern = addCorpusPiCancellation(index, sinTerms, cosTerms);
    let integrand = "";
    for (const term of [...sinTerms, ...cosTerms]) {
      integrand = appendCorpusExpression(integrand, formatCorpusPiIntegrandTerm(term));
    }
    return {
      family: "pi-angle-definite-integral",
      question: `\u222b_(${formatCorpusPiMultiple(lower)})^(${formatCorpusPiMultiple(upper)}) `
        + `${integrand} dx`,
      answer: corpusPiIntegralExpectedAnswer(sinTerms, cosTerms, lower, upper),
      coverage: corpusPiCoverage(
        sinTerms,
        cosTerms,
        lower,
        upper,
        cancellationPattern,
      ),
    };
  });
}

const PI_SLOPE_STANDARD_REFERENCES = [
  corpusRational(0n),
  corpusRational(1n, 12n),
  corpusRational(1n, 6n),
  corpusRational(1n, 4n),
  corpusRational(1n, 3n),
  corpusRational(5n, 12n),
  corpusRational(1n, 2n),
];

const PI_SLOPE_SINE_TICK_VECTORS = Object.freeze([
  [],
  [[6, 1n, 4n], [2, -1n, 4n]],
  [[1, 1n, 2n]],
  [[2, 1n, 2n]],
  [[3, 1n, 2n]],
  [[6, 1n, 4n], [2, 1n, 4n]],
  [[1, 1n, 1n]],
  [[6, 1n, 4n], [2, 1n, 4n]],
  [[3, 1n, 2n]],
  [[2, 1n, 2n]],
  [[1, 1n, 2n]],
  [[6, 1n, 4n], [2, -1n, 4n]],
  [],
  [[6, -1n, 4n], [2, 1n, 4n]],
  [[1, -1n, 2n]],
  [[2, -1n, 2n]],
  [[3, -1n, 2n]],
  [[6, -1n, 4n], [2, -1n, 4n]],
  [[1, -1n, 1n]],
  [[6, -1n, 4n], [2, -1n, 4n]],
  [[3, -1n, 2n]],
  [[2, -1n, 2n]],
  [[1, -1n, 2n]],
  [[6, -1n, 4n], [2, 1n, 4n]],
]);

function piSlopeStandardTick(angle) {
  const scaledNumerator = angle.numerator * 12n;
  if (scaledNumerator % angle.denominator !== 0n) return null;
  const rawTick = scaledNumerator / angle.denominator;
  return ((rawTick % 24n) + 24n) % 24n;
}

function piSlopeStandardVector(functionName, angle) {
  const tick = piSlopeStandardTick(angle);
  if (tick === null) return null;
  const sineTick = functionName === "sin" ? tick : (tick + 6n) % 24n;
  return PI_SLOPE_SINE_TICK_VECTORS[sineTick].map(
    ([radicand, numerator, denominator]) => ({
      radicand,
      coefficient: corpusRational(numerator, denominator),
    }),
  );
}

function canonicalPiSlopeAngle(functionName, angle) {
  const modulus = 2n * angle.denominator;
  const turn = corpusRational(
    ((angle.numerator % modulus) + modulus) % modulus,
    angle.denominator,
  );
  const half = corpusRational(1n, 2n);
  const one = corpusRational(1n);
  const threeHalves = corpusRational(3n, 2n);
  if (compareCorpusRationals(turn, half) <= 0) {
    return { turn, reference: turn, sign: 1n };
  }
  if (compareCorpusRationals(turn, one) <= 0) {
    return {
      turn,
      reference: subtractCorpusRationals(one, turn),
      sign: functionName === "sin" ? 1n : -1n,
    };
  }
  if (compareCorpusRationals(turn, threeHalves) <= 0) {
    return {
      turn,
      reference: subtractCorpusRationals(turn, one),
      sign: -1n,
    };
  }
  return {
    turn,
    reference: subtractCorpusRationals(corpusRational(2n), turn),
    sign: functionName === "sin" ? -1n : 1n,
  };
}

function piSlopeOracleEntries({
  functionName,
  angle,
  coefficient,
  piPower,
}) {
  if (coefficient.numerator === 0n) return [];
  const vector = piSlopeStandardVector(functionName, angle);
  if (vector !== null) {
    return vector.map(({ radicand, coefficient: factor }) => ({
      kind: "scalar",
      argument: null,
      piPower,
      radicand,
      coefficient: multiplyCorpusRationals(coefficient, factor),
    }));
  }
  const canonical = canonicalPiSlopeAngle(functionName, angle);
  return [{
    kind: functionName,
    argument: canonical.reference,
    piPower,
    radicand: 1,
    coefficient: multiplyCorpusRationals(
      coefficient,
      corpusRational(canonical.sign),
    ),
  }];
}

function appendPiSlopeOracleTerm(entries, term, lower, upper) {
  if (term.slopePi.numerator === 0n) {
    entries.push(...piSlopeOracleEntries({
      functionName: term.functionName,
      angle: term.interceptPi,
      coefficient: multiplyCorpusRationals(
        term.amplitude,
        subtractCorpusRationals(upper, lower),
      ),
      piPower: 0,
    }));
    return;
  }

  const quotient = divideCorpusRationals(term.amplitude, term.slopePi);
  const lowerAngle = addCorpusRationals(
    multiplyCorpusRationals(term.slopePi, lower),
    term.interceptPi,
  );
  const upperAngle = addCorpusRationals(
    multiplyCorpusRationals(term.slopePi, upper),
    term.interceptPi,
  );
  if (term.functionName === "sin") {
    entries.push(...piSlopeOracleEntries({
      functionName: "cos",
      angle: lowerAngle,
      coefficient: quotient,
      piPower: -1,
    }));
    entries.push(...piSlopeOracleEntries({
      functionName: "cos",
      angle: upperAngle,
      coefficient: negateCorpusRational(quotient),
      piPower: -1,
    }));
    return;
  }
  entries.push(...piSlopeOracleEntries({
    functionName: "sin",
    angle: upperAngle,
    coefficient: quotient,
    piPower: -1,
  }));
  entries.push(...piSlopeOracleEntries({
    functionName: "sin",
    angle: lowerAngle,
    coefficient: negateCorpusRational(quotient),
    piPower: -1,
  }));
}

function formatPiSlopeOracleMagnitude(term, magnitude) {
  const factors = [];
  if (term.piPower === 1) factors.push("pi");
  if (term.radicand !== 1) factors.push(`√${term.radicand}`);
  if (term.kind !== "scalar") {
    factors.push(`${term.kind}(${formatCorpusPiMultiple(term.argument)})`);
  }

  if (term.piPower === -1) {
    const numeratorFactors = [];
    if (magnitude.numerator !== 1n || !factors.length) {
      numeratorFactors.push(String(magnitude.numerator));
    }
    numeratorFactors.push(...factors);
    const numerator = numeratorFactors.join("*") || "1";
    return magnitude.denominator === 1n
      ? `${numerator}/pi`
      : `${numerator}/(${magnitude.denominator}*pi)`;
  }

  if (!factors.length) return formatCorpusRational(magnitude);
  const product = factors.join("*");
  if (magnitude.denominator === 1n) {
    return magnitude.numerator === 1n
      ? product
      : `${magnitude.numerator}*${product}`;
  }
  return magnitude.numerator === 1n
    ? `${product}/${magnitude.denominator}`
    : `${magnitude.numerator}*${product}/${magnitude.denominator}`;
}

function formatPiSlopeOracleSum(entries) {
  const combined = new Map();
  for (const entry of entries) {
    if (entry.coefficient.numerator === 0n) continue;
    const argumentKey = entry.kind === "scalar"
      ? "scalar"
      : formatCorpusRational(entry.argument);
    const key = [
      entry.kind,
      argumentKey,
      `pi:${entry.piPower}`,
      `sqrt:${entry.radicand}`,
    ].join("|");
    const previous = combined.get(key);
    combined.set(key, {
      ...entry,
      coefficient: previous
        ? addCorpusRationals(previous.coefficient, entry.coefficient)
        : entry.coefficient,
    });
  }

  const kindOrder = { scalar: 0, sin: 1, cos: 2 };
  const radicalOrder = { 1: 0, 6: 1, 3: 2, 2: 3 };
  const terms = [...combined.values()]
    .filter(({ coefficient }) => coefficient.numerator !== 0n)
    .sort((left, right) => {
      const leftNegative = left.coefficient.numerator < 0n;
      const rightNegative = right.coefficient.numerator < 0n;
      if (leftNegative !== rightNegative) return leftNegative ? 1 : -1;
      const kind = kindOrder[left.kind] - kindOrder[right.kind];
      if (kind) return kind;
      if (left.kind !== "scalar") {
        const argument = -compareCorpusRationals(left.argument, right.argument);
        if (argument) return argument;
      }
      if (left.piPower !== right.piPower) return left.piPower - right.piPower;
      return radicalOrder[left.radicand] - radicalOrder[right.radicand];
    });
  if (!terms.length) return "0";

  return terms.map((term, index) => {
    const negative = term.coefficient.numerator < 0n;
    const magnitude = negative
      ? negateCorpusRational(term.coefficient)
      : term.coefficient;
    const body = formatPiSlopeOracleMagnitude(term, magnitude);
    if (index === 0) return `${negative ? "-" : ""}${body}`;
    return `${negative ? "-" : "+"}${body}`;
  }).join("");
}

function piSlopeExpectedAnswer(sinTerms, cosTerms, lower, upper) {
  const entries = [];
  for (const term of [...sinTerms, ...cosTerms]) {
    appendPiSlopeOracleTerm(entries, term, lower, upper);
  }
  return formatPiSlopeOracleSum(entries);
}

function generatedPiSlopeBounds(index) {
  const sequence = Math.floor(index / 6);
  const integerLower = corpusRational(BigInt((sequence % 9) - 4));
  const integerUpper = addCorpusRationals(
    integerLower,
    corpusRational(BigInt((sequence % 4) + 1)),
  );
  const denominator = BigInt((sequence % 5) + 2);
  const fractionalLower = corpusRational(
    BigInt(((sequence * 5) % 17) - 8),
    denominator,
  );
  const fractionalUpper = addCorpusRationals(
    fractionalLower,
    corpusRational(BigInt((sequence % 5) + 1), BigInt((sequence % 4) + 2)),
  );
  const nonzeroIntegerEqual = integerLower.numerator === 0n
    ? corpusRational(1n)
    : integerLower;
  const nonzeroFractionalEqual = fractionalLower.numerator === 0n
    ? corpusRational(1n, denominator)
    : fractionalLower;
  switch (index % 6) {
    case 0: return [integerLower, integerUpper];
    case 1: return [integerUpper, integerLower];
    case 2: return [nonzeroIntegerEqual, nonzeroIntegerEqual];
    case 3: return [fractionalLower, fractionalUpper];
    case 4: return [fractionalUpper, fractionalLower];
    default: return [nonzeroFractionalEqual, nonzeroFractionalEqual];
  }
}

const PI_SLOPE_VALUES = [
  corpusRational(-5n, 3n),
  corpusRational(-1n),
  corpusRational(-1n, 2n),
  corpusRational(0n),
  corpusRational(1n, 12n),
  corpusRational(1n, 6n),
  corpusRational(1n, 4n),
  corpusRational(1n, 3n),
  corpusRational(2n, 5n),
  corpusRational(1n, 2n),
  corpusRational(5n, 12n),
  corpusRational(1n),
  corpusRational(4n, 3n),
  corpusRational(2n),
  corpusRational(7n, 3n),
];

const PI_SLOPE_INTERCEPTS = [
  corpusRational(-13n, 12n),
  corpusRational(-2n, 5n),
  corpusRational(-1n, 12n),
  corpusRational(0n),
  corpusRational(1n, 12n),
  corpusRational(1n, 6n),
  corpusRational(1n, 4n),
  corpusRational(1n, 3n),
  corpusRational(2n, 5n),
  corpusRational(5n, 12n),
  corpusRational(1n, 2n),
  corpusRational(11n, 5n),
];

function generatedPiSlopeTerms(index, functionName) {
  const functionOffset = functionName === "sin" ? 0 : 1;
  const count = functionName === "sin"
    ? (index % 3) + 1
    : ((index * 2 + 1) % 3) + 1;
  return Array.from({ length: count }, (_, termIndex) => {
    let amplitudeNumerator = (
      index * (termIndex + functionOffset + 3) + termIndex * 7 + functionOffset * 5
    ) % 13 - 6;
    if (amplitudeNumerator === 0) {
      amplitudeNumerator = (index + termIndex + functionOffset) % 2 === 0 ? 2 : -2;
    }
    return {
      functionName,
      amplitude: corpusRational(
        BigInt(amplitudeNumerator),
        BigInt(((index + termIndex * 2 + functionOffset) % 4) + 1),
      ),
      slopePi: PI_SLOPE_VALUES[
        (index * (functionOffset + 2) + termIndex * 3 + functionOffset)
          % PI_SLOPE_VALUES.length
      ],
      interceptPi: PI_SLOPE_INTERCEPTS[
        (index * 3 + termIndex * 5 + functionOffset * 2)
          % PI_SLOPE_INTERCEPTS.length
      ],
    };
  });
}

function forcePiSlopeCoverage(index, sinTerms, cosTerms, upper) {
  const selector = index % 16;
  if (selector < PI_SLOPE_STANDARD_REFERENCES.length) {
    const target = PI_SLOPE_STANDARD_REFERENCES[selector];
    const slopePi = sinTerms[0].slopePi.numerator === 0n
      ? corpusRational(selector % 2 === 0 ? 1n : -1n, BigInt((selector % 3) + 1))
      : sinTerms[0].slopePi;
    sinTerms[0] = {
      ...sinTerms[0],
      slopePi,
      interceptPi: subtractCorpusRationals(
        target,
        multiplyCorpusRationals(slopePi, upper),
      ),
    };
  } else if (selector <= 10) {
    const targets = [
      corpusRational(1n, 5n),
      corpusRational(1n, 7n),
      corpusRational(2n, 5n),
      corpusRational(3n, 11n),
    ];
    const target = targets[selector - 7];
    const slopePi = cosTerms[0].slopePi.numerator === 0n
      ? corpusRational(selector % 2 === 0 ? 1n : -1n)
      : cosTerms[0].slopePi;
    cosTerms[0] = {
      ...cosTerms[0],
      slopePi,
      interceptPi: subtractCorpusRationals(
        target,
        multiplyCorpusRationals(slopePi, upper),
      ),
    };
  } else if (selector === 11) {
    sinTerms[0] = {
      ...sinTerms[0],
      slopePi: corpusRational(0n),
      interceptPi: corpusRational(1n, 12n),
    };
  } else if (selector === 12) {
    cosTerms[0] = {
      ...cosTerms[0],
      slopePi: corpusRational(0n),
      interceptPi: corpusRational(1n, 5n),
    };
  } else if (selector === 13) {
    sinTerms[0] = {
      ...sinTerms[0],
      slopePi: corpusRational(-1n, BigInt((index % 3) + 1)),
      interceptPi: addCorpusRationals(sinTerms[0].interceptPi, corpusRational(2n)),
    };
  } else if (selector === 14) {
    cosTerms[0] = {
      ...cosTerms[0],
      interceptPi: addCorpusRationals(cosTerms[0].interceptPi, corpusRational(4n)),
    };
  } else {
    sinTerms[0] = {
      ...sinTerms[0],
      slopePi: corpusRational(-5n, 7n),
    };
  }

  if ([...sinTerms, ...cosTerms].every(({ slopePi }) => slopePi.numerator === 0n)) {
    cosTerms[0] = { ...cosTerms[0], slopePi: corpusRational(1n) };
  }
}

function addPiSlopeCancellation(index, sinTerms, cosTerms) {
  if (index % 9 === 0 && cosTerms.length >= 2) {
    const source = cosTerms[0];
    cosTerms[1] = {
      ...source,
      amplitude: negateCorpusRational(source.amplitude),
      interceptPi: addCorpusRationals(source.interceptPi, corpusRational(2n)),
    };
    return true;
  }
  if (index % 9 === 1 && sinTerms.length >= 2) {
    const source = sinTerms[0];
    sinTerms[1] = {
      ...source,
      amplitude: negateCorpusRational(source.amplitude),
      interceptPi: addCorpusRationals(source.interceptPi, corpusRational(2n)),
    };
    return true;
  }
  return false;
}

function formatPiSlopePhase(slopePi, interceptPi) {
  let expression = "";
  if (slopePi.numerator !== 0n) {
    if (equalCorpusRationals(slopePi, corpusRational(1n))) expression = "pi*x";
    else if (equalCorpusRationals(slopePi, corpusRational(-1n))) expression = "-pi*x";
    else if (slopePi.denominator === 1n) expression = `${slopePi.numerator}*pi*x`;
    else expression = `(${formatCorpusRational(slopePi)})*pi*x`;
  }
  if (interceptPi.numerator === 0n) return expression || "0*pi*x";
  const intercept = formatCorpusPiMultiple(interceptPi);
  if (!expression) return intercept;
  return interceptPi.numerator < 0n
    ? `${expression}${intercept}`
    : `${expression}+${intercept}`;
}

function formatPiSlopeIntegrandTerm(term) {
  const negative = term.amplitude.numerator < 0n;
  const magnitude = negative
    ? negateCorpusRational(term.amplitude)
    : term.amplitude;
  const coefficient = equalCorpusRationals(magnitude, corpusRational(1n))
    ? ""
    : magnitude.denominator === 1n
      ? `${magnitude.numerator}*`
      : `(${formatCorpusRational(magnitude)})*`;
  return `${negative ? "-" : ""}${coefficient}${term.functionName}(`
    + `${formatPiSlopePhase(term.slopePi, term.interceptPi)})`;
}

function piSlopeCoverage(sinTerms, cosTerms, lower, upper, cancellationPattern) {
  const terms = [...sinTerms, ...cosTerms];
  const angles = [];
  for (const term of terms) {
    const rawAngles = term.slopePi.numerator === 0n
      ? [term.interceptPi]
      : [lower, upper].map((bound) => addCorpusRationals(
        multiplyCorpusRationals(term.slopePi, bound),
        term.interceptPi,
      ));
    const evaluatedFunction = term.slopePi.numerator === 0n
      ? term.functionName
      : term.functionName === "sin" ? "cos" : "sin";
    for (const raw of rawAngles) {
      const canonical = canonicalPiSlopeAngle(evaluatedFunction, raw);
      const vector = piSlopeStandardVector(evaluatedFunction, raw);
      angles.push({
        raw,
        canonical,
        vector,
        piPower: term.slopePi.numerator === 0n ? 0 : -1,
      });
    }
  }
  const direction = compareCorpusRationals(lower, upper);
  return {
    sinCount: sinTerms.length,
    cosCount: cosTerms.length,
    intervalKind: direction < 0 ? "normal" : direction > 0 ? "reverse" : "equal",
    fractionalBounds: lower.denominator !== 1n || upper.denominator !== 1n,
    zeroSlope: terms.some(({ slopePi }) => slopePi.numerator === 0n),
    negativeSlope: terms.some(({ slopePi }) => slopePi.numerator < 0n),
    fractionalSlope: terms.some(({ slopePi }) => (
      slopePi.numerator !== 0n && slopePi.denominator !== 1n
    )),
    negativeAngle: angles.some(({ raw }) => raw.numerator < 0n),
    periodicReduction: angles.some(({ raw, canonical }) => (
      !equalCorpusRationals(raw, canonical.turn)
    )),
    quadrantReduction: angles.some(({ canonical }) => (
      !equalCorpusRationals(canonical.turn, canonical.reference)
    )),
    standardReferences: angles
      .filter(({ vector }) => vector !== null)
      .map(({ canonical }) => formatCorpusRational(canonical.reference)),
    radicands: angles.flatMap(({ vector }) => (
      vector ? vector.map(({ radicand }) => radicand) : []
    )),
    formalAtom: angles.some(({ vector }) => vector === null),
    piPowers: angles.map(({ piPower }) => piPower),
    cancellationPattern,
  };
}

function generatedPiSlopeDefiniteIntegrals() {
  return Array.from({ length: 250 }, (_, index) => {
    const [lower, upper] = generatedPiSlopeBounds(index);
    const sinTerms = generatedPiSlopeTerms(index, "sin").map((term) => ({ ...term }));
    const cosTerms = generatedPiSlopeTerms(index, "cos").map((term) => ({ ...term }));
    forcePiSlopeCoverage(index, sinTerms, cosTerms, upper);
    const cancellationPattern = addPiSlopeCancellation(index, sinTerms, cosTerms);
    let integrand = "";
    for (const term of [...sinTerms, ...cosTerms]) {
      integrand = appendCorpusExpression(integrand, formatPiSlopeIntegrandTerm(term));
    }
    return {
      family: "pi-slope-definite-integral",
      question: `\u222b_(${formatCorpusRational(lower)})^(${formatCorpusRational(upper)}) `
        + `${integrand} dx`,
      answer: piSlopeExpectedAnswer(sinTerms, cosTerms, lower, upper),
      coverage: piSlopeCoverage(
        sinTerms,
        cosTerms,
        lower,
        upper,
        cancellationPattern,
      ),
    };
  });
}

const FINITE_LIMIT_CORPUS_POINTS = Object.freeze([
  corpusRational(-3n),
  corpusRational(2n),
  corpusRational(-1n, 2n),
  corpusRational(3n, 2n),
  corpusRational(-5n, 3n),
  corpusRational(1n, 4n),
  corpusRational(-7n, 4n),
  corpusRational(5n, 2n),
  corpusRational(-2n, 3n),
  corpusRational(4n),
]);

const FINITE_LIMIT_CORPUS_DIRECTIONS = Object.freeze([
  "both",
  "left",
  "right",
  "both",
  "right",
  "left",
  "both",
  "right",
  "left",
  "both",
]);

function corpusLimitFactor(point, reverse) {
  const pointText = formatCorpusRational(point);
  return reverse
    ? `((${pointText})-x)`
    : `(x-(${pointText}))`;
}

function corpusLimitFactorPower(factor, multiplicity, repeated) {
  if (multiplicity === 0) return "1";
  if (multiplicity === 1) return factor;
  return repeated
    ? Array.from({ length: multiplicity }, () => factor).join("*")
    : `${factor}^${multiplicity}`;
}

function corpusLimitOrientationSign(reverse, multiplicity) {
  return reverse && multiplicity % 2 === 1 ? -1n : 1n;
}

function corpusLimitInfinity(sign) {
  return sign < 0 ? "-∞" : "+∞";
}

function corpusLimitExpectedAnswer({
  numeratorMultiplicity,
  denominatorMultiplicity,
  leadingRatio,
  direction,
}) {
  if (numeratorMultiplicity > denominatorMultiplicity) {
    return { answer: "0", outcomeKind: "finite" };
  }
  if (numeratorMultiplicity === denominatorMultiplicity) {
    return {
      answer: formatCorpusRational(leadingRatio),
      outcomeKind: "finite",
    };
  }

  const poleOrder = denominatorMultiplicity - numeratorMultiplicity;
  const rightSign = leadingRatio.numerator < 0n ? -1 : 1;
  const leftSign = poleOrder % 2 === 0 ? rightSign : -rightSign;
  if (direction === "left") {
    return {
      answer: corpusLimitInfinity(leftSign),
      outcomeKind: leftSign < 0 ? "negative-infinity" : "positive-infinity",
    };
  }
  if (direction === "right") {
    return {
      answer: corpusLimitInfinity(rightSign),
      outcomeKind: rightSign < 0 ? "negative-infinity" : "positive-infinity",
    };
  }
  if (leftSign === rightSign) {
    return {
      answer: corpusLimitInfinity(leftSign),
      outcomeKind: leftSign < 0 ? "negative-infinity" : "positive-infinity",
    };
  }
  return {
    answer: `存在しない（左極限=${corpusLimitInfinity(leftSign)}`
      + `、右極限=${corpusLimitInfinity(rightSign)}）`,
    outcomeKind: "does-not-exist",
  };
}

function corpusLimitApproach(point, direction) {
  const marker = direction === "left" ? "-" : direction === "right" ? "+" : "";
  return `(${formatCorpusRational(point)})${marker}`;
}

function generatedFiniteRationalLimits() {
  const cases = [];
  for (let numeratorMultiplicity = 0; numeratorMultiplicity <= 4; numeratorMultiplicity += 1) {
    for (
      let denominatorMultiplicity = 0;
      denominatorMultiplicity <= 4;
      denominatorMultiplicity += 1
    ) {
      for (let variant = 0; variant < 10; variant += 1) {
        const point = FINITE_LIMIT_CORPUS_POINTS[variant];
        const direction = FINITE_LIMIT_CORPUS_DIRECTIONS[variant];
        const numeratorReverse = variant % 4 >= 2;
        const denominatorReverse = variant % 4 === 1 || variant % 4 === 2;
        const numeratorRepeated = numeratorMultiplicity >= 2 && variant % 2 === 1;
        const denominatorRepeated = denominatorMultiplicity >= 2 && variant % 3 === 1;
        const desiredLeadingSign = variant % 2 === 0 ? 1n : -1n;
        const orientationSign = corpusLimitOrientationSign(
          numeratorReverse,
          numeratorMultiplicity,
        ) * corpusLimitOrientationSign(
          denominatorReverse,
          denominatorMultiplicity,
        );
        const numeratorMagnitude = corpusRational(
          BigInt((variant % 5) + 1),
          BigInt((variant % 3) + 1),
        );
        const denominatorCoefficient = corpusRational(
          BigInt((variant % 7) + 1),
          BigInt((variant % 4) + 1),
        );
        const numeratorCoefficient = multiplyCorpusRationals(
          numeratorMagnitude,
          corpusRational(desiredLeadingSign * orientationSign),
        );
        const leadingRatio = multiplyCorpusRationals(
          divideCorpusRationals(numeratorCoefficient, denominatorCoefficient),
          corpusRational(orientationSign),
        );
        const numeratorFactor = corpusLimitFactor(point, numeratorReverse);
        const denominatorFactor = corpusLimitFactor(point, denominatorReverse);
        const numerator = `(${formatCorpusRational(numeratorCoefficient)})*`
          + corpusLimitFactorPower(
            numeratorFactor,
            numeratorMultiplicity,
            numeratorRepeated,
          );
        const denominator = `(${formatCorpusRational(denominatorCoefficient)})*`
          + corpusLimitFactorPower(
            denominatorFactor,
            denominatorMultiplicity,
            denominatorRepeated,
          );
        const expected = corpusLimitExpectedAnswer({
          numeratorMultiplicity,
          denominatorMultiplicity,
          leadingRatio,
          direction,
        });
        const powerExponents = [];
        const repeatedExponents = [];
        if (numeratorMultiplicity >= 2 && !numeratorRepeated) {
          powerExponents.push(numeratorMultiplicity);
        }
        if (denominatorMultiplicity >= 2 && !denominatorRepeated) {
          powerExponents.push(denominatorMultiplicity);
        }
        if (numeratorRepeated) repeatedExponents.push(numeratorMultiplicity);
        if (denominatorRepeated) repeatedExponents.push(denominatorMultiplicity);
        cases.push({
          family: "finite-rational-limit",
          question: `lim_(x->${corpusLimitApproach(point, direction)}) `
            + `(${numerator})/(${denominator})`,
          answer: expected.answer,
          coverage: {
            numeratorMultiplicity,
            denominatorMultiplicity,
            direction,
            fractionalPoint: point.denominator !== 1n,
            pointSign: point.numerator < 0n ? "negative" : "positive",
            leadingRatioSign: leadingRatio.numerator < 0n ? "negative" : "positive",
            normalFactor: (
              numeratorMultiplicity > 0 && !numeratorReverse
            ) || (
              denominatorMultiplicity > 0 && !denominatorReverse
            ),
            reverseFactor: (
              numeratorMultiplicity > 0 && numeratorReverse
            ) || (
              denominatorMultiplicity > 0 && denominatorReverse
            ),
            repeatedProduct: numeratorRepeated || denominatorRepeated,
            powerExponents,
            repeatedExponents,
            outcomeKind: expected.outcomeKind,
          },
        });
      }
    }
  }
  return cases;
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
const trigonometricDefiniteIntegralCorpus = generatedTrigonometricDefiniteIntegrals();
const piAngleDefiniteIntegralCorpus = generatedPiAngleDefiniteIntegrals();
const piSlopeDefiniteIntegralCorpus = generatedPiSlopeDefiniteIntegrals();
const finiteRationalLimitCorpus = generatedFiniteRationalLimits();
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
  ...trigonometricDefiniteIntegralCorpus,
  ...piAngleDefiniteIntegralCorpus,
  ...piSlopeDefiniteIntegralCorpus,
  ...finiteRationalLimitCorpus,
];
const rejectedCorpus = generatedRejectedInputs();
export const EVALUATION_CORPUS_SIZE = positiveCorpus.length + rejectedCorpus.length;

test("4,000問の生成評価コーパスで厳密解と安全な未対応を維持する", async () => {
  assert.equal(EVALUATION_CORPUS_SIZE, 4_000);
  assert.equal(
    finiteRationalLimitCorpus.filter(({ question }) => (
      [...positiveCorpus, ...rejectedCorpus].some((item) => (
        item.family !== "finite-rational-limit" && item.question === question
      ))
    )).length,
    0,
  );
  assert.equal(exponentialDefiniteIntegralCorpus.length, 250);
  assert.equal(
    new Set(exponentialDefiniteIntegralCorpus.map(({ question }) => question)).size,
    250,
  );
  assert.equal(trigonometricDefiniteIntegralCorpus.length, 250);
  assert.equal(
    new Set(trigonometricDefiniteIntegralCorpus.map(({ question }) => question)).size,
    250,
  );
  assert.ok(trigonometricDefiniteIntegralCorpus.every(({ coverage }) => (
    coverage.polynomialNonzero
    && coverage.exponentialCount >= 1
    && coverage.sinCount >= 1
    && coverage.sinCount <= 4
    && coverage.cosCount >= 1
    && coverage.cosCount <= 4
  )));
  assert.deepEqual(
    new Set(trigonometricDefiniteIntegralCorpus.map(({ coverage }) => coverage.sinCount)),
    new Set([1, 2, 3, 4]),
  );
  assert.deepEqual(
    new Set(trigonometricDefiniteIntegralCorpus.map(({ coverage }) => coverage.cosCount)),
    new Set([1, 2, 3, 4]),
  );
  assert.deepEqual(
    new Set(trigonometricDefiniteIntegralCorpus.map(({ coverage }) => coverage.intervalKind)),
    new Set(["normal", "reverse", "equal"]),
  );
  assert.ok(trigonometricDefiniteIntegralCorpus.some(({ coverage }) => coverage.fractionalBounds));
  assert.ok(trigonometricDefiniteIntegralCorpus.some(({ coverage }) => coverage.zeroSlope));
  assert.ok(trigonometricDefiniteIntegralCorpus.some(({ coverage }) => coverage.negativeSlope));
  assert.ok(trigonometricDefiniteIntegralCorpus.some(({ coverage }) => coverage.zeroArgument));
  assert.ok(trigonometricDefiniteIntegralCorpus.some(({ coverage }) => coverage.negativeArgument));
  assert.ok(
    trigonometricDefiniteIntegralCorpus.filter(
      ({ coverage }) => coverage.crossSourceCancellation,
    ).length >= 20,
  );
  assert.equal(piAngleDefiniteIntegralCorpus.length, 250);
  assert.equal(
    new Set(piAngleDefiniteIntegralCorpus.map(({ question }) => question)).size,
    250,
  );
  assert.ok(piAngleDefiniteIntegralCorpus.every(({ coverage }) => (
    coverage.sinCount >= 1
    && coverage.sinCount <= 4
    && coverage.cosCount >= 1
    && coverage.cosCount <= 4
  )));
  assert.deepEqual(
    new Set(piAngleDefiniteIntegralCorpus.map(({ coverage }) => coverage.sinCount)),
    new Set([1, 2, 3, 4]),
  );
  assert.deepEqual(
    new Set(piAngleDefiniteIntegralCorpus.map(({ coverage }) => coverage.cosCount)),
    new Set([1, 2, 3, 4]),
  );
  assert.deepEqual(
    new Set(piAngleDefiniteIntegralCorpus.map(({ coverage }) => coverage.intervalKind)),
    new Set(["normal", "reverse", "equal"]),
  );
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.fractionalBounds));
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.zeroSlope));
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.negativeSlope));
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.negativeAngle));
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.periodicReduction));
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.complementaryReduction));
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.formalAtom));
  assert.ok(piAngleDefiniteIntegralCorpus.some(({ coverage }) => coverage.piPower));
  assert.ok(
    piAngleDefiniteIntegralCorpus.filter(
      ({ coverage }) => coverage.cancellationPattern,
    ).length >= 20,
  );
  assert.deepEqual(
    new Set(piAngleDefiniteIntegralCorpus.flatMap(
      ({ coverage }) => coverage.standardReferences,
    )),
    new Set(["0", "1/12", "1/6", "1/4", "1/3", "5/12", "1/2"]),
  );
  assert.deepEqual(
    new Set(piAngleDefiniteIntegralCorpus.flatMap(({ coverage }) => coverage.radicands)),
    new Set([1, 2, 3, 6]),
  );
  assert.equal(piSlopeDefiniteIntegralCorpus.length, 250);
  assert.equal(
    new Set(piSlopeDefiniteIntegralCorpus.map(({ question }) => question)).size,
    250,
  );
  assert.ok(piSlopeDefiniteIntegralCorpus.every(({ coverage }) => (
    coverage.sinCount >= 1
    && coverage.sinCount <= 3
    && coverage.cosCount >= 1
    && coverage.cosCount <= 3
  )));
  assert.deepEqual(
    new Set(piSlopeDefiniteIntegralCorpus.map(({ coverage }) => coverage.sinCount)),
    new Set([1, 2, 3]),
  );
  assert.deepEqual(
    new Set(piSlopeDefiniteIntegralCorpus.map(({ coverage }) => coverage.cosCount)),
    new Set([1, 2, 3]),
  );
  assert.deepEqual(
    new Set(piSlopeDefiniteIntegralCorpus.map(({ coverage }) => coverage.intervalKind)),
    new Set(["normal", "reverse", "equal"]),
  );
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.fractionalBounds));
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.zeroSlope));
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.negativeSlope));
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.fractionalSlope));
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.negativeAngle));
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.periodicReduction));
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.quadrantReduction));
  assert.ok(piSlopeDefiniteIntegralCorpus.some(({ coverage }) => coverage.formalAtom));
  assert.ok(
    piSlopeDefiniteIntegralCorpus.filter(
      ({ coverage }) => coverage.cancellationPattern,
    ).length >= 20,
  );
  assert.deepEqual(
    new Set(piSlopeDefiniteIntegralCorpus.flatMap(
      ({ coverage }) => coverage.standardReferences,
    )),
    new Set(["0", "1/12", "1/6", "1/4", "1/3", "5/12", "1/2"]),
  );
  assert.deepEqual(
    new Set(piSlopeDefiniteIntegralCorpus.flatMap(({ coverage }) => coverage.radicands)),
    new Set([1, 2, 3, 6]),
  );
  assert.deepEqual(
    new Set(piSlopeDefiniteIntegralCorpus.flatMap(({ coverage }) => coverage.piPowers)),
    new Set([-1, 0]),
  );
  assert.equal(finiteRationalLimitCorpus.length, 250);
  assert.equal(
    new Set(finiteRationalLimitCorpus.map(({ question }) => question)).size,
    250,
  );
  for (let numeratorMultiplicity = 0; numeratorMultiplicity <= 4; numeratorMultiplicity += 1) {
    for (
      let denominatorMultiplicity = 0;
      denominatorMultiplicity <= 4;
      denominatorMultiplicity += 1
    ) {
      const multiplicityCases = finiteRationalLimitCorpus.filter(({ coverage }) => (
        coverage.numeratorMultiplicity === numeratorMultiplicity
        && coverage.denominatorMultiplicity === denominatorMultiplicity
      ));
      assert.equal(
        multiplicityCases.length,
        10,
      );
      assert.deepEqual(
        new Set(multiplicityCases.map(({ coverage }) => coverage.direction)),
        new Set(["both", "left", "right"]),
      );
      assert.deepEqual(
        new Set(multiplicityCases.map(({ coverage }) => coverage.pointSign)),
        new Set(["negative", "positive"]),
      );
      assert.ok(multiplicityCases.some(({ coverage }) => coverage.fractionalPoint));
      assert.deepEqual(
        new Set(multiplicityCases.map(({ coverage }) => coverage.leadingRatioSign)),
        new Set(["negative", "positive"]),
      );
      if (numeratorMultiplicity + denominatorMultiplicity > 0) {
        assert.ok(multiplicityCases.some(({ coverage }) => coverage.normalFactor));
        assert.ok(multiplicityCases.some(({ coverage }) => coverage.reverseFactor));
      }
    }
  }
  assert.deepEqual(
    new Set(finiteRationalLimitCorpus.map(({ coverage }) => coverage.direction)),
    new Set(["both", "left", "right"]),
  );
  assert.deepEqual(
    new Set(finiteRationalLimitCorpus.map(({ coverage }) => coverage.pointSign)),
    new Set(["negative", "positive"]),
  );
  assert.ok(finiteRationalLimitCorpus.some(({ coverage }) => coverage.fractionalPoint));
  assert.deepEqual(
    new Set(finiteRationalLimitCorpus.map(({ coverage }) => coverage.leadingRatioSign)),
    new Set(["negative", "positive"]),
  );
  assert.ok(finiteRationalLimitCorpus.some(({ coverage }) => coverage.normalFactor));
  assert.ok(finiteRationalLimitCorpus.some(({ coverage }) => coverage.reverseFactor));
  assert.ok(finiteRationalLimitCorpus.some(({ coverage }) => coverage.repeatedProduct));
  assert.deepEqual(
    new Set(finiteRationalLimitCorpus.flatMap(({ coverage }) => coverage.powerExponents)),
    new Set([2, 3, 4]),
  );
  assert.deepEqual(
    new Set(finiteRationalLimitCorpus.flatMap(({ coverage }) => coverage.repeatedExponents)),
    new Set([2, 3, 4]),
  );
  assert.deepEqual(
    new Set(finiteRationalLimitCorpus.map(({ coverage }) => coverage.outcomeKind)),
    new Set([
      "finite",
      "positive-infinity",
      "negative-infinity",
      "does-not-exist",
    ]),
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
