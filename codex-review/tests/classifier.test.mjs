import test from "node:test";
import assert from "node:assert/strict";

import { CATEGORIES, classifyCategory } from "../js/category-classifier.js";

test("定義された全ジャンル名は重複しない", () => {
  assert.equal(CATEGORIES.length, 18);
  assert.equal(new Set(CATEGORIES).size, CATEGORIES.length);
  assert.equal(CATEGORIES.at(-1), "その他");
});

test("主要ジャンルの問題を分類する", () => {
  const cases = [
    ["2x + 3 = 11", "一次方程式"],
    ["x+y=3, x-y=1", "連立方程式"],
    ["2x+3<11", "不等式"],
    ["x² - 5x + 6 = 0", "二次方程式"],
    ["1/(x-1)=2", "分数方程式"],
    ["x^-1=2", "分数方程式"],
    ["(1/3)x+1=0", "一次方程式"],
    ["1/(2)*x=1", "一次方程式"],
    ["1/(2)+(x)=1", "一次方程式"],
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
    ["2^-x = 8 を解け", "指数・対数"],
    ["e^x = 2 を解け", "指数・対数"],
    ["sin 30°の値を求めよ", "三角関数"],
    ["f(x)=x^3を微分せよ", "微分"],
    ["normal_x_[1](x^2)", "微分"],
    ["曲線 y=x^2 の x=1 における法線の方程式を求めよ", "微分"],
    ["曲線 y=x^2 の x=1 における法線方程式を求めよ", "微分"],
    ["曲線 f(x)=x^2 の x=1 における法線方程式を求めよ", "微分"],
    ["monotonicity(x^3-3x)", "微分"],
    ["関数 y=x^3-3x の増減と極値を求めよ", "微分"],
    ["concavity_inflection(x^4-2x^2)", "微分"],
    ["関数 y=x^3 の凹凸と変曲点を求めよ", "微分"],
    ["∫x^2 dx を計算せよ", "積分"],
    ["lim x→0 sin x/x を求めよ", "極限"],
    ["等差数列の一般項を求めよ", "数列"],
    ["サイコロを2回投げる確率", "確率"],
    ["ベクトルaとbの内積", "ベクトル"],
  ];
  cases.forEach(([question, expected]) => assert.equal(classifyCategory(question).primary, expected));
});

test("一般曲線の法線は二次式シグナルより図形を優先し、明示関数の対応形式は微分にする", () => {
  const cases = [
    ["円 x^2+y^2=1 上の法線を求めよ", "図形"],
    ["楕円 x^2/4+y^2/9=1 の法線方程式を求めよ", "図形"],
    ["放物線 y^2=4x 上の点 (1,2) における法線を求めよ", "図形"],
    ["双曲線 x^2-y^2=1 の法線の方程式を求めよ", "図形"],
    ["陰関数 F(x,y)=0 の法線を求めよ", "図形"],
    ["媒介変数 x=t^2, y=t^3 で表される曲線の法線を求めよ", "図形"],
    ["極座標 r=2cosθ が表す曲線の法線を求めよ", "図形"],
    ["曲線 x^2+y^2=1 上の法線を求めよ", "図形"],
    ["曲線 y=x^2 の x=1 における法線方程式を求めよ", "微分"],
    ["曲線 y=x^2 上の点 (1,1) における法線方程式を求めよ", "微分"],
    ["関数 f(x)=x^2 の x=1 における法線の方程式を求めよ", "微分"],
  ];
  cases.forEach(([question, expected]) => assert.equal(
    classifyCategory(question).primary,
    expected,
    question,
  ));
});

test("法線の明示関数形式は未対応表記も微分へ寄せ、円を表す曲線文脈は空白に左右されず図形にする", () => {
  const differentiationCases = [
    "曲線y=x^2のx=1における法線方程式を求めよ",
    "y=x^2 の x=1 における法線の方程式を求めよ",
    "f(x)=x^2 の x=1 における法線を求めよ",
    "関数 y=x^2 の x=1 における法線の方程式を求めよ",
    "関数f(x)=x^2のx=1における法線方程式を求めよ",
    "曲線 f(x)=x^2 の x=1 における法線の方程式を求めよ",
  ];
  for (const question of differentiationCases) {
    assert.equal(classifyCategory(question).primary, "微分", question);
  }

  const geometryCases = [
    "円の上半分を表す曲線 y=sqrt(1-x^2) の法線の方程式を求めよ",
    "円の上半分を表す曲線y=sqrt(1-x^2)の法線の方程式を求めよ",
    "円 の上半分を表す 曲線 y = sqrt(1-x^2) の法線を求めよ",
    "図Aの曲線の法線を求めよ",
    "第A図に示す曲線の法線を求めよ",
    "図αから曲線の法線を求めよ",
    "Figure 1 の曲線の法線を求めよ",
    "Fig.1の曲線の法線を求めよ",
    "写真の曲線の法線を求めよ",
  ];
  for (const question of geometryCases) {
    assert.equal(classifyCategory(question).primary, "図形", question);
  }
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
