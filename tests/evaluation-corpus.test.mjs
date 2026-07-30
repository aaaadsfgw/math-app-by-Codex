import assert from "node:assert/strict";
import test from "node:test";

import { solveQuestion } from "../js/solver/index.js";

function signedTerm(value, symbol = "") {
  if (value === 0) return "";
  const coefficient = symbol && Math.abs(value) === 1
    ? (value < 0 ? "-" : "")
    : String(value);
  return `${coefficient}${symbol}`;
}

function appendTerm(expression, value, symbol = "") {
  if (value === 0) return expression || "0";
  const term = signedTerm(Math.abs(value), symbol);
  if (!expression) return value < 0 ? `-${term}` : term;
  return `${expression}${value < 0 ? "-" : "+"}${term}`;
}

function linearExpression(xCoefficient, constant) {
  return appendTerm(
    appendTerm("", xCoefficient, "x"),
    constant,
  );
}

function twoVariableExpression(xCoefficient, yCoefficient) {
  return appendTerm(
    appendTerm("", xCoefficient, "x"),
    yCoefficient,
    "y",
  );
}

function generatedLinearEquations() {
  return Array.from({ length: 250 }, (_, index) => {
    const coefficient = (index % 19) - 9 || 10;
    const root = (index % 31) - 15;
    const constant = ((index * 7) % 23) - 11;
    const right = coefficient * root + constant;
    return {
      family: "linear-equation",
      question: `${linearExpression(coefficient, constant)}=${right}`,
      answer: `x=${root}`,
    };
  });
}

function generatedLinearInequalities() {
  const operators = ["<", "<=", ">", ">="];
  const reverse = { "<": ">", "<=": ">=", ">": "<", ">=": "<=" };
  return Array.from({ length: 250 }, (_, index) => {
    const coefficient = (index % 17) - 8 || 9;
    const boundary = (index % 29) - 14;
    const constant = -coefficient * boundary;
    const operator = operators[index % operators.length];
    const solvedOperator = coefficient < 0 ? reverse[operator] : operator;
    return {
      family: "linear-inequality",
      question: `${linearExpression(coefficient, constant)}${operator}0`,
      answer: `x${solvedOperator}${boundary}`,
    };
  });
}

function generatedLinearSystems() {
  const cases = [];
  let seed = 0;
  while (cases.length < 250) {
    const x = (seed % 17) - 8;
    const y = ((seed * 3) % 19) - 9;
    const a = (seed % 7) - 3;
    const b = ((seed * 2) % 9) - 4;
    const c = ((seed * 3) % 11) - 5;
    const d = ((seed * 5) % 13) - 6;
    seed += 1;
    if ((!a && !b) || (!c && !d) || a * d - b * c === 0) continue;
    cases.push({
      family: "linear-system",
      question: `${twoVariableExpression(a, b)}=${a * x + b * y}, `
        + `${twoVariableExpression(c, d)}=${c * x + d * y}`,
      answer: `x=${x}, y=${y}`,
    });
  }
  return cases;
}

function generatedBaseConversions() {
  return Array.from({ length: 150 }, (_, index) => {
    const value = index + 1;
    return {
      family: "base-conversion",
      question: `${value.toString(2)}(2)を10進数に変換`,
      answer: String(value),
    };
  });
}

function factorAt(root) {
  return `(x${root < 0 ? "+" : "-"}${Math.abs(root)})`;
}

function generatedQuadraticInequalities() {
  const operators = ["<", "<=", ">", ">="];
  return Array.from({ length: 250 }, (_, index) => {
    const lower = (index % 19) - 12;
    const upper = lower + (index % 7) + 1;
    const leading = index % 2 === 0 ? (index % 5) + 1 : -((index % 5) + 1);
    const operator = operators[index % operators.length];
    const outsidePositive = leading > 0;
    const wantsPositive = operator.startsWith(">");
    const outside = outsidePositive === wantsPositive;
    const inclusive = operator.includes("=");
    const answer = outside
      ? `x${inclusive ? "≤" : "<"}${lower} または ${upper}${inclusive ? "≤" : "<"}x`
      : `${lower}${inclusive ? "≤" : "<"}x${inclusive ? "≤" : "<"}${upper}`;
    return {
      family: "quadratic-inequality",
      question: `${leading}${factorAt(lower)}${factorAt(upper)}${operator}0`,
      answer,
    };
  });
}

function generatedRejectedInputs() {
  const templates = [
    (value) => `sin x = ${value}`,
    (value) => `log x = ${value}`,
    (value) => `x^3=${value}`,
    (value) => `0<x<${value + 1}`,
    (value) => `2x+=${value}`,
    (value) => `xy=${value}, x+y=${value + 1}`,
    (value) => `図${value}の斜線部分の面積を求めよ`,
    (value) => `命題${value}を証明せよ`,
    (value) => `A(${value},2), B(4,6)間の距離`,
    (value) => `x+globalThis.process.exit()=${value}`,
  ];
  return Array.from({ length: 100 }, (_, index) => ({
    family: "rejected",
    question: templates[index % templates.length](Math.floor(index / templates.length) + 1),
  }));
}

const positiveCorpus = [
  ...generatedLinearEquations(),
  ...generatedLinearInequalities(),
  ...generatedLinearSystems(),
  ...generatedBaseConversions(),
  ...generatedQuadraticInequalities(),
];
const rejectedCorpus = generatedRejectedInputs();
export const EVALUATION_CORPUS_SIZE = positiveCorpus.length + rejectedCorpus.length;

test("1,250問の生成評価コーパスで厳密解と安全な未対応を維持する", () => {
  assert.equal(EVALUATION_CORPUS_SIZE, 1_250);

  for (const item of positiveCorpus) {
    const result = solveQuestion(item.question);
    assert.equal(result.verified, true, `${item.family}: ${item.question}: ${result.error}`);
    assert.equal(result.answer, item.answer, `${item.family}: ${item.question}`);
  }

  for (const item of rejectedCorpus) {
    const result = solveQuestion(item.question);
    assert.equal(result.verified, false, `${item.family}: ${item.question}`);
    assert.equal(result.answer, "", `${item.family}: ${item.question}`);
  }
});
