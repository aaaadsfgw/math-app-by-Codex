import {
  clamp,
  deepClone,
  generateId,
  isPlainObject,
  normalizeQuestion,
  normalizeWhitespace,
  safeJsonParse,
  toFiniteNumber,
  toIsoString,
} from "./utils.js";
import { createRealSet } from "./math-core/real-set.js";

export const STORAGE_KEYS = Object.freeze({
  settings: "settings",
  history: "history",
  pendingQuestion: "pendingQuestion",
  geometryDrafts: "geometryDrafts",
  appMeta: "appMeta",
});

export const DEFAULT_SETTINGS = Object.freeze({
  defaultMode: "answer",
  saveHistory: true,
  maxHistory: 500,
});

export const ASSESSMENT_SCORES = Object.freeze({
  self_solved: 100,
  hint1_solved: 80,
  hint2_solved: 60,
  steps_solved: 40,
  explain_understood: 30,
  answer_seen: 0,
  unsolved: 0,
  unassessed: null,
});

const MODES = new Set(["answer", "hint1", "hint2", "steps", "explain"]);
const SOURCES = new Set(["popup", "shortcut", "geometry", "review"]);
const VERIFICATION_TYPES = new Set(["solver", "demo", "ai-only", "unsupported"]);
const SOLVED_RESULT_KINDS = new Set(["exact", "approximate", "conditional"]);
const TRACE_TYPES = new Set([
  "answer",
  "conclusion",
  "constraint",
  "input",
  "result",
  "rule",
  "strategy",
  "transformation",
  "verification",
]);
const ALL_STORAGE_KEYS = Object.values(STORAGE_KEYS);
const STORAGE_MUTATION_LOCK = "math-study-log-ai-storage-mutation";
let mutationQueue = Promise.resolve();

export class StorageError extends Error {
  constructor(message, { code = "STORAGE_ERROR", cause } = {}) {
    super(message, { cause });
    this.name = "StorageError";
    this.code = code;
  }
}

function runWithModuleQueue(operation) {
  const result = mutationQueue.then(operation, operation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function withStorageMutation(operation) {
  const locks = globalThis.navigator?.locks;
  if (typeof locks?.request === "function") {
    return locks.request(STORAGE_MUTATION_LOCK, { mode: "exclusive" }, operation);
  }
  return runWithModuleQueue(operation);
}

function extensionStorageArea() {
  return globalThis.chrome?.storage?.local ?? null;
}

function isExtensionContext() {
  return Boolean(globalThis.chrome?.runtime?.id);
}

function browserLocalStorage() {
  if (isExtensionContext()) return null;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function chromeStorageCall(method, ...args) {
  const area = extensionStorageArea();
  if (!area || typeof area[method] !== "function") {
    return Promise.reject(
      new StorageError("chrome.storage.local を利用できません。", { code: "UNAVAILABLE" }),
    );
  }

  return new Promise((resolve, reject) => {
    try {
      area[method](...args, (result) => {
        const runtimeError = globalThis.chrome?.runtime?.lastError;
        if (runtimeError) {
          reject(new StorageError(runtimeError.message, { cause: runtimeError }));
          return;
        }
        resolve(result);
      });
    } catch (error) {
      reject(new StorageError("拡張機能の保存領域へアクセスできません。", { cause: error }));
    }
  });
}

async function readStorage(keys) {
  if (extensionStorageArea()) {
    return (await chromeStorageCall("get", keys)) ?? {};
  }

  const local = browserLocalStorage();
  if (!local) {
    throw new StorageError("保存領域を利用できません。", { code: "UNAVAILABLE" });
  }

  const names = Array.isArray(keys) ? keys : [keys];
  const result = {};
  try {
    for (const key of names) {
      const raw = local.getItem(key);
      if (raw === null) continue;
      const marker = Symbol("corrupt-json");
      const parsed = safeJsonParse(raw, marker);
      if (parsed !== marker) result[key] = parsed;
    }
  } catch (error) {
    throw new StorageError("ブラウザ外確認用の保存領域を読み取れません。", { cause: error });
  }
  return result;
}

async function writeStorage(entries) {
  if (!isPlainObject(entries)) throw new TypeError("保存データはオブジェクトで指定してください。");
  if (extensionStorageArea()) {
    await chromeStorageCall("set", entries);
    return;
  }

  const local = browserLocalStorage();
  if (!local) {
    throw new StorageError("保存領域を利用できません。", { code: "UNAVAILABLE" });
  }
  try {
    for (const [key, value] of Object.entries(entries)) {
      local.setItem(key, JSON.stringify(value));
    }
  } catch (error) {
    throw new StorageError("ブラウザ外確認用の保存領域へ書き込めません。", { cause: error });
  }
}

async function removeStorage(keys) {
  const names = Array.isArray(keys) ? keys : [keys];
  if (extensionStorageArea()) {
    await chromeStorageCall("remove", names);
    return;
  }

  const local = browserLocalStorage();
  if (!local) {
    throw new StorageError("保存領域を利用できません。", { code: "UNAVAILABLE" });
  }
  try {
    for (const key of names) local.removeItem(key);
  } catch (error) {
    throw new StorageError("ブラウザ外確認用の保存領域を削除できません。", { cause: error });
  }
}

function asBoolean(value, fallback) {
  return typeof value === "boolean" ? value : fallback;
}

function positiveInteger(value, fallback, maximum) {
  const number = toFiniteNumber(value);
  if (number === null || number <= 0) return fallback;
  return Math.trunc(clamp(number, 1, maximum));
}

function normalizeSettings(value) {
  const candidate = isPlainObject(value) ? value : {};
  return {
    defaultMode: MODES.has(candidate.defaultMode)
      ? candidate.defaultMode
      : DEFAULT_SETTINGS.defaultMode,
    saveHistory: asBoolean(candidate.saveHistory, DEFAULT_SETTINGS.saveHistory),
    maxHistory: positiveInteger(candidate.maxHistory, DEFAULT_SETTINGS.maxHistory, 5_000),
  };
}

export async function getSettings() {
  const stored = await readStorage(STORAGE_KEYS.settings);
  return normalizeSettings(stored[STORAGE_KEYS.settings]);
}

export async function saveSettings(patch) {
  return withStorageMutation(async () => {
    if (!isPlainObject(patch)) throw new TypeError("設定はオブジェクトで指定してください。");
    const current = await getSettings();
    const settings = normalizeSettings({ ...current, ...patch });
    await writeStorage({ [STORAGE_KEYS.settings]: settings });

    const history = await getHistory();
    if (history.length > settings.maxHistory) {
      await writeStorage({ [STORAGE_KEYS.history]: history.slice(0, settings.maxHistory) });
    }
    return deepClone(settings);
  });
}

export async function resetSettings() {
  return withStorageMutation(async () => {
    const settings = { ...DEFAULT_SETTINGS };
    await writeStorage({ [STORAGE_KEYS.settings]: settings });
    return settings;
  });
}

function validIso(value, fallback = null) {
  if (typeof value !== "string" && !(value instanceof Date)) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

const VERIFIED_SOLVER_CATEGORIES = Object.freeze({
  "definite-integral": "積分",
  "finite-limit": "極限",
  "polynomial-area": "積分",
  "polynomial-volume": "積分",
  "exponential-equation": "指数・対数",
  "logarithmic-equation": "指数・対数",
  "rational-equation": "分数方程式",
  "rational-inequality": "不等式",
});

function normalizeClassification(input) {
  const candidate = isPlainObject(input.categoryClassification)
    ? input.categoryClassification
    : isPlainObject(input.classification)
      ? input.classification
      : isPlainObject(input.category)
        ? input.category
        : null;

  const explicitCategory = typeof input.category === "string" ? normalizeWhitespace(input.category) : "";
  const solverId = normalizeWhitespace(input.solverId);
  const verificationType = VERIFICATION_TYPES.has(input.verificationType)
    ? input.verificationType
    : input.verified
      ? "solver"
      : "unsupported";
  const verifiedSolverCategory = (
    input.verified === true
    && verificationType === "solver"
    && VERIFIED_SOLVER_CATEGORIES[solverId]
  ) || "";
  const primary = (
    verifiedSolverCategory
    || explicitCategory
    || normalizeWhitespace(candidate?.primary)
    || "その他"
  );
  if (verifiedSolverCategory) {
    const originalCandidates = Array.isArray(candidate?.candidates)
      ? candidate.candidates.map(normalizeWhitespace).filter(Boolean)
      : [explicitCategory || normalizeWhitespace(candidate?.primary)].filter(Boolean);
    return {
      primary,
      details: {
        primary,
        candidates: [...new Set([primary, ...originalCandidates])],
        confidence: 1,
        reason: `検証済みソルバー ${solverId} に基づく分類`,
      },
    };
  }
  if (!candidate) return { primary, details: null };

  const candidates = Array.isArray(candidate.candidates)
    ? [...new Set(candidate.candidates.map(normalizeWhitespace).filter(Boolean))]
    : [primary];
  if (!candidates.includes(primary)) candidates.unshift(primary);
  return {
    primary,
    details: {
      primary,
      candidates,
      confidence: clamp(toFiniteNumber(candidate.confidence, 0), 0, 1),
      reason: normalizeWhitespace(candidate.reason),
    },
  };
}

function normalizeAssessment(value, mode, source) {
  if (Object.hasOwn(ASSESSMENT_SCORES, value)) return value;
  return mode === "answer" && source !== "shortcut" ? "answer_seen" : "unassessed";
}

function calculateBaseReview({ score, mode, verificationType }) {
  return (
    score === null ||
    score <= 60 ||
    mode === "answer" ||
    verificationType === "ai-only" ||
    verificationType === "unsupported"
  );
}

function normalizeResultMetadata(input, verificationType) {
  const isVerifiedSolver = verificationType === "solver" && input.verified === true;
  if (!isVerifiedSolver) {
    return {
      resultKind: "unsupported",
      conditions: [],
    };
  }

  const resultKind = SOLVED_RESULT_KINDS.has(input.resultKind)
    ? input.resultKind
    : "exact";
  const conditions = resultKind === "conditional" && Array.isArray(input.conditions)
    ? [...new Set(
        input.conditions
          .map((condition) => normalizeWhitespace(condition))
          .filter(Boolean),
      )].slice(0, 20)
    : [];
  if (resultKind === "conditional" && !conditions.length) {
    throw new TypeError("条件付きの解答結果には条件が必要です。");
  }

  return {
    resultKind,
    conditions,
  };
}

function normalizeSolutionTrace(input, verificationType) {
  if (
    verificationType !== "solver"
    || input.verified !== true
    || !Array.isArray(input.solutionTrace)
  ) {
    return [];
  }
  return input.solutionTrace.slice(0, 50).flatMap((step) => {
    if (!isPlainObject(step)) return [];
    const content = normalizeWhitespace(step.content).slice(0, 2_000);
    if (!content) return [];
    return [{
      type: TRACE_TYPES.has(step.type) ? step.type : "transformation",
      content,
      explanation: normalizeWhitespace(step.explanation).slice(0, 2_000),
    }];
  });
}

function normalizeSolutionSet(input, verificationType) {
  if (
    verificationType !== "solver"
    || input.verified !== true
    || !isPlainObject(input.solutionSet)
  ) {
    return null;
  }
  try {
    return createRealSet(input.solutionSet);
  } catch {
    return null;
  }
}

export function createHistoryRecord(input = {}) {
  if (!isPlainObject(input)) throw new TypeError("履歴データはオブジェクトで指定してください。");
  const question = normalizeWhitespace(input.question);
  if (!question) throw new TypeError("問題文が空です。");

  const now = toIsoString();
  const mode = MODES.has(input.mode) ? input.mode : "answer";
  const source = SOURCES.has(input.source) ? input.source : "popup";
  const selfAssessment = normalizeAssessment(input.selfAssessment, mode, source);
  const score = ASSESSMENT_SCORES[selfAssessment];
  const classification = normalizeClassification(input);
  const verificationType = VERIFICATION_TYPES.has(input.verificationType)
    ? input.verificationType
    : input.verified
      ? "solver"
      : "unsupported";
  const resultMetadata = normalizeResultMetadata(input, verificationType);
  const reviewCount = Math.max(0, Math.trunc(toFiniteNumber(input.reviewCount, 0)));
  const lastReviewedAt = validIso(input.lastReviewedAt);
  const reviewWasCompleted = input.needsReview === false && reviewCount > 0 && lastReviewedAt;
  const computedReview = calculateBaseReview({ score, mode, verificationType });

  const record = {
    id: normalizeWhitespace(input.id) || generateId(),
    question,
    normalizedQuestion: normalizeQuestion(input.normalizedQuestion || question),
    mode,
    output: String(input.output ?? "").trim(),
    finalAnswer: String(input.finalAnswer ?? "").trim(),
    category: classification.primary,
    solverId: normalizeWhitespace(input.solverId) || null,
    verified: verificationType === "solver" && input.verified === true,
    verificationType,
    verificationMessage: normalizeWhitespace(
      input.verificationMessage ?? input.verification ?? "",
    ),
    resultKind: resultMetadata.resultKind,
    conditions: resultMetadata.conditions,
    solutionTrace: normalizeSolutionTrace(input, verificationType),
    solutionSet: normalizeSolutionSet(input, verificationType),
    selfAssessment,
    score,
    needsReview: reviewWasCompleted ? false : input.needsReview === true || computedReview,
    source,
    createdAt: validIso(input.createdAt, now),
    updatedAt: validIso(input.updatedAt, now),
    reviewCount,
    lastReviewedAt,
    parentHistoryId: normalizeWhitespace(input.parentHistoryId) || null,
  };

  if (classification.details) record.categoryClassification = classification.details;
  return record;
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];
  const records = [];
  const seen = new Set();
  for (const candidate of value) {
    if (!isPlainObject(candidate)) continue;
    try {
      const record = createHistoryRecord(candidate);
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
    } catch {
      // A corrupt entry must not make the rest of the history unreadable.
    }
  }
  return records.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function normalizeImportedHistory(value) {
  if (!Array.isArray(value)) return [];
  const records = [];
  const seen = new Set();
  for (const candidate of value) {
    if (!isPlainObject(candidate)) continue;
    try {
      const claimsLocalVerification = (
        candidate.verified === true
        || candidate.verificationType === "solver"
      );
      const record = createHistoryRecord(claimsLocalVerification
        ? {
            ...candidate,
            solverId: null,
            verified: false,
            verificationType: "unsupported",
            verificationMessage:
              "インポートされたソルバー検証状態は引き継いでいません。再実行して検証してください。",
          }
        : candidate);
      if (seen.has(record.id)) continue;
      seen.add(record.id);
      records.push(record);
    } catch {
      // Invalid imported entries are counted as skipped by the caller.
    }
  }
  return records.sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
}

function categoryReviewSignals(history) {
  const grouped = new Map();
  for (const record of history) {
    const records = grouped.get(record.category) ?? [];
    records.push(record);
    grouped.set(record.category, records);
  }

  const signals = new Map();
  for (const [category, records] of grouped) {
    const recent = records
      .slice()
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))
      .slice(0, 3);
    const lowCount = recent.filter(
      (record) => typeof record.score === "number" && record.score <= 60,
    ).length;
    signals.set(category, {
      lowCount,
      recentIds: new Set(recent.map((record) => record.id)),
      repeatedFailure: lowCount >= 2,
    });
  }
  return signals;
}

function applyReviewContext(history) {
  const signals = categoryReviewSignals(history);
  return history.map((record) => {
    const signal = signals.get(record.category);
    const explicitlyCompleted =
      record.needsReview === false && record.reviewCount > 0 && record.lastReviewedAt;
    const repeatedFailure = Boolean(
      signal?.repeatedFailure && signal.recentIds.has(record.id) && !explicitlyCompleted,
    );
    return {
      ...record,
      needsReview: record.needsReview || repeatedFailure,
      categoryRecentLowCount: signal?.lowCount ?? 0,
    };
  });
}

export async function getHistory() {
  const stored = await readStorage(STORAGE_KEYS.history);
  return applyReviewContext(normalizeHistory(stored[STORAGE_KEYS.history])).map(deepClone);
}

export async function addHistory(input) {
  return withStorageMutation(async () => {
    const record = createHistoryRecord(input);
    const [history, settings] = await Promise.all([getHistory(), getSettings()]);
    const withoutDuplicate = history.filter((item) => item.id !== record.id);
    const updated = applyReviewContext(normalizeHistory([record, ...withoutDuplicate])).slice(
      0,
      settings.maxHistory,
    );
    await writeStorage({ [STORAGE_KEYS.history]: updated });
    return deepClone(updated.find((item) => item.id === record.id) ?? record);
  });
}

export async function updateHistory(id, patch) {
  return withStorageMutation(async () => {
    const targetId = normalizeWhitespace(id);
    if (!targetId || !isPlainObject(patch)) return null;
    const history = await getHistory();
    const index = history.findIndex((record) => record.id === targetId);
    if (index < 0) return null;

    const current = history[index];
    const now = toIsoString();
    const marksReviewComplete = patch.needsReview === false && !Object.hasOwn(patch, "selfAssessment");
    const completionPatch = marksReviewComplete
      ? {
          reviewCount: Object.hasOwn(patch, "reviewCount")
            ? patch.reviewCount
            : current.reviewCount + 1,
          lastReviewedAt: patch.lastReviewedAt ?? now,
        }
      : {};
    const updatedRecord = createHistoryRecord({
      ...current,
      ...patch,
      ...completionPatch,
      needsReview: Object.hasOwn(patch, "selfAssessment")
        ? undefined
        : Object.hasOwn(patch, "needsReview")
          ? patch.needsReview
          : current.needsReview,
      id: current.id,
      createdAt: current.createdAt,
      updatedAt: now,
    });
    history[index] = updatedRecord;
    const updated = applyReviewContext(normalizeHistory(history));
    await writeStorage({ [STORAGE_KEYS.history]: updated });
    return deepClone(updated.find((record) => record.id === targetId) ?? null);
  });
}

export async function deleteHistory(id) {
  return withStorageMutation(async () => {
    const targetId = normalizeWhitespace(id);
    if (!targetId) return false;
    const history = await getHistory();
    const updated = history.filter((record) => record.id !== targetId);
    if (updated.length === history.length) return false;
    await writeStorage({ [STORAGE_KEYS.history]: updated });
    return true;
  });
}

export async function clearHistory() {
  return withStorageMutation(() => writeStorage({ [STORAGE_KEYS.history]: [] }));
}

export async function setPendingQuestion(questionOrObject, parentHistoryId = null) {
  return withStorageMutation(async () => {
    const candidate = isPlainObject(questionOrObject)
      ? questionOrObject
      : { question: questionOrObject, parentHistoryId };
    const question = normalizeWhitespace(candidate.question);
    if (!question) throw new TypeError("問題文が空です。");
    const pending = {
      question,
      parentHistoryId: normalizeWhitespace(
        candidate.parentHistoryId ?? candidate.historyId ?? parentHistoryId,
      ) || null,
      createdAt: validIso(candidate.createdAt, toIsoString()),
    };
    await writeStorage({ [STORAGE_KEYS.pendingQuestion]: pending });
    return deepClone(pending);
  });
}

export async function getPendingQuestion() {
  const stored = await readStorage(STORAGE_KEYS.pendingQuestion);
  const value = stored[STORAGE_KEYS.pendingQuestion];
  if (!isPlainObject(value) || !normalizeWhitespace(value.question)) return null;
  return {
    question: normalizeWhitespace(value.question),
    parentHistoryId: normalizeWhitespace(value.parentHistoryId) || null,
    createdAt: validIso(value.createdAt, toIsoString()),
  };
}

export async function clearPendingQuestion() {
  return withStorageMutation(() => removeStorage(STORAGE_KEYS.pendingQuestion));
}

export async function getAppMeta() {
  const stored = await readStorage(STORAGE_KEYS.appMeta);
  return isPlainObject(stored[STORAGE_KEYS.appMeta])
    ? deepClone(stored[STORAGE_KEYS.appMeta])
    : {};
}

export async function saveAppMeta(patch) {
  return withStorageMutation(async () => {
    if (!isPlainObject(patch)) throw new TypeError("アプリ情報はオブジェクトで指定してください。");
    const current = await getAppMeta();
    const value = { ...current, ...deepClone(patch), updatedAt: toIsoString() };
    await writeStorage({ [STORAGE_KEYS.appMeta]: value });
    return deepClone(value);
  });
}

export async function clearAllData() {
  return withStorageMutation(() => removeStorage(ALL_STORAGE_KEYS));
}

export async function exportData() {
  const [settings, history, pendingQuestion, appMeta] = await Promise.all([
    getSettings(),
    getHistory(),
    getPendingQuestion(),
    getAppMeta(),
  ]);
  return {
    schemaVersion: 1,
    exportedAt: toIsoString(),
    settings,
    history,
    pendingQuestion,
    appMeta,
  };
}

export async function exportDataAsJson(space = 2) {
  const indentation = Math.trunc(clamp(space, 0, 10));
  return JSON.stringify(await exportData(), null, indentation);
}

function parseImportPayload(payload) {
  let parsed = payload;
  if (typeof payload === "string") {
    try {
      parsed = JSON.parse(payload);
    } catch (error) {
      throw new StorageError("JSONを解析できません。", { code: "INVALID_IMPORT", cause: error });
    }
  }
  if (Array.isArray(parsed)) parsed = { history: parsed };
  if (!isPlainObject(parsed)) {
    throw new StorageError("インポートデータの形式が正しくありません。", {
      code: "INVALID_IMPORT",
    });
  }
  const recognized = ["settings", "history", "pendingQuestion", "geometryDrafts", "appMeta"];
  if (!recognized.some((key) => Object.hasOwn(parsed, key))) {
    throw new StorageError("インポート可能なデータがありません。", { code: "INVALID_IMPORT" });
  }
  return parsed;
}

async function importDataUnlocked(payload, { mode = "replace" } = {}) {
  const parsed = parseImportPayload(payload);
  if (!new Set(["replace", "merge"]).has(mode)) {
    throw new TypeError("インポート方式は replace または merge を指定してください。");
  }

  const currentSettings = await getSettings();
  const settings = Object.hasOwn(parsed, "settings")
    ? (() => {
        if (!isPlainObject(parsed.settings)) {
          throw new StorageError("設定データの形式が正しくありません。", {
            code: "INVALID_IMPORT",
          });
        }
        return normalizeSettings({ ...currentSettings, ...parsed.settings });
      })()
    : currentSettings;

  let incomingHistory = [];
  let skippedHistoryCount = 0;
  if (Object.hasOwn(parsed, "history")) {
    if (!Array.isArray(parsed.history)) {
      throw new StorageError("履歴データは配列である必要があります。", {
        code: "INVALID_IMPORT",
      });
    }
    incomingHistory = normalizeImportedHistory(parsed.history);
    skippedHistoryCount = parsed.history.length - incomingHistory.length;
    if (parsed.history.length > 0 && incomingHistory.length === 0) {
      throw new StorageError("有効な履歴データがありません。", { code: "INVALID_IMPORT" });
    }
  }

  const entries = {};
  if (Object.hasOwn(parsed, "settings")) entries[STORAGE_KEYS.settings] = settings;
  if (Object.hasOwn(parsed, "history")) {
    const base = mode === "merge" ? await getHistory() : [];
    entries[STORAGE_KEYS.history] = applyReviewContext(
      normalizeHistory([...base, ...incomingHistory]),
    ).slice(0, settings.maxHistory);
  }
  // geometryDrafts is accepted as a legacy top-level field but intentionally ignored.
  if (Object.hasOwn(parsed, "pendingQuestion")) {
    if (parsed.pendingQuestion === null) {
      entries[STORAGE_KEYS.pendingQuestion] = null;
    } else if (
      !isPlainObject(parsed.pendingQuestion) ||
      !normalizeWhitespace(parsed.pendingQuestion.question)
    ) {
      throw new StorageError("再実行問題データの形式が正しくありません。", {
        code: "INVALID_IMPORT",
      });
    } else {
      entries[STORAGE_KEYS.pendingQuestion] = {
        question: normalizeWhitespace(parsed.pendingQuestion.question),
        parentHistoryId: normalizeWhitespace(parsed.pendingQuestion.parentHistoryId) || null,
        createdAt: validIso(parsed.pendingQuestion.createdAt, toIsoString()),
      };
    }
  }
  if (Object.hasOwn(parsed, "appMeta")) {
    if (!isPlainObject(parsed.appMeta)) {
      throw new StorageError("アプリ情報の形式が正しくありません。", {
        code: "INVALID_IMPORT",
      });
    }
    entries[STORAGE_KEYS.appMeta] = deepClone(parsed.appMeta);
  }

  await writeStorage(entries);
  const totalHistoryCount = Object.hasOwn(entries, STORAGE_KEYS.history)
    ? entries[STORAGE_KEYS.history].length
    : (await getHistory()).length;
  return {
    importedHistoryCount: incomingHistory.length,
    skippedHistoryCount,
    totalHistoryCount,
  };
}

export async function importData(payload, options = {}) {
  return withStorageMutation(() => importDataUnlocked(payload, options));
}

export async function getReviewItems({ preferOlder = false, category = null } = {}) {
  const categoryFilter = normalizeWhitespace(category);
  const history = await getHistory();
  const items = history
    .filter((record) => record.needsReview)
    .filter((record) => !categoryFilter || record.category === categoryFilter)
    .map((record) => ({
      ...record,
      reviewPriority:
        (record.categoryRecentLowCount >= 2 ? 1_000 : 0) +
        (record.score === null ? 200 : 100 - record.score) +
        (record.mode === "answer" ? 80 : 0) +
        (record.verificationType === "ai-only" ? 60 : 0),
    }));

  return items.sort((left, right) => {
    if (right.categoryRecentLowCount !== left.categoryRecentLowCount) {
      return right.categoryRecentLowCount - left.categoryRecentLowCount;
    }
    if (preferOlder) return Date.parse(left.createdAt) - Date.parse(right.createdAt);
    const leftScore = left.score ?? -1;
    const rightScore = right.score ?? -1;
    if (leftScore !== rightScore) return leftScore - rightScore;
    if (right.reviewPriority !== left.reviewPriority) {
      return right.reviewPriority - left.reviewPriority;
    }
    return Date.parse(left.createdAt) - Date.parse(right.createdAt);
  });
}

function percentage(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1_000) / 10;
}

function average(numbers) {
  if (!numbers.length) return 0;
  return Math.round((numbers.reduce((sum, value) => sum + value, 0) / numbers.length) * 10) / 10;
}

export async function getAnalytics(history = undefined) {
  const records = Array.isArray(history)
    ? applyReviewContext(normalizeHistory(history))
    : await getHistory();
  const evaluatedScores = records
    .map((record) => record.score)
    .filter((score) => typeof score === "number");
  const now = Date.now();
  const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1_000;
  const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1_000;
  const categoryGroups = new Map();

  for (const record of records) {
    const group = categoryGroups.get(record.category) ?? [];
    group.push(record);
    categoryGroups.set(record.category, group);
  }

  const byCategory = [...categoryGroups.entries()]
    .map(([category, group]) => {
      const scores = group
        .map((record) => record.score)
        .filter((score) => typeof score === "number");
      const answerCount = group.filter((record) => record.mode === "answer").length;
      const hintCount = group.filter((record) => ["hint1", "hint2"].includes(record.mode)).length;
      const averageScore = average(scores);
      return {
        category,
        count: group.length,
        evaluatedCount: scores.length,
        averageScore,
        averageUnderstanding: averageScore,
        answerDisplayRate: percentage(answerCount, group.length),
        answerRate: percentage(answerCount, group.length),
        hintDependencyRate: percentage(hintCount, group.length),
      };
    })
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category, "ja"));

  const averageScore = average(evaluatedScores);
  const totalCount = records.length;
  const answerDisplayCount = records.filter((record) => record.mode === "answer").length;
  return {
    totalCount,
    totalProblems: totalCount,
    evaluatedCount: evaluatedScores.length,
    averageScore,
    averageUnderstanding: averageScore,
    selfSolvedCount: records.filter((record) => record.selfAssessment === "self_solved").length,
    answerDisplayCount,
    answerSeenCount: records.filter(
      (record) => record.selfAssessment === "answer_seen" || record.mode === "answer",
    ).length,
    hintUsageCount: records.filter((record) => ["hint1", "hint2"].includes(record.mode)).length,
    unverifiedAiCount: records.filter((record) => record.verificationType === "ai-only").length,
    needsReviewCount: records.filter((record) => record.needsReview).length,
    recent7Days: records.filter((record) => Date.parse(record.createdAt) >= sevenDaysAgo).length,
    recent30Days: records.filter((record) => Date.parse(record.createdAt) >= thirtyDaysAgo).length,
    byCategory,
    categories: byCategory,
  };
}
