import {
  ExactRationalLimitError,
  evaluateExactRationalLimit,
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

function multiplicityText(value) {
  return value === null ? "恒等的に0" : `${value}次`;
}

function failureFor(error) {
  if (error instanceof ExactRationalFunctionError && error.unsupported) {
    const reason = error.code === "UNSUPPORTED_FUNCTION"
      ? "この段階では、有限有理点における多項式・有理式の極限だけに対応しています。関数や数学定数を含む極限は未対応です。"
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
  return recognizedResult(failedResult(
    FINITE_LIMIT_SOLVER_ID,
    error.message || "有限極限を厳密に計算できませんでした。",
  ));
}

export function solveFiniteLimit(question) {
  const request = parseFiniteLimitInput(question);
  if (!request.recognized) {
    return unsupportedResult("有限点への極限を検出できません。");
  }
  if (!request.ok) {
    const unsupported = request.errorCode.startsWith("UNSUPPORTED_");
    return recognizedResult(unsupported
      ? unsupportedResult(request.error)
      : failedResult(FINITE_LIMIT_SOLVER_ID, request.error));
  }

  try {
    const parsedExpression = parseMathExpression(request.expression, { symbols: ["x"] });
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
  } catch (error) {
    return failureFor(error);
  }
}

export default solveFiniteLimit;
