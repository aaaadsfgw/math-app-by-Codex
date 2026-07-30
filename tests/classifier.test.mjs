import test from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, classifyCategory } from "../js/category-classifier.js";

test("定義された全ジャンル名は重複しない", () => {
  assert.equal(CATEGORIES.length, 16);
  assert.equal(new Set(CATEGORIES).size, CATEGORIES.length);
  assert.equal(CATEGORIES.at(-1), "その他");
});

test("主要ジャンルの問題を分類する", () => {
  const cases = [
    ["2x + 3 = 11", "一次方程式"],
    ["x+y=3, x-y=1", "連立方程式"],
    ["x² - 5x + 6 = 0", "二次方程式"],
    ["x²-1を因数分解せよ", "式の計算"],
    ["1011(2)を10進数に変換", "基数変換"],
    ["800円の25%", "パーセント"],
    ["三角形AB=5, AC=7, ∠A=60°の面積", "図形"],
    ["A(1,2), B(4,6)間の距離", "図形"],
  ];
  cases.forEach(([question, expected]) => assert.equal(classifyCategory(question).primary, expected));
});

test("高校数学の未検証ジャンルを分類する", () => {
  const cases = [
    ["連立方程式 x+y=3, x-y=1 を解け", "連立方程式"],
    ["log_2 x = 3 を解け", "指数・対数"],
    ["2^x = 16 を解け", "指数・対数"],
    ["e^x = 2 を解け", "指数・対数"],
    ["sin 30°の値を求めよ", "三角関数"],
    ["f(x)=x^3を微分せよ", "微分"],
    ["∫x^2 dx を計算せよ", "積分"],
    ["lim x→0 sin x/x を求めよ", "極限"],
    ["等差数列の一般項を求めよ", "数列"],
    ["サイコロを2回投げる確率", "確率"],
    ["ベクトルaとbの内積", "ベクトル"],
  ];
  cases.forEach(([question, expected]) => assert.equal(classifyCategory(question).primary, expected));
});

test("複数候補、確信度、理由を返す", () => {
  const result = classifyCategory("log x = 2 を満たすxを求めよ");
  assert.equal(result.primary, "指数・対数");
  assert.ok(result.candidates.includes("指数・対数"));
  assert.ok(result.candidates.every((candidate) => CATEGORIES.includes(candidate)));
  assert.ok(result.confidence >= 0 && result.confidence <= 1);
  assert.match(result.reason, /log|対数/);
});

test("空入力と未知の問題はその他に分類する", () => {
  const empty = classifyCategory("   ");
  assert.equal(empty.primary, "その他");
  assert.equal(empty.confidence, 0);

  const unknown = classifyCategory("この文章について考えなさい");
  assert.deepEqual(unknown.candidates, ["その他"]);
  assert.equal(unknown.primary, "その他");
});
