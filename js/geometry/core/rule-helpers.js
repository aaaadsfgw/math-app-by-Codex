import { inconsistent } from "./errors.js";

export const known = (values) => values.every((value) => value !== undefined);
const equalValues = (math, a, b) => math.compare(a, b) === 0;

export function constant(add, math, name, ref, value) {
  add(name, [ref], ([previous]) => previous === undefined ? [[0, value]] : [],
    ([observed]) => observed === undefined ? null : equalValues(math, observed, value));
}

export function equal(add, math, name, left, right) {
  if (left === right) return;
  add(name, [left, right], ([a, b]) => {
    if (a === undefined && b !== undefined) return [[0, b]];
    if (b === undefined && a !== undefined) return [[1, a]];
    return [];
  }, (values) => known(values) ? equalValues(math, ...values) : null);
}

export function sum(add, math, name, total, terms) {
  add(name, [total, ...terms], (values) => {
    const missing = values.map((value, index) => value === undefined ? index : -1).filter((index) => index >= 0);
    if (missing.length !== 1) return [];
    const index = missing[0];
    const sumKnown = values.slice(1).filter((value) => value !== undefined)
      .reduce((a, b) => math.add(a, b), math.parse(0));
    return [[index, index === 0 ? sumKnown : math.sub(values[0], sumKnown)]];
  }, (values) => known(values)
    ? equalValues(math, values[0], values.slice(1).reduce((a, b) => math.add(a, b), math.parse(0))) : null);
}

export function product(add, math, name, result, left, right) {
  const zero = math.parse(0);
  const rational = /^-?\d+(?:\/\d+)?$/u;
  const quotient = (c, coefficient) => {
    if (typeof math.solveLinear === "function" && rational.test(math.format(c)) && rational.test(math.format(coefficient))) {
      return math.solveLinear(coefficient, zero, c);
    }
    return math.div(c, coefficient);
  };
  add(name, [result, left, right], ([c, a, b]) => {
    if (c === undefined && a !== undefined && b !== undefined) return [[0, math.mul(a, b)]];
    if (c !== undefined && a === undefined && b !== undefined && math.compare(b, zero) !== 0) {
      return [[1, quotient(c, b)]];
    }
    if (c !== undefined && a !== undefined && b === undefined && math.compare(a, zero) !== 0) {
      return [[2, quotient(c, a)]];
    }
    return [];
  }, ([c, a, b]) => {
    if (known([c, a, b])) return equalValues(math, c, math.mul(a, b));
    if (c !== undefined && [a, b].some((value) => value !== undefined && equalValues(math, value, zero))) {
      return equalValues(math, c, zero);
    }
    return null;
  });
}

export function pythagorean(add, math, name, hypotenuse, leg1, leg2) {
  const square = (value) => math.pow(value, 2);
  const zero = math.parse(0);
  add(name, [hypotenuse, leg1, leg2], ([c, a, b]) => {
    if (c === undefined && a !== undefined && b !== undefined) return [[0, math.sqrt(math.add(square(a), square(b)))]];
    if (c === undefined || (a === undefined) === (b === undefined)) return [];
    const difference = math.sub(square(c), square(a ?? b));
    if (math.compare(difference, zero) <= 0) throw inconsistent("斜辺は各直角辺より長い必要があります。");
    return [[a === undefined ? 1 : 2, math.sqrt(difference)]];
  }, ([c, a, b]) => {
    if (c !== undefined && [a, b].some((leg) => leg !== undefined && math.compare(c, leg) <= 0)) return false;
    return known([c, a, b]) ? equalValues(math, square(c), math.add(square(a), square(b))) : null;
  });
}
