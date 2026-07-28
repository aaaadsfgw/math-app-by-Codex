import { normalizeWhitespace } from "./utils.js";

export const PROMPT_MODES = Object.freeze(["answer", "hint1", "hint2", "steps", "explain"]);

const MODE_INSTRUCTIONS = Object.freeze({
  answer: [
    "答えだけを1行で返してください。",
    "説明、前置き、Markdown、記号による装飾は禁止です。",
    "選択肢問題は選択肢の記号だけを返してください。",
    "判断できない場合は「不明」とだけ返してください。",
  ],
  hint1: [
    "答えを直接示さず、最初に注目する点だけを1〜2文で示してください。",
    "最終的な数値や式の答えは書かないでください。",
  ],
  hint2: [
    "答えを直接示さず、使う公式または次の具体的な式変形までを2〜4文で示してください。",
    "最終結果は書かないでください。",
  ],
  steps: [
    "高校生が追える簡潔な途中式を示し、最後に最終答えを含めてください。",
    "不要な前置きや長い一般論は書かないでください。",
  ],
  explain: [
    "高校生向けに、問題の分類、使う考え方、式変形、最終答え、検算の順で説明してください。",
    "簡潔さを保ち、問題に関係のない一般論は書かないでください。",
  ],
});

function normalizeMode(mode) {
  return PROMPT_MODES.includes(mode) ? mode : "answer";
}

function solverAnchor(solverResult) {
  if (!solverResult?.verified || !solverResult?.answer) return "";
  const steps = Array.isArray(solverResult.steps)
    ? solverResult.steps.map((step) => normalizeWhitespace(step)).filter(Boolean)
    : [];
  return [
    "アプリ内ソルバーで次の結果が検証済みです。これは変更してはいけません。",
    `検証済み最終答え: ${normalizeWhitespace(solverResult.answer)}`,
    steps.length ? `検証済み途中式: ${steps.join(" → ")}` : "",
    solverResult.verification
      ? `検証内容: ${normalizeWhitespace(solverResult.verification)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildSystemPrompt({ mode = "answer", category = "その他", solverResult = null } = {}) {
  const safeMode = normalizeMode(mode);
  const categoryName = normalizeWhitespace(category) || "その他";
  const anchor = solverAnchor(solverResult);
  return [
    "あなたは高校数学の学習支援者です。日本語で正確かつ簡潔に回答してください。",
    "与えられていない条件を推測せず、計算できない場合はその事実を明示してください。",
    `問題ジャンル: ${categoryName}`,
    ...MODE_INSTRUCTIONS[safeMode],
    anchor,
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildUserPrompt({ question, mode = "answer", solverResult = null } = {}) {
  const safeMode = normalizeMode(mode);
  const cleanQuestion = normalizeWhitespace(question);
  if (!cleanQuestion) throw new TypeError("問題文が空です。");

  const verifiedReminder = solverResult?.verified && solverResult?.answer
    ? `\n検証済み答え「${normalizeWhitespace(solverResult.answer)}」と矛盾しない内容にしてください。`
    : "";
  return `/no_think\n出力モード: ${safeMode}\n問題文:\n${cleanQuestion}${verifiedReminder}`;
}

export function buildPrompt(options = {}) {
  const system = buildSystemPrompt(options);
  const user = buildUserPrompt(options);
  return {
    system,
    user,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
}

export function buildMessages(options = {}) {
  return buildPrompt(options).messages;
}
