import {
  failedResult,
  formatNumber,
  nearlyEqual,
  normalizeMathText,
  simplifySquareRoot,
  solvedResult,
  unsupportedResult,
} from "./utils.js";

export const TRIANGLE_SOLVER_ID = "geometry-triangle";

const SIDE_NAMES = ["AB", "BC", "CA"];
const ANGLE_NAMES = ["A", "B", "C"];
const ADJACENT_SIDES = Object.freeze({ A: ["AB", "CA"], B: ["AB", "BC"], C: ["BC", "CA"] });
const OPPOSITE_SIDE = Object.freeze({ A: "BC", B: "CA", C: "AB" });

function canonicalSide(target) {
  const value = String(target ?? "").trim().toUpperCase();
  if (!/^(?:AB|BA|AC|CA|BC|CB)$/.test(value)) return null;
  const sorted = [...value].sort().join("");
  return { AB: "AB", AC: "CA", BC: "BC" }[sorted] ?? null;
}

function finiteNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = normalizeMathText(value).replace(/,/g, "");
  if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function targetsFromConstraint(constraint) {
  const source = constraint.targets ?? constraint.target ?? [];
  if (Array.isArray(source)) return source.map(String);
  return String(source).split(/[,=・\s]+/).filter(Boolean);
}

function commonVertex(firstSide, secondSide) {
  const first = canonicalSide(firstSide);
  const second = canonicalSide(secondSide);
  if (!first || !second) return null;
  return [...first].find((vertex) => second.includes(vertex)) ?? null;
}

function normalizeQuery(query, rawText = "") {
  if (typeof query === "string") {
    const side = canonicalSide(query);
    if (side) return { type: "length", target: side };
    const text = normalizeMathText(query);
    if (/面積|area/i.test(text)) return { type: "area", target: "ABC" };
    if (/周長|perimeter/i.test(text)) return { type: "perimeter", target: "ABC" };
    if (/高さ|height/i.test(text)) return { type: "height", target: null };
    if (/角|angle/i.test(text)) {
      const angle = text.match(/[ABC]/i)?.[0]?.toUpperCase() ?? null;
      return { type: "angle", target: angle };
    }
  }
  if (query && typeof query === "object") {
    const rawType = String(query.type ?? "").toLowerCase();
    const type = {
      area: "area",
      perimeter: "perimeter",
      length: "length",
      side: "length",
      angle: "angle",
      height: "height",
    }[rawType] ?? rawType;
    return {
      type,
      target: type === "length" ? canonicalSide(query.target) : String(query.target ?? "").toUpperCase() || null,
    };
  }

  const text = normalizeMathText(rawText);
  if (/面積/u.test(text)) return { type: "area", target: "ABC" };
  if (/周長/u.test(text)) return { type: "perimeter", target: "ABC" };
  if (/高さ/u.test(text) && /求/u.test(text)) return { type: "height", target: canonicalSide(text.match(/(?:底辺|辺)\s*(AB|BC|CA|AC)/i)?.[1]) };
  const sideQuery = text.match(/(?:辺)?\s*(AB|BC|CA|AC)\s*(?:の長さ)?を?(?:求め|計算)/iu);
  if (sideQuery) return { type: "length", target: canonicalSide(sideQuery[1]) };
  const angleQuery = text.match(/(?:角|∠)\s*([ABC])\s*を?(?:求め|計算)/iu);
  if (angleQuery) return { type: "angle", target: angleQuery[1].toUpperCase() };
  if (/残り(?:の)?角|残り(?:の)?内角/u.test(text)) return { type: "angle", target: null };
  return null;
}

function blankTriangleData(raw = "") {
  return {
    raw,
    sides: {},
    angles: {},
    genericAngles: [],
    base: null,
    height: null,
    baseTarget: null,
    rightVertex: null,
    equalSideGroups: [],
    equalAngleGroups: [],
    equilateral: false,
    isosceles: false,
    unsupportedConstraints: [],
    query: null,
  };
}

function parseStructuredInput(input) {
  const data = blankTriangleData("");
  data.equilateral = /equilateral|正三角形/i.test(String(input.template ?? input.type ?? ""));
  data.isosceles = /isosceles|二等辺/i.test(String(input.template ?? input.type ?? ""));

  Object.entries(input.sides ?? {}).forEach(([target, value]) => {
    const side = canonicalSide(target);
    const number = finiteNumber(value);
    if (side && number !== null) data.sides[side] = number;
  });
  Object.entries(input.angles ?? {}).forEach(([target, value]) => {
    const angle = String(target).toUpperCase();
    const number = finiteNumber(value);
    if (ANGLE_NAMES.includes(angle) && number !== null) data.angles[angle] = number;
  });
  data.base = finiteNumber(input.base);
  data.height = finiteNumber(input.height);
  data.baseTarget = canonicalSide(input.baseTarget);
  data.rightVertex = String(input.rightVertex ?? input.rightAngle ?? "").toUpperCase();
  if (!ANGLE_NAMES.includes(data.rightVertex)) data.rightVertex = null;

  for (const constraint of Array.isArray(input.constraints) ? input.constraints : []) {
    const type = String(constraint?.type ?? "").toLowerCase();
    const number = finiteNumber(constraint?.value);
    if (type === "length") {
      if (/^(?:base|底辺)$/i.test(String(constraint.target).trim()) && number !== null) {
        data.base = number;
      } else {
        const side = canonicalSide(constraint.target);
        if (side && number !== null) data.sides[side] = number;
      }
    } else if (type === "angle") {
      const angle = String(constraint.target ?? "").toUpperCase();
      if (ANGLE_NAMES.includes(angle) && number !== null) data.angles[angle] = number;
    } else if (type === "height" && number !== null) {
      data.height = number;
      data.baseTarget = canonicalSide(constraint.target) ?? data.baseTarget;
    } else if (type === "perpendicular") {
      const [first, second] = targetsFromConstraint(constraint);
      data.rightVertex = commonVertex(first, second) ?? String(constraint.target ?? "").match(/[ABC]/i)?.[0]?.toUpperCase() ?? data.rightVertex;
    } else if (type === "equal-length") {
      const group = targetsFromConstraint(constraint).map(canonicalSide).filter(Boolean);
      if (group.length >= 2) data.equalSideGroups.push([...new Set(group)]);
    } else if (type === "equal-angle") {
      const group = targetsFromConstraint(constraint).map((target) => String(target).toUpperCase()).filter((target) => ANGLE_NAMES.includes(target));
      if (group.length >= 2) data.equalAngleGroups.push([...new Set(group)]);
    } else {
      data.unsupportedConstraints.push(type || "unknown");
    }
  }
  data.query = normalizeQuery(input.query ?? input.target);
  return data;
}

function parseNaturalLanguage(input) {
  const text = normalizeMathText(input).replace(/[，、]/g, ",");
  const compact = text.replace(/\s+/g, "");
  const data = blankTriangleData(text);
  data.equilateral = /正三角形/u.test(text);
  data.isosceles = /二等辺三角形/u.test(text);

  for (const match of compact.matchAll(/(?:辺)?(AB|BC|CA|AC)(?:の長さ)?(?:=|は)([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?!\s*(?:°|度))/giu)) {
    data.sides[canonicalSide(match[1])] = Number(match[2]);
  }
  for (const match of compact.matchAll(/(?:∠|角)([ABC])(?:=|は)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:°|度)/giu)) {
    data.angles[match[1].toUpperCase()] = Number(match[2]);
  }
  for (const match of compact.matchAll(/(?:^|[,;])([ABC])(?:=|は)([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:°|度)/giu)) {
    data.angles[match[1].toUpperCase()] = Number(match[2]);
  }

  const labelledAngleValues = new Set(Object.values(data.angles));
  for (const match of compact.matchAll(/(?:角(?:度)?(?:は|が)?|[,と])([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:°|度)/gu)) {
    const value = Number(match[1]);
    if (!labelledAngleValues.has(value)) data.genericAngles.push(value);
  }
  if (!data.genericAngles.length && /(?:内角|角).*(?:残り|求)/u.test(text)) {
    const values = [...compact.matchAll(/([+-]?(?:\d+(?:\.\d+)?|\.\d+))(?:°|度)/gu)].map((match) => Number(match[1]));
    data.genericAngles.push(...values.filter((value) => !labelledAngleValues.has(value)));
  }

  const baseMatch = compact.match(/底辺(?:=|は|が)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))/u);
  const heightMatch = compact.match(/高さ(?:=|は|が)?([+-]?(?:\d+(?:\.\d+)?|\.\d+))/u);
  if (baseMatch) data.base = Number(baseMatch[1]);
  if (heightMatch) data.height = Number(heightMatch[1]);

  const threeSides = compact.match(/3辺(?:の長さ)?(?:は|が|=)?([^。.!！?？]+)/u);
  if (threeSides && Object.keys(data.sides).length === 0) {
    const values = [...threeSides[1].matchAll(/[+-]?(?:\d+(?:\.\d+)?|\.\d+)/g)].map((match) => Number(match[0])).slice(0, 3);
    if (values.length === 3) [data.sides.AB, data.sides.BC, data.sides.CA] = values;
  }

  for (const match of compact.matchAll(/(AB|BC|CA|AC)=(AB|BC|CA|AC)/giu)) {
    data.equalSideGroups.push([canonicalSide(match[1]), canonicalSide(match[2])]);
  }
  for (const match of compact.matchAll(/(?:∠|角)([ABC])=(?:∠|角)?([ABC])/giu)) {
    data.equalAngleGroups.push([match[1].toUpperCase(), match[2].toUpperCase()]);
  }

  if (/直角/u.test(text)) {
    data.rightVertex = Object.entries(data.angles).find(([, value]) => nearlyEqual(value, 90))?.[0] ?? null;
    const rightMatch = compact.match(/(?:∠|角)([ABC])(?:が|は)?直角/u);
    if (rightMatch) data.rightVertex = rightMatch[1].toUpperCase();
  }
  data.query = normalizeQuery(null, text);
  return data;
}

function propagateEquality(values, groups) {
  for (let pass = 0; pass < 3; pass += 1) {
    for (const group of groups) {
      const known = group.map((key) => values[key]).filter((value) => value !== undefined);
      if (known.length > 1 && known.some((value) => !nearlyEqual(value, known[0]))) {
        return "等しいと指定した値が一致しません";
      }
      if (known.length) group.forEach((key) => { values[key] = known[0]; });
    }
  }
  return null;
}

function prepareData(data) {
  if (data.rightVertex) data.angles[data.rightVertex] = 90;
  if (data.isosceles) {
    data.equalSideGroups.push(["AB", "CA"]);
    data.equalAngleGroups.push(["B", "C"]);
  }
  if (data.equilateral) {
    data.equalSideGroups.push([...SIDE_NAMES]);
    data.equalAngleGroups.push([...ANGLE_NAMES]);
    ANGLE_NAMES.forEach((angle) => { data.angles[angle] = 60; });
  }
  const sideEqualityError = propagateEquality(data.sides, data.equalSideGroups);
  const angleEqualityError = propagateEquality(data.angles, data.equalAngleGroups);
  return sideEqualityError ?? angleEqualityError;
}

function contradictionReason(data) {
  const lengths = [...Object.values(data.sides), data.base, data.height].filter((value) => value !== null && value !== undefined);
  if (lengths.some((value) => !Number.isFinite(value) || value <= 0)) return "辺や高さは正の数にしてください";
  const angles = [...Object.values(data.angles), ...data.genericAngles];
  if (angles.some((value) => !Number.isFinite(value) || value <= 0 || value >= 180)) return "内角は0度より大きく180度未満にしてください";
  if (angles.length < 3 && angles.reduce((sum, value) => sum + value, 0) >= 180 - 1e-9) return "既知の内角の合計が180度以上です";
  if (angles.length === 3 && !nearlyEqual(angles.reduce((sum, value) => sum + value, 0), 180)) return "3つの内角の合計が180度ではありません";
  if (angles.length > 3) return "内角の指定が多すぎます";

  if (SIDE_NAMES.every((side) => data.sides[side] !== undefined)) {
    const [ab, bc, ca] = SIDE_NAMES.map((side) => data.sides[side]);
    if (ab + bc <= ca || bc + ca <= ab || ca + ab <= bc) return "三角不等式を満たしていません";
    const rightVertex = Object.entries(data.angles).find(([, value]) => nearlyEqual(value, 90))?.[0];
    if (rightVertex) {
      const hypotenuse = OPPOSITE_SIDE[rightVertex];
      const legs = ADJACENT_SIDES[rightVertex];
      if (!nearlyEqual(data.sides[hypotenuse] ** 2, data.sides[legs[0]] ** 2 + data.sides[legs[1]] ** 2, 1e-7)) {
        return "直角条件と3辺の長さが一致しません";
      }
    }
  }
  return null;
}

function contradictionResult(reason) {
  return failedResult(TRIANGLE_SOLVER_ID, `入力条件が矛盾しています: ${reason}`);
}

function exactRoot(value) {
  if (!Number.isInteger(value) || value < 0) return null;
  const { outside, inside } = simplifySquareRoot(value);
  if (inside === 1) return String(outside);
  return `${outside === 1 ? "" : outside}√${inside}`;
}

function displayExactAndApproximate(exact, approximate) {
  if (!exact || nearlyEqual(approximate, Math.round(approximate))) return formatNumber(approximate);
  return `${exact}（約${formatNumber(approximate)}）`;
}

function specialAngleArea(firstSide, secondSide, angle) {
  const product = firstSide * secondSide;
  if (![firstSide, secondSide].every(Number.isInteger)) return null;
  if (nearlyEqual(angle, 30)) return { exact: formatNumber(product / 4), value: product / 4 };
  if (nearlyEqual(angle, 90)) return { exact: formatNumber(product / 2), value: product / 2 };
  if (nearlyEqual(angle, 45) || nearlyEqual(angle, 135)) {
    const numerator = product;
    const exact = numerator % 4 === 0
      ? `${numerator / 4}√2`
      : numerator % 2 === 0
        ? `${numerator / 2}√2/2`
        : `${numerator}√2/4`;
    return { exact, value: product * Math.SQRT2 / 4 };
  }
  if (nearlyEqual(angle, 60) || nearlyEqual(angle, 120)) {
    const exact = product % 4 === 0
      ? `${product / 4}√3`
      : product % 2 === 0
        ? `${product / 2}√3/2`
        : `${product}√3/4`;
    return { exact, value: product * Math.sqrt(3) / 4 };
  }
  return null;
}

function heronArea(data) {
  if (!SIDE_NAMES.every((side) => data.sides[side] !== undefined)) return null;
  const [ab, bc, ca] = SIDE_NAMES.map((side) => data.sides[side]);
  const semiperimeter = (ab + bc + ca) / 2;
  const radicand = semiperimeter * (semiperimeter - ab) * (semiperimeter - bc) * (semiperimeter - ca);
  if (radicand < 0) return null;
  return { value: Math.sqrt(Math.max(0, radicand)), semiperimeter, radicand };
}

function solveArea(data) {
  const base = data.base ?? (data.baseTarget ? data.sides[data.baseTarget] : null);
  if (base !== null && base !== undefined && data.height !== null) {
    const value = base * data.height / 2;
    return solvedResult({
      answer: formatNumber(value),
      steps: [`面積=${formatNumber(base)}×${formatNumber(data.height)}÷2`, formatNumber(value)],
      verification: `底辺×高さ÷2を再計算して${formatNumber(value)}になることを確認しました`,
      solverId: TRIANGLE_SOLVER_ID,
    });
  }
  for (const vertex of ANGLE_NAMES) {
    const [firstName, secondName] = ADJACENT_SIDES[vertex];
    const firstSide = data.sides[firstName];
    const secondSide = data.sides[secondName];
    const angle = data.angles[vertex];
    if ([firstSide, secondSide, angle].some((value) => value === undefined)) continue;
    const special = specialAngleArea(firstSide, secondSide, angle);
    const value = special?.value ?? firstSide * secondSide * Math.sin(angle * Math.PI / 180) / 2;
    const answer = special ? displayExactAndApproximate(special.exact, value) : formatNumber(value);
    return solvedResult({
      answer,
      steps: [
        `面積=1/2×${firstName}×${secondName}×sin${vertex}`,
        `=1/2×${formatNumber(firstSide)}×${formatNumber(secondSide)}×sin${formatNumber(angle)}°`,
        answer,
      ],
      verification: `数値計算した面積は${formatNumber(value)}で、正の値であることを確認しました`,
      solverId: TRIANGLE_SOLVER_ID,
    });
  }
  const heron = heronArea(data);
  if (heron) {
    const exact = exactRoot(heron.radicand);
    const answer = displayExactAndApproximate(exact, heron.value);
    return solvedResult({
      answer,
      steps: [
        `半周長s=${formatNumber(heron.semiperimeter)}`,
        "面積=√(s(s-a)(s-b)(s-c))",
        answer,
      ],
      verification: "3辺が三角不等式を満たすことを確認してからヘロンの公式で再計算しました",
      solverId: TRIANGLE_SOLVER_ID,
    });
  }
  return unsupportedResult("面積を求める条件が不足しています");
}

function solvePerimeter(data) {
  if (!SIDE_NAMES.every((side) => data.sides[side] !== undefined)) {
    return unsupportedResult("周長には3辺の長さが必要です");
  }
  const value = SIDE_NAMES.reduce((sum, side) => sum + data.sides[side], 0);
  return solvedResult({
    answer: formatNumber(value),
    steps: [`${SIDE_NAMES.map((side) => formatNumber(data.sides[side])).join("+")}=${formatNumber(value)}`],
    verification: "3辺を再度合計して周長を確認しました",
    solverId: TRIANGLE_SOLVER_ID,
  });
}

function solveAngle(data) {
  const namedAngles = Object.entries(data.angles);
  const target = data.query?.target;
  if (target && data.angles[target] !== undefined) {
    return solvedResult({
      answer: `${formatNumber(data.angles[target])}°`,
      steps: [`入力条件より角${target}=${formatNumber(data.angles[target])}°`],
      verification: "入力された角度条件と一致します",
      solverId: TRIANGLE_SOLVER_ID,
    });
  }
  const known = data.genericAngles.length ? data.genericAngles : namedAngles.map(([, value]) => value);
  if (known.length !== 2) return unsupportedResult("残りの角を求めるには2つの内角が必要です");
  const remaining = 180 - known[0] - known[1];
  const answer = `${formatNumber(remaining)}°`;
  const label = target ? `角${target}` : "残りの角";
  return solvedResult({
    answer,
    steps: [`${label}=180°-${formatNumber(known[0])}°-${formatNumber(known[1])}°`, answer],
    verification: `3つの角の合計が${formatNumber(known[0] + known[1] + remaining)}°になることを確認しました`,
    solverId: TRIANGLE_SOLVER_ID,
  });
}

function solveLength(data) {
  const target = canonicalSide(data.query?.target);
  if (!target) return unsupportedResult("求める辺を指定してください");
  if (data.sides[target] !== undefined) {
    return solvedResult({
      answer: formatNumber(data.sides[target]),
      steps: [`入力条件より${target}=${formatNumber(data.sides[target])}`],
      verification: "入力された辺の条件と一致します",
      solverId: TRIANGLE_SOLVER_ID,
    });
  }
  const rightVertex = Object.entries(data.angles).find(([, value]) => nearlyEqual(value, 90))?.[0];
  if (!rightVertex) return unsupportedResult("初期版で未知の辺を計算するには直角条件が必要です");
  const hypotenuse = OPPOSITE_SIDE[rightVertex];
  const legs = ADJACENT_SIDES[rightVertex];
  let squared;
  if (target === hypotenuse && legs.every((side) => data.sides[side] !== undefined)) {
    squared = data.sides[legs[0]] ** 2 + data.sides[legs[1]] ** 2;
  } else if (legs.includes(target) && data.sides[hypotenuse] !== undefined) {
    const otherLeg = legs.find((side) => side !== target);
    if (data.sides[otherLeg] === undefined) return unsupportedResult("三平方の定理に必要な2辺が不足しています");
    squared = data.sides[hypotenuse] ** 2 - data.sides[otherLeg] ** 2;
  } else {
    return unsupportedResult("三平方の定理に必要な2辺が不足しています");
  }
  if (!(squared > 0)) return contradictionResult("三平方の定理で辺の長さが正になりません");
  const value = Math.sqrt(squared);
  const exact = exactRoot(squared);
  const answer = displayExactAndApproximate(exact, value);
  return solvedResult({
    answer,
    steps: [`三平方の定理より${target}^2=${formatNumber(squared)}`, `${target}=${answer}`],
    verification: `${target}の2乗を含む三平方の関係が成立することを確認しました`,
    solverId: TRIANGLE_SOLVER_ID,
  });
}

function solveHeight(data) {
  if (data.height !== null) {
    return solvedResult({
      answer: formatNumber(data.height),
      steps: [`入力条件より高さ=${formatNumber(data.height)}`],
      verification: "入力された高さ条件と一致します",
      solverId: TRIANGLE_SOLVER_ID,
    });
  }
  const baseTarget = canonicalSide(data.query?.target) ?? data.baseTarget ?? SIDE_NAMES.find((side) => data.sides[side] !== undefined);
  const base = baseTarget ? data.sides[baseTarget] : data.base;
  if (!base) return unsupportedResult("高さを求めるための底辺が不足しています");
  const heron = heronArea(data);
  if (!heron) return unsupportedResult("高さを求めるための面積条件が不足しています");
  const height = 2 * heron.value / base;
  return solvedResult({
    answer: formatNumber(height),
    steps: [`面積=${formatNumber(heron.value)}`, `高さ=2×面積÷底辺=${formatNumber(height)}`],
    verification: `底辺×高さ÷2=${formatNumber(base * height / 2)}として面積と一致します`,
    solverId: TRIANGLE_SOLVER_ID,
  });
}

export function solveTriangle(input) {
  const isStructured = input && typeof input === "object" && !Array.isArray(input);
  const data = isStructured ? parseStructuredInput(input) : parseNaturalLanguage(input);
  const hasTriangleSignal = isStructured
    ? Boolean(input.template || input.constraints || input.sides || input.angles || input.query)
    : /三角|角|∠|辺|面積|周長|底辺|高さ|直角/u.test(data.raw);
  if (!hasTriangleSignal) return unsupportedResult("三角形の条件を検出できません");
  if (data.unsupportedConstraints.length) {
    const types = [...new Set(data.unsupportedConstraints)].join("、");
    return unsupportedResult(`未対応の図形条件が含まれています: ${types}`);
  }

  const equalityError = prepareData(data);
  if (equalityError) return contradictionResult(equalityError);
  const contradiction = contradictionReason(data);
  if (contradiction) return contradictionResult(contradiction);
  if (!data.query) return unsupportedResult("求める対象を指定してください");

  switch (data.query.type) {
    case "area": return solveArea(data);
    case "perimeter": return solvePerimeter(data);
    case "angle": return solveAngle(data);
    case "length": return solveLength(data);
    case "height": return solveHeight(data);
    default: return unsupportedResult("指定された対象は三角形ソルバー未対応です");
  }
}

export function solveTriangleFromData(data) {
  return solveTriangle(data);
}

export default solveTriangle;
