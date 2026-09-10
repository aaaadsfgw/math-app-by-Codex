import assert from "node:assert/strict";
import test from "node:test";

import {
  compileProblemInput,
  normalizeProblemInput,
  parseCombinedProblemText,
  problemInputDisplayText,
} from "../js/problem/problem-input.js";
import {
  separateQuestionLabel,
} from "../js/problem/question-label.js";

test("legacy stringはinstructionを再解釈せず数式として保持する", () => {
  const source = "f(x)=x^3-2x を微分せよ";
  const input = normalizeProblemInput(source);
  assert.equal(input.status, "ready");
  assert.equal(input.formulaText, source);
  assert.equal(input.instructionText, "");
  assert.equal(input.instructionIntent, null);
  assert.equal(compileProblemInput(input).solverInput, source);
});

test("ProblemInput schemaVersionは欠落または現行versionだけを受理する", () => {
  const legacy = normalizeProblemInput({ formulaText: "2x=4" });
  const current = normalizeProblemInput({ schemaVersion: 1, formulaText: "2x=4" });
  const future = normalizeProblemInput({ schemaVersion: 2, formulaText: "2x=4" });

  assert.equal(legacy.status, "ready");
  assert.equal(current.status, "ready");
  assert.equal(future.status, "invalid");
  assert.match(future.error, /schemaVersion/u);
  assert.equal(compileProblemInput({ schemaVersion: 2, formulaText: "2x=4" }).ok, false);
  for (const schemaVersion of [0, "1", null, undefined]) {
    const rejected = normalizeProblemInput({ schemaVersion, formulaText: "2x=4" });
    assert.equal(rejected.status, "invalid", String(schemaVersion));
  }
});

test("構造的な改行があるselectionだけをinstructionとformulaへ分ける", () => {
  const input = parseCombinedProblemText("(1) 次の方程式を解け。\n(4*x-6)/(x^2-5*x+6)=1");
  assert.equal(input.status, "ready");
  assert.equal(input.questionLabel, "(1)");
  assert.equal(input.instructionText, "次の方程式を解け");
  assert.equal(input.instructionIntent, "solve_equation");
  assert.equal(input.formulaText, "(4*x-6)/(x^2-5*x+6)=1");
  assert.equal(compileProblemInput(input).solverInput, input.formulaText);
});

test("1行または2行のinstruction prefixと1つのformulaだけを自動分離する", () => {
  const oneLine = parseCombinedProblemText("次の分数式を計算せよ。\n1/x+2/(x+1)");
  assert.equal(oneLine.instructionIntent, "simplify");
  assert.equal(compileProblemInput(oneLine).solverInput, "簡約: 1/x+2/(x+1)");

  const twoLines = parseCombinedProblemText("次の式を\nできるだけ簡単にせよ。\n1/(x^2-1)-1/(x-1)");
  assert.equal(twoLines.instructionIntent, "simplify");
  assert.equal(twoLines.formulaText, "1/(x^2-1)-1/(x-1)");

  const multipleFormulaLines = parseCombinedProblemText("次の式を簡単にせよ。\nx+1\nx-1");
  assert.equal(multipleFormulaLines.instructionIntent, null);
  assert.equal(multipleFormulaLines.formulaText, "次の式を簡単にせよ。\nx+1\nx-1");
});

test("問題番号は強い行構造または明確なinstruction後続時だけ分離する", () => {
  const positives = [
    ["(1)\n次の式を簡単にせよ。\nx+1", "(1)"],
    ["（1）\n次の式を簡単にせよ。\nx+1", "（1）"],
    ["①\n次の式を簡単にせよ。\nx+1", "①"],
    ["②\n次の式を簡単にせよ。\nx+1", "②"],
    ["問1 次の式を簡単にせよ。\nx+1", "問1"],
    ["問 1：次の式を簡単にせよ。\nx+1", "問 1"],
    ["問題1 x^2-1=0", "問題1"],
    ["1.\n次の式を展開せよ。\n(x+1)(x-1)", "1"],
  ];
  for (const [source, label] of positives) {
    const result = separateQuestionLabel(source);
    assert.equal(result.detected, true, source);
    assert.equal(result.questionLabel, label, source);
  }

  for (const source of [
    "(1+x)(1-x)",
    "(1)(1-x)",
    "f((1+x))",
    "x+(1)",
    "(1) x^2-1",
    "1.5*x",
    "問1234 x+1",
    "問題1234",
    "問1000\nx+1",
    "問１２３４ x+1",
  ]) {
    const result = separateQuestionLabel(source);
    assert.equal(result.detected, false, source);
    assert.equal(result.remainingText, source, source);
  }
});

test("各intentを既存solverが受け取る閉じたcanonical形式へ変換する", () => {
  const cases = [
    ["simplify", "x^2-1", "簡約: x^2-1"],
    ["expand", "(x+1)(x-1)", "展開: (x+1)(x-1)"],
    ["factor", "x^2-1", "因数分解: x^2-1"],
    ["solve_equation", "x^2-1=0", "x^2-1=0"],
    ["differentiate", "x^3-2x", "x^3-2xを微分せよ"],
    ["integrate", "x^2", "x^2を積分せよ"],
    ["definite_integral", "∫_0^1 x^2 dx", "∫_0^1 x^2 dx"],
    ["limit", "lim_(x->1) (x^2-1)/(x-1)", "lim_(x->1) (x^2-1)/(x-1)"],
    ["tangent", "tangent_x_[1](x^2)", "tangent_x_[1](x^2)"],
    ["normal", "normal_x_[1](x^2)", "normal_x_[1](x^2)"],
    ["monotonicity", "y=x^3", "monotonicity(x^3)"],
    ["extrema", "f(x)=x^2", "extrema(x^2)"],
    ["monotonicity_extrema", "x^3-3x", "monotonicity_extrema(x^3-3x)"],
  ];
  for (const [instructionIntent, formulaText, expected] of cases) {
    const compiled = compileProblemInput({ instructionIntent, formulaText });
    assert.equal(compiled.ok, true, instructionIntent);
    assert.equal(compiled.solverInput, expected, instructionIntent);
  }
});

test("instructionとformulaの競合・不足・外部条件をterminalに拒否する", () => {
  const cases = [
    [{ instructionIntent: "factor", formulaText: "x^2-1=0" }, "invalid"],
    [{ instructionIntent: "solve_equation", formulaText: "x^2-1" }, "invalid"],
    [{ instructionIntent: "solve_equation", formulaText: "f(x)=x^2" }, "invalid"],
    [{ instructionIntent: "limit", formulaText: "x^2" }, "invalid"],
    [{ instructionIntent: "tangent", formulaText: "x^2" }, "invalid"],
    [{ instructionIntent: "definite_integral", formulaText: "x^2" }, "invalid"],
    [{ instructionText: "計算せよ", formulaText: "x^2" }, "unsupported"],
    [{ instructionText: "展開せよ", instructionIntent: "factor", formulaText: "x^2" }, "invalid"],
    [{ formulaText: "1/x", conditions: ["x≠0"] }, "unsupported"],
  ];
  for (const [input, kind] of cases) {
    const compiled = compileProblemInput(input);
    assert.equal(compiled.ok, false, JSON.stringify(input));
    assert.equal(compiled.kind, kind, JSON.stringify(input));
    assert.ok(compiled.error, JSON.stringify(input));
  }
});

test("ProblemInputはprovenanceを分離し表示時だけ安全に再構成する", () => {
  const input = normalizeProblemInput({
    questionLabel: "(2)",
    instructionText: "展開せよ",
    formulaText: "(x+1)(x-1)",
    source: "ocr",
    instructionSource: "manual",
    formulaSource: "ocr",
  });
  assert.equal(input.source, "ocr");
  assert.equal(input.instructionSource, "manual");
  assert.equal(input.formulaSource, "ocr");
  assert.equal(problemInputDisplayText(input), "(2)\n展開せよ\n(x+1)(x-1)");
  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.conditions), true);
});
