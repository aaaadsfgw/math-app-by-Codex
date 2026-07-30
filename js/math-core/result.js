export const RESULT_KINDS = Object.freeze({
  EXACT: "exact",
  APPROXIMATE: "approximate",
  CONDITIONAL: "conditional",
  UNSUPPORTED: "unsupported",
  INVALID: "invalid",
});

const SOLVED_KINDS = new Set([
  RESULT_KINDS.EXACT,
  RESULT_KINDS.APPROXIMATE,
  RESULT_KINDS.CONDITIONAL,
]);

function text(value) {
  return String(value ?? "").trim();
}

function freezeSteps(steps) {
  if (!Array.isArray(steps)) throw new TypeError("途中式は配列で指定してください。");
  return Object.freeze(steps.map((step, index) => {
    if (typeof step === "string") {
      const content = text(step);
      if (!content) throw new TypeError(`途中式 ${index + 1} が空です。`);
      return Object.freeze({ type: "transformation", content });
    }
    const content = text(step?.content);
    if (!content) throw new TypeError(`途中式 ${index + 1} が空です。`);
    return Object.freeze({
      type: text(step.type) || "transformation",
      content,
      explanation: text(step.explanation),
    });
  }));
}

export function createSolvedMathResult({
  kind = RESULT_KINDS.EXACT,
  answer,
  exactAnswer = "",
  approximateAnswer = "",
  conditions = [],
  steps = [],
  verification,
  domain,
  solverId,
  metadata = {},
} = {}) {
  if (!SOLVED_KINDS.has(kind)) throw new TypeError("解答結果の種類が正しくありません。");
  const finalAnswer = text(answer);
  if (!finalAnswer) throw new TypeError("解答結果には最終回答が必要です。");
  const verificationMethod = text(verification?.method);
  const verificationEvidence = text(verification?.evidence);
  if (!verificationMethod || !verificationEvidence) {
    throw new TypeError("解答結果には検証方法と検証根拠が必要です。");
  }
  const normalizedConditions = Object.freeze(conditions.map(text).filter(Boolean));
  if (kind === RESULT_KINDS.CONDITIONAL && !normalizedConditions.length) {
    throw new TypeError("条件付き結果には条件が必要です。");
  }
  if (kind === RESULT_KINDS.APPROXIMATE && !text(approximateAnswer || finalAnswer)) {
    throw new TypeError("近似結果には近似値が必要です。");
  }

  return Object.freeze({
    kind,
    supported: true,
    solved: true,
    verified: true,
    answer: finalAnswer,
    exactAnswer: text(exactAnswer || (kind === RESULT_KINDS.EXACT ? finalAnswer : "")),
    approximateAnswer: text(
      approximateAnswer || (kind === RESULT_KINDS.APPROXIMATE ? finalAnswer : ""),
    ),
    conditions: normalizedConditions,
    steps: freezeSteps(steps),
    verification: Object.freeze({
      status: "verified",
      method: verificationMethod,
      evidence: verificationEvidence,
    }),
    domain: text(domain) || "other",
    solverId: text(solverId) || null,
    error: null,
    metadata: Object.freeze({ ...metadata }),
  });
}

function createUnsolvedMathResult(kind, {
  reason,
  code,
  domain = "other",
  metadata = {},
} = {}) {
  const message = text(reason);
  if (!message) throw new TypeError("未解決結果には理由が必要です。");
  return Object.freeze({
    kind,
    supported: kind !== RESULT_KINDS.UNSUPPORTED,
    solved: false,
    verified: false,
    answer: "",
    exactAnswer: "",
    approximateAnswer: "",
    conditions: Object.freeze([]),
    steps: Object.freeze([]),
    verification: Object.freeze({
      status: "not-verified",
      method: "",
      evidence: "",
    }),
    domain: text(domain) || "other",
    solverId: null,
    error: Object.freeze({
      code: text(code) || (kind === RESULT_KINDS.INVALID ? "INVALID_INPUT" : "UNSUPPORTED"),
      message,
    }),
    metadata: Object.freeze({ ...metadata }),
  });
}

export function createUnsupportedMathResult(options) {
  return createUnsolvedMathResult(RESULT_KINDS.UNSUPPORTED, options);
}

export function createInvalidMathResult(options) {
  return createUnsolvedMathResult(RESULT_KINDS.INVALID, options);
}

export function isPresentableMathResult(result) {
  return Boolean(
    result
    && SOLVED_KINDS.has(result.kind)
    && result.supported
    && result.solved
    && result.verified
    && text(result.answer),
  );
}

export function toLegacySolverResult(result) {
  if (isPresentableMathResult(result)) {
    return {
      supported: true,
      solved: true,
      answer: result.answer,
      exactAnswer: result.exactAnswer,
      approximateAnswer: result.approximateAnswer,
      steps: result.steps.map((step) => step.content),
      solutionTrace: result.steps.map((step) => ({
        type: step.type,
        content: step.content,
        explanation: step.explanation || "",
      })),
      verified: true,
      verification: result.verification.evidence,
      solverId: result.solverId,
      error: null,
      resultKind: result.kind,
      conditions: [...result.conditions],
    };
  }
  return {
    supported: result?.kind !== RESULT_KINDS.UNSUPPORTED,
    solved: false,
    answer: "",
    exactAnswer: "",
    approximateAnswer: "",
    steps: [],
    solutionTrace: [],
    verified: false,
    verification: "",
    solverId: null,
    error: text(result?.error?.message) || "問題を解けませんでした。",
    resultKind: result?.kind || RESULT_KINDS.INVALID,
    conditions: [],
  };
}
