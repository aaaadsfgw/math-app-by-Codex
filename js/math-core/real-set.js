const REAL_SET_KINDS = new Set(["all-real", "empty", "intervals"]);

function endpoint(value) {
  if (value === null || value === undefined) return null;
  const exact = String(value.exact ?? value).trim();
  if (!exact) throw new TypeError("区間端点には厳密値が必要です。");
  const approximate = value && typeof value === "object"
    ? Number(value.approximate)
    : Number.NaN;
  return Object.freeze({
    exact,
    approximate: Number.isFinite(approximate) ? approximate : null,
  });
}

function interval(value) {
  const lower = endpoint(value?.lower);
  const upper = endpoint(value?.upper);
  const lowerClosed = lower ? value?.lowerClosed === true : false;
  const upperClosed = upper ? value?.upperClosed === true : false;
  if (lower?.approximate !== null && upper?.approximate !== null) {
    if (lower.approximate > upper.approximate) {
      throw new TypeError("区間の下端が上端を超えています。");
    }
    if (
      lower.approximate === upper.approximate
      && (!lowerClosed || !upperClosed)
    ) {
      throw new TypeError("同じ端点の区間は閉じた1点区間にしてください。");
    }
  }
  return Object.freeze({ lower, upper, lowerClosed, upperClosed });
}

export function createRealSet({ kind = "intervals", intervals = [] } = {}) {
  if (!REAL_SET_KINDS.has(kind)) throw new TypeError("実数解集合の種類が正しくありません。");
  if (!Array.isArray(intervals)) throw new TypeError("実数区間は配列で指定してください。");
  const normalizedIntervals = kind === "intervals"
    ? Object.freeze(intervals.map(interval))
    : Object.freeze([]);
  if (kind === "intervals" && !normalizedIntervals.length) {
    throw new TypeError("区間型の実数解集合には1つ以上の区間が必要です。");
  }
  return Object.freeze({ kind, intervals: normalizedIntervals });
}

function lowerRelation(intervalValue, variable) {
  if (!intervalValue.lower) return "";
  return `${intervalValue.lower.exact}${intervalValue.lowerClosed ? "≤" : "<"}${variable}`;
}

function upperRelation(intervalValue, variable) {
  if (!intervalValue.upper) return "";
  return `${variable}${intervalValue.upperClosed ? "≤" : "<"}${intervalValue.upper.exact}`;
}

export function formatRealSet(realSet, { variable = "x" } = {}) {
  if (realSet?.kind === "all-real") return "すべての実数";
  if (realSet?.kind === "empty") return "解なし";
  if (realSet?.kind !== "intervals" || !Array.isArray(realSet.intervals)) {
    throw new TypeError("実数解集合が正しくありません。");
  }
  return realSet.intervals.map((intervalValue) => {
    if (
      intervalValue.lower
      && intervalValue.upper
      && intervalValue.lower.exact === intervalValue.upper.exact
      && intervalValue.lowerClosed
      && intervalValue.upperClosed
    ) {
      return `${variable}=${intervalValue.lower.exact}`;
    }
    const lower = lowerRelation(intervalValue, variable);
    const upper = upperRelation(intervalValue, variable);
    if (lower && upper) return `${lower}${upper.slice(variable.length)}`;
    return lower || upper;
  }).join(" または ");
}

export { REAL_SET_KINDS };

