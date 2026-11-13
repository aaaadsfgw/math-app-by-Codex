import { invalid } from "../core/errors.js";
import { lineFacts } from "../core/problem.js";
import { angle, length } from "../core/refs.js";
import { constant, equal, known } from "../core/rule-helpers.js";

export function tuple(value, size) {
  if (!Array.isArray(value) || value.length !== size) throw invalid(`${size} 個の要素を指定してください。`);
  return value;
}

export function scaled(add, math, name, result, operand, factor) {
  add(name, [result, operand], ([a, b]) => {
    if (a === undefined && b !== undefined) return [[0, math.mul(b, factor)]];
    if (b === undefined && a !== undefined) return [[1, math.div(a, factor)]];
    return [];
  }, (v) => known(v) ? math.compare(v[0], math.mul(v[1], factor)) === 0 : null);
}

export function fixedSum(add, math, name, refs, total) {
  add(name, refs, (values) => {
    const missing = values.indexOf(undefined);
    if (missing < 0 || values.lastIndexOf(undefined) !== missing) return [];
    return [[missing, values.reduce((remainder, value) => value === undefined ? remainder : math.sub(remainder, value), total)]];
  }, (values) => {
    const remainder = values.reduce((rest, value) => value === undefined ? rest : math.sub(rest, value), total);
    const sign = math.compare(remainder, math.parse(0));
    return known(values) ? sign === 0 : sign <= 0 ? false : null;
  });
}

export function buildRelationRules(problem, add, math) {
  const one = math.parse(1);
  const right = math.parse(90);
  const straight = math.parse(180);
  for (const relation of problem.relations) {
    const { type } = relation;
    if (type === "parallel" || type === "perpendicular") {
      const refs = lineFacts(relation.lines);
      constant(add, math, type === "parallel" ? "平行条件" : "垂直条件", refs[type === "parallel" ? 0 : 1], one);
    } else if (type === "equal_lengths") {
      const [a, b] = tuple(relation.segments, 2).map((segment) => length(...tuple(segment, 2)));
      equal(add, math, "等しい線分", a, b);
    } else if (["equal_angles", "vertical_angles", "supplementary", "complementary"].includes(type)) {
      const refs = tuple(relation.angles, 2).map((item) => angle(...tuple(item, 3)));
      if (type === "equal_angles" || type === "vertical_angles") {
        equal(add, math, type === "vertical_angles" ? "対頂角" : "等しい角", ...refs);
      } else {
        fixedSum(add, math, type === "supplementary" ? "補角" : "余角", refs,
          type === "supplementary" ? straight : right);
      }
    } else if (type === "angle_bisector") {
      const [whole, first, second] = tuple(relation.angles, 3).map((item) => angle(...tuple(item, 3)));
      equal(add, math, "角の二等分線", first, second);
      scaled(add, math, "角の二等分線", whole, first, math.parse(2));
    } else if (type === "exterior_angle") {
      const [outside, inside, first, second] = tuple(relation.angles, 4).map((item) => angle(...tuple(item, 3)));
      fixedSum(add, math, "外角と隣接内角", [outside, inside], straight);
      add("三角形の外角", [outside, first, second], ([out, a, b]) => {
        if (out === undefined && known([a, b])) return [[0, math.add(a, b)]];
        if (out !== undefined && (a === undefined) !== (b === undefined)) return [[a === undefined ? 1 : 2, math.sub(out, a ?? b)]];
        return [];
      }, (v) => known(v) ? math.compare(v[0], math.add(v[1], v[2])) === 0 : null);
    } else if (type === "parallel_transversal") {
      if (!["alternate", "corresponding", "same_side"].includes(relation.position)) throw invalid("横断線上の角の配置を指定してください。");
      const [p] = lineFacts(relation.lines);
      const [a, b] = tuple(relation.angles, 2).map((item) => angle(...tuple(item, 3)));
      const sameSide = relation.position === "same_side";
      const other = (value) => sameSide ? math.sub(straight, value) : value;
      const aligns = (u, v) => math.compare(u, other(v)) === 0;
      add("平行線と横断線の角", [p, a, b], ([flag, u, v]) => {
        if (flag === undefined && known([u, v])) return [[0, math.parse(aligns(u, v) ? 1 : 0)]];
        if (flag !== undefined && math.compare(flag, one) === 0 && (u === undefined) !== (v === undefined)) {
          return [[u === undefined ? 1 : 2, other(u ?? v)]];
        }
        return [];
      }, (v) => known(v) ? (math.compare(v[0], one) === 0) === aligns(v[1], v[2]) : null);
    }
  }
}
