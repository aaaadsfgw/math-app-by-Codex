import {
  ExactPolynomialIntegralError,
  exactRationalConstantFromAst,
} from "../math-core/exact-polynomial-integral.js";
import { MathParseError, parseMathExpression } from "../math-core/expression-parser.js";
import { normalizeMathNotation } from "../math-core/notation.js";
import { hasAmbiguousDivisionMultiplication } from "./equation-input.js";

const MAX_INPUT_LENGTH = 5_000;
const MAX_COORDINATE_COMPONENT_DIGITS = 512;
const UNSUPPORTED_SCRIPT_CHARACTER = /[\u2071\u207C-\u207F\u2080-\u209F]/u;
const SAFE_NFKC_SOURCE_CHARACTER = /^[\u3000\uFF01-\uFF5E]$/u;
const SUPPORTED_SUPERSCRIPT_CHARACTER = /^[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]$/u;
const SUPERSCRIPT_SEQUENCE = /[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+/gu;
const VALID_SUPERSCRIPT_SEQUENCE = /^[\u207A\u207B]?[\u2070\u00B9\u00B2\u00B3\u2074-\u2079]+$/u;
const SEPARATED_SUPERSCRIPT_SEQUENCES = /[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+\s+[\u2070\u00B9\u00B2\u00B3\u2074-\u207B]+/u;
const DESTRUCTIVE_LATEX_DELIMITER = /\\(?:left|right)/iu;
const RAW_TANGENT_MARKER = /tangent_|ｔａｎｇｅｎｔ＿|接線/iu;
const TANGENT_CUE = /(?:^|[^a-z])tangent_|接線/iu;
const DOCUMENTED_TANGENT_SHAPE = /(?:^|[^a-z])tangent_|(?:^|\s)(?:次の\s*)?曲線\s*y\s*=/iu;
const RELATION_PATTERN = /[=<>≤≥≠≦≧]/u;
const DIAGRAM_CUE = /右図|左図|下図|上図|図の|図中|グラフ|この図|その図|接点を読み取/u;
const GEOMETRIC_TANGENT_CUE = /円|三角形|四角形|多角形|図形|接線\s*の\s*長さ|共通接線|点\s*[A-Z](?:[^A-Za-z]|$)/u;
const OTHER_CURVE_VARIABLE = /曲線\s*[a-xz]\s*=/iu;
const OTHER_COORDINATE_VARIABLE = /\sの\s*[a-wyz]\s*=\s*.+?\s*における\s*接線/iu;
const INSTRUCTION_SOURCE = "(?:を\\s*)?(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)\\s*[。.!！?？]?";
const JAPANESE_X = new RegExp(
  "^(?:次の\\s*)?曲線\\s*y\\s*=\\s*(.+?)\\s*の\\s*"
    + "x\\s*=\\s*(.+?)\\s*における\\s*接線\\s*の\\s*方程式\\s*"
    + INSTRUCTION_SOURCE + "$",
  "iu",
);
const JAPANESE_POINT = new RegExp(
  "^(?:次の\\s*)?曲線\\s*y\\s*=\\s*(.+?)\\s*上\\s*の\\s*点\\s*"
    + "\\(\\s*(.+?)\\s*,\\s*(.+?)\\s*\\)\\s*における\\s*"
    + "接線\\s*の\\s*方程式\\s*" + INSTRUCTION_SOURCE + "$",
  "iu",
);

function response({
  recognized,
  ok = false,
  form = "",
  expression = "",
  xSource = "",
  ySource = "",
  error = "",
  errorCode = "",
}) {
  return Object.freeze({
    recognized: recognized === true,
    ok: ok === true,
    form,
    expression,
    xSource,
    ySource,
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

function splitTopLevel(value, delimiter) {
  const source = String(value ?? "");
  const parts = [];
  let start = 0;
  const stack = [];
  const pairs = new Map([[")", "("], ["]", "["], ["}", "{"]]);
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (["(", "[", "{"].includes(character)) stack.push(character);
    else if (pairs.has(character)) {
      if (stack.pop() !== pairs.get(character)) return null;
    } else if (character === delimiter && stack.length === 0) {
      parts.push(source.slice(start, index));
      start = index + 1;
    }
  }
  if (stack.length) return null;
  parts.push(source.slice(start));
  return parts;
}

function symbolicPointCandidate(text) {
  const prefix = /^tangent_point_\s*\(/iu.exec(text);
  if (!prefix) return null;
  const coordinateStart = prefix[0].lastIndexOf("(");
  const coordinateEnd = matchingEnd(text, coordinateStart, "(", ")");
  if (coordinateEnd < 0) return { malformed: true };
  let expressionStart = coordinateEnd;
  while (/\s/u.test(text[expressionStart] ?? "")) expressionStart += 1;
  if (text[expressionStart] !== "(") return { malformed: true };
  const expressionEnd = matchingEnd(text, expressionStart, "(", ")");
  if (expressionEnd < 0) return { malformed: true };
  if (expressionEnd !== text.length) {
    return { malformed: true, trailing: text.slice(expressionEnd).trim() };
  }
  const coordinates = splitTopLevel(
    text.slice(coordinateStart + 1, coordinateEnd - 1),
    ",",
  );
  if (coordinates?.length !== 2) return { malformed: true };
  return {
    form: "point",
    expression: text.slice(expressionStart + 1, expressionEnd - 1),
    x: coordinates[0],
    y: coordinates[1],
  };
}

function symbolicXCandidate(text) {
  const variablePrefix = /^tangent_([a-z]+)_\s*\[/iu.exec(text);
  let prefix = variablePrefix;
  if (variablePrefix?.[1].toLowerCase() === "point") {
    return { malformed: true };
  }
  if (variablePrefix && variablePrefix[1].toLowerCase() !== "x") {
    return { unsupportedVariable: true };
  }
  prefix ??= /^tangent_\s*\[/iu.exec(text);
  if (!prefix) return null;
  const bracketStart = prefix[0].lastIndexOf("[");
  const bracketEnd = matchingEnd(text, bracketStart, "[", "]");
  if (bracketEnd < 0) return { malformed: true };
  let expressionStart = bracketEnd;
  while (/\s/u.test(text[expressionStart] ?? "")) expressionStart += 1;
  if (text[expressionStart] !== "(") return { malformed: true };
  const expressionEnd = matchingEnd(text, expressionStart, "(", ")");
  if (expressionEnd < 0) return { malformed: true };
  if (expressionEnd !== text.length) {
    return { malformed: true, trailing: text.slice(expressionEnd).trim() };
  }
  return {
    form: "x-coordinate",
    expression: text.slice(expressionStart + 1, expressionEnd - 1),
    x: text.slice(bracketStart + 1, bracketEnd - 1),
    y: "",
  };
}

function symbolicCandidate(text) {
  return symbolicPointCandidate(text) ?? symbolicXCandidate(text);
}

function japaneseCandidate(text) {
  const point = JAPANESE_POINT.exec(text);
  if (point) {
    return {
      form: "point",
      expression: point[1],
      x: point[2],
      y: point[3],
    };
  }
  const xCoordinate = JAPANESE_X.exec(text);
  if (!xCoordinate) return null;
  return {
    form: "x-coordinate",
    expression: xCoordinate[1],
    x: xCoordinate[2],
    y: "",
  };
}

function unwrapCoordinate(value) {
  let source = String(value ?? "").trim();
  if (
    source.startsWith("(")
    && matchingEnd(source, 0, "(", ")") === source.length
  ) {
    source = source.slice(1, -1).trim();
  }
  return source;
}

function validateCoordinate(value, label) {
  const source = unwrapCoordinate(value);
  if (!source) {
    return {
      ok: false,
      source: "",
      error: label + "を入力してください。",
      errorCode: "MISSING_TANGENT_COORDINATE",
    };
  }
  if (RELATION_PATTERN.test(source)) {
    return {
      ok: false,
      source: "",
      error: label + "に等式や不等式を付けないでください。",
      errorCode: "TANGENT_COORDINATE_RELATION_ATTACHED",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: label + "では科学記数法の連結表記を解釈しません。",
      errorCode: "AMBIGUOUS_TANGENT_COORDINATE_SCIENTIFIC_NOTATION",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: label + "の数字を空白だけで並べないでください。",
      errorCode: "AMBIGUOUS_TANGENT_COORDINATE_NUMBER_SPACING",
    };
  }
  const compact = source.replace(/\s+/gu, "");
  if (!/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)|(?:\d+\/\d+))$/u.test(compact)) {
    return {
      ok: false,
      source: "",
      error: label + "は符号付き整数・有限小数・明示分数にしてください。",
      errorCode: "UNSUPPORTED_TANGENT_COORDINATE",
    };
  }
  if ((compact.match(/\d+/gu) ?? []).some((digits) => (
    digits.length > MAX_COORDINATE_COMPONENT_DIGITS
  ))) {
    return {
      ok: false,
      source: "",
      error: label + "の数値が長すぎます。",
      errorCode: "TANGENT_COORDINATE_COMPONENT_TOO_LONG",
    };
  }
  try {
    const parsed = parseMathExpression(compact, { symbols: [] });
    const exact = exactRationalConstantFromAst(parsed.ast);
    return { ok: true, source: exact.toString(), error: "", errorCode: "" };
  } catch (error) {
    return {
      ok: false,
      source: "",
      error: error.message || label + "を厳密な数として解釈できません。",
      errorCode: error.code || "INVALID_TANGENT_COORDINATE",
    };
  }
}

function validateExpression(value) {
  const source = String(value ?? "").trim();
  if (!source) {
    return {
      ok: false,
      expression: "",
      error: "曲線の式を入力してください。",
      errorCode: "MISSING_TANGENT_EXPRESSION",
    };
  }
  if (RELATION_PATTERN.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "曲線の式に等式や不等式を付けないでください。",
      errorCode: "TANGENT_RELATION_ATTACHED",
    };
  }
  if (/[xX]\s*(?:\d|\.\d)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "xの直後の数字は曖昧です。指数ならx^2、積ならx*2と入力してください。",
      errorCode: "AMBIGUOUS_TANGENT_X_SUFFIX",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "数字を空白だけで並べず、演算子を入力してください。",
      errorCode: "AMBIGUOUS_TANGENT_NUMBER_SPACING",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "科学記数法の連結表記は解釈しません。",
      errorCode: "AMBIGUOUS_TANGENT_SCIENTIFIC_NOTATION",
    };
  }
  if (/pi\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "piの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_TANGENT_PI_MULTIPLICATION",
    };
  }
  if (/(?:^|[^A-Za-z])e\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "eの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_TANGENT_E_MULTIPLICATION",
    };
  }
  if (hasAmbiguousDivisionMultiplication(source)) {
    return {
      ok: false,
      expression: "",
      error: "割り算の直後の暗黙の掛け算は曖昧です。分母と積を括弧や*で明示してください。",
      errorCode: "AMBIGUOUS_TANGENT_DIVISION_MULTIPLICATION",
    };
  }
  try {
    const parsed = parseMathExpression(normalizeMathNotation(source), { symbols: ["x"] });
    return { ok: true, expression: parsed.normalized, error: "", errorCode: "" };
  } catch (error) {
    const unsupported = error instanceof MathParseError
      && error.code === "UNSUPPORTED_SYMBOL";
    return {
      ok: false,
      expression: "",
      error: error.message || "曲線の式を解釈できません。",
      errorCode: unsupported
        ? "UNSUPPORTED_TANGENT_EXPRESSION"
        : error.code || "INVALID_TANGENT_EXPRESSION",
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
  const xCoordinate = validateCoordinate(candidate.x, "接点のx座標");
  if (!xCoordinate.ok) {
    return response({
      recognized: true,
      error: xCoordinate.error,
      errorCode: xCoordinate.errorCode,
    });
  }
  let ySource = "";
  if (candidate.form === "point") {
    const yCoordinate = validateCoordinate(candidate.y, "接点のy座標");
    if (!yCoordinate.ok) {
      return response({
        recognized: true,
        error: yCoordinate.error,
        errorCode: yCoordinate.errorCode,
      });
    }
    ySource = yCoordinate.source;
  }
  return response({
    recognized: true,
    ok: true,
    form: candidate.form,
    expression: expression.expression,
    xSource: xCoordinate.source,
    ySource,
  });
}

function looksLikeTangentAnswer(value) {
  const source = String(value ?? "")
    .trim()
    .replace(/^答え\s*(?:は|=|:|：)?\s*/u, "");
  return /[0-9xy]/iu.test(source)
    && /^[0-9xy+\-*/^().=\s]+$/iu.test(source);
}

function hasAnswerAttached(text) {
  const instructionTail = /(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)\s*[。.!！?？]?\s*(.+)$/iu.exec(text);
  if (instructionTail && looksLikeTangentAnswer(instructionTail[1])) return true;
  const equationTail = /接線\s*の\s*方程式\s*(?:は|=|:|：)\s*(.+)$/iu.exec(text);
  return Boolean(equationTail && looksLikeTangentAnswer(equationTail[1]));
}

function candidateHasAnswerAttached(candidate) {
  if (!candidate?.malformed || typeof candidate.trailing !== "string") return false;
  if (looksLikeTangentAnswer(candidate.trailing)) return true;
  const labeledTail = /^(?:=|:|：|接線(?:\s*の\s*方程式)?\s*(?:は|=|:|：))\s*(.+)$/iu.exec(
    candidate.trailing,
  );
  return Boolean(labeledTail && looksLikeTangentAnswer(labeledTail[1]));
}

export function parsePolynomialTangentInput(question) {
  const raw = String(question ?? "");
  const recognitionEdge = MAX_INPUT_LENGTH + 1;
  const recognitionSource = raw.length <= recognitionEdge
    ? raw
    : raw.slice(0, recognitionEdge) + "\n" + raw.slice(-recognitionEdge);
  const recognitionSample = normalizeOuter(recognitionSource);
  const rawRecognized = TANGENT_CUE.test(recognitionSample)
    || RAW_TANGENT_MARKER.test(raw);
  if (raw.length > MAX_INPUT_LENGTH) {
    return response({
      recognized: rawRecognized,
      error: "入力が長すぎます。",
      errorCode: "TANGENT_INPUT_TOO_LONG",
    });
  }
  const text = normalizeOuter(raw);
  const recognized = TANGENT_CUE.test(text);
  if (!recognized) {
    return response({ recognized: false, error: "多項式の接線問題を検出できません。" });
  }
  if (UNSUPPORTED_SCRIPT_CHARACTER.test(raw)) {
    return response({
      recognized: true,
      error: "下付き文字または未対応の上付き文字は式の意味が曖昧になるため解釈できません。",
      errorCode: "AMBIGUOUS_TANGENT_SCRIPT_CHARACTER",
    });
  }
  if (hasAmbiguousSuperscriptSequence(raw)) {
    return response({
      recognized: true,
      error: "上付き指数は先頭の符号1個と、それに続く数字だけで入力してください。",
      errorCode: "AMBIGUOUS_TANGENT_SUPERSCRIPT_SEQUENCE",
    });
  }
  if (hasAmbiguousSuperscriptBoundary(raw)) {
    return response({
      recognized: true,
      error: "上付き指数の直後へ通常の数字を続けることはできません。",
      errorCode: "AMBIGUOUS_TANGENT_SUPERSCRIPT_BOUNDARY",
    });
  }
  if (DESTRUCTIVE_LATEX_DELIMITER.test(raw.normalize("NFKC"))) {
    return response({
      recognized: true,
      error: "\\leftと\\rightは位置情報を失うため使用できません。通常の丸括弧を使用してください。",
      errorCode: "AMBIGUOUS_TANGENT_LATEX_DELIMITER",
    });
  }
  if (hasAmbiguousCompatibilityNormalization(raw)) {
    return response({
      recognized: true,
      error: "互換文字が通常の英数字へ変化するため式の意味を確定できません。",
      errorCode: "AMBIGUOUS_TANGENT_COMPATIBILITY_CHARACTER",
    });
  }
  if (hasAnswerAttached(text)) {
    return response({
      recognized: true,
      error: "接線問題に答えや追加の等式を付けないでください。",
      errorCode: "TANGENT_ANSWER_ATTACHED",
    });
  }
  if (DIAGRAM_CUE.test(text)) {
    return response({
      recognized: true,
      error: "図やグラフから接点・曲線を読み取る接線問題には対応していません。",
      errorCode: "UNSUPPORTED_DIAGRAM_TANGENT",
    });
  }
  if (GEOMETRIC_TANGENT_CUE.test(text)) {
    return response({
      recognized: true,
      error: "円や点の幾何条件から求める接線問題には対応していません。",
      errorCode: "UNSUPPORTED_GEOMETRIC_TANGENT",
    });
  }
  if (OTHER_CURVE_VARIABLE.test(text) || OTHER_COORDINATE_VARIABLE.test(text)) {
    return response({
      recognized: true,
      error: "現在はy=f(x)をx座標または点で指定する接線だけに対応しています。",
      errorCode: "UNSUPPORTED_TANGENT_VARIABLE",
    });
  }
  const candidate = symbolicCandidate(text);
  if (candidateHasAnswerAttached(candidate)) {
    return response({
      recognized: true,
      error: "接線問題に答えや追加の等式を付けないでください。",
      errorCode: "TANGENT_ANSWER_ATTACHED",
    });
  }
  if (candidate?.unsupportedVariable) {
    return response({
      recognized: true,
      error: "現在はx座標または点で指定する接線だけに対応しています。",
      errorCode: "UNSUPPORTED_TANGENT_VARIABLE",
    });
  }
  const parsedCandidate = candidate ?? japaneseCandidate(text);
  if (!parsedCandidate && !DOCUMENTED_TANGENT_SHAPE.test(text)) {
    return response({
      recognized: true,
      error: "現在はy=f(x)を明示した4次以下の多項式について、文書化された形式で接点を指定する接線だけに対応しています。",
      errorCode: "UNSUPPORTED_TANGENT_FORM",
    });
  }
  if (!parsedCandidate || parsedCandidate.malformed) {
    return response({
      recognized: true,
      error: "接線はtangent_x_[a](f)、tangent_[a](f)、tangent_point_(a,b)(f)、または対応する完全な日本語形式で入力してください。",
      errorCode: "MALFORMED_TANGENT_INPUT",
    });
  }
  try {
    return validateCandidate(parsedCandidate);
  } catch (error) {
    if (
      error instanceof MathParseError
      || error instanceof ExactPolynomialIntegralError
      || error instanceof RangeError
      || error instanceof TypeError
    ) {
      return response({
        recognized: true,
        error: error.message || "接線入力を厳密に検証できませんでした。",
        errorCode: error.code || "INVALID_TANGENT_INPUT",
      });
    }
    throw error;
  }
}

export default parsePolynomialTangentInput;
