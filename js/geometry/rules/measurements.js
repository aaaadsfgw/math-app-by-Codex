import { inconsistent, invalid } from "../core/errors.js";
import { vertexList } from "../core/problem.js";
import { angle, canonicalRef, length, parallel, perpendicular, property } from "../core/refs.js";
import { constant, equal, known, product, pythagorean, sum } from "../core/rule-helpers.js";
import { fixedSum, scaled, tuple } from "./relations.js";

const quadrilaterals = new Set(["quadrilateral", "parallelogram", "rectangle", "rhombus",
  "square", "trapezoid", "isosceles_trapezoid", "kite"]);
const solids = new Set(["cuboid", "cube", "prism", "pyramid", "cylinder", "cone", "sphere"]);
export const measurementTypes = new Set([...quadrilaterals, ...solids, "polygon", "regular_polygon",
  "circle", "sector", "chord", "arc"]);

export function forward(add, math, theorem, output, inputs, calculate) {
  add(theorem, [output, ...inputs], ([current, ...values]) =>
    current === undefined && known(values) ? [[0, calculate(...values)]] : [],
  ([current, ...values]) => current !== undefined && known(values)
    ? math.compare(current, calculate(...values)) === 0 : null);
}

function powerScale(add, math, name, output, input, coefficient, power) {
  add(name, [output, input], ([a, b]) => {
    if (a === undefined && b !== undefined) return [[0, math.mul(coefficient, math.pow(b, power))]];
    if (a !== undefined && b === undefined && power === 2) return [[1, math.sqrt(math.div(a, coefficient))]];
    return [];
  }, (v) => known(v) ? math.compare(v[0], math.mul(coefficient, math.pow(v[1], power))) === 0 : null);
}

function polygon(add, math, object) {
  const { vertices, type } = object;
  const p = (name) => property(object.id, name);
  const count = vertices?.length ?? object.sides;
  if (!Number.isSafeInteger(count) || count < 3 || count > 32
    || (object.sides !== undefined && object.sides !== count)) throw invalid("多角形の辺数は3〜32で指定してください。");
  const n = math.parse(count);
  const interior = math.parse((count - 2) * 180);
  const all = math.parse(360);
  const put = (name, ref, value) => constant(add, math, name, ref, value);
  put("多角形の辺数", p("sides"), n);
  put("多角形の内角和", p("interiorSum"), interior);
  put("多角形の対角線本数", p("diagonalCount"), math.parse(count * (count - 3) / 2));
  put("多角形の三角形分割数", p("triangleCount"), math.parse(count - 2));
  if (type === "regular_polygon" || object.convex === true || quadrilaterals.has(type) && type !== "quadrilateral" && type !== "kite") {
    put("凸多角形の外角和", p("exteriorSum"), all);
  }
  if (type === "regular_polygon") {
    put("正多角形の内角", p("interiorAngle"), math.div(interior, n));
    put("正多角形の外角", p("exteriorAngle"), math.div(all, n));
    scaled(add, math, "正多角形の周長", p("perimeter"), p("side"), n);
    product(add, math, "正多角形の面積", p("doubleArea"), p("perimeter"), p("apothem"));
    scaled(add, math, "正多角形の面積", p("area"), p("doubleArea"), math.parse("1/2"));
    const apothemFactor = new Map([[3, "sqrt(3)/6"], [4, "1/2"], [6, "sqrt(3)/2"]]).get(count);
    if (apothemFactor) scaled(add, math, "正多角形の中心から辺までの距離", p("apothem"), p("side"), math.parse(apothemFactor));
  }
  if (!vertices) return;
  const edges = vertices.map((point, index) => length(point, vertices[(index + 1) % count]));
  const angles = vertices.map((point, index) => angle(vertices[(index + count - 1) % count], point, vertices[(index + 1) % count]));
  sum(add, math, "多角形の周長", p("perimeter"), edges);
  add("多角形の最長辺は残りの辺の和より短い", [p("perimeter"), ...edges], () => [], ([perimeter, ...sides]) => {
    if (perimeter === undefined) return null;
    return sides.some((side) => side !== undefined
      && math.compare(math.mul(side, math.parse(2)), perimeter) >= 0) ? false : null;
  });
  if (type === "regular_polygon") {
    for (const edge of edges) equal(add, math, "正多角形の等辺", p("side"), edge);
    for (const vertex of angles) equal(add, math, "正多角形の等角", p("interiorAngle"), vertex);
  } else if (object.convex === true || quadrilaterals.has(type) && !["quadrilateral", "kite"].includes(type)) {
    fixedSum(add, math, "凸多角形の内角和", angles, interior);
  }
}

function quadrilateral(add, math, object) {
  const vertices = vertexList(object, 4);
  const [a, b, c, d] = vertices;
  const p = (name) => property(object.id, name);
  const edge = (i) => length(vertices[i], vertices[(i + 1) % 4]);
  const corner = (i) => angle(vertices[(i + 3) % 4], vertices[i], vertices[(i + 1) % 4]);
  const { type } = object;
  const put = (name, ref, value) => constant(add, math, name, ref, math.parse(value));
  const eq = (name, first, second) => equal(add, math, name, first, second);
  const firstDiagonal = length(a, c);
  const secondDiagonal = length(b, d);
  const parallelogram = ["parallelogram", "rectangle", "rhombus", "square"].includes(type);
  const right = ["rectangle", "square"].includes(type);
  const equalSides = ["rhombus", "square"].includes(type);
  const orthogonal = equalSides || type === "kite";
  const trapezoid = ["trapezoid", "isosceles_trapezoid"].includes(type);
  const half = math.parse("1/2");
  polygon(add, math, object);
  eq("対角線 AC", p("diagonal1"), firstDiagonal);
  eq("対角線 BD", p("diagonal2"), secondDiagonal);
  if (parallelogram || trapezoid) put("平行な底辺", parallel(a, b, c, d), 1);
  if (parallelogram) {
    put("平行四辺形の対辺", parallel(b, c, d, a), 1);
    for (const i of [0, 1]) {
      eq("平行四辺形の対辺", edge(i), edge(i + 2));
      eq("平行四辺形の対角", corner(i), corner(i + 2));
      fixedSum(add, math, "平行四辺形の隣接角", [corner(i), corner(i + 1)], math.parse(180));
    }
    eq("平行四辺形の底辺", p("base"), edge(0));
    product(add, math, "平行四辺形の面積", p("area"), p("base"), p("height"));
    add("平行四辺形の高さの上限", [p("height"), edge(1)], () => [],
      (v) => known(v) ? math.compare(v[0], v[1]) <= 0 : null);
  }
  if (right) {
    for (const i of [0, 1, 2, 3]) {
      put("長方形の内角", corner(i), 90);
      const [x, y, z] = [vertices[(i + 3) % 4], vertices[i], vertices[(i + 1) % 4]];
      put("長方形の隣辺", perpendicular(x, y, y, z), 1);
    }
    eq("長方形の幅", p("width"), edge(0));
    eq("長方形の高さ", p("height"), edge(1));
    eq("長方形の対角線", firstDiagonal, secondDiagonal);
    pythagorean(add, math, "長方形の対角線", firstDiagonal, edge(0), edge(1));
  }
  if (equalSides) {
    for (const i of [0, 1, 2, 3]) eq("四つの辺の等しさ", p("side"), edge(i));
  }
  if (type === "kite") {
    eq("凧形の隣接辺", edge(0), edge(3));
    eq("凧形の隣接辺", edge(1), edge(2));
    eq("凧形の対角", corner(1), corner(3));
  }
  if (orthogonal) {
    put("対角線の直交", perpendicular(a, c, b, d), 1);
    product(add, math, "直交する対角線", p("doubleArea"), firstDiagonal, secondDiagonal);
    scaled(add, math, "直交する対角線の面積", p("area"), p("doubleArea"), half);
  }
  if (equalSides) {
    const [half1, half2] = [p("halfDiagonal1"), p("halfDiagonal2")];
    scaled(add, math, "ひし形の対角線の二等分", half1, firstDiagonal, half);
    scaled(add, math, "ひし形の対角線の二等分", half2, secondDiagonal, half);
    pythagorean(add, math, "ひし形の辺と対角線", p("side"), half1, half2);
  }
  for (const [diagonal, left, right] of [[firstDiagonal, edge(0), edge(1)], [firstDiagonal, edge(2), edge(3)],
    [secondDiagonal, edge(0), edge(3)], [secondDiagonal, edge(1), edge(2)]]) {
    add("対角線で分けた三角形の成立条件", [diagonal, left, right], () => [],
      (values) => known(values) ? values.every((value, index) =>
        math.compare(value, math.add(values[(index + 1) % 3], values[(index + 2) % 3])) < 0) : null);
  }
  if (object.diagonalIntersection !== undefined) {
    if (!parallelogram && type !== "kite") throw invalid("この図形では対角線の交点を定義できません。");
    const m = object.diagonalIntersection;
    if (vertices.includes(m)) throw invalid("対角線の交点は頂点と異なる必要があります。");
    for (const [u, v] of parallelogram ? [[a, c], [b, d]] : [[b, d]]) {
      eq("対角線の二等分", length(u, m), length(m, v));
      scaled(add, math, "対角線の二等分", length(u, m), length(u, v), half);
    }
  }
  if (trapezoid) {
    eq("台形の底辺", p("base1"), edge(0));
    eq("台形の底辺", p("base2"), edge(2));
    sum(add, math, "台形の底辺の和", p("baseSum"), [edge(0), edge(2)]);
    product(add, math, "台形の底辺と高さ", p("doubleArea"), p("baseSum"), p("height"));
    scaled(add, math, "台形の面積", p("area"), p("doubleArea"), half);
    for (const [i, j] of [[0, 3], [1, 2]]) {
      fixedSum(add, math, "台形の同側内角", [corner(i), corner(j)], math.parse(180));
    }
    for (const leg of [edge(1), edge(3)]) {
      add("台形の高さの上限", [p("height"), leg], () => [], (v) =>
        known(v) ? math.compare(v[0], v[1]) <= 0 : null);
    }
  }
  if (type === "isosceles_trapezoid") {
    eq("等脚台形の脚", edge(1), edge(3));
    eq("等脚台形の下底角", corner(0), corner(1));
    eq("等脚台形の上底角", corner(2), corner(3));
    eq("等脚台形の対角線", firstDiagonal, secondDiagonal);
  }
}

function bindCircle(problem, add, math, object) {
  if (object.circle === undefined) return undefined;
  const circle = problem.byId.get(object.circle);
  if (!circle || circle.type !== "circle") throw invalid("参照先に円を指定してください。");
  if (object.type !== "arc") equal(add, math, "同じ円の半径", property(object.id, "radius"), property(circle.id, "radius"));
  return circle;
}

function circular(add, math, problem, object) {
  const p = (name) => property(object.id, name);
  const r = p("radius");
  const half = math.parse("1/2");
  const two = math.parse(2);
  const circle = bindCircle(problem, add, math, object);
  if (object.type === "circle") {
    scaled(add, math, "円の直径", p("diameter"), r, two);
    scaled(add, math, "円周", p("circumference"), p("diameter"), math.pi);
    powerScale(add, math, "円の面積", p("area"), r, math.pi, 2);
  } else if (object.type === "sector") {
    add("扇形の中心角は360度未満", [p("centerAngle")], () => [], ([value]) =>
      value === undefined ? null : math.compare(value, math.parse(360)) < 0);
    scaled(add, math, "扇形の角度の割合", p("angleFraction"), p("centerAngle"), math.parse("1/360"));
    scaled(add, math, "円周", p("fullCircumference"), r, math.mul(two, math.pi));
    product(add, math, "扇形の弧長", p("arcLength"), p("fullCircumference"), p("angleFraction"));
    powerScale(add, math, "円の面積", p("fullArea"), r, math.pi, 2);
    product(add, math, "扇形の面積", p("area"), p("fullArea"), p("angleFraction"));
    product(add, math, "弧長と半径", p("doubleArea"), p("arcLength"), r);
    scaled(add, math, "扇形の面積", p("area"), p("doubleArea"), half);
    scaled(add, math, "扇形の2本の半径", p("doubleRadius"), r, two);
    sum(add, math, "扇形の周長", p("perimeter"), [p("arcLength"), p("doubleRadius")]);
  } else if (object.type === "chord") {
    const [a, b] = vertexList(object, 2);
    const chord = length(a, b);
    equal(add, math, "弦の長さ", p("length"), chord);
    scaled(add, math, "中心から弦への垂線", p("halfLength"), chord, half);
    // A diameter is the zero-distance case of the same squared identity.
    const d = p("centerDistance");
    const l = p("halfLength");
    const zero = math.parse(0);
    add("弦の三平方", [r, d, l], ([radius, distance, halfChord]) => {
      if (radius === undefined && known([distance, halfChord])) {
        return [[0, math.sqrt(math.add(math.pow(distance, 2), math.pow(halfChord, 2)))]];
      }
      if (radius === undefined || (distance === undefined) === (halfChord === undefined)) return [];
      const square = math.sub(math.pow(radius, 2), math.pow(distance ?? halfChord, 2));
      if (math.compare(square, zero) < 0) throw inconsistent("弦の半分や中心距離は半径を超えません。");
      return [[distance === undefined ? 1 : 2, math.sqrt(square)]];
    }, ([radius, distance, halfChord]) => known([radius, distance, halfChord])
      ? math.compare(math.pow(radius, 2), math.add(math.pow(distance, 2), math.pow(halfChord, 2))) === 0 : null);
    if (object.midpoint !== undefined) {
      const m = object.midpoint;
      for (const point of [a, b]) equal(add, math, "弦の中点", length(point, m), l);
      if (circle?.center !== undefined) {
        if (circle.center === m) constant(add, math, "中心を通る弦", d, zero);
        else {
          equal(add, math, "中心から弦への距離", length(circle.center, m), d);
          constant(add, math, "中心から弦への垂線", perpendicular(circle.center, m, a, b), math.parse(1));
        }
      }
    }
  } else if (object.type === "arc") {
    vertexList(object, 2);
    if (!circle) throw invalid("円弧の円を指定してください。");
    add("円弧の中心角は360度未満", [p("centralAngle")], () => [], ([value]) =>
      value === undefined ? null : math.compare(value, math.parse(360)) < 0);
  }
}

function solid(problem, add, math, object) {
  const p = (name) => property(object.id, name);
  const [one, two, three, four] = [1, 2, 3, 4].map(math.parse);
  const volume = p("volume");
  const base = p("baseArea");
  const height = p("height");
  const radius = p("radius");
  const surface = p("surfaceArea");
  const lateral = p("lateralArea");
  const circumference = p("basePerimeter");
  const type = object.type;
  if (object.base !== undefined) {
    const baseShape = problem.byId.get(object.base);
    if (!["prism", "pyramid"].includes(type) || !baseShape
      || !["triangle", "isosceles_triangle", "equilateral_triangle", "right_triangle",
        "polygon", "regular_polygon", ...quadrilaterals].includes(baseShape.type)) {
      throw invalid("角柱・角錐の底面に平面多角形を指定してください。");
    }
    equal(add, math, "底面の図形の面積", base, property(baseShape.id, "area"));
    if (type === "prism") equal(add, math, "底面の図形の周長", circumference, property(baseShape.id, "perimeter"));
  }
  if (type === "sphere") {
    powerScale(add, math, "球の表面積", surface, radius, math.mul(four, math.pi), 2);
    powerScale(add, math, "球の体積", volume, radius, math.mul(math.div(four, three), math.pi), 3);
    scaled(add, math, "球の直径", p("diameter"), radius, two);
    return;
  }
  if (["cube", "cuboid"].includes(type)) {
    const lengthRef = p("length");
    const width = p("width");
    product(add, math, "直方体の底面積", base, lengthRef, width);
    forward(add, math, "直方体の底面周長", circumference, [lengthRef, width], (a, b) => math.mul(two, math.add(a, b)));
    pythagorean(add, math, "直方体の底面対角線", p("baseDiagonal"), lengthRef, width);
    pythagorean(add, math, "直方体の空間対角線", p("diagonal"), p("baseDiagonal"), height);
    if (type === "cube") {
      const side = p("side");
      for (const dimension of [lengthRef, width, height]) equal(add, math, "立方体の等しい辺", side, dimension);
      powerScale(add, math, "立方体の表面積", surface, side, math.parse(6), 2);
      powerScale(add, math, "立方体の底面積", base, side, one, 2);
    }
  }
  if (type === "cylinder" || type === "cone") {
    powerScale(add, math, "円形の底面積", base, radius, math.pi, 2);
    scaled(add, math, "円形の底面周長", circumference, radius, math.mul(two, math.pi));
  }
  if (type === "cone" || type === "pyramid") {
    product(add, math, "底面積と高さ", p("tripleVolume"), base, height);
    scaled(add, math, "錐体の体積", p("tripleVolume"), volume, three);
    sum(add, math, "錐体の表面積", surface, [base, lateral]);
    if (type === "cone") {
      pythagorean(add, math, "円錐の母線", p("slantHeight"), radius, height);
      scaled(add, math, "円錐の底面周長の半分", p("halfBasePerimeter"), circumference, math.parse("1/2"));
      product(add, math, "円錐の側面積", lateral, p("halfBasePerimeter"), p("slantHeight"));
    }
  } else {
    product(add, math, "柱体の体積", volume, base, height);
    product(add, math, "直柱体の側面積", lateral, circumference, height);
    scaled(add, math, "柱体の上下の底面", p("doubleBaseArea"), base, two);
    sum(add, math, "柱体の表面積", surface, [p("doubleBaseArea"), lateral]);
  }
}

export function buildMeasurementRules(problem, add, math) {
  for (const object of problem.objects) {
    if (quadrilaterals.has(object.type)) quadrilateral(add, math, object);
    else if (["polygon", "regular_polygon"].includes(object.type)) polygon(add, math, object);
    else if (solids.has(object.type)) solid(problem, add, math, object);
    else if (measurementTypes.has(object.type)) circular(add, math, problem, object);
  }
  for (const relation of problem.relations) {
    if (relation.type === "inscribed_angle") {
      const arc = problem.byId.get(relation.arc);
      if (arc?.type !== "arc") throw invalid("円周角には見込む円弧を指定してください。");
      const [a, b] = arc.vertices;
      scaled(add, math, "円周角の定理", angle(a, relation.point, b),
        property(arc.id, "centralAngle"), math.parse("1/2"));
    } else if (relation.type === "cyclic_quadrilateral") {
      const object = problem.byId.get(relation.quadrilateral);
      if (!object || !quadrilaterals.has(object.type)) throw invalid("内接四角形が存在しません。");
      const [a, b, c, d] = object.vertices;
      for (const pair of [[angle(d, a, b), angle(b, c, d)], [angle(a, b, c), angle(c, d, a)]]) {
        fixedSum(add, math, "内接四角形の対角", pair, math.parse(180));
      }
    } else if (relation.type === "tangent") {
      const circle = problem.byId.get(relation.circle);
      if (circle?.type !== "circle" || !circle.center) throw invalid("接線には中心を明示した円を指定してください。");
      const { point, external } = relation;
      const radius = length(circle.center, point);
      equal(add, math, "接点までの半径", radius, property(circle.id, "radius"));
      constant(add, math, "接点における半径と接線の垂直", perpendicular(circle.center, point, point, external), math.parse(1));
      pythagorean(add, math, "円の外部点からの接線", length(circle.center, external), radius, length(point, external));
      for (const other of problem.relations) {
        if (other.type === "tangent" && other.circle === relation.circle && other.external === external
          && typeof other.point === "string" && point < other.point) {
          equal(add, math, "同一外部点から引いた接線の長さ", length(point, external), length(other.point, external));
        }
      }
    } else if (relation.type === "similar_solids") {
      const first = problem.byId.get(relation.first);
      const second = problem.byId.get(relation.second);
      if (!first || !second || first === second || first.type !== second.type || !solids.has(first.type)) {
        throw invalid("相似な立体には同種の異なる立体を指定してください。");
      }
      const left = (name) => property(first.id, name);
      const right = (name) => property(second.id, name);
      const scale = left(`solidScale:${second.id}`);
      for (const dimension of first.type === "sphere" ? ["radius"]
        : ["cylinder", "cone"].includes(first.type) ? ["radius", "height"]
          : first.type === "cube" ? ["side"] : first.type === "cuboid" ? ["length", "width", "height"] : ["height"]) {
        product(add, math, "相似な立体の長さ", right(dimension), left(dimension), scale);
      }
      for (const [measure, exponent] of [["surfaceArea", 2], ["volume", 3]]) {
        const ratio = left(`${measure}Scale:${second.id}`);
        powerScale(add, math, "立体の相似比のべき乗", ratio, scale, math.parse(1), exponent);
        product(add, math, "相似な立体の面積比・体積比", right(measure), left(measure), ratio);
      }
    } else if (relation.type === "composite_measure") {
      const { operation, topology } = relation;
      if (!Array.isArray(relation.parts) || relation.parts.length < 2 || relation.parts.length > 16
        || !(operation === "sum" && topology === "disjoint" || operation === "difference" && topology === "contained")) {
        throw invalid("複合図形には重ならない加算領域、または包含する差分領域を指定してください。");
      }
      const [total, ...parts] = [relation.total, ...relation.parts].map(canonicalRef);
      const quantity = total.split(":")[2];
      if (!["area", "volume"].includes(quantity)
        || new Set([total, ...parts]).size !== parts.length + 1
        || [total, ...parts].some((ref) => {
          const [kind, id, field, extra] = ref.split(":");
          return kind !== "shape" || !problem.byId.has(id) || field !== quantity || extra !== undefined;
        })) throw invalid("複合図形の面積・体積の参照が不正です。");
      const [whole, ...removed] = parts;
      if (operation === "sum") sum(add, math, "複合図形の加算", total, parts);
      else sum(add, math, "複合図形の差", whole, [total, ...removed]);
    }
  }
}
