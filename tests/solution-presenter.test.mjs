import assert from "node:assert/strict";
import test from "node:test";

import { OUTPUT_MODES, presentSolution } from "../js/solution-presenter.js";

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

test("公開出力モード一覧を外部から変更できない", () => {
  assert.equal(Object.isFrozen(OUTPUT_MODES), true);
  assert.deepEqual(OUTPUT_MODES, ["answer", "hint1", "hint2", "steps", "explain"]);
  assert.throws(() => OUTPUT_MODES.push("constructor"), TypeError);
  assert.equal(
    presentSolution(verifiedResult, { mode: "constructor" }).content,
    "x=4",
  );
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

test("与件と答えに同じ記号があってもinput行だけはヒントに保つ", () => {
  const infinity = {
    ...verifiedResult,
    answer: "+∞",
    exactAnswer: "+∞",
    solutionTrace: [
      { type: "input", content: "lim_(x→+∞) x" },
      { type: "rule", content: "次数差=1", explanation: "次数と最高次係数を比較" },
      { type: "result", content: "極限: +∞" },
    ],
    solverId: "finite-limit",
  };

  const hint2 = presentSolution(infinity, { mode: "hint2" }).content;
  assert.match(hint2, /lim_\(x→\+∞\) x/u);
  assert.match(hint2, /次数と最高次係数/u);
  assert.doesNotMatch(hint2, /極限: \+∞/u);
});

test("strategyやexplanation内に最終回答が混入してもHintへ漏らさない", () => {
  const contaminated = {
    ...verifiedResult,
    solutionTrace: [
      { type: "input", content: "2x+3=11" },
      { type: "strategy", content: "変数を孤立", explanation: "このあと x=4 を得る" },
      { type: "guided-transformation", content: "2x=8", explanation: "x=4 まで割る" },
      { type: "result", content: "x=4" },
    ],
  };
  for (const mode of ["hint1", "hint2"]) {
    const hint = presentSolution(contaminated, { mode }).content;
    assert.doesNotMatch(hint, /x=4/u, mode);
  }
});

test("最終回答の丁寧形と非結論風の等式もHintへ漏らさない", () => {
  for (const contaminatedStep of [
    { type: "strategy", content: "変数を孤立", explanation: "ここで x=4 を得ます" },
    { type: "guided-transformation", content: "x=4 が得られます", explanation: "次を確認します" },
    { type: "strategy", content: "確認", explanation: "途中でx=4を使います" },
  ]) {
    const contaminated = {
      ...verifiedResult,
      solutionTrace: [
        { type: "input", content: "2x+3=11" },
        contaminatedStep,
        { type: "result", content: "x=4" },
      ],
    };
    for (const mode of ["hint1", "hint2"]) {
      assert.doesNotMatch(presentSolution(contaminated, { mode }).content, /x=4/u, mode);
    }
  }

  const expressionAnswer = {
    ...verifiedResult,
    answer: "x+1",
    exactAnswer: "x+1",
    solutionTrace: [
      { type: "strategy", content: "方針", explanation: "ここでx+1を得ます" },
      { type: "guided-transformation", content: "次の変形", explanation: "x+1が得られます" },
    ],
  };
  const hints = `${presentSolution(expressionAnswer, { mode: "hint1" }).content}\n${presentSolution(expressionAnswer, { mode: "hint2" }).content}`;
  assert.doesNotMatch(hints, /x\+1/u);
});

test("短い答え1が式に現れても問題固有Hintを消さず、結論表現だけ除外する", () => {
  const result = {
    ...verifiedResult,
    answer: "1",
    exactAnswer: "1",
    solverId: "algebra-transformation",
    solutionTrace: [
      { type: "input", content: "x/(x+1)+1/(x+1)" },
      {
        type: "strategy",
        content: "共通分母: x+1",
        explanation: "分母 x+1 と x+1 をそろえます。",
      },
      {
        type: "guided-transformation",
        content: "x/(x+1)+1/(x+1)",
        explanation: "分子を x+1 にまとめます。",
      },
      { type: "transformation", content: "したがって答えは1" },
      { type: "result", content: "1" },
    ],
  };

  const hint1 = presentSolution(result, { mode: "hint1" }).content;
  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  assert.match(hint1, /分母 x\+1 と x\+1/u);
  assert.match(hint2, /分子を x\+1/u);
  assert.doesNotMatch(hint1, /答えは1/u);
  assert.doesNotMatch(hint2, /答えは1/u);
});

test("答えと同じ式を分母説明では保ち、隣接した結論文脈だけ除外する", () => {
  const useful = {
    ...verifiedResult,
    answer: "x+1",
    exactAnswer: "x+1",
    solverId: "algebra-transformation",
    solutionTrace: [
      { type: "strategy", content: "共通分母を考える", explanation: "分母 x+1 と x-1 をそろえます。" },
      { type: "guided-transformation", content: "1/(x+1)", explanation: "1/(x+1) を書き換えます。" },
    ],
  };
  assert.match(presentSolution(useful, { mode: "hint1" }).content, /分母 x\+1/u);
  assert.match(presentSolution(useful, { mode: "hint2" }).content, /1\/\(x\+1\)/u);

  for (const phrase of ["値はx+1", "したがってx+1を得る", "x+1です"]) {
    const contaminated = {
      ...useful,
      solutionTrace: [
        { type: "strategy", content: "方針", explanation: phrase },
        { type: "guided-transformation", content: "次の変形", explanation: phrase },
      ],
    };
    const hints = `${presentSolution(contaminated, { mode: "hint1" }).content}\n${presentSolution(contaminated, { mode: "hint2" }).content}`;
    assert.doesNotMatch(hints, /x\+1/u, phrase);
  }
});

test("複数解の一部だけをHintへ漏らさない", () => {
  const result = {
    ...verifiedResult,
    answer: "x=-2,-1/2",
    exactAnswer: "x=-2,-1/2",
    solutionTrace: [
      { type: "strategy", content: "因数分解を試す", explanation: "一つの解はx=-2です。" },
      { type: "guided-transformation", content: "もう一つを調べる", explanation: "よってx=-1/2を得る。" },
    ],
  };
  for (const mode of ["hint1", "hint2"]) {
    const hint = presentSolution(result, { mode }).content;
    assert.doesNotMatch(hint, /x=-2|-1\/2/u, mode);
  }
});

test("二次方程式のHint2は標準形と実際の判別式を示し最終解を漏らさない", () => {
  const result = {
    ...verifiedResult,
    answer: "x=-2,-1/2",
    exactAnswer: "x=-2,-1/2",
    solverId: "quadratic-equation",
    solutionTrace: [
      { type: "input", content: "2*x^2+5*x+2=0" },
      {
        type: "transformation",
        content: "(2)x^2+(5)x+(2)=0",
        explanation: "右辺を0にして係数を整理します。",
      },
      {
        type: "strategy",
        content: "判別式 D=b^2-4ac=9",
        explanation: "判別式の符号と平方数かを厳密に判定します。",
      },
      { type: "result", content: "x=-2,-1/2" },
    ],
  };

  const hint2 = presentSolution(result, { mode: "hint2" }).content;
  assert.match(hint2, /\(2\)x\^2\+\(5\)x\+\(2\)=0/u);
  assert.match(hint2, /D=b\^2-4ac=9/u);
  assert.doesNotMatch(hint2, /x=-2|-1\/2/u);
});
