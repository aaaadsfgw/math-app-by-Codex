import assert from "node:assert/strict";
import test from "node:test";

import {
  compileStructuredProblemSet,
  createCalculationRequest,
  inspectFormulaSafety,
  normalizeStructuredProblemSet,
} from "../js/problem/structured-input.js";
import { normalizeProblemInput } from "../js/problem/problem-input.js";
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
  for (const formula of [
    "(x-3)*2",
    "(x-3)^2",
    "(2)*(x+1)",
    "(1+x)(1-x)",
    "log2(x)",
    "x²",
    "(x−3)²",
  ]) {
    const set = normalizeStructuredProblemSet({ formulaText: formula, source: "manual" });
    assert.equal(set.items[0].status, "ready", formula);
  }
});

test("Unicode superscripts stay explicit before compatibility normalization", () => {
  assert.deepEqual(inspectFormulaSafety("x²"), {
    safe: true,
    code: null,
    message: "",
  });
  assert.equal(inspectFormulaSafety("(x−3)²").safe, true);
  assert.equal(inspectFormulaSafety("x2").safe, false);
  assert.equal(inspectFormulaSafety("(x-3)2").safe, false);
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

test("structured normalization is idempotent for terminal codes and semantic provenance", () => {
  const semantic = normalizeStructuredProblemSet(
    { formulaText: "(x-3)^2", source: "clipboard" },
    { formulaStructure: "semantic" },
  );
  assert.deepEqual(normalizeStructuredProblemSet(semantic), semantic);

  const ambiguous = normalizeStructuredProblemSet({
    formulaText: "(x-3)2",
    source: "clipboard",
  });
  assert.equal(ambiguous.items[0].terminalCode, "ambiguous_structure");
  assert.deepEqual(normalizeStructuredProblemSet(ambiguous), ambiguous);
});

test("canonical item edits replace stale nested legacy values", () => {
  const original = normalizeStructuredProblemSet({
    instructionText: "次の方程式を解け",
    formulaText: "x=2",
    source: "selection",
  });
  const edited = normalizeStructuredProblemSet({
    ...original.items[0],
    formulaText: "x=100",
  });
  const compiled = compileStructuredProblemSet(edited);

  assert.equal(compiled.ok, true);
  assert.equal(compiled.problem.formulaText, "x=100");
  assert.equal(compiled.problemInput.formulaText, "x=100");
  assert.equal(compiled.problemInput.instructionIntent, "solve_equation");
  assert.equal(edited.items[0].fieldProvenance.formulaText.structure, "plain");
  assert.equal(edited.items[0].fieldProvenance.formulaText.source, "manual");
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

test("raw OCR confirmation claims cannot bypass the trusted option", () => {
  const claimed = compileStructuredProblemSet({
    status: "ready",
    confirmationRequired: true,
    recognitionStatus: "confirmed",
    ocrConfirmed: true,
    formulaText: "x=2",
    source: "ocr",
  });
  assert.equal(claimed.ok, false);
  assert.equal(claimed.problem.recognitionStatus, "candidate");
  assert.equal(claimed.problem.status, "pending_confirmation");

  const trusted = compileStructuredProblemSet({
    status: "unconfirmed",
    confirmationRequired: true,
    recognitionStatus: "confirmed",
    formulaText: "x=2",
    source: "ocr",
  }, { ocrConfirmed: true });
  assert.equal(trusted.ok, true);
  assert.equal(trusted.problem.recognitionStatus, "confirmed");
  assert.equal(trusted.problem.status, "ready");
  assert.equal(trusted.problem.terminalCode, null);
  assert.equal(trusted.problem.error, "");
  assert.equal(trusted.problemSet.terminalCode, null);
  assert.equal(trusted.problemSet.error, "");

  const provenanceOnly = compileStructuredProblemSet({
    formulaText: "x=2",
    source: "review",
    formulaSource: "ocr",
  });
  assert.equal(provenanceOnly.ok, false);
  assert.equal(provenanceOnly.problem.recognitionStatus, "candidate");

  const trustedSourceOption = compileStructuredProblemSet({
    formulaText: "x=2",
    source: "manual",
  }, { source: "ocr" });
  assert.equal(trustedSourceOption.ok, false);
  assert.equal(trustedSourceOption.problem.recognitionStatus, "candidate");
});

test("set-level schema, terminal status, and confirmation state gate compilation", () => {
  const unknownSchema = compileStructuredProblemSet({
    schemaVersion: 99,
    items: [{ formulaText: "x=2" }],
  });
  assert.equal(unknownSchema.ok, false);
  assert.equal(unknownSchema.problemSet.status, "invalid");
  assert.equal(unknownSchema.failureSource, "structured-input");

  const invalidRecognition = compileStructuredProblemSet({
    schemaVersion: 1,
    recognitionStatus: "accepted",
    items: [{ formulaText: "x=2" }],
  });
  assert.equal(invalidRecognition.ok, false);
  assert.equal(invalidRecognition.problemSet.status, "invalid");

  const terminal = compileStructuredProblemSet({
    schemaVersion: 1,
    status: "unsupported",
    error: "set acquisition failed",
    items: [{ formulaText: "x=2" }],
  });
  assert.equal(terminal.ok, false);
  assert.equal(terminal.error, "set acquisition failed");

  const candidate = compileStructuredProblemSet({
    schemaVersion: 1,
    recognitionStatus: "candidate",
    items: [{ formulaText: "x=2", recognitionStatus: "not_applicable" }],
  });
  assert.equal(candidate.ok, false);
  assert.equal(candidate.problemSet.recognitionStatus, "candidate");
  assert.equal(candidate.problemSet.status, "pending_confirmation");

  const inheritedOcr = compileStructuredProblemSet({
    schemaVersion: 1,
    source: "ocr",
    items: [{ formulaText: "x=2", source: "manual" }],
  });
  assert.equal(inheritedOcr.ok, false);
  assert.equal(inheritedOcr.problem.recognitionStatus, "candidate");
});

test("unknown item recognition status stops before classifier and solver", async () => {
  let classifierCalls = 0;
  let solverCalls = 0;
  const result = await solveWorkflow({
    formulaText: "x=2",
    recognitionStatus: "accepted",
  }, {
    classifier: () => {
      classifierCalls += 1;
      return { primary: "方程式" };
    },
    solver: async () => {
      solverCalls += 1;
      return verifiedMock("x=2");
    },
  });

  assert.equal(result.presentable, false);
  assert.equal(result.structuredProblem.status, "invalid");
  assert.equal(result.structuredProblem.terminalCode, "invalid_recognition_status");
  assert.equal(classifierCalls, 0);
  assert.equal(solverCalls, 0);

  const unknownSchema = await solveWorkflow({
    schemaVersion: 99,
    formulaText: "x=2",
  }, {
    classifier: () => {
      classifierCalls += 1;
      return { primary: "方程式" };
    },
    solver: async () => {
      solverCalls += 1;
      return verifiedMock("x=2");
    },
  });
  assert.equal(unknownSchema.presentable, false);
  assert.equal(unknownSchema.structuredProblem.status, "invalid");
  assert.equal(classifierCalls, 0);
  assert.equal(solverCalls, 0);
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

test("shared instruction applies to one item while an item instruction takes priority", () => {
  const shared = compileStructuredProblemSet({
    sharedInstructionText: "次の式を展開せよ",
    items: [{ formulaText: "(x+1)^2" }],
  });
  assert.equal(shared.ok, true);
  assert.equal(shared.problemInput.instructionIntent, "expand");

  const itemWins = compileStructuredProblemSet({
    sharedInstructionText: "次の式を展開せよ",
    items: [{
      instructionText: "次の方程式を解け",
      formulaText: "2*x=4",
    }],
  });
  assert.equal(itemWins.ok, true);
  assert.equal(itemWins.problemInput.instructionIntent, "solve_equation");

  const itemIntentWins = compileStructuredProblemSet({
    sharedInstructionText: "次の式を展開せよ",
    items: [{
      instructionIntent: "solve_equation",
      formulaText: "2*x=4",
    }],
  });
  assert.equal(itemIntentWins.ok, true);
  assert.equal(itemIntentWins.problemInput.instructionIntent, "solve_equation");

  const conflict = compileStructuredProblemSet({
    sharedInstructionText: "次の式を展開せよ",
    items: [{ formulaText: "2*x=4" }],
  });
  assert.equal(conflict.ok, false);
  assert.equal(conflict.kind, "invalid");
  assert.equal(conflict.failureSource, "structured-input");
});

test("item order follows the array and duplicate ids are replaced deterministically", () => {
  const set = normalizeStructuredProblemSet({
    items: [
      { id: "same", order: 20, formulaText: "x+1" },
      { id: "same", order: 10, formulaText: "x+2" },
    ],
  });
  assert.deepEqual(set.items.map((item) => item.order), [0, 1]);
  assert.equal(set.items[0].id, "same");
  assert.notEqual(set.items[1].id, "same");
  assert.equal(new Set(set.items.map((item) => item.id)).size, 2);
});

test("item limits, sparse arrays, and hostile accessors fail closed", () => {
  const tooMany = normalizeStructuredProblemSet({
    items: Array.from({ length: 65 }, (_, index) => ({ formulaText: `x+${index}` })),
  });
  assert.equal(tooMany.status, "invalid");

  const sparseItems = [];
  sparseItems.length = 2;
  sparseItems[1] = { formulaText: "x+1" };
  const sparse = normalizeStructuredProblemSet({ items: sparseItems });
  assert.equal(sparse.status, "invalid");

  const hostile = new Proxy({}, {
    get() {
      throw new Error("must stay inside the input boundary");
    },
  });
  assert.doesNotThrow(() => normalizeStructuredProblemSet(hostile));
  const compiled = compileStructuredProblemSet(hostile);
  assert.equal(compiled.ok, false);
  assert.equal(compiled.problemSet.status, "invalid");
});

test("compile failures identify legacy ProblemInput and structured boundaries", () => {
  const legacy = normalizeProblemInput({
    formulaText: "x+1",
    status: "unsupported",
    error: "legacy terminal",
  });
  const legacyFailure = compileStructuredProblemSet(legacy);
  assert.equal(legacyFailure.ok, false);
  assert.equal(legacyFailure.failureSource, "problem-input");
  assert.equal(
    compileStructuredProblemSet(legacyFailure.problemSet).failureSource,
    "problem-input",
  );

  const structuredFailure = compileStructuredProblemSet({
    formulaText: "x+1",
    status: "unsupported",
    error: "acquisition terminal",
  });
  assert.equal(structuredFailure.ok, false);
  assert.equal(structuredFailure.failureSource, "structured-input");
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

test("calculation request uses the effective shared instruction intent", () => {
  const request = createCalculationRequest({
    sharedInstructionText: "次の式を因数分解せよ",
    items: [{ formulaText: "x^2-1" }],
  });
  assert.equal(request.status, "ready_for_operation_resolution");
  assert.equal(request.requestedOperation, "factor");
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
