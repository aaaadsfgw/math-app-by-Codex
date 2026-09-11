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

test("同一行の明確な数式runと対応済み日本語指示だけを分離する", () => {
  const cases = [
    ["x^2-5x+6=0 を解け", "方程式を解け", "solve_equation", "x^2-5x+6=0", "x^2-5x+6=0"],
    ["x^2-5x+6=0を解け", "方程式を解け", "solve_equation", "x^2-5x+6=0", "x^2-5x+6=0"],
    ["方程式 x^2-5x+6=0 を解け", "方程式を解け", "solve_equation", "x^2-5x+6=0", "x^2-5x+6=0"],
    ["y=x^3-2x を微分せよ", "を微分せよ", "differentiate", "y=x^3-2x", "y=x^3-2xを微分せよ"],
    ["y=x^3-2xを微分せよ", "を微分せよ", "differentiate", "y=x^3-2x", "y=x^3-2xを微分せよ"],
    ["(x+1)^2 を展開せよ", "を展開せよ", "expand", "(x+1)^2", "展開: (x+1)^2"],
    ["次の式「(x+1)^2」を展開せよ", "次の式を展開せよ", "expand", "(x+1)^2", "展開: (x+1)^2"],
    ["x^2-1 を因数分解せよ", "を因数分解せよ", "factor", "x^2-1", "因数分解: x^2-1"],
    ["次の式『x^2-1』を因数分解せよ", "次の式を因数分解せよ", "factor", "x^2-1", "因数分解: x^2-1"],
    ["1/x+2/(x+1) を簡単にせよ", "を簡単にせよ", "simplify", "1/x+2/(x+1)", "簡約: 1/x+2/(x+1)"],
  ];

  for (const [source, instructionText, intent, formulaText, solverInput] of cases) {
    const input = parseCombinedProblemText(source);
    assert.equal(input.status, "ready", source);
    assert.equal(input.instructionText, instructionText, source);
    assert.equal(input.instructionIntent, intent, source);
    assert.equal(input.formulaText, formulaText, source);
    assert.equal(compileProblemInput(input).solverInput, solverInput, source);
  }
});

test("同一行解析は曖昧な指示や複数数式を推測せず数式表記も書き換えない", () => {
  const untouched = [
    "x2 + 5x + 2 = 0",
    "x+1 を計算せよ",
    "x^2<4 を解け",
    "f(x)=x^2 を解け",
    "x+1 と x-1 を展開せよ",
    "x^2 を展開して因数分解せよ",
    "x^2 を証明せよ",
    "次の 2 次式を因数分解せよ",
    "以下の 3 次関数を微分せよ",
    "2 次方程式を解け",
    "xを 2 回微分せよ",
    "関数 f を微分せよ",
    "分母を x+1 として簡単にせよ",
    "共通分母を x*(x+1) として簡単にせよ",
    "式を x+1 倍して展開せよ",
    "次の 1/2 個の式を簡単にせよ",
    "x+1 を平方して展開せよ",
    "x+1 を二乗して展開せよ",
    "x+1 を逆数にして簡単にせよ",
    "x+1 を置換して微分せよ",
    "係数 x+1 を使って因数分解せよ",
    "次の式「x^2-1 を因数分解せよ",
    "次の式x^2-1』を因数分解せよ",
    "次の式「x^2-1』を因数分解せよ",
    "次の式『「x^2-1」』を因数分解せよ",
  ];
  for (const source of untouched) {
    const input = parseCombinedProblemText(source);
    assert.equal(input.instructionText, "", source);
    assert.equal(input.instructionIntent, null, source);
    assert.equal(input.formulaText, source, source);
  }

  const unguessed = parseCombinedProblemText("x2 を展開せよ");
  assert.equal(unguessed.instructionIntent, "expand");
  assert.equal(unguessed.formulaText, "x2");

  const leadingFactor = parseCombinedProblemText("(2)x^2 を展開せよ");
  assert.equal(leadingFactor.questionLabel, "");
  assert.equal(leadingFactor.status, "unsupported");
  assert.equal(leadingFactor.instructionIntent, null);
  assert.equal(leadingFactor.formulaText, "(2)x^2 を展開せよ");
  assert.match(leadingFactor.error, /問題番号か数式の係数か判別できない/u);

  const ambiguousLabel = parseCombinedProblemText("(3) 1/x+2/(x+1) を簡単にせよ");
  assert.equal(ambiguousLabel.status, "unsupported");
  assert.equal(ambiguousLabel.questionLabel, "");
  assert.equal(ambiguousLabel.formulaText, "(3) 1/x+2/(x+1) を簡単にせよ");

  const formulaOnlyAmbiguity = parseCombinedProblemText("(3) 1/x+2/(x+1)");
  assert.equal(formulaOnlyAmbiguity.status, "unsupported");
  assert.equal(formulaOnlyAmbiguity.formulaText, "(3) 1/x+2/(x+1)");

  for (const [source, expectedFormula, expectedIntent] of [
    ["1.5*x", "1.5*x", null],
    ["1.5*x を簡単にせよ", "1.5*x", "simplify"],
    ["2.0*x+1=5", "2.0*x+1=5", null],
    ["2.0*x+1=5 を解け", "2.0*x+1=5", "solve_equation"],
    ["２．０*x+1=5 を解け", "２．０*x+1=5", "solve_equation"],
  ]) {
    const decimal = parseCombinedProblemText(source);
    assert.equal(decimal.status, "ready", source);
    assert.equal(decimal.formulaText, expectedFormula, source);
    assert.equal(decimal.instructionIntent, expectedIntent, source);
  }
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
    "(2)x^2 を展開せよ",
    "(2) (x+1) を展開せよ",
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

  for (const source of ["1.5*x", "2.0*x+1=5", "２．０*x+1=5"]) {
    assert.equal(separateQuestionLabel(source).reason, "", source);
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
