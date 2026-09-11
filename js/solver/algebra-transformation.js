import {
  MathParseError,
  collectExactNonzeroDomainConditions,
  parseMathExpression,
  serializeExpressionAst,
} from "../math-core/expression-parser.js";
import { exactRationalFunctionFromAst } from "../math-core/exact-rational-function.js";
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

function astPrecedence(node) {
  if (node?.type === "binary") {
    if (["+", "-"].includes(node.operator)) return 1;
    if (["*", "/"].includes(node.operator)) return 2;
    if (node.operator === "^") return 3;
  }
  if (node?.type === "unary") return 4;
  return 5;
}

function formatLearningAst(node, parentOperator = "", side = "") {
  if (!node || typeof node !== "object") throw new TypeError("途中式のASTが不正です。");
  let text;
  if (node.type === "number") text = node.value;
  else if (["symbol", "constant"].includes(node.type)) text = node.name;
  else if (node.type === "call") {
    text = `${node.name}(${node.args.map((argument) => formatLearningAst(argument)).join(",")})`;
  } else if (node.type === "unary") {
    text = `${node.operator}${formatLearningAst(node.argument, "unary", "right")}`;
  } else if (node.type === "binary") {
    text = `${formatLearningAst(node.left, node.operator, "left")}${node.operator}${formatLearningAst(node.right, node.operator, "right")}`;
  } else {
    throw new TypeError("途中式に未対応のAST要素があります。");
  }

  if (!parentOperator) return text;
  const precedence = astPrecedence(node);
  const parentPrecedence = parentOperator === "unary"
    ? 4
    : astPrecedence({ type: "binary", operator: parentOperator });
  const requiresParentheses = precedence < parentPrecedence
    || (node.type === "unary")
    || (parentOperator === "^" && side === "left" && precedence <= 4)
    || (
      side === "right"
      && (
        (parentOperator === "-" && precedence <= 1)
        || (parentOperator === "/" && precedence <= 2)
        || (parentOperator === "^" && precedence <= 3)
      )
    );
  return requiresParentheses ? `(${text})` : text;
}

function isOneAst(node) {
  return node?.type === "number" && /^(?:1|1\.0*)$/u.test(node.value);
}

function productAst(left, right) {
  if (isOneAst(left)) return right;
  if (isOneAst(right)) return left;
  return { type: "binary", operator: "*", left, right };
}

function rationalAdditionPlan(ast) {
  if (
    ast?.type !== "binary"
    || !["+", "-"].includes(ast.operator)
    || ast.left?.type !== "binary"
    || ast.left.operator !== "/"
    || ast.right?.type !== "binary"
    || ast.right.operator !== "/"
  ) {
    return null;
  }
  try {
    exactRationalFunctionFromAst(ast);
  } catch {
    return null;
  }

  const leftNumerator = productAst(ast.left.left, ast.right.right);
  const rightNumerator = productAst(ast.right.left, ast.left.right);
  const commonDenominator = productAst(ast.left.right, ast.right.right);
  const combinedNumerator = {
    type: "binary",
    operator: ast.operator,
    left: leftNumerator,
    right: rightNumerator,
  };
  const leftFraction = {
    type: "binary",
    operator: "/",
    left: leftNumerator,
    right: commonDenominator,
  };
  const rightFraction = {
    type: "binary",
    operator: "/",
    left: rightNumerator,
    right: commonDenominator,
  };
  const separated = {
    type: "binary",
    operator: ast.operator,
    left: leftFraction,
    right: rightFraction,
  };
  const combined = {
    type: "binary",
    operator: "/",
    left: combinedNumerator,
    right: commonDenominator,
  };
  return Object.freeze({
    leftCas: serializeExpressionAst(ast.left),
    rightCas: serializeExpressionAst(ast.right),
    leftOriginal: formatLearningAst(ast.left),
    rightOriginal: formatLearningAst(ast.right),
    leftDenominator: formatLearningAst(ast.left.right),
    rightDenominator: formatLearningAst(ast.right.right),
    commonDenominator: formatLearningAst(commonDenominator),
    leftFraction: formatLearningAst(leftFraction),
    rightFraction: formatLearningAst(rightFraction),
    separated: formatLearningAst(separated),
    combined: formatLearningAst(combined),
  });
}

async function verifiedRationalAdditionSteps({
  parsed,
  displayAnswer,
  conditions,
  equivalent,
}) {
  const plan = rationalAdditionPlan(parsed.ast);
  if (!plan) return null;
  try {
    for (const [source, expression] of [
      [plan.leftCas, plan.leftFraction],
      [plan.rightCas, plan.rightFraction],
      [parsed.cas, plan.separated],
      [parsed.cas, plan.combined],
    ]) {
      if (!await equivalent(source, expression)) return null;
    }
  } catch {
    return null;
  }

  const steps = [
    { type: "input", content: `入力式: ${parsed.normalized}` },
  ];
  if (conditions.length) {
    steps.push({
      type: "constraint",
      content: `定義域: ${conditions.join("、")}`,
      explanation: "元の分母が0になる値は、通分や約分の後も除外したままにします。",
    });
  }
  steps.push(
    {
      type: "strategy",
      content: `共通分母: ${plan.commonDenominator}`,
      explanation: `分母 ${plan.leftDenominator} と ${plan.rightDenominator} をそろえるため、共通分母 ${plan.commonDenominator} を考えます。`,
    },
    {
      type: "guided-transformation",
      content: plan.separated,
      explanation: `${plan.leftOriginal}=${plan.leftFraction}、${plan.rightOriginal}=${plan.rightFraction} と直します。`,
    },
    {
      type: "transformation",
      content: plan.combined,
      explanation: "共通分母はそのままにして、分子を1つにまとめます。",
    },
    { type: "result", content: `簡約結果: ${displayAnswer}` },
  );
  return steps;
}

function genericSteps({ parsed, label, displayAnswer }) {
  return [
    { type: "input", content: `入力式: ${parsed.normalized}` },
    {
      type: "rule",
      content: `${label}規則を順に適用`,
      explanation: "元の式と値が変わらない規則だけを使用します。",
    },
    { type: "result", content: `${label}結果: ${displayAnswer}` },
  ];
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
    const rationalSteps = request.action === "simplify"
      ? await verifiedRationalAdditionSteps({
          parsed,
          displayAnswer,
          conditions,
          equivalent: symbolicOperations.equivalent,
        })
      : null;
    return solvedResult({
      answer: displayAnswer,
      exactAnswer: answer,
      kind: conditions.length ? "conditional" : "exact",
      conditions,
      steps: rationalSteps ?? genericSteps({ parsed, label, displayAnswer }),
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
