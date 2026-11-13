import assert from "node:assert/strict";
import { cpus } from "node:os";
import { angle, length, property, solveGeometryProblem } from "../../js/geometry/index.js";

const triangle = { id: "T", type: "right_triangle", vertices: ["A", "B", "C"], rightAngleAt: "C" };
const given = (ref, value) => ({ ref, value });
const direct = { type: "geometry", objects: [triangle],
  givens: [given(length("A", "B"), 13), given(length("A", "C"), 5)], goals: [length("B", "C")] };
const compound = {
  type: "geometry",
  objects: [triangle, { id: "U", type: "triangle", vertices: ["D", "E", "F"] }],
  givens: [given(angle("B", "A", "C"), 30), given(angle("E", "D", "F"), 30),
    given(length("A", "B"), 10), given(length("D", "E"), 20)],
  goals: [length("E", "F"), length("D", "F"), property("U", "area")],
  relations: [
    { type: "parallel", lines: [["A", "C"], ["D", "F"]] },
    { type: "parallel_transversal", lines: [["A", "C"], ["D", "F"]],
      angles: [["A", "C", "B"], ["D", "F", "E"]], position: "alternate" },
    { type: "triangle_matches", first: "T", second: "U", correspondence: ["D", "E", "F"] },
  ],
};
const many = { type: "geometry", objects: [], givens: [], goals: [] };
for (let i = 0; i < 40; i++) {
  const id = `T${i}`;
  const [a, b, c] = ["A", "B", "C"].map((vertex) => `${vertex}${i}`);
  many.objects.push({ id, type: "triangle", vertices: [a, b, c] });
  many.givens.push(given(angle(b, a, c), 40), given(angle(a, b, c), 60));
  if (i < 32) many.goals.push(angle(a, c, b));
}

function measure(input, expected, repetitions) {
  for (let i = 0; i < 20; i++) assert.equal(solveGeometryProblem(input).status, "solved");
  const times = [];
  let result;
  for (let i = 0; i < repetitions; i++) {
    const start = performance.now();
    result = solveGeometryProblem(input);
    times.push(performance.now() - start);
  }
  assert.equal(result.status, "solved");
  assert.deepEqual(result.goals.map(({ value }) => value), expected);
  times.sort((a, b) => a - b);
  return { repetitions, medianMs: times[Math.floor(repetitions / 2)],
    p95Ms: times[Math.ceil(repetitions * 0.95) - 1], evaluations: result.evaluations, facts: result.trace.length };
}

console.log(JSON.stringify({
  environment: { platform: process.platform, cpu: cpus()[0].model, node: process.version },
  simple: measure(direct, ["12"], 200),
  compound: measure(compound, ["10", "10*√3", "50*√3"], 200),
  many: measure(many, Array(32).fill("80"), 50),
}, null, 2));
