import { ExactRational } from "./exact-rational.js";
import { exactRationalFunctionFromAst } from "./exact-rational-function.js";
import { analyzeExactQuadraticRoots, verifyExactQuadraticRoot } from "./exact-quadratic-roots.js";

// Constant arithmetic is evaluated before cancellation, including every source
// denominator and 0^0. No floating-point value participates in verification.
export function evaluateExactArithmetic(node) {
  if (node.type === "number") return ExactRational.parse(node.value);
  if (node.type === "unary") {
    const value = evaluateExactArithmetic(node.argument);
    return node.operator === "-" ? value.negate() : value;
  }
  if (node.type !== "binary") throw new Error("有理数の四則演算ではありません。");
  const left = evaluateExactArithmetic(node.left);
  const right = evaluateExactArithmetic(node.right);
  if (node.operator === "+") return left.add(right);
  if (node.operator === "-") return left.subtract(right);
  if (node.operator === "*") return left.multiply(right);
  if (node.operator === "/") return left.divide(right);
  if (node.operator === "^" && right.denominator === 1n) return left.pow(right.numerator);
  throw new Error("整数以外の指数には対応していません。");
}

export function serializeExactArithmetic(node) {
  if (node.type === "number") return `(${ExactRational.parse(node.value)})`;
  if (node.type === "symbol" || node.type === "constant") return node.name;
  if (node.type === "unary") return `(${node.operator}${serializeExactArithmetic(node.argument)})`;
  if (node.type === "binary") return `(${serializeExactArithmetic(node.left)}${node.operator}${serializeExactArithmetic(node.right)})`;
  return `${node.name}(${node.args.map(serializeExactArithmetic).join(",")})`;
}

function renameVariable(node) {
  if (node.type === "symbol") return { ...node, name: "x" };
  if (node.type === "unary") return { ...node, argument: renameVariable(node.argument) };
  if (node.type === "binary") return { ...node, left: renameVariable(node.left), right: renameVariable(node.right) };
  return node;
}

export function inspectElementaryExpression(parsed) {
  if (parsed.ast.type === "call" && parsed.ast.name === "sqrt") {
    const radicand = evaluateExactArithmetic(parsed.ast.args[0]);
    if (radicand.numerator < 0n) throw new Error("実数の平方根には0以上の数を入力してください。");
    const analysis = analyzeExactQuadraticRoots([
      radicand.negate(), ExactRational.zero(), ExactRational.one(),
    ]);
    const root = analysis.roots.at(-1);
    const nonnegative = root && root.numeratorConstant >= 0n && root.radicalCoefficient >= 0n;
    if (!nonnegative || !verifyExactQuadraticRoot(analysis.integerCoefficients, root)) {
      throw new Error("平方根の非負性と二乗の一致を確認できませんでした。");
    }
    return { exactAnswer: root.exact, squareRoot: true };
  }
  if (parsed.symbols.length === 0) {
    return { exactAnswer: evaluateExactArithmetic(parsed.ast).toString(), squareRoot: false };
  }
  if (parsed.symbols.length > 1) throw new Error("指示なしの簡約は現在1種類の文字を含む有理式に対応しています。");
  // Reuse the existing bounded rational-function profile, including its
  // original-domain ledger and rejection of identically zero denominators.
  exactRationalFunctionFromAst(renameVariable(parsed.ast));
  return { exactAnswer: null, squareRoot: false };
}
