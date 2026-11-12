import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, rmdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { createPix2TextService, pix2textPaths } from "../desktop/services/pix2text.js";

const lockPath = fileURLToPath(new URL("../bench/ocr/models.lock.json", import.meta.url));
const { revision, files } = JSON.parse(readFileSync(lockPath, "utf8"))["Pix2Text-MFR-1.5"];
const png = readFileSync(new URL("../bench/ocr/data/images/01-labelled-fraction-formula.png", import.meta.url));

function harness(t, { idleMs } = {}) {
  const children = [];
  const modelDirectory = mkdtempSync(join(tmpdir(), "msl-pix2text-"));
  const assets = Object.keys(files).map((name) => join(modelDirectory, name));
  for (const asset of assets) writeFileSync(asset, "");
  const service = createPix2TextService({
    pythonPath: lockPath,
    modelDirectory,
    idleMs,
    spawnProcess(program, args, options) {
      assert.equal(program, lockPath);
      assert.equal(args[0], "-I");
      assert.equal(options.shell, false);
      assert.equal(options.windowsHide, true);
      const child = new EventEmitter();
      child.stdin = new PassThrough();
      child.stdout = new PassThrough();
      child.stdin.on("data", (data) => {
        child.request = JSON.parse(data);
        assert.deepEqual(Buffer.from(child.request.image, "base64"), png);
      });
      child.kill = () => { child.killed = true; };
      child.reply = (overrides = {}) => {
        const reply = JSON.stringify({
          id: child.request.id,
          latex: "\\frac { x + 1 } { x - 1 }",
          metrics: { modelRevision: revision, loadMs: 1000, inferenceMs: 800,
            workingSetBytes: 200_000_000, peakWorkingSetBytes: 230_000_000 },
          ...overrides,
        });
        child.stdout.write(reply.slice(0, 10));
        child.stdout.write(reply.slice(10) + "\n");
      };
      children.push(child);
      return child;
    },
  });
  t.after(() => {
    service.close();
    for (const asset of assets) unlinkSync(asset);
    rmdirSync(modelDirectory);
  });
  return { service, children };
}

test("Windows setup and OCR resolve the same fixed model revision", () => {
  const { modelDirectory } = pix2textPaths("Local");
  assert.match(revision, /^[a-f\d]{40}$/u);
  assert.ok(modelDirectory.endsWith(revision));
});

test("Pix2Text rejects unavailable model assets without spawning", async () => {
  const service = createPix2TextService({
    pythonPath: lockPath,
    modelDirectory: dirname(lockPath),
    spawnProcess: () => assert.fail("Unavailable model must never spawn"),
  });
  assert.equal(service.isAvailable(), false);
  await assert.rejects(service.recognize(png), { code: "OCR_MODEL_NOT_INSTALLED" });
});

test("Pix2Text reuses its resident worker and validates bounded LaTeX with the pinned revision", async (t) => {
  const { service, children } = harness(t);
  assert.equal(service.isAvailable(), true);
  await assert.rejects(service.recognize(Buffer.alloc(32)), { code: "OCR_IMAGE_INVALID" });
  const first = service.recognize(png);
  await assert.rejects(service.recognize(png), { code: "OCR_BUSY" });
  children[0].reply();
  assert.equal((await first).latex, "\\frac { x + 1 } { x - 1 }");
  const second = service.recognize(png);
  assert.equal(children.length, 1);
  children[0].reply({ metrics: { modelRevision: revision, loadMs: 0, inferenceMs: 400,
    workingSetBytes: 200_000_000, peakWorkingSetBytes: 230_000_000 } });
  assert.equal((await second).metrics.loadMs, 0);
  const invalid = service.recognize(png);
  children[0].reply({ metrics: { modelRevision: "wrong-revision" } });
  await assert.rejects(invalid, { code: "OCR_WORKER_FAILED" });
  assert.equal(children[0].killed, true);
});

test("Pix2Text cancels and times out ongoing work, then restarts after abnormal exit", async (t) => {
  const { service, children } = harness(t);
  const controller = new AbortController();
  const cancelled = service.recognize(png, { signal: controller.signal });
  controller.abort();
  await assert.rejects(cancelled, { code: "OCR_CANCELLED" });
  assert.equal(children[0].killed, true);
  await assert.rejects(service.recognize(png, { timeoutMs: 5 }), { code: "OCR_TIMEOUT" });
  assert.equal(children[1].killed, true);
  const crashed = service.recognize(png);
  children[2].emit("close", 1);
  await assert.rejects(crashed, { code: "OCR_WORKER_FAILED" });
  const recovered = service.recognize(png);
  children[3].reply();
  await recovered;
  service.close();
  assert.equal(children[3].killed, true);
  await assert.rejects(service.recognize(png), { code: "OCR_CANCELLED" });
});

test("Pix2Text releases the worker after idle and starts a new worker for the next crop", async (t) => {
  const { service, children } = harness(t, { idleMs: 1 });
  const first = service.recognize(png);
  children[0].reply();
  await first;
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(children[0].killed, true);
  const next = service.recognize(png);
  children[1].reply();
  await next;
});
