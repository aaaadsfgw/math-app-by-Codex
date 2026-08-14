import { ExactLinearPiError } from "../math-core/exact-linear-pi.js";
import {
  ExactPolynomialError,
  exactPolynomialFromAst,
} from "../math-core/exact-polynomial.js";
import {
  ExactPolynomialIntegralError,
  exactRationalConstantFromAst,
  formatExactPolynomialForIntegral,
} from "../math-core/exact-polynomial-integral.js";
import {
  ExactPolynomialVolumeError,
  evaluateExactPolynomialVolume,
} from "../math-core/exact-polynomial-volume.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { parsePolynomialVolumeInput } from "./polynomial-volume-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const POLYNOMIAL_VOLUME_SOLVER_ID = "polynomial-volume";

function recognizedResult(result) {
  return Object.freeze({ ...result, recognized: true });
}

function volumeFailure(error) {
  if (
    error instanceof MathParseError
    || error instanceof ExactPolynomialError
    || error instanceof ExactPolynomialIntegralError
    || error instanceof ExactLinearPiError
    || error instanceof ExactPolynomialVolumeError
  ) {
    return recognizedResult(error.unsupported
      ? unsupportedResult(error.message)
      : failedResult(POLYNOMIAL_VOLUME_SOLVER_ID, error.message));
  }
  if (error instanceof RangeError && /大きすぎ|長すぎ|超え/u.test(error.message)) {
    return recognizedResult(unsupportedResult(error.message));
  }
  return recognizedResult(failedResult(
    POLYNOMIAL_VOLUME_SOLVER_ID,
    error?.message || "x軸まわりの回転体の体積を厳密に計算できませんでした。",
  ));
}

function certificateText(certificate, label) {
  const kindLabel = {
    "lower-endpoint": "下端",
    "upper-endpoint": "上端",
    vertex: "頂点",
  };
  const checkpoints = certificate.candidates
    .map(({ kind, x, value }) => `${kindLabel[kind] ?? kind} x=${x}: ${value}`)
    .join("、");
  return `${label}≥0（${checkpoints}）`;
}

export function solvePolynomialVolume(question) {
  const request = parsePolynomialVolumeInput(question);
  if (!request.recognized) {
    return unsupportedResult("式で完全に指定されたx軸回転体を検出できません。");
  }
  if (!request.ok) {
    return recognizedResult(request.errorCode.startsWith("UNSUPPORTED_")
      ? unsupportedResult(request.error)
      : failedResult(
        POLYNOMIAL_VOLUME_SOLVER_ID,
        request.error || "回転体の入力形式が正しくありません。",
      ));
  }

  try {
    const parsedOuter = parseMathExpression(request.outerExpression, { symbols: ["x"] });
    const parsedInner = parseMathExpression(request.innerExpression, { symbols: ["x"] });
    const lower = exactRationalConstantFromAst(
      parseMathExpression(request.lowerSource, { symbols: [] }).ast,
    );
    const upper = exactRationalConstantFromAst(
      parseMathExpression(request.upperSource, { symbols: [] }).ast,
    );
    const evaluated = evaluateExactPolynomialVolume(
      exactPolynomialFromAst(parsedOuter.ast),
      exactPolynomialFromAst(parsedInner.ast),
      { lower, upper },
    );

    const outerText = formatExactPolynomialForIntegral(evaluated.outerRadiusPolynomial);
    const innerText = formatExactPolynomialForIntegral(evaluated.innerRadiusPolynomial);
    const crossSectionText = formatExactPolynomialForIntegral(
      evaluated.crossSectionPolynomial,
    );
    const antiderivativeText = formatExactPolynomialForIntegral(evaluated.antiderivative);
    const exactAnswer = evaluated.exact;
    const method = evaluated.innerRadiusPolynomial.length === 1
      && evaluated.innerRadiusPolynomial[0].isZero()
      ? "円板法"
      : "ワッシャー法";

    return solvedResult({
      answer: exactAnswer,
      exactAnswer,
      metadata: {
        outerRadius: parsedOuter.normalized,
        innerRadius: parsedInner.normalized,
        lowerBound: lower.toString(),
        upperBound: upper.toString(),
        axis: "x",
        method,
        piCoefficient: evaluated.volumeCoefficient.toString(),
        family: "polynomial-volume",
      },
      steps: [
        {
          type: "input",
          content: `外半径 R(x)=${outerText}、内半径 r(x)=${innerText}、${lower}≤x≤${upper}、x軸回転`,
        },
        {
          type: "constraint",
          content: "Rとrは2次以下の有理係数多項式、区間全体で R≥r≥0",
          explanation: "図から半径や区間を補わず、端点と必要な頂点を厳密分数で検査します。",
        },
        {
          type: "verification",
          content: [
            certificateText(evaluated.innerCertificate, "r"),
            certificateText(evaluated.orderCertificate, "R-r"),
            certificateText(evaluated.outerCertificate, "R"),
          ].join("、"),
          explanation: "各二次式の閉区間最小値候補をすべて確認し、負の半径と内外の逆転を除外しました。",
        },
        {
          type: "rule",
          content: `${method}: A(x)=pi(R(x)^2-r(x)^2)=pi(${crossSectionText})`,
          explanation: "半径多項式を係数配列のまま二乗し、断面積のpi以外の係数を作ります。",
        },
        {
          type: "transformation",
          content: `∫(R^2-r^2)dx=${antiderivativeText}`,
          explanation: "各係数を次数+1で割り、有理数のまま原始関数を作ります。",
        },
        {
          type: "verification",
          content: `pi係数=${evaluated.volumeCoefficient}`,
          explanation: "原始関数へ上端・下端を厳密代入し、差が非負であることを再確認しました。",
        },
        { type: "result", content: `体積: ${exactAnswer}` },
      ],
      verification: "外半径・内半径・両者の順序を区間全体で厳密証明し、R^2-r^2をBigInt分数で項別積分しました。浮動小数、数値積分、CAS、許容誤差は使っていません。",
      solverId: POLYNOMIAL_VOLUME_SOLVER_ID,
    });
  } catch (error) {
    return volumeFailure(error);
  }
}

export default solvePolynomialVolume;
