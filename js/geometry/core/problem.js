import { invalid, unsupported } from "./errors.js";
import { canonicalRef, identifier, parallel, perpendicular } from "./refs.js";

export const limits = Object.freeze({ objects: 64, givens: 256, relations: 128, goals: 32,
  rules: 2_048, facts: 2_048, evaluations: 16_384 });

const entries = (value, limit, name) => {
  if (!Array.isArray(value)) throw invalid(`${name}は配列で指定してください。`);
  if (value.length > limit) throw unsupported(`${name}の件数が上限を超えています。`);
  return value;
};

export function normalizeProblem(value) {
  if (!value || value.type !== "geometry" || (value.version !== undefined && value.version !== 1)) {
    throw invalid("type が geometry のバージョン1入力を指定してください。");
  }
  const objects = entries(value.objects ?? [], limits.objects, "図形");
  const givens = entries(value.givens ?? [], limits.givens, "既知条件");
  const relations = entries(value.relations ?? [], limits.relations, "関係");
  const goals = entries(value.goals, limits.goals, "求める量").map(canonicalRef);
  if (goals.length === 0 || new Set(goals).size !== goals.length) {
    throw invalid("重複しない求める量を1件以上指定してください。");
  }
  const byId = new Map();
  for (const object of objects) {
    if (!object || typeof object !== "object") throw invalid("図形の形式が不正です。");
    const { id, type, vertices } = object;
    identifier(id);
    identifier(type);
    if (object.center !== undefined) identifier(object.center);
    if (byId.has(id)) throw invalid(`図形の識別子 ${id} が重複しています。`);
    if (vertices !== undefined) {
      entries(vertices, 32, "頂点").forEach(identifier);
      if (new Set(vertices).size !== vertices.length) throw invalid(`図形 ${id} の頂点が重複しています。`);
    }
    byId.set(id, object);
  }
  const normalizeReference = (reference) => {
    const ref = canonicalRef(reference);
    if (ref.startsWith("shape:") && !byId.has(ref.split(":")[1])) {
      throw invalid(`属性の図形が存在しません (${ref})。`);
    }
    return ref;
  };
  return {
    objects, byId, goals: goals.map(normalizeReference),
    givens: givens.map((given) => {
      if (!given || typeof given !== "object") throw invalid("既知条件の形式が不正です。");
      if ((typeof given.value !== "string" || !given.value.trim())
        && typeof given.value !== "bigint"
        && (typeof given.value !== "number" || !Number.isFinite(given.value))) {
        throw invalid("既知条件は有限な数値または厳密数式で指定してください。");
      }
      return { ref: normalizeReference(given.ref), value: given.value };
    }),
    relations: relations.map((relation) => {
      if (!relation || typeof relation !== "object") throw invalid("関係の形式が不正です。");
      identifier(relation.type);
      return relation;
    }),
  };
}

export function vertexList(object, count) {
  if (object.vertices?.length !== count) throw invalid(`${object.id} には頂点が ${count} 個必要です。`);
  return object.vertices;
}

export function lineFacts(lines) {
  if (!Array.isArray(lines) || lines.length !== 2
    || lines.some((line) => !Array.isArray(line) || line.length !== 2)) {
    throw invalid("直線関係には端点2個ずつを指定してください。");
  }
  const ends = lines.flat();
  return [parallel(...ends), perpendicular(...ends)];
}
