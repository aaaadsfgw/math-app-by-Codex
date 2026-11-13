import { createInference } from "./core/inference.js";
import { invalid } from "./core/errors.js";
import { normalizeProblem } from "./core/problem.js";
import { defaultMath } from "./math-adapter/index.js";
import { buildCoordinateRules, coordinateTypes } from "./rules/coordinates.js";
import { buildMeasurementRules, measurementTypes } from "./rules/measurements.js";
import { buildRelationRules } from "./rules/relations.js";
import { buildTriangleRules, triangleTypes } from "./rules/triangles.js";

export { angle, coordinate, length, parallel, perpendicular, property } from "./core/refs.js";
export { createMathAdapter } from "./math-adapter/index.js";

const objects = new Set([...triangleTypes, ...measurementTypes, ...coordinateTypes, "composite"]);
const relations = new Set(["parallel", "perpendicular", "equal_lengths", "equal_angles", "vertical_angles",
  "supplementary", "complementary", "angle_bisector", "exterior_angle", "parallel_transversal",
  "triangle_matches", "midsegment", "parallel_in_triangle", "triangle_angle_bisector", "perpendicular_bisector",
  "inscribed_angle", "cyclic_quadrilateral", "tangent", "composite_measure",
  "midpoint", "line_pair", "line_intersection", "transform", "point_on_circle", "similar_solids"]);
const errorStatus = {
  GEOMETRY_INVALID: "invalid",
  GEOMETRY_INCONSISTENT: "inconsistent",
  GEOMETRY_UNSUPPORTED: "unsupported",
};

function solve(problem, math, extra, allowBranches) {
  let inference;
  const failure = (status, reason) => ({ status, verified: false, reason,
    goals: problem.goals.map((ref) => ({ ref, value: null })),
    trace: inference?.trace ?? [], evaluations: inference?.evaluations ?? 0 });
  try {
    inference = createInference(math);
    const { add } = inference;
    buildRelationRules(problem, add, math);
    buildTriangleRules(problem, add, math);
    buildMeasurementRules(problem, add, math);
    buildCoordinateRules(problem, add, math, inference.alternative);
    inference.addDirectionTransitivity(problem);
    for (const { ref } of problem.givens) {
      if (ref.startsWith("shape:") && !inference.references(ref)) throw invalid(`定義されていない図形属性です (${ref})。`);
    }
    for (const ref of problem.goals) {
      if (ref.startsWith("shape:") && !inference.references(ref)) throw invalid(`定義されていない図形属性です (${ref})。`);
    }
    const current = inference.run({ ...problem, givens: [...problem.givens, ...extra] });
    if (!allowBranches || current.status !== "underdetermined" || problem.goals.length !== 1) return current;
    const ref = problem.goals[0];
    const alternative = inference.alternatives.get(ref);
    if (!alternative) return current;
    const branches = alternative.choices.map((choice) => solve(problem, math,
      [{ ref, value: math.format(choice), origin: "candidate" }], false));
    const evaluations = branches.reduce((total, branch) => total + branch.evaluations, current.evaluations);
    if (branches.some((branch) => !["solved", "inconsistent"].includes(branch.status))) {
      return { ...current, status: "unsupported", evaluations, reason: "候補をすべて厳密に検証できません。" };
    }
    const valid = branches.filter(({ verified }) => verified);
    if (!valid.length) return { ...failure("inconsistent", alternative.rule), evaluations };
    if (valid.length === 1) return { ...valid[0], evaluations, alternativesChecked: branches.length };
    return { ...current, status: "multiple-solutions", evaluations, reason: alternative.rule,
      alternatives: valid.map(({ goals, trace }) => ({ value: goals[0].value, trace })) };
  } catch (error) {
    const status = errorStatus[error?.code] ?? (error instanceof RangeError ? "unsupported" : null);
    if (!status) throw error;
    return failure(status, error.message);
  }
}

export function solveGeometryProblem(input, { math = defaultMath } = {}) {
  let problem;
  try {
    problem = normalizeProblem(input);
  } catch (error) {
    if (!errorStatus[error?.code]) throw error;
    return { status: errorStatus[error.code], verified: false, reason: error.message, goals: [], trace: [], evaluations: 0 };
  }
  const unknown = problem.objects.find(({ type }) => !objects.has(type))
    ?? problem.relations.find(({ type }) => !relations.has(type));
  if (unknown) {
    return { status: "unsupported", verified: false, reason: `未対応の種類です (${unknown.type})。`,
      goals: [], trace: [], evaluations: 0 };
  }
  return solve(problem, math, [], true);
}
