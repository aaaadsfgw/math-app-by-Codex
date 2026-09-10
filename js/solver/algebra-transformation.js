import {
  MathParseError,
  collectExactNonzeroDomainConditions,
  parseMathExpression,
} from "../math-core/expression-parser.js";
import {
  equivalentInWorker,
  expandInWorker,
  factorInWorker,
  simplifyInWorker,
} from "../math-core/symbolic-client.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { failedResult, solvedResult, unsupportedResult } from "./utils.js";

export const ALGEBRA_TRANSFORMATION_SOLVER_ID = "algebra-transformation";

const ACTION_WORDS = "展開|因数分解|簡単に|簡約|整理";
const ACTION_LABELS = Object.freeze({
  expand: "展開",
  factor: "因数分解",
  simplify: "簡約",
});

export const DEFAULT_SYMBOLIC_OPERATIONS = Object.freeze({
  equivalent: equivalentInWorker,
  expand: expandInWorker,
  factor: factorInWorker,
  simplify: simplifyInWorker,
});

function actionKey(word) {
  if (word === "展開") return "expand";
  if (word === "因数分解") return "factor";
  return "simplify";
}

function extractRequest(question) {
  const text = normalizeMathNotation(question)
    .replace(/[。．.!！?？]+$/gu, "")
    .trim();
  const suffix = "(?:せよ|しなさい|してください)?";
  const patterns = [
    new RegExp(`^(?:次の)?式\\s*[「『]?(.+?)[」』]?\\s*を\\s*(${ACTION_WORDS})${suffix}$`, "u"),
    new RegExp(`^(?:次の)?式\\s*を?\\s*(${ACTION_WORDS})${suffix}\\s*[:：]\\s*(.+)$`, "u"),
    new RegExp(`^(${ACTION_WORDS})${suffix}\\s*[:：]\\s*(.+)$`, "u"),
    new RegExp(`^(.+?)\\s*を?\\s*(${ACTION_WORDS})${suffix}$`, "u"),
  ];

  for (let index = 0; index < patterns.length; index += 1) {
    const match = text.match(patterns[index]);
    if (!match) continue;
    const actionFirst = index === 1 || index === 2;
    const word = actionFirst ? match[1] : match[2];
    const expression = (actionFirst ? match[2] : match[1]).trim();
    return { action: actionKey(word), expression };
  }
  return null;
}

export async function solveAlgebraTransformation(
  question,
  { symbolicOperations = DEFAULT_SYMBOLIC_OPERATIONS } = {},
) {
  const request = extractRequest(question);
  if (!request) return unsupportedResult("展開・因数分解・簡約の指示を検出できません");
  if (request.expression.includes("=")) {
    return unsupportedResult("等式ではなく、変形する1つの式を入力してください");
  }

  let parsed;
  try {
    parsed = parseMathExpression(request.expression);
  } catch (error) {
    if (error instanceof MathParseError) {
      return failedResult(ALGEBRA_TRANSFORMATION_SOLVER_ID, error.message);
    }
    throw error;
  }

  const transform = symbolicOperations[request.action];
  if (typeof transform !== "function" || typeof symbolicOperations.equivalent !== "function") {
    return failedResult(ALGEBRA_TRANSFORMATION_SOLVER_ID, "記号計算操作を利用できません");
  }

  try {
    const answer = String(await transform(parsed.cas)).trim();
    if (!answer) {
      return failedResult(ALGEBRA_TRANSFORMATION_SOLVER_ID, "式変形の結果が空です");
    }
    const equivalent = await symbolicOperations.equivalent(parsed.cas, answer);
    if (!equivalent) {
      return failedResult(ALGEBRA_TRANSFORMATION_SOLVER_ID, "元の式との同値性を確認できませんでした");
    }
    const label = ACTION_LABELS[request.action];
    const conditions = collectExactNonzeroDomainConditions(parsed.ast);
    const displayAnswer = conditions.length
      ? `${answer}（ただし ${conditions.join("、")}）`
      : answer;
    return solvedResult({
      answer: displayAnswer,
      exactAnswer: answer,
      kind: conditions.length ? "conditional" : "exact",
      conditions,
      steps: [
        { type: "input", content: `入力式: ${parsed.normalized}` },
        {
          type: "rule",
          content: `${label}規則を順に適用`,
          explanation: "元の式と値が変わらない規則だけを使用します。",
        },
        { type: "result", content: `${label}結果: ${displayAnswer}` },
      ],
      verification: conditions.length
        ? `定義域「${conditions.join("、")}」で元の式と${label}結果の差が0になることを確認しました`
        : `元の式と${label}結果の差を記号的に簡約し、0になることを確認しました`,
      solverId: ALGEBRA_TRANSFORMATION_SOLVER_ID,
    });
  } catch (error) {
    return failedResult(
      ALGEBRA_TRANSFORMATION_SOLVER_ID,
      error?.message || "式変形中にエラーが発生しました",
    );
  }
}

export default solveAlgebraTransformation;
