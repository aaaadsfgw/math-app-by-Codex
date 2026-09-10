import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTRUCTION_INTENTS,
  normalizeInstruction,
} from "../js/problem/instruction-normalizer.js";

const VARIATIONS = Object.freeze({
  simplify: [
    "簡単にせよ",
    "簡単にしなさい",
    "簡単な形にせよ",
    "できるだけ簡単にせよ",
    "整理せよ",
    "式を整理しなさい",
    "簡約してください",
    "次の分数式を計算せよ。",
  ],
  expand: ["展開せよ", "展開しなさい", "式を展開してください", "次の式を展開せよ。"],
  factor: ["因数分解せよ", "因数分解しなさい", "式を因数分解してください"],
  solve_equation: ["方程式を解け", "方程式を解きなさい", "解を求めよ", "xの値を求めなさい"],
  differentiate: ["微分せよ", "微分しなさい", "導関数を求めよ", "次の関数を微分してください"],
  integrate: ["積分せよ", "不定積分を求めよ", "積分しなさい"],
  definite_integral: ["定積分を求めよ", "次の定積分を計算せよ", "定積分を求めなさい"],
  limit: ["極限を求めよ", "極限値を求めなさい", "次の極限を求めてください"],
  tangent: ["接線の方程式を求めよ", "接線の方程式を求めなさい"],
  normal: ["法線の方程式を求めよ", "法線の方程式を求めてください"],
  monotonicity: ["増減を調べよ", "関数の増減を調べなさい"],
  extrema: ["極値を求めよ", "関数の極値を求めてください"],
  monotonicity_extrema: ["増減を調べ、極値を求めよ", "増減と極値を求めなさい"],
});

test("日本語instruction variationを閉じたcanonical intentへ正規化する", () => {
  assert.deepEqual(Object.keys(VARIATIONS), INSTRUCTION_INTENTS);
  let count = 0;
  for (const [intent, phrases] of Object.entries(VARIATIONS)) {
    for (const phrase of phrases) {
      const result = normalizeInstruction(phrase);
      assert.equal(result.status, "recognized", phrase);
      assert.equal(result.intent, intent, phrase);
      count += 1;
    }
  }
  assert.equal(count, 42);
});

test("修飾語と空白・全角記号の差を意味変更なしで吸収する", () => {
  const cases = [
    [" 以下の 式 を 展開 しなさい！ ", "expand"],
    ["この式について、できるだけ簡単にせよ。", "simplify"],
    ["次の方程式を解いてください。", "solve_equation"],
    ["次の関数について増減を調べ、極値を求めてください。", "monotonicity_extrema"],
  ];
  for (const [phrase, intent] of cases) {
    const result = normalizeInstruction(phrase);
    assert.equal(result.status, "recognized", phrase);
    assert.equal(result.intent, intent, phrase);
  }
});

test("一般的な計算指示と未完了文は推測しない", () => {
  for (const phrase of ["計算せよ", "次の式を計算しなさい", "値を計算せよ"]) {
    const result = normalizeInstruction(phrase);
    assert.equal(result.status, "ambiguous", phrase);
    assert.equal(result.intent, null, phrase);
  }
  for (const phrase of ["微分について", "次の方程式", "グラフを描け", "証明せよ"]) {
    const result = normalizeInstruction(phrase);
    assert.equal(result.status, "unsupported", phrase);
    assert.equal(result.intent, null, phrase);
  }
});

test("異なる処理の複合指示を単一intentへ潰さない", () => {
  for (const phrase of [
    "展開して因数分解せよ",
    "微分して積分せよ",
    "接線の方程式と法線の方程式を求めよ",
    "極限を求めて微分せよ",
  ]) {
    const result = normalizeInstruction(phrase);
    assert.equal(result.status, "conflict", phrase);
    assert.equal(result.intent, null, phrase);
    assert.ok(result.candidates.length >= 2, phrase);
  }
});

test("空・過大・制御文字・hostile文字列化をinvalidまたはemptyにする", () => {
  assert.equal(normalizeInstruction("  ").status, "empty");
  assert.equal(normalizeInstruction("展開\u0000せよ").status, "invalid");
  assert.equal(normalizeInstruction("展開".repeat(300)).status, "invalid");
  const hostile = { toString() { throw new Error("boom"); } };
  assert.equal(normalizeInstruction(hostile).status, "invalid");
});
