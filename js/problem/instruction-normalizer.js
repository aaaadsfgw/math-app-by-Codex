export const INSTRUCTION_INTENTS = Object.freeze([
  "simplify",
  "expand",
  "factor",
  "solve_equation",
  "differentiate",
  "integrate",
  "definite_integral",
  "limit",
  "tangent",
  "normal",
  "monotonicity",
  "extrema",
  "monotonicity_extrema",
]);

const INTENT_SET = new Set(INSTRUCTION_INTENTS);
const MAX_INSTRUCTION_CHARACTERS = 512;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const TRAILING_PUNCTUATION = /[。．.!！?？]+$/gu;
const COMMAND_ENDINGS = Object.freeze([
  "せよ",
  "しなさい",
  "してください",
  "求めよ",
  "求めなさい",
  "求めてください",
  "調べよ",
  "調べなさい",
  "調べてください",
  "解け",
  "解きなさい",
  "解いてください",
]);

function frozenResult({
  status,
  intent = null,
  normalizedText = "",
  candidates = [],
  reason = "",
} = {}) {
  return Object.freeze({
    status,
    intent: INTENT_SET.has(intent) ? intent : null,
    normalizedText,
    candidates: Object.freeze(
      [...new Set(candidates)].filter((candidate) => INTENT_SET.has(candidate)),
    ),
    reason,
  });
}

function snapshotText(value) {
  try {
    return { text: String(value ?? ""), error: null };
  } catch (error) {
    return { text: "", error };
  }
}

function normalizeSurface(value) {
  const snapshot = snapshotText(value);
  if (snapshot.error) {
    return frozenResult({
      status: "invalid",
      reason: "指示文を安全に読み取れませんでした。",
    });
  }
  if (snapshot.text.length > MAX_INSTRUCTION_CHARACTERS) {
    return frozenResult({
      status: "invalid",
      reason: "指示文が長すぎます。",
    });
  }
  if (CONTROL_CHARACTER.test(snapshot.text)) {
    return frozenResult({
      status: "invalid",
      reason: "指示文に使用できない制御文字が含まれています。",
    });
  }

  const normalizedText = snapshot.text
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(TRAILING_PUNCTUATION, "")
    .trim();
  if (!normalizedText) return frozenResult({ status: "empty" });
  return Object.freeze({ normalizedText });
}

function hasCommandEnding(compact) {
  return COMMAND_ENDINGS.some((ending) => compact.endsWith(ending));
}

function hasSolveEquationSignal(compact) {
  return (
    (/方程式/u.test(compact) && /(?:解け|解きなさい|解いてください)/u.test(compact))
    || /解を求め(?:よ|なさい|てください)$/u.test(compact)
    || /^[A-Za-z]の値を求め(?:よ|なさい|てください)$/u.test(compact)
  );
}

function semanticCandidates(compact) {
  const candidates = [];

  const hasMonotonicity = /増減/u.test(compact);
  const hasExtrema = /極値/u.test(compact);
  if (hasMonotonicity && hasExtrema) candidates.push("monotonicity_extrema");
  else if (hasMonotonicity) candidates.push("monotonicity");
  else if (hasExtrema) candidates.push("extrema");

  if (/接線の方程式/u.test(compact)) candidates.push("tangent");
  if (/法線の方程式/u.test(compact)) candidates.push("normal");
  if (/極限(?:値)?/u.test(compact)) candidates.push("limit");
  if (/不定積分/u.test(compact)) candidates.push("integrate");
  else if (/定積分/u.test(compact)) candidates.push("definite_integral");
  else if (/積分/u.test(compact)) candidates.push("integrate");
  if (/微分|導関数/u.test(compact)) candidates.push("differentiate");
  if (/因数分解/u.test(compact)) candidates.push("factor");
  if (/展開/u.test(compact)) candidates.push("expand");
  if (/簡単|簡約|整理/u.test(compact)) candidates.push("simplify");
  if (hasSolveEquationSignal(compact)) candidates.push("solve_equation");

  if (/分数式を計算/u.test(compact)) candidates.push("simplify");
  return [...new Set(candidates)];
}

export function isInstructionIntent(value) {
  return typeof value === "string" && INTENT_SET.has(value);
}

export function looksLikeInstructionText(value) {
  const surface = normalizeSurface(value);
  if (surface.status) return false;
  const compact = surface.normalizedText.replace(/\s+/gu, "");
  return hasCommandEnding(compact) || /(?:計算|解け|解きなさい|解いてください)/u.test(compact);
}

/**
 * Converts a bounded Japanese instruction into one closed canonical intent.
 * It never inspects or rewrites a formula. Generic "計算せよ" remains
 * ambiguous; only the explicit subject "分数式を計算" is the simplify alias.
 */
export function normalizeInstruction(value) {
  const surface = normalizeSurface(value);
  if (surface.status) return surface;
  const { normalizedText } = surface;
  const compact = normalizedText.replace(/\s+/gu, "");

  if (!looksLikeInstructionText(normalizedText)) {
    return frozenResult({
      status: "unsupported",
      normalizedText,
      reason: "命令として完結した対応済み指示を確認できません。",
    });
  }

  const candidates = semanticCandidates(compact);
  if (candidates.length > 1) {
    return frozenResult({
      status: "conflict",
      normalizedText,
      candidates,
      reason: "複数の異なる処理が同時に指定されています。",
    });
  }
  if (candidates.length === 1) {
    return frozenResult({
      status: "recognized",
      intent: candidates[0],
      normalizedText,
      candidates,
    });
  }
  if (/計算/u.test(compact)) {
    return frozenResult({
      status: "ambiguous",
      normalizedText,
      reason: "「計算」だけでは、簡約・展開・値の評価などを一意に決められません。",
    });
  }
  return frozenResult({
    status: "unsupported",
    normalizedText,
    reason: "この指示は現在のcanonical intentへ安全に変換できません。",
  });
}

export function categoryForInstructionIntent(intent) {
  if (["simplify", "expand", "factor"].includes(intent)) return "式の計算";
  if (["differentiate", "tangent", "normal", "monotonicity", "extrema", "monotonicity_extrema"].includes(intent)) {
    return "微分";
  }
  if (["integrate", "definite_integral"].includes(intent)) return "積分";
  if (intent === "limit") return "極限";
  if (intent === "solve_equation") return "方程式";
  return null;
}
