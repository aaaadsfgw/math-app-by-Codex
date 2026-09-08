import assert from "node:assert/strict";
import test from "node:test";

import {
  OCR_LICENSE_GATE,
  OCR_PROVISIONAL_MODEL,
} from "../js/ocr/ocr-config.js";
import {
  createOcrEngine,
} from "../js/ocr/ocr-engine.js";

function sessionReturning(output, { onRecognize = null, onDispose = null } = {}) {
  return {
    async recognize(input, context) {
      if (onRecognize) await onRecognize(input, context);
      return output;
    },
    async dispose() {
      if (onDispose) await onDispose();
    },
  };
}

test("backend未注入のengineは資産ライセンスと区別してunavailable", async () => {
  const engine = createOcrEngine();
  assert.equal(engine.status.available, false);
  assert.equal(engine.status.availability, "unavailable");
  assert.equal(engine.status.unavailableReason, "backend-not-configured");
  assert.equal(engine.status.unavailableCode, "OCR_BACKEND_NOT_CONFIGURED");
  assert.equal(engine.status.redistributionAllowed, true);
  assert.equal(engine.metadata.licenseGate, OCR_LICENSE_GATE);
  assert.equal(engine.metadata.model, OCR_PROVISIONAL_MODEL);

  await assert.rejects(
    engine.recognize({ pixels: true }),
    (error) => error.code === "OCR_UNAVAILABLE" && error.phase === "availability",
  );
});

test("初回recognizeまでlazy loadし成功sessionをwarm reuseする", async () => {
  const providers = [];
  let recognizes = 0;
  let disposes = 0;
  const engine = createOcrEngine({
    backendFactory: async ({ provider }) => {
      providers.push(provider);
      return sessionReturning({ latex: "  \\int_0^1 x^2 dx  " }, {
        onRecognize: async () => { recognizes += 1; },
        onDispose: async () => { disposes += 1; },
      });
    },
  });

  assert.deepEqual(providers, []);
  assert.equal(engine.status.warm, false);

  const first = await engine.recognize({ image: 1 });
  const second = await engine.recognize({ image: 2 });

  assert.deepEqual(providers, ["webgpu"]);
  assert.equal(recognizes, 2);
  assert.equal(first.text, "\\int_0^1 x^2 dx");
  assert.equal(first.latex, "\\int_0^1 x^2 dx");
  assert.equal(first.provider, "webgpu");
  assert.equal(first.status, "unconfirmed");
  assert.equal(first.verified, false);
  assert.equal(first.confirmationRequired, true);
  assert.equal(first.model.provisional, true);
  assert.equal(first.model.redistributionStatus, "allowed-with-attribution");
  assert.equal(Object.isFrozen(first), true);
  assert.equal(second.provider, "webgpu");
  assert.equal(engine.status.warm, true);
  assert.equal(engine.status.provider, "webgpu");

  await engine.dispose();
  assert.equal(disposes, 1);
  assert.equal(engine.status.state, "disposed");
});

test("webgpu推論失敗時は破棄してfresh wasm sessionへfallbackし再利用する", async () => {
  const factoryCalls = [];
  const disposed = [];
  let wasmRecognizes = 0;
  const engine = createOcrEngine({
    backendFactory: async ({ provider }) => {
      factoryCalls.push(provider);
      if (provider === "webgpu") {
        return {
          async recognize() {
            throw new Error("unsupported WebGPU op");
          },
          async dispose() {
            disposed.push("webgpu");
          },
        };
      }
      return sessionReturning({ text: "x^2+1", format: "text" }, {
        onRecognize: async () => { wasmRecognizes += 1; },
        onDispose: async () => { disposed.push("wasm"); },
      });
    },
  });

  const first = await engine.recognize({ image: 1 });
  const second = await engine.recognize({ image: 2 });

  assert.deepEqual(factoryCalls, ["webgpu", "wasm"]);
  assert.deepEqual(disposed, ["webgpu"]);
  assert.equal(first.provider, "wasm");
  assert.equal(first.format, "text");
  assert.equal(first.latex, null);
  assert.equal(second.provider, "wasm");
  assert.equal(wasmRecognizes, 2);
  assert.equal(engine.status.provider, "wasm");

  await engine.dispose();
  assert.deepEqual(disposed, ["webgpu", "wasm"]);
});

test("正規化済み候補とは別にraw OCR textをデバッグ用に保持する", async () => {
  const rawText = "zws _( 2 x ^( 2 ) + 5 x + 2 = 0 )";
  const engine = createOcrEngine({
    backendFactory: async () => sessionReturning({
      text: "2*x^2+5*x+2=0",
      rawText,
      format: "text",
    }),
  });

  const output = await engine.recognize({ image: true });
  assert.equal(output.text, "2*x^2+5*x+2=0");
  assert.equal(output.rawText, rawText);
  await engine.dispose();
});

test("両providerのmodel load failureをattempt evidence付きで返す", async () => {
  const engine = createOcrEngine({
    backendFactory: async ({ provider }) => {
      throw new Error(`${provider} model missing`);
    },
  });

  await assert.rejects(
    engine.recognize({ image: true }),
    (error) => {
      assert.equal(error.code, "OCR_LOAD_FAILED");
      assert.deepEqual(error.attempts.map(({ provider, phase }) => ({ provider, phase })), [
        { provider: "webgpu", phase: "load" },
        { provider: "wasm", phase: "load" },
      ]);
      assert.match(error.attempts[0].message, /webgpu model missing/u);
      return true;
    },
  );
  assert.equal(engine.status.warm, false);
});

test("画像入力エラーはprovider非依存としてWASMへ重複実行しない", async () => {
  const providers = [];
  const engine = createOcrEngine({
    backendFactory: async ({ provider }) => {
      providers.push(provider);
      return {
        async recognize() {
          const error = new Error("画像をデコードできません。");
          error.code = "OCR_IMAGE_DECODE_FAILED";
          throw error;
        },
      };
    },
  });

  await assert.rejects(
    engine.recognize(new Blob(["invalid"])),
    (error) => error.code === "OCR_IMAGE_DECODE_FAILED" && error.phase === "input",
  );
  assert.deepEqual(providers, ["webgpu"]);
});

test("無応答推論をtimeoutで停止し不確かなsessionを再利用しない", async () => {
  let disposed = 0;
  const engine = createOcrEngine({
    timeoutMs: 20,
    backendFactory: async () => ({
      recognize: async () => new Promise(() => {}),
      dispose: async () => { disposed += 1; },
    }),
  });

  await assert.rejects(
    engine.recognize({ image: true }),
    (error) => error.code === "OCR_TIMEOUT" && error.phase === "request",
  );
  assert.equal(disposed, 1);
  assert.equal(engine.status.warm, false);
});

test("空・過長・制御文字のOCR出力をinvalidとしてsolver前で拒否する", async () => {
  for (const output of [
    { latex: "   " },
    { latex: "123456789" },
    { latex: "x\u0000=1" },
    { text: "x=1", rawText: { unsafe: true }, format: "text" },
  ]) {
    const engine = createOcrEngine({
      maxOutputCharacters: 8,
      backendFactory: async () => sessionReturning(output),
    });
    await assert.rejects(
      engine.recognize({ image: true }),
      (error) => {
        assert.equal(error.code, "OCR_INVALID_OUTPUT");
        assert.equal(error.phase, "output-validation");
        assert.match(error.cause.code, /^OCR_OUTPUT_/u);
        return true;
      },
    );
    await engine.dispose();
  }
});

test("engine.cancelは進行中推論をcancelしsessionを破棄する", async () => {
  let entered;
  const started = new Promise((resolve) => { entered = resolve; });
  let disposed = 0;
  const engine = createOcrEngine({
    timeoutMs: 5_000,
    backendFactory: async () => ({
      async recognize(_input, { signal }) {
        entered();
        return new Promise((resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        });
      },
      async dispose() {
        disposed += 1;
      },
    }),
  });

  const request = engine.recognize({ image: true });
  await started;
  assert.equal(engine.cancel("ユーザーがキャンセルしました。"), 1);
  await assert.rejects(
    request,
    (error) => error.code === "OCR_CANCELLED" && /ユーザー/u.test(error.message),
  );
  assert.equal(disposed, 1);
  assert.equal(engine.status.warm, false);
});

test("外部AbortSignalとdispose後の利用拒否を維持する", async () => {
  const controller = new AbortController();
  controller.abort();
  const engine = createOcrEngine({
    backendFactory: async () => sessionReturning({ latex: "x=1" }),
  });

  await assert.rejects(
    engine.recognize({ image: true }, { signal: controller.signal }),
    (error) => error.code === "OCR_CANCELLED",
  );
  await engine.dispose();
  await assert.rejects(
    engine.recognize({ image: true }),
    (error) => error.code === "OCR_DISPOSED",
  );
});
