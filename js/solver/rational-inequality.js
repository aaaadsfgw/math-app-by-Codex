import { ExactPolynomialError } from "../math-core/exact-polynomial.js";
import {
  createExactQuadraticRootPoint,
  createExactRationalPoint,
  compareExactRealPoints,
  exactRealPointEndpoint,
  ExactRealPointError,
  rationalSampleBetweenExactPoints,
  signOfExactPolynomialAtRationalSample,
} from "../math-core/exact-real-point.js";
import { analyzeExactQuadraticRoots } from "../math-core/exact-quadratic-roots.js";
import { ExactRational } from "../math-core/exact-rational.js";
import {
  ExactRationalFunctionError,
  exactRationalEquationPolynomial,
  exactRationalFunctionFromAst,
  exactRationalPolynomialDegree,
  formatExactRationalPolynomial,
  isZeroExactRationalPolynomial,
} from "../math-core/exact-rational-function.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { createRealSet, formatRealSet } from "../math-core/real-set.js";
import {
  normalizeInequalityNotation,
  parseInequalityInput,
} from "./inequality-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const RATIONAL_INEQUALITY_SOLVER_ID = "rational-inequality";

function recognizedUnsupportedResult(message) {
  return Object.freeze({
    ...unsupportedResult(message),
    recognized: true,
  });
}

function hasRationalSyntax(value) {
  return /\/|\^\s*(?:\(\s*)?-\s*\d/u.test(String(value ?? ""));
}

function factorKey(polynomial) {
  return polynomial.map(String).join("|");
}

function combinedDomainFactors(left, right) {
  const factors = new Map();
  for (const factor of [...left.domainFactors, ...right.domainFactors]) {
    factors.set(factorKey(factor), factor);
  }
  return Object.freeze([...factors.values()]);
}

function relationAcceptsSign(operator, sign) {
  if (operator === "<") return sign < 0;
  if (operator === "<=") return sign <= 0;
  if (operator === ">") return sign > 0;
  return sign >= 0;
}

function rootsOfPolynomial(polynomial) {
  const degree = exactRationalPolynomialDegree(polynomial);
  if (degree === 0) return [];
  if (degree === 1) {
    const [constant, coefficient] = polynomial;
    return [createExactRationalPoint(constant.negate().divide(coefficient))];
  }
  if (degree !== 2) {
    throw new ExactRationalFunctionError(
      "有理不等式の通分後の分子は二次式まで対応しています。",
      { code: "RESULT_DEGREE_TOO_HIGH", unsupported: true },
    );
  }
  const analysis = analyzeExactQuadraticRoots(polynomial);
  return analysis.roots.map((root, index) => (
    root.form === "rational"
      ? createExactRationalPoint(new ExactRational(
          root.numeratorConstant,
          root.denominator,
        ))
      : createExactQuadraticRootPoint(analysis, index)
  ));
}

function addCriticalEntries(entries, polynomial, flags) {
  for (const point of rootsOfPolynomial(polynomial)) {
    entries.push({ point, zero: flags.zero === true, hole: flags.hole === true });
  }
}

function sortedCriticalEntries(numerator, domainFactors) {
  const entries = [];
  addCriticalEntries(entries, numerator, { zero: true });
  for (const factor of domainFactors) {
    addCriticalEntries(entries, factor, { hole: true });
  }
  entries.sort((left, right) => compareExactRealPoints(left.point, right.point));

  const merged = [];
  for (const entry of entries) {
    const previous = merged.at(-1);
    if (previous && compareExactRealPoints(previous.point, entry.point) === 0) {
      previous.zero ||= entry.zero;
      previous.hole ||= entry.hole;
    } else {
      merged.push({ ...entry });
    }
  }
  return merged;
}

function signOfDifferenceAtSample(numerator, denominators, sample) {
  let sign = signOfExactPolynomialAtRationalSample(numerator, sample);
  for (const denominator of denominators) {
    sign *= signOfExactPolynomialAtRationalSample(denominator, sample);
  }
  return sign;
}

function solutionSetFromCells(entries, intervalAccepted, pointAccepted) {
  const cells = [];
  for (let index = 0; index < intervalAccepted.length; index += 1) {
    cells.push(intervalAccepted[index]);
    if (index < pointAccepted.length) cells.push(pointAccepted[index]);
  }
  if (!cells.some(Boolean)) return createRealSet({ kind: "empty" });
  if (cells.every(Boolean)) return createRealSet({ kind: "all-real" });

  const intervals = [];
  for (let start = 0; start < cells.length;) {
    if (!cells[start]) {
      start += 1;
      continue;
    }
    let end = start;
    while (end + 1 < cells.length && cells[end + 1]) end += 1;

    const startIsInterval = start % 2 === 0;
    const endIsInterval = end % 2 === 0;
    const lowerPointIndex = startIsInterval ? start / 2 - 1 : (start - 1) / 2;
    const upperPointIndex = endIsInterval ? end / 2 : (end - 1) / 2;
    intervals.push({
      lower: lowerPointIndex < 0
        ? null
        : exactRealPointEndpoint(entries[lowerPointIndex].point),
      upper: upperPointIndex >= entries.length
        ? null
        : exactRealPointEndpoint(entries[upperPointIndex].point),
      lowerClosed: !startIsInterval,
      upperClosed: !endIsInterval,
    });
    start = end + 1;
  }
  return createRealSet({ intervals });
}

function intervalLabel(entries, index) {
  const lower = index === 0 ? null : exactRealPointEndpoint(entries[index - 1].point).exact;
  const upper = index === entries.length ? null : exactRealPointEndpoint(entries[index].point).exact;
  if (lower === null) return `x<${upper}`;
  if (upper === null) return `${lower}<x`;
  return `${lower}<x<${upper}`;
}

function formatDifference(numerator, leftDenominator, rightDenominator, operator) {
  const numeratorText = formatExactRationalPolynomial(numerator);
  const denominators = [leftDenominator, rightDenominator]
    .filter((polynomial) => !(
      polynomial.length === 1
      && polynomial[0].equals(ExactRational.one())
    ))
    .map((polynomial) => `(${formatExactRationalPolynomial(polynomial)})`);
  return denominators.length
    ? `(${numeratorText})/(${denominators.join("*")})${operator}0`
    : `${numeratorText}${operator}0`;
}

function withConditions(answer, conditions) {
  return conditions.length ? `${answer}（ただし ${conditions.join("、")}）` : answer;
}

function failureFor(error, recognized) {
  if (
    error instanceof ExactRationalFunctionError
    || error instanceof ExactPolynomialError
    || error instanceof ExactRealPointError
  ) {
    if (error.unsupported) {
      return recognized
        ? recognizedUnsupportedResult(error.message)
        : unsupportedResult(error.message);
    }
    return recognized
      ? failedResult(RATIONAL_INEQUALITY_SOLVER_ID, error.message)
      : unsupportedResult(error.message);
  }
  if (error instanceof MathParseError) {
    return recognized
      ? failedResult(RATIONAL_INEQUALITY_SOLVER_ID, error.message)
      : unsupportedResult(error.message);
  }
  if (error instanceof RangeError && /大きすぎ|長すぎ/u.test(error.message)) {
    return recognized
      ? recognizedUnsupportedResult(error.message)
      : unsupportedResult(error.message);
  }
  return recognized
    ? failedResult(
        RATIONAL_INEQUALITY_SOLVER_ID,
        error.message || "有理不等式を厳密に解析できませんでした。",
      )
    : unsupportedResult(error.message || "有理不等式を検出できません。");
}

export function solveRationalInequality(question) {
  const rawQuestion = String(question ?? "");
  const source = parseInequalityInput(question);
  const syntaxSuggestsRational = hasRationalSyntax(rawQuestion)
    || (
      rawQuestion.length <= 5_000
      && hasRationalSyntax(source.normalized ?? normalizeInequalityNotation(rawQuestion))
    );
  if (!source.recognized) return unsupportedResult("有理不等式を検出できません。");
  if (!source.ok) {
    return syntaxSuggestsRational
      ? failedResult(RATIONAL_INEQUALITY_SOLVER_ID, source.error)
      : unsupportedResult(source.error);
  }

  let left;
  let right;
  try {
    const leftAst = parseMathExpression(source.leftSource, { symbols: ["x"] }).ast;
    const rightAst = parseMathExpression(source.rightSource, { symbols: ["x"] }).ast;
    left = exactRationalFunctionFromAst(leftAst);
    right = exactRationalFunctionFromAst(rightAst);
  } catch (error) {
    return failureFor(error, syntaxSuggestsRational);
  }

  const recognized = left.hasVariableDenominator || right.hasVariableDenominator;
  if (!recognized) return unsupportedResult("変数を含む分母がありません。");

  let numerator;
  let domainFactors;
  let entries;
  try {
    numerator = exactRationalEquationPolynomial(left, right);
    if (exactRationalPolynomialDegree(numerator) > 2) {
      throw new ExactRationalFunctionError(
        "有理不等式の通分後の分子は二次式まで対応しています。",
        { code: "RESULT_DEGREE_TOO_HIGH", unsupported: true },
      );
    }
    domainFactors = combinedDomainFactors(left, right);
    entries = sortedCriticalEntries(numerator, domainFactors);
  } catch (error) {
    return failureFor(error, true);
  }

  const numeratorIdentity = isZeroExactRationalPolynomial(numerator);
  const denominators = [left.denominator, right.denominator];
  const intervalAccepted = [];
  const intervalSigns = [];
  try {
    for (let index = 0; index <= entries.length; index += 1) {
      const sample = rationalSampleBetweenExactPoints(
        index === 0 ? null : entries[index - 1].point,
        index === entries.length ? null : entries[index].point,
      );
      const sign = signOfDifferenceAtSample(numerator, denominators, sample);
      intervalSigns.push(sign);
      intervalAccepted.push(relationAcceptsSign(source.operator, sign));
    }
  } catch (error) {
    return failureFor(error, true);
  }

  const pointAccepted = entries.map((entry) => (
    !entry.hole
    && (numeratorIdentity || entry.zero)
    && relationAcceptsSign(source.operator, 0)
  ));
  const solutionSet = solutionSetFromCells(entries, intervalAccepted, pointAccepted);
  const exactAnswer = formatRealSet(solutionSet);
  const holeEntries = entries.filter((entry) => entry.hole);
  const conditions = holeEntries.map(
    (entry) => `x≠${exactRealPointEndpoint(entry.point).exact}`,
  );
  const answer = withConditions(exactAnswer, conditions);

  const zeroText = entries.filter((entry) => entry.zero)
    .map((entry) => exactRealPointEndpoint(entry.point).exact)
    .join(", ") || "なし";
  const holeText = holeEntries
    .map((entry) => exactRealPointEndpoint(entry.point).exact)
    .join(", ") || "なし";
  const signText = intervalSigns.map((sign, index) => (
    `${intervalLabel(entries, index)}: ${sign < 0 ? "負" : sign > 0 ? "正" : "0"}`
  )).join("、");
  const constraintText = conditions.length
    ? `定義域: ${conditions.join("、")}`
    : "定義域: すべての実数（実数の除外値なし）";

  return solvedResult({
    answer,
    exactAnswer,
    kind: conditions.length ? "conditional" : "exact",
    conditions,
    solutionSet,
    steps: [
      { type: "input", content: source.source },
      {
        type: "constraint",
        content: constraintText,
        explanation: "約分や0倍で式から消える分母条件も、元の不等式の定義域として保持します。",
      },
      {
        type: "transformation",
        content: formatDifference(
          numerator,
          left.denominator,
          right.denominator,
          source.operator,
        ),
        explanation: "左右の差を一つの有理式にし、分母の符号を勝手に固定せず調べます。",
      },
      {
        type: "strategy",
        content: `分子の零点: ${zeroText} / 定義されない点: ${holeText}`,
        explanation: "零点と穴で数直線を区切り、各開区間に厳密な有理標本点を置きます。",
      },
      {
        type: "verification",
        content: `区間符号: ${signText}`,
        explanation: "各標本点で通分後の分子と左右の分母をBigInt分数として評価し、端点の開閉も確認します。",
      },
      { type: "result", content: answer },
    ],
    verification: "全臨界点を厳密に整列し、各区間の有理標本点で元の差の符号を検算しました。分母由来の点は常に除外しています。",
    solverId: RATIONAL_INEQUALITY_SOLVER_ID,
  });
}

export default solveRationalInequality;
