import { createIbemOcrBackendSession } from "../../js/ocr/ocr-worker-client.js";

let worker;
globalThis.ibemBenchmark = {
  async load(provider) {
    const start = performance.now();
    worker = await createIbemOcrBackendSession({
      provider,
      signal: AbortSignal.timeout(90_000),
    });
    return performance.now() - start;
  },
  async recognize(base64) {
    const png = new Blob([Uint8Array.fromBase64(base64)], { type: "image/png" });
    const start = performance.now();
    try {
      const result = await worker.recognize(png, { signal: AbortSignal.timeout(90_000) });
      return {
        text: result.text,
        raw_text: result.rawText,
        elapsed_ms: performance.now() - start,
      };
    } catch (error) {
      return { text: "", error: `${error.code}: ${error.message}`, elapsed_ms: performance.now() - start };
    }
  },
  async gpuAdapter() {
    const info = (await navigator.gpu?.requestAdapter())?.info;
    return info ? { vendor: info.vendor, architecture: info.architecture, device: info.device } : null;
  },
};
