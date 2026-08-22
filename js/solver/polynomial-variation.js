import {
  ExactPolynomialVariationError,
  evaluateExactPolynomialVariation,
} from "../math-core/exact-polynomial-variation.js";
import {
  ExactPolynomialError,
  exactPolynomialFromAst,
} from "../math-core/exact-polynomial.js";
import { formatExactPolynomialForIntegral } from "../math-core/exact-polynomial-integral.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { parsePolynomialVariationInput } from "./polynomial-variation-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const POLYNOMIAL_VARIATION_SOLVER_ID = "polynomial-variation";

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

function variationFailure(error) {
  try {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialError
      || error instanceof ExactPolynomialVariationError
    ) {
      return recognizedResult(error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(POLYNOMIAL_VARIATION_SOLVER_ID, error.message));
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ|超え/u.test(error.message)) {
      return recognizedResult(unsupportedResult(error.message));
    }
  } catch {
    // Fall through to a stable invalid result for hostile thrown values.
  }
  return recognizedResult(failedResult(
    POLYNOMIAL_VARIATION_SOLVER_ID,
    safeErrorMessage(error, "多項式の増減・極値を厳密に判定できませんでした。"),
  ));
}

function endpointExact(endpoint) {
  if (endpoint === null || endpoint === undefined) return "";
  if (typeof endpoint === "string") return endpoint;
  if (typeof endpoint.exact === "string") return endpoint.exact;
  if (typeof endpoint.pointExact === "string") return endpoint.pointExact;
  if (endpoint.value && typeof endpoint.value.toString === "function") {
    return endpoint.value.toString();
  }
  return String(endpoint);
}

function intervalText(interval, { forceOpen = false } = {}) {
  const lower = interval.lower === null ? "-∞" : endpointExact(interval.lower);
  const upper = interval.upper === null ? "+∞" : endpointExact(interval.upper);
  const lowerClosed = !forceOpen && interval.lower !== null && interval.lowerClosed === true;
  const upperClosed = !forceOpen && interval.upper !== null && interval.upperClosed === true;
  return `${lowerClosed ? "[" : "("}${lower},${upper}${upperClosed ? "]" : ")"}`;
}

function intervalsFor(evaluated, behavior) {
  const text = evaluated.maximalIntervals
    .filter((interval) => interval.behavior === behavior)
    .map((interval) => intervalText(interval));
  return text.length ? text.join(" または ") : EMPTY_TEXT;
}

function pointText(point) {
  return `(${point.pointExact},${point.valueExact})`;
}

function pointsText(points) {
  return points.length ? points.map(pointText).join("、") : EMPTY_TEXT;
}

function monotonicitySections(evaluated) {
  return [
    `増加区間: ${intervalsFor(evaluated, "increasing")}`,
    `減少区間: ${intervalsFor(evaluated, "decreasing")}`,
    `一定区間: ${intervalsFor(evaluated, "constant")}`,
  ];
}

function extremaSections(evaluated) {
  return [
    `極大: ${pointsText(evaluated.localMaxima)}`,
    `極小: ${pointsText(evaluated.localMinima)}`,
    `極値でない停留点: ${pointsText(evaluated.stationaryNonExtrema)}`,
  ];
}

function answerFor(form, evaluated) {
  const sections = form === "monotonicity"
    ? monotonicitySections(evaluated)
    : form === "extrema"
      ? extremaSections(evaluated)
      : [...monotonicitySections(evaluated), ...extremaSections(evaluated)];
  return sections.join("; ");
}

function signText(sign) {
  return sign > 0 ? "+" : sign < 0 ? "-" : "0";
}

function sampleExact(sample) {
  if (sample === null || sample === undefined) return "なし";
  if (typeof sample.exact === "string") return sample.exact;
  if (
    typeof sample.numerator === "bigint"
    && typeof sample.denominator === "bigint"
  ) {
    return sample.denominator === 1n
      ? sample.numerator.toString()
      : `${sample.numerator}/${sample.denominator}`;
  }
  return String(sample);
}

function intervalEvidenceText(interval) {
  return `${intervalText(interval, { forceOpen: true })}: `
    + `標本 x=${sampleExact(interval.sample)}、f'(x)の符号=${signText(interval.derivativeSign)}`;
}

function classificationText(classification) {
  if (classification === "local-maximum") return "極大";
  if (classification === "local-minimum") return "極小";
  if (classification === "stationary-non-extremum") return "極値でない停留点";
  return classification || "停留点";
}

function criticalEvidenceText(point) {
  return `x=${point.pointExact}: ${signText(point.leftSign)}→${signText(point.rightSign)}`
    + `、${classificationText(point.classification)}、f(${point.pointExact})=${point.valueExact}`;
}

function behaviorText(behavior) {
  if (behavior === "increasing") return "単調増加";
  if (behavior === "decreasing") return "単調減少";
  if (behavior === "constant") return "一定";
  return "区間ごとに増減";
}

export function solvePolynomialVariation(question) {
  let request;
  try {
    request = parsePolynomialVariationInput(question);
  } catch (error) {
    return variationFailure(error);
  }

  if (!request.recognized) {
    return unsupportedResult("式で完全に指定された多項式の増減・極値問題を検出できません。");
  }
  if (!request.ok) {
    const unsupported = typeof request.errorCode === "string"
      && request.errorCode.startsWith("UNSUPPORTED_");
    return recognizedResult(unsupported
      ? unsupportedResult(request.error)
      : failedResult(
        POLYNOMIAL_VARIATION_SOLVER_ID,
        request.error || "増減・極値問題の入力形式が正しくありません。",
      ));
  }

  try {
    const parsedExpression = parseMathExpression(request.expression, { symbols: ["x"] });
    const polynomial = exactPolynomialFromAst(parsedExpression.ast, {
      maxIntermediateDegree: 3,
    });
    const evaluated = evaluateExactPolynomialVariation(polynomial);
    if (evaluated.verification?.verified !== true) {
      throw new ExactPolynomialVariationError(
        "増減・極値の厳密検証証拠が完了していません。",
        { code: "VARIATION_VERIFICATION_INCOMPLETE" },
      );
    }

    const polynomialText = formatExactPolynomialForIntegral(evaluated.polynomial);
    const derivativeText = formatExactPolynomialForIntegral(
      evaluated.derivativePolynomial,
    );
    const criticalRootsText = evaluated.criticalPoints.length
      ? evaluated.criticalPoints.map(({ pointExact }) => pointExact).join("、")
      : EMPTY_TEXT;
    const intervalEvidence = evaluated.intervals.length
      ? evaluated.intervals.map(intervalEvidenceText).join("、")
      : "分割区間なし";
    const criticalEvidence = evaluated.criticalPoints.length
      ? evaluated.criticalPoints.map(criticalEvidenceText).join("、")
      : "停留点なし";
    const monotonicityText = monotonicitySections(evaluated).join("、");
    const exactAnswer = answerFor(request.form, evaluated);

    return solvedResult({
      answer: exactAnswer,
      exactAnswer,
      metadata: {
        expression: parsedExpression.normalized,
        form: request.form,
        degree: evaluated.degree,
        overallBehavior: evaluated.overallBehavior,
        criticalPointCount: evaluated.criticalPoints.length,
        family: "polynomial-variation",
      },
      steps: [
        {
          type: "input",
          content: `関数 y=f(x)=${polynomialText}`,
        },
        {
          type: "constraint",
          content: "fは3次以下の有理係数多項式、定義域は全実数",
          explanation: "図・グラフ・増減表から情報を補わず、問題文の式を簡約前から全面検証します。",
        },
        {
          type: "transformation",
          content: `f'(x)=${derivativeText}`,
          explanation: "係数をBigInt分数のまま形式微分し、導関数を2次以下にします。",
        },
        {
          type: "rule",
          content: `f'(x)=0 の全実根: ${criticalRootsText}`,
          explanation: "一次または二次の導関数について、実根を重複度付きで完全に列挙します。",
        },
        {
          type: "verification",
          content: `導関数の区間符号: ${intervalEvidence}`,
          explanation: "全臨界点で数直線を分け、各開区間の厳密有理標本で符号を再計算します。",
        },
        {
          type: "transformation",
          content: `${monotonicityText}、全体=${behaviorText(evaluated.overallBehavior)}`,
          explanation: "同じ向きが孤立した停留点を挟む区間は結合し、有限臨界端点を含む最大単調区間にします。",
        },
        {
          type: "verification",
          content: `臨界点の符号遷移と厳密値: ${criticalEvidence}`,
          explanation: "左右の導関数符号から極大・極小・極値でない停留点を分け、元の多項式へ厳密代入します。",
        },
        { type: "result", content: `増減・極値: ${exactAnswer}` },
      ],
      verification: "導関数の全実根を重複度付きで完全列挙し、各開区間の厳密有理標本、臨界点前後の符号遷移、臨界値をBigInt分数または同じ二次体で再計算しました。数値微分、グラフ標本、CAS、浮動小数、許容誤差は使っていません。",
      solverId: POLYNOMIAL_VARIATION_SOLVER_ID,
    });
  } catch (error) {
    return variationFailure(error);
  }
}

export default solvePolynomialVariation;
