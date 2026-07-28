import {
  EPSILON,
  evaluatePolynomial,
  failedResult,
  formatNumber,
  greatestCommonDivisor,
  nearlyEqual,
  parsePolynomialEquation,
  simplifySquareRoot,
  solvedResult,
  unsupportedResult,
} from "./utils.js";

export const QUADRATIC_SOLVER_ID = "quadratic-equation";

function exactIrrationalAnswer(a, b, discriminant) {
  if (![a, b, discriminant].every(Number.isInteger)) return null;
  const { outside, inside } = simplifySquareRoot(discriminant);
  if (inside <= 1) return null;
  let numeratorConstant = -b;
  let radicalCoefficient = outside;
  let denominator = 2 * a;
  const divisor = greatestCommonDivisor(
    greatestCommonDivisor(numeratorConstant, radicalCoefficient),
    denominator,
  );
  numeratorConstant /= divisor;
  radicalCoefficient /= divisor;
  denominator /= divisor;
  if (denominator < 0) {
    numeratorConstant *= -1;
    radicalCoefficient *= -1;
    denominator *= -1;
  }
  const radical = `${Math.abs(radicalCoefficient) === 1 ? "" : Math.abs(radicalCoefficient)}√${inside}`;
  const plusMinus = radicalCoefficient < 0 ? `∓${radical}` : `±${radical}`;
  const numerator = `${numeratorConstant === 0 ? "" : numeratorConstant}${plusMinus}`;
  return denominator === 1 ? `x=${numerator}` : `x=(${numerator})/${denominator}`;
}

function sortedRoots(a, b, discriminant) {
  const squareRoot = Math.sqrt(discriminant);
  return [(-b - squareRoot) / (2 * a), (-b + squareRoot) / (2 * a)].sort((left, right) => left - right);
}

export function solveQuadraticEquation(question) {
  const parsed = parsePolynomialEquation(question);
  if (!parsed.ok) {
    return parsed.unsupported
      ? unsupportedResult(parsed.error)
      : failedResult(QUADRATIC_SOLVER_ID, parsed.error);
  }
  const [c = 0, b = 0, a = 0] = parsed.coefficients;
  const hasHigherTerm = parsed.coefficients.slice(3).some((value) => Math.abs(value) > EPSILON);
  if (hasHigherTerm || nearlyEqual(a, 0)) return unsupportedResult("二次方程式ではありません");

  const discriminant = b * b - 4 * a * c;
  const steps = [
    parsed.equation,
    `a=${formatNumber(a)}, b=${formatNumber(b)}, c=${formatNumber(c)}`,
    `判別式 D=b^2-4ac=${formatNumber(discriminant)}`,
  ];

  if (discriminant < -EPSILON) {
    return solvedResult({
      answer: "実数解なし",
      steps: [...steps, "D<0のため実数解はない"],
      verification: `判別式D=${formatNumber(discriminant)}<0のため、実数の範囲に解はありません`,
      solverId: QUADRATIC_SOLVER_ID,
    });
  }

  if (nearlyEqual(discriminant, 0)) {
    const root = -b / (2 * a);
    const residual = evaluatePolynomial(parsed.coefficients, root);
    if (!nearlyEqual(residual, 0, 1e-8)) return failedResult(QUADRATIC_SOLVER_ID, "代入検証に失敗しました");
    const answer = `x=${formatNumber(root)}`;
    return solvedResult({
      answer,
      steps: [...steps, `x=-b/(2a)=${formatNumber(root)}`],
      verification: `${answer}を代入すると式の値は${formatNumber(residual)}です`,
      solverId: QUADRATIC_SOLVER_ID,
    });
  }

  const roots = sortedRoots(a, b, discriminant);
  const residuals = roots.map((root) => evaluatePolynomial(parsed.coefficients, root));
  if (residuals.some((residual) => !nearlyEqual(residual, 0, 1e-7))) {
    return failedResult(QUADRATIC_SOLVER_ID, "代入検証に失敗しました");
  }

  const isRationalSquare = nearlyEqual(Math.sqrt(discriminant), Math.round(Math.sqrt(discriminant)));
  const approximate = roots.map((root) => formatNumber(root));
  const exact = isRationalSquare ? null : exactIrrationalAnswer(a, b, discriminant);
  const answer = exact
    ? `${exact}（約${approximate.join(",")}）`
    : `x=${approximate.join(",")}`;
  return solvedResult({
    answer,
    steps: [...steps, "x=(-b±√D)/(2a)", answer],
    verification: `2つの解を代入した残差は${residuals.map((value) => formatNumber(value)).join(",")}です`,
    solverId: QUADRATIC_SOLVER_ID,
  });
}

export default solveQuadraticEquation;
