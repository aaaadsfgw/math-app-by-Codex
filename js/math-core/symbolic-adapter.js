import "../../vendor/algebrite/algebrite.bundle.js";

const engine = globalThis.Algebrite;
delete globalThis.Algebrite;

const MAX_EXPRESSION_LENGTH = 2_000;
const MAX_RESULT_LENGTH = 20_000;
const VARIABLE_PATTERN = /^[a-z][a-z0-9_]*$/u;
const SAFE_CHARACTERS = /^[0-9A-Za-z_+\-*/^()., \t]+$/u;
const IDENTIFIER_PATTERN = /[A-Za-z][A-Za-z0-9_]*/gu;
const SAFE_CONSTANTS = new Set(["e", "i", "pi"]);
const SAFE_FUNCTIONS = new Set([
  "abs",
  "arccos",
  "arcsin",
  "arctan",
  "cos",
  "exp",
  "log",
  "sin",
  "sqrt",
  "tan",
]);
const DEFAULT_VARIABLES = Object.freeze([
  "a",
  "b",
  "c",
  "k",
  "m",
  "n",
  "t",
  "x",
  "y",
  "z",
]);

export class SymbolicEngineError extends Error {
  constructor(message, { code = "SYMBOLIC_ENGINE_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "SymbolicEngineError";
    this.code = code;
  }
}

function normalizeVariable(value) {
  const variable = String(value ?? "").trim().toLowerCase();
  if (!VARIABLE_PATTERN.test(variable)) {
    throw new SymbolicEngineError("変数名が許可された形式ではありません。", {
      code: "INVALID_VARIABLE",
    });
  }
  return variable;
}

function allowedVariableSet(variables) {
  const values = Array.isArray(variables) ? variables : [variables];
  return new Set([...DEFAULT_VARIABLES, ...values.filter(Boolean).map(normalizeVariable)]);
}

function assertBalancedParentheses(expression) {
  let depth = 0;
  for (const character of expression) {
    if (character === "(") depth += 1;
    if (character === ")") depth -= 1;
    if (depth < 0) break;
  }
  if (depth !== 0) {
    throw new SymbolicEngineError("括弧の対応が正しくありません。", {
      code: "INVALID_EXPRESSION",
    });
  }
}

export function assertSafeSymbolicExpression(value, { variables = DEFAULT_VARIABLES } = {}) {
  const expression = String(value ?? "").trim();
  if (!expression) {
    throw new SymbolicEngineError("数式が空です。", { code: "EMPTY_EXPRESSION" });
  }
  if (expression.length > MAX_EXPRESSION_LENGTH) {
    throw new SymbolicEngineError("数式が長すぎます。", { code: "EXPRESSION_TOO_LONG" });
  }
  if (!SAFE_CHARACTERS.test(expression)) {
    throw new SymbolicEngineError("数式に許可されていない文字が含まれています。", {
      code: "UNSAFE_EXPRESSION",
    });
  }
  assertBalancedParentheses(expression);

  const allowedVariables = allowedVariableSet(variables);
  for (const match of expression.matchAll(IDENTIFIER_PATTERN)) {
    const identifier = match[0].toLowerCase();
    const suffix = expression.slice(match.index + match[0].length);
    const isFunctionCall = /^[ \t]*\(/u.test(suffix);
    const allowed = isFunctionCall
      ? SAFE_FUNCTIONS.has(identifier)
      : SAFE_CONSTANTS.has(identifier) || allowedVariables.has(identifier);
    if (!allowed) {
      throw new SymbolicEngineError(`許可されていない識別子です: ${match[0]}`, {
        code: "UNSAFE_IDENTIFIER",
      });
    }
  }
  return expression;
}

function runEngine(command) {
  if (!engine || typeof engine.run !== "function") {
    throw new SymbolicEngineError("記号計算エンジンを初期化できません。", {
      code: "ENGINE_UNAVAILABLE",
    });
  }

  try {
    engine.run("clearall");
    const output = String(engine.run(command) ?? "").trim();
    if (!output || /\bStop:\s/iu.test(output)) {
      throw new SymbolicEngineError("記号計算エンジンが数式を処理できませんでした。", {
        code: "ENGINE_REJECTED_EXPRESSION",
      });
    }
    if (output.length > MAX_RESULT_LENGTH) {
      throw new SymbolicEngineError("記号計算結果が長すぎます。", {
        code: "RESULT_TOO_LONG",
      });
    }
    return output;
  } catch (error) {
    if (error instanceof SymbolicEngineError) throw error;
    throw new SymbolicEngineError("記号計算中にエラーが発生しました。", {
      code: "ENGINE_FAILURE",
      cause: error,
    });
  }
}

export function simplifySymbolic(expression, options = {}) {
  const safeExpression = assertSafeSymbolicExpression(expression, options);
  return runEngine(`simplify(rationalize(${safeExpression}))`);
}

export function expandSymbolic(expression, options = {}) {
  const safeExpression = assertSafeSymbolicExpression(expression, options);
  return runEngine(`expand(${safeExpression})`);
}

export function factorSymbolic(expression, options = {}) {
  const safeExpression = assertSafeSymbolicExpression(expression, options);
  return runEngine(`factor(${safeExpression})`);
}

export function differentiateSymbolic(expression, variable = "x") {
  const safeVariable = normalizeVariable(variable);
  const safeExpression = assertSafeSymbolicExpression(expression, {
    variables: [safeVariable],
  });
  return runEngine(`d(${safeExpression},${safeVariable})`);
}

export function integrateSymbolic(expression, variable = "x") {
  const safeVariable = normalizeVariable(variable);
  const safeExpression = assertSafeSymbolicExpression(expression, {
    variables: [safeVariable],
  });
  return runEngine(`integral(${safeExpression},${safeVariable})`);
}

export function rootsSymbolic(expression, variable = "x") {
  const safeVariable = normalizeVariable(variable);
  const safeExpression = assertSafeSymbolicExpression(expression, {
    variables: [safeVariable],
  });
  return runEngine(`roots(${safeExpression},${safeVariable})`);
}

export function areSymbolicallyEquivalent(left, right, options = {}) {
  const safeLeft = assertSafeSymbolicExpression(left, options);
  const safeRight = assertSafeSymbolicExpression(right, options);
  return runEngine(`simplify((${safeLeft})-(${safeRight}))`) === "0";
}

export const SYMBOLIC_ENGINE_INFO = Object.freeze({
  name: "Algebrite",
  version: "1.4.0",
  license: "MIT",
});
