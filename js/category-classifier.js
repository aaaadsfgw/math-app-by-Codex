const CATEGORIES = Object.freeze([
  "一次方程式",
  "二次方程式",
  "式の計算",
  "連立方程式",
  "指数・対数",
  "三角関数",
  "微分",
  "積分",
  "極限",
  "数列",
  "確率",
  "図形",
  "ベクトル",
  "基数変換",
  "パーセント",
  "その他",
]);

export { CATEGORIES };
export const CATEGORY_NAMES = CATEGORIES;

function normalizedText(value) {
  return String(value ?? "")
    .replace(/[²²]/g, "^2")
    .normalize("NFKC")
    .replace(/[−‐-―−]/g, "-")
    .replace(/％/g, "%")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function addSignal(scores, reasons, category, weight, reason) {
  scores.set(category, (scores.get(category) ?? 0) + weight);
  if (!reasons.has(category)) reasons.set(category, []);
  if (!reasons.get(category).includes(reason)) reasons.get(category).push(reason);
}

function hasEquationWithX(text) {
  return text.includes("=") && /(?:^|[^a-z])x(?:[^a-z]|$)/i.test(text);
}

export function classifyCategory(question) {
  const text = normalizedText(question);
  const scores = new Map();
  const reasons = new Map();

  if (!text) {
    return { primary: "その他", candidates: ["その他"], confidence: 0, reason: "問題文が空です" };
  }

  if (/連立方程式|連立して|同時に満たす/u.test(text)) addSignal(scores, reasons, "連立方程式", 8, "連立方程式を示す語を検出");
  if (/(?:x[^=\n]*=.*y|y[^=\n]*=.*x)/i.test(text) && (text.match(/=/g)?.length ?? 0) >= 2) {
    addSignal(scores, reasons, "連立方程式", 6, "複数の未知数と等式を検出");
  }

  if (/展開|因数分解|式を簡単に|簡約|式を整理/u.test(text)) {
    addSignal(scores, reasons, "式の計算", 10, "式変形を示す語を検出");
  }

  if (/二次方程式/u.test(text)) addSignal(scores, reasons, "二次方程式", 9, "「二次方程式」を検出");
  if (/(?:x\s*\^\s*2|x2)(?=[^0-9]|$)/i.test(text)) addSignal(scores, reasons, "二次方程式", 7, "xの2乗項を検出");

  if (/一次方程式/u.test(text)) addSignal(scores, reasons, "一次方程式", 9, "「一次方程式」を検出");
  if (
    hasEquationWithX(text) &&
    !/(?:x\s*\^\s*[2-9]|x2(?=[^0-9]|$)|[a-z0-9)]\s*\^\s*x|\b(?:log|ln|sin|cos|tan)\b|√)/i.test(text)
  ) {
    addSignal(scores, reasons, "一次方程式", 5, "xを含む一次形式の等式を検出");
  }

  if (/対数|log\s*[_({]?|ln\s*[(]/i.test(text)) addSignal(scores, reasons, "指数・対数", 8, "logまたは対数表記を検出");
  if (/指数関数|指数法則|累乗|べき乗|[a-z0-9)]\s*\^\s*[a-z(]/i.test(text)) {
    addSignal(scores, reasons, "指数・対数", 5, "指数・累乗表記を検出");
  }

  if (/三角関数|正弦|余弦|正接|\b(?:sin|cos|tan)\s*[(a-z0-9]/i.test(text)) {
    addSignal(scores, reasons, "三角関数", 8, "三角関数の語または記号を検出");
  }

  if (/微分|導関数|接線の傾き|d\s*\/\s*dx|[a-z]\s*['′]/i.test(text)) addSignal(scores, reasons, "微分", 8, "微分を示す語または記号を検出");
  if (/積分|不定積分|定積分|∫/u.test(text)) addSignal(scores, reasons, "積分", 8, "積分を示す語または記号を検出");
  if (/極限|\blim\b|収束値/u.test(text)) addSignal(scores, reasons, "極限", 10, "極限を示す語またはlimを検出");
  if (/数列|等差|等比|漸化式|一般項|初項|公差|公比|a[_ₙn]|Σ/u.test(text)) addSignal(scores, reasons, "数列", 7, "数列を示す語または記号を検出");
  if (/確率|場合の数|順列|組合せ|組み合わせ|サイコロ|硬貨|カードを引/u.test(text)) addSignal(scores, reasons, "確率", 7, "確率・場合の数を示す語を検出");

  if (/ベクトル|内積|外積|成分表示|\bvec\b|→[A-Z]{2}/iu.test(text)) addSignal(scores, reasons, "ベクトル", 9, "ベクトルを示す語または記号を検出");

  if (/進数|基数|進法|(?:変換|10進).*[0-9a-z]+\s*\(\s*\d{1,2}\s*\)/iu.test(text)) {
    addSignal(scores, reasons, "基数変換", 9, "進数・基数変換の表記を検出");
  } else if (/^[+-]?[01]{2,}\s*\(\s*2\s*\)$/u.test(text) || /[01]{2,}[₂]/u.test(String(question))) {
    addSignal(scores, reasons, "基数変換", 7, "基数付き数値表記を検出");
  }

  if (/%|パーセント/u.test(text)) addSignal(scores, reasons, "パーセント", 8, "%またはパーセント表記を検出");

  if (/三角形|四角形|多角形|円(?:周|の|と)|面積|周長|内角|外角|図形|三平方|ヘロン|平行線|接線/u.test(text)) {
    addSignal(scores, reasons, "図形", 6, "図形に関する語を検出");
  }
  if (/[A-Z]\s*\(\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\)/u.test(String(question)) && /距離|中点|座標/u.test(text)) {
    addSignal(scores, reasons, "図形", 7, "座標幾何の点と対象を検出");
  }

  if (!scores.size) {
    return { primary: "その他", candidates: ["その他"], confidence: 0.3, reason: "既知の分類シグナルを検出できません" };
  }

  const ranked = [...scores.entries()].sort((left, right) => {
    const scoreDifference = right[1] - left[1];
    return scoreDifference || CATEGORIES.indexOf(left[0]) - CATEGORIES.indexOf(right[0]);
  });
  const [primary, topScore] = ranked[0];
  const secondScore = ranked[1]?.[1] ?? 0;
  const margin = topScore - secondScore;
  const confidence = Number(Math.min(0.98, Math.max(0.5, 0.62 + margin / Math.max(10, topScore) * 0.3)).toFixed(2));
  const candidates = ranked.map(([category]) => category);
  const reason = reasons.get(primary).join("、");
  return { primary, candidates, confidence, reason };
}

export const classifyQuestion = classifyCategory;
export const classifyProblem = classifyCategory;
export default classifyCategory;
