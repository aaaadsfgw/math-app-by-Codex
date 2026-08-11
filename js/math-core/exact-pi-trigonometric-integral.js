import {
  ExactLinearPi,
  ExactLinearPiError,
  exactLinearPiConstantFromAst,
} from "./exact-linear-pi.js";
import {
  ExactPolynomialIntegralError,
  exactRationalConstantFromAst,
} from "./exact-polynomial-integral.js";
import { ExactRational } from "./exact-rational.js";

const MAX_PI_TRIGONOMETRIC_TERMS = 32;
const ZERO = ExactRational.zero();
const ONE = ExactRational.one();
const NEGATIVE_ONE = new ExactRational(-1n);
const HALF = new ExactRational(1n, 2n);
const ONE_TWELFTH = new ExactRational(1n, 12n);
const ONE_SIXTH = new ExactRational(1n, 6n);
const ONE_QUARTER = new ExactRational(1n, 4n);
const ONE_THIRD = new ExactRational(1n, 3n);
const FIVE_TWELFTHS = new ExactRational(5n, 12n);

export class ExactPiTrigonometricIntegralError extends Error {
  constructor(message, {
    code = "EXACT_PI_TRIGONOMETRIC_INTEGRAL_ERROR",
    unsupported = false,
  } = {}) {
    super(message);
    this.name = "ExactPiTrigonometricIntegralError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function unsupported(message, code) {
  throw new ExactPiTrigonometricIntegralError(message, { code, unsupported: true });
}

function zeroAngle() {
  return new ExactLinearPi(ZERO, ZERO);
}

function piAngle(coefficient) {
  return new ExactLinearPi(ZERO, coefficient);
}

function compareRationals(left, right) {
  const difference = left.numerator * right.denominator
    - right.numerator * left.denominator;
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

function tryExactRational(node) {
  try {
    return exactRationalConstantFromAst(node);
  } catch (error) {
    if (error instanceof ExactPolynomialIntegralError && error.unsupported) return null;
    throw error;
  }
}

function tryExactLinearPiConstant(node) {
  try {
    return exactLinearPiConstantFromAst(node);
  } catch (error) {
    if (error instanceof ExactLinearPiError && error.unsupported) return null;
    if (error instanceof ExactLinearPiError) {
      throw new ExactPiTrigonometricIntegralError(error.message, { code: error.code });
    }
    throw error;
  }
}

function phaseForm(slope = ZERO, intercept = zeroAngle()) {
  return Object.freeze({ slope, intercept });
}

function addPhaseForms(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return phaseForm(
    left.slope.add(right.slope.multiply(multiplier)),
    left.intercept.add(right.intercept.scale(multiplier)),
  );
}

function scalePhaseForm(value, scalar) {
  return phaseForm(
    value.slope.multiply(scalar),
    value.intercept.scale(scalar),
  );
}

function analyzePiAffinePhase(node) {
  const constant = tryExactLinearPiConstant(node);
  if (constant) return phaseForm(ZERO, constant);

  if (node?.type === "symbol" && node.name === "x") {
    return phaseForm(ONE, zeroAngle());
  }
  if (node?.type === "unary") {
    const value = analyzePiAffinePhase(node.argument);
    return node.operator === "-" ? scalePhaseForm(value, NEGATIVE_ONE) : value;
  }
  if (node?.type === "binary") {
    if (node.operator === "+" || node.operator === "-") {
      return addPhaseForms(
        analyzePiAffinePhase(node.left),
        analyzePiAffinePhase(node.right),
        node.operator === "-" ? -1n : 1n,
      );
    }
    if (node.operator === "*") {
      const leftScalar = tryExactRational(node.left);
      if (leftScalar) {
        return scalePhaseForm(analyzePiAffinePhase(node.right), leftScalar);
      }
      const rightScalar = tryExactRational(node.right);
      if (rightScalar) {
        return scalePhaseForm(analyzePiAffinePhase(node.left), rightScalar);
      }
      unsupported(
        "pi角の傾きは有理数にし、piは位相定数だけに使用してください。",
        "NON_RATIONAL_PI_SLOPE",
      );
    }
    if (node.operator === "/") {
      const denominator = tryExactRational(node.right);
      if (!denominator) {
        unsupported(
          "pi角の一次式は0でない有理数だけで割ってください。",
          "NON_RATIONAL_PHASE_DENOMINATOR",
        );
      }
      if (denominator.isZero()) {
        throw new ExactPiTrigonometricIntegralError("0では割れません。", {
          code: "DIVISION_BY_ZERO",
        });
      }
      return scalePhaseForm(
        analyzePiAffinePhase(node.left),
        ONE.divide(denominator),
      );
    }
  }

  unsupported(
    "pi境界のsin・cos引数は、有理傾きの一次式 ax+b*pi にしてください。",
    "NON_AFFINE_PI_PHASE",
  );
}

function affinePiPhase(node) {
  const value = analyzePiAffinePhase(node);
  if (!value.intercept.rationalPart.isZero()) {
    unsupported(
      "pi境界ではsin・cosの位相定数も有理数倍piにしてください。",
      "MIXED_RADIAN_PI_PHASE",
    );
  }
  return value;
}

function linearPiAffineForm({
  slope = zeroAngle(),
  intercept = zeroAngle(),
  xBearing = false,
  piBearing = false,
} = {}) {
  return Object.freeze({
    slope,
    intercept,
    xBearing: xBearing === true,
    piBearing: piBearing === true,
  });
}

function addLinearPiAffineForms(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return linearPiAffineForm({
    slope: left.slope.add(right.slope.scale(multiplier)),
    intercept: left.intercept.add(right.intercept.scale(multiplier)),
    xBearing: left.xBearing || right.xBearing,
    piBearing: left.piBearing || right.piBearing,
  });
}

function scaleLinearPiAffineForm(value, scalar) {
  return linearPiAffineForm({
    slope: value.slope.scale(scalar),
    intercept: value.intercept.scale(scalar),
    xBearing: value.xBearing,
    piBearing: value.piBearing,
  });
}

function multiplyLinearPiValues(left, right) {
  return new ExactLinearPi(
    left.rationalPart.multiply(right.rationalPart),
    left.rationalPart.multiply(right.piCoefficient)
      .add(left.piCoefficient.multiply(right.rationalPart)),
  );
}

function multiplyLinearPiAffineForms(left, right) {
  if (left.xBearing && right.xBearing) {
    unsupported(
      "pi傾きの三角関数引数にx同士の積や2次以上の項は使えません。",
      "NON_AFFINE_PI_SLOPE_PHASE",
    );
  }
  if (left.piBearing && right.piBearing) {
    unsupported(
      "pi傾きの三角関数引数にpi同士の積やpiの2次以上の項は使えません。",
      "NONLINEAR_PI_SLOPE_PHASE",
    );
  }
  return linearPiAffineForm({
    slope: multiplyLinearPiValues(left.slope, right.intercept)
      .add(multiplyLinearPiValues(left.intercept, right.slope)),
    intercept: multiplyLinearPiValues(left.intercept, right.intercept),
    xBearing: left.xBearing || right.xBearing,
    piBearing: left.piBearing || right.piBearing,
  });
}

function analyzeLinearPiAffinePhase(node) {
  const rational = tryExactRational(node);
  if (rational) {
    return linearPiAffineForm({
      intercept: new ExactLinearPi(rational, ZERO),
    });
  }

  if (node?.type === "constant" && node.name === "pi") {
    return linearPiAffineForm({ intercept: piAngle(ONE), piBearing: true });
  }
  if (node?.type === "symbol" && node.name === "x") {
    return linearPiAffineForm({
      slope: new ExactLinearPi(ONE, ZERO),
      xBearing: true,
    });
  }
  if (node?.type === "unary") {
    const value = analyzeLinearPiAffinePhase(node.argument);
    return node.operator === "-"
      ? scaleLinearPiAffineForm(value, NEGATIVE_ONE)
      : value;
  }
  if (node?.type === "binary") {
    if (node.operator === "+" || node.operator === "-") {
      return addLinearPiAffineForms(
        analyzeLinearPiAffinePhase(node.left),
        analyzeLinearPiAffinePhase(node.right),
        node.operator === "-" ? -1n : 1n,
      );
    }
    if (node.operator === "*") {
      return multiplyLinearPiAffineForms(
        analyzeLinearPiAffinePhase(node.left),
        analyzeLinearPiAffinePhase(node.right),
      );
    }
    if (node.operator === "/") {
      const numerator = analyzeLinearPiAffinePhase(node.left);
      const denominator = analyzeLinearPiAffinePhase(node.right);
      if (
        denominator.xBearing
        || denominator.piBearing
        || !denominator.slope.isZero()
        || !denominator.intercept.isRational()
      ) {
        unsupported(
          "pi傾きの一次式は0でない有理数だけで割ってください。",
          "NON_RATIONAL_PI_SLOPE_DENOMINATOR",
        );
      }
      if (denominator.intercept.rationalPart.isZero()) {
        throw new ExactPiTrigonometricIntegralError("0では割れません。", {
          code: "DIVISION_BY_ZERO",
        });
      }
      return scaleLinearPiAffineForm(
        numerator,
        ONE.divide(denominator.intercept.rationalPart),
      );
    }
    if (node.operator === "^") {
      const base = analyzeLinearPiAffinePhase(node.left);
      const exponent = tryExactRational(node.right);
      if (
        exponent
        && exponent.denominator === 1n
        && exponent.numerator === 1n
      ) {
        return base;
      }
      unsupported(
        "pi傾きの三角関数引数では、xやpiを含む式の累乗を扱いません。",
        "UNSUPPORTED_PI_SLOPE_POWER",
      );
    }
  }

  unsupported(
    "pi傾きのsin・cos引数は、a*pi*x+b*pi（a,bは有理数）の一次式にしてください。",
    "NON_AFFINE_PI_SLOPE_PHASE",
  );
}

function affinePiSlopePhase(node) {
  const value = analyzeLinearPiAffinePhase(node);
  if (!value.slope.rationalPart.isZero()) {
    unsupported(
      "有理数区間のpi角ルートでは、非零傾きを有理数倍piに統一してください。",
      "MIXED_RATIONAL_PI_SLOPE",
    );
  }
  if (!value.intercept.rationalPart.isZero()) {
    unsupported(
      "有理数区間のpi角ルートでは、位相定数も有理数倍piにしてください。",
      "MIXED_RADIAN_PI_PHASE",
    );
  }
  return phaseForm(value.slope.piCoefficient, value.intercept);
}

function analysis(trigonometric = []) {
  const filtered = trigonometric.filter(({ amplitude }) => !amplitude.isZero());
  const sineCount = filtered.filter(({ functionName }) => functionName === "sin").length;
  const cosineCount = filtered.filter(({ functionName }) => functionName === "cos").length;
  if (
    sineCount > MAX_PI_TRIGONOMETRIC_TERMS
    || cosineCount > MAX_PI_TRIGONOMETRIC_TERMS
  ) {
    unsupported(
      `pi角のsin・cos項はそれぞれ${MAX_PI_TRIGONOMETRIC_TERMS}個以下にしてください。`,
      "TOO_MANY_PI_TRIGONOMETRIC_TERMS",
    );
  }
  return Object.freeze({
    trigonometric: Object.freeze(filtered.map((term) => Object.freeze(term))),
  });
}

function combineAnalyses(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return analysis([
    ...left.trigonometric,
    ...right.trigonometric.map((term) => ({
      ...term,
      amplitude: term.amplitude.multiply(multiplier),
    })),
  ]);
}

function scaleAnalysis(value, scalar) {
  return analysis(value.trigonometric.map((term) => ({
    ...term,
    amplitude: term.amplitude.multiply(scalar),
  })));
}

export function analyzeExactPiTrigonometricIntegrand(node) {
  if (
    node?.type === "call"
    && ["sin", "cos"].includes(node.name)
    && node.args.length === 1
  ) {
    const phase = affinePiPhase(node.args[0]);
    return analysis([{
      functionName: node.name,
      amplitude: ONE,
      slope: phase.slope,
      intercept: phase.intercept,
    }]);
  }
  if (node?.type === "unary") {
    const value = analyzeExactPiTrigonometricIntegrand(node.argument);
    return node.operator === "-" ? scaleAnalysis(value, NEGATIVE_ONE) : value;
  }
  if (node?.type === "binary") {
    if (node.operator === "+" || node.operator === "-") {
      return combineAnalyses(
        analyzeExactPiTrigonometricIntegrand(node.left),
        analyzeExactPiTrigonometricIntegrand(node.right),
        node.operator === "-" ? -1n : 1n,
      );
    }
    if (node.operator === "*") {
      const leftScalar = tryExactRational(node.left);
      if (leftScalar) {
        return scaleAnalysis(analyzeExactPiTrigonometricIntegrand(node.right), leftScalar);
      }
      const rightScalar = tryExactRational(node.right);
      if (rightScalar) {
        return scaleAnalysis(analyzeExactPiTrigonometricIntegrand(node.left), rightScalar);
      }
      unsupported(
        "pi境界ではsin・cosとxや別の関数との積を扱いません。",
        "UNSUPPORTED_PI_TRIGONOMETRIC_PRODUCT",
      );
    }
    if (node.operator === "/") {
      const denominator = tryExactRational(node.right);
      if (!denominator) {
        unsupported(
          "pi境界のsin・cos和は0でない有理数だけで割ってください。",
          "UNSUPPORTED_PI_TRIGONOMETRIC_DENOMINATOR",
        );
      }
      if (denominator.isZero()) {
        throw new ExactPiTrigonometricIntegralError("0では割れません。", {
          code: "DIVISION_BY_ZERO",
        });
      }
      return scaleAnalysis(
        analyzeExactPiTrigonometricIntegrand(node.left),
        ONE.divide(denominator),
      );
    }
  }

  unsupported(
    "pi境界では、有理係数・有理傾き・有理数倍pi位相のsin・cos有限和だけに対応しています。",
    "UNSUPPORTED_PI_TRIGONOMETRIC_FORM",
  );
}

export function analyzeExactPiSlopeTrigonometricIntegrand(node) {
  if (
    node?.type === "call"
    && ["sin", "cos"].includes(node.name)
    && node.args.length === 1
  ) {
    const phase = affinePiSlopePhase(node.args[0]);
    return analysis([{
      functionName: node.name,
      amplitude: ONE,
      slope: phase.slope,
      intercept: phase.intercept,
    }]);
  }
  if (node?.type === "unary") {
    const value = analyzeExactPiSlopeTrigonometricIntegrand(node.argument);
    return node.operator === "-" ? scaleAnalysis(value, NEGATIVE_ONE) : value;
  }
  if (node?.type === "binary") {
    if (node.operator === "+" || node.operator === "-") {
      return combineAnalyses(
        analyzeExactPiSlopeTrigonometricIntegrand(node.left),
        analyzeExactPiSlopeTrigonometricIntegrand(node.right),
        node.operator === "-" ? -1n : 1n,
      );
    }
    if (node.operator === "*") {
      const leftScalar = tryExactRational(node.left);
      if (leftScalar) {
        return scaleAnalysis(
          analyzeExactPiSlopeTrigonometricIntegrand(node.right),
          leftScalar,
        );
      }
      const rightScalar = tryExactRational(node.right);
      if (rightScalar) {
        return scaleAnalysis(
          analyzeExactPiSlopeTrigonometricIntegrand(node.left),
          rightScalar,
        );
      }
      unsupported(
        "pi傾きのsin・cosとxや別の関数との積を扱いません。",
        "UNSUPPORTED_PI_SLOPE_TRIGONOMETRIC_PRODUCT",
      );
    }
    if (node.operator === "/") {
      const denominator = tryExactRational(node.right);
      if (!denominator) {
        unsupported(
          "pi傾きのsin・cos和は0でない有理数だけで割ってください。",
          "UNSUPPORTED_PI_SLOPE_TRIGONOMETRIC_DENOMINATOR",
        );
      }
      if (denominator.isZero()) {
        throw new ExactPiTrigonometricIntegralError("0では割れません。", {
          code: "DIVISION_BY_ZERO",
        });
      }
      return scaleAnalysis(
        analyzeExactPiSlopeTrigonometricIntegrand(node.left),
        ONE.divide(denominator),
      );
    }
  }

  unsupported(
    "有理数区間のpi角ルートは、有理係数・pure-pi傾き・pure-pi位相のsin・cos有限和だけに対応しています。",
    "UNSUPPORTED_PI_SLOPE_TRIGONOMETRIC_FORM",
  );
}

function euclideanPiTurn(coefficient) {
  const modulus = 2n * coefficient.denominator;
  const numerator = ((coefficient.numerator % modulus) + modulus) % modulus;
  return new ExactRational(numerator, coefficient.denominator);
}

function firstQuadrant(functionName, coefficient) {
  const turn = euclideanPiTurn(coefficient);
  const one = ONE;
  const threeHalves = new ExactRational(3n, 2n);
  if (compareRationals(turn, HALF) <= 0) {
    return { reference: turn, sign: 1n };
  }
  if (compareRationals(turn, one) <= 0) {
    return {
      reference: one.subtract(turn),
      sign: functionName === "sin" ? 1n : -1n,
    };
  }
  if (compareRationals(turn, threeHalves) <= 0) {
    return {
      reference: turn.subtract(one),
      sign: -1n,
    };
  }
  return {
    reference: new ExactRational(2n).subtract(turn),
    sign: functionName === "sin" ? -1n : 1n,
  };
}

function specialAngleVector(functionName, reference) {
  const key = reference.toString();
  const quarter = new ExactRational(1n, 4n);
  const negativeQuarter = quarter.negate();
  const vectors = functionName === "sin"
    ? new Map([
      ["0", []],
      [ONE_TWELFTH.toString(), [[6, quarter], [2, negativeQuarter]]],
      [ONE_SIXTH.toString(), [[1, HALF]]],
      [ONE_QUARTER.toString(), [[2, HALF]]],
      [ONE_THIRD.toString(), [[3, HALF]]],
      [FIVE_TWELFTHS.toString(), [[6, quarter], [2, quarter]]],
      [HALF.toString(), [[1, ONE]]],
    ])
    : new Map([
      ["0", [[1, ONE]]],
      [ONE_TWELFTH.toString(), [[6, quarter], [2, quarter]]],
      [ONE_SIXTH.toString(), [[3, HALF]]],
      [ONE_QUARTER.toString(), [[2, HALF]]],
      [ONE_THIRD.toString(), [[1, HALF]]],
      [FIVE_TWELFTHS.toString(), [[6, quarter], [2, negativeQuarter]]],
      [HALF.toString(), []],
    ]);
  return vectors.has(key) ? vectors.get(key) : null;
}

function normalizedFunctionEntries({
  functionName,
  argument,
  coefficient,
  piPower = 0,
}) {
  if (coefficient.isZero()) return [];
  if (![-1, 0, 1].includes(piPower)) {
    throw new TypeError("pi角の厳密basisに使用できないpi次数です。");
  }
  if (!(argument instanceof ExactLinearPi) || !argument.isPurePi()) {
    throw new TypeError("pi角のformal atomには有理数倍piの引数が必要です。");
  }
  const quadrant = firstQuadrant(functionName, argument.piCoefficient);
  const signedCoefficient = coefficient.multiply(new ExactRational(quadrant.sign));
  const vector = specialAngleVector(functionName, quadrant.reference);
  if (vector) {
    return vector.map(([radicand, factor]) => ({
      kind: "scalar",
      argument: null,
      piPower,
      radicand,
      coefficient: signedCoefficient.multiply(factor),
    }));
  }
  return [{
    kind: functionName,
    argument: piAngle(quadrant.reference),
    piPower,
    radicand: 1,
    coefficient: signedCoefficient,
  }];
}

function exactPiElementarySum(entries) {
  const combined = new Map();
  for (const entry of entries) {
    if (!(entry.coefficient instanceof ExactRational) || entry.coefficient.isZero()) continue;
    const argumentKey = entry.kind === "scalar" ? "scalar" : entry.argument.key();
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
        ? previous.coefficient.add(entry.coefficient)
        : entry.coefficient,
    });
  }
  const groupOrder = Object.freeze({ scalar: 0, sin: 1, cos: 2 });
  const radicalOrder = Object.freeze({ 1: 0, 6: 1, 3: 2, 2: 3 });
  const terms = [...combined.values()]
    .filter(({ coefficient }) => !coefficient.isZero())
    .sort((left, right) => {
      const leftNegative = left.coefficient.numerator < 0n;
      const rightNegative = right.coefficient.numerator < 0n;
      if (leftNegative !== rightNegative) return leftNegative ? 1 : -1;
      const group = groupOrder[left.kind] - groupOrder[right.kind];
      if (group) return group;
      if (left.kind !== "scalar") {
        const argument = -compareRationals(
          left.argument.piCoefficient,
          right.argument.piCoefficient,
        );
        if (argument) return argument;
      }
      if (left.piPower !== right.piPower) return left.piPower - right.piPower;
      return radicalOrder[left.radicand] - radicalOrder[right.radicand];
    })
    .map((term) => Object.freeze(term));
  return Object.freeze({ terms: Object.freeze(terms) });
}

function magnitudeText(term, magnitude) {
  const numeratorFactors = [];
  const denominatorFactors = [];
  if (magnitude.numerator !== 1n) {
    numeratorFactors.push(magnitude.numerator.toString());
  }
  if (magnitude.denominator !== 1n) {
    denominatorFactors.push(magnitude.denominator.toString());
  }
  if (term.piPower > 0) {
    numeratorFactors.push(term.piPower === 1 ? "pi" : `pi^${term.piPower}`);
  } else if (term.piPower < 0) {
    const exponent = -term.piPower;
    denominatorFactors.push(exponent === 1 ? "pi" : `pi^${exponent}`);
  }
  if (term.radicand !== 1) numeratorFactors.push(`√${term.radicand}`);
  if (term.kind !== "scalar") {
    numeratorFactors.push(`${term.kind}(${term.argument})`);
  }
  const numerator = numeratorFactors.join("*") || "1";
  if (!denominatorFactors.length) return numerator;
  const denominator = denominatorFactors.join("*");
  return denominatorFactors.length === 1
    ? `${numerator}/${denominator}`
    : `${numerator}/(${denominator})`;
}

export function formatExactPiElementarySum(value) {
  if (!value || !Array.isArray(value.terms)) {
    throw new TypeError("厳密なpi角初等関数和が必要です。");
  }
  for (const term of value.terms) {
    const validKind = ["scalar", "sin", "cos"].includes(term?.kind);
    const validArgument = term?.kind === "scalar"
      ? term.argument === null
      : term?.argument instanceof ExactLinearPi && term.argument.isPurePi();
    if (
      !validKind
      || !validArgument
      || !(term.coefficient instanceof ExactRational)
      || ![-1, 0, 1].includes(term.piPower)
      || ![1, 2, 3, 6].includes(term.radicand)
    ) {
      throw new TypeError("pi角初等関数和の項が厳密basisの形式ではありません。");
    }
  }
  if (!value.terms.length) return "0";
  return value.terms.map((term, index) => {
    const negative = term.coefficient.numerator < 0n;
    const magnitude = negative ? term.coefficient.negate() : term.coefficient;
    const body = magnitudeText(term, magnitude);
    if (index === 0) return `${negative ? "-" : ""}${body}`;
    return `${negative ? "-" : "+"}${body}`;
  }).join("");
}

function phaseText(slope, intercept) {
  const slopeText = slope.isZero()
    ? ""
    : slope.equals(ONE)
      ? "x"
      : slope.equals(NEGATIVE_ONE)
        ? "-x"
        : slope.denominator === 1n
          ? `${slope}*x`
          : `(${slope})*x`;
  if (intercept.isZero()) return slopeText || "0";
  if (!slopeText) return intercept.toString();
  const interceptText = intercept.toString();
  return intercept.piCoefficient.numerator < 0n
    ? `${slopeText}${interceptText}`
    : `${slopeText}+${interceptText}`;
}

function primitiveTermText(coefficient, body) {
  if (coefficient.equals(ONE)) return body;
  if (coefficient.equals(NEGATIVE_ONE)) return `-${body}`;
  return coefficient.denominator === 1n
    ? `${coefficient}*${body}`
    : `(${coefficient})*${body}`;
}

function antiderivativeTerm(term) {
  if (term.slope.isZero()) {
    return primitiveTermText(
      term.amplitude,
      `${term.functionName}(${term.intercept})*x`,
    );
  }
  const quotient = term.amplitude.divide(term.slope);
  if (!quotient.multiply(term.slope).equals(term.amplitude)) {
    throw new ExactPiTrigonometricIntegralError(
      "pi角三角関数の原始関数係数を厳密に検算できませんでした。",
      { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
    );
  }
  const coefficient = term.functionName === "sin" ? quotient.negate() : quotient;
  const primitiveFunction = term.functionName === "sin" ? "cos" : "sin";
  return primitiveTermText(
    coefficient,
    `${primitiveFunction}(${phaseText(term.slope, term.intercept)})`,
  );
}

function endpointAngle(term, bound) {
  return piAngle(
    term.slope.multiply(bound.piCoefficient).add(term.intercept.piCoefficient),
  );
}

function appendTermEntries(entries, term, lower, upper) {
  if (term.slope.isZero()) {
    entries.push(...normalizedFunctionEntries({
      functionName: term.functionName,
      argument: term.intercept,
      coefficient: term.amplitude.multiply(
        upper.piCoefficient.subtract(lower.piCoefficient),
      ),
      piPower: 1,
    }));
    return;
  }
  const quotient = term.amplitude.divide(term.slope);
  if (!quotient.multiply(term.slope).equals(term.amplitude)) {
    throw new ExactPiTrigonometricIntegralError(
      "pi角三角関数の原始関数係数を厳密に検算できませんでした。",
      { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
    );
  }
  const upperAngle = endpointAngle(term, upper);
  const lowerAngle = endpointAngle(term, lower);
  if (term.functionName === "sin") {
    entries.push(...normalizedFunctionEntries({
      functionName: "cos",
      argument: upperAngle,
      coefficient: quotient.negate(),
    }));
    entries.push(...normalizedFunctionEntries({
      functionName: "cos",
      argument: lowerAngle,
      coefficient: quotient,
    }));
    return;
  }
  entries.push(...normalizedFunctionEntries({
    functionName: "sin",
    argument: upperAngle,
    coefficient: quotient,
  }));
  entries.push(...normalizedFunctionEntries({
    functionName: "sin",
    argument: lowerAngle,
    coefficient: quotient.negate(),
  }));
}

function piSlopePhaseText(slope, intercept) {
  const slopeText = slope.isZero()
    ? ""
    : slope.equals(ONE)
      ? "pi*x"
      : slope.equals(NEGATIVE_ONE)
        ? "-pi*x"
        : `(${piAngle(slope)})*x`;
  if (intercept.isZero()) return slopeText || "0";
  if (!slopeText) return intercept.toString();
  const interceptText = intercept.toString();
  return intercept.piCoefficient.numerator < 0n
    ? `${slopeText}${interceptText}`
    : `${slopeText}+${interceptText}`;
}

function inversePiPrimitiveTermText(coefficient, body) {
  const negative = coefficient.numerator < 0n;
  const magnitude = negative ? coefficient.negate() : coefficient;
  const numerator = magnitude.numerator === 1n
    ? body
    : `${magnitude.numerator}*${body}`;
  const denominator = magnitude.denominator === 1n
    ? "pi"
    : `(${magnitude.denominator}*pi)`;
  return `${negative ? "-" : ""}${numerator}/${denominator}`;
}

function piSlopeAntiderivativeTerm(term) {
  if (term.slope.isZero()) {
    return primitiveTermText(
      term.amplitude,
      `${term.functionName}(${term.intercept})*x`,
    );
  }
  const quotient = term.amplitude.divide(term.slope);
  if (!quotient.multiply(term.slope).equals(term.amplitude)) {
    throw new ExactPiTrigonometricIntegralError(
      "pi傾き三角関数の原始関数係数を厳密に検算できませんでした。",
      { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
    );
  }
  const coefficient = term.functionName === "sin" ? quotient.negate() : quotient;
  const primitiveFunction = term.functionName === "sin" ? "cos" : "sin";
  return inversePiPrimitiveTermText(
    coefficient,
    `${primitiveFunction}(${piSlopePhaseText(term.slope, term.intercept)})`,
  );
}

function piSlopeEndpointAngle(term, bound) {
  return piAngle(
    term.slope.multiply(bound).add(term.intercept.piCoefficient),
  );
}

function appendPiSlopeTermEntries(entries, term, lower, upper) {
  if (term.slope.isZero()) {
    entries.push(...normalizedFunctionEntries({
      functionName: term.functionName,
      argument: term.intercept,
      coefficient: term.amplitude.multiply(upper.subtract(lower)),
    }));
    return;
  }
  const quotient = term.amplitude.divide(term.slope);
  if (!quotient.multiply(term.slope).equals(term.amplitude)) {
    throw new ExactPiTrigonometricIntegralError(
      "pi傾き三角関数の原始関数係数を厳密に検算できませんでした。",
      { code: "PRIMITIVE_COEFFICIENT_CHECK_FAILED" },
    );
  }
  const upperAngle = piSlopeEndpointAngle(term, upper);
  const lowerAngle = piSlopeEndpointAngle(term, lower);
  if (term.functionName === "sin") {
    entries.push(...normalizedFunctionEntries({
      functionName: "cos",
      argument: upperAngle,
      coefficient: quotient.negate(),
      piPower: -1,
    }));
    entries.push(...normalizedFunctionEntries({
      functionName: "cos",
      argument: lowerAngle,
      coefficient: quotient,
      piPower: -1,
    }));
    return;
  }
  entries.push(...normalizedFunctionEntries({
    functionName: "sin",
    argument: upperAngle,
    coefficient: quotient,
    piPower: -1,
  }));
  entries.push(...normalizedFunctionEntries({
    functionName: "sin",
    argument: lowerAngle,
    coefficient: quotient.negate(),
    piPower: -1,
  }));
}

export function evaluateExactPiSlopeTrigonometricIntegral(node, lower, upper) {
  if (!(lower instanceof ExactRational) || !(upper instanceof ExactRational)) {
    throw new TypeError("pi傾き三角関数の上下限は厳密分数で指定してください。");
  }
  const analyzed = analyzeExactPiSlopeTrigonometricIntegrand(node);
  const entries = [];
  for (const term of analyzed.trigonometric) {
    appendPiSlopeTermEntries(entries, term, lower, upper);
  }
  const value = exactPiElementarySum(entries);
  return Object.freeze({
    analyzed,
    value,
    exact: formatExactPiElementarySum(value),
    antiderivative: analyzed.trigonometric
      .map(piSlopeAntiderivativeTerm)
      .join(" + ")
      .replace(/ \+ -/gu, " - ") || "0",
  });
}

export function evaluateExactPiTrigonometricIntegral(node, lower, upper) {
  if (
    !(lower instanceof ExactLinearPi)
    || !(upper instanceof ExactLinearPi)
    || !lower.isPurePi()
    || !upper.isPurePi()
  ) {
    throw new TypeError("pi角定積分の上下限は有理数倍piで指定してください。");
  }
  const analyzed = analyzeExactPiTrigonometricIntegrand(node);
  const entries = [];
  for (const term of analyzed.trigonometric) {
    appendTermEntries(entries, term, lower, upper);
  }
  const value = exactPiElementarySum(entries);
  return Object.freeze({
    analyzed,
    value,
    exact: formatExactPiElementarySum(value),
    antiderivative: analyzed.trigonometric
      .map(antiderivativeTerm)
      .join(" + ")
      .replace(/ \+ -/gu, " - ") || "0",
  });
}

export { MAX_PI_TRIGONOMETRIC_TERMS };
