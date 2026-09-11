const port = Number(process.argv[2] || 9333);
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
  throw new TypeError("DevTools port must be an integer between 1 and 65535.");
}
const suppliedExtensionId = String(process.argv[3] || "");
if (suppliedExtensionId && !/^[a-p]{32}$/u.test(suppliedExtensionId)) {
  throw new TypeError("Extension ID must contain exactly 32 characters from a through p.");
}
const expectation = String(process.argv[4] || "either");
if (!["either", "webgpu", "wasm-fallback"].includes(expectation)) {
  throw new TypeError("Expectation must be either, webgpu, or wasm-fallback.");
}

const devtoolsBase = [`http:`, `//127.0.0.1:${port}`].join("");

async function readJson(path, options) {
  const response = await fetch(`${devtoolsBase}${path}`, options);
  if (!response.ok) throw new Error(`DevTools request failed: ${response.status}`);
  return response.json();
}

async function waitForExtensionId() {
  const deadline = Date.now() + 20_000;
  while (Date.now() < deadline) {
    try {
      const targets = await readJson("/json/list");
      for (const target of targets) {
        const match = /^chrome-extension:\/\/([a-p]{32})\/js\/background\.js$/u.exec(
          String(target.url || ""),
        );
        if (match) return match[1];
      }
    } catch {
      // Chrome can expose the port a moment before the target list is ready.
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    "Math Study Log background target was not found; pass the unpacked extension ID explicitly.",
  );
}

function openProtocol(webSocketDebuggerUrl) {
  const socket = new WebSocket(webSocketDebuggerUrl);
  const pending = new Map();
  let nextId = 1;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message));
    else request.resolve(message.result);
  });
  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  return Object.freeze({
    async send(method, params = {}) {
      await ready;
      const id = nextId;
      nextId += 1;
      const result = new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
      socket.send(JSON.stringify({ id, method, params }));
      return result;
    },
    close() {
      socket.close();
    },
  });
}

const extensionId = suppliedExtensionId || await waitForExtensionId();
const pageUrl = `chrome-extension://${extensionId}/offscreen.html`;
const target = await readJson(`/json/new?${encodeURIComponent(pageUrl)}`, { method: "PUT" });
const protocol = openProtocol(target.webSocketDebuggerUrl);

try {
  await protocol.send("Runtime.enable");
  const expression = `
    (async () => {
      const runtime = await import(chrome.runtime.getURL("js/ocr/ibem-ocr-runtime.js"));
      const response = await fetch(chrome.runtime.getURL("vendor/ocr/ibem-im2typst/smoke-formula.png"));
      if (!response.ok) throw new Error("smoke image unavailable");
      const blob = await response.blob();
      const outcomes = { webgpuExposed: Boolean(navigator.gpu) };
      for (const provider of ["webgpu", "wasm"]) {
        let session = null;
        try {
          session = await runtime.createIbemRuntimeSession(provider);
          const result = await session.recognize(blob);
          outcomes[provider] = {
            ok: true,
            text: result.text,
            matchesExpected: result.text.replaceAll(" ", "") === "x+y",
            totalMilliseconds: result.timings.totalMilliseconds,
          };
        } catch (error) {
          outcomes[provider] = {
            ok: false,
            code: String(error?.code || "ERROR"),
            message: String(error?.message || error),
          };
        } finally {
          await session?.dispose?.();
        }
      }
      const engineModule = await import(chrome.runtime.getURL("js/ocr/ocr-engine.js"));
      const clientModule = await import(chrome.runtime.getURL("js/ocr/ocr-worker-client.js"));
      const engine = engineModule.createOcrEngine({
        backendFactory: clientModule.createIbemOcrBackendSession,
      });
      try {
        const first = await engine.recognize(blob);
        const warmAfterFirst = engine.status.warm;
        const second = await engine.recognize(blob);
        outcomes.workerEngine = {
          ok: true,
          provider: first.provider,
          firstText: first.text,
          secondText: second.text,
          firstMatchesExpected: first.text.replaceAll(" ", "") === "x+y",
          secondMatchesExpected: second.text.replaceAll(" ", "") === "x+y",
          sameProvider: first.provider === second.provider,
          warmAfterFirst,
          warmAfterSecond: engine.status.warm,
        };
      } catch (error) {
        outcomes.workerEngine = {
          ok: false,
          code: String(error?.code || "ERROR"),
          message: String(error?.message || error),
        };
      } finally {
        await engine.dispose();
      }

      const japaneseModule = await import(chrome.runtime.getURL("js/ocr/japanese-ocr.js"));
      const mixedModule = await import(chrome.runtime.getURL("js/ocr/mixed-ocr-engine.js"));
      const japaneseRecognizer = japaneseModule.createJapaneseOcrRecognizer();
      const formulaEngine = engineModule.createOcrEngine({
        backendFactory: clientModule.createIbemOcrBackendSession,
      });
      const mixedEngine = mixedModule.createMixedOcrEngine({
        formulaEngine,
        japaneseRecognizer,
      });
      const toPng = (canvas) => new Promise((resolve, reject) => {
        if (typeof canvas.convertToBlob === "function") {
          canvas.convertToBlob({ type: "image/png" }).then(resolve, reject);
          return;
        }
        canvas.toBlob((value) => value ? resolve(value) : reject(new Error("PNG encoding failed")), "image/png");
      });
      try {
        const compositeFormula = await mixedEngine.recognize(blob);
        outcomes.compositeFormula = {
          ok: true,
          recognitionKind: compositeFormula.recognitionKind,
          text: compositeFormula.text,
          matchesExpected: compositeFormula.text.replaceAll(" ", "") === "x+y",
        };

        const sourceBitmap = await createImageBitmap(blob);
        const scaledCanvas = new OffscreenCanvas(290, 120);
        scaledCanvas.getContext("2d").drawImage(sourceBitmap, 0, 0, 290, 120);
        sourceBitmap.close();
        const scaledFormula = await mixedEngine.recognize(await toPng(scaledCanvas));
        outcomes.compositeFormula2x = {
          ok: true,
          recognitionKind: scaledFormula.recognitionKind,
          text: scaledFormula.text,
          matchesExpected: scaledFormula.text.replaceAll(" ", "") === "x+y",
        };

        const instructionCanvas = new OffscreenCanvas(900, 150);
        const instructionContext = instructionCanvas.getContext("2d");
        instructionContext.fillStyle = "white";
        instructionContext.fillRect(0, 0, instructionCanvas.width, instructionCanvas.height);
        instructionContext.fillStyle = "black";
        instructionContext.font = '48px "Yu Gothic UI", "Meiryo", sans-serif';
        instructionContext.textBaseline = "middle";
        instructionContext.fillText("次の方程式を解け。", 28, 75);
        const instructionBlob = await toPng(instructionCanvas);
        const heapBefore = performance.memory?.usedJSHeapSize ?? null;
        const japaneseFirst = await japaneseRecognizer.recognize(instructionBlob);
        const japaneseSecond = await japaneseRecognizer.recognize(instructionBlob);
        const heapAfter = performance.memory?.usedJSHeapSize ?? null;
        outcomes.japanese = {
          ok: true,
          firstText: japaneseFirst.text,
          secondText: japaneseSecond.text,
          recognizedCommand: japaneseSecond.text.includes("方程式") && japaneseSecond.text.includes("解"),
          coldMilliseconds: japaneseFirst.timings.totalMilliseconds,
          warmMilliseconds: japaneseSecond.timings.totalMilliseconds,
          heapDeltaBytes: heapBefore === null || heapAfter === null ? null : heapAfter - heapBefore,
          modelBytes: japaneseFirst.model.bytes,
          provider: japaneseFirst.provider,
        };

        const formulaBitmap = await createImageBitmap(blob);
        const mixedCanvas = new OffscreenCanvas(900, 400);
        const mixedContext = mixedCanvas.getContext("2d");
        mixedContext.fillStyle = "white";
        mixedContext.fillRect(0, 0, mixedCanvas.width, mixedCanvas.height);
        mixedContext.fillStyle = "black";
        mixedContext.font = '48px "Yu Gothic UI", "Meiryo", sans-serif';
        mixedContext.textBaseline = "middle";
        mixedContext.fillText("(1) 次の方程式を解け。", 28, 65);
        mixedContext.drawImage(formulaBitmap, 305, 250, 290, 120);
        formulaBitmap.close();
        const mixedResult = await mixedEngine.recognize(await toPng(mixedCanvas));
        outcomes.mixed = {
          ok: true,
          recognitionKind: mixedResult.recognitionKind,
          questionLabel: mixedResult.structuredCandidate.questionLabel,
          instructionText: mixedResult.structuredCandidate.instructionText,
          instructionIntent: mixedResult.structuredCandidate.instructionIntent,
          formulaText: mixedResult.structuredCandidate.formulaText,
          formulaMatchesExpected: mixedResult.structuredCandidate.formulaText.replaceAll(" ", "") === "x+y",
          confirmationRequired: mixedResult.confirmationRequired,
          verified: mixedResult.verified,
        };

      } catch (error) {
        outcomes.compositeFormula = outcomes.compositeFormula ?? {
          ok: false,
          code: String(error?.code || "ERROR"),
          message: String(error?.message || error),
        };
        outcomes.japanese = outcomes.japanese ?? {
          ok: false,
          code: String(error?.code || "ERROR"),
          message: String(error?.message || error),
        };
        outcomes.mixed = outcomes.mixed ?? {
          ok: false,
          code: String(error?.code || "ERROR"),
          message: String(error?.message || error),
        };
      } finally {
        await mixedEngine.dispose();
      }
      return outcomes;
    })()
  `;
  const evaluation = await protocol.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || "Browser evaluation failed.");
  }
  console.log(JSON.stringify({ extensionId, ...evaluation.result.value }, null, 2));
  const outcomes = evaluation.result.value;
  const explicitWebGpuPassed = !outcomes?.webgpu?.ok || outcomes.webgpu.matchesExpected;
  const workerPassed = Boolean(
    outcomes?.workerEngine?.ok
    && outcomes.workerEngine.firstMatchesExpected
    && outcomes.workerEngine.secondMatchesExpected
    && outcomes.workerEngine.sameProvider
    && outcomes.workerEngine.warmAfterFirst
    && outcomes.workerEngine.warmAfterSecond,
  );
  const providerExpectationPassed = expectation === "either"
    || (expectation === "webgpu"
      && outcomes.webgpu?.ok === true
      && outcomes.workerEngine?.provider === "webgpu")
    || (expectation === "wasm-fallback"
      && outcomes.webgpu?.ok === false
      && outcomes.workerEngine?.provider === "wasm");
  const japanesePassed = Boolean(
    outcomes?.japanese?.ok
    && outcomes.japanese.recognizedCommand
    && outcomes.japanese.provider === "wasm"
    && outcomes.japanese.modelBytes === 2_471_260,
  );
  const compositeFormulaPassed = Boolean(
    outcomes?.compositeFormula?.ok
    && outcomes.compositeFormula.recognitionKind === "formula-only"
    && outcomes.compositeFormula.matchesExpected,
  );
  const compositeFormula2xPassed = Boolean(
    outcomes?.compositeFormula2x?.ok
    && outcomes.compositeFormula2x.recognitionKind === "formula-only"
    && outcomes.compositeFormula2x.matchesExpected,
  );
  const mixedPassed = Boolean(
    outcomes?.mixed?.ok
    && outcomes.mixed.recognitionKind === "mixed"
    && outcomes.mixed.instructionIntent === "solve_equation"
    && outcomes.mixed.formulaMatchesExpected
    && outcomes.mixed.confirmationRequired === true
    && outcomes.mixed.verified === false,
  );
  if (
    !outcomes?.wasm?.ok
    || !outcomes.wasm.matchesExpected
    || !explicitWebGpuPassed
    || !providerExpectationPassed
    || !workerPassed
    || !compositeFormulaPassed
    || !compositeFormula2xPassed
    || !japanesePassed
    || !mixedPassed
  ) {
    process.exitCode = 1;
  }
} finally {
  await Promise.race([
    protocol.send("Page.close").catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, 1_000)),
  ]);
  protocol.close();
}
