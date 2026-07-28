import { normalizeQuestion } from "./utils.js";

export const DEMO_CASES = Object.freeze([
  Object.freeze({
    id: "demo-linear-equation",
    category: "一次方程式",
    answer: "x=4",
    steps: ["2x+3=11", "2x=8", "x=4"],
    hint1: "xを含む項と定数項を分けることに注目しましょう。",
    hint2: "両辺から3を引くと、2x=8まで変形できます。",
    matches: (question) => /(?:^|[^0-9])2x\+3=11(?:$|[^0-9])/.test(question),
  }),
  Object.freeze({
    id: "demo-quadratic-equation",
    category: "二次方程式",
    answer: "x=2,3",
    steps: ["x^2-5x+6=0", "(x-2)(x-3)=0", "x=2,3"],
    hint1: "積が6、和が-5になる2数を探して因数分解しましょう。",
    hint2: "左辺は(x-2)(x-3)と因数分解できます。各因数が0になる場合を考えます。",
    matches: (question) => /x(?:\^2|2)-5x\+6=0/.test(question),
  }),
  Object.freeze({
    id: "demo-base-conversion",
    category: "基数変換",
    answer: "11",
    steps: ["1011(2)=1×2^3+0×2^2+1×2+1", "=11"],
    hint1: "各桁を2の位取りとして考えましょう。",
    hint2: "1×2^3+0×2^2+1×2^1+1×2^0と展開します。",
    matches: (question) => /1011\(2\)/.test(question),
  }),
  Object.freeze({
    id: "demo-percentage",
    category: "パーセント",
    answer: "200",
    steps: ["800×25/100", "=200"],
    hint1: "25%を100分の25に直して考えましょう。",
    hint2: "求める量は800×25/100で表せます。",
    matches: (question) => /800円?(?:の)?25%/.test(question),
  }),
  Object.freeze({
    id: "demo-triangle-area",
    category: "図形",
    answer: "35√3/4",
    steps: ["S=(1/2)×5×7×sin60°", "=35√3/4"],
    hint1: "2辺とその間の角から面積を求める公式に注目しましょう。",
    hint2: "面積をSとすると、S=(1/2)×5×7×sin60°です。",
    matches: (question) =>
      /AB=5/i.test(question) &&
      /AC=7/i.test(question) &&
      /(?:∠?A=60(?:度|°)?)/i.test(question) &&
      /(?:面積|triangle|三角形)/i.test(question),
  }),
  Object.freeze({
    id: "demo-coordinate-distance",
    category: "図形",
    answer: "5",
    steps: ["√((4-1)^2+(6-2)^2)", "=√25", "=5"],
    hint1: "x座標の差とy座標の差から直角三角形を考えましょう。",
    hint2: "距離は√((4-1)^2+(6-2)^2)と表せます。",
    matches: (question) => /A\(1,2\).*B\(4,6\)/i.test(question) && /距離/.test(question),
  }),
]);

function compactQuestion(question) {
  return normalizeQuestion(question).replace(/\s+/g, "");
}

function unmatchedResult() {
  return {
    matched: false,
    supported: false,
    solved: false,
    answer: "",
    steps: [],
    verified: false,
    verification: "",
    verificationType: "unsupported",
    verificationMessage: "固定デモに一致しません。",
    solverId: null,
    demoId: null,
    error: "デモデータ未対応",
  };
}

function outputForMode(demo, mode) {
  if (mode === "hint1") return demo.hint1;
  if (mode === "hint2") return demo.hint2;
  if (mode === "steps") return demo.steps.join("\n");
  if (mode === "explain") {
    return [
      `問題の分類: ${demo.category}`,
      "考え方と式変形:",
      ...demo.steps,
      `最終答え: ${demo.answer}`,
      "固定デモの既知の結果と一致することを確認しました。",
    ].join("\n");
  }
  return demo.answer;
}

export function solveDemo(question, { mode = "answer" } = {}) {
  const normalized = compactQuestion(question);
  if (!normalized) return unmatchedResult();
  const demo = DEMO_CASES.find((candidate) => candidate.matches(normalized));
  if (!demo) return unmatchedResult();

  return {
    matched: true,
    supported: true,
    solved: true,
    answer: demo.answer,
    steps: [...demo.steps],
    output: outputForMode(demo, mode),
    category: demo.category,
    verified: false,
    verification: "固定されたデモデータです。自作ソルバーによる検証結果ではありません。",
    verificationType: "demo",
    verificationMessage: "デモデータ",
    solverId: null,
    demoId: demo.id,
    error: null,
  };
}

export function isDemoQuestion(question) {
  return solveDemo(question).matched;
}
