import assert from "node:assert/strict";
import test from "node:test";

import { normalizeMathOcrCandidate } from "../js/ocr/math-ocr-normalizer.js";
import { solveQuestion } from "../js/solver/index.js";

test("実OCR artifactを正規化して既存二次方程式solverで厳密検証する", () => {
  const raw = "zws _( 2 x ^( 2 ) + 5 x + 2 = 0 )";
  const normalized = normalizeMathOcrCandidate(raw);

  assert.equal(normalized.sourceText, raw);
  assert.equal(normalized.text, "2*x^2+5*x+2=0");
  assert.equal(normalized.changed, true);

  const result = solveQuestion(normalized.text);
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.solverId, "quadratic-equation");
  assert.equal(result.answer, "x=-2,-1/2");
  assert.equal(result.resultKind, "exact");
  assert.equal(result.verified, true);
});

test("IBEMの安全な分数・根号表現を既存solver向けに変換する", () => {
  const result = normalizeMathOcrCandidate("frac(x + 1, 2) = sqrt(9)");
  assert.equal(result.text, "((x + 1)/(2)) = sqrt(9)");
  assert.equal(result.changed, true);
  assert.deepEqual(result.warnings, []);
});

test("積・除算記号を明示演算子へ変換する", () => {
  const result = normalizeMathOcrCandidate("2 times x + 6 div 3");
  assert.equal(result.text, "2 * x + 6 / 3");
});

test("全角文字・Unicode演算子・安全な上付き数字だけをsolver記法へ変換する", () => {
  const result = normalizeMathOcrCandidate("−ｘ²＋３×ｘ÷２＝０");
  assert.equal(result.text, "-x^2+3*x/2=0");
  assert.deepEqual(result.warnings, []);
});

test("基数のない上付き数字や上付き符号を推測変換しない", () => {
  const result = normalizeMathOcrCandidate("²x + x⁻²");
  assert.equal(result.text, "²x + x⁻²");
  assert.equal(result.warnings.length, 2);
});

test("積分や総和など未対応記号を消さずsolverが拒否できる形で保持する", () => {
  const result = normalizeMathOcrCandidate("integral x + sum k");
  assert.equal(result.text, "∫ x + ∑ k");
  assert.equal(result.warnings.length, 2);
});

test("不明なTypst呼び出しは意味を推測せず明示的な未対応候補にする", () => {
  const result = normalizeMathOcrCandidate("mat(1, 2; 3, 4)");
  assert.equal(result.text, "⟦mat(1,2; 3,4)⟧");
  assert.match(result.warnings[0], /mat/u);
});

test("空・制御文字・不釣合い括弧をfail closedにする", () => {
  for (const [value, code] of [
    ["   ", "OCR_NORMALIZATION_EMPTY"],
    ["x\u0000=1", "OCR_NORMALIZATION_CONTROL_CHARACTER"],
    ["frac(x, 2", "OCR_NORMALIZATION_UNBALANCED"],
    ["x] + 1", "OCR_NORMALIZATION_UNBALANCED"],
  ]) {
    assert.throws(() => normalizeMathOcrCandidate(value), (error) => error.code === code);
  }
});

test("1/l・0/O・ASCII xや互換文字を文脈で推測修正しない", () => {
  const source = "l + O + x + ℓ";
  assert.equal(normalizeMathOcrCandidate(source).text, source);
});

test("全角括弧も幅だけ正規化した後に対応を検査する", () => {
  assert.throws(
    () => normalizeMathOcrCandidate("ｆ（ｘ＝１"),
    (error) => error.code === "OCR_NORMALIZATION_UNBALANCED",
  );
});

test("既知artifactだけを境界付きで除去しwhole-formula wrapperだけを外す", () => {
  assert.equal(normalizeMathOcrCandidate("zws x + 1").text, "x + 1");
  assert.equal(
    normalizeMathOcrCandidate("xzws + zws1 + zws_value + zws(x)").text,
    "xzws + zws1 + zws_value + ⟦zws(x)⟧",
  );
  assert.equal(normalizeMathOcrCandidate("_( x + 1 )").text, "x+1");
  assert.equal(normalizeMathOcrCandidate("zws_( x + 1 )").text, "x+1");
  assert.equal(normalizeMathOcrCandidate("_(x) + 1").text, "_(x) + 1");
  assert.equal(normalizeMathOcrCandidate("zws_(x) + 1").text, "zws_(x) + 1");
});

test("明示された整数指数括弧と安全な数値・単一変数積だけを整形する", () => {
  assert.equal(normalizeMathOcrCandidate("x^( 2 ) + 5 x").text, "x^2 + 5*x");
  assert.equal(normalizeMathOcrCandidate("1 / 2 x + x y + 2 xy").text, "1 / 2 x + x y + 2 xy");
  assert.equal(normalizeMathOcrCandidate("x^(n) + x^(2+1)").text, "x^(n) + x^(2+1)");
});

test("添字・digit suffix・正当なunderscore構文を誤変換しない", () => {
  for (const source of [
    "x2",
    "x1 + x2",
    "x_1 + x_(2)",
    "log_2(x)=3",
    "lim_(x->1) x",
  ]) {
    assert.equal(normalizeMathOcrCandidate(source).text, source);
  }
  assert.equal(
    normalizeMathOcrCandidate("zws _( x_1 + x_(2) = 0 )").text,
    "x_1+x_(2)=0",
  );
});
