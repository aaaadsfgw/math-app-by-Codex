import assert from "node:assert/strict";
import test from "node:test";

import {
  SymbolicWorkerError,
  runSymbolicOperation,
} from "../js/math-core/symbolic-client.js";

class FakeWorker {
  constructor(responder) {
    this.responder = responder;
    this.listeners = new Map();
    this.terminated = false;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  postMessage(message) {
    this.responder?.(message, this);
  }

  emit(type, value) {
    this.listeners.get(type)?.(value);
  }

  terminate() {
    this.terminated = true;
  }
}

test("隔離ワーカーから対応する計算結果を受け取って終了する", async () => {
  let worker;
  const result = await runSymbolicOperation("simplify", ["x+x"], {
    workerFactory: () => {
      worker = new FakeWorker((message, target) => {
        queueMicrotask(() => target.emit("message", {
          data: { id: message.id, ok: true, result: "2*x" },
        }));
      });
      return worker;
    },
  });
  assert.equal(result, "2*x");
  assert.equal(worker.terminated, true);
});

test("エンジンエラーを型付きエラーとして返す", async () => {
  await assert.rejects(
    runSymbolicOperation("integrate", ["bad"], {
      workerFactory: () => new FakeWorker((message, target) => {
        queueMicrotask(() => target.emit("message", {
          data: {
            id: message.id,
            ok: false,
            error: { code: "UNSAFE_EXPRESSION", message: "危険な式" },
          },
        }));
      }),
    }),
    (error) => error instanceof SymbolicWorkerError
      && error.code === "UNSAFE_EXPRESSION",
  );
});

test("期限を超えた計算はワーカーを強制終了する", async () => {
  let worker;
  await assert.rejects(
    runSymbolicOperation("roots", ["x^2-1", "x"], {
      timeoutMs: 10,
      workerFactory: () => {
        worker = new FakeWorker();
        return worker;
      },
    }),
    (error) => error instanceof SymbolicWorkerError
      && error.code === "SYMBOLIC_TIMEOUT"
      && /50ミリ秒/u.test(error.message),
  );
  assert.equal(worker.terminated, true);
});

test("未許可操作とワーカーを使えない環境を明示する", async () => {
  await assert.rejects(
    runSymbolicOperation("execute", ["clearall"]),
    (error) => error.code === "UNSUPPORTED_OPERATION",
  );
  await assert.rejects(
    runSymbolicOperation("simplify", ["x"], {
      workerFactory: () => {
        throw new Error("not available");
      },
    }),
    (error) => error.code === "WORKER_START_FAILED",
  );
});
