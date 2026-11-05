import assert from "node:assert/strict";
import test from "node:test";
import { solveWorkflow } from "../js/solve-workflow.js";
import { runShortcutWorkflow } from "../js/shortcut-workflow.js";
import { parseMathExpression } from "../js/math-core/expression-parser.js";
import { differentiateExpressionAst } from "../js/math-core/calculus-rules.js";
import { proposeSubstitutionIntegral } from "../js/math-core/substitution-integral.js";
import * as symbolic from "../js/math-core/symbolic-adapter.js";

const symbolicOperations = { equivalent: symbolic.areSymbolicallyEquivalent, simplify: symbolic.simplifySymbolic, integrate: symbolic.integrateSymbolic };
const failures = [
  ["lim_(x->1-) 1/(x-1)", "-∞"], ["lim_(x->1+) 1/(x-1)", "+∞"],
  ["∫ 2x*cos(x^2) dx", "sin(x^2)+C"], ["∫ 2*x*cos(x^2) dx", "sin(x^2)+C"],
  ["∫ 2*x*sin(x^2) dx", "-cos(x^2)+C"], ["∫ (2*x)/(x^2+1) dx", "log(x^2+1)+C"],
  ["∫ 1/x dx", "log(abs(x))+C", ["x≠0"]], ["f(x)=ln(x) を微分せよ", "1/x", ["x>0"]],
  ["f(x)=e^x を微分せよ", "exp(x)"],
];

for (const [question, expected, conditions = []] of failures) {
  test(`実機失敗の再現回帰: ${question}`, async () => {
    let clipboard = question, records = [];
    const result = await runShortcutWorkflow({
      getSelectionText: async () => "", readClipboardText: async () => clipboard,
      writeClipboardText: async (value) => { clipboard = value; },
      addHistory: async (record) => { records.push(record); return { id: "test" }; },
      settings: { learningMode: "study", saveHistory: true }, symbolicOperations,
    });
    assert.equal(result.workflow.solverResult.exactAnswer, expected);
    assert.deepEqual(result.workflow.solverResult.conditions, conditions);
    assert.equal(result.workflow.solverResult.verified, true);
    assert.equal(clipboard, result.workflow.presentation.finalAnswer);
    for (const condition of conditions) assert.ok(clipboard.includes(condition));
    assert.equal(records.length, 1);
  });
}

test("有理係数の多項式合成を一般化し逆微分と厳密係数で検証する", async () => {
  for (const a of [-3, 1, 2]) for (const degree of [1, 2, 3, 4]) for (const fn of ["sin", "cos"]) {
    const inner = `${a}*x^${degree}+2`;
    const expression = `(${3*a*degree}/2)*x^${degree-1}*${fn}(${inner})`.replace("x^0", "1");
    const result = await solveWorkflow(`∫ ${expression} dx`, { symbolicOperations });
    assert.equal(result.presentable, true, expression);
    assert.ok(result.solverResult.exactAnswer.endsWith("+C"));
    const candidate = result.solverResult.exactAnswer.slice(0, -2);
    const back = differentiateExpressionAst(parseMathExpression(candidate).ast);
    assert.ok(symbolic.areSymbolicallyEquivalent(back.expression, parseMathExpression(expression).cas));
    assert.deepEqual(result.solverResult.conditions, []);
  }
});

test("対数の絶対値、正の真数、除外条件と定義域違反を区別する", async () => {
  const cancelled = await solveWorkflow("∫ 0/x dx", { symbolicOperations });
  assert.equal(cancelled.solverResult.exactAnswer, "0+C");
  assert.deepEqual(cancelled.solverResult.conditions, ["x≠0"]);
  for (const [expression, absolute, conditions] of [
    ["2*x/(x^2+1)", false, []], ["2*x/(x^2-1)", true, ["x≠-1", "x≠1"]],
    ["3/(3*x-6)", true, ["x≠2"]], ["6*x/(x^2+1)", false, []],
    ["-1/(-x)", true, ["x≠0"]],
  ]) {
    const result = await solveWorkflow(`∫ ${expression} dx`, { symbolicOperations });
    assert.equal(result.presentable, true, expression);
    assert.equal(result.solverResult.exactAnswer.includes("abs("), absolute, expression);
    assert.deepEqual(result.solverResult.conditions, conditions);
  }
  for (const q of ["ln(-1)を微分せよ", "ln(0)を微分せよ", "ln(-x^2-1)を微分せよ", "ln(x-x)を微分せよ"]) {
    assert.equal((await solveWorkflow(q, { symbolicOperations })).presentable, false, q);
  }
  for (const inner of ["2*x+1", "x^2"]) {
    const result = await solveWorkflow(`ln(${inner})を微分せよ`, { symbolicOperations });
    assert.equal(result.presentable, true);
    assert.ok(result.solverResult.conditions.some((c) => c.endsWith(">0")));
  }
});

test("自然指数の別表記はASTの定数eだけを変換する", async () => {
  for (const inner of ["x", "2x+1", "x^2"]) {
    const a = await solveWorkflow(`f(x)=e^(${inner}) を微分せよ`, { symbolicOperations });
    const b = await solveWorkflow(`f(x)=exp(${inner}) を微分せよ`, { symbolicOperations });
    assert.equal(a.presentable, true);
    assert.equal(a.solverResult.exactAnswer, b.solverResult.exactAnswer);
  }
  assert.equal(parseMathExpression("e").ast.type, "constant");
  assert.equal((await solveWorkflow("f(e)=e^2 を微分せよ", { symbolicOperations })).presentable, false);
});

test("極限の境界だけを認識し曖昧な本体、検証失敗ではコピーしない", async () => {
  for (const q of ["(x+1)2", "lim_(x->1+) (x+1)2", "lim_(x->1+) x2", "lim_(x->1+ 1/(x-1)"]) {
    let writes = 0;
    await assert.rejects(runShortcutWorkflow({ getSelectionText: async () => "", readClipboardText: async () => q,
      writeClipboardText: async () => { writes++; }, symbolicOperations }));
    assert.equal(writes, 0, q);
  }
  const result = await solveWorkflow("∫ 2*x*cos(x^2) dx", { symbolicOperations: { ...symbolicOperations, equivalent: () => false } });
  assert.equal(result.presentable, false);
  let failedVerificationWrites = 0;
  await assert.rejects(runShortcutWorkflow({ getSelectionText: async () => "", readClipboardText: async () => "∫ 2*x*cos(x^2) dx",
    writeClipboardText: async () => { failedVerificationWrites++; },
    symbolicOperations: { ...symbolicOperations, equivalent: () => false } }));
  assert.equal(failedVerificationWrites, 0);
  for (const expression of ["x*cos(x^3)", "cos(x^2)", "1/(x-x)", "2*x/(x^2+1)*sin(x)", "1/(1/x)*cos(x^2)"]) {
    assert.equal(proposeSubstitutionIntegral(parseMathExpression(expression).ast), null, expression);
  }
});

test("ユーザーの既存成功14例の意味・条件・積分定数を維持する", async () => {
  const cases = [
    ["(+19)+(-14)", "5"], ["(5/6)-(7/12)+(2/9)", "17/36"], ["√72", "6√2"],
    ["3(2x-5)-2(x+7)+4x", "8*x-29"], ["2x^2-7x+3=0", "x=1/2,3"], ["4^x=8", "x=3/2"],
    ["log_2(x-1)+log_2(x+1)=3", "x=3"], ["lim_(x->1) (x^3-1)/(x-1)", "3"], ["∫_0^pi sin(x) dx", "2"],
    ["f(x)=sin(3x^2) を微分せよ", "6*x*cos(3*x^2)"], ["f(x)=exp(x^2) を微分せよ", "2*x*exp(x^2)"],
    ["∫ 2*x*exp(x^2) dx", "exp(x^2)+C"], ["∫ x*exp(x) dx", "(x-1)*exp(x)+C"], ["∫ x*cos(x) dx", "x*sin(x)+cos(x)+C"],
  ];
  for (const [q, expected] of cases) {
    const result = await solveWorkflow(q, { symbolicOperations });
    assert.equal(result.presentable, true, `${q}: ${result.solverResult.error}`);
    const actual = result.solverResult.exactAnswer;
    if (actual !== expected) {
      assert.equal(actual.endsWith("+C"), expected.endsWith("+C"), q);
      assert.ok(symbolic.areSymbolicallyEquivalent(actual.replace(/\+C$/u, ""), expected.replace(/\+C$/u, "")), q);
    }
    if (q.startsWith("log_2")) assert.ok(result.solverResult.conditions.length);
  }
});
