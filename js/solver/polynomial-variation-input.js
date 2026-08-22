import {
  ExactPolynomialError,
  exactPolynomialFromAst,
} from "../math-core/exact-polynomial.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { hasAmbiguousDivisionMultiplication } from "./equation-input.js";

const MAX_INPUT_LENGTH = 5_000;
const UNSUPPORTED_SCRIPT_CHARACTER = /[\u2071\u207C-\u207F\u2080-\u209F]/u;
const SAFE_NFKC_SOURCE_CHARACTER = /^[\u3000\uFF01-\uFF5E]$/u;
const SUPPORTED_SUPERSCRIPT_CHARACTER = /^[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]$/u;
const SUPERSCRIPT_SEQUENCE = /[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+/gu;
const VALID_SUPERSCRIPT_SEQUENCE = /^[\u207A\u207B]?[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]+$/u;
const SEPARATED_SUPERSCRIPT_SEQUENCES = /[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+\s+[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+/u;
const DESTRUCTIVE_LATEX_DELIMITER = /\\(?:left|right)/iu;
const CANONICAL_NAME = "(?:monotonicity_extrema|monotonicity|extrema)";
const CANONICAL_CUE = new RegExp(`^${CANONICAL_NAME}(?=[^A-Za-z]|$)`, "iu");
const RAW_CANONICAL_CUE = /^(?:\s*)(?:monotonicity_extrema|monotonicity|extrema|ｍｏｎｏｔｏｎｉｃｉｔｙ＿ｅｘｔｒｅｍａ|ｍｏｎｏｔｏｎｉｃｉｔｙ|ｅｘｔｒｅｍａ)(?:\s*[(（]|\s*$|[_＿])/iu;
const VARIATION_REQUEST_WORD = /増減|極値|極大|極小|最大値|最小値|最大\s*(?:・|\*|[、,]|と|および|ならびに)?\s*最小|最小\s*(?:・|\*|[、,]|と|および|ならびに)?\s*最大|凹凸|上に凸|下に凸|変曲点|概形/u;
const VARIATION_INSTRUCTION = /(?:増減\s*を\s*調べ|(?:極値|最大値|最小値)\s*を\s*求め)/u;
const VARIATION_SUBJECT = /関数|多項式|曲線|y\s*=|f\s*\(\s*[a-z]\s*\)\s*=|右図|左図|下図|上図|グラフ|増減表/u;
const SEQUENCE_CUE = /数列|漸化式|a\s*[_＿]?\s*n|a\s*[ₙ]/iu;
const DOCUMENTED_JAPANESE_SHAPE = /^(?:次の\s*)?関数\s*(?:y\s*=|f\s*\(\s*x\s*\)\s*=)/iu;
const RELATION_PATTERN = /[=<>≤≥≠≦≧]/u;
const DIAGRAM_CUE = /右図|左図|下図|上図|図の|図中|図示|グラフ化|(?:図|グラフ)\s*(?:から|より|で|を\s*(?:見|用い|利用|使|描|か|書|作|読み|参照|参考)|に\s*(?:表|基づ)|を\s*もと|の増減)|この図|その図|増減表(?:から|を見)|表(?:から|を見|を読み取)/u;
const INTERVAL_CUE = /^(?:monotonicity_extrema|monotonicity|extrema)_\s*\[/iu;
const JAPANESE_INTERVAL_CUE = /区間|範囲|定義域|(?:x\s*(?:=|が)?\s*)?(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/\d+)?|[+-]?(?:∞|infinity|pi|π))\s*から\s*(?:x\s*=\s*)?(?:[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:\/\d+)?|[+-]?(?:∞|infinity|pi|π))\s*まで|x\s*[∈∊]\s*[^\s、]+|(?:[<>≤≥≦≧][\s\S]*?x|x[\s\S]*?[<>≤≥≦≧])[\s\S]*?(?:で|とき|場合|における|において)|x\s*(?:=|≠)\s*[\s\S]*?(?:で|とき|場合|における|において)|x\s*(?:は|が)\s*[^()（）,、]*(?:以上|以下|未満|を超え|より大き|より小さ)[^()（）,、]*(?:で|とき|場合|における|において)|(?:[,（(]\s*(?:定義域\s*)?(?:[^()（）,、]*[=<>≤≥≠≦≧][^()（）,、]*x|[^()（）,、]*x[^()（）,、]*[=<>≤≥≠≦≧])[^()（）,、]*[)）]?\s*の\s*(?:増減|極値))|(?:\s+x\s*[=<>≤≥≠≦≧]+[^()（）,、]*\s+の\s*(?:増減|極値))/iu;
const OTHER_REQUEST_CUE = /最大値|最小値|最大\s*(?:・|\*|[、,]|と|および|ならびに)?\s*最小|最小\s*(?:・|\*|[、,]|と|および|ならびに)?\s*最大|極大値|極小値|凹凸|上に凸|下に凸|変曲点|概形|増減表\s*を\s*(?:作|完成|書|求め|描|か)|(?:増減|極値)\s*を\s*証明/u;
const OTHER_CANONICAL_VARIABLE = /^(?:monotonicity_extrema|monotonicity|extrema)_([a-z]+)\s*\(/iu;
const OTHER_JAPANESE_DEPENDENT_VARIABLE = /関数\s*[a-z]\s*\(\s*([a-z])\s*\)\s*=/iu;
const OTHER_JAPANESE_FUNCTION_LABEL = /関数\s*([a-z])\s*\(\s*[a-z]\s*\)\s*=/iu;
const OTHER_JAPANESE_OUTPUT_VARIABLE = /関数\s*([a-z])\s*=/iu;
const INSTRUCTION_END = "(?:求めよ|求めなさい|求めてください)";
const MONOTONICITY_END = "(?:調べよ|調べなさい|調べてください)";
const TERMINAL_PUNCTUATION = "[。.!！?？]?";
const FUNCTION_LABEL = "関数\\s*(?:y\\s*=|f\\s*\\(\\s*x\\s*\\)\\s*=)\\s*";
const JAPANESE_COMBINED_COMMA = new RegExp(
  `^(?:次の\\s*)?${FUNCTION_LABEL}([\\s\\S]*?)\\s*の\\s*増減\\s*を\\s*調べ\\s*(?:、|,)\\s*極値\\s*を\\s*${INSTRUCTION_END}\\s*${TERMINAL_PUNCTUATION}$`,
  "iu",
);
const JAPANESE_COMBINED_AND = new RegExp(
  `^(?:次の\\s*)?${FUNCTION_LABEL}([\\s\\S]*?)\\s*の\\s*増減\\s*と\\s*極値\\s*を\\s*${INSTRUCTION_END}\\s*${TERMINAL_PUNCTUATION}$`,
  "iu",
);
const JAPANESE_MONOTONICITY = new RegExp(
  `^(?:次の\\s*)?${FUNCTION_LABEL}([\\s\\S]*?)\\s*の\\s*増減\\s*を\\s*${MONOTONICITY_END}\\s*${TERMINAL_PUNCTUATION}$`,
  "iu",
);
const JAPANESE_EXTREMA = new RegExp(
  `^(?:次の\\s*)?${FUNCTION_LABEL}([\\s\\S]*?)\\s*の\\s*極値\\s*を\\s*${INSTRUCTION_END}\\s*${TERMINAL_PUNCTUATION}$`,
  "iu",
);

function response({
  recognized,
  ok = false,
  form = "",
  expression = "",
  error = "",
  errorCode = "",
}) {
  return Object.freeze({
    recognized: recognized === true,
    ok: ok === true,
    form,
    expression,
    error,
    errorCode,
  });
}

function normalizeOuter(value) {
  return normalizeMathNotation(value)
    .replace(/[−–—﹣－]/gu, "-")
    .replace(/[×·⋅∙]/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/，/gu, ",")
    .trim();
}

function hasAmbiguousCompatibilityNormalization(value) {
  for (const character of String(value ?? "")) {
    if (
      SAFE_NFKC_SOURCE_CHARACTER.test(character)
      || SUPPORTED_SUPERSCRIPT_CHARACTER.test(character)
    ) {
      continue;
    }
    const normalized = character.normalize("NFKC");
    if (normalized !== character && /[A-Za-z0-9]/u.test(normalized)) return true;
  }
  return false;
}

function hasAmbiguousSuperscriptSequence(value) {
  for (const match of String(value ?? "").matchAll(SUPERSCRIPT_SEQUENCE)) {
    if (!VALID_SUPERSCRIPT_SEQUENCE.test(match[0])) return true;
  }
  return false;
}

function hasAmbiguousSuperscriptBoundary(value) {
  const source = String(value ?? "");
  if (SEPARATED_SUPERSCRIPT_SEQUENCES.test(source)) return true;
  for (const match of source.matchAll(SUPERSCRIPT_SEQUENCE)) {
    const nextCharacter = source[match.index + match[0].length] ?? "";
    if (/[0-9０-９.．]/u.test(nextCharacter)) return true;
  }
  return false;
}

function matchingEnd(text, start, opening, closing) {
  if (text[start] !== opening) return -1;
  let depth = 0;
  for (let index = start; index < text.length; index += 1) {
    if (text[index] === opening) depth += 1;
    if (text[index] === closing) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return -1;
}

function hasVariationCue(text) {
  if (CANONICAL_CUE.test(text)) return true;
  if (!VARIATION_REQUEST_WORD.test(text)) return false;
  if (SEQUENCE_CUE.test(text) && !DOCUMENTED_JAPANESE_SHAPE.test(text)) return false;
  return VARIATION_SUBJECT.test(text) || VARIATION_INSTRUCTION.test(text);
}

function symbolicCandidate(text) {
  const prefix = /^(monotonicity_extrema|monotonicity|extrema)\s*\(/iu.exec(text);
  if (!prefix) return null;
  const opening = prefix[0].lastIndexOf("(");
  const end = matchingEnd(text, opening, "(", ")");
  if (end < 0) return { malformed: true };
  if (end !== text.length) {
    return { malformed: true, trailing: text.slice(end).trim() };
  }
  const form = prefix[1].toLowerCase() === "monotonicity_extrema"
    ? "combined"
    : prefix[1].toLowerCase();
  return {
    form,
    expression: text.slice(opening + 1, end - 1),
  };
}

function japaneseCandidate(text) {
  for (const [pattern, form] of [
    [JAPANESE_COMBINED_COMMA, "combined"],
    [JAPANESE_COMBINED_AND, "combined"],
    [JAPANESE_MONOTONICITY, "monotonicity"],
    [JAPANESE_EXTREMA, "extrema"],
  ]) {
    const match = pattern.exec(text);
    if (match) return { form, expression: match[1] };
  }
  return null;
}

function looksLikeAttachedAnswer(value) {
  const source = String(value ?? "").trim();
  if (
    /[?？]\s*$/u.test(source)
    || /(?:か|ですか|ますか|でしょうか)\s*[。.!！]?$/u.test(source)
  ) {
    return false;
  }
  return /^(?:=|:|：|答え|x\s*=|なし|すべての実数|[[(（]|[+-]?(?:\d|\.)|増加(?:区間)?|減少(?:区間)?|極大(?:値|点)?|極小(?:値|点)?|極値)/iu.test(source);
}

function looksLikeVariationAnswerValue(value) {
  const source = String(value ?? "").trim();
  if (!source) return false;
  if (
    /^(?:何|どれ|どう|いくつ|どの)/u.test(source)
    || /[?？]\s*$/u.test(source)
    || /(?:か|ですか|ますか|でしょうか)\s*[。.!！]?$/u.test(source)
  ) {
    return false;
  }
  return /[0-9x∞]|なし|増加|減少|一定|極大|極小/iu.test(source);
}

function candidateHasAnswerAttached(candidate) {
  return Boolean(
    candidate?.malformed
    && typeof candidate.trailing === "string"
    && looksLikeAttachedAnswer(candidate.trailing),
  );
}

function hasAnswerAttached(text) {
  const instructionTail = /(?:調べよ|調べなさい|調べてください|求めよ|求めなさい|求めてください)\s*[。.!！?？]?\s*(.+)$/iu.exec(text);
  if (instructionTail && looksLikeAttachedAnswer(instructionTail[1])) return true;
  const labeledTail = /(?:増減|極値)\s*(?:は|=|:|：)\s*(.+)$/u.exec(text);
  return Boolean(labeledTail && looksLikeVariationAnswerValue(labeledTail[1]));
}

function unsupportedVariableReason(text) {
  const canonical = OTHER_CANONICAL_VARIABLE.exec(text);
  if (canonical) {
    return canonical[1].toLowerCase() === "x" ? "form" : "variable";
  }
  const dependentVariable = OTHER_JAPANESE_DEPENDENT_VARIABLE.exec(text);
  if (dependentVariable && dependentVariable[1].toLowerCase() !== "x") return "variable";
  const functionLabel = OTHER_JAPANESE_FUNCTION_LABEL.exec(text);
  if (functionLabel && functionLabel[1].toLowerCase() !== "f") return "form";
  const outputVariable = OTHER_JAPANESE_OUTPUT_VARIABLE.exec(text);
  if (outputVariable && outputVariable[1].toLowerCase() !== "y") return "variable";
  return "";
}

function validateExpression(value) {
  const source = String(value ?? "").replace(/[\r\n]+/gu, " ").trim();
  if (!source) {
    return {
      ok: false,
      expression: "",
      error: "増減・極値を調べる関数の式を入力してください。",
      errorCode: "MISSING_VARIATION_EXPRESSION",
    };
  }
  if (RELATION_PATTERN.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "関数の式に等式や不等式を付けないでください。",
      errorCode: "VARIATION_RELATION_ATTACHED",
    };
  }
  if (/[xX]\s*(?:\d|\.\d)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "xの直後の数字は曖昧です。指数ならx^2、積ならx*2と入力してください。",
      errorCode: "AMBIGUOUS_VARIATION_X_SUFFIX",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "数字を空白だけで並べず、演算子を入力してください。",
      errorCode: "AMBIGUOUS_VARIATION_NUMBER_SPACING",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "科学記数法の連結表記は解釈しません。",
      errorCode: "AMBIGUOUS_VARIATION_SCIENTIFIC_NOTATION",
    };
  }
  if (/pi\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "piの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_VARIATION_PI_MULTIPLICATION",
    };
  }
  if (/(?:^|[^A-Za-z])e\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "eの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_VARIATION_E_MULTIPLICATION",
    };
  }
  if (hasAmbiguousDivisionMultiplication(source)) {
    return {
      ok: false,
      expression: "",
      error: "割り算の直後の暗黙の掛け算は曖昧です。分母と積を括弧や*で明示してください。",
      errorCode: "AMBIGUOUS_VARIATION_DIVISION_MULTIPLICATION",
    };
  }
  try {
    const parsed = parseMathExpression(normalizeMathNotation(source), { symbols: ["x"] });
    exactPolynomialFromAst(parsed.ast);
    return { ok: true, expression: parsed.normalized, error: "", errorCode: "" };
  } catch (error) {
    const unsupportedVariable = error instanceof MathParseError
      && error.code === "UNSUPPORTED_SYMBOL"
      && !/[A-Za-z][A-Za-z0-9_]*\s*\(/u.test(source);
    const unsupportedExpression = (
      error instanceof ExactPolynomialError
      && error.unsupported === true
    ) || (
      error instanceof MathParseError
      && ["UNSUPPORTED_SYMBOL", "UNSUPPORTED_ARITY"].includes(error.code)
    );
    const unsupportedCapacity = error instanceof RangeError
      && /大きすぎ|長すぎ|超え/u.test(error.message);
    return {
      ok: false,
      expression: "",
      error: error.message || "関数の式を解釈できません。",
      errorCode: unsupportedVariable
        ? "UNSUPPORTED_VARIATION_VARIABLE"
        : unsupportedExpression || unsupportedCapacity
          ? "UNSUPPORTED_VARIATION_EXPRESSION"
          : error.code || "INVALID_VARIATION_EXPRESSION",
    };
  }
}

function validateCandidate(candidate) {
  const expression = validateExpression(candidate.expression);
  if (!expression.ok) {
    return response({
      recognized: true,
      error: expression.error,
      errorCode: expression.errorCode,
    });
  }
  return response({
    recognized: true,
    ok: true,
    form: candidate.form,
    expression: expression.expression,
  });
}

export function parsePolynomialVariationInput(question) {
  const raw = String(question ?? "");
  const recognitionEdge = MAX_INPUT_LENGTH + 1;
  const recognitionSource = raw.length <= recognitionEdge
    ? raw
    : `${raw.slice(0, recognitionEdge)}\n${raw.slice(-recognitionEdge)}`;
  const recognitionSample = normalizeOuter(recognitionSource);
  const rawRecognized = hasVariationCue(recognitionSample) || RAW_CANONICAL_CUE.test(raw);
  if (raw.length > MAX_INPUT_LENGTH) {
    return response({
      recognized: rawRecognized,
      error: "入力が長すぎます。",
      errorCode: "VARIATION_INPUT_TOO_LONG",
    });
  }

  const text = normalizeOuter(raw);
  const recognized = hasVariationCue(text);
  if (!recognized) {
    return response({
      recognized: false,
      error: "多項式の増減・極値問題を検出できません。",
    });
  }
  if (UNSUPPORTED_SCRIPT_CHARACTER.test(raw)) {
    return response({
      recognized: true,
      error: "下付き文字または未対応の上付き文字は式の意味が曖昧になるため解釈できません。指数は^で明示してください。",
      errorCode: "AMBIGUOUS_VARIATION_SCRIPT_CHARACTER",
    });
  }
  if (hasAmbiguousSuperscriptSequence(raw)) {
    return response({
      recognized: true,
      error: "上付き指数は先頭の符号1個と、それに続く数字だけで入力してください。",
      errorCode: "AMBIGUOUS_VARIATION_SUPERSCRIPT_SEQUENCE",
    });
  }
  if (hasAmbiguousSuperscriptBoundary(raw)) {
    return response({
      recognized: true,
      error: "上付き指数の直後へ通常の数字を続けることはできません。指数はすべて上付きにし、掛け算は*で明示してください。",
      errorCode: "AMBIGUOUS_VARIATION_SUPERSCRIPT_BOUNDARY",
    });
  }
  if (DESTRUCTIVE_LATEX_DELIMITER.test(raw.normalize("NFKC"))) {
    return response({
      recognized: true,
      error: "\\leftと\\rightは位置情報を失うため使用できません。通常の丸括弧を使用してください。",
      errorCode: "AMBIGUOUS_VARIATION_LATEX_DELIMITER",
    });
  }
  if (hasAmbiguousCompatibilityNormalization(raw)) {
    return response({
      recognized: true,
      error: "互換文字が通常の英数字へ変化するため式の意味を確定できません。",
      errorCode: "AMBIGUOUS_VARIATION_COMPATIBILITY_CHARACTER",
    });
  }

  const symbolic = symbolicCandidate(text);
  if (hasAnswerAttached(text) || candidateHasAnswerAttached(symbolic)) {
    return response({
      recognized: true,
      error: "増減・極値問題に答えや追加の結果を付けないでください。",
      errorCode: "VARIATION_ANSWER_ATTACHED",
    });
  }
  if (DIAGRAM_CUE.test(text)) {
    return response({
      recognized: true,
      error: "図・グラフ・増減表から読み取る問題には対応していません。関数の式を文章で完全に指定してください。",
      errorCode: "UNSUPPORTED_DIAGRAM_VARIATION",
    });
  }
  if (INTERVAL_CUE.test(text) || JAPANESE_INTERVAL_CUE.test(text)) {
    return response({
      recognized: true,
      error: "初版は定義域が全実数の増減・極値問題だけに対応しています。",
      errorCode: "UNSUPPORTED_VARIATION_DOMAIN",
    });
  }
  if (OTHER_REQUEST_CUE.test(text)) {
    return response({
      recognized: true,
      error: "最大値・最小値、凹凸、変曲点、概形、増減表の作成は現在の増減・極値形式には含まれません。",
      errorCode: "UNSUPPORTED_VARIATION_REQUEST",
    });
  }

  const variableReason = symbolic ? "" : unsupportedVariableReason(text);
  if (variableReason) {
    return response({
      recognized: true,
      error: variableReason === "variable"
        ? "現在は変数xの関数だけに対応しています。"
        : "文書化された増減・極値形式だけに対応しています。",
      errorCode: variableReason === "variable"
        ? "UNSUPPORTED_VARIATION_VARIABLE"
        : "UNSUPPORTED_VARIATION_FORM",
    });
  }

  const candidate = symbolic ?? japaneseCandidate(text);
  const documentedShape = CANONICAL_CUE.test(text) || DOCUMENTED_JAPANESE_SHAPE.test(text);
  const bareRequest = VARIATION_INSTRUCTION.test(text) && !VARIATION_SUBJECT.test(text);
  if (!candidate && !documentedShape && !bareRequest) {
    return response({
      recognized: true,
      error: "現在は関数を完全に明示した文書化済みの増減・極値形式だけに対応しています。",
      errorCode: "UNSUPPORTED_VARIATION_FORM",
    });
  }
  if (!candidate || candidate.malformed) {
    return response({
      recognized: true,
      error: "増減・極値はmonotonicity(f)、extrema(f)、monotonicity_extrema(f)、または対応する完全な日本語形式で入力してください。",
      errorCode: "MALFORMED_VARIATION_INPUT",
    });
  }

  try {
    return validateCandidate(candidate);
  } catch (error) {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialError
      || error instanceof RangeError
      || error instanceof TypeError
    ) {
      return response({
        recognized: true,
        error: error.message || "増減・極値入力を厳密に検証できませんでした。",
        errorCode: error.code || "INVALID_VARIATION_INPUT",
      });
    }
    throw error;
  }
}

export default parsePolynomialVariationInput;
