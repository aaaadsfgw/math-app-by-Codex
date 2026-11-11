export function createShortcutRegistration({ globalShortcut, onCalculate, onCapture }) {
  let active = null;
  let captureActive = false;
  const accelerator = (key) => `Control+Shift+${key}`;

  function register(key, callback) {
    try {
      return globalShortcut.register(accelerator(key), callback);
    } catch {
      return false;
    }
  }

  return {
    get active() { return active; },
    get captureActive() { return captureActive; },
    bindCapture() {
      if (captureActive) return;
      captureActive = register("X", () => { if (captureActive) onCapture(); });
      if (!captureActive) {
        throw new Error("画像認識の Ctrl+Shift+X を登録できません。他のアプリの割り当てを確認してください。");
      }
    },
    bind(key, save = () => {}) {
      if (key === active) return;
      if (key === "X") throw new Error("Ctrl+Shift+X は画像認識に割り当てられています。");
      const registered = register(key, () => { if (active === key) onCalculate(); });
      if (!registered) {
        throw new Error(`Ctrl+Shift+${key} を登録できません。Chrome や他のアプリの割り当てを確認するか、別のキーを選んでください。`);
      }
      try {
        save();
      } catch (error) {
        globalShortcut.unregister(accelerator(key));
        throw error;
      }
      if (active) globalShortcut.unregister(accelerator(active));
      active = key;
    },
    close() {
      active = null;
      captureActive = false;
      globalShortcut.unregisterAll();
    },
  };
}
