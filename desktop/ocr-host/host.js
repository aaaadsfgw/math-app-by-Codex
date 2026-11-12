import { createJapaneseOcrRecognizer } from "../../js/ocr/japanese-ocr.js";
import { createMixedOcrEngine } from "../../js/ocr/mixed-ocr-engine.js";
import { createOcrEngine } from "../../js/ocr/ocr-engine.js";
import { createIbemOcrBackendSession } from "../../js/ocr/ocr-worker-client.js";
import { recognizeWindowsMixedOcr } from "./windows-mixed-ocr.js";

window.desktopOcrHost.onRequest(async ({ id, png, timeoutMs, model }) => {
  const japaneseRecognizer = createJapaneseOcrRecognizer({
    resolveAssetUrl: (path) => new URL(`/${path}`, import.meta.url).href,
  });
  const engine = model === "ibem" ? createMixedOcrEngine({
    formulaEngine: createOcrEngine({ backendFactory: createIbemOcrBackendSession }),
    japaneseRecognizer,
  }) : null;
  const image = new Blob([png], { type: "image/png" });
  try {
    const signal = AbortSignal.timeout(timeoutMs);
    const result = engine ? await engine.recognize(image, { timeoutMs }) : await recognizeWindowsMixedOcr(image, {
      signal,
      recognizeJapanese: (crop, options) => japaneseRecognizer.recognize(crop, options),
      recognizeFormula: async (crop) => {
        const response = await window.desktopOcrHost.recognizeFormula(id, new Uint8Array(await crop.arrayBuffer()));
        if (response.error) throw Object.assign(new Error(response.error.message), { code: response.error.code });
        return response;
      },
    });
    window.desktopOcrHost.reply(id, { ok: true, result });
  } catch (error) {
    window.desktopOcrHost.reply(id, {
      ok: false,
      code: String(error?.code || "OCR_FAILED").slice(0, 100),
      message: String(error?.message || "画像の認識に失敗しました。").slice(0, 500),
    });
  } finally {
    await (engine ?? japaneseRecognizer).dispose();
  }
});
