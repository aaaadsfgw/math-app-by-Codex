import { inconsistent, invalid, unsupported } from "./errors.js";
import { limits } from "./problem.js";
import { canonicalRef } from "./refs.js";

const FLAGS = /^(?:parallel:|perpendicular:|shape:[^:]+:(?:similar|congruent|cyclic|right|contains):)/u;
const SIGNED = /^(?:coord:|shape:[^:]+:(?:slope|intercept|lineA|lineB|lineC|xIntercept|yIntercept)$)/u;
const NONNEGATIVE = /^shape:[^:]+:(?:centerDistance|diagonalCount)$/u;
const COUNT = /^shape:[^:]+:(?:diagonalCount|triangleCount|sides)$/u;

export function createInference(math) {
  const facts = new Map();
  const trace = [];
  const rules = [];
  const watchers = new Map();
  const queue = new Set();
  const blocked = new Map();
  const alternatives = new Map();
  const directions = new Map();
  const zero = math.parse(0);
  const one = math.parse(1);
  const straight = math.parse(180);
  const circle = math.parse(360);
  let evaluations = 0;

  function directionRoot(line) {
    let root = line;
    let orientation = 0;
    while (directions.has(root)) {
      const edge = directions.get(root);
      root = edge.parent;
      orientation ^= edge.orientation;
    }
    return [root, orientation];
  }

  function checkDirections() {
    // A direction graph encodes only parallel (same parity) and
    // perpendicular (opposite parity) edges, independent of point positions.
    for (const [ref, { value }] of facts) {
      if (!/^(?:parallel|perpendicular):/u.test(ref) || math.compare(value, zero) !== 0) continue;
      const [kind, a, b, c, d] = ref.split(":");
      const [left, l] = directionRoot(`${a}:${b}`);
      const [right, r] = directionRoot(`${c}:${d}`);
      if (left === right && (l ^ r) === Number(kind === "perpendicular")) {
        throw inconsistent("直線の方向が否定された条件と矛盾します。");
      }
    }
  }

  function add(name, references, derive, verify) {
    if (rules.length === limits.rules) throw unsupported("推論ルール数が上限を超えています。");
    const refs = references.map(canonicalRef);
    const rule = { name, refs, derive, verify };
    rules.push(rule);
    queue.add(rule);
    for (const ref of new Set(refs)) {
      if (!watchers.has(ref)) watchers.set(ref, []);
      watchers.get(ref).push(rule);
    }
  }

  function checkDomain(ref, value) {
    if (SIGNED.test(ref)) return;
    const sign = math.compare(value, zero);
    if (FLAGS.test(ref)) {
      if (sign !== 0 && math.compare(value, one) !== 0) throw inconsistent(`関係値 ${ref} は0か1です。`);
      const other = ref.startsWith("parallel:") ? ref.replace(/^parallel:/u, "perpendicular:")
        : ref.startsWith("perpendicular:") ? ref.replace(/^perpendicular:/u, "parallel:") : null;
      const opposing = facts.get(other);
      if (sign !== 0 && opposing && math.compare(opposing.value, one) === 0) {
        throw inconsistent("同じ2直線を平行かつ垂直にすることはできません。");
      }
      if (other && sign !== 0) {
        const [kind, a, b, c, d] = ref.split(":");
        const [left, l] = directionRoot(`${a}:${b}`);
        const [right, r] = directionRoot(`${c}:${d}`);
        const parity = l ^ r ^ Number(kind === "perpendicular");
        if (left === right && parity !== 0) throw inconsistent("平行・垂直の連鎖に矛盾があります。");
        if (left !== right) directions.set(left, { parent: right, orientation: parity });
      }
      return;
    }
    if (sign < 0 || (sign === 0 && !NONNEGATIVE.test(ref))) throw inconsistent(`${ref} は正である必要があります。`);
    if (COUNT.test(ref) && !/^\d+$/u.test(math.format(value))) throw inconsistent(`${ref} は整数である必要があります。`);
    if (ref.startsWith("angle:") && math.compare(value, straight) >= 0) {
      throw inconsistent(`角 ${ref} は0度より大きく180度未満です。`);
    }
    if (/^shape:[^:]+:(?:centralAngle|centerAngle|interiorAngle|exteriorAngle)$/u.test(ref)
      && math.compare(value, circle) > 0) throw inconsistent(`${ref} は360度以下です。`);
  }

  function store(ref, value, rule, sources, verification) {
    const existing = facts.get(ref);
    if (existing) {
      if (math.compare(existing.value, value) !== 0) throw inconsistent(`${ref} の条件が一致しません (${rule})。`);
      return;
    }
    if (facts.size === limits.facts) throw unsupported("導出した条件数が上限を超えています。");
    checkDomain(ref, value);
    const origin = rule === "given" || rule === "candidate" ? rule : "derived";
    const step = { id: trace.length + 1, ref, value: math.format(value), origin, rule, sources, verification };
    trace.push(step);
    facts.set(ref, { value, step: step.id });
    for (const dependency of watchers.get(ref) ?? []) queue.add(dependency);
  }

  function failOnContradiction(rule, values) {
    if (rule.verify(values) === false) throw inconsistent(`「${rule.name}」と条件が矛盾しています。`);
  }

  function evaluate(rule) {
    const previous = rule.refs.map((ref) => facts.get(ref));
    const values = previous.map((fact) => fact?.value);
    failOnContradiction(rule, values);
    const proposals = rule.derive(values);
    if (!proposals.length) return;
    const sources = [...new Set(previous.filter(Boolean).map((fact) => fact.step))];
    const combined = new Map(rule.refs.map((ref, index) => [ref, values[index]]));
    for (const [index, value] of proposals) {
      const ref = rule.refs[index];
      if (!ref || value === undefined) throw invalid("ルールからの導出が不正です。");
      const knownValue = combined.get(ref);
      if (knownValue !== undefined && math.compare(knownValue, value) !== 0) {
        throw inconsistent(`${ref} に矛盾する値が導かれました。`);
      }
      combined.set(ref, value);
    }
    const candidate = rule.refs.map((ref) => combined.get(ref));
    const verified = rule.verify(candidate);
    if (verified === false) throw inconsistent(`「${rule.name}」の導出は元の関係を満たしません。`);
    if (verified !== true) throw unsupported(`「${rule.name}」の導出を厳密に確認できません。`);
    for (const [index, value] of proposals) store(rule.refs[index], value, rule.name, sources, "checked");
  }

  return {
    add,
    addDirectionTransitivity(problem) {
      const target = new Set([...watchers.keys(), ...problem.goals, ...problem.givens.map(({ ref }) => ref)]
        .filter((ref) => /^(?:parallel|perpendicular):/u.test(ref)));
      if (!target.size) return;
      const all = [...target];
      // A bounded single rule reconstructs only requested or watched direction
      // facts and keeps the direction constraints as proof dependencies.
      add("平行・垂直の方向の連鎖", all, (values) => values.flatMap((value, index) => {
        if (value !== undefined) return [];
        const [kind, a, b, c, d] = all[index].split(":");
        const [left, l] = directionRoot(`${a}:${b}`);
        const [right, r] = directionRoot(`${c}:${d}`);
        return left === right ? [[index, (l ^ r) === Number(kind === "perpendicular") ? one : zero]] : [];
      }), (values) => {
        let checked = false;
        for (const [index, value] of values.entries()) {
          if (value === undefined) continue;
          const [kind, a, b, c, d] = all[index].split(":");
          const [left, l] = directionRoot(`${a}:${b}`);
          const [right, r] = directionRoot(`${c}:${d}`);
          if (left !== right) continue;
          const expected = (l ^ r) === Number(kind === "perpendicular");
          if (expected !== (math.compare(value, one) === 0)) return false;
          checked = true;
        }
        return checked ? true : null;
      });
    },
    references: (ref) => watchers.has(ref),
    alternative(ref, choices, rule) {
      alternatives.set(ref, { choices, rule });
    },
    run(problem) {
      for (const { ref, value, origin = "given" } of problem.givens) store(ref, math.parse(value), origin, [], "domain-checked");
      while (queue.size) {
        if (evaluations++ === limits.evaluations) throw unsupported("推論回数が上限を超えています。");
        const rule = queue.values().next().value;
        queue.delete(rule);
        blocked.delete(rule);
        try {
          evaluate(rule);
        } catch (error) {
          if (error?.code !== "GEOMETRY_UNSUPPORTED" && !(error instanceof RangeError)) throw error;
          blocked.set(rule, error.message);
        }
      }
      checkDirections();
      const goals = problem.goals.map((ref) => {
        const fact = facts.get(ref);
        return fact ? { ref, value: math.format(fact.value), evidence: fact.step } : { ref, value: null };
      });
      const result = { verified: false, goals, trace, evaluations,
        unresolved: [...new Set(blocked.values())] };
      if (blocked.size) return { status: "unsupported", ...result };
      if (goals.every(({ value }) => value !== null)) return { ...result, status: "solved", verified: true };
      return { ...result, status: "underdetermined" };
    },
    trace,
    alternatives,
    get evaluations() { return evaluations; },
  };
}
