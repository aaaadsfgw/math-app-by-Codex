import assert from "node:assert/strict";
import test from "node:test";

import { parseDefiniteIntegralInput } from "../js/solver/definite-integral-input.js";

function assertParsed(question, { expression, lowerSource, upperSource }) {
  const result = parseDefiniteIntegralInput(question);
  assert.equal(Object.isFrozen(result), true, question);
  assert.equal(result.recognized, true, question);
  assert.equal(result.ok, true, `${question}: ${result.error}`);
  assert.equal(result.expression, expression, question);
  assert.equal(result.lowerSource, lowerSource, question);
  assert.equal(result.upperSource, upperSource, question);
  assert.equal(result.error, "", question);
}

function assertInvalid(question) {
  const result = parseDefiniteIntegralInput(question);
  assert.equal(Object.isFrozen(result), true, question);
  assert.equal(result.recognized, true, question);
  assert.equal(result.ok, false, question);
  assert.equal(result.expression, "", question);
  assert.equal(result.lowerSource, "", question);
  assert.equal(result.upperSource, "", question);
  assert.ok(result.error, question);
}

test("積分記号の上下限を全文一致で抽出する", () => {
  for (const [question, expected] of [
    ["∫_0^1 x^2 dx", { expression: "x^2", lowerSource: "0", upperSource: "1" }],
    ["∫_{-1}^{2}(x^2+1)dx", { expression: "(x^2+1)", lowerSource: "-1", upperSource: "2" }],
    ["∫_(-1/2)^(+.5) sin(x) d x を求めよ", {
      expression: "sin(x)",
      lowerSource: "-1/2",
      upperSource: "+.5",
    }],
    ["∫ _ { -0.25 } ^ { 3 / 4 } (2x+1) dx を計算せよ。", {
      expression: "(2x+1)",
      lowerSource: "-0.25",
      upperSource: "3/4",
    }],
  ]) {
    assertParsed(question, expected);
  }
});

test("日本語の上下限先行・被積分関数先行を区別する", () => {
  assertParsed("0から1までx^2を定積分せよ", {
    expression: "x^2",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("x^2を-1/2から0.5まで定積分してください", {
    expression: "x^2",
    lowerSource: "-1/2",
    upperSource: "0.5",
  });
  assertParsed("次の -1 から 2 まで (x+1) を定積分を求めよ", {
    expression: "(x+1)",
    lowerSource: "-1",
    upperSource: "2",
  });
  assertParsed("0から1までx^2を積分せよ", {
    expression: "x^2",
    lowerSource: "0",
    upperSource: "1",
  });
  assertParsed("x^2を0から1まで積分せよ", {
    expression: "x^2",
    lowerSource: "0",
    upperSource: "1",
  });
});

test("不定積分と通常の式・方程式を認識対象から外す", () => {
  for (const question of [
    "∫x^2 dx",
    "x^2を積分せよ",
    "x^2の不定積分を求めよ",
    "2x+3=11",
    "0から1までの距離",
  ]) {
    const result = parseDefiniteIntegralInput(question);
    assert.equal(result.recognized, false, question);
    assert.equal(result.ok, false, question);
    assert.equal(Object.isFrozen(result), true, question);
  }
});

test("不完全・曖昧な境界記号を認識済みinvalidにする", () => {
  for (const question of [
    "∫_0 x^2 dx",
    "∫^1 x^2 dx",
    "∫_^1 x^2 dx",
    "∫_0^ x^2 dx",
    "∫_0^1 dx",
    "∫_0^1 x^2",
    "∫_0^1 x^2 dy",
    "∫^1_0 x^2 dx",
    "∫_0^1^2 x dx",
    "∫0^1 x dx",
    "∫pi^2 x dx",
    "∫(pi)^(2*pi) x dx",
    "∫PI^2 x dx",
    "∫ＰＩ^2 x dx",
    "∫Pi^2 x dx",
    "∫2pi^3 x dx",
    "∫3π/4^2 x dx",
    "∫0.5*pi^2 x dx",
    "∫pi/-2^3 x dx",
    "∫_0^a x dx",
    "∫_a^1 x dx",
    "0からaまでxを定積分せよ",
    "xを0からaまで定積分せよ",
    "∫_0^1 x dx + 1",
  ]) {
    assertInvalid(question);
  }
});

test("下付き表記・答え付き等式・指示矛盾を認識済みinvalidにする", () => {
  for (const question of [
    "∫₀¹ x dx",
    "∫₀^1 x dx",
    "∫_0^1 x dx=1/2",
    "F(x)=∫_0^x x^2 dx",
    "0から1までx^2を不定積分せよ",
    "∫_0^1 x dx の不定積分を求めよ",
    "定積分と不定積分の違い",
  ]) {
    assertInvalid(question);
  }
});

test("不正な上下限・被積分関数・過大入力を拒否する", () => {
  for (const question of [
    "∫_(1/0)^1 x dx",
    "∫_(1+1)^2 x dx",
    "∫_0^1 y dx",
    "∫_0^1 globalThis.process.exit() dx",
    "0から1までx^2;alert(1)を定積分せよ",
    `∫_0^1 ${"x+".repeat(2_501)}x dx`,
  ]) {
    assertInvalid(question);
  }
});

test("割り算範囲・x直後の数字・数字同士の暗黙積を推測しない", () => {
  for (const question of [
    "∫_0^1 1/2x dx",
    "∫_0^1 x/2x dx",
    "∫_0^1 x2 dx",
    "∫_0^1 x 2 dx",
    "∫_0^1 1 2 dx",
  ]) {
    assertInvalid(question);
  }
});

test("科学記数法風のe連結をEuler定数の暗黙積として解釈しない", () => {
  for (const question of [
    "∫_0^1 1e2 dx",
    "∫_0^1 1e-2 dx",
    "∫_0^1 2.5E+3 dx",
    "∫_0^1 .5 e 2 dx",
    "∫_0^1 １ｅ２ dx",
  ]) {
    const result = parseDefiniteIntegralInput(question);
    assert.equal(result.recognized, true, question);
    assert.equal(result.ok, false, question);
    assert.match(result.error, /科学記数法|Euler/u, question);
  }

  assertParsed("∫_0^1 2*e^2 dx", {
    expression: "2*e^2",
    lowerSource: "0",
    upperSource: "1",
  });
});

test("sin・cos・expは引数の括弧を必須にし、関数直後の数字を推測しない", () => {
  for (const question of [
    "∫_0^1 exp x dx",
    "∫_0^1 expx dx",
    "∫_0^1 sin 2x dx",
    "∫_0^1 cosx dx",
    "∫_0^1 xsin x dx",
    "∫_0^1 exp(x)2 dx",
    "∫_0^1 sin((x+1)) 3 dx",
    "∫_0^1 cos(x).5 dx",
  ]) {
    assertInvalid(question);
  }
});

test("括弧付き関数と明確な関数式は入力構文として維持する", () => {
  for (const [expression, expected] of [
    ["exp(x)", "exp(x)"],
    ["2exp(x)", "2exp(x)"],
    ["exp(x)/2", "exp(x)/2"],
    ["exp(x)/exp(x)", "exp(x)/exp(x)"],
    ["1/exp(x)*2", "1/exp(x)*2"],
    ["e^(2x+1)", "e^(2x+1)"],
    ["sin(x^2)", "sin(x^2)"],
    ["arcsin(x)", "arcsin(x)"],
  ]) {
    assertParsed(`∫_0^1 ${expression} dx`, {
      expression: expected,
      lowerSource: "0",
      upperSource: "1",
    });
  }
});
