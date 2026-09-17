import assert from "node:assert/strict";
import test from "node:test";

import {
  createCalculationRequest,
  inspectFormulaSafety,
  normalizeStructuredProblemSet,
} from "../js/problem/structured-input.js";
import { solveWorkflow } from "../js/solve-workflow.js";

function verifiedMock(answer = "ok") {
  return Object.freeze({
    supported: true,
    solved: true,
    verified: true,
    answer,
    resultKind: "exact",
    solverId: "test-solver",
    verification: "test verification",
    conditions: [],
    solutionTrace: [],
  });
}

test("single acquisition becomes a one-item StructuredProblemSet with provenance", () => {
  const set = normalizeStructuredProblemSet({
    questionLabel: "(1)",
    instructionText: "次の方程式を解け",
    formulaText: "3*(x+1)=12",
    conditions: [],
    source: "selection",
    instructionSource: "selection",
    formulaSource: "selection",
  });

  assert.equal(set.items.length, 1);
  assert.equal(set.source, "selection");
  assert.equal(set.items[0].order, 0);
  assert.match(set.items[0].id, /^problem-0-/u);
  assert.equal(set.items[0].questionLabel, "(1)");
  assert.equal(set.items[0].instructionIntent, "solve_equation");
  assert.equal(set.items[0].fieldProvenance.formulaText.source, "selection");
  assert.equal(set.items[0].recognitionStatus, "not_applicable");
});

test("plain lost-exponent shapes are terminal ambiguous_structure without guessing", () => {
  for (const formula of ["x2", "(x-3)2", "[x+1]2"]) {
    const safety = inspectFormulaSafety(formula);
    assert.equal(safety.safe, false, formula);
    assert.equal(safety.code, "ambiguous_structure", formula);

    const problem = normalizeStructuredProblemSet({ formulaText: formula, source: "clipboard" }).items[0];
    assert.equal(problem.status, "ambiguous", formula);
    assert.equal(problem.terminalCode, "ambiguous_structure", formula);
    assert.match(problem.error, /\^2 または \*2/u, formula);
  }
});

test("explicit multiplication and exponent syntax remain ready", () => {
  for (const formula of ["(x-3)*2", "(x-3)^2", "(2)*(x+1)", "(1+x)(1-x)"]) {
    const set = normalizeStructuredProblemSet({ formulaText: formula, source: "manual" });
    assert.equal(set.items[0].status, "ready", formula);
  }
});

test("semantic provenance is preserved but never used to invent missing structure", () => {
  const semantic = normalizeStructuredProblemSet(
    { formulaText: "(x-3)^2", source: "clipboard" },
    { formulaStructure: "semantic" },
  );
  assert.equal(semantic.items[0].status, "ready");
  assert.equal(semantic.items[0].fieldProvenance.formulaText.structure, "semantic");

  const malformedSemantic = normalizeStructuredProblemSet(
    { formulaText: "(x-3)2", source: "clipboard" },
    { formulaStructure: "semantic" },
  );
  assert.equal(malformedSemantic.items[0].status, "ambiguous");
});

test("terminal acquisition status remains terminal after structured normalization", () => {
  const first = normalizeStructuredProblemSet({
    formulaText: "x+1",
    source: "clipboard",
    status: "conflict",
    error: "conflicting acquisition",
  });
  assert.equal(first.items[0].status, "conflict");

  const second = normalizeStructuredProblemSet(first);
  assert.equal(second.items[0].status, "conflict");
  assert.equal(second.items[0].error, "conflicting acquisition");
});

test("OCR candidate remains pending until explicit confirmation boundary", () => {
  const set = normalizeStructuredProblemSet({
    status: "unconfirmed",
    confirmationRequired: true,
    formulaText: "(x-3)^2",
    source: "ocr",
  });
  assert.equal(set.items[0].status, "unconfirmed");
  assert.equal(set.items[0].recognitionStatus, "candidate");
});

test("multi-problem input remains independent items instead of one formula string", () => {
  const set = normalizeStructuredProblemSet({
    sharedInstructionText: "次の式を展開せよ",
    source: "ocr",
    items: [
      { questionLabel: "(1)", formulaText: "(x+1)^2", recognitionStatus: "confirmed" },
      { questionLabel: "(2)", formulaText: "(2*x-3)*(x+4)", recognitionStatus: "confirmed" },
      { questionLabel: "(3)", formulaText: "(x-5)*(x+5)", recognitionStatus: "confirmed" },
    ],
  });
  assert.equal(set.items.length, 3);
  assert.deepEqual(set.items.map((item) => item.questionLabel), ["(1)", "(2)", "(3)"]);
  assert.deepEqual(set.items.map((item) => item.order), [0, 1, 2]);
  assert.equal(set.sharedInstructionText, "次の式を展開せよ");
});

test("calculation request preserves instruction intent but defers operation authority", () => {
  const request = createCalculationRequest({
    instructionText: "次の方程式を解け",
    formulaText: "3*x=12",
    source: "selection",
  });
  assert.equal(request.status, "ready_for_operation_resolution");
  assert.equal(request.requestedOperation, "solve_equation");
});

test("solveWorkflow rejects ambiguous structure before classifier or solver", async () => {
  let classifierCalls = 0;
  let solverCalls = 0;
  const result = await solveWorkflow("(x-3)2=4", {
    classifier: () => {
      classifierCalls += 1;
      return { primary: "方程式" };
    },
    solver: async () => {
      solverCalls += 1;
      return verifiedMock("x=5");
    },
    presenter: () => ({ content: "x=5", finalAnswer: "x=5" }),
  });

  assert.equal(classifierCalls, 0);
  assert.equal(solverCalls, 0);
  assert.equal(result.presentable, false);
  assert.equal(result.structuredProblem.status, "ambiguous");
  assert.equal(result.structuredProblem.terminalCode, "ambiguous_structure");
  assert.equal(result.solverResult.verified, false);
});

test("solveWorkflow still accepts explicit syntax through the structured gate", async () => {
  let solverInput = "";
  const result = await solveWorkflow("(x-3)^2=4", {
    classifier: () => ({ primary: "方程式" }),
    solver: async (input) => {
      solverInput = input;
      return verifiedMock("x=1,5");
    },
    presenter: (solverResult) => ({
      content: solverResult.answer,
      finalAnswer: solverResult.answer,
    }),
  });

  assert.equal(solverInput, "(x-3)^2=4");
  assert.equal(result.presentable, true);
  assert.equal(result.problemSet.items.length, 1);
  assert.equal(result.solverResult.verified, true);
});
