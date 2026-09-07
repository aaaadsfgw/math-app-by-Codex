const MAX_CANDIDATE_CHARACTERS = 4_096;
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/u;
const IDENTIFIER_CHARACTER = /[A-Za-z0-9.]/u;
const SAFE_WIDTH_CHARACTER = /^[\u3000\uFF01-\uFF5E]$/u;
const SUPERSCRIPT_SEQUENCE = /[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu;
const UNSUPPORTED_SUPERSCRIPT = /[\u2070-\u209F\u00B2\u00B3\u00B9]/u;
const EXPONENT_BASE_CHARACTER = /[\p{L}\p{N})\]}]/u;

const SUPERSCRIPT_DIGITS = Object.freeze({
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
});

const SAFE_SYMBOLS = Object.freeze(new Map([
  ["ast", "*"],
  ["dot.c", "*"],
  ["times", "*"],
  ["div", "/"],
  ["pi", "pi"],
]));

const UNSUPPORTED_SYMBOLS = Object.freeze(new Map([
  ["approx", "≈"],
  ["equiv", "≡"],
  ["integral", "∫"],
  ["integral.cont", "∮"],
  ["integral.double", "∬"],
  ["integral.triple", "∭"],
  ["oo", "∞"],
  ["plus.minus", "±"],
  ["minus.plus", "∓"],
  ["product", "∏"],
  ["sum", "∑"],
  ["subset", "⊂"],
  ["subset.eq", "⊆"],
  ["supset", "⊃"],
  ["supset.eq", "⊇"],
  ["union", "∪"],
  ["inter", "∩"],
  ["partial", "∂"],
  ["nabla", "∇"],
  ["forall", "∀"],
  ["exists", "∃"],
  ["in", "∈"],
  ["in.not", "∉"],
  ["parallel", "∥"],
  ["perp", "⊥"],
  ["prop", "∝"],
  ["arrow", "→"],
  ["arrow.l", "←"],
  ["alpha", "alpha"],
  ["beta", "beta"],
  ["gamma", "gamma"],
  ["theta", "theta"],
  ["delta", "δ"],
  ["epsilon", "ε"],
  ["eta", "η"],
  ["iota", "ι"],
  ["kappa", "κ"],
  ["lambda", "λ"],
  ["mu", "μ"],
  ["nu", "ν"],
  ["xi", "ξ"],
  ["omicron", "ο"],
  ["rho", "ρ"],
  ["sigma", "σ"],
  ["tau", "τ"],
  ["upsilon", "υ"],
  ["phi", "φ"],
  ["chi", "χ"],
  ["psi", "ψ"],
  ["omega", "ω"],
  ["Delta", "Δ"],
  ["Gamma", "Γ"],
  ["Lambda", "Λ"],
  ["Omega", "Ω"],
  ["Phi", "Φ"],
  ["Pi", "Π"],
  ["Psi", "Ψ"],
  ["Sigma", "Σ"],
  ["Theta", "Θ"],
  ["Upsilon", "Υ"],
  ["Xi", "Ξ"],
]));

function candidateError(message, code) {
  const error = new Error(message);
  error.name = "MathOcrNormalizationError";
  error.code = code;
  return error;
}

function assertBalancedDelimiters(text) {
  const stack = [];
  const closer = new Map([["(", ")"], ["[", "]"]]);
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && text[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (closer.has(character)) stack.push(character);
    else if (character === ")" || character === "]") {
      const opener = stack.pop();
      if (!opener || closer.get(opener) !== character) {
        throw candidateError("OCR数式の括弧対応が不正です。", "OCR_NORMALIZATION_UNBALANCED");
      }
    }
  }
  if (quoted || stack.length > 0) {
    throw candidateError("OCR数式の括弧または引用符が閉じていません。", "OCR_NORMALIZATION_UNBALANCED");
  }
}

function findClosingParenthesis(text, opener) {
  let depth = 0;
  let quoted = false;
  for (let index = opener; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"' && text[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (character === "(") depth += 1;
    if (character === ")") {
      depth -= 1;
      if (depth === 0) return index;
      if (depth < 0) return -1;
    }
  }
  return -1;
}

function splitArguments(body) {
  const argumentsList = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '"' && body[index - 1] !== "\\") quoted = !quoted;
    if (quoted) continue;
    if (character === "(" || character === "[") depth += 1;
    else if (character === ")" || character === "]") depth -= 1;
    else if (character === "," && depth === 0) {
      argumentsList.push(body.slice(start, index).trim());
      start = index + 1;
    }
  }
  argumentsList.push(body.slice(start).trim());
  return argumentsList;
}

function transformCalls(text, warnings) {
  let output = "";
  for (let index = 0; index < text.length;) {
    if (!/[A-Za-z]/u.test(text[index])) {
      output += text[index];
      index += 1;
      continue;
    }

    let nameEnd = index + 1;
    while (nameEnd < text.length && IDENTIFIER_CHARACTER.test(text[nameEnd])) {
      nameEnd += 1;
    }
    const name = text.slice(index, nameEnd);
    let opener = nameEnd;
    while (text[opener] === " ") opener += 1;
    if (text[opener] !== "(") {
      output += name;
      index = nameEnd;
      continue;
    }

    const closer = findClosingParenthesis(text, opener);
    if (closer < 0) {
      throw candidateError("OCR数式の括弧が閉じていません。", "OCR_NORMALIZATION_UNBALANCED");
    }
    const rawBody = text.slice(opener + 1, closer);
    const args = splitArguments(rawBody).map((argument) => transformCalls(argument, warnings));
    if (name === "frac" && args.length === 2 && args.every(Boolean)) {
      output += `((${args[0]})/(${args[1]}))`;
    } else if (name === "root" && args.length === 2 && args.every(Boolean)) {
      output += `((${args[1]})^(1/(${args[0]})))`;
    } else if (name === "sqrt" && args.length === 1 && args[0]) {
      output += `sqrt(${args[0]})`;
    } else {
      warnings.add(`未対応の構造 ${name}(…) は自動変換していません。`);
      output += `⟦${name}(${args.join(",")})⟧`;
    }
    index = closer + 1;
  }
  return output;
}

function replaceSymbolWords(text, warnings) {
  return text.replace(/[A-Za-z][A-Za-z0-9.]*/gu, (word) => {
    if (SAFE_SYMBOLS.has(word)) return SAFE_SYMBOLS.get(word);
    if (UNSUPPORTED_SYMBOLS.has(word)) {
      const replacement = UNSUPPORTED_SYMBOLS.get(word);
      if (!["alpha", "beta", "gamma", "theta"].includes(word)) {
        warnings.add(`${word} は確認が必要な記号 ${replacement} として保持しました。`);
      }
      return replacement;
    }
    return word;
  });
}

function unescapeTypstPunctuation(text) {
  return text.replace(/\\([ ()*,/;@\[\]{}"])/gu, "$1");
}

function normalizeSafeWidthCharacters(text) {
  return [...text].map((character) => (
    SAFE_WIDTH_CHARACTER.test(character) ? character.normalize("NFKC") : character
  )).join("");
}

function normalizeSafeMathGlyphs(text, warnings) {
  const expanded = text.replace(SUPERSCRIPT_SEQUENCE, (sequence, offset, source) => {
    const previous = source[offset - 1] || "";
    if (!EXPONENT_BASE_CHARACTER.test(previous)) {
      warnings.add("基数を安全に確定できない上付き数字は変換していません。");
      return sequence;
    }
    return `^${[...sequence].map((character) => SUPERSCRIPT_DIGITS[character]).join("")}`;
  });
  const normalized = expanded
    .replace(/−/gu, "-")
    .replace(/×/gu, "*")
    .replace(/÷/gu, "/");
  if (UNSUPPORTED_SUPERSCRIPT.test(normalized)) {
    warnings.add("安全な数字列以外の上付き文字は変換していません。");
  }
  return normalized;
}

export function normalizeMathOcrCandidate(value) {
  if (typeof value !== "string") {
    throw candidateError("OCR候補は文字列である必要があります。", "OCR_NORMALIZATION_INVALID");
  }
  const sourceText = value.replace(/\r\n?/gu, "\n").trim();
  if (!sourceText) {
    throw candidateError("OCR候補が空です。", "OCR_NORMALIZATION_EMPTY");
  }
  if (sourceText.length > MAX_CANDIDATE_CHARACTERS) {
    throw candidateError("OCR候補が長すぎます。", "OCR_NORMALIZATION_TOO_LONG");
  }
  if (CONTROL_CHARACTERS.test(sourceText)) {
    throw candidateError(
      "OCR候補に使用できない制御文字が含まれています。",
      "OCR_NORMALIZATION_CONTROL_CHARACTER",
    );
  }
  const warnings = new Set();
  const prepared = normalizeSafeMathGlyphs(
    normalizeSafeWidthCharacters(unescapeTypstPunctuation(sourceText)),
    warnings,
  );
  assertBalancedDelimiters(prepared);

  let text = transformCalls(prepared, warnings);
  text = replaceSymbolWords(text, warnings)
    .replace(/[ \t\u3000]+/gu, " ")
    .replace(/ *\n */gu, "\n")
    .trim();

  if (!text) {
    throw candidateError("正規化後のOCR候補が空です。", "OCR_NORMALIZATION_EMPTY");
  }
  return Object.freeze({
    text,
    sourceText,
    changed: text !== sourceText,
    warnings: Object.freeze([...warnings].slice(0, 20)),
  });
}

export const normalizeOcrMathText = normalizeMathOcrCandidate;
