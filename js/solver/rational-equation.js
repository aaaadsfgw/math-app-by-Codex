import {
  ExactPolynomialError,
  evaluateExactPolynomial,
} from "../math-core/exact-polynomial.js";
import {
  analyzeExactQuadraticRoots,
  evaluateExactPolynomialAtQuadraticRoot,
} from "../math-core/exact-quadratic-roots.js";
import {
  ExactRationalFunctionError,
  exactRationalEquationPolynomial,
  exactRationalFunctionFromAst,
  exactRationalPolynomialDegree,
  formatExactRationalPolynomial,
  isZeroExactRationalPolynomial,
} from "../math-core/exact-rational-function.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import {
  hasAmbiguousDivisionMultiplication,
  parseEquationInput,
} from "./equation-input.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const RATIONAL_EQUATION_SOLVER_ID = "rational-equation";

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

function rationalCandidate(value) {
  return Object.freeze({
    type: "rational",
    exact: value.toString(),
    value,
    form: "rational",
    approximate: null,
  });
}

function solveCandidatePolynomial(polynomial) {
  const degree = exactRationalPolynomialDegree(polynomial);
  if (degree === 0) {
    return isZeroExactRationalPolynomial(polynomial)
      ? { state: "identity", candidates: [] }
      : { state: "none", candidates: [] };
  }
  if (degree === 1) {
    const [constant, coefficient] = polynomial;
    return {
      state: "finite",
      candidates: [rationalCandidate(constant.negate().divide(coefficient))],
    };
  }
  if (degree === 2) {
    const analysis = analyzeExactQuadraticRoots(polynomial);
    if (analysis.rootKind === "no-real") {
      return { state: "no-real", candidates: [], analysis };
    }
    return {
      state: "finite",
      candidates: analysis.roots.map((root) => Object.freeze({
        ...root,
        type: "quadratic",
      })),
      analysis,
    };
  }
  throw new ExactRationalFunctionError("通分後の方程式が三次以上です。", {
    code: "RESULT_DEGREE_TOO_HIGH",
    unsupported: true,
  });
}

function evaluateCandidate(polynomial, candidate) {
  if (candidate.type === "rational") {
    return evaluateExactPolynomial(polynomial, candidate.value).isZero();
  }
  return evaluateExactPolynomialAtQuadraticRoot(polynomial, candidate).isZero;
}

function exclusionConditions(domainFactors) {
  const exclusions = new Set();
  for (const factor of domainFactors) {
    const solved = solveCandidatePolynomial(factor);
    for (const candidate of solved.candidates) exclusions.add(candidate.exact);
  }
  return Object.freeze([...exclusions].map((value) => `x≠${value}`));
}

function formatApproximation(value) {
  if (!Number.isFinite(value)) return "";
  if (value === 0) return "0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e12 || magnitude < 1e-8) {
    return value.toExponential(10)
      .replace(/\.?0+e/u, "e")
      .replace(/e\+/u, "e");
  }
  return value.toLocaleString("en-US", {
    useGrouping: false,
    maximumSignificantDigits: 12,
  });
}

function approximateAnswer(candidates) {
  if (!candidates.some((candidate) => candidate.form === "radical")) return "";
  if (candidates.some((candidate) => candidate.approximate === null)) return "";
  const values = candidates.map((candidate) => formatApproximation(candidate.approximate));
  return values.every(Boolean) ? `x≈${values.join(",")}` : "";
}

function resultAnswer(candidateResult, acceptedCandidates) {
  if (candidateResult.state === "identity") return "すべての実数";
  if (acceptedCandidates.length) {
    return `x=${acceptedCandidates.map((candidate) => candidate.exact).join(",")}`;
  }
  return candidateResult.state === "no-real" ? "実数解なし" : "解なし";
}

function withConditions(answer, conditions) {
  return conditions.length ? `${answer}（ただし ${conditions.join("、")}）` : answer;
}

export function solveRationalEquation(question) {
  const source = parseEquationInput(question);
  if (!source.recognized) return unsupportedResult("有理方程式を検出できません。");
  if (!source.ok) return failedResult(RATIONAL_EQUATION_SOLVER_ID, source.error);

  let left;
  let right;
  let equationPolynomial;
  let domainFactors;
  try {
    const leftAst = parseMathExpression(source.leftSource, { symbols: ["x"] }).ast;
    const rightAst = parseMathExpression(source.rightSource, { symbols: ["x"] }).ast;
    if (
      hasAmbiguousDivisionMultiplication(source.leftSource)
      || hasAmbiguousDivisionMultiplication(source.rightSource)
    ) {
      return failedResult(
        RATIONAL_EQUATION_SOLVER_ID,
        "割り算の直後の暗黙の掛け算は曖昧です。分母と掛け算を括弧で明示してください。",
      );
    }
    left = exactRationalFunctionFromAst(leftAst);
    right = exactRationalFunctionFromAst(rightAst);
    if (!left.hasVariableDenominator && !right.hasVariableDenominator) {
      return unsupportedResult("変数を含む分母がありません。");
    }
    equationPolynomial = exactRationalEquationPolynomial(left, right);
    domainFactors = combinedDomainFactors(left, right);
  } catch (error) {
    if (error instanceof ExactRationalFunctionError || error instanceof ExactPolynomialError) {
      return error.unsupported
        ? unsupportedResult(error.message)
        : failedResult(RATIONAL_EQUATION_SOLVER_ID, error.message);
    }
    if (error instanceof MathParseError) {
      return failedResult(RATIONAL_EQUATION_SOLVER_ID, error.message);
    }
    if (error instanceof RangeError && /大きすぎ|長すぎ/u.test(error.message)) {
      return unsupportedResult(error.message);
    }
    return failedResult(
      RATIONAL_EQUATION_SOLVER_ID,
      error.message || "有理方程式を解釈できません。",
    );
  }

  let candidateResult;
  let conditions;
  try {
    candidateResult = solveCandidatePolynomial(equationPolynomial);
    conditions = exclusionConditions(domainFactors);
  } catch (error) {
    if (
      (error instanceof ExactRationalFunctionError || error instanceof ExactPolynomialError)
      && error.unsupported
    ) {
      return unsupportedResult(error.message);
    }
    return failedResult(
      RATIONAL_EQUATION_SOLVER_ID,
      error.message || "有理方程式の候補を検証できません。",
    );
  }

  const acceptedCandidates = [];
  const excludedCandidates = [];
  try {
    for (const candidate of candidateResult.candidates) {
      const solvesEquation = evaluateCandidate(equationPolynomial, candidate);
      const denominatorIsNonzero = domainFactors.every(
        (factor) => !evaluateCandidate(factor, candidate),
      );
      if (solvesEquation && denominatorIsNonzero) acceptedCandidates.push(candidate);
      else excludedCandidates.push(candidate.exact);
    }
  } catch (error) {
    if (error instanceof RangeError && /大きすぎ|長すぎ/u.test(error.message)) {
      return unsupportedResult(error.message);
    }
    return failedResult(
      RATIONAL_EQUATION_SOLVER_ID,
      error.message || "有理方程式の厳密代入に失敗しました。",
    );
  }

  const exactAnswer = resultAnswer(candidateResult, acceptedCandidates);
  const answer = withConditions(exactAnswer, conditions);
  const denominatorStep = conditions.length
    ? `定義域: ${conditions.join("、")}`
    : "定義域: 実数の範囲で追加の除外値なし";
  const candidateText = candidateResult.state === "identity"
    ? "通分後の式は恒等的に0"
    : candidateResult.candidates.length
      ? `候補: ${candidateResult.candidates.map((candidate) => candidate.exact).join(",")}`
      : "通分後の候補なし";
  const filteringText = excludedCandidates.length
    ? `分母が0になる候補 ${excludedCandidates.join(",")} を除外`
    : candidateResult.state === "identity"
      ? "元の定義域を満たすすべての実数を採用"
      : candidateResult.candidates.length
        ? "すべての候補で元の分母が0でないことを確認"
        : "実数の候補がないことを確認";

  return solvedResult({
    answer,
    exactAnswer,
    approximateAnswer: approximateAnswer(acceptedCandidates),
    kind: conditions.length ? "conditional" : "exact",
    conditions,
    steps: [
      { type: "input", content: source.source },
      {
        type: "constraint",
        content: denominatorStep,
        explanation: "約分や0倍で消える分母条件も、元の式から独立して保持します。",
      },
      {
        type: "transformation",
        content: `${formatExactRationalPolynomial(equationPolynomial)}=0`,
        explanation: "定義域を保ったまま両辺を通分し、分子の方程式を作ります。",
      },
      { type: "strategy", content: candidateText },
      {
        type: "verification",
        content: filteringText,
        explanation: "候補を通分前の分母因子と等式へ厳密代入します。",
      },
      { type: "result", content: answer },
    ],
    verification: "通分後の等式が厳密に0になり、元式由来の全分母因子が厳密に0でない候補だけを採用しました。",
    solverId: RATIONAL_EQUATION_SOLVER_ID,
  });
}

export default solveRationalEquation;
