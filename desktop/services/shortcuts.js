export function createShortcutRegistration({ globalShortcut, onCalculate }) {
  let active = null;
  const accelerator = (key) => `Control+Shift+${key}`;

  return {
    get active() { return active; },
    bind(key, save = () => {}) {
      if (key === active) return;
      let registered = false;
      try {
        registered = globalShortcut.register(accelerator(key), () => {
          if (active === key) onCalculate();
        });
      } catch {
        // Electron can also throw when the system rejects an accelerator.
      }
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
      globalShortcut.unregisterAll();
    },
  };
}
