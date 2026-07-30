import assert from "node:assert/strict";
import test from "node:test";

import { presentSolution } from "../js/solution-presenter.js";

const verifiedResult = Object.freeze({
  supported: true,
  solved: true,
  answer: "x=4",
  steps: ["2x+3=11", "2x=8", "x=4"],
  verified: true,
  verification: "x=4を代入すると両辺が一致します。",
  solverId: "linear-equation",
});

test("5つの出力モードを検証済み結果から決定的に生成する", () => {
  assert.equal(presentSolution(verifiedResult, { mode: "answer" }).content, "x=4");

  const hint1 = presentSolution(verifiedResult, { mode: "hint1" }).content;
  assert.match(hint1, /変数を含む項と定数項/);
  assert.doesNotMatch(hint1, /x=4/);

  const hint2 = presentSolution(verifiedResult, { mode: "hint2" }).content;
  assert.match(hint2, /2x=8/);
  assert.doesNotMatch(hint2, /x=4/);

  const steps = presentSolution(verifiedResult, { mode: "steps" }).content;
  assert.equal(steps, "2x+3=11\n2x=8\nx=4");

  const explanation = presentSolution(verifiedResult, {
    mode: "explain",
    category: "一次方程式",
  }).content;
  assert.match(explanation, /分類: 一次方程式/);
  assert.match(explanation, /最終回答: x=4/);
  assert.match(explanation, /検算:/);
});

test("未検証・未対応・空回答は表示生成へ通さない", () => {
  for (const patch of [
    { verified: false },
    { supported: false },
    { solved: false },
    { answer: "" },
  ]) {
    assert.throws(
      () => presentSolution({ ...verifiedResult, ...patch }),
      /検証済みの解答結果/,
    );
  }
});

test("未知の出力モードは答えモードへ安全に戻す", () => {
  assert.equal(presentSolution(verifiedResult, { mode: "unknown" }).content, "x=4");
});

test("厳密解を最終回答に保ったまま近似値を補助表示する", () => {
  const result = {
    ...verifiedResult,
    answer: "x=-√2,√2",
    exactAnswer: "x=-√2,√2",
    approximateAnswer: "x≈-1.41421356237,1.41421356237",
  };
  const answer = presentSolution(result, { mode: "answer" });
  assert.equal(
    answer.content,
    "x=-√2,√2\nx≈-1.41421356237,1.41421356237",
  );
  assert.equal(answer.finalAnswer, "x=-√2,√2");

  const explanation = presentSolution(result, { mode: "explain" }).content;
  assert.match(explanation, /最終回答: x=-√2,√2/u);
  assert.match(explanation, /近似値: x≈-1\.414/u);
});

test("型付き解法履歴の結論行と回答を含む行をヒントへ漏らさない", () => {
  const typed = {
    ...verifiedResult,
    answer: "x=4（ただし a>0）",
    exactAnswer: "x=4",
    solutionTrace: [
      { type: "input", content: "2x+3=11", explanation: "元の式を確認" },
      { type: "rule", content: "両辺から3を引く", explanation: "xの項を孤立させる" },
      { type: "transformation", content: "この後は x=4 を得る" },
      { type: "result", content: "x=4（ただし a>0）" },
    ],
  };
  const hint2 = presentSolution(typed, { mode: "hint2" }).content;
  assert.match(hint2, /xの項を孤立/);
  assert.doesNotMatch(hint2, /x=4/u);

  const explanation = presentSolution(typed, { mode: "explain" }).content;
  assert.match(explanation, /元の式を確認/);
  assert.match(explanation, /最終回答: x=4/);
});
