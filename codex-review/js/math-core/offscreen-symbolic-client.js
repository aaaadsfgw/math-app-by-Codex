import { SymbolicWorkerError } from "./symbolic-client.js";
import {
  ensureOffscreenDocument,
  runOffscreenRequest,
} from "../offscreen-client.js";

export async function ensureSymbolicOffscreenDocument(
  extensionApi = globalThis.chrome,
) {
  try {
    await ensureOffscreenDocument(extensionApi);
  } catch (error) {
    throw new SymbolicWorkerError(
      String(error?.message || "オフスクリーン記号計算を利用できません。"),
      { code: String(error?.code || "OFFSCREEN_UNAVAILABLE") },
    );
  }
}

export async function runOffscreenSymbolicOperation(
  operation,
  args,
  {
    timeoutMs = 2_000,
    extensionApi = globalThis.chrome,
  } = {},
) {
  try {
    return await runOffscreenRequest(
      "RUN_SYMBOLIC_OPERATION",
      { operation, args, timeoutMs },
      { timeoutMs: timeoutMs + 1_000, extensionApi },
    );
  } catch (error) {
    throw new SymbolicWorkerError(
      String(error?.message || "オフスクリーン記号計算に失敗しました。"),
      { code: String(error?.code || "OFFSCREEN_FAILURE") },
    );
  }
}

export const OFFSCREEN_SYMBOLIC_OPERATIONS = Object.freeze({
  differentiate: (expression, variable = "x") => (
    runOffscreenSymbolicOperation("differentiate", [expression, variable])
  ),
  equivalent: (left, right) => runOffscreenSymbolicOperation("equivalent", [left, right]),
  expand: (expression) => runOffscreenSymbolicOperation("expand", [expression]),
  factor: (expression) => runOffscreenSymbolicOperation("factor", [expression]),
  integrate: (expression, variable = "x") => (
    runOffscreenSymbolicOperation("integrate", [expression, variable])
  ),
  simplify: (expression) => runOffscreenSymbolicOperation("simplify", [expression]),
});
