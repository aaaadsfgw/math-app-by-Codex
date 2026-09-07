import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  ASSESSMENT_SCORES,
  DEFAULT_SETTINGS,
  addHistory,
  clearAllData,
  createHistoryRecord,
  deleteHistory,
  exportData,
  exportDataAsJson,
  getAnalytics,
  getHistory,
  getPendingQuestion,
  getReviewItems,
  getSettings,
  importData,
  recordOutputView,
  resetSettings,
  saveSettings,
  setPendingQuestion,
  takePendingQuestion,
  updateHistory,
} from "../js/storage.js";
import { solveRationalInequality } from "../js/solver/rational-inequality.js";
import { historyInput, installStorageFixture } from "./storage-fixtures.mjs";

let fixture;

beforeEach(() => {
  fixture = installStorageFixture();
});

afterEach(() => {
  fixture.restore();
});

test("defaults are complete and corrupt stored values degrade safely", async () => {
  fixture.localStorage.setItem("settings", "{broken-json");
  fixture.localStorage.setItem("history", JSON.stringify({ not: "an array" }));

  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS);
  assert.deepEqual(await getHistory(), []);
  assert.equal(ASSESSMENT_SCORES.self_solved, 100);
  assert.equal(ASSESSMENT_SCORES.answer_seen, 0);
  assert.equal(ASSESSMENT_SCORES.unassessed, null);
});

test("settings merge defaults, sanitize invalid values, and reset", async () => {
  const saved = await saveSettings({
    defaultMode: "hint2",
    saveHistory: false,
    maxHistory: -10,
    learningMode: "invalid",
    shortcutAction: "explain",
    apiUrl: "legacy-url",
    modelName: "legacy-model",
  });
  assert.equal(saved.defaultMode, "hint2");
  assert.equal(saved.saveHistory, false);
  assert.equal(saved.maxHistory, DEFAULT_SETTINGS.maxHistory);
  assert.equal(saved.learningMode, "study");
  assert.equal(saved.shortcutAction, "answer");
  assert.equal(Object.hasOwn(saved, "apiUrl"), false);
  assert.equal(Object.hasOwn(saved, "modelName"), false);
  const v2Settings = await saveSettings({ learningMode: "quick", shortcutAction: "hint2" });
  assert.equal(v2Settings.learningMode, "quick");
  assert.equal(v2Settings.shortcutAction, "hint2");
  assert.deepEqual(await resetSettings(), DEFAULT_SETTINGS);
});

test("createHistoryRecord derives score, category details, verification, and review state", () => {
  const record = createHistoryRecord(
    historyInput({
      category: {
        primary: "一次方程式",
        candidates: ["一次方程式", "その他"],
        confidence: 0.9,
        reason: "xを含む等式",
      },
      selfAssessment: "hint1_solved",
      mode: "hint1",
    }),
  );
  assert.equal(record.score, 80);
  assert.equal(record.needsReview, false);
  assert.equal(record.category, "一次方程式");
  assert.equal(record.categoryClassification.reason, "xを含む等式");
  assert.equal(record.verified, true);
  assert.equal(record.resultKind, "exact");
  assert.deepEqual(record.conditions, []);
  assert.equal(record.recordSchemaVersion, 2);
  assert.equal(record.learningMode, "study");
  assert.equal(record.entryPoint, "popup");
  assert.deepEqual(record.usage, {
    viewedModes: ["hint1"],
    firstViewedMode: "hint1",
    lastViewedMode: "hint1",
    hint1Viewed: true,
    hint2Viewed: false,
    stepsViewed: false,
    explainViewed: false,
    answerViewed: false,
    directAnswerViewed: false,
  });

  const ocrRecord = createHistoryRecord(historyInput({
    source: "ocr",
    entryPoint: "popup",
    mode: "hint1",
    usage: { viewedModes: ["hint1", "bogus", "hint1", "steps", "answer"] },
    ocrConfirmed: true,
  }));
  assert.deepEqual(ocrRecord.usage.viewedModes, ["hint1", "steps", "answer"]);
  assert.equal(ocrRecord.usage.firstViewedMode, "hint1");
  assert.equal(ocrRecord.usage.lastViewedMode, "answer");
  assert.equal(ocrRecord.usage.answerViewed, true);
  assert.equal(ocrRecord.usage.directAnswerViewed, false);
  assert.equal(ocrRecord.ocrUsed, true);
  assert.equal(ocrRecord.ocrConfirmed, true);

  const conditional = createHistoryRecord(
    historyInput({
      resultKind: "conditional",
      conditions: ["(x-1)≠0", " (x-1)≠0 "],
      solutionTrace: [
        { type: "input", content: " (x^2-1)/(x-1) " },
        { type: "result", content: "x+1", explanation: "約分" },
      ],
    }),
  );
  assert.equal(conditional.resultKind, "conditional");
  assert.deepEqual(conditional.conditions, ["(x-1)≠0"]);
  assert.deepEqual(conditional.solutionTrace, [
    { type: "input", content: "(x^2-1)/(x-1)", explanation: "" },
    { type: "result", content: "x+1", explanation: "約分" },
  ]);

  const intervalRecord = createHistoryRecord(
    historyInput({
      solutionSet: {
        kind: "intervals",
        intervals: [{
          lower: { exact: "2", approximate: 2 },
          upper: { exact: "3", approximate: 3 },
          lowerClosed: true,
          upperClosed: true,
        }],
      },
    }),
  );
  assert.equal(intervalRecord.solutionSet.kind, "intervals");
  assert.equal(intervalRecord.solutionSet.intervals[0].lower.exact, "2");

  const shortcut = createHistoryRecord(
    historyInput({ selfAssessment: undefined, source: "shortcut" }),
  );
  assert.equal(shortcut.selfAssessment, "unassessed");
  assert.equal(shortcut.score, null);
  assert.equal(shortcut.needsReview, true);
  assert.equal(shortcut.source, "shortcut");
  assert.equal(shortcut.entryPoint, "shortcut");

  const rational = createHistoryRecord(historyInput({
    category: {
      primary: "一次方程式",
      candidates: ["一次方程式"],
      confidence: 0.7,
      reason: "旧分類",
    },
    solverId: "rational-equation",
  }));
  assert.equal(rational.category, "分数方程式");
  assert.equal(rational.categoryClassification.primary, "分数方程式");
  assert.deepEqual(
    rational.categoryClassification.candidates,
    ["分数方程式", "一次方程式"],
  );

  const unverifiedSpoof = createHistoryRecord(historyInput({
    category: "一次方程式",
    solverId: "rational-equation",
    verified: false,
    verificationType: "unsupported",
  }));
  assert.equal(unverifiedSpoof.category, "一次方程式");

  const exponential = createHistoryRecord(historyInput({
    category: "一次方程式",
    solverId: "exponential-equation",
  }));
  assert.equal(exponential.category, "指数・対数");
  assert.equal(exponential.categoryClassification.primary, "指数・対数");

  const logarithmic = createHistoryRecord(historyInput({
    category: "一次方程式",
    solverId: "logarithmic-equation",
    resultKind: "conditional",
    conditions: ["x>0"],
  }));
  assert.equal(logarithmic.category, "指数・対数");
  assert.equal(logarithmic.categoryClassification.primary, "指数・対数");
  assert.equal(logarithmic.resultKind, "conditional");
  assert.deepEqual(logarithmic.conditions, ["x>0"]);

  const rationalInequalityResult = solveRationalInequality("1/(x-1)>0");
  const rationalInequality = createHistoryRecord(historyInput({
    question: "1/(x-1)>0",
    output: rationalInequalityResult.answer,
    finalAnswer: rationalInequalityResult.answer,
    category: "分数方程式",
    solverId: rationalInequalityResult.solverId,
    resultKind: rationalInequalityResult.resultKind,
    conditions: rationalInequalityResult.conditions,
    solutionSet: rationalInequalityResult.solutionSet,
    solutionTrace: rationalInequalityResult.solutionTrace,
    verificationMessage: rationalInequalityResult.verification,
  }));
  assert.equal(rationalInequality.category, "不等式");
  assert.equal(rationalInequality.categoryClassification.primary, "不等式");
  assert.equal(rationalInequality.resultKind, "conditional");
  assert.deepEqual(rationalInequality.conditions, ["x≠1"]);
  assert.equal(rationalInequality.solutionSet.intervals[0].lower.exact, "1");
  assert.equal(rationalInequality.solutionTrace[1].type, "constraint");
});

test("unverified and malformed result metadata cannot retain solver conditions", () => {
  const unverified = createHistoryRecord(
    historyInput({
      verified: false,
      verificationType: "unsupported",
      resultKind: "conditional",
      conditions: ["x≠0"],
      solutionTrace: [{ type: "result", content: "forged" }],
      solutionSet: { kind: "all-real", intervals: [] },
      source: "ocr",
      ocrConfirmed: true,
    }),
  );
  assert.equal(unverified.resultKind, "unsupported");
  assert.deepEqual(unverified.conditions, []);
  assert.deepEqual(unverified.solutionTrace, []);
  assert.equal(unverified.solutionSet, null);
  assert.equal(unverified.ocrConfirmed, true);
  assert.equal(unverified.verified, false);

  assert.throws(
    () => createHistoryRecord(
      historyInput({
        resultKind: "conditional",
        conditions: [],
      }),
    ),
    /条件が必要/,
  );
});

test("history add enforces newest-first max count and supports update/delete", async () => {
  await saveSettings({ maxHistory: 2 });
  const first = await addHistory(
    historyInput({ question: "first", id: "first", createdAt: "2026-01-01T00:00:00.000Z" }),
  );
  await addHistory(
    historyInput({ question: "second", id: "second", createdAt: "2026-01-02T00:00:00.000Z" }),
  );
  await addHistory(
    historyInput({ question: "third", id: "third", createdAt: "2026-01-03T00:00:00.000Z" }),
  );
  assert.equal(first.id, "first");
  assert.deepEqual((await getHistory()).map(({ id }) => id), ["third", "second"]);

  const updated = await updateHistory("second", {
    mode: "hint1",
    selfAssessment: "self_solved",
    needsReview: false,
  });
  assert.equal(updated.score, 100);
  assert.equal(updated.needsReview, false);
  assert.equal(await updateHistory("missing", { output: "none" }), null);
  assert.equal(await deleteHistory("second"), true);
  assert.equal(await deleteHistory("second"), false);
});

test("recordOutputView appends unique output usage atomically without changing the first mode", async () => {
  await addHistory(historyInput({
    id: "session",
    mode: "hint1",
    selfAssessment: "hint1_solved",
    usage: { viewedModes: ["hint1"] },
  }));

  await Promise.all([
    recordOutputView("session", "hint2", { output: "hint 2" }),
    recordOutputView("session", "steps", { output: "steps" }),
    recordOutputView("session", "answer", { output: "answer" }),
    recordOutputView("session", "answer", { output: "answer again" }),
  ]);

  const [record] = await getHistory();
  assert.equal(record.mode, "hint1");
  assert.deepEqual(record.usage.viewedModes, ["hint1", "hint2", "steps", "answer"]);
  assert.equal(record.usage.firstViewedMode, "hint1");
  assert.equal(record.usage.lastViewedMode, "answer");
  assert.equal(record.usage.hint2Viewed, true);
  assert.equal(record.usage.stepsViewed, true);
  assert.equal(record.usage.answerViewed, true);
  assert.equal(record.usage.directAnswerViewed, false);
  assert.equal(record.selfAssessment, "hint1_solved");
  assert.equal(await recordOutputView("missing", "answer"), null);
  await assert.rejects(() => recordOutputView("session", "invalid"), /出力モード/);
});

test("Answerを後から表示すると未評価だけをanswer_seenへ更新する", async () => {
  await addHistory(historyInput({
    id: "answer-later",
    mode: "hint1",
    selfAssessment: "unassessed",
    usage: { viewedModes: ["hint1"] },
  }));

  const updated = await recordOutputView("answer-later", "answer", { output: "x=4" });
  assert.equal(updated.selfAssessment, "answer_seen");
  assert.equal(updated.score, 0);
  assert.equal(updated.usage.answerViewed, true);
});

test("concurrent history additions are serialized without losing records", async () => {
  const count = 25;
  await Promise.all(
    Array.from({ length: count }, (_, index) =>
      addHistory(
        historyInput({
          id: `concurrent-${index}`,
          question: `concurrent question ${index}`,
        }),
      ),
    ),
  );

  const history = await getHistory();
  assert.equal(history.length, count);
  assert.deepEqual(
    new Set(history.map(({ id }) => id)),
    new Set(Array.from({ length: count }, (_, index) => `concurrent-${index}`)),
  );
});

test("Quick Mode records are ephemeral and excluded defensively from analytics and review", async () => {
  const quickInput = historyInput({
    id: "quick",
    learningMode: "quick",
    source: "clipboard",
    entryPoint: "shortcut",
    usage: { viewedModes: ["answer"] },
  });
  assert.equal(await addHistory(quickInput), null);
  assert.deepEqual(await getHistory(), []);

  const analytics = await getAnalytics([
    quickInput,
    historyInput({
      id: "study",
      learningMode: "study",
      source: "selection",
      entryPoint: "shortcut",
      mode: "hint1",
      selfAssessment: "hint1_solved",
    }),
  ]);
  assert.equal(analytics.totalCount, 1);
  assert.equal(analytics.hint1UsageCount, 1);
  assert.equal(analytics.directAnswerCount, 0);

  await importData({ history: [quickInput] });
  assert.equal((await getAnalytics()).totalCount, 0);
  assert.deepEqual(await getReviewItems(), []);
});

test("score and repeated-category rules produce review items in priority order", async () => {
  await addHistory(
    historyInput({
      id: "high",
      question: "high",
      mode: "hint1",
      selfAssessment: "hint1_solved",
      createdAt: "2026-01-03T00:00:00.000Z",
    }),
  );
  await addHistory(
    historyInput({
      id: "low-1",
      question: "low1",
      mode: "hint2",
      selfAssessment: "hint2_solved",
      createdAt: "2026-01-02T00:00:00.000Z",
    }),
  );
  await addHistory(
    historyInput({
      id: "low-2",
      question: "low2",
      mode: "steps",
      selfAssessment: "steps_solved",
      createdAt: "2026-01-01T00:00:00.000Z",
    }),
  );

  const items = await getReviewItems();
  assert.equal(items.length, 3);
  assert.ok(items.every((item) => item.categoryRecentLowCount === 2));
  assert.equal(items[0].id, "low-2");
  assert.equal(items[0].reviewPriority, 1_100);
  assert.deepEqual(items[0].reviewPrioritySignals, {
    repeatedCategoryDifficulty: 1_000,
    scoreGap: 60,
    directAnswer: 0,
    steps: 40,
    hint2: 0,
    legacyUnverifiedAi: 0,
  });

  const completed = await updateHistory("low-2", { needsReview: false });
  assert.equal(completed.needsReview, false);
  assert.equal(completed.reviewCount, 1);
  assert.equal((await getReviewItems()).some(({ id }) => id === "low-2"), false);
});

test("pending questions retain parent history identifiers", async () => {
  const pending = await setPendingQuestion("x+1=2", "history-1");
  assert.equal(pending.parentHistoryId, "history-1");
  assert.equal(pending.source, "review");
  assert.equal(pending.ocrConfirmed, false);
  assert.equal(pending.requestedMode, null);
  assert.equal(pending.autoSolve, false);
  assert.deepEqual(await getPendingQuestion(), pending);
  assert.deepEqual(await takePendingQuestion(), pending);
  assert.equal(await getPendingQuestion(), null);
  assert.equal(await takePendingQuestion(), null);
});

test("confirmed OCR pending questions retain only text workflow metadata", async () => {
  const pending = await setPendingQuestion({
    question: "  x^2 = 4  ",
    source: "ocr",
    ocrConfirmed: true,
    requestedMode: "answer",
    autoSolve: true,
    image: "data:image/png;base64,forbidden",
    previewUrl: "blob:forbidden",
  });

  assert.deepEqual(pending, {
    question: "x^2 = 4",
    parentHistoryId: null,
    source: "ocr",
    ocrConfirmed: true,
    requestedMode: "answer",
    autoSolve: true,
    createdAt: pending.createdAt,
  });
  assert.deepEqual(await takePendingQuestion(), pending);
  assert.equal(Object.hasOwn(pending, "image"), false);
  assert.equal(Object.hasOwn(pending, "previewUrl"), false);
  assert.equal(Object.hasOwn(pending, "blob"), false);
});

test("unconfirmed or non-OCR pending questions cannot request automatic solving", async () => {
  const unconfirmed = await setPendingQuestion({
    question: "x=1",
    source: "ocr",
    ocrConfirmed: false,
    requestedMode: "answer",
    autoSolve: true,
  });
  assert.equal(unconfirmed.ocrConfirmed, false);
  assert.equal(unconfirmed.autoSolve, false);

  const manual = await setPendingQuestion({
    question: "x=2",
    source: "manual",
    ocrConfirmed: true,
    requestedMode: "steps",
    autoSolve: true,
  });
  assert.equal(manual.ocrConfirmed, false);
  assert.equal(manual.requestedMode, "steps");
  assert.equal(manual.autoSolve, false);
});

test("imported pending text cannot restore OCR confirmation or automatic solving", async () => {
  await importData({
    pendingQuestion: {
      question: "x^2 = 4",
      source: "ocr",
      ocrConfirmed: true,
      requestedMode: "answer",
      autoSolve: true,
    },
  });

  const pending = await getPendingQuestion();
  assert.equal(pending.question, "x^2 = 4");
  assert.equal(pending.source, "review");
  assert.equal(pending.ocrConfirmed, false);
  assert.equal(pending.requestedMode, "answer");
  assert.equal(pending.autoSolve, false);
});

test("export/import are JSON-safe, validate structure, and merge without duplicate IDs", async () => {
  await addHistory(historyInput({ id: "saved" }));
  const exported = await exportData();
  const json = await exportDataAsJson();
  assert.equal(JSON.parse(json).schemaVersion, 2);
  assert.equal(exported.history.length, 1);
  assert.equal(Object.hasOwn(exported, "geometryDrafts"), false);

  const result = await importData(
    {
      schemaVersion: 1,
      history: [
        historyInput({ id: "saved" }),
        historyInput({ id: "imported", question: "5x=10" }),
        null,
      ],
    },
    { mode: "merge" },
  );
  assert.equal(result.importedHistoryCount, 2);
  assert.equal(result.skippedHistoryCount, 1);
  assert.equal(result.totalHistoryCount, 2);
  await assert.rejects(() => importData({ history: "invalid" }), /配列/);
  await assert.rejects(() => importData("not-json"), /JSON/);
});

test("imported solver verification claims are downgraded while existing local records remain verified", async () => {
  await addHistory(historyInput({ id: "local", finalAnswer: "x=4", output: "x=4" }));

  await importData(
    {
      history: [
        historyInput({ id: "local", finalAnswer: "x=999", output: "x=999" }),
        historyInput({ id: "forged", finalAnswer: "x=999", output: "x=999" }),
        historyInput({
          id: "verified-flag-only",
          finalAnswer: "x=999",
          output: "x=999",
          verificationType: "ai-only",
          verified: true,
        }),
      ],
    },
    { mode: "merge" },
  );

  const history = await getHistory();
  const local = history.find(({ id }) => id === "local");
  const forged = history.find(({ id }) => id === "forged");
  const verifiedFlagOnly = history.find(({ id }) => id === "verified-flag-only");
  assert.equal(local.verified, true);
  assert.equal(local.verificationType, "solver");
  assert.equal(local.finalAnswer, "x=4");
  assert.equal(forged.verified, false);
  assert.equal(forged.verificationType, "unsupported");
  assert.equal(forged.solverId, null);
  assert.equal(forged.category, "一次方程式");
  assert.match(forged.verificationMessage, /インポートされたソルバー検証状態/);
  assert.equal(verifiedFlagOnly.verified, false);
  assert.equal(verifiedFlagOnly.verificationType, "unsupported");
  assert.match(verifiedFlagOnly.verificationMessage, /インポートされたソルバー検証状態/);
});

test("既存の検証済み分数方程式を破壊的移行なしで再分類する", async () => {
  fixture.localStorage.setItem("history", JSON.stringify([
    historyInput({
      id: "legacy-rational",
      question: "1/(x-1)=2",
      category: "二次方程式",
      solverId: "rational-equation",
      verificationType: undefined,
    }),
  ]));

  const [record] = await getHistory();
  assert.equal(record.category, "分数方程式");
  assert.equal(record.categoryClassification.primary, "分数方程式");
  assert.deepEqual(
    record.categoryClassification.candidates,
    ["分数方程式", "二次方程式"],
  );

  const analytics = await getAnalytics();
  assert.deepEqual(
    analytics.byCategory.map(({ category, count }) => ({ category, count })),
    [{ category: "分数方程式", count: 1 }],
  );
});

test("analytics reports score, verification, review, category, and recent usage", async () => {
  const now = new Date().toISOString();
  await addHistory(
    historyInput({
      id: "self",
      mode: "hint1",
      selfAssessment: "self_solved",
      createdAt: now,
    }),
  );
  await addHistory(
    historyInput({
      id: "ai",
      question: "未対応問題",
      category: "積分",
      solverId: null,
      verified: false,
      verificationType: "ai-only",
      selfAssessment: "unassessed",
      createdAt: now,
    }),
  );

  const analytics = await getAnalytics();
  assert.equal(analytics.totalCount, 2);
  assert.equal(analytics.evaluatedCount, 1);
  assert.equal(analytics.averageUnderstanding, 100);
  assert.equal(analytics.selfSolvedCount, 1);
  assert.equal(analytics.hintUsageCount, 1);
  assert.equal(analytics.unverifiedAiCount, 1);
  assert.equal(analytics.recent7Days, 2);
  assert.equal(analytics.byCategory.length, 2);
});

test("analytics separates staged output usage, direct answers, recent struggle, and priority", async () => {
  const now = new Date().toISOString();
  const analytics = await getAnalytics([
    historyInput({
      id: "derivative-guided",
      category: "微分",
      mode: "hint1",
      usage: { viewedModes: ["hint1", "hint2", "answer"] },
      selfAssessment: "hint2_solved",
      createdAt: now,
    }),
    historyInput({
      id: "derivative-direct",
      category: "微分",
      mode: "answer",
      usage: { viewedModes: ["answer"] },
      selfAssessment: "answer_seen",
      createdAt: now,
    }),
    historyInput({
      id: "integral-steps",
      category: "積分",
      mode: "steps",
      usage: { viewedModes: ["steps"] },
      selfAssessment: "steps_solved",
      createdAt: now,
    }),
  ]);

  assert.equal(analytics.totalCount, 3);
  assert.equal(analytics.averageUnderstanding, 33.3);
  assert.equal(analytics.hint1UsageRate, 33.3);
  assert.equal(analytics.hint2UsageRate, 33.3);
  assert.equal(analytics.stepsUsageRate, 33.3);
  assert.equal(analytics.answerViewedRate, 100);
  assert.equal(analytics.directAnswerRate, 33.3);
  assert.equal(analytics.recentStruggleCount, 3);
  assert.equal(analytics.recentStruggleRate, 100);
  assert.equal(analytics.reviewPriorityScore, 55);
  assert.equal(analytics.reviewPriorityLevel, "medium");

  const derivative = analytics.byCategory.find(({ category }) => category === "微分");
  assert.equal(derivative.count, 2);
  assert.equal(derivative.averageUnderstanding, 30);
  assert.equal(derivative.hint1UsageRate, 50);
  assert.equal(derivative.hint2UsageRate, 50);
  assert.equal(derivative.answerViewedRate, 100);
  assert.equal(derivative.directAnswerRate, 50);
  assert.equal(derivative.reviewPriorityScore, 60);
  assert.equal(derivative.reviewPriorityLevel, "high");

  const unassessed = await getAnalytics([
    historyInput({
      id: "unassessed",
      mode: "hint1",
      selfAssessment: "unassessed",
      createdAt: now,
    }),
  ]);
  assert.equal(unassessed.averageUnderstanding, null);
  assert.equal(unassessed.byCategory[0].averageUnderstanding, null);
});

test("clearAllData removes every application key and settings fall back to defaults", async () => {
  await saveSettings({ defaultMode: "explain" });
  await addHistory(historyInput());
  await setPendingQuestion("question");
  fixture.localStorage.setItem("geometryDrafts", JSON.stringify([{ id: "legacy-draft" }]));
  await clearAllData();
  assert.deepEqual(await getHistory(), []);
  assert.equal(await getPendingQuestion(), null);
  assert.equal(fixture.localStorage.getItem("geometryDrafts"), null);
  assert.deepEqual(await getSettings(), DEFAULT_SETTINGS);
});
