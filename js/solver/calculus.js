import {
  CalculusRuleError,
  differentiateExpressionAst,
} from "../math-core/calculus-rules.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import {
  equivalentInWorker,
  integrateInWorker,
  simplifyInWorker,
} from "../math-core/symbolic-client.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const DERIVATIVE_SOLVER_ID = "derivative";
export const INDEFINITE_INTEGRAL_SOLVER_ID = "indefinite-integral";

export const DEFAULT_CALCULUS_OPERATIONS = Object.freeze({
  equivalent: equivalentInWorker,
  integrate: integrateInWorker,
  simplify: simplifyInWorker,
});

function cleanRequest(value) {
  return normalizeMathNotation(value)
    .replace(/[。．.!！?？]+$/gu, "")
    .trim();
}

function expressionFromAssignment(value) {
  const parts = value.split("=");
  if (parts.length === 1) return value.trim();
  if (
    parts.length === 2
    && /^(?:y|f\s*\(\s*x\s*\))$/iu.test(parts[0].trim())
  ) {
    return parts[1].trim();
  }
  return "";
}

function extractDerivativeRequest(question) {
  const text = cleanRequest(question);
  const patterns = [
    /^(?:次の)?(?:関数|式)?\s*(.+?)\s*を\s*(?:xで)?微分(?:せよ|しなさい|してください)?$/u,
    /^(?:次の)?(?:関数|式)?\s*(.+?)\s*の\s*導関数(?:を求めよ|を求めなさい)?$/u,
    /^d\s*\/\s*dx\s*(.+)$/iu,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const expression = expressionFromAssignment(match[1]);
    if (expression) return expression;
  }
  return null;
}

function extractIntegralRequest(question) {
  const text = cleanRequest(question);
  if (/定積分|から.+まで|∫\s*[_^]/u.test(text)) {
    return { recognized: true, definite: true, expression: "" };
  }
  const integralNotation = text.match(
    /^∫\s*(.+?)\s*d\s*x\s*(?:を求めよ|を計算せよ|を求めなさい)?$/iu,
  );
  if (integralNotation) {
    return {
      recognized: true,
      definite: false,
      expression: integralNotation[1].trim(),
    };
  }
  const patterns = [
    /^(?:次の)?(?:関数|式)?\s*(.+?)\s*を\s*(?:xで)?(?:不定)?積分(?:せよ|しなさい|してください)?$/u,
    /^(?:次の)?(?:関数|式)?\s*(.+?)\s*の\s*不定積分(?:を求めよ|を求めなさい)?$/u,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    return { recognized: true, definite: false, expression: match[1].trim() };
  }
  return {
    recognized: /積分|∫/u.test(text),
    definite: false,
    expression: "",
  };
}

function parseSingleVariableExpression(expression) {
  return parseMathExpression(expression, { symbols: ["x"] });
}

function conditionDisplay(answer, conditions) {
  return conditions.length
    ? `${answer}（ただし ${conditions.join("、")}）`
    : answer;
}

export async function solveDerivative(
  question,
  { symbolicOperations = DEFAULT_CALCULUS_OPERATIONS } = {},
) {
  const expression = extractDerivativeRequest(question);
  if (!expression) return unsupportedResult("微分する1つの式を検出できません。");
  if (
    typeof symbolicOperations.simplify !== "function"
    || typeof symbolicOperations.equivalent !== "function"
  ) {
    return failedResult(DERIVATIVE_SOLVER_ID, "微分結果の整理・検証機能を利用できません。");
  }

  try {
    const parsed = parseSingleVariableExpression(expression);
    const ruleResult = differentiateExpressionAst(parsed.ast);
    const answer = String(await symbolicOperations.simplify(ruleResult.expression)).trim();
    if (!answer) return failedResult(DERIVATIVE_SOLVER_ID, "微分結果が空です。");
    if (!await symbolicOperations.equivalent(ruleResult.expression, answer)) {
      return failedResult(DERIVATIVE_SOLVER_ID, "微分規則で得た式との同値性を確認できませんでした。");
    }
    const displayAnswer = conditionDisplay(answer, ruleResult.conditions);
    return solvedResult({
      answer: displayAnswer,
      exactAnswer: answer,
      kind: ruleResult.conditions.length ? "conditional" : "exact",
      conditions: ruleResult.conditions,
      steps: [
        { type: "input", content: `入力関数: ${parsed.normalized}` },
        {
          type: "rule",
          content: "項ごとに積・商・合成関数の微分規則を適用",
          explanation: "合成関数では外側を微分し、内側の導関数を掛けます。",
        },
        { type: "result", content: `導関数: ${displayAnswer}` },
      ],
      verification: "プロジェクト側の微分規則で構成した式と、整理後の導関数との差が0になることを確認しました。",
      solverId: DERIVATIVE_SOLVER_ID,
    });
  } catch (error) {
    if (error instanceof MathParseError) {
      return failedResult(DERIVATIVE_SOLVER_ID, error.message);
    }
    if (error instanceof CalculusRuleError) {
      return unsupportedResult(error.message);
    }
    return failedResult(DERIVATIVE_SOLVER_ID, error.message || "微分処理に失敗しました。");
  }
}

export async function solveIndefiniteIntegral(
  question,
  { symbolicOperations = DEFAULT_CALCULUS_OPERATIONS } = {},
) {
  const request = extractIntegralRequest(question);
  if (!request.recognized) return unsupportedResult("積分する1つの式を検出できません。");
  if (request.definite) return unsupportedResult("定積分はまだ対応していません。");
  if (!request.expression) {
    return failedResult(INDEFINITE_INTEGRAL_SOLVER_ID, "積分する式を入力してください。");
  }
  if (
    typeof symbolicOperations.integrate !== "function"
    || typeof symbolicOperations.equivalent !== "function"
  ) {
    return failedResult(
      INDEFINITE_INTEGRAL_SOLVER_ID,
      "積分候補の計算・検証機能を利用できません。",
    );
  }

  try {
    const parsed = parseSingleVariableExpression(request.expression);
    const antiderivative = String(
      await symbolicOperations.integrate(parsed.cas, "x"),
    ).trim();
    if (!antiderivative) {
      return failedResult(INDEFINITE_INTEGRAL_SOLVER_ID, "積分候補が空です。");
    }
    const antiderivativeAst = parseSingleVariableExpression(antiderivative);
    const differentiated = differentiateExpressionAst(antiderivativeAst.ast);
    if (differentiated.conditions.length) {
      return unsupportedResult(
        "定義域を分けて扱う必要がある不定積分はまだ対応していません。",
      );
    }
    if (!await symbolicOperations.equivalent(differentiated.expression, parsed.cas)) {
      return failedResult(
        INDEFINITE_INTEGRAL_SOLVER_ID,
        "積分候補を微分しても元の式と一致しませんでした。",
      );
    }
    const answer = `${antiderivative}+C`;
    return solvedResult({
      answer,
      exactAnswer: answer,
      steps: [
        { type: "input", content: `被積分関数: ${parsed.normalized}` },
        {
          type: "rule",
          content: "基本積分公式と線形性を適用",
          explanation: "和は項ごとに積分し、定数倍はそのまま外へ出します。",
        },
        { type: "result", content: `不定積分: ${answer}` },
      ],
      verification: "積分候補をプロジェクト側の微分規則で微分し、元の被積分関数との差が0になることを確認しました。",
      solverId: INDEFINITE_INTEGRAL_SOLVER_ID,
    });
  } catch (error) {
    if (error instanceof MathParseError || error instanceof CalculusRuleError) {
      return unsupportedResult(error.message);
    }
    return failedResult(
      INDEFINITE_INTEGRAL_SOLVER_ID,
      error.message || "不定積分の処理に失敗しました。",
    );
  }
}
