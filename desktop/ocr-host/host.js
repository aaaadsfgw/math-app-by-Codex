import { createJapaneseOcrRecognizer } from "../../js/ocr/japanese-ocr.js";
import { createMixedOcrEngine } from "../../js/ocr/mixed-ocr-engine.js";
import { createOcrEngine } from "../../js/ocr/ocr-engine.js";
import { createIbemOcrBackendSession } from "../../js/ocr/ocr-worker-client.js";

const engine = createMixedOcrEngine({
  formulaEngine: createOcrEngine({ backendFactory: createIbemOcrBackendSession }),
  japaneseRecognizer: createJapaneseOcrRecognizer({
    resolveAssetUrl: (path) => new URL(`/${path}`, import.meta.url).href,
  }),
});

window.desktopOcrHost.onRequest(async ({ id, png, timeoutMs }) => {
  try {
    const result = await engine.recognize(new Blob([png], { type: "image/png" }), { timeoutMs });
    window.desktopOcrHost.reply(id, { ok: true, result });
  } catch (error) {
    window.desktopOcrHost.reply(id, {
      ok: false,
      code: String(error?.code || "OCR_FAILED").slice(0, 100),
      message: String(error?.message || "画像の認識に失敗しました。").slice(0, 500),
    });
  } finally {
    await engine.dispose();
  }
});
