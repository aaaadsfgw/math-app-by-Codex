import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const SCRIPT = new URL("./ocr-clipboard.ps1", import.meta.url);
const STAMP = /^[0-9]{1,10}:-?[0-9]{1,19}$/u;
let command;

async function invokeNative(stamp, text, signal) {
  if (process.platform !== "win32") throw new Error("Windowsのクリップボードを利用できません。");
  command ??= Buffer.from(await readFile(SCRIPT, "utf8"), "utf16le").toString("base64");
  const executable = join(process.env.SystemRoot || "C:\\Windows",
    "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const { stdout } = await exec(executable, ["-NoLogo", "-NoProfile", "-NonInteractive", "-EncodedCommand", command], {
    windowsHide: true,
    timeout: 5_000,
    maxBuffer: 16 * 1024,
    signal,
    env: {
      ...process.env,
      MATH_STUDY_LOG_OCR_STAMP: stamp ?? "",
      MATH_STUDY_LOG_OCR_ANSWER: text ? Buffer.from(text + "\0", "utf16le").toString("base64") : "",
    },
  });
  return stdout.trim();
}

export function createOcrClipboard(clipboard, { invoke = invokeNative } = {}) {
  return {
    async captureStamp({ signal } = {}) {
      signal?.throwIfAborted();
      const stamp = await invoke(null, null, signal);
      if (!STAMP.test(stamp) || stamp.startsWith("0:")) throw new Error("クリップボードの状態を確認できません。");
      return stamp;
    },
    async writeIfUnchanged(stamp, text) {
      if (typeof stamp !== "string" || !STAMP.test(stamp) || stamp.startsWith("0:")
        || typeof text !== "string" || !text.trim() || text.includes("\0") || text.length > 8_192) {
        throw new Error("解答またはクリップボードの状態が正しくありません。");
      }
      const status = await invoke(stamp, text);
      if (status === "written") return true;
      if (status === "changed") return false;
      throw new Error("クリップボードに解答を書き込めません。");
    },
    writeText: (text) => clipboard.writeText(text),
  };
}
