import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow } from "electron";
import { fixtures } from "./fixtures.mjs";
import { phase3Fixtures } from "./phase3-fixtures.mjs";

const phase3 = process.argv.includes("--phase3");
const data = join(import.meta.dirname, phase3 ? "phase3-data" : "data");
const fonts = [
  { math: "Cambria Math", file: "cambria.ttc" },
  { math: "Times New Roman", file: "times.ttf" },
  { math: "Segoe UI Symbol", file: "seguisym.ttf" },
];
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();
app.setPath("userData", await mkdtemp(join(tmpdir(), "math-study-log-ocr-fixtures-")));
app.on("window-all-closed", () => {});

function setup(row, index) {
  const font = fonts[index % fonts.length];
  const scale = row.scale ?? 1;
  const fontSize = [28, 36, 44, 32, 40][index % 5];
  const padding = [8, 13, 19, 10][index % 4];
  const render = { font: font.math, contextFont: "Yu Gothic", fontSize, padding, scale, mathml: row.body,
    ...(row.inline && { inline: true }) };
  const html = `<!doctype html><meta charset="utf-8"><style>
    html, body { margin: 0; background: white; color: #111; }
    #image { width: max-content; }
    .context { font: ${22 * scale}px "Yu Gothic", sans-serif; padding: ${4 * scale}px ${padding * scale}px; }
    #formula { width: max-content; padding: ${padding * scale}px;
      font: ${fontSize * scale}px "${font.math}", "Cambria Math", serif; }
    ${row.inline ? '#image { display: flex; align-items: center; }' : ''}
    math { font-family: inherit; }
    </style><div id="image">
    ${[row.label, row.instruction].filter(Boolean).map((text) => `<div class="context">${text}</div>`).join("")}
    <div id="formula"><math display="block">${row.body}</math></div></div>`;
  return { html, render };
}

async function run() {
  await mkdir(join(data, "images"), { recursive: true });
  const window = new BrowserWindow({ width: 1200, height: 580, show: false, useContentSize: true,
    webPreferences: { sandbox: true, nodeIntegration: false, contextIsolation: true, backgroundThrottling: false } });
  const cases = [];
  try {
    for (const [index, row] of (phase3 ? phase3Fixtures : fixtures).entries()) {
      const { html, render } = setup(row, index);
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const { formulaRect, width, height } = await window.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const rect = (id) => document.getElementById(id).getBoundingClientRect();
        const formula = rect("formula");
        const image = rect("image");
        const x = Math.floor(formula.left), y = Math.floor(formula.top);
        return { formulaRect: { x, y, width: Math.ceil(formula.right) - x, height: Math.ceil(formula.bottom) - y },
          width: Math.ceil(image.width), height: Math.ceil(image.height) };
      })()`);
      const source = await window.webContents.capturePage({ x: 0, y: 0, width, height });
      if (source.isEmpty() || source.getSize().width !== width || source.getSize().height !== height) {
        throw new Error(`Unexpected captured size for ${row.id}`);
      }
      const image = `images/${row.id}.png`;
      const formulaImage = formulaRect.x || formulaRect.y || (phase3 && (row.label || row.instruction))
        ? `images/${row.id}-formula.png` : image;
      const png = source.toPNG();
      const formula = formulaImage === image ? png : source.crop(formulaRect).toPNG();
      await writeFile(join(data, image), png);
      if (formulaImage !== image) await writeFile(join(data, formulaImage), formula);
      const { body, scale, ...expected } = row;
      cases.push({ ...expected, image, formulaImage, formulaRect, width, height,
        sha256: sha256(png), formulaSha256: sha256(formula), render });
    }
  } finally {
    window.destroy();
  }
  const fontHashes = {};
  for (const file of [...fonts.map((font) => font.file), "YuGothR.ttc"]) {
    try {
      fontHashes[file] = sha256(await readFile(join(process.env.SystemRoot, "Fonts", file)));
    } catch {
      fontHashes[file] = null;
    }
  }
  await writeFile(join(data, "manifest.json"), JSON.stringify({
    schemaVersion: 1,
    generator: { electron: process.versions.electron, chromium: process.versions.chrome,
      platform: process.platform, deviceScaleFactor: 1, fontHashes },
    cases,
  }, null, 2) + "\n");
  console.log(`${cases.length} generated fixtures`);
}

void app.whenReady().then(run).then(() => app.exit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
