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
const SYMBOLIC_NORMAL_CUE = /^normal_(?:(?=$)|point(?=$)|point_(?=$|\s*[\[(])|[a-z](?=$)|[a-z]_(?=$|\s*[\[(])|(?=\s*[\[(]))/iu;
const NAMED_NORMAL_GEOMETRY_CUE = /^(?:normal_(?:vector|plane)(?=$|[^a-z])|surface_normal(?=$|[^a-z]))/iu;
const JAPANESE_NORMAL_CUE = /法線/u;
const RAW_NORMAL_MARKER = /法線/u;
const DOCUMENTED_NORMAL_SHAPE = /(?:^|\s)(?:次の\s*)?曲線\s*y\s*=/iu;
const RELATION_PATTERN = /[=<>≤≥≠≦≧]/u;
const DIAGRAM_CUE = /右図|左図|下図|上図|図の|図中|図示|第\s*[0-9A-Za-zα-ωΑ-Ω]+\s*図|図\s*(?:[（(]\s*)?[0-9A-Za-zα-ωΑ-Ω]+(?:\s*[)）])?|(?:figure|fig\.?)\s*[0-9A-Za-z]+|添付\s*(?:された|の)?\s*(?:画像|図)|画像|写真|スクリーンショット|グラフ|(?:図|グラフ)\s*(?:から|より|で|を\s*(?:見|用い|利用|使|描|か|書|作|読み|参照|参考)|に\s*(?:表|基づ)|を\s*もと|の(?:接点|法線|曲線|形|概形))|この図|その図|接点を読み取/iu;
const UNSUPPORTED_CURVE_CUE = /円|楕円|放物線|双曲線|陰関数|媒介変数|媒介曲線|パラメータ|パラメトリック|極座標|極方程式|\b[a-z]\s*\(\s*x\s*,\s*y\s*\)\s*=|\br\s*=\s*[^。.!！?？]*(?:theta|θ)|曲線\s*y\s*\^|曲線\s*x\s*(?:\^|\*)|曲線\s*(?=[^=。\n]*x)(?=[^=。\n]*y)[^=。\n]*=|(?:^|\s)[xy]\s*=\s*[^,、;；]+[,、;；]\s*[xy]\s*=/iu;
const UNSUPPORTED_NORMAL_GEOMETRY_CUE = /normal_vector|normal_plane|surface_normal|法線ベクトル|単位法線|法平面|法線平面|接平面|平面|曲面|空間曲線|法線方向|法線\s*の\s*ベクトル/iu;
const UNSUPPORTED_BARE_Z_CUE = /^(?:(?:surface|曲面)\s+)?z\s*=[\s\S]*法線/iu;
const UNSUPPORTED_FUNCTION_LABEL_CUE = /(?:^|\s)(?:(?:次の|以下の)\s*)?(?:関数\s*(?:[a-z]\s*\(\s*[a-z]\s*\)|[a-z])|曲線\s*[a-xz]\s*\(\s*[a-z]\s*\))\s*=/iu;
const UNSUPPORTED_BARE_FUNCTION_CUE = /^(?:(?:次の|以下の)\s*)?(?:y\s*=|f\s*\(\s*x\s*\)\s*=)[\s\S]*法線/iu;
const UNSUPPORTED_IMPLICIT_CURVE_CUE = /^(?=[^。.!！?？]*x)(?=[^。.!！?？]*y)[^。.!！?？]*=[\s\S]*法線/iu;
const OTHER_CURVE_VARIABLE = /曲線\s*[a-xz]\s*=/iu;
const OTHER_COORDINATE_VARIABLE = /\sの\s*[a-wyz]\s*=\s*.+?\s*における\s*法線/iu;
const BARE_NORMAL_INSTRUCTION = /法線\s*(?:(?:の\s*)?方程式)?\s*(?:を\s*)?(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)/u;
const INSTRUCTION_SOURCE = "(?:を\\s*)?(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)\\s*[。.!！?？]?";
const NORMAL_EQUATION_SOURCE = "法線\\s*(?:の\\s*)?方程式";
const JAPANESE_X = new RegExp(
  "^(?:次の\\s*)?曲線\\s*y\\s*=\\s*(.+?)\\s*の\\s*"
    + "x\\s*=\\s*(.+?)\\s*における\\s*" + NORMAL_EQUATION_SOURCE + "\\s*"
    + INSTRUCTION_SOURCE + "$",
  "iu",
);
const JAPANESE_POINT = new RegExp(
  "^(?:次の\\s*)?曲線\\s*y\\s*=\\s*(.+?)\\s*上\\s*の\\s*点\\s*"
    + "\\(\\s*(.+?)\\s*,\\s*(.+?)\\s*\\)\\s*における\\s*"
    + NORMAL_EQUATION_SOURCE + "\\s*" + INSTRUCTION_SOURCE + "$",
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
    .replace(/\r\n?|[\n\u000B\u000C\u0085\u2028\u2029]/gu, " ")
    .replace(/[−–—﹣－]/gu, "-")
    .replace(/[×·⋅∙]/gu, "*")
    .replace(/÷/gu, "/")
    .replace(/，/gu, ",")
    .trim();
}

function hasNormalCue(value) {
  return SYMBOLIC_NORMAL_CUE.test(value)
    || NAMED_NORMAL_GEOMETRY_CUE.test(value)
    || JAPANESE_NORMAL_CUE.test(value);
}

function hasAmbiguousCompatibilityNormalization(value) {
  for (const character of value) {
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
  for (const match of value.matchAll(SUPERSCRIPT_SEQUENCE)) {
    if (!VALID_SUPERSCRIPT_SEQUENCE.test(match[0])) return true;
  }
  return false;
}

function hasAmbiguousSuperscriptBoundary(value) {
  if (SEPARATED_SUPERSCRIPT_SEQUENCES.test(value)) return true;
  for (const match of value.matchAll(SUPERSCRIPT_SEQUENCE)) {
    const nextCharacter = value[match.index + match[0].length] ?? "";
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
  const parts = [];
  let start = 0;
  const stack = [];
  const pairs = new Map([[")", "("], ["]", "["], ["}", "{"]]);
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (["(", "[", "{"].includes(character)) stack.push(character);
    else if (pairs.has(character)) {
      if (stack.pop() !== pairs.get(character)) return null;
    } else if (character === delimiter && stack.length === 0) {
      parts.push(value.slice(start, index));
      start = index + 1;
    }
  }
  if (stack.length) return null;
  parts.push(value.slice(start));
  return parts;
}

function symbolicPointCandidate(text) {
  const prefix = /^normal_point_\s*\(/iu.exec(text);
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
  const variablePrefix = /^normal_([a-z]+)_\s*\[/iu.exec(text);
  let prefix = variablePrefix;
  if (variablePrefix?.[1].toLowerCase() === "point") return { malformed: true };
  if (variablePrefix && variablePrefix[1].toLowerCase() !== "x") {
    return { unsupportedVariable: true };
  }
  prefix ??= /^normal_\s*\[/iu.exec(text);
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
  let source = value.trim();
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
      errorCode: "MISSING_NORMAL_COORDINATE",
    };
  }
  if (RELATION_PATTERN.test(source)) {
    return {
      ok: false,
      source: "",
      error: label + "に等式や不等式を付けないでください。",
      errorCode: "NORMAL_COORDINATE_RELATION_ATTACHED",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: label + "では科学記数法の連結表記を解釈しません。",
      errorCode: "AMBIGUOUS_NORMAL_COORDINATE_SCIENTIFIC_NOTATION",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      source: "",
      error: label + "の数字を空白だけで並べないでください。",
      errorCode: "AMBIGUOUS_NORMAL_COORDINATE_NUMBER_SPACING",
    };
  }
  const compact = source.replace(/\s+/gu, "");
  if (!/^[+-]?(?:(?:\d+(?:\.\d*)?|\.\d+)|(?:\d+\/\d+))$/u.test(compact)) {
    return {
      ok: false,
      source: "",
      error: label + "は符号付き整数・有限小数・明示分数にしてください。",
      errorCode: "UNSUPPORTED_NORMAL_COORDINATE",
    };
  }
  if ((compact.match(/\d+/gu) ?? []).some((digits) => (
    digits.length > MAX_COORDINATE_COMPONENT_DIGITS
  ))) {
    return {
      ok: false,
      source: "",
      error: label + "の数値が長すぎます。",
      errorCode: "NORMAL_COORDINATE_COMPONENT_TOO_LONG",
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
      errorCode: "INVALID_NORMAL_COORDINATE",
    };
  }
}

function validateExpression(value) {
  const source = value.trim();
  if (!source) {
    return {
      ok: false,
      expression: "",
      error: "曲線の式を入力してください。",
      errorCode: "MISSING_NORMAL_EXPRESSION",
    };
  }
  if (RELATION_PATTERN.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "曲線の式に等式や不等式を付けないでください。",
      errorCode: "NORMAL_RELATION_ATTACHED",
    };
  }
  if (/[xX]\s*(?:\d|\.\d)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "xの直後の数字は曖昧です。指数ならx^2、積ならx*2と入力してください。",
      errorCode: "AMBIGUOUS_NORMAL_X_SUFFIX",
    };
  }
  if (/(?:\d|\.)\s+(?:\d|\.)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "数字を空白だけで並べず、演算子を入力してください。",
      errorCode: "AMBIGUOUS_NORMAL_NUMBER_SPACING",
    };
  }
  if (/(?:\d+(?:\.\d*)?|\.\d+)\s*[eE]\s*[+-]?\s*(?:\d+(?:\.\d*)?|\.\d+)/u.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "科学記数法の連結表記は解釈しません。",
      errorCode: "AMBIGUOUS_NORMAL_SCIENTIFIC_NOTATION",
    };
  }
  if (/pi\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "piの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_NORMAL_PI_MULTIPLICATION",
    };
  }
  if (/(?:^|[^A-Za-z])e\s*(?:\d|\.)/iu.test(source)) {
    return {
      ok: false,
      expression: "",
      error: "eの直後の数値は曖昧です。積は*で明示してください。",
      errorCode: "AMBIGUOUS_NORMAL_E_MULTIPLICATION",
    };
  }
  if (hasAmbiguousDivisionMultiplication(source)) {
    return {
      ok: false,
      expression: "",
      error: "割り算の直後の暗黙の掛け算は曖昧です。分母と積を括弧や*で明示してください。",
      errorCode: "AMBIGUOUS_NORMAL_DIVISION_MULTIPLICATION",
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
        ? "UNSUPPORTED_NORMAL_EXPRESSION"
        : error.code || "INVALID_NORMAL_EXPRESSION",
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

function looksLikeNormalAnswer(value) {
  const source = value
    .trim()
    .replace(/^答え\s*(?:は|=|:|：)?\s*/u, "");
  return /[0-9xy]/iu.test(source)
    && /^[0-9xy+\-*/^().=\s]+$/iu.test(source);
}

function hasAnswerAttached(text) {
  const instructionTail = /(?:求めよ|求めなさい|計算せよ|計算しなさい|求めてください)\s*[。.!！?？]?\s*(.+)$/iu.exec(text);
  if (instructionTail && looksLikeNormalAnswer(instructionTail[1])) return true;
  const equationTail = /法線\s*(?:の\s*)?方程式\s*(?:は|=|:|：)\s*(.+)$/iu.exec(text);
  return Boolean(equationTail && looksLikeNormalAnswer(equationTail[1]));
}

function candidateHasAnswerAttached(candidate) {
  if (!candidate?.malformed || typeof candidate.trailing !== "string") return false;
  if (looksLikeNormalAnswer(candidate.trailing)) return true;
  const labeledTail = /^(?:=|:|：|法線(?:\s*(?:の\s*)?方程式)?\s*(?:は|=|:|：))\s*(.+)$/iu.exec(
    candidate.trailing,
  );
  return Boolean(labeledTail && looksLikeNormalAnswer(labeledTail[1]));
}

export function parsePolynomialNormalInput(question) {
  const raw = String(question ?? "");
  const recognitionEdge = MAX_INPUT_LENGTH + 1;
  const recognitionSource = raw.length <= recognitionEdge
    ? raw
    : `${raw.slice(0, recognitionEdge)}\n${raw.slice(-recognitionEdge)}`;
  const recognitionSample = normalizeOuter(recognitionSource);
  const rawRecognized = hasNormalCue(recognitionSample)
    || RAW_NORMAL_MARKER.test(raw);
  if (raw.length > MAX_INPUT_LENGTH) {
    return response({
      recognized: rawRecognized,
      error: "入力が長すぎます。",
      errorCode: "NORMAL_INPUT_TOO_LONG",
    });
  }

  const text = normalizeOuter(raw);
  const recognized = hasNormalCue(text);
  if (!recognized) {
    return response({
      recognized: false,
      error: "多項式の法線問題を検出できません。",
    });
  }
  if (UNSUPPORTED_SCRIPT_CHARACTER.test(raw)) {
    return response({
      recognized: true,
      error: "下付き文字または未対応の上付き文字は式の意味が曖昧になるため解釈できません。",
      errorCode: "AMBIGUOUS_NORMAL_SCRIPT_CHARACTER",
    });
  }
  if (hasAmbiguousSuperscriptSequence(raw)) {
    return response({
      recognized: true,
      error: "上付き指数は先頭の符号1個と、それに続く数字だけで入力してください。",
      errorCode: "AMBIGUOUS_NORMAL_SUPERSCRIPT_SEQUENCE",
    });
  }
  if (hasAmbiguousSuperscriptBoundary(raw)) {
    return response({
      recognized: true,
      error: "上付き指数の直後へ通常の数字を続けることはできません。",
      errorCode: "AMBIGUOUS_NORMAL_SUPERSCRIPT_BOUNDARY",
    });
  }
  if (DESTRUCTIVE_LATEX_DELIMITER.test(raw.normalize("NFKC"))) {
    return response({
      recognized: true,
      error: "\\leftと\\rightは位置情報を失うため使用できません。通常の丸括弧を使用してください。",
      errorCode: "AMBIGUOUS_NORMAL_LATEX_DELIMITER",
    });
  }
  if (hasAmbiguousCompatibilityNormalization(raw)) {
    return response({
      recognized: true,
      error: "互換文字が通常の英数字へ変化するため式の意味を確定できません。",
      errorCode: "AMBIGUOUS_NORMAL_COMPATIBILITY_CHARACTER",
    });
  }

  const candidate = symbolicCandidate(text);
  if (hasAnswerAttached(text) || candidateHasAnswerAttached(candidate)) {
    return response({
      recognized: true,
      error: "法線問題に答えや追加の等式を付けないでください。",
      errorCode: "NORMAL_ANSWER_ATTACHED",
    });
  }
  if (DIAGRAM_CUE.test(text)) {
    return response({
      recognized: true,
      error: "図やグラフから接点・曲線を読み取る法線問題には対応していません。",
      errorCode: "UNSUPPORTED_DIAGRAM_NORMAL",
    });
  }
  if (
    UNSUPPORTED_NORMAL_GEOMETRY_CUE.test(text)
    || UNSUPPORTED_BARE_Z_CUE.test(text)
  ) {
    return response({
      recognized: true,
      error: "法線ベクトル、平面、曲面、空間曲線の問題には対応していません。",
      errorCode: "UNSUPPORTED_NORMAL_GEOMETRY",
    });
  }
  if (UNSUPPORTED_CURVE_CUE.test(text)) {
    return response({
      recognized: true,
      error: "円・陰関数・媒介曲線・極座標曲線の法線問題には対応していません。",
      errorCode: "UNSUPPORTED_NORMAL_CURVE",
    });
  }
  if (UNSUPPORTED_FUNCTION_LABEL_CUE.test(text)) {
    return response({
      recognized: true,
      error: "現在は曲線y=f(x)を明示する文書化された法線形式だけに対応しています。",
      errorCode: "UNSUPPORTED_NORMAL_FORM",
    });
  }
  if (candidate?.unsupportedVariable || OTHER_CURVE_VARIABLE.test(text)
    || OTHER_COORDINATE_VARIABLE.test(text)) {
    return response({
      recognized: true,
      error: "現在はy=f(x)をx座標または点で指定する法線だけに対応しています。",
      errorCode: "UNSUPPORTED_NORMAL_VARIABLE",
    });
  }

  const documentedShape = SYMBOLIC_NORMAL_CUE.test(text)
    || DOCUMENTED_NORMAL_SHAPE.test(text);
  if (!candidate && !documentedShape && UNSUPPORTED_BARE_FUNCTION_CUE.test(text)) {
    return response({
      recognized: true,
      error: "現在は曲線y=f(x)を明示する文書化された法線形式だけに対応しています。",
      errorCode: "UNSUPPORTED_NORMAL_FORM",
    });
  }
  if (!candidate && !documentedShape && UNSUPPORTED_IMPLICIT_CURVE_CUE.test(text)) {
    return response({
      recognized: true,
      error: "円・陰関数・媒介曲線・極座標曲線の法線問題には対応していません。",
      errorCode: "UNSUPPORTED_NORMAL_CURVE",
    });
  }

  const parsedCandidate = candidate ?? japaneseCandidate(text);
  if (
    !parsedCandidate
    && !documentedShape
    && !BARE_NORMAL_INSTRUCTION.test(text)
  ) {
    return response({
      recognized: true,
      error: "現在はy=f(x)を明示した多項式について、文書化された形式で接点を指定する法線だけに対応しています。",
      errorCode: "UNSUPPORTED_NORMAL_FORM",
    });
  }
  if (!parsedCandidate || parsedCandidate.malformed) {
    return response({
      recognized: true,
      error: "法線はnormal_x_[a](f)、normal_[a](f)、normal_point_(a,b)(f)、または対応する完全な日本語形式で入力してください。",
      errorCode: "MALFORMED_NORMAL_INPUT",
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
        error: error.message || "法線入力を厳密に検証できませんでした。",
        errorCode: error.code || "INVALID_NORMAL_INPUT",
      });
    }
    throw error;
  }
}

export default parsePolynomialNormalInput;
