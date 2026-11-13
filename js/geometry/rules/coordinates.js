import { inconsistent, invalid } from "../core/errors.js";
import { vertexList } from "../core/problem.js";
import { coordinate, length, parallel, perpendicular, property } from "../core/refs.js";
import { equal, known } from "../core/rule-helpers.js";
import { forward } from "./measurements.js";
import { scaled, tuple } from "./relations.js";

export const coordinateTypes = new Set(["point", "segment", "line", "ray", "coordinate_polygon"]);
const pointRefs = (point) => [coordinate(point, "x"), coordinate(point, "y")];

export function buildCoordinateRules(problem, add, math, alternative) {
  const zero = math.parse(0);
  const two = math.parse(2);
  const sign = (value) => math.compare(value, zero);
  const abs = (value) => sign(value) < 0 ? math.sub(zero, value) : value;
  const square = (value) => math.pow(value, 2);
  const diff = (x, y, u, v) => [math.sub(u, x), math.sub(v, y)];
  const determinant = (x, y, u, v) => math.sub(math.mul(x, v), math.mul(y, u));
  const edges = new Set();
  function distance(a, b) {
    const ref = length(a, b);
    if (edges.has(ref)) return;
    edges.add(ref);
    forward(add, math, "座標間の距離", ref, [...pointRefs(a), ...pointRefs(b)], (...values) => {
      const [dx, dy] = diff(...values);
      const norm = math.add(square(dx), square(dy));
      if (sign(norm) === 0) throw inconsistent("線分の端点の座標が一致しています。");
      return math.sqrt(norm);
    });
  }

  function polygonArea(id, vertices) {
    if (vertices.length !== 3 && vertices.length !== 4) return;
    // Require a simple nondegenerate quadrilateral, including concave ones.
    // For triangles, nonzero shoelace area also excludes collinearity.
    const orient = (a, b, c) => sign(determinant(...diff(...a, ...b), ...diff(...a, ...c)));
    const cross = (a, b, c, d) => orient(a, b, c) * orient(a, b, d) < 0
      && orient(c, d, a) * orient(c, d, b) < 0;
    forward(add, math, "座標多角形の面積", property(id, "area"), vertices.flatMap(pointRefs), (...values) => {
      const points = vertices.map((_, i) => values.slice(2 * i, 2 * i + 2));
      const count = points.length;
      if (points.some((point, i) => orient(point, points[(i + 1) % count], points[(i + 2) % count]) === 0)) {
        throw inconsistent("座標多角形に退化した角があります。");
      }
      if (count === 4 && (cross(points[0], points[1], points[2], points[3])
        || cross(points[1], points[2], points[3], points[0]))) {
        throw inconsistent("座標多角形の辺が交差しています。");
      }
      const area = points.reduce((sum, point, i) =>
        math.add(sum, determinant(...point, ...points[(i + 1) % count])), zero);
      return math.div(abs(area), two);
    });
  }

  function line(object) {
    const [a, b] = vertexList(object, 2);
    const p = (key) => property(object.id, key);
    const points = [...pointRefs(a), ...pointRefs(b)];
    const slope = (...v) => {
      const [dx, dy] = diff(...v);
      return sign(dx) === 0 ? undefined : math.div(dy, dx);
    };
    const maybe = (name, ref, get) => add(name, [ref, ...points], ([value, ...coords]) => {
      if (value !== undefined || !known(coords)) return [];
      const candidate = get(...coords);
      return candidate === undefined ? [] : [[0, candidate]];
    }, ([value, ...coords]) => {
      if (value === undefined || !known(coords)) return null;
      const candidate = get(...coords);
      return candidate !== undefined && math.compare(value, candidate) === 0;
    });
    maybe("直線の傾き", p("slope"), slope);
    maybe("y軸との交点", p("yIntercept"), (x, y, ...v) => {
      const m = slope(x, y, ...v);
      return m === undefined ? undefined : math.sub(y, math.mul(m, x));
    });
    maybe("x軸との交点", p("xIntercept"), (x, y, u, v) => {
      const [dx, dy] = diff(x, y, u, v);
      return sign(dy) === 0 ? undefined : math.sub(x, math.div(math.mul(y, dx), dy));
    });
    // Normalize A*x+B*y=C to a leading coefficient of one.
    const equation = (x, y, ...v) => {
      const [dx, dy] = diff(x, y, ...v);
      if (sign(dx) === 0 && sign(dy) === 0) throw inconsistent("直線の2点が同じ座標です。");
      if (sign(dy) === 0) return [zero, math.parse(1), y];
      const b = math.div(math.sub(zero, dx), dy);
      return [math.parse(1), b, math.add(x, math.mul(b, y))];
    };
    for (const [i, component] of ["lineA", "lineB", "lineC"].entries()) {
      forward(add, math, "直線の標準方程式", p(component), points, (...values) => equation(...values)[i]);
    }
  }

  for (const object of problem.objects) {
    if (object.type === "segment" || object.type === "ray") distance(...vertexList(object, 2));
    if (object.type === "line") line(object);
    const vertices = object.vertices;
    if (object.type === "coordinate_polygon" && ![3, 4].includes(vertices?.length)) {
      throw invalid("座標多角形は3点または4点を指定してください。");
    }
    if (![3, 4].includes(vertices?.length)) continue;
    vertices.forEach((point, i) => distance(point, vertices[(i + 1) % vertices.length]));
    if (vertices.length === 4) {
      distance(vertices[0], vertices[2]);
      distance(vertices[1], vertices[3]);
    }
    polygonArea(object.id, vertices);
  }

  for (const relation of problem.relations) {
    if (relation.type === "midpoint") {
      const [a, b] = tuple(relation.segment, 2);
      if (relation.point === a || relation.point === b) throw invalid("中点は端点と異なる必要があります。");
      distance(a, b);
      const firstHalf = length(a, relation.point);
      const secondHalf = length(b, relation.point);
      scaled(add, math, "線分の中点", firstHalf, length(a, b), math.parse("1/2"));
      equal(add, math, "線分の中点", firstHalf, secondHalf);
      distance(a, relation.point);
      distance(b, relation.point);
      for (const axis of ["x", "y"]) {
        forward(add, math, "中点の座標", coordinate(relation.point, axis),
          [coordinate(a, axis), coordinate(b, axis)], (x, y) => math.div(math.add(x, y), two));
      }
    } else if (relation.type === "line_pair" || relation.type === "parallel" || relation.type === "perpendicular") {
      const [a, b, c, d] = tuple(relation.lines, 2).flatMap((pair) => tuple(pair, 2));
      const inputs = [a, b, c, d].flatMap(pointRefs);
      const classify = (test) => (...values) => {
        const u = diff(...values.slice(0, 4));
        const v = diff(...values.slice(4, 8));
        if ([u, v].some((line) => line.every((component) => sign(component) === 0))) {
          throw inconsistent("直線を定める2点の座標が同じです。");
        }
        return math.parse(sign(test(...u, ...v)) === 0 ? 1 : 0);
      };
      forward(add, math, "座標による方向の平行判定", parallel(a, b, c, d), inputs, classify(determinant));
      forward(add, math, "座標による垂直判定", perpendicular(a, b, c, d), inputs,
        classify((x, y, u, v) => math.add(math.mul(x, u), math.mul(y, v))));
    } else if (relation.type === "line_intersection") {
      const [first, second] = tuple(relation.lines, 2).map((id) => problem.byId.get(id));
      if (first?.type !== "line" || second?.type !== "line" || first === second) {
        throw invalid("交点には異なる二つの直線を指定してください。");
      }
      const inputs = [first, second].flatMap(({ id }) => ["lineA", "lineB", "lineC"].map((key) => property(id, key)));
      const refs = [...pointRefs(relation.point), ...inputs];
      const equals = (x, y) => math.compare(x, y) === 0;
      const evaluateLine = (a, b, x, y) => math.add(math.mul(a, x), math.mul(b, y));
      add("二直線の交点", refs, ([x, y, ...v]) => {
        if (!known(v) || known([x, y])) return [];
        const [a, b, c, d, e, f] = v;
        if (sign(determinant(a, b, d, e)) === 0) {
          if (sign(determinant(a, c, d, f)) !== 0 || sign(determinant(b, c, e, f)) !== 0) {
            throw inconsistent("平行で一致しない直線には交点がありません。");
          }
          return [];
        }
        const solution = math.solveSystem([a, b, c], [d, e, f]);
        if ((x !== undefined && !equals(x, solution.x)) || (y !== undefined && !equals(y, solution.y))) {
          throw inconsistent("交点の座標が二直線と一致しません。");
        }
        return [...(x === undefined ? [[0, solution.x]] : []), ...(y === undefined ? [[1, solution.y]] : [])];
      }, (v) => {
        if (!known(v)) return null;
        const [x, y, a, b, c, d, e, f] = v;
        return equals(evaluateLine(a, b, x, y), c) && equals(evaluateLine(d, e, x, y), f);
      });
    } else if (relation.type === "point_on_circle") {
      const circle = problem.byId.get(relation.circle);
      if (circle?.type !== "circle" || !circle.center || circle.center === relation.point) {
        throw invalid("円周上の点には別の中心を明示した円を指定してください。");
      }
      const refs = [...pointRefs(relation.point), ...pointRefs(circle.center), property(circle.id, "radius")];
      add("円周上の点と半径", refs, (values) => {
        if (!known(values.slice(2)) || (values[0] === undefined) === (values[1] === undefined)) return [];
        const missing = values[0] === undefined ? 0 : 1;
        const fixed = 1 - missing;
        const discriminant = math.sub(square(values[4]), square(math.sub(values[fixed], values[fixed + 2])));
        if (sign(discriminant) < 0) throw inconsistent("直線と円の交点が存在しません。");
        if (sign(discriminant) === 0) return [[missing, values[missing + 2]]];
        const root = math.sqrt(discriminant);
        alternative(refs[missing], [math.sub(values[missing + 2], root), math.add(values[missing + 2], root)],
          "円と座標直線の交点");
        return [];
      }, ([x, y, a, b, radius]) => known([x, y, a, b, radius])
        ? math.compare(math.add(square(math.sub(x, a)), square(math.sub(y, b))), square(radius)) === 0 : null);
    } else if (relation.type === "transform") {
      const { from, to, operation } = relation;
      if (from === to) throw invalid("移動前後の点名を区別してください。");
      let transform;
      if (operation === "translate") {
        const [dx, dy] = tuple(relation.offset, 2).map(math.parse);
        transform = (x, y) => [math.add(x, dx), math.add(y, dy)];
      } else if (operation === "rotate" && [0, 90, 180, 270].includes(relation.degrees)) {
        const negative = (x) => math.sub(zero, x);
        const rotation = new Map([[0, (x, y) => [x, y]], [90, (x, y) => [negative(y), x]],
          [180, (x, y) => [negative(x), negative(y)]], [270, (x, y) => [y, negative(x)]]]);
        transform = rotation.get(relation.degrees);
      } else if (operation === "reflect" && ["x", "y", "origin", "y=x"].includes(relation.axis)) {
        const negative = (x) => math.sub(zero, x);
        const reflection = new Map([["x", (x, y) => [x, negative(y)]], ["y", (x, y) => [negative(x), y]],
          ["origin", (x, y) => [negative(x), negative(y)]], ["y=x", (x, y) => [y, x]]]);
        transform = reflection.get(relation.axis);
      } else {
        throw invalid("対応する平行移動、対称移動、または90度単位の回転を指定してください。");
      }
      for (const [i, ref] of pointRefs(to).entries()) {
        forward(add, math, "座標の合同変換", ref, pointRefs(from), (x, y) => transform(x, y)[i]);
      }
    }
  }
}
