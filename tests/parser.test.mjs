import test from "node:test";
import assert from "node:assert/strict";

import {
  cleanModelOutput,
  extractFinalAnswer,
  parseAnswer,
  stripCodeFences,
  stripThinkBlocks,
} from "../js/answer-parser.js";

test("thinkブロックを大文字小文字に関係なく除去する", () => {
  assert.equal(stripThinkBlocks("<think>内部推論</think>\nx=4").trim(), "x=4");
  assert.equal(stripThinkBlocks("<THINK>秘密</THINK>答え").trim(), "答え");
  assert.equal(stripThinkBlocks("<think>閉じていない推論"), "");
});

test("Markdownコードフェンスを除去する", () => {
  assert.equal(stripCodeFences("```text\nx=4\n```").trim(), "x=4");
});

test("答えモードは明示された最終回答を優先する", () => {
  const parsed = parseAnswer("計算すると4です。\n最終回答: [x=4]", "answer");
  assert.deepEqual(parsed, { content: "x=4", finalAnswer: "x=4", mode: "answer" });
  assert.equal(extractFinalAnswer("途中\n答え：\"11\"\n補足"), "11");
});

test("明示ラベルがない答えモードでは最後の空でない行を取る", () => {
  const parsed = parseAnswer("途中式\n2x=8\n\n x=4 ", "answer");
  assert.equal(parsed.finalAnswer, "x=4");
});

test("空回答は不明として扱う", () => {
  assert.equal(parseAnswer("", "answer").content, "不明");
  assert.equal(parseAnswer("<think>推論だけ</think>", "answer").content, "不明");
});

test("ヒント・途中式・解説は複数行を保持する", () => {
  const hint = parseAnswer("<think>hidden</think>\nまず移項します。\n次に両辺を2で割ります。", "hint2");
  assert.equal(hint.content, "まず移項します。\n次に両辺を2で割ります。");
  assert.equal(hint.finalAnswer, null);

  const explanation = parseAnswer("分類: 一次方程式\n式変形: 2x=8\n最終回答: x=4", "explain");
  assert.match(explanation.content, /分類: 一次方程式/);
  assert.match(explanation.content, /式変形: 2x=8/);
  assert.match(explanation.content, /x=4/);
  assert.equal(explanation.finalAnswer, "x=4");
});

test("解説では検算行が後にあっても明示された最終回答を抽出する", () => {
  const parsed = parseAnswer(
    "分類: 一次方程式\n式変形: 2x=8\n最終回答: x=4\n検算: 代入すると11=11",
    "explain",
  );
  assert.match(parsed.content, /検算: 代入すると11=11/);
  assert.equal(parsed.finalAnswer, "x=4");
});

test("外側の角括弧と過剰な引用符を除去する", () => {
  assert.equal(extractFinalAnswer("最終回答: 【\"x=2,3\"】"), "x=2,3");
  assert.equal(extractFinalAnswer("['11']"), "11");
});

test("長すぎる回答をモード別上限で制御する", () => {
  const answer = parseAnswer("a".repeat(800), "answer").content;
  assert.equal(answer.length, 500);
  assert.ok(answer.endsWith("…"));

  const verbose = cleanModelOutput("b".repeat(5000));
  assert.equal(verbose.length, 4000);
  assert.ok(verbose.endsWith("…"));
});
