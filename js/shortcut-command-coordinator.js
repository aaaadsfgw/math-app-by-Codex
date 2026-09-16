const MAX_TOAST_ANSWER_LENGTH = 72;

function hasTabId(tab) {
  return Number.isInteger(tab?.id);
}

function isHttpPage(tab) {
  return hasTabId(tab) && /^https?:\/\//iu.test(String(tab?.url || ""));
}

function cleanErrorMessage(error) {
  try {
    const message = String(error?.message || "").trim();
    if (message) return message;
  } catch {
    // Hostile thrown values must not escape the command boundary.
  }
  return "詳細不明のエラー";
}

function shortenForToast(answer) {
  const oneLine = String(answer || "").replace(/\s+/gu, " ").trim();
  if (oneLine.length <= MAX_TOAST_ANSWER_LENGTH) return oneLine;
  return `${oneLine.slice(0, MAX_TOAST_ANSWER_LENGTH - 1)}…`;
}

function actionLabel(action) {
  if (action === "hint1") return "Hint 1";
  if (action === "hint2") return "Hint 2";
  if (action === "steps") return "途中式";
  return "答え";
}

function loggerMethod(logger, method) {
  return typeof logger?.[method] === "function"
    ? logger[method].bind(logger)
    : () => undefined;
}

/**
 * Coordinates the browser command without making page integration mandatory.
 * Selection and toast are HTTP(S)-only capabilities; clipboard and solving stay
 * available even when Chrome does not expose an injectable active tab.
 */
export function createShortcutCommandCoordinator({
  queryActiveTab,
  getSelectionText,
  showToast,
  getSettings,
  runShortcutWorkflow,
  readClipboardText,
  writeClipboardText,
  addHistory = null,
  symbolicOperations,
  logger = globalThis.console,
} = {}) {
  for (const [name, value] of Object.entries({
    queryActiveTab,
    getSelectionText,
    showToast,
    getSettings,
    runShortcutWorkflow,
    readClipboardText,
    writeClipboardText,
  })) {
    if (typeof value !== "function") throw new TypeError(`${name}は関数で指定してください。`);
  }

  const logError = loggerMethod(logger, "error");
  const logWarning = loggerMethod(logger, "warn");
  let inFlight = false;

  async function resolveTab(invokingTab) {
    if (hasTabId(invokingTab)) return invokingTab;
    try {
      const queried = await queryActiveTab();
      return hasTabId(queried) ? queried : null;
    } catch (error) {
      logWarning("Could not resolve an active tab for shortcut page integration", error);
      return null;
    }
  }

  async function showToastIfAvailable(tab, text, toastType) {
    if (!isHttpPage(tab)) return false;
    try {
      await showToast(tab.id, text, toastType);
      return true;
    } catch (error) {
      logWarning("Could not show shortcut toast", error);
      return false;
    }
  }

  async function selectionIfAvailable(tab) {
    if (!isHttpPage(tab)) return "";
    try {
      return await getSelectionText(tab.id);
    } catch (error) {
      logWarning("Could not read page selection; using clipboard fallback", error);
      return "";
    }
  }

  return async function coordinateShortcut(invokingTab = null) {
    const tab = await resolveTab(invokingTab);
    if (inFlight) {
      await showToastIfAvailable(tab, "解析中です。完了までお待ちください。", "loading");
      return Object.freeze({ status: "busy", tab });
    }

    inFlight = true;
    try {
      await showToastIfAvailable(
        tab,
        "選択範囲またはクリップボードを解析中...",
        "loading",
      );

      const settings = await getSettings();
      const result = await runShortcutWorkflow({
        getSelectionText: () => selectionIfAvailable(tab),
        readClipboardText,
        writeClipboardText,
        addHistory,
        settings,
        symbolicOperations,
      });

      const sourceLabel = result.input.source === "selection" ? "選択範囲" : "クリップボード";
      const historyNotice = result.historyError ? "（履歴保存のみ失敗）" : "";
      await showToastIfAvailable(
        tab,
        `${sourceLabel}から${actionLabel(result.action)}をコピー${historyNotice}: ${shortenForToast(result.clipboardOutput)}`,
        "success",
      );
      return Object.freeze({ status: "success", tab, result });
    } catch (error) {
      logError("Shortcut solve failed", error);
      await showToastIfAvailable(tab, `エラー: ${cleanErrorMessage(error)}`, "error");
      return Object.freeze({ status: "error", tab, error });
    } finally {
      inFlight = false;
    }
  };
}

export function supportsShortcutPageIntegration(tab) {
  return isHttpPage(tab);
}
