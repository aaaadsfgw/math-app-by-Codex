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
  resetSettings,
  saveSettings,
  setPendingQuestion,
  updateHistory,
} from "../js/storage.js";
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
    apiUrl: "legacy-url",
    modelName: "legacy-model",
  });
  assert.equal(saved.defaultMode, "hint2");
  assert.equal(saved.saveHistory, false);
  assert.equal(saved.maxHistory, DEFAULT_SETTINGS.maxHistory);
  assert.equal(Object.hasOwn(saved, "apiUrl"), false);
  assert.equal(Object.hasOwn(saved, "modelName"), false);
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

  const conditional = createHistoryRecord(
    historyInput({
      resultKind: "conditional",
      conditions: ["(x-1)≠0", " (x-1)≠0 "],
    }),
  );
  assert.equal(conditional.resultKind, "conditional");
  assert.deepEqual(conditional.conditions, ["(x-1)≠0"]);

  const shortcut = createHistoryRecord(
    historyInput({ selfAssessment: undefined, source: "shortcut" }),
  );
  assert.equal(shortcut.selfAssessment, "unassessed");
  assert.equal(shortcut.score, null);
  assert.equal(shortcut.needsReview, true);
});

test("unverified and malformed result metadata cannot retain solver conditions", () => {
  const unverified = createHistoryRecord(
    historyInput({
      verified: false,
      verificationType: "unsupported",
      resultKind: "conditional",
      conditions: ["x≠0"],
    }),
  );
  assert.equal(unverified.resultKind, "unsupported");
  assert.deepEqual(unverified.conditions, []);

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

  const completed = await updateHistory("low-2", { needsReview: false });
  assert.equal(completed.needsReview, false);
  assert.equal(completed.reviewCount, 1);
  assert.equal((await getReviewItems()).some(({ id }) => id === "low-2"), false);
});

test("pending questions retain parent history identifiers", async () => {
  const pending = await setPendingQuestion("x+1=2", "history-1");
  assert.equal(pending.parentHistoryId, "history-1");
  assert.deepEqual(await getPendingQuestion(), pending);
});

test("export/import are JSON-safe, validate structure, and merge without duplicate IDs", async () => {
  await addHistory(historyInput({ id: "saved" }));
  const exported = await exportData();
  const json = await exportDataAsJson();
  assert.equal(JSON.parse(json).schemaVersion, 1);
  assert.equal(exported.history.length, 1);
  assert.equal(Object.hasOwn(exported, "geometryDrafts"), false);

  const result = await importData(
    {
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
  assert.match(forged.verificationMessage, /インポートされたソルバー検証状態/);
  assert.equal(verifiedFlagOnly.verified, false);
  assert.equal(verifiedFlagOnly.verificationType, "unsupported");
  assert.match(verifiedFlagOnly.verificationMessage, /インポートされたソルバー検証状態/);
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
