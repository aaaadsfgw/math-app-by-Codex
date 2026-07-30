import test from "node:test";
import assert from "node:assert/strict";

import { solveQuestion } from "../js/solver/index.js";
import { solveQuadraticEquation } from "../js/solver/quadratic-equation.js";

function assertExact(result, expected) {
  assert.equal(result.supported, true, result.error);
  assert.equal(result.solved, true, result.error);
  assert.equal(result.verified, true, result.error);
  assert.equal(result.solverId, "quadratic-equation");
  assert.equal(result.resultKind, "exact");
  assert.equal(result.answer, expected);
  assert.equal(result.exactAnswer, expected);
  assert.ok(result.verification);
  assert.ok(result.solutionTrace.length >= 4);
}

test("整数・分数・有限小数係数を厳密な有理根または根号で解く", () => {
  for (const [question, expected] of [
    ["x^2-5x+6=0", "x=2,3"],
    ["2x^2+3x-2=0", "x=-2,1/2"],
    ["(1/3)x^2-1/12=0", "x=-1/2,1/2"],
    ["(3x-1)^2=0", "x=1/3"],
    ["0.5x^2-1=0", "x=-√2,√2"],
    ["(1/2)x^2-1/3=0", "x=-√6/3,√6/3"],
    ["4=x^2", "x=-2,2"],
    ["-2x^2-3x+2=0", "x=-2,1/2"],
  ]) {
    assertExact(solveQuadraticEquation(question), expected);
  }
});

test("無理数の丸め値は厳密解と分離する", () => {
  const result = solveQuadraticEquation("0.5x^2-1=0");
  assertExact(result, "x=-√2,√2");
  assert.match(result.approximateAnswer, /^x≈-1\.414/);
  assert.doesNotMatch(result.exactAnswer, /約|≈|1\.414/u);
});

test("0付近の判別式と微小な二次係数を許容誤差なしで判定する", () => {
  assertExact(
    solveQuadraticEquation("x^2-2x+0.99999999999999999999=0"),
    "x=9999999999/10000000000,10000000001/10000000000",
  );
  assertExact(
    solveQuadraticEquation("x^2-2x+1.00000000000000000001=0"),
    "実数解なし",
  );
  assertExact(
    solveQuadraticEquation("0.0000000001x^2-x=0"),
    "x=0,10000000000",
  );
  assertExact(
    solveQuadraticEquation("x^2+0.0000000001=0"),
    "実数解なし",
  );
});

test("桁落ちする巨大係数でも解の個数と表示値を失わない", () => {
  for (const [question, expected] of [
    [
      "x^2-2.000000001x+1.000000001=0",
      "x=1,1000000001/1000000000",
    ],
    [
      "1000000000x^2-2000000001x+1000000001=0",
      "x=1,1000000001/1000000000",
    ],
    [
      "1000000000x^2-1000000001x+1=0",
      "x=1/1000000000,1",
    ],
    [
      "x^2-2000000000x+999999999999999999=0",
      "x=999999999,1000000001",
    ],
    [
      "100000000000000000000x^2-200000000000000000001x+100000000000000000001=0",
      "x=1,100000000000000000001/100000000000000000000",
    ],
    [
      "x^2-200000000000000000000x+9999999999999999999999999999999999999998=0",
      "x=100000000000000000000-√2,100000000000000000000+√2",
    ],
    [
      "x^2-1000000000001=0",
      "x=-√1000000000001,√1000000000001",
    ],
  ]) {
    assertExact(solveQuadraticEquation(question), expected);
  }
});

test("日本語指示・全角・左右逆の入力を全面一致で解釈する", () => {
  assertExact(
    solveQuadraticEquation("次の二次方程式を解いて：０．５ｘ²－１＝０"),
    "x=-√2,√2",
  );
  assertExact(solveQuadraticEquation("４＝ｘ²"), "x=-2,2");
});

test("曖昧表記・部分一致・不正入力を検証済みにしない", () => {
  for (const question of [
    "x2-5x+6=0",
    "ｘ２－５ｘ＋６＝０",
    "x^2=4 garbage",
    "f(x)=x^2=4",
    "0=x^2=4",
    "x^2=4;alert(1)",
    "sin x=x^2",
    "sqrt(x)=x^2",
    "y+x^2=4",
    "ax^2+bx+c=0",
    "x^^2=4",
    "=x^2",
    "x^2=",
    "x^2==4",
    "1/(x-1)=0",
    "0.0000000001x^3+x^2-1=0",
  ]) {
    const result = solveQuadraticEquation(question);
    assert.equal(result.solved, false, question);
    assert.equal(result.verified, false, question);
    assert.equal(result.answer, "", question);
  }

  const routedAmbiguous = solveQuestion("x2-4=0");
  assert.equal(routedAmbiguous.solved, false);
  assert.equal(routedAmbiguous.verified, false);
});

test("退化した二次式は全体ルーターで一次方程式へ安全に渡す", () => {
  const direct = solveQuadraticEquation("0x^2+2x-4=0");
  assert.equal(direct.supported, false);
  assert.equal(direct.solved, false);

  for (const [question, expected] of [
    ["0x^2+2x-4=0", "x=2"],
    ["0x^2=0", "すべての実数"],
    ["0x^2+1=0", "解なし"],
    ["(x-x)x+2x-4=0", "x=2"],
  ]) {
    const result = solveQuestion(question);
    assert.equal(result.solverId, "linear-equation", question);
    assert.equal(result.answer, expected, question);
    assert.equal(result.verified, true, question);
  }
});

test("係数上限を超える式を近似解へ落とさない", () => {
  const result = solveQuadraticEquation(`x^2+1${"0".repeat(101)}=0`);
  assert.equal(result.supported, false);
  assert.equal(result.solved, false);
  assert.equal(result.verified, false);
  assert.equal(result.answer, "");
});
