import { invalid, unsupported } from "../core/errors.js";
import { vertexList } from "../core/problem.js";
import { angle, length, parallel, perpendicular, property } from "../core/refs.js";
import { constant, equal, known, product, pythagorean, sum } from "../core/rule-helpers.js";
import { fixedSum, scaled, tuple } from "./relations.js";

export const triangleTypes = new Set(["triangle", "right_triangle", "isosceles_triangle", "equilateral_triangle"]);
const at = (vertices, index) => angle(vertices[(index + 1) % 3], vertices[index], vertices[(index + 2) % 3]);
const opposite = (vertices, index) => length(vertices[(index + 1) % 3], vertices[(index + 2) % 3]);
const slots = [0, 1, 2];

function deriveValue(add, math, name, output, inputs, compute) {
  add(name, [output, ...inputs], ([current, ...values]) =>
    current === undefined && known(values) ? [[0, compute(...values)]] : [],
  ([current, ...values]) => current !== undefined && known(values) ? math.compare(current, compute(...values)) === 0 : null);
}

function transfer(add, math, name, flag, left, right) {
  const one = math.parse(1);
  add(name, [flag, left, right], ([proved, a, b]) => {
    if (proved === undefined || math.compare(proved, one) !== 0 || (a === undefined) === (b === undefined)) return [];
    return [[a === undefined ? 1 : 2, a ?? b]];
  }, ([proved, a, b]) => known([proved, a, b]) && math.compare(proved, one) === 0 ? math.compare(a, b) === 0 : null);
}

function triangle(add, math, object) {
  const vertices = vertexList(object, 3);
  const sides = slots.map((i) => opposite(vertices, i));
  const angles = slots.map((i) => at(vertices, i));
  const p = (name) => property(object.id, name);
  const [two, three, four, sixty, ninety] = [2, 3, 4, 60, 90].map(math.parse);
  const half = math.parse("1/2");
  const zero = math.parse(0);
  const cosines = [[30, "sqrt(3)/2"], [45, "sqrt(2)/2"], [60, "1/2"], [90, 0],
    [120, "-1/2"], [135, "-sqrt(2)/2"], [150, "-sqrt(3)/2"]]
    .map(([degree, cosine]) => [math.parse(degree), cosine]);
  fixedSum(add, math, "三角形の内角和", angles, math.parse(180));
  sum(add, math, "三角形の周長", p("perimeter"), sides);
  const area = p("area");
  const semiperimeter = p("semiperimeter");
  scaled(add, math, "半周長", p("perimeter"), semiperimeter, two);
  const triangleInequality = (values) => known(values)
    ? slots.every((i) => math.compare(values[i], math.add(values[(i + 1) % 3], values[(i + 2) % 3])) < 0) : null;
  add("三角不等式", sides, () => [], triangleInequality);
  add("ヘロンの公式", [area, semiperimeter, ...sides], ([value, s, ...edges]) => {
    if (value !== undefined || !known([s, ...edges]) || !triangleInequality(edges)) return [];
    return [[0, math.sqrt(edges.reduce((radicand, side) => math.mul(radicand, math.sub(s, side)), s))]];
  }, ([value, s, ...edges]) => {
    if (!known([value, s, ...edges])) return null;
    // Verify the squared invariant so a non-rational area remains exact.
    return triangleInequality(edges) && math.compare(math.pow(value, 2),
      edges.reduce((radicand, side) => math.mul(radicand, math.sub(s, side)), s)) === 0;
  });
  for (const i of slots) {
    const j = (i + 1) % 3;
    const k = (i + 2) % 3;
    const height = p(`height:${sides[i].slice(4)}`);
    product(add, math, "底辺と高さ", p(`doubleArea:${i}`), sides[i], height);
    scaled(add, math, "三角形の面積", area, p(`doubleArea:${i}`), half);
    const facts = [angles[j], angles[k], sides[j], sides[k]];
    add("二等辺三角形の底角と対辺", facts, (v) => {
      for (const offset of [0, 2]) {
        const other = 2 - offset;
        if (known(v.slice(offset, offset + 2)) && math.compare(v[offset], v[offset + 1]) === 0
          && (v[other] === undefined) !== (v[other + 1] === undefined)) {
          return [[v[other] === undefined ? other : other + 1, v[other] ?? v[other + 1]]];
        }
      }
      return [];
    }, (v) => known(v) ? Math.sign(math.compare(v[0], v[1])) === Math.sign(math.compare(v[2], v[3])) : null);
    add("三角形の高さは頂点からの辺を超えない", [height, sides[j], sides[k]], () => [],
      ([h, a, b]) => h !== undefined && [a, b].some((side) => side !== undefined && math.compare(h, side) > 0)
        ? false : null);
    add("三平方の定理の逆", [angles[i], sides[i], sides[j], sides[k]], ([a, c, x, y]) => {
      if (a !== undefined || !known([c, x, y])) return [];
      return math.compare(math.pow(c, 2), math.add(math.pow(x, 2), math.pow(y, 2))) === 0 ? [[0, ninety]] : [];
    }, ([a, c, x, y]) => known([a, c, x, y])
      ? Math.sign(math.compare(a, ninety))
        === Math.sign(math.compare(math.pow(c, 2), math.add(math.pow(x, 2), math.pow(y, 2)))) : null);
    add("辺と既知角の余弦関係", [angles[i], sides[i], sides[j], sides[k]], () => [],
      ([a, c, x, y]) => {
        if (!known([a, c, x, y])) return null;
        const cosine = cosines.find(([degree]) => math.compare(a, degree) === 0);
        if (!cosine) throw unsupported("3辺と併記されたこの角度を厳密に照合できません。");
        const observed = math.sub(math.add(math.pow(x, 2), math.pow(y, 2)), math.pow(c, 2));
        const expected = math.mul(math.mul(two, math.mul(x, y)), math.parse(cosine[1]));
        return math.compare(observed, expected) === 0;
      });
    // A right-angle fact activates the same Pythagorean constraint used by
    // rectangle diagonals, chord halves, and solid slant heights.
    const guardedAdd = (name, refs, derive, verify) => add(name, [angles[i], ...refs], ([a, ...v]) =>
      a !== undefined && math.compare(a, ninety) === 0 ? derive(v).map(([slot, value]) => [slot + 1, value]) : [],
    ([a, ...v]) => a !== undefined && math.compare(a, ninety) === 0 ? verify(v) : null);
    pythagorean(guardedAdd, math, "三平方の定理", sides[i], sides[j], sides[k]);
    product(guardedAdd, math, "直角三角形の面積", p(`doubleRightArea:${i}`), sides[j], sides[k]);
    scaled(guardedAdd, math, "直角三角形の面積", area, p(`doubleRightArea:${i}`), half);
    for (const acute of [j, k]) {
      add("30度・45度の直角三角形", [angles[i], angles[acute], sides[i], sides[acute]], ([r, a, hyp, leg]) => {
        if (!known([r, a]) || math.compare(r, ninety) !== 0 || (hyp === undefined) === (leg === undefined)) return [];
        const multiplier = math.compare(a, math.parse(30)) === 0 ? two
          : math.compare(a, math.parse(45)) === 0 ? math.sqrt(two) : undefined;
        if (multiplier === undefined) return [];
        return hyp === undefined ? [[2, math.mul(leg, multiplier)]] : [[3, math.div(hyp, multiplier)]];
      }, ([r, a, hyp, leg]) => {
        if (!known([r, a, hyp, leg]) || math.compare(r, ninety) !== 0) return null;
        const ratio = math.compare(a, math.parse(30)) === 0 ? four
          : math.compare(a, math.parse(45)) === 0 ? two : undefined;
        return ratio === undefined ? null : math.compare(math.pow(hyp, 2), math.mul(math.pow(leg, 2), ratio)) === 0;
      });
    }
  }
  if (object.type === "right_triangle") {
    const index = vertices.indexOf(object.rightAngleAt);
    if (index < 0) throw invalid("直角の頂点が三角形にありません。");
    constant(add, math, "直角の指定", angles[index], ninety);
  }
  if (object.type === "isosceles_triangle") {
    const index = vertices.indexOf(object.apex);
    if (index < 0) throw invalid("二等辺三角形の頂角を指定してください。");
    equal(add, math, "二等辺三角形の等辺", sides[(index + 1) % 3], sides[(index + 2) % 3]);
    equal(add, math, "二等辺三角形の底角", angles[(index + 1) % 3], angles[(index + 2) % 3]);
    const base = sides[index];
    const altitude = p(`height:${base.slice(4)}`);
    const halfBase = p("halfBase");
    scaled(add, math, "二等辺三角形の底辺の二等分", halfBase, base, half);
    pythagorean(add, math, "二等辺三角形の高さ", sides[(index + 1) % 3], altitude, halfBase);
  }
  if (object.type === "equilateral_triangle") {
    for (const i of slots) constant(add, math, "正三角形の内角", angles[i], sixty);
    for (const i of [1, 2]) equal(add, math, "正三角形の等辺", sides[0], sides[i]);
    deriveValue(add, math, "正三角形の面積", area, [sides[0]],
      (side) => math.div(math.mul(math.pow(side, 2), math.sqrt(three)), four));
  }
  // Strictly interior angles and positive sides are checked by the fact store.
  add("二つの直角を持つ三角形は存在しない", angles, () => [], (values) =>
    values.filter((value) => value !== undefined && math.compare(math.sub(value, ninety), zero) >= 0).length > 1
      ? false : null);
}

function matchTriangles(add, math, problem, relation) {
  const first = problem.byId.get(relation.first);
  const second = problem.byId.get(relation.second);
  if (!first || !second || first === second || !triangleTypes.has(first.type) || !triangleTypes.has(second.type)) {
    throw invalid("対応付けには異なる二つの三角形を指定してください。");
  }
  const mapping = tuple(relation.correspondence, 3);
  if (new Set(mapping).size !== 3 || !mapping.every((point) => second.vertices.includes(point))) {
    throw invalid("相似・合同の頂点対応が不正です。");
  }
  const kind = relation.kind ?? "infer";
  if (!["infer", "similar", "congruent"].includes(kind)) throw invalid("三角形の対応種別が不正です。");
  const key = mapping.map((point) => second.vertices.indexOf(point)).join("");
  const similar = property(first.id, `similar:${second.id}:${key}`);
  const congruent = property(first.id, `congruent:${second.id}:${key}`);
  const scale = property(first.id, `scale:${second.id}:${key}`);
  const one = math.parse(1);
  const vertices = first.vertices;
  const sourceSides = slots.map((i) => opposite(vertices, i));
  const targetSides = slots.map((i) => opposite(mapping, i));
  const sourceAngles = slots.map((i) => at(vertices, i));
  const targetAngles = slots.map((i) => at(mapping, i));
  const refs = [similar, congruent, scale, ...sourceSides, ...targetSides, ...sourceAngles, ...targetAngles];
  const equals = (a, b) => known([a, b]) && math.compare(a, b) === 0;
  const isTrue = (flag) => equals(flag, one);
  function proofs(values) {
    const left = values.slice(3, 6);
    const right = values.slice(6, 9);
    const a = values.slice(9, 12);
    const b = values.slice(12, 15);
    const equalSides = slots.map((i) => equals(left[i], right[i]));
    const equalAngles = slots.map((i) => equals(a[i], b[i]));
    const proportions = (i, j) => known([left[i], left[j], right[i], right[j]])
      && equals(math.mul(left[i], right[j]), math.mul(left[j], right[i]));
    const congruence = equalSides.every(Boolean)
      || slots.some((i) => {
        const j = (i + 1) % 3;
        const k = (i + 2) % 3;
        return (equalAngles[i] && equalSides[j] && equalSides[k])
          || (equalSides[i] && equalAngles[j] && equalAngles[k])
          || (equalSides[i] && (equalSides[j] || equalSides[k])
            && equals(a[i], math.parse(90)) && equals(b[i], math.parse(90)));
      });
    const similarity = congruence || equalAngles.filter(Boolean).length >= 2
      || (proportions(0, 1) && proportions(1, 2))
      || slots.some((i) => equalAngles[i] && proportions((i + 1) % 3, (i + 2) % 3));
    return { similarity, congruence, left, right, a, b };
  }
  add("三角形の合同・相似条件", refs, (v) => {
    const proof = proofs(v);
    return [...(v[0] === undefined && (proof.similarity || isTrue(v[1])) ? [[0, one]] : []),
      ...(v[1] === undefined && (proof.congruence || (isTrue(v[0]) && equals(v[2], one))) ? [[1, one]] : [])];
  }, (v) => {
    const proof = proofs(v);
    if ((proof.similarity && v[0] !== undefined && !isTrue(v[0]))
      || (proof.congruence && v[1] !== undefined && !isTrue(v[1]))) return false;
    if (isTrue(v[0]) && equals(v[2], one) && v[1] !== undefined && !isTrue(v[1])) return false;
    if (isTrue(v[0]) && slots.some((i) => known([proof.a[i], proof.b[i]]) && !equals(proof.a[i], proof.b[i]))) return false;
    return (isTrue(v[0]) && proof.similarity) || (isTrue(v[0]) && isTrue(v[1])) ? true : null;
  });
  if (kind !== "infer") constant(add, math, "宣言された相似の対応", similar, one);
  if (kind === "congruent") constant(add, math, "宣言された合同の対応", congruent, one);
  const guarded = (name, properties, derive, verify) => add(name, [similar, ...properties], ([flag, ...v]) =>
    isTrue(flag) ? derive(v).map(([i, value]) => [i + 1, value]) : [],
  ([flag, ...v]) => isTrue(flag) ? verify(v) : null);
  add("合同の相似比", [congruent, scale], ([flag, ratio]) =>
    isTrue(flag) && ratio === undefined ? [[1, one]] : [],
  ([flag, ratio]) => isTrue(flag) && ratio !== undefined ? equals(ratio, one) : null);
  for (const i of slots) {
    transfer(add, math, "相似な三角形の対応角", similar, sourceAngles[i], targetAngles[i]);
    product(guarded, math, "相似比と対応辺", targetSides[i], sourceSides[i], scale);
  }
  product(guarded, math, "相似比と周長比", property(second.id, "perimeter"), property(first.id, "perimeter"), scale);
  const areaScale = property(first.id, `areaScale:${second.id}:${key}`);
  guarded("相似比の二乗", [areaScale, scale], ([square, ratio]) => {
    if (square === undefined && ratio !== undefined) return [[0, math.pow(ratio, 2)]];
    if (ratio === undefined && square !== undefined) return [[1, math.sqrt(square)]];
    return [];
  }, (v) => known(v) ? equals(v[0], math.pow(v[1], 2)) : null);
  product(guarded, math, "相似比と面積比", property(second.id, "area"), property(first.id, "area"), areaScale);
}

export function buildTriangleRules(problem, add, math) {
  for (const object of problem.objects) if (triangleTypes.has(object.type)) triangle(add, math, object);
  for (const relation of problem.relations) {
    if (relation.type === "triangle_matches") matchTriangles(add, math, problem, relation);
    if (relation.type === "triangle_angle_bisector") {
      const object = problem.byId.get(relation.triangle);
      const apex = relation.vertex;
      const cut = relation.point;
      if (!object || !triangleTypes.has(object.type) || !object.vertices.includes(apex) || object.vertices.includes(cut)) {
        throw invalid("三角形の内角の二等分線には頂点と対辺上の点を指定してください。");
      }
      const [a, b] = object.vertices.filter((point) => point !== apex);
      const firstHalf = angle(a, apex, cut);
      const secondHalf = angle(cut, apex, b);
      const ratio = property(object.id, `bisectorScale:${apex}:${cut}`);
      equal(add, math, "三角形の内角の二等分", firstHalf, secondHalf);
      scaled(add, math, "三角形の内角の二等分", angle(a, apex, b), firstHalf, math.parse(2));
      sum(add, math, "二等分線が分ける対辺", length(a, b), [length(a, cut), length(cut, b)]);
      product(add, math, "角の二等分線と対辺の比", length(apex, a), length(apex, b), ratio);
      product(add, math, "角の二等分線と対辺の比", length(a, cut), length(cut, b), ratio);
    }
    if (relation.type === "perpendicular_bisector") {
      const [a, b] = tuple(relation.segment, 2);
      const middle = relation.midpoint;
      const point = relation.point;
      const base = length(a, b);
      const half1 = length(a, middle);
      const half2 = length(b, middle);
      constant(add, math, "垂直二等分線の方向", perpendicular(a, b, middle, point), math.parse(1));
      scaled(add, math, "垂直二等分線が分ける線分", half1, base, math.parse("1/2"));
      equal(add, math, "垂直二等分線が分ける線分", half1, half2);
      equal(add, math, "垂直二等分線上の点からの距離", length(a, point), length(b, point));
      pythagorean(add, math, "垂直二等分線と三平方", length(a, point), half1, length(middle, point));
    }
    if (relation.type !== "midsegment" && relation.type !== "parallel_in_triangle") continue;
    const object = problem.byId.get(relation.triangle);
    if (!object || !triangleTypes.has(object.type) || !object.vertices.includes(relation.vertex)) {
      throw invalid("中点連結の三角形と共通頂点を指定してください。");
    }
    const [a, b] = object.vertices.filter((point) => point !== relation.vertex);
    const [m, n] = tuple(relation.points, 2);
    if (m === n || [m, n].some((point) => object.vertices.includes(point))) throw invalid("中点の点名が重複しています。");
    if (relation.type === "parallel_in_triangle") {
      const apex = relation.vertex;
      const ratio = property(object.id, `segmentScale:${apex}:${m}:${n}`);
      const one = math.parse(1);
      add("三角形の内部の平行線", [ratio], () => [], ([value]) => value === undefined ? null : math.compare(value, one) < 0);
      constant(add, math, "三角形の内部の平行線", parallel(m, n, a, b), one);
      for (const [inner, outer] of [[length(apex, m), length(apex, a)],
        [length(apex, n), length(apex, b)], [length(m, n), length(a, b)]]) {
        product(add, math, "三角形の内部の平行線の比例", inner, outer, ratio);
      }
      sum(add, math, "辺の内分", length(apex, a), [length(apex, m), length(m, a)]);
      sum(add, math, "辺の内分", length(apex, b), [length(apex, n), length(n, b)]);
      equal(add, math, "平行線の同位角", angle(apex, a, b), angle(apex, m, n));
      equal(add, math, "平行線の同位角", angle(apex, b, a), angle(apex, n, m));
      equal(add, math, "同じ半直線の作る角", angle(a, apex, b), angle(m, apex, n));
      continue;
    }
    scaled(add, math, "中点連結定理", length(m, n), length(a, b), math.parse("1/2"));
    scaled(add, math, "線分の中点", length(relation.vertex, m), length(relation.vertex, a), math.parse("1/2"));
    scaled(add, math, "線分の中点", length(relation.vertex, n), length(relation.vertex, b), math.parse("1/2"));
    equal(add, math, "中点で等分される線分", length(relation.vertex, m), length(a, m));
    equal(add, math, "中点で等分される線分", length(relation.vertex, n), length(b, n));
    constant(add, math, "中点連結線と対辺の平行", parallel(m, n, a, b), math.parse(1));
  }
}
