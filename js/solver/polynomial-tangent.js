import {
  ExactPolynomialTangentError,
  evaluateExactPolynomialTangent,
} from "../math-core/exact-polynomial-tangent.js";
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
import { parsePolynomialTangentInput } from "./polynomial-tangent-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const POLYNOMIAL_TANGENT_SOLVER_ID = "polynomial-tangent";

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

function tangentFailure(error) {
  try {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialError
      || error instanceof ExactPolynomialIntegralError
      || error instanceof ExactPolynomialTangentError
    ) {
      return recognizedResult(error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(POLYNOMIAL_TANGENT_SOLVER_ID, error.message));
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ|超え/u.test(error.message)) {
      return recognizedResult(unsupportedResult(error.message));
    }
  } catch {
    // Fall through to a stable invalid result for hostile errors and proxies.
  }
  return recognizedResult(failedResult(
    POLYNOMIAL_TANGENT_SOLVER_ID,
    safeErrorMessage(error, "多項式の接線を厳密に計算できませんでした。"),
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

export function solvePolynomialTangent(question) {
  let request;
  try {
    request = parsePolynomialTangentInput(question);
  } catch (error) {
    return tangentFailure(error);
  }

  if (!request.recognized) {
    return unsupportedResult("式と接点が完全に指定された多項式の接線問題を検出できません。");
  }
  if (!request.ok) {
    const unsupported = typeof request.errorCode === "string"
      && request.errorCode.startsWith("UNSUPPORTED_");
    return recognizedResult(unsupported
      ? unsupportedResult(request.error)
      : failedResult(
        POLYNOMIAL_TANGENT_SOLVER_ID,
        request.error || "接線問題の入力形式が正しくありません。",
      ));
  }

  try {
    const parsedExpression = parseMathExpression(request.expression, { symbols: ["x"] });
    const polynomial = exactPolynomialFromAst(parsedExpression.ast);
    const point = parseExactRational(request.xSource);
    const declaredValue = request.form === "point"
      ? parseExactRational(request.ySource)
      : null;
    const evaluated = evaluateExactPolynomialTangent(polynomial, point, {
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

    return solvedResult({
      answer: exactAnswer,
      exactAnswer,
      metadata: {
        expression: parsedExpression.normalized,
        form: request.form,
        pointX: evaluated.point.toString(),
        pointY: evaluated.pointValue.toString(),
        slope: evaluated.slope.toString(),
        intercept: evaluated.intercept.toString(),
        family: "polynomial-tangent",
      },
      steps: [
        {
          type: "input",
          content: `曲線 y=f(x)=${polynomialText}、${inputPointText}`,
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
          content: `f'(${evaluated.point})=${evaluated.slope} より、${exactDifferenceText("y", evaluated.pointValue)}=${evaluated.slope}(${exactDifferenceText("x", evaluated.point)})`,
          explanation: "接点を通り、傾きがその点での導関数値となる直線を作ります。",
        },
        {
          type: "verification",
          content: `接点通過: ${truthText(evaluated.linePointVerification.verified)}、傾き一致: ${truthText(evaluated.slopeVerification.verified)}`,
          explanation: "得られた直線への接点代入とx係数を、元の接点値・導関数値に厳密分数で照合しました。",
        },
        { type: "result", content: `接線: ${exactAnswer}` },
      ],
      verification: "多項式の全ASTを4次以下の有理係数として検証し、接点値、形式微分値、直線の接点通過と傾きをBigInt分数で厳密に再計算しました。グラフ、数値微分、CAS、浮動小数、許容誤差は使っていません。",
      solverId: POLYNOMIAL_TANGENT_SOLVER_ID,
    });
  } catch (error) {
    return tangentFailure(error);
  }
}

export default solvePolynomialTangent;
