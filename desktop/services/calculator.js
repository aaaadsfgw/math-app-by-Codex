import { MAX_INPUT_LENGTH } from "./engine.js";

const SHORTCUT_COOLDOWN_MS = 500;

export function createCalculator({ engine, clipboard, onChange, now = () => performance.now() }) {
  let state = { phase: "starting", message: "計算エンジンを準備しています。", result: null };
  let lastShortcutFinished = -Infinity;
  let nextResultId = 0;
  let stopped = false;

  function publish(next) {
    if (stopped) return;
    state = next;
    onChange();
  }

  function busy() {
    return ["starting", "working"].includes(state.phase);
  }

  function failure(error, result = null) {
    publish({ phase: "error", message: error.message, result });
  }

  async function calculate(mode, question) {
    const shortcut = mode === "shortcut";
    if (stopped || busy() || (shortcut && now() - lastShortcutFinished < SHORTCUT_COOLDOWN_MS)) return false;
    publish({ phase: "working", message: "計算しています。", result: null });
    try {
      const text = shortcut ? await clipboard.readText() : question;
      if (stopped) return false;
      if (typeof text !== "string" || text.length > MAX_INPUT_LENGTH) {
        throw new Error(`問題は ${MAX_INPUT_LENGTH} 文字以内のテキストで入力してください。`);
      }
      if (!text.trim()) {
        throw new Error(shortcut ? "クリップボードにテキストの問題がありません。" : "数式を入力してください。");
      }

      const outcome = await engine.run(mode, text);
      if (stopped) return false;
      if (outcome?.ok !== true || typeof outcome.answer !== "string" || !outcome.answer.trim()) {
        throw new Error(outcome?.error || "検証済みの解答を得られませんでした。");
      }

      if (shortcut) {
        const current = await clipboard.readText();
        if (stopped) return false;
        if (current !== text) throw new Error("計算中にクリップボードのテキストが変わったため、コピーを中止しました。");
        await clipboard.writeText(outcome.answer);
      }

      publish({
        phase: "success",
        message: shortcut ? "計算完了。クリップボードにコピーしました。" : "計算完了。解答を検証しました。",
        result: { id: ++nextResultId, answer: outcome.answer, kind: outcome.kind, conditions: outcome.conditions },
      });
    } catch (error) {
      failure(error);
    } finally {
      if (shortcut) lastShortcutFinished = now();
    }
    return true;
  }

  return {
    getState: () => state,
    async initialize() {
      try {
        const result = await engine.run("initialize");
        if (!result.ok) throw new Error(result.error);
        publish({ phase: "ready", message: "準備完了", result: null });
      } catch (error) {
        failure(error);
      }
    },
    solveManual: (text) => calculate("manual", text),
    solveClipboard: () => calculate("shortcut"),
    async copy(resultId) {
      const { result } = state;
      if (stopped || busy() || !result || result.id !== resultId) return;
      publish({ phase: "working", message: "コピーしています。", result });
      try {
        await clipboard.writeText(result.answer);
        publish({ phase: "success", message: "クリップボードにコピーしました。", result });
      } catch {
        failure(new Error("クリップボードへ書き込めませんでした。"), result);
      }
    },
    close() {
      stopped = true;
      engine.close();
    },
  };
}
