import { ExactRational } from "./exact-rational.js";
import { exactPolynomialFromAst } from "./exact-polynomial.js";
import { formatExactPolynomialForIntegral } from "./exact-polynomial-integral.js";
import { collectExactNonzeroDomainConditions } from "./expression-parser.js";

const one = () => ({ type: "number", value: "1" });
const product = (nodes) => nodes.reduce((left, right) => ({ type: "binary", operator: "*", left, right }), one());

function factors(node, numerator, denominator, inverse = false) {
  if (node.type === "binary" && ["*", "/"].includes(node.operator)) {
    factors(node.left, numerator, denominator, inverse);
    factors(node.right, numerator, denominator, node.operator === "/" ? !inverse : inverse);
  } else if (node.type === "unary") {
    if (node.operator === "-") numerator.push({ type: "number", value: "-1" });
    factors(node.argument, numerator, denominator, inverse);
  } else (inverse ? denominator : numerator).push(node);
}

function derivative(p) {
  return p.length === 1 ? [ExactRational.zero()] : p.slice(1).map((c, i) => c.multiply(BigInt(i + 1)));
}

function proportional(left, right) {
  const pivot = right.findIndex((c) => !c.isZero());
  if (pivot < 0) return null;
  const ratio = (left[pivot] ?? ExactRational.zero()).divide(right[pivot]);
  if (ratio.isZero()) return null;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (!(left[i] ?? ExactRational.zero()).equals((right[i] ?? ExactRational.zero()).multiply(ratio))) return null;
  }
  return ratio;
}

function alwaysPositive(p) {
  if (p.length === 1) return p[0].numerator > 0n;
  if (p.length !== 3 || p[2].numerator <= 0n) return false;
  return p[1].multiply(p[1]).subtract(p[2].multiply(p[0]).multiply(4n)).numerator < 0n;
}

/** Bounded f'(x)*sin/cos(f(x)) and f'(x)/f(x), with rational scale.
 * Every source factor is checked before cancellation. A failed match leaves
 * the existing integrator responsible; it never licenses a guessed primitive.
 */
export function proposeSubstitutionIntegral(ast) {
  try {
    const checkSource = (node) => {
      if (node.type === "binary") {
        if (node.operator === "/") {
          const p = exactPolynomialFromAst(node.right);
          if (p.every((c) => c.isZero())) throw new Error("Zero source denominator");
        }
        checkSource(node.left); checkSource(node.right);
      } else if (node.type === "unary") checkSource(node.argument);
      else if (node.type === "call") node.args.forEach(checkSource);
    };
    checkSource(ast);
    const numerator = [], denominator = [];
    factors(ast, numerator, denominator);
    const trig = numerator.filter((n) => n.type === "call" && ["sin", "cos"].includes(n.name));
    const denominators = denominator.map((node) => ({ node, polynomial: exactPolynomialFromAst(node) }));
    const variableDenominators = denominators.filter(({ polynomial }) => polynomial.length > 1);
    const constants = denominators.filter(({ polynomial }) => polynomial.length === 1);
    const divisor = constants.reduce((c, item) => c.multiply(item.polynomial[0]), ExactRational.one());
    if (divisor.isZero()) return null;
    let inner, outer, rest;
    if (trig.length === 1 && variableDenominators.length === 0) {
      inner = trig[0].args[0]; outer = trig[0].name;
      rest = numerator.filter((node) => node !== trig[0]);
    } else if (trig.length === 0 && variableDenominators.length === 1) {
      inner = variableDenominators[0].node; outer = "log"; rest = numerator;
    } else return null;
    const p = exactPolynomialFromAst(inner);
    const coefficient = exactPolynomialFromAst(product(rest)).map((c) => c.divide(divisor));
    let scale = proportional(coefficient, derivative(p));
    if (!scale) return null;
    const argument = formatExactPolynomialForIntegral(p);
    const positive = alwaysPositive(p);
    const primitive = outer === "log"
      ? `log(${positive ? argument : `abs(${argument})`})`
      : `${outer === "sin" ? "cos" : "sin"}(${argument})`;
    if (outer === "sin") scale = scale.negate();
    const expression = scale.equals(1n) ? primitive : scale.equals(-1n) ? `-${primitive}` : `(${scale})*${primitive}`;
    const conditions = outer === "log" && !positive ? collectExactNonzeroDomainConditions(ast) : [];
    return { expression, conditions, argument, family: outer, scale: scale.toString() };
  } catch {
    return null;
  }
}
