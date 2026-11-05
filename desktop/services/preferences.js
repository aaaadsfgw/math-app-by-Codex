import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const DEFAULT_PREFERENCES = Object.freeze({ keepInTray: true, shortcutKey: "Y" });

export function validShortcutKey(key) {
  return typeof key === "string" && /^[A-WYZ]$/.test(key);
}

export function loadPreferences(path) {
  try {
    const value = JSON.parse(readFileSync(path, "utf8"));
    return {
      keepInTray: typeof value?.keepInTray === "boolean" ? value.keepInTray : DEFAULT_PREFERENCES.keepInTray,
      shortcutKey: validShortcutKey(value?.shortcutKey) ? value.shortcutKey : DEFAULT_PREFERENCES.shortcutKey,
    };
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.tmp`;
  writeFileSync(temporaryPath, JSON.stringify(value), "utf8");
  renameSync(temporaryPath, path);
}
