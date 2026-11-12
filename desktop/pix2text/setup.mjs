import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, closeSync, existsSync, mkdirSync, openSync, renameSync, rmdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pix2textPaths } from "../services/pix2text.js";

const PYTHON_VERSION = "3.12.12";
const UV_VERSION = "0.9.11";
const UV_ARCHIVE = {
  url: `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/uv-x86_64-pc-windows-msvc.zip`,
  bytes: 20_972_744,
  sha256: "45a3ff2a68c246ed9fd2d9df032496c1beebe480357f356ac25d2cb144884c30",
};
const UV_EXECUTABLE = {
  bytes: 60_976_128,
  sha256: "e3f1abf6b4ee854b7514d12bc450a1bd64d71ad9ce9518744199079f227795b3",
};
const HERE = fileURLToPath(new URL(".", import.meta.url));
const REQUIREMENTS = join(HERE, "requirements.lock.txt");
const MODEL_DOWNLOADER = fileURLToPath(new URL("../../bench/ocr/download-model.py", import.meta.url));

async function verified(file, expected) {
  if (!existsSync(file) || statSync(file).size !== expected.bytes) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex") === expected.sha256;
}

async function ensureUv(directory, run) {
  const destination = join(directory, `uv-${UV_VERSION}.exe`);
  if (await verified(destination, UV_EXECUTABLE)) return destination;
  console.log(`Downloading uv ${UV_VERSION} for the isolated Python environment...`);
  const staging = join(directory, `download-${process.pid}`);
  mkdirSync(staging, { recursive: true });
  const archive = join(staging, "uv.zip");
  const executable = join(staging, "uv.exe");
  try {
    const response = await fetch(UV_ARCHIVE.url, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok) throw new Error(`uv download failed with HTTP ${response.status}`);
    const chunks = [];
    let total = 0;
    for await (const chunk of response.body) {
      total += chunk.byteLength;
      if (total > UV_ARCHIVE.bytes) throw new Error("The uv archive exceeds its expected size.");
      chunks.push(chunk);
    }
    writeFileSync(archive, Buffer.concat(chunks));
    if (!await verified(archive, UV_ARCHIVE)) throw new Error("uv archive SHA-256 or size mismatch.");
    run(join(process.env.SystemRoot, "System32", "tar.exe"), ["-xf", archive, "-C", staging, "uv.exe"]);
    if (!await verified(executable, UV_EXECUTABLE)) throw new Error("uv executable SHA-256 or size mismatch.");
    renameSync(executable, destination);
  } finally {
    rmSync(archive, { force: true });
    rmSync(executable, { force: true });
    rmdirSync(staging);
  }
  return destination;
}

async function setup() {
  if (process.platform !== "win32" || process.arch !== "x64") {
    throw new Error("The Pix2Text setup requires Windows with x64 Node.js.");
  }
  const paths = pix2textPaths();
  if (!paths.directory || !process.env.SystemRoot) throw new Error("Windows user folders are unavailable.");
  const logs = join(dirname(paths.directory), "logs");
  mkdirSync(logs, { recursive: true });
  mkdirSync(paths.directory, { recursive: true });
  const logPath = join(logs, "pix2text-setup.log");
  const log = openSync(logPath, "a");
  console.log(`Pix2Text setup log: ${logPath}`);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    !/^(?:UV_|PYTHON|PIP_|VIRTUAL_ENV$|CONDA_PREFIX$)/iu.test(key)));
  env.UV_PYTHON_INSTALL_DIR = join(paths.directory, "python");
  env.UV_CACHE_DIR = join(paths.directory, "cache");
  const logLine = (message) => writeFileSync(log, `${new Date().toISOString()} ${message}\n`);
  function run(command, args) {
    logLine(`Starting ${basename(command)} ${args[0]}`);
    const result = spawnSync(command, args, { env, shell: false, windowsHide: true, stdio: ["ignore", log, log] });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`${basename(command)} exited with code ${result.status}`);
  }

  try {
    const uv = await ensureUv(paths.directory, run);
    console.log("Preparing the Pix2Text CPU runtime...");
    if (!existsSync(paths.pythonPath) || !existsSync(paths.venvPythonPath)) {
      run(uv, ["python", "install", PYTHON_VERSION, "--no-bin", "--no-registry", "--no-config"]);
      run(uv, ["venv", paths.venv, "--python", PYTHON_VERSION, "--managed-python", "--no-python-downloads",
        "--allow-existing", "--no-config"]);
    }
    run(uv, ["pip", "sync", REQUIREMENTS, "--python", paths.venvPythonPath, "--require-hashes",
      "--only-binary", ":all:", "--no-config"]);
    console.log("Downloading and verifying the pinned Pix2Text model...");
    run(paths.pythonPath, ["-I", "-B", MODEL_DOWNLOADER, "Pix2Text-MFR-1.5", paths.modelDirectory]);
    run(paths.pythonPath, ["-I", "-S", "-B", "-c",
      "import sys; sys.path.append(sys.argv[1]); import numpy, onnxruntime, PIL, tokenizers", paths.sitePackages]);
    logLine("Pix2Text setup complete.");
  } catch (error) {
    logLine(error.stack || String(error));
    throw error;
  } finally {
    closeSync(log);
  }
}

try {
  await setup();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
