import {
  ExactPolynomialNormalError,
  evaluateExactPolynomialNormal,
} from "../math-core/exact-polynomial-normal.js";
import {
  ExactPolynomialError,
  exactPolynomialFromAst,
} from "../math-core/exact-polynomial.js";
import {
  ExactPolynomialIntegralError,
  exactRationalConstantFromAst,
  formatExactPolynomialForIntegral,
} from "../math-core/exact-polynomial-integral.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { parsePolynomialNormalInput } from "./polynomial-normal-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const POLYNOMIAL_NORMAL_SOLVER_ID = "polynomial-normal";

function recognizedResult(result) {
  return Object.freeze({ ...result, recognized: true });
}

function safeErrorMessage(error, fallback) {
  try {
    if (typeof error === "string" && error) return error;
    if (error instanceof Error && typeof error.message === "string" && error.message) {
      return error.message;
    }
  } catch {
    // A hostile thrown value must not escape the solver boundary.
  }
  return fallback;
}

function normalFailure(error) {
  try {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialError
      || error instanceof ExactPolynomialIntegralError
      || error instanceof ExactPolynomialNormalError
    ) {
      return recognizedResult(error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(POLYNOMIAL_NORMAL_SOLVER_ID, error.message));
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ|超え/u.test(error.message)) {
      return recognizedResult(unsupportedResult(error.message));
    }
  } catch {
    // Fall through to a stable invalid result for hostile errors and proxies.
  }
  return recognizedResult(failedResult(
    POLYNOMIAL_NORMAL_SOLVER_ID,
    safeErrorMessage(error, "多項式の法線を厳密に計算できませんでした。"),
  ));
}

function parseExactRational(source) {
  const parsed = parseMathExpression(source, { symbols: [] });
  return exactRationalConstantFromAst(parsed.ast);
}

function truthText(value) {
  return value === true ? "成立" : value === false ? "不成立" : "厳密照合済み";
}

function exactDifferenceText(symbol, value) {
  return value.numerator < 0n
    ? `${symbol}+${value.negate()}`
    : `${symbol}-${value}`;
}

function implicitPointForm(point, pointValue, tangentSlope) {
  const xDifference = exactDifferenceText("x", point);
  if (tangentSlope.isZero()) return `${xDifference}=0`;
  const yDifference = exactDifferenceText("y", pointValue);
  if (tangentSlope.equals(1n)) return `${xDifference}+(${yDifference})=0`;
  if (tangentSlope.equals(-1n)) return `${xDifference}-(${yDifference})=0`;
  const separator = tangentSlope.numerator > 0n ? "+" : "";
  return `${xDifference}${separator}${tangentSlope}(${yDifference})=0`;
}

function slopeProductText(evaluated) {
  const verification = evaluated.slopeProductVerification;
  if (!verification?.applicable) return "鉛直法線のため傾き積は適用外";
  return `接線傾き×法線傾き=${verification.product}`;
}

export function solvePolynomialNormal(question) {
  let request;
  try {
    request = parsePolynomialNormalInput(question);
  } catch (error) {
    return normalFailure(error);
  }

  if (!request.recognized) {
    return unsupportedResult("式と接点が完全に指定された多項式の法線問題を検出できません。");
  }
  if (!request.ok) {
    const unsupported = typeof request.errorCode === "string"
      && request.errorCode.startsWith("UNSUPPORTED_");
    return recognizedResult(unsupported
      ? unsupportedResult(request.error)
      : failedResult(
        POLYNOMIAL_NORMAL_SOLVER_ID,
        request.error || "法線問題の入力形式が正しくありません。",
      ));
  }

  try {
    const parsedExpression = parseMathExpression(request.expression, { symbols: ["x"] });
    const polynomial = exactPolynomialFromAst(parsedExpression.ast);
    const point = parseExactRational(request.xSource);
    const declaredValue = request.form === "point"
      ? parseExactRational(request.ySource)
      : null;
    const evaluated = evaluateExactPolynomialNormal(polynomial, point, {
      declaredValue,
    });

    const polynomialText = formatExactPolynomialForIntegral(evaluated.polynomial);
    const derivativeText = formatExactPolynomialForIntegral(
      evaluated.derivativePolynomial,
    );
    const exactAnswer = evaluated.exact;
    const pointText = `(${evaluated.point}, ${evaluated.pointValue})`;
    const inputPointText = request.form === "point"
      ? `指定点 (${evaluated.point}, ${evaluated.declaredValue})`
      : `x=${evaluated.point}`;
    const membershipText = request.form === "point"
      ? `指定点の曲線所属: ${truthText(evaluated.pointMembership.matches)}`
      : `接点 ${pointText} を式から厳密計算`;
    const implicitText = implicitPointForm(
      evaluated.point,
      evaluated.pointValue,
      evaluated.tangentSlope,
    );

    return solvedResult({
      answer: exactAnswer,
      exactAnswer,
      metadata: {
        expression: parsedExpression.normalized,
        form: request.form,
        pointX: evaluated.point.toString(),
        pointY: evaluated.pointValue.toString(),
        tangentSlope: evaluated.tangentSlope.toString(),
        lineKind: evaluated.line.kind,
        family: "polynomial-normal",
      },
      steps: [
        {
          type: "input",
          content: `曲線 y=f(x)=${polynomialText}、${inputPointText}`,
          explanation: "問題文に明示された曲線と接点条件を整理します。",
        },
        {
          type: "constraint",
          content: "fは4次以下の有理係数多項式、接点座標は有理数",
          explanation: "グラフから接点を補わず、問題文に明示された式と座標だけを全面検証します。",
        },
        {
          type: "transformation",
          content: `f'(x)=${derivativeText}`,
          explanation: "各項を有理係数のまま形式微分します。",
        },
        {
          type: "verification",
          content: `${membershipText}、f(${evaluated.point})=${evaluated.pointValue}`,
          explanation: request.form === "point"
            ? "指定されたy座標と多項式への厳密代入値が一致することを確認します。"
            : "接点のy座標を多項式へ厳密代入して確定します。",
        },
        {
          type: "rule",
          content: `f'(${evaluated.point})=${evaluated.tangentSlope} より、法線を ${implicitText} とおく`,
          explanation: "接線方向(1, f'(a))を法線の法ベクトルとして、傾き0の場合も除算せずに直線を作ります。",
        },
        {
          type: "verification",
          content: `接点通過: ${truthText(evaluated.linePointVerification.verified)}、直交: ${truthText(evaluated.orthogonalityVerification.verified)}、${slopeProductText(evaluated)}`,
          explanation: "接点代入と方向ベクトルの内積を厳密分数で照合し、両方の傾きがある場合は積が-1になることも確認します。",
        },
        { type: "result", content: `法線: ${exactAnswer}` },
      ],
      verification: "多項式の全ASTを4次以下の有理係数として検証し、接点値、形式微分値、法線の接点通過と接線への直交をBigInt分数で厳密に再計算しました。グラフ、数値微分、CAS、浮動小数、許容誤差は使っていません。",
      solverId: POLYNOMIAL_NORMAL_SOLVER_ID,
    });
  } catch (error) {
    return normalFailure(error);
  }
}

export default solvePolynomialNormal;
