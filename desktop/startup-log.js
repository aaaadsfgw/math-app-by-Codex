import { appendFileSync } from "node:fs";

export function logStartupFailure(stage, error) {
  const path = process.env.MATH_STUDY_LOG_STARTUP_LOG;
  if (!path) return;
  const detail = error?.stack || String(error);
  try {
    appendFileSync(path, `${new Date().toISOString()} ${stage}\n${detail}\n`, "utf8");
  } catch (logError) {
    console.error("Could not write the desktop startup log", logError);
  }
}
