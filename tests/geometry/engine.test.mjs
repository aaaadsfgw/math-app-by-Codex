import assert from "node:assert/strict";
import test from "node:test";
import {
  angle as a, coordinate as c, createMathAdapter, length as l, parallel, perpendicular,
  property as p, solveGeometryProblem as solve,
} from "../../js/geometry/index.js";

const shape = (id, type, vertices, extra = {}) => ({ id, type, vertices, ...extra });
const problem = (objects, givens, goals, relations = []) =>
  ({ type: "geometry", objects, givens: givens.map(([ref, value]) => ({ ref, value })), goals, relations });
const triangle = shape("T", "triangle", ["A", "B", "C"]);
const right = shape("T", "right_triangle", ["A", "B", "C"], { rightAngleAt: "C" });
const square = shape("Q", "square", ["A", "B", "C", "D"]);
const q = (type, extra) => shape("Q", type, ["A", "B", "C", "D"], extra);
const obj = (type, extra) => shape("F", type, undefined, extra);
const f = (name) => p("F", name);
const t = (name) => p("T", name);
const ab = l("A", "B");
const ac = l("A", "C");
const bc = l("B", "C");
const ad = l("A", "D");
const cd = l("C", "D");
const bd = l("B", "D");
const A = a("B", "A", "C");
const B = a("A", "B", "C");
const C = a("A", "C", "B");
const pair = (type, first, second) => ({ type, angles: [first, second] });
const points = (data) => data.flatMap(([point, x, y]) => [[c(point, "x"), x], [c(point, "y"), y]]);
const rows = [];
function ok(name, objects, givens, goals, expected, relations = []) {
  rows.push({ name, input: problem(objects, givens, goals, relations), status: "solved", expected });
}
function fail(name, status, objects, givens, goals, relations = []) {
  rows.push({ name, status, input: problem(objects, givens, goals, relations) });
}

for (const [u, v, other] of [[60, 60, 60], [30, 60, 90], [90, 45, 45], [110, 20, 50],
  ["1/2", "99/2", 130], [1, 1, 178], ["179/2", "179/2", 1], [60.5, 49.5, 70]]) {
  for (const [i, j, k] of [[A, B, C], [B, C, A], [C, A, B]]) {
    ok(`角度和 ${u}+${v}, ${k}`, [triangle], [[i, u], [j, v]], [k], [other]);
  }
}

for (const [leg, other, hyp] of [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25],
  ["3/2", 2, "5/2"], [1, 1, "√2"], [2, 3, "√13"], [6, 8, 10]]) {
  ok(`斜辺 ${leg},${other}`, [right], [[ac, leg], [bc, other]], [ab], [hyp]);
  ok(`直角辺 ${hyp},${leg}`, [right], [[ab, hyp], [ac, leg]], [bc], [other]);
  ok(`三平方の逆 ${leg},${other},${hyp}`, [triangle], [[ac, leg], [bc, other], [ab, hyp]], [C], [90]);
}
ok("30度の対辺", [right], [[A, 30], [ab, 10]], [bc, ac], [5, "5*√3"]);
ok("45度の直角三角形", [right], [[A, 45], [bc, 2]], [ab, ac], ["2*√2", 2]);
ok("三角形面積から高さ", [triangle], [[ab, 8], [t("area"), 20]], [t("height:A:B")], [5]);
ok("三角形面積から底辺", [triangle], [[t("height:A:B"), 5], [t("area"), 20]], [ab], [8]);
ok("正三角形面積と角度", [shape("T", "equilateral_triangle", ["A", "B", "C"])], [[ab, 2]], [t("area"), C], ["√3", 60]);
ok("二等辺三角形の高さ", [shape("T", "isosceles_triangle", ["A", "B", "C"], { apex: "A" })],
  [[ab, 5], [bc, 6]], [ac, t("height:B:C"), t("area")], [5, 4, 12]);
ok("ヘロンの公式", [triangle], [[ab, 13], [ac, 14], [bc, 15]], [t("area")], [84]);
ok("ヘロンの根号", [triangle], [[ab, 2], [ac, 2], [bc, 3]], [t("area")], ["3/4*√7"]);
ok("底角から等辺", [triangle], [[B, 50], [C, 50], [ab, 7]], [A, ac], [80, 7]);
ok("等辺から底角", [triangle], [[ab, 7], [ac, 7], [C, 50]], [A, B], [80, 50]);

for (const [type, u, v] of [["equal_angles", 27, 27], ["vertical_angles", 133, 133],
  ["supplementary", 65, 115], ["complementary", 17, 73]]) {
  ok(type, [], [[a("A", "O", "B"), u]], [a("C", "O", "D")], [v],
    [pair(type, ["A", "O", "B"], ["C", "O", "D"])]);
}
const lines = [["A", "B"], ["C", "D"]];
for (const position of ["alternate", "corresponding", "same_side"]) {
  const first = a("A", "E", "F");
  const second = a("E", "F", "D");
  const transversal = { type: "parallel_transversal", lines, position, angles: [["A", "E", "F"], ["E", "F", "D"]] };
  const expected = position === "same_side" ? 115 : 65;
  ok(`平行線の角 ${position}`, [], [[first, 65]], [second], [expected],
    [{ type: "parallel", lines }, transversal]);
  ok(`角から平行 ${position}`, [], [[first, 65], [second, expected]], [parallel("A", "B", "C", "D")], [1], [transversal]);
}
ok("二等分線", [], [[a("A", "O", "B"), 70]], [a("M", "O", "B")], [35],
  [{ type: "angle_bisector", angles: [["A", "O", "B"], ["A", "O", "M"], ["M", "O", "B"]] }]);
ok("外角と隣接内角", [triangle], [[B, 40], [C, 60]], [a("D", "A", "B"), A], [100, 80],
  [{ type: "exterior_angle", angles: [["D", "A", "B"], ["C", "A", "B"], ["A", "B", "C"], ["A", "C", "B"]] }]);

for (const n of [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 16, 18, 20, 24, 30, 32]) {
  ok(`一般の${n}角形`, [obj("polygon", { sides: n })], [],
    [f("interiorSum"), f("diagonalCount"), f("triangleCount")], [(n - 2) * 180, n * (n - 3) / 2, n - 2]);
  ok(`正${n}角形の外角と周長`, [obj("regular_polygon", { sides: n })], [[f("side"), "3/2"]],
    [f("exteriorAngle"), f("perimeter")],
    [createMathAdapter().format(createMathAdapter().parse(`360/${n}`)),
      createMathAdapter().format(createMathAdapter().parse(`3*${n}/2`))]);
}

ok("正方形 面積と対角線", [square], [[ab, 3]], [p("Q", "area"), ac, p("Q", "perimeter")], [9, "3*√2", 12]);
ok("長方形 対角線から幅", [q("rectangle")], [[ac, 13], [bc, 5]], [ab, bd, p("Q", "area")], [12, 13, 60]);
ok("平行四辺形 角度と周長", [q("parallelogram")], [[ab, 6], [bc, 4], [a("D", "A", "B"), 70]],
  [cd, ad, a("A", "B", "C"), p("Q", "perimeter")], [6, 4, 110, 20]);
ok("平行四辺形 対角線交点", [q("parallelogram", { diagonalIntersection: "O" })], [[ac, 10], [bd, 14]],
  [l("A", "O"), l("C", "O"), l("B", "O"), l("D", "O")], [5, 5, 7, 7]);
ok("ひし形 面積と直交", [q("rhombus")], [[ac, 8], [bd, 6]], [p("Q", "area"), perpendicular("A", "C", "B", "D")], [24, 1]);
ok("ひし形の対角線から辺", [q("rhombus")], [[ac, 8], [bd, 6]], [ab], [5]);
ok("凧形 面積と等しい隣辺", [q("kite")], [[ab, 7], [bc, 5], [ac, 10], [bd, 6]], [ad, cd, p("Q", "area")], [7, 5, 30]);
ok("台形 面積から高さ", [q("trapezoid")], [[ab, 10], [cd, 6], [p("Q", "area"), 40]], [p("Q", "height")], [5]);
ok("等脚台形 底角と対角線", [q("isosceles_trapezoid")], [[a("D", "A", "B"), 65], [ac, 9]],
  [a("A", "B", "C"), a("B", "C", "D"), bd], [65, 115, 9]);
ok("正多角形 周長と内接円半径から面積", [obj("regular_polygon", { sides: 6 })],
  [[f("side"), 4], [f("apothem"), "2*sqrt(3)"]], [f("area")], ["24*√3"]);

for (const [r, circumference, area] of [[1, "2*π", "π"], [2, "4*π", "4*π"], [3, "6*π", "9*π"],
  [5, "10*π", "25*π"], [8, "16*π", "64*π"], ["1/2", "π", "1/4*π"]]) {
  ok(`円の正算 ${r}`, [obj("circle")], [[f("radius"), r]], [f("circumference"), f("area")], [circumference, area]);
  ok(`面積から半径 ${r}`, [obj("circle")], [[f("area"), area]], [f("radius")], [r]);
  ok(`円周から半径 ${r}`, [obj("circle")], [[f("circumference"), circumference]], [f("radius")], [r]);
}
ok("扇形の弧長と面積", [obj("sector")], [[f("radius"), 6], [f("centerAngle"), 60]],
  [f("arcLength"), f("area"), f("perimeter")], ["2*π", "6*π", "12+2*π"]);
ok("扇形 面積と弧長から半径", [obj("sector")], [[f("arcLength"), "2*pi"], [f("area"), "6*pi"]],
  [f("radius"), f("centerAngle")], [6, 60]);
ok("扇形 円の半径を共有", [shape("O", "circle"), obj("sector", { circle: "O" })],
  [[p("O", "diameter"), 8], [f("centerAngle"), 90]], [f("arcLength")], ["2*π"]);
ok("弦の長さと中点", [shape("O", "circle", undefined, { center: "O" }),
  shape("F", "chord", ["A", "B"], { circle: "O", midpoint: "M" })],
[[p("O", "radius"), 5], [f("centerDistance"), 3]], [ab, l("A", "M"), l("M", "O")], [8, 4, 3]);
ok("直径を弦として逆算", [shape("F", "chord", ["A", "B"])], [[f("radius"), 6], [ab, 12]],
  [f("centerDistance")], [0]);
const circle = shape("O", "circle", undefined, { center: "O" });
const arc = shape("ARC", "arc", ["A", "C"], { circle: "O" });
for (const [central, inscribed] of [[20, 10], [90, 45], [180, 90], [230, 115], [300, 150]]) {
  ok(`円周角 ${central}`, [circle, arc], [[p("ARC", "centralAngle"), central]], [B], [inscribed],
    [{ type: "inscribed_angle", arc: "ARC", point: "B" }]);
}
ok("同じ弧の円周角", [circle, arc], [[B, 55]], [a("A", "D", "C"), p("ARC", "centralAngle")], [55, 110],
  [{ type: "inscribed_angle", arc: "ARC", point: "B" }, { type: "inscribed_angle", arc: "ARC", point: "D" }]);
ok("内接四角形 対角", [q("quadrilateral")], [[a("D", "A", "B"), 105]], [a("B", "C", "D")], [75],
  [{ type: "cyclic_quadrilateral", quadrilateral: "Q" }]);
ok("外部の1点からの接線", [circle], [[p("O", "radius"), 5], [l("O", "P"), 13]],
  [l("A", "P"), l("B", "P"), perpendicular("O", "A", "A", "P")], [12, 12, 1],
  [{ type: "tangent", circle: "O", point: "A", external: "P" }, { type: "tangent", circle: "O", point: "B", external: "P" }]);

const otherTriangle = shape("U", "triangle", ["D", "E", "F"]);
const match = (kind = "infer", correspondence = ["D", "E", "F"]) =>
  ({ type: "triangle_matches", first: "T", second: "U", correspondence, kind });
const de = l("D", "E");
const ef = l("E", "F");
const df = l("D", "F");
const D = a("E", "D", "F");
const E = a("D", "E", "F");
const F = a("D", "F", "E");
ok("相似から対応辺", [triangle, otherTriangle], [[ab, 6], [de, 9], [bc, 8]], [ef], [12], [match("similar")]);
ok("対応の順序を明示", [triangle, otherTriangle], [[ab, 6], [ef, 9], [bc, 8]], [df], [12], [match("similar", ["E", "F", "D"])]);
ok("相似比を二乗して面積", [triangle, otherTriangle], [[ab, 2], [de, 6], [t("area"), 5]],
  [p("U", "area")], [45], [match("similar")]);
ok("面積比から相似比と長さ", [triangle, otherTriangle], [[t("area"), 5], [p("U", "area"), 45], [ab, 2]],
  [de], [6], [match("similar")]);
ok("合同 SSS", [triangle, otherTriangle], [[ab, 5], [ac, 4], [bc, 3], [de, 5], [df, 4], [ef, 3]],
  [F, p("T", "congruent:U:012")], [90, 1], [match()]);
ok("合同 SAS", [triangle, otherTriangle], [[ab, 3], [ac, 4], [de, 3], [df, 4], [A, 90], [D, 90], [bc, 5]],
  [ef, p("T", "congruent:U:012")], [5, 1], [match()]);
ok("合同 ASA", [triangle, otherTriangle], [[ab, 5], [de, 5], [A, 60], [D, 60], [B, 60], [E, 60]],
  [F, p("T", "congruent:U:012")], [60, 1], [match()]);
ok("直角三角形の合同 HL", [right, shape("U", "right_triangle", ["D", "E", "F"], { rightAngleAt: "F" })],
  [[ab, 13], [ac, 5], [de, 13], [df, 5]], [ef, p("T", "congruent:U:012")], [12, 1], [match()]);
ok("相似 AA", [triangle, otherTriangle], [[A, 30], [D, 30], [B, 60], [E, 60], [ab, 4], [de, 6], [bc, 2]],
  [ef, F], [3, 90], [match()]);
ok("相似 SAS", [triangle, otherTriangle], [[ab, 6], [ac, 8], [de, 3], [df, 4], [A, 90], [D, 90]],
  [ef, p("T", "similar:U:012")], [5, 1], [match()]);
ok("相似 SSS", [triangle, otherTriangle], [[ab, 10], [ac, 8], [bc, 6], [de, 5], [df, 4], [ef, 3]],
  [F, p("T", "similar:U:012")], [90, 1], [match()]);
ok("中点連結定理", [triangle], [[bc, 10], [ab, 12], [ac, 14]],
  [l("M", "N"), l("A", "M"), l("A", "N"), parallel("M", "N", "B", "C")], [5, 6, 7, 1],
  [{ type: "midsegment", triangle: "T", vertex: "A", points: ["M", "N"] }]);
ok("三角形内部の平行線から比・内分・角", [triangle], [[ab, 8], [ac, 6], [bc, 10], [l("A", "M"), 2]],
  [l("M", "N"), l("A", "N"), l("M", "B"), a("M", "A", "N")], ["5/2", "3/2", 6, 90],
  [{ type: "parallel_in_triangle", triangle: "T", vertex: "A", points: ["M", "N"] }]);
ok("三角形の角の二等分線から対辺の比", [triangle], [[ab, 6], [ac, 9], [l("M", "C"), 6]],
  [l("B", "M"), bc], [4, 10], [{ type: "triangle_angle_bisector", triangle: "T", vertex: "A", point: "M" }]);
ok("垂直二等分線上の点と三平方", [], [[ab, 6], [l("M", "P"), 4]],
  [l("A", "P"), l("B", "P"), perpendicular("A", "B", "M", "P")], [5, 5, 1],
  [{ type: "perpendicular_bisector", segment: ["A", "B"], midpoint: "M", point: "P" }]);

ok("座標で距離・直角・面積", [triangle], points([["A", -1, -1], ["B", 2, -1], ["C", -1, 3]]),
  [ab, ac, bc, A, t("area")], [3, 4, 5, 90, 6]);
ok("座標で凹四角形の面積", [shape("F", "coordinate_polygon", ["A", "B", "C", "D"])],
  points([["A", 0, 0], ["B", 4, 0], ["C", 1, 1], ["D", 0, 4]]), [f("area")], [4]);
ok("中点の分数座標", [], points([["A", -1, 3], ["B", 2, -4]]), [c("M", "x"), c("M", "y")], ["1/2", "-1/2"],
  [{ type: "midpoint", point: "M", segment: ["A", "B"] }]);
const line = shape("F", "line", ["A", "B"]);
ok("直線の傾きと切片", [line], points([["A", 1, 3], ["B", 3, 7]]),
  [f("slope"), f("xIntercept"), f("yIntercept"), f("lineA"), f("lineB"), f("lineC")], [2, "-1/2", 1, 1, "-1/2", "-1/2"]);
ok("鉛直線の方程式とx切片", [line], points([["A", -2, 3], ["B", -2, 7]]),
  [f("lineA"), f("lineB"), f("lineC"), f("xIntercept")], [1, 0, -2, -2]);
ok("水平線の方程式とy切片", [line], points([["A", -2, 3], ["B", 8, 3]]),
  [f("lineA"), f("lineB"), f("lineC"), f("yIntercept")], [0, 1, 3, 3]);
ok("座標で垂直", [], points([["A", 0, 0], ["B", 3, 4], ["C", 1, 1], ["D", -3, 4]]),
  [parallel("A", "B", "C", "D"), perpendicular("A", "B", "C", "D")], [0, 1], [{ type: "line_pair", lines }]);
ok("二直線の交点を連立方程式で厳密に求める", [line, shape("G", "line", ["C", "D"])],
  points([["A", 0, 0], ["B", 1, 1], ["C", 0, 1], ["D", 1, 0]]),
  [c("P", "x"), c("P", "y")], ["1/2", "1/2"], [{ type: "line_intersection", lines: ["F", "G"], point: "P" }]);
for (const [operation, extra, expected] of [
  ["translate", { offset: ["3/2", -4] }, ["7/2", -7]],
  ["rotate", { degrees: 0 }, [2, -3]], ["rotate", { degrees: 90 }, [3, 2]],
  ["rotate", { degrees: 180 }, [-2, 3]], ["rotate", { degrees: 270 }, [-3, -2]],
  ["reflect", { axis: "x" }, [2, 3]], ["reflect", { axis: "y" }, [-2, -3]],
  ["reflect", { axis: "origin" }, [-2, 3]], ["reflect", { axis: "y=x" }, [-3, 2]],
]) {
  ok(`座標の移動 ${operation} ${JSON.stringify(extra)}`, [], points([["A", 2, -3]]),
    [c("B", "x"), c("B", "y")], expected, [{ type: "transform", from: "A", to: "B", operation, ...extra }]);
}

ok("直方体の体積・表面積・空間対角線", [obj("cuboid")], [[f("length"), 3], [f("width"), 4], [f("height"), 12]],
  [f("volume"), f("surfaceArea"), f("diagonal")], [144, 192, 13]);
ok("立方体の空間対角線と表面積", [obj("cube")], [[f("side"), 2]], [f("diagonal"), f("surfaceArea"), f("volume")], ["2*√3", 24, 8]);
ok("柱体 底面積と周長から表面積", [obj("prism")], [[f("baseArea"), 12], [f("basePerimeter"), 17], [f("height"), 10]],
  [f("volume"), f("surfaceArea")], [120, 194]);
ok("角錐 体積・側面積", [obj("pyramid")], [[f("baseArea"), 16], [f("height"), 6], [f("lateralArea"), 40]],
  [f("volume"), f("surfaceArea")], [32, 56]);
ok("円柱 体積・表面積", [obj("cylinder")], [[f("radius"), 3], [f("height"), 4]], [f("volume"), f("surfaceArea")], ["36*π", "42*π"]);
ok("円錐 母線から表面積", [obj("cone")], [[f("radius"), 3], [f("height"), 4]],
  [f("slantHeight"), f("volume"), f("surfaceArea")], [5, "12*π", "24*π"]);
ok("円錐 根号の母線とπ", [obj("cone")], [[f("radius"), 1], [f("height"), 1]],
  [f("slantHeight"), f("surfaceArea")], ["√2", "π+√2*π"]);
ok("球の半径から表面積と体積", [obj("sphere")], [[f("radius"), 3]], [f("surfaceArea"), f("volume")], ["36*π", "36*π"]);
ok("球の表面積から半径", [obj("sphere")], [[f("surfaceArea"), "100*pi"]], [f("radius")], [5]);
ok("三角形を底面とする角柱", [right, obj("prism", { base: "T" })], [[ac, 3], [bc, 4], [f("height"), 5]],
  [f("volume"), f("surfaceArea")], [30, 72]);
ok("相似な直方体の長さ・面積・体積", [obj("cuboid"), shape("G", "cuboid")],
  [[f("width"), 2], [f("length"), 3], [f("height"), 4], [p("G", "width"), 6]],
  [p("G", "height"), p("G", "surfaceArea"), p("G", "volume")], [12, 468, 648],
  [{ type: "similar_solids", first: "F", second: "G" }]);

const areaComposite = [obj("composite"), shape("Q", "square", ["A", "B", "C", "D"]), circle];
ok("複合図形 円を除いた正方形", areaComposite, [[ab, 8], [p("O", "radius"), 2]], [f("area")], ["64-4*π"],
  [{ type: "composite_measure", operation: "difference", topology: "contained", total: f("area"), parts: [p("Q", "area"), p("O", "area")] }]);
ok("複合図形 離れた領域の加算", areaComposite, [[ab, 8], [p("O", "radius"), 2]], [f("area")], ["64+4*π"],
  [{ type: "composite_measure", operation: "sum", topology: "disjoint", total: f("area"), parts: [p("Q", "area"), p("O", "area")] }]);
ok("二等辺の角度から隣接三角形", [shape("T", "isosceles_triangle", ["A", "B", "C"], { apex: "A" }),
  shape("U", "triangle", ["C", "B", "D"])], [[C, 55], [a("B", "C", "D"), 30]],
  [A, a("B", "D", "C")], [70, 95],
  [pair("equal_angles", ["A", "B", "C"], ["C", "B", "D"])]);
ok("円周角と二等辺から別の角", [circle, arc, shape("T", "isosceles_triangle", ["A", "B", "C"], { apex: "A" })],
  [[p("ARC", "centralAngle"), 100]], [B, C, A], [50, 50, 80], [{ type: "inscribed_angle", arc: "ARC", point: "B" }]);
ok("平行線→AA→相似比→三平方→面積",
  [right, shape("U", "triangle", ["D", "E", "F"])],
  [[A, 30], [D, 30], [ab, 10], [de, 20]], [ef, df, p("U", "area")], [10, "10*√3", "50*√3"], [
    { type: "parallel", lines: [["A", "C"], ["D", "F"]] },
    { type: "parallel_transversal", lines: [["A", "C"], ["D", "F"]], angles: [["A", "C", "B"], ["D", "F", "E"]], position: "alternate" },
    match(),
  ]);

fail("三角不等式を破る", "inconsistent", [triangle], [[ab, 3], [ac, 4], [bc, 10]], [ab]);
fail("退化した三角形", "inconsistent", [triangle], [[ab, 3], [ac, 4], [bc, 7]], [ab]);
fail("辺が足りない", "underdetermined", [triangle], [[ab, 3]], [ac]);
fail("角が足りない", "underdetermined", [triangle], [[A, 50]], [B]);
fail("角度和の矛盾", "inconsistent", [triangle], [[A, 90], [B, 100]], [C]);
fail("直角の頂点がない", "invalid", [shape("T", "right_triangle", ["A", "B", "C"], { rightAngleAt: "D" })], [], [A]);
fail("斜辺の長さが短い", "inconsistent", [right], [[ab, 3], [ac, 5]], [bc]);
fail("明示された角と三平方が衝突", "inconsistent", [triangle], [[ab, 5], [ac, 3], [bc, 4], [C, 80]], [ab]);
fail("60度と辺の長さが矛盾", "inconsistent", [triangle], [[ab, 5], [ac, 4], [bc, 4], [A, 60]], [ab]);
fail("対応しない角度と3辺の厳密照合", "unsupported", [triangle], [[ab, 5], [ac, 4], [bc, 3], [B, 53]], [ab]);
fail("高さが隣辺を越える", "inconsistent", [triangle], [[ab, 5], [ac, 4], [t("height:A:B"), 6]], [t("area")]);
fail("円の負の半径", "inconsistent", [obj("circle")], [[f("radius"), -2]], [f("area")]);
fail("円の面積と半径が矛盾", "inconsistent", [obj("circle")], [[f("radius"), 2], [f("area"), "3*pi"]], [f("diameter")]);
fail("扇形の中心角が360度を超える", "inconsistent", [obj("sector")], [[f("centerAngle"), 361]], [f("area")]);
fail("弦が退化する", "inconsistent", [shape("F", "chord", ["A", "B"])], [[f("radius"), 3], [f("centerDistance"), 3]], [ab]);
fail("平行と垂直が衝突", "inconsistent", [], [], [parallel("A", "B", "C", "D")],
  [{ type: "parallel", lines }, { type: "perpendicular", lines }]);
fail("平行・垂直の循環が矛盾", "inconsistent", [], [], [parallel("A", "B", "C", "D")], [
  { type: "parallel", lines },
  { type: "parallel", lines: [["C", "D"], ["E", "F"]] },
  { type: "perpendicular", lines: [["A", "B"], ["E", "F"]] },
]);
fail("方向の連鎖と否定が矛盾", "inconsistent", [], [[parallel("A", "B", "E", "F"), 0]], [parallel("A", "B", "C", "D")], [
  { type: "perpendicular", lines },
  { type: "perpendicular", lines: [["C", "D"], ["E", "F"]] },
]);
ok("方向の連鎖で2本の直線の平行を得る", [], [], [parallel("A", "B", "E", "F")], [1], [
  { type: "perpendicular", lines },
  { type: "perpendicular", lines: [["C", "D"], ["E", "F"]] },
]);
fail("相似の対応が矛盾", "inconsistent", [triangle, otherTriangle], [[ab, 2], [de, 6], [bc, 5], [ef, 7]], [ab], [match("similar")]);
fail("相似の対応点が重複", "invalid", [triangle, otherTriangle], [], [ab], [match("infer", ["D", "D", "F"])]);
fail("相似の仮説だけでは辺を導出しない", "underdetermined", [triangle, otherTriangle], [[ab, 2], [de, 6], [bc, 5]], [ef], [match()]);
fail("鉛直線に有限の傾きがない", "underdetermined", [line], points([["A", -2, 3], ["B", -2, 7]]), [f("slope")]);
fail("四角形が自己交差", "inconsistent", [shape("F", "coordinate_polygon", ["A", "B", "C", "D"])],
  points([["A", 0, 0], ["B", 4, 4], ["C", 0, 4], ["D", 4, 0]]), [f("area")]);
fail("円周の位置が得られない", "inconsistent", [circle], [[p("O", "radius"), 5], ...points([["O", 0, 0]]), [c("P", "y"), 6]],
  [c("P", "x")], [{ type: "point_on_circle", circle: "O", point: "P" }]);
fail("形状の循環だけでは値を生成しない", "underdetermined", [], [], [ab], [
  { type: "equal_lengths", segments: [["A", "B"], ["B", "C"]] },
  { type: "equal_lengths", segments: [["B", "C"], ["C", "D"]] },
  { type: "equal_lengths", segments: [["C", "D"], ["A", "B"]] },
]);
fail("未対応形状", "unsupported", [obj("torus")], [], [f("area")]);
fail("未知の関係は無視しない", "unsupported", [obj("circle")], [[f("radius"), 2]], [f("area")], [{ type: "mystery" }]);
fail("空のゴール", "invalid", [triangle], [], []);
fail("非有限入力", "invalid", [triangle], [[ab, Infinity]], [ab]);
fail("図形属性の入力誤り", "invalid", [obj("circle")], [[f("raduis"), 5]], [f("area")]);
fail("多角形の最長辺の矛盾", "inconsistent", [q("quadrilateral")], [[ab, 11], [p("Q", "perimeter"), 20]], [ab]);
fail("一致しない平行線の交点", "inconsistent", [line, shape("G", "line", ["C", "D"])],
  points([["A", 0, 0], ["B", 1, 1], ["C", 0, 1], ["D", 1, 2]]),
  [c("P", "x")], [{ type: "line_intersection", lines: ["F", "G"], point: "P" }]);
fail("正方形の面積と対角線が矛盾", "inconsistent", [square], [[p("Q", "area"), 10], [ac, 4]], [p("Q", "area")]);
fail("図形数の上限", "unsupported", Array.from({ length: 65 }, (_, i) => shape(`o${i}`, "point")), [], [ab]);

for (const { name, input, status, expected } of rows) {
  test(name, () => {
    const result = solve(input);
    assert.equal(result.status, status, JSON.stringify(result));
    assert.equal(result.verified, status === "solved");
    if (expected) {
      assert.deepEqual(result.goals.map(({ value }) => value), expected.map(String));
      for (const { evidence } of result.goals) assert.ok(result.trace.some(({ id }) => id === evidence));
    }
    for (const { id, sources } of result.trace) assert.ok(sources.every((source) => source < id));
  });
}

test("円の左右の交点を全候補として検証する", () => {
  const result = solve(problem([circle],
    [[p("O", "radius"), 5], ...points([["O", 1, 2]]), [c("P", "y"), 5]],
    [c("P", "x")], [{ type: "point_on_circle", circle: "O", point: "P" }]));
  assert.equal(result.status, "multiple-solutions");
  assert.deepEqual(result.alternatives.map(({ value }) => value), ["-3", "5"]);
  assert.equal(result.verified, false);
});

test("相似の代数部分を注入したアダプターへ委譲し、誤答を原式で棄却する", () => {
  const input = problem([triangle, otherTriangle], [[ab, 6], [de, 9], [bc, 8]], [ef], [match("similar")]);
  const math = createMathAdapter();
  let calls = 0;
  const good = { ...math, solveLinear(...v) { calls++; return math.solveLinear(...v); } };
  assert.equal(solve(input, { math: good }).goals[0].value, "12");
  assert.ok(calls > 0);
  const bad = { ...math, solveLinear() { return math.parse(11); } };
  assert.equal(solve(input, { math: bad }).status, "inconsistent");
});
