import { logStartupFailure } from "./startup-log.js";

try {
  await import("./main.js");
} catch (error) {
  logStartupFailure("Electron main module failed to load", error);
  throw error;
}
