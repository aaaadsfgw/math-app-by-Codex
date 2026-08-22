import {
  ExactRationalLimitError,
  evaluateExactRationalLimit,
  evaluateExactRationalLimitAtInfinity,
  formatExactLimitSide,
} from "../math-core/exact-rational-limit.js";
import {
  ExactPolynomialIntegralError,
  exactRationalConstantFromAst,
} from "../math-core/exact-polynomial-integral.js";
import {
  ExactRationalFunctionError,
  formatExactRationalPolynomial,
} from "../math-core/exact-rational-function.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { parseFiniteLimitInput } from "./limit-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const FINITE_LIMIT_SOLVER_ID = "finite-limit";

function recognizedResult(result) {
  return Object.freeze({ ...result, recognized: true });
}

function polynomialIsOne(polynomial) {
  return polynomial.length === 1 && polynomial[0].numerator === 1n
    && polynomial[0].denominator === 1n;
}

function rationalFunctionText(numerator, denominator) {
  const numeratorText = formatExactRationalPolynomial(numerator);
  if (polynomialIsOne(denominator)) return numeratorText;
  return `(${numeratorText})/(${formatExactRationalPolynomial(denominator)})`;
}

function approachText(point, direction) {
  const side = direction === "left" ? "-" : direction === "right" ? "+" : "";
  return `x→${point}${side}`;
}

function infinityApproachText(approach) {
  return approach === "negative-infinity" ? "-∞" : "+∞";
}

function multiplicityText(value) {
  return value === null ? "恒等的に0" : `${value}次`;
}

function safeErrorMessage(error, fallback) {
  try {
    if (typeof error === "string" && error) return error;
    if (error instanceof Error && typeof error.message === "string" && error.message) {
      return error.message;
    }
  } catch {
    // A thrown proxy or accessor must not escape the solver boundary.
  }
  return fallback;
}

function failureFor(error) {
  try {
    if (error instanceof ExactRationalFunctionError && error.unsupported) {
      const reason = error.code === "UNSUPPORTED_FUNCTION"
        ? "この段階では、多項式・有理式の有限点または無限遠の極限だけに対応しています。関数や数学定数を含む極限は未対応です。"
        : error.message;
      return recognizedResult(unsupportedResult(reason));
    }
    if (
      error instanceof MathParseError
      || error instanceof ExactRationalFunctionError
      || error instanceof ExactRationalLimitError
      || error instanceof ExactPolynomialIntegralError
    ) {
      return recognizedResult(failedResult(FINITE_LIMIT_SOLVER_ID, error.message));
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ|超え/u.test(error.message)) {
      return recognizedResult(unsupportedResult(error.message));
    }
  } catch {
    // Fall through to a stable invalid result for hostile thrown values.
  }
  return recognizedResult(failedResult(
    FINITE_LIMIT_SOLVER_ID,
    safeErrorMessage(error, "極限を厳密に計算できませんでした。"),
  ));
}

function solveAtInfinity(request, parsedExpression) {
  const evaluated = evaluateExactRationalLimitAtInfinity(
    parsedExpression.ast,
    request.approachKind,
  );
  const exactAnswer = evaluated.exact;
  const target = infinityApproachText(evaluated.approach);
  const originalText = rationalFunctionText(
    evaluated.rationalFunction.numerator,
    evaluated.rationalFunction.denominator,
  );
  const denominatorText = formatExactRationalPolynomial(
    evaluated.rationalFunction.denominator,
  );
  const domainLedgerText = evaluated.domainFactorChecks.length
    ? `元の分母台帳: ${evaluated.domainFactorChecks.map((check) => (
      `${formatExactRationalPolynomial(check.polynomial)}（${check.degree}次、`
      + `最高次係数=${check.leadingCoefficient}、零点絶対値の上界=${check.cauchyRootMagnitudeBound}）`
    )).join("、")}`
    : "元の分母台帳: 追加条件なし";
  const certifiedTailBound = evaluated.certifiedTailBound.toString();
  const certifiedTailCondition = evaluated.approach === "positive-infinity"
    ? `x>${certifiedTailBound}`
    : `x<-${certifiedTailBound}`;
  const tailCertificateText = `分母 ${denominatorText} は${evaluated.denominatorDegree}次の非零多項式`
    + `（最高次係数=${evaluated.denominatorLeadingCoefficient}）。${domainLedgerText}。`
    + `Cauchy境界 B=${certifiedTailBound} により、${certifiedTailCondition} で全分母が非零`;
  const degreeText = evaluated.numeratorIdenticallyZero
    ? `分子は恒等的に0、分母の次数=${evaluated.denominatorDegree}`
    : `分子の次数=${evaluated.numeratorDegree}、分母の次数=${evaluated.denominatorDegree}、次数差=${evaluated.degreeDifference}`;
  const leadingText = evaluated.numeratorIdenticallyZero
    ? "分子が恒等的に0なので、定義される無限遠側で式は恒等的に0"
    : `分子の最高次係数=${evaluated.numeratorLeadingCoefficient}、`
      + `分母の最高次係数=${evaluated.denominatorLeadingCoefficient}、`
      + `先頭係数比=${evaluated.leadingRatio}`;
  const ruleExplanation = evaluated.numeratorIdenticallyZero
    ? "元の式の全部分式と分母条件を検証した上で、分子が恒等的に0であることを使います。"
    : "分子と分母をxの高い次数から比較し、最高次項の比と次数差の偶奇で無限遠側の挙動を決めます。";
  const verification = evaluated.numeratorIdenticallyZero
    ? "式の全ASTと元の分母条件を検証し、各分母が非零多項式であることと、分子が恒等的に0であることを確認しました。数値近似、CAS、許容誤差は使っていません。"
    : `分子・分母の次数と最高次係数をBigInt分数で厳密に比較し、次数差と負の無限大での偶奇を再計算しました。Cauchy境界 B=${certifiedTailBound} により、${certifiedTailCondition} で元の全分母因子が非零であることも認証済みです。数値近似、CAS、許容誤差は使っていません。`;

  return solvedResult({
    answer: exactAnswer,
    exactAnswer,
    metadata: {
      expression: parsedExpression.normalized,
      point: target,
      direction: "both",
      approachKind: evaluated.approach,
      outcomeKind: evaluated.outcomeKind,
      tailDomainCertified: evaluated.tailDomainCertified,
    },
    steps: [
      {
        type: "input",
        content: `lim_(x→${target}) ${parsedExpression.normalized}`,
      },
      {
        type: "constraint",
        content: tailCertificateText,
        explanation: "各非零多項式に 1+Σ|a_i/a_n| の零点絶対値境界を作り、その最大値の外側に元の定義域が続くことを確認します。",
      },
      {
        type: "transformation",
        content: `有理式: ${originalText}`,
        explanation: "分子・分母をBigInt分数係数の多項式へ全面的に還元します。",
      },
      {
        type: "rule",
        content: degreeText,
        explanation: ruleExplanation,
      },
      {
        type: "verification",
        content: leadingText,
        explanation: `x→${target}の向きを含め、次数差と最高次係数の符号を厳密分数で確認しました。`,
      },
      { type: "result", content: `極限: ${exactAnswer}` },
    ],
    verification,
    solverId: FINITE_LIMIT_SOLVER_ID,
  });
}

function solveAtFinitePoint(request, parsedExpression) {
  const parsedPoint = parseMathExpression(request.pointSource, { symbols: [] });
  const point = exactRationalConstantFromAst(parsedPoint.ast);
  const evaluated = evaluateExactRationalLimit(
    parsedExpression.ast,
    point,
    request.direction,
  );
  const exactAnswer = evaluated.exact;
  const originalText = rationalFunctionText(
    evaluated.rationalFunction.numerator,
    evaluated.rationalFunction.denominator,
  );
  const canceledText = rationalFunctionText(
    evaluated.numeratorAfterCancellation,
    evaluated.denominatorAfterCancellation,
  );
  const targetDomainText = evaluated.pointExcluded
    ? evaluated.removableHoleAtTarget
      ? `x=${point}では元の式が未定義（可除穴）`
      : `x=${point}では元の式が未定義`
    : `x=${point}でも元の式は定義済み`;
  const domainLedgerText = evaluated.domainFactorChecks.length
    ? `元の分母台帳: ${evaluated.domainFactorChecks.map((check) => (
      `${formatExactRationalPolynomial(check.factor)} は x=${point} で ${check.valueAtPoint}`
      + `${check.excludesPoint ? `（零点${check.multiplicity}次）` : ""}`
    )).join("、")}`
    : "元の分母台帳: 条件なし";
  const sideText = `左極限=${formatExactLimitSide(evaluated.left)}、右極限=${formatExactLimitSide(evaluated.right)}`;
  const caseText = evaluated.numeratorIdenticallyZero
    ? "分子は恒等的に0なので、定義された穿孔近傍では値が0"
    : `分子の零点次数=${multiplicityText(evaluated.numeratorMultiplicity)}、分母の零点次数=${multiplicityText(evaluated.denominatorMultiplicity)}`;
  const ruleExplanation = evaluated.numeratorIdenticallyZero
    ? `全ての部分式と元の定義域を先に認証し、定義された穿孔近傍で ${canceledText} が恒等的に0であることを確認します。`
    : `接近点の因子を余り0で厳密に除き、相殺後を ${canceledText} として左右の符号を判定します。`;
  const sideExplanation = evaluated.numeratorIdenticallyZero
    ? "元の分母条件を除く穿孔近傍で式が恒等的に0であることを左右から確認しました。"
    : "残った因子の次数の偶奇と先頭比を厳密分数で再計算し、左側と右側を別々に確認しました。";
  const verification = evaluated.numeratorIdenticallyZero
    ? "式の全ASTと元の分母条件を検証した後、定義された穿孔近傍で分子が恒等的に0であることを確認しました。数値近似、CAS、許容誤差は使っていません。"
    : "分子・分母の接近点における零点次数をBigInt分数の組立除法で求め、共通因子を厳密に除いた後、左右それぞれの有限値または発散符号を再計算しました。数値近似、CAS、許容誤差は使っていません。";

  return solvedResult({
    answer: exactAnswer,
    exactAnswer,
    metadata: {
      expression: parsedExpression.normalized,
      point: point.toString(),
      direction: request.direction,
      outcomeKind: evaluated.outcomeKind,
      pointExcluded: evaluated.pointExcluded,
    },
    steps: [
      {
        type: "input",
        content: `lim_(${approachText(point, request.direction)}) ${parsedExpression.normalized}`,
      },
      {
        type: "constraint",
        content: `${targetDomainText}。${domainLedgerText}`,
        explanation: "極限は接近点そのものの値ではなく、恒等的に0でない元の分母因子を除いた十分近い範囲で調べます。",
      },
      {
        type: "transformation",
        content: `有理式: ${originalText}`,
        explanation: "分子・分母をBigInt分数係数の多項式へ全面的に還元します。",
      },
      {
        type: "rule",
        content: `${caseText}、共通因子の相殺次数=${evaluated.canceledMultiplicity}`,
        explanation: ruleExplanation,
      },
      {
        type: "verification",
        content: sideText,
        explanation: sideExplanation,
      },
      { type: "result", content: `極限: ${exactAnswer}` },
    ],
    verification,
    solverId: FINITE_LIMIT_SOLVER_ID,
  });
}

export function solveFiniteLimit(question) {
  let request;
  try {
    request = parseFiniteLimitInput(question);
  } catch (error) {
    return failureFor(error);
  }
  if (!request.recognized) {
    return unsupportedResult("多項式・有理式の極限を検出できません。");
  }
  if (!request.ok) {
    const unsupported = request.errorCode.startsWith("UNSUPPORTED_");
    return recognizedResult(unsupported
      ? unsupportedResult(request.error)
      : failedResult(FINITE_LIMIT_SOLVER_ID, request.error));
  }

  try {
    const parsedExpression = parseMathExpression(request.expression, { symbols: ["x"] });
    return request.approachKind === "positive-infinity"
      || request.approachKind === "negative-infinity"
      ? solveAtInfinity(request, parsedExpression)
      : solveAtFinitePoint(request, parsedExpression);
  } catch (error) {
    return failureFor(error);
  }
}

export default solveFiniteLimit;
