import { invalid } from "./errors.js";

const IDENTIFIER = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,31}$/u;

export function identifier(value) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw invalid("識別子の形式が不正です。");
  return value;
}

function distinct(a, b) {
  if (a === b) throw invalid("線分の端点、または角を構成する点を区別してください。");
}

function ordered(a, b) {
  distinct(identifier(a), identifier(b));
  return [a, b].sort().join(":");
}

export const length = (a, b) => `len:${ordered(a, b)}`;
export function angle(a, b, c) {
  identifier(b);
  distinct(a, b);
  distinct(b, c);
  const [left, right] = ordered(a, c).split(":");
  return `angle:${left}:${b}:${right}`;
}
export function property(id, name) {
  if (typeof name !== "string" || name.length > 160) throw invalid("属性名が不正です。");
  return `shape:${identifier(id)}:${name.split(":").map(identifier).join(":")}`;
}
export function coordinate(point, axis) {
  if (axis !== "x" && axis !== "y" && axis !== "z") throw invalid("座標軸が不正です。");
  return `coord:${identifier(point)}:${axis}`;
}

function lineRelation(type, a, b, c, d) {
  const first = ordered(a, b);
  const second = ordered(c, d);
  if (first === second) throw invalid("直線関係には異なる二つの端点組を指定してください。");
  return `${type}:${[first, second].sort().join(":")}`;
}
export const parallel = (a, b, c, d) => lineRelation("parallel", a, b, c, d);
export const perpendicular = (a, b, c, d) => lineRelation("perpendicular", a, b, c, d);

export function canonicalRef(ref) {
  if (typeof ref !== "string" || ref.length > 240) throw invalid("条件の参照形式が不正です。");
  const [kind, ...parts] = ref.split(":");
  if (kind === "len" && parts.length === 2) return length(...parts);
  if (kind === "angle" && parts.length === 3) return angle(...parts);
  if (kind === "coord" && parts.length === 2) return coordinate(...parts);
  if (kind === "shape" && parts.length >= 2) return property(parts[0], parts.slice(1).join(":"));
  if (kind === "parallel" && parts.length === 4) return parallel(...parts);
  if (kind === "perpendicular" && parts.length === 4) return perpendicular(...parts);
  throw invalid(`未知の参照形式です (${kind})。`);
}
