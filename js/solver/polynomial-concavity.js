import {
  ExactPolynomialConcavityError,
  evaluateExactPolynomialConcavity,
} from "../math-core/exact-polynomial-concavity.js";
import {
  ExactPolynomialError,
  exactPolynomialFromAst,
} from "../math-core/exact-polynomial.js";
import { formatExactPolynomialForIntegral } from "../math-core/exact-polynomial-integral.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { parsePolynomialConcavityInput } from "./polynomial-concavity-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const POLYNOMIAL_CONCAVITY_SOLVER_ID = "polynomial-concavity";

const EMPTY_TEXT = "なし";

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

function concavityFailure(error) {
  try {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialError
      || error instanceof ExactPolynomialConcavityError
    ) {
      return recognizedResult(error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(POLYNOMIAL_CONCAVITY_SOLVER_ID, error.message));
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ|超え/u.test(error.message)) {
      return recognizedResult(unsupportedResult(error.message));
    }
  } catch {
    // Fall through to a stable invalid result for hostile thrown values.
  }
  return recognizedResult(failedResult(
    POLYNOMIAL_CONCAVITY_SOLVER_ID,
    safeErrorMessage(error, "多項式の凹凸・変曲点を厳密に判定できませんでした。"),
  ));
}

function exactEndpoint(endpoint, label) {
  if (endpoint === null) return null;
  if (typeof endpoint?.exact === "string" && endpoint.exact) return endpoint.exact;
  throw new TypeError(`${label}の厳密文字列がありません。`);
}

function intervalText(interval) {
  const lower = exactEndpoint(interval?.lower ?? null, "区間下端") ?? "-∞";
  const upper = exactEndpoint(interval?.upper ?? null, "区間上端") ?? "+∞";
  return `(${lower},${upper})`;
}

function intervalsText(intervals) {
  if (!Array.isArray(intervals)) {
    throw new TypeError("凹凸区間の厳密証拠が配列ではありません。");
  }
  return intervals.length ? intervals.map(intervalText).join(" または ") : EMPTY_TEXT;
}

function exactPointText(candidate) {
  const exact = candidate?.point?.exact;
  if (typeof exact !== "string" || !exact) {
    throw new TypeError("変曲点の厳密文字列がありません。");
  }
  return exact;
}

function inflectionPointsText(points) {
  if (!Array.isArray(points)) {
    throw new TypeError("変曲点の厳密証拠が配列ではありません。");
  }
  return points.length ? points.map(exactPointText).join("、") : EMPTY_TEXT;
}

function concavitySections(evaluated) {
  return [
    `下に凸: ${intervalsText(evaluated.lowerConvexIntervals)}`,
    `上に凸: ${intervalsText(evaluated.upperConvexIntervals)}`,
  ];
}

function inflectionSection(evaluated) {
  return `変曲点: ${inflectionPointsText(evaluated.inflectionPoints)}`;
}

function answerFor(form, evaluated) {
  if (form === "concavity") return concavitySections(evaluated).join("; ");
  if (form === "inflection") return inflectionSection(evaluated);
  return [...concavitySections(evaluated), inflectionSection(evaluated)].join("; ");
}

function signText(sign) {
  return sign > 0 ? "+" : sign < 0 ? "-" : "0";
}

function curvatureText(curvature) {
  if (curvature === "lower-convex") return "下に凸";
  if (curvature === "upper-convex") return "上に凸";
  if (curvature === "zero-curvature") return "曲率0";
  return "判定対象外";
}

function intervalEvidenceText(interval) {
  if (typeof interval?.sampleExact !== "string" || !interval.sampleExact) {
    throw new TypeError("凹凸判定標本の厳密文字列がありません。");
  }
  return `${intervalText(interval)}: 標本 x=${interval.sampleExact}`
    + `、f''(x)の符号=${signText(interval.secondDerivativeSign)}`
    + `、${curvatureText(interval.curvature)}`;
}

function rootCandidatesText(candidates) {
  if (!Array.isArray(candidates)) {
    throw new TypeError("二階導関数の根候補が配列ではありません。");
  }
  return candidates.length ? candidates.map((candidate) => candidate.xExact).join("、") : EMPTY_TEXT;
}

function candidateEvidenceText(candidate) {
  if (
    typeof candidate?.xExact !== "string"
    || typeof candidate?.yExact !== "string"
  ) {
    throw new TypeError("変曲点候補の厳密文字列がありません。");
  }
  const classification = candidate.classification === "inflection"
    ? "変曲点"
    : "符号変化なし";
  return `x=${candidate.xExact}: ${signText(candidate.leftSign)}→${signText(candidate.rightSign)}`
    + `、${classification}、f(${candidate.xExact})=${candidate.yExact}`;
}

function overallCurvatureText(value) {
  if (value === "lower-convex") return "全実数で下に凸";
  if (value === "upper-convex") return "全実数で上に凸";
  if (value === "zero-curvature") return "全実数で二階導関数が0";
  return "区間ごとに凹凸が異なる";
}

export function solvePolynomialConcavity(question) {
  let request;
  try {
    request = parsePolynomialConcavityInput(question);
  } catch (error) {
    return concavityFailure(error);
  }

  if (!request.recognized) {
    return unsupportedResult("式で完全に指定された多項式の凹凸・変曲点問題を検出できません。");
  }
  if (!request.ok) {
    const unsupported = typeof request.errorCode === "string"
      && request.errorCode.startsWith("UNSUPPORTED_");
    return recognizedResult(unsupported
      ? unsupportedResult(request.error)
      : failedResult(
        POLYNOMIAL_CONCAVITY_SOLVER_ID,
        request.error || "凹凸・変曲点問題の入力形式が正しくありません。",
      ));
  }

  try {
    const parsedExpression = parseMathExpression(request.expression, { symbols: ["x"] });
    const polynomial = exactPolynomialFromAst(parsedExpression.ast, {
      maxIntermediateDegree: 4,
    });
    const evaluated = evaluateExactPolynomialConcavity(polynomial);
    if (evaluated.verification?.verified !== true) {
      throw new ExactPolynomialConcavityError(
        "凹凸・変曲点の厳密検証証拠が完了していません。",
        { code: "CONCAVITY_VERIFICATION_INCOMPLETE" },
      );
    }

    const polynomialText = formatExactPolynomialForIntegral(evaluated.polynomial);
    const firstDerivativeText = formatExactPolynomialForIntegral(
      evaluated.firstDerivativePolynomial,
    );
    const secondDerivativeText = formatExactPolynomialForIntegral(
      evaluated.secondDerivativePolynomial,
    );
    const candidatesText = rootCandidatesText(evaluated.inflectionCandidates);
    const intervalEvidence = evaluated.intervals.length
      ? evaluated.intervals.map(intervalEvidenceText).join("、")
      : "分割区間なし";
    const candidateEvidence = evaluated.inflectionCandidates.length
      ? evaluated.inflectionCandidates.map(candidateEvidenceText).join("、")
      : "変曲点候補なし";
    const exactAnswer = answerFor(request.form, evaluated);

    return solvedResult({
      answer: exactAnswer,
      exactAnswer,
      metadata: {
        expression: parsedExpression.normalized,
        form: request.form,
        degree: evaluated.degree,
        overallCurvature: evaluated.overallCurvature,
        inflectionPointCount: evaluated.inflectionPoints.length,
        category: "微分",
        family: "polynomial-concavity",
      },
      steps: [
        {
          type: "input",
          content: `関数 y=f(x)=${polynomialText}`,
          explanation: "問題文に明示された関数を整理し、二階導関数の符号で凹凸を判定します。",
        },
        {
          type: "constraint",
          content: "fは4次以下の有理係数多項式、定義域は全実数",
          explanation: "図・グラフ・凹凸表から情報を補わず、問題文の式を簡約前から全面検証します。",
        },
        {
          type: "transformation",
          content: `f'(x)=${firstDerivativeText}`,
          explanation: "係数をBigInt分数のまま一回形式微分します。",
        },
        {
          type: "transformation",
          content: `f''(x)=${secondDerivativeText}`,
          explanation: "もう一回形式微分し、二階導関数を二次以下にします。",
        },
        {
          type: "rule",
          content: `f''(x)=0 の全実根候補: ${candidatesText}`,
          explanation: "二階導関数の全実根を厳密に列挙し、凹凸が変わり得る点だけを候補にします。",
        },
        {
          type: "verification",
          content: `二階導関数の区間符号: ${intervalEvidence}`,
          explanation: "各開区間の厳密有理標本で符号を再計算し、正なら下に凸、負なら上に凸と判定します。",
        },
        {
          type: "verification",
          content: `候補点の符号変化と厳密値: ${candidateEvidence}`,
          explanation: "左右で二階導関数の符号が変わる候補だけを変曲点とし、元の多項式への厳密代入値を再検算します。",
        },
        {
          type: "transformation",
          content: `全体の凹凸種別: ${overallCurvatureText(evaluated.overallCurvature)}`,
          explanation: "符号が同じままの偶数重根は区間を分断せず、最大の凹凸区間へまとめます。",
        },
        { type: "result", content: `凹凸・変曲点: ${exactAnswer}` },
      ],
      verification: "一階・二階導関数を係数ごとに厳密構成し、二階導関数の全実根、各開区間の厳密有理標本、候補点前後の符号変化、元の多項式での点の値をBigInt分数または同じ二次体で再計算しました。数値微分、グラフ標本、CAS、浮動小数、許容誤差は使っていません。",
      solverId: POLYNOMIAL_CONCAVITY_SOLVER_ID,
    });
  } catch (error) {
    return concavityFailure(error);
  }
}

export default solvePolynomialConcavity;
