import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { cpus, release, totalmem, tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, protocol, session } from "electron";
import { createLocalOcr, ocrAssetPath, registerOcrScheme } from "../../desktop/services/local-ocr.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const data = join(import.meta.dirname, "data");
const manifestPath = join(data, "manifest.json");
const base = "math-study-ocr://local";
const mixedContext = process.argv.includes("--context");
const context = mixedContext || process.argv.includes("--full-image");
const gpu = process.argv.includes("--gpu");
const provider = gpu ? "webgpu" : "wasm";
const suffix = mixedContext ? "mixed-" : context ? "full-" : "";
const outputPath = join(import.meta.dirname, "results", `ibem-${suffix}${gpu ? "gpu" : "cpu"}.json`);
const benchPages = new Set(["bench/ocr/ibem-host.html", "bench/ocr/ibem-host.js"]);
const types = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm" };
const policy = "default-src 'none'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:";
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

registerOcrScheme(protocol);
if (!gpu) app.disableHardwareAcceleration();
app.setPath("userData", await mkdtemp(join(tmpdir(), "math-study-log-ocr-bench-")));
app.on("window-all-closed", () => {});

function workingSetKiB() {
  return app.getAppMetrics().reduce((sum, process) => sum + process.memory.workingSetSize, 0);
}

async function createHost() {
  const partition = session.fromPartition("ocr-benchmark", { cache: false });
  partition.webRequest.onBeforeRequest(({ url }, callback) => {
    callback({ cancel: !url.startsWith(`${base}/`) && !url.startsWith(`blob:${base}/`) });
  });
  partition.protocol.handle("math-study-ocr", async ({ url }) => {
    const path = new URL(url).pathname.slice(1);
    if (!url.startsWith(`${base}/`) || (!benchPages.has(path) && !ocrAssetPath(url))) {
      return new Response(null, { status: 404 });
    }
    return new Response(await readFile(join(root, path)), {
      headers: { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Content-Security-Policy": policy },
    });
  });
  const window = new BrowserWindow({ show: false, webPreferences: {
    session: partition, sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false,
  } });
  await window.loadURL(`${base}/bench/ocr/ibem-host.html`);
  return window;
}

async function run() {
  const manifestBytes = (await readFile(manifestPath, "utf8")).replaceAll("\r\n", "\n");
  const { cases } = JSON.parse(manifestBytes);
  const model = JSON.parse(await readFile(join(root, "vendor/ocr/ibem-im2typst/deployment.json")));
  const files = ["encoder", "decoder"].map((type) => model.variants[provider][type]);
  const artifacts = Object.fromEntries(files.map((file) => [file, model.artifacts[file]]));
  for (const [file, metadata] of Object.entries(artifacts)) {
    const bytes = await readFile(join(root, "vendor/ocr/ibem-im2typst", file));
    if (sha256(bytes) !== metadata.sha256) throw new Error(`Weight hash mismatch: ${file}`);
  }
  const host = mixedContext ? null : await createHost();
  const mixed = mixedContext ? createLocalOcr({ BrowserWindow, ipcMain, session }) : null;
  const baseline = workingSetKiB();
  let peak = baseline;
  const sample = () => { peak = Math.max(peak, workingSetKiB()); };
  const monitor = setInterval(sample, 100);
  const rows = [];
  let loadMs = null;
  let adapter = null;
  try {
    if (host) loadMs = await host.webContents.executeJavaScript(`ibemBenchmark.load(${JSON.stringify(provider)})`);
    for (const row of cases) {
      if (context && row.image === row.formulaImage) continue;
      const bytes = await readFile(join(data, context ? row.image : row.formulaImage));
      if (sha256(bytes) !== (context ? row.sha256 : row.formulaSha256)) {
        throw new Error(`Fixture hash mismatch: ${row.id}`);
      }
      let recognized;
      if (mixed) {
        const start = performance.now();
        try {
          const result = await mixed.recognize(bytes);
          recognized = {
            text: result.structuredCandidate.formulaText,
            raw_text: result.structuredCandidate.rawFormulaText,
            label: result.structuredCandidate.questionLabel,
            instruction: result.structuredCandidate.instructionText,
            provider: result.provider,
          };
        } catch (error) {
          recognized = { text: "", error: `${error.code}: ${error.message}` };
        }
        recognized.elapsed_ms = performance.now() - start;
      } else {
        recognized = await host.webContents.executeJavaScript(
          `ibemBenchmark.recognize(${JSON.stringify(bytes.toString("base64"))})`,
        );
      }
      sample();
      rows.push({ id: row.id, ...recognized });
      console.log(row.id, Math.round(recognized.elapsed_ms), recognized.error ?? "");
    }
    if (gpu && host) adapter = await host.webContents.executeJavaScript("ibemBenchmark.gpuAdapter()");
  } finally {
    clearInterval(monitor);
    host?.destroy();
    mixed?.close();
  }
  await writeFile(outputPath, JSON.stringify({
    model: "IBEM-im2typst", device: gpu ? "gpu" : "cpu", provider, adapter, threads: gpu ? null : 1,
    runtime: process.versions.electron, chromium: process.versions.chrome, platform: process.platform,
    os: release(), cpu: cpus()[0]?.model, logical_cores: cpus().length, total_memory_bytes: totalmem(),
    model_id: model.model_name, weight_artifacts: artifacts, fixture_sha256: sha256(manifestBytes),
    load_ms: loadMs, baseline_rss_bytes: baseline * 1024, peak_rss_bytes: peak * 1024,
    memory_scope: "sampled sum of working sets across Electron processes; shared pages can be counted more than once",
    context, context_mode: mixedContext ? "windows-mixed-pipeline" : context ? "standalone-full-image" : null,
    rows,
  }, null, 2) + "\n");
}

// Do not await app readiness in Electron's module initialization.
void app.whenReady().then(run).then(() => app.exit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
