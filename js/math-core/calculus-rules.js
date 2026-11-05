import { serializeExpressionAst } from "./expression-parser.js";
import { exactPolynomialFromAst } from "./exact-polynomial.js";

export class CalculusRuleError extends Error {
  constructor(message, { code = "UNSUPPORTED_CALCULUS_RULE" } = {}) {
    super(message);
    this.name = "CalculusRuleError";
    this.code = code;
  }
}

function numericInteger(node) {
  if (node?.type === "number" && /^\d+$/u.test(node.value)) {
    return BigInt(node.value);
  }
  if (
    node?.type === "unary"
    && ["+", "-"].includes(node.operator)
    && node.argument?.type === "number"
    && /^\d+$/u.test(node.argument.value)
  ) {
    const value = BigInt(node.argument.value);
    return node.operator === "-" ? -value : value;
  }
  return null;
}

function numericLiteral(node) {
  if (node?.type === "number") return Number(node.value);
  if (
    node?.type === "unary"
    && ["+", "-"].includes(node.operator)
    && node.argument?.type === "number"
  ) {
    const value = Number(node.argument.value);
    return node.operator === "-" ? -value : value;
  }
  return null;
}

function result(expression, conditions = []) {
  return {
    expression,
    conditions: new Set(conditions),
  };
}

function mergeConditions(...values) {
  return new Set(values.flatMap((value) => [...value.conditions]));
}

function differentiateNode(node, variable) {
  const source = serializeExpressionAst(node);
  switch (node?.type) {
    case "number":
    case "constant":
      return result("0");
    case "symbol":
      return result(node.name === variable ? "1" : "0");
    case "unary": {
      const derivative = differentiateNode(node.argument, variable);
      return result(
        node.operator === "-" ? `(-(${derivative.expression}))` : derivative.expression,
        derivative.conditions,
      );
    }
    case "binary": {
      const left = serializeExpressionAst(node.left);
      const right = serializeExpressionAst(node.right);
      const leftDerivative = differentiateNode(node.left, variable);
      const rightDerivative = differentiateNode(node.right, variable);
      const conditions = mergeConditions(leftDerivative, rightDerivative);

      if (node.operator === "+") {
        return result(
          `((${leftDerivative.expression})+(${rightDerivative.expression}))`,
          conditions,
        );
      }
      if (node.operator === "-") {
        return result(
          `((${leftDerivative.expression})-(${rightDerivative.expression}))`,
          conditions,
        );
      }
      if (node.operator === "*") {
        return result(
          `((${leftDerivative.expression})*(${right})+(${left})*(${rightDerivative.expression}))`,
          conditions,
        );
      }
      if (node.operator === "/") {
        const denominatorValue = numericLiteral(node.right);
        if (denominatorValue === 0) {
          throw new CalculusRuleError("0で割る式は微分できません。", {
            code: "DIVISION_BY_ZERO",
          });
        }
        if (denominatorValue === null) conditions.add(`${right}≠0`);
        return result(
          `(((${leftDerivative.expression})*(${right})-(${left})*(${rightDerivative.expression}))/(${right})^2)`,
          conditions,
        );
      }
      if (node.operator === "^") {
        if (node.left.type === "constant" && node.left.name === "e") {
          return result(`(exp(${right})*(${rightDerivative.expression}))`, conditions);
        }
        const exponent = numericInteger(node.right);
        if (exponent === null || exponent === 0n || exponent < -32n || exponent > 32n) {
          throw new CalculusRuleError(
            "微分できる累乗は、絶対値32以下の0でない整数指数に限定しています。",
            { code: "UNSUPPORTED_POWER_RULE" },
          );
        }
        if (exponent < 0n && numericLiteral(node.left) === null) {
          conditions.add(`${left}≠0`);
        }
        return result(
          `((${exponent})*(${left})^(${exponent - 1n})*(${leftDerivative.expression}))`,
          conditions,
        );
      }
      throw new CalculusRuleError(`演算子${node.operator}の微分規則は未対応です。`);
    }
    case "call": {
      if (node.name === "log" && node.args[0]?.type === "call" && node.args[0].name === "abs") {
        const innerNode = node.args[0].args[0];
        const polynomial = exactPolynomialFromAst(innerNode);
        if (polynomial.every((value) => value.isZero())) throw new CalculusRuleError("対数の真数が0です。");
        const inner = differentiateNode(innerNode, variable);
        const source = serializeExpressionAst(innerNode);
        return result(`(${inner.expression})/(${source})`, [...inner.conditions, `${source}≠0`]);
      }
      const argumentNode = node.args[0];
      const argument = serializeExpressionAst(argumentNode);
      const inner = differentiateNode(argumentNode, variable);
      const conditions = new Set(inner.conditions);
      if (node.name === "sin") {
        return result(`(cos(${argument})*(${inner.expression}))`, conditions);
      }
      if (node.name === "cos") {
        return result(`((-sin(${argument}))*(${inner.expression}))`, conditions);
      }
      if (node.name === "tan") {
        conditions.add(`cos(${argument})≠0`);
        return result(`((${inner.expression})/(cos(${argument})^2))`, conditions);
      }
      if (node.name === "exp") {
        return result(`(exp(${argument})*(${inner.expression}))`, conditions);
      }
      if (node.name === "log") {
        let constant = null;
        let polynomial = null;
        try { polynomial = exactPolynomialFromAst(argumentNode); } catch { /* Keep symbolic domain conditions. */ }
        if (polynomial?.length === 1) constant = polynomial[0];
        if (polynomial?.length === 3 && polynomial[2].numerator < 0n
          && polynomial[1].multiply(polynomial[1]).subtract(polynomial[2].multiply(polynomial[0]).multiply(4n)).numerator <= 0n) {
          throw new CalculusRuleError("対数の真数が正になる実数がありません。");
        }
        if (constant && constant.numerator <= 0n) throw new CalculusRuleError("対数の真数は正でなければなりません。");
        conditions.add(`${argument}>0`);
        return result(`((${inner.expression})/(${argument}))`, conditions);
      }
      if (node.name === "sqrt") {
        conditions.add(`${argument}>0`);
        return result(
          `((${inner.expression})/(2*sqrt(${argument})))`,
          conditions,
        );
      }
      throw new CalculusRuleError(
        `関数${node.name}の微分規則はまだ対応していません。`,
        { code: "UNSUPPORTED_FUNCTION_RULE" },
      );
    }
    default:
      throw new CalculusRuleError(`数式「${source}」を微分規則へ変換できません。`);
  }
}

export function differentiateExpressionAst(ast, { variable = "x" } = {}) {
  const derivative = differentiateNode(ast, variable);
  return Object.freeze({
    expression: derivative.expression,
    conditions: Object.freeze([...derivative.conditions]),
  });
}
