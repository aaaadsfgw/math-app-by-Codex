import { ExactRational } from "./exact-rational.js";

export class LinearExpressionError extends Error {
  constructor(message, { code = "LINEAR_EXPRESSION_ERROR", unsupported = false } = {}) {
    super(message);
    this.name = "LinearExpressionError";
    this.code = code;
    this.unsupported = unsupported;
  }
}

function form(x = ExactRational.zero(), y = ExactRational.zero(), constant = ExactRational.zero()) {
  return Object.freeze({ x, y, constant });
}

function hasVariable(value) {
  return !value.x.isZero() || !value.y.isZero();
}

function add(left, right, sign = 1n) {
  const multiplier = new ExactRational(sign);
  return form(
    left.x.add(right.x.multiply(multiplier)),
    left.y.add(right.y.multiply(multiplier)),
    left.constant.add(right.constant.multiply(multiplier)),
  );
}

function scale(value, coefficient) {
  return form(
    value.x.multiply(coefficient),
    value.y.multiply(coefficient),
    value.constant.multiply(coefficient),
  );
}

function unsupported(message, code) {
  throw new LinearExpressionError(message, { code, unsupported: true });
}

export function linearizeExpressionAst(node) {
  switch (node?.type) {
    case "number":
      return form(ExactRational.zero(), ExactRational.zero(), ExactRational.parse(node.value));
    case "symbol":
      if (node.name === "x") return form(ExactRational.one());
      if (node.name === "y") return form(ExactRational.zero(), ExactRational.one());
      return unsupported(`変数${node.name}を含む連立方程式には対応していません。`, "UNSUPPORTED_SYMBOL");
    case "constant":
    case "call":
      return unsupported("関数や数学定数を含む連立方程式にはまだ対応していません。", "UNSUPPORTED_FUNCTION");
    case "unary": {
      const value = linearizeExpressionAst(node.argument);
      return node.operator === "-" ? scale(value, new ExactRational(-1n)) : value;
    }
    case "binary": {
      const left = linearizeExpressionAst(node.left);
      const right = linearizeExpressionAst(node.right);
      if (node.operator === "+") return add(left, right);
      if (node.operator === "-") return add(left, right, -1n);
      if (node.operator === "*") {
        if (hasVariable(left) && hasVariable(right)) {
          return unsupported("変数どうしの積を含むため、一次式ではありません。", "NONLINEAR_PRODUCT");
        }
        if (!hasVariable(left)) return scale(right, left.constant);
        return scale(left, right.constant);
      }
      if (node.operator === "/") {
        if (hasVariable(right)) {
          return unsupported("変数を含む式では割れません。", "NONLINEAR_DIVISION");
        }
        if (right.constant.isZero()) {
          throw new LinearExpressionError("0では割れません。", { code: "DIVISION_BY_ZERO" });
        }
        return scale(left, ExactRational.one().divide(right.constant));
      }
      if (node.operator === "^") {
        if (hasVariable(right) || right.constant.denominator !== 1n) {
          return unsupported("一次式の指数は整数の定数にしてください。", "NONLINEAR_POWER");
        }
        const exponent = right.constant.numerator;
        if (hasVariable(left)) {
          if (exponent === 1n) return left;
          return unsupported("変数の累乗を含むため、一次式ではありません。", "NONLINEAR_POWER");
        }
        try {
          return form(
            ExactRational.zero(),
            ExactRational.zero(),
            left.constant.pow(exponent),
          );
        } catch (error) {
          throw new LinearExpressionError(error.message, { code: "INVALID_POWER" });
        }
      }
      return unsupported(`演算子${node.operator}には対応していません。`, "UNSUPPORTED_OPERATOR");
    }
    default:
      throw new LinearExpressionError("未知の数式要素です。", { code: "UNKNOWN_AST_NODE" });
  }
}

export function subtractLinearExpressions(left, right) {
  return add(left, right, -1n);
}

export function evaluateLinearExpression(expression, { x, y }) {
  return expression.x.multiply(x)
    .add(expression.y.multiply(y))
    .add(expression.constant);
}

