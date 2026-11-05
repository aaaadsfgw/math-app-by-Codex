import { Worker } from "node:worker_threads";

export const MAX_INPUT_LENGTH = 4_096;
const SOLVE_TIMEOUT_MS = 10_000;
const WORKER_URL = new URL("./solve-worker.js", import.meta.url);

export function createEngine({ timeoutMs = SOLVE_TIMEOUT_MS, WorkerType = Worker } = {}) {
  let cancelActive;
  let closed = false;

  return {
    async run(mode, text) {
      if (closed || cancelActive) throw new Error("計算エンジンは使用中か終了しています。");
      return new Promise((resolve, reject) => {
        const worker = new WorkerType(WORKER_URL, {
          execArgv: [],
          workerData: { mode, text },
          resourceLimits: { maxOldGenerationSizeMb: 96, maxYoungGenerationSizeMb: 16, stackSizeMb: 4 },
        });
        let finishing = false;
        const finish = async (error, result) => {
          if (finishing) return;
          finishing = true;
          clearTimeout(timer);
          // Wait for termination before allowing a replacement worker.
          try {
            await worker.terminate();
          } catch {
            error ??= new Error("計算ワーカーを終了できませんでした。");
          }
          cancelActive = undefined;
          if (error) reject(error);
          else resolve(result);
        };
        cancelActive = () => void finish(new Error("計算を中止しました。"));
        const timer = setTimeout(
          () => void finish(new Error("計算が制限時間内に完了しませんでした。")),
          timeoutMs,
        );
        worker.once("message", (result) => void finish(null, result));
        worker.once("error", (cause) => void finish(new Error("計算ワーカーでエラーが発生しました。", { cause })));
        worker.once("exit", () => void finish(new Error("計算ワーカーが予期せず終了しました。")));
      });
    },
    close() {
      closed = true;
      cancelActive?.();
    },
  };
}
