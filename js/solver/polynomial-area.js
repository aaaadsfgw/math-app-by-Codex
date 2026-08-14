import {
  ExactPolynomialAreaError,
  evaluateExactPolynomialArea,
} from "../math-core/exact-polynomial-area.js";
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
import { parsePolynomialAreaInput } from "./polynomial-area-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const POLYNOMIAL_AREA_SOLVER_ID = "polynomial-area";

function recognizedResult(result) {
  return Object.freeze({ ...result, recognized: true });
}

function areaFailure(error) {
  if (
    error instanceof MathParseError
    || error instanceof ExactPolynomialError
    || error instanceof ExactPolynomialIntegralError
    || error instanceof ExactPolynomialAreaError
  ) {
    return recognizedResult(error.unsupported
      ? unsupportedResult(error.message)
      : failedResult(POLYNOMIAL_AREA_SOLVER_ID, error.message));
  }
  if (error instanceof RangeError && /大きすぎ|長すぎ|超え/u.test(error.message)) {
    return recognizedResult(unsupportedResult(error.message));
  }
  return recognizedResult(failedResult(
    POLYNOMIAL_AREA_SOLVER_ID,
    error.message || "多項式で囲まれる面積を厳密に計算できませんでした。",
  ));
}

function partitionText(evaluated) {
  return evaluated.partitionPoints.map(({ exact }) => exact).join(" < ");
}

function intersectionsText(evaluated) {
  return evaluated.intersections.length
    ? evaluated.intersections.map(({ exact }) => exact).join("、")
    : "区間内になし";
}

function pieceText(piece, differenceText) {
  const order = piece.upperCurve === "first"
    ? "第1曲線が上"
    : piece.upperCurve === "second"
      ? "第2曲線が上"
      : "2曲線が一致";
  return `[${piece.lower.exact}, ${piece.upper.exact}] ${order}: `
    + `∫|${differenceText}|dx=${piece.areaExact}`;
}

export function solvePolynomialArea(question) {
  const request = parsePolynomialAreaInput(question);
  if (!request.recognized) {
    return unsupportedResult("式で完全に指定された多項式面積を検出できません。");
  }
  if (!request.ok) {
    return recognizedResult(request.errorCode.startsWith("UNSUPPORTED_")
      ? unsupportedResult(request.error)
      : failedResult(
        POLYNOMIAL_AREA_SOLVER_ID,
        request.error || "面積問題の入力形式が正しくありません。",
      ));
  }

  try {
    const parsedFirst = parseMathExpression(request.firstExpression, { symbols: ["x"] });
    const parsedSecond = parseMathExpression(request.secondExpression, { symbols: ["x"] });
    const firstPolynomial = exactPolynomialFromAst(parsedFirst.ast);
    const secondPolynomial = exactPolynomialFromAst(parsedSecond.ast);
    let lower = null;
    let upper = null;
    if (request.form === "explicit-interval") {
      lower = exactRationalConstantFromAst(
        parseMathExpression(request.lowerSource, { symbols: [] }).ast,
      );
      upper = exactRationalConstantFromAst(
        parseMathExpression(request.upperSource, { symbols: [] }).ast,
      );
    }
    const evaluated = evaluateExactPolynomialArea(
      firstPolynomial,
      secondPolynomial,
      {
        mode: request.form === "two-intersections" ? "intersections" : "explicit",
        lower,
        upper,
      },
    );
    const firstText = formatExactPolynomialForIntegral(evaluated.firstPolynomial);
    const secondText = formatExactPolynomialForIntegral(evaluated.secondPolynomial);
    const differenceText = formatExactPolynomialForIntegral(evaluated.difference);
    const antiderivativeText = formatExactPolynomialForIntegral(evaluated.antiderivative);
    const exactAnswer = evaluated.exact;
    const intervalSource = request.form === "two-intersections"
      ? `異なる2交点 x=${evaluated.lower.exact}, ${evaluated.upper.exact}`
      : `明示区間 ${evaluated.lower.exact}≤x≤${evaluated.upper.exact}`;
    const pieceSummary = evaluated.pieces
      .map((piece) => pieceText(piece, differenceText))
      .join("、");

    return solvedResult({
      answer: exactAnswer,
      exactAnswer,
      metadata: {
        firstCurve: parsedFirst.normalized,
        secondCurve: parsedSecond.normalized,
        lowerBound: evaluated.lower.exact,
        upperBound: evaluated.upper.exact,
        form: request.form,
        family: "polynomial-area",
      },
      steps: [
        {
          type: "input",
          content: `第1曲線 y=${firstText}、第2曲線 y=${secondText}、${intervalSource}`,
        },
        {
          type: "constraint",
          content: "両曲線は4次以下、差は2次以下の有理係数多項式",
          explanation: "図から領域を補わず、両方の式を先に全面検証してから交点と上下関係を調べます。",
        },
        {
          type: "transformation",
          content: `h(x)=第1曲線-第2曲線=${differenceText}`,
          explanation: "面積は符号付き積分の絶対値ではなく、交点で区切った ∫|h(x)|dx の和です。",
        },
        {
          type: "rule",
          content: `区間内の交点: ${intersectionsText(evaluated)}、分割: ${partitionText(evaluated)}`,
          explanation: "有理端点と二次無理根を浮動小数にせず整列し、各開区間の有理標本点でhの符号を確認します。",
        },
        {
          type: "transformation",
          content: `hの原始関数 H(x)=${antiderivativeText}`,
          explanation: "各分割区間で H(右端)-H(左端) の符号を上下関係と照合して非負化します。",
        },
        {
          type: "verification",
          content: pieceSummary,
          explanation: "各部分面積をBigInt分数または同じ二次体 Q+Q√d で再計算し、すべて非負であることを確認しました。",
        },
        { type: "result", content: `面積: ${exactAnswer}` },
      ],
      verification: "両曲線を全面的に有理係数多項式へ変換し、差の全実交点で区間を分け、各区間の符号と原始関数差を厳密に照合しました。根の近似、数値積分、CAS、許容誤差は使っていません。",
      solverId: POLYNOMIAL_AREA_SOLVER_ID,
    });
  } catch (error) {
    return areaFailure(error);
  }
}

export default solvePolynomialArea;
