import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(import.meta.dirname, '..');
const currentFile = fileURLToPath(import.meta.url);
const failures = [];
const notes = [];

async function allFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'codex-review') continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await allFiles(path));
    else files.push(path);
  }
  return files;
}

function fail(message) { failures.push(message); }
function assert(condition, message) { if (!condition) fail(message); }

const files = await allFiles(root);
const relativeFiles = new Set(files.map((file) => relative(root, file).replaceAll('\\', '/')));
const pinnedVendorHashes = new Map([
  [
    'vendor/algebrite/algebrite.bundle.js',
    'D51C5DBE412DF49E6EDA0376D81FB4C09DAF7B4D7EFC69AE693ED5876F2FF67E',
  ],
  ['vendor/onnxruntime-web/ort.webgpu.bundle.min.mjs', 'A690203281CBEAFA25B72AE30E56848EEE22DC8D881D8745D1B3353B0F5F4B87'],
  ['vendor/onnxruntime-web/ort-wasm-simd-threaded.jsep.wasm', 'B45970D0632383A057C27CA5B660B216F8E00C17CF8DB9F6207B5E4ABC839368'],
  ['vendor/ocr/ibem-im2typst/deployment.json', 'B8C710EADDE7B1E0173DB7742DA4629C08942E9B935F98FADB75ABF4DD01E78E'],
  ['vendor/ocr/ibem-im2typst/encoder.int8.onnx', '6C889DF95EB503C3DEBEFAD306E3BDC1F4D4A4F1D217F89A664D5710262BDAB1'],
  ['vendor/ocr/ibem-im2typst/decoder-step.int8.onnx', 'FEA2C1792DCFBB8B9E4ED3215D9591FA8AD5F99BD626BC9862355C666083EECF'],
  ['vendor/ocr/ibem-im2typst/encoder.fp16.onnx', 'E0720D76D8B78A68F281522A6FC3AD20B42D7E3A0102FBA9C08509C01E8D8477'],
  ['vendor/ocr/ibem-im2typst/decoder-step.fp16.onnx', '531B2B82D680A1CE1B082CCE1DB8ED83273E043947CE8F340D82CE728F078EE9'],
  ['vendor/ocr/ibem-im2typst/model-config.json', '91CE74A06E698C31323E61948C4016FC7D267D62976E6291095A71CB13CCCB34'],
  ['vendor/ocr/ibem-im2typst/preprocess-config.json', 'E39D199285CC83EC7B48A5A02AF39F3D904607E7B462D023AA6964ED3EE5659D'],
  ['vendor/ocr/ibem-im2typst/vocabulary.json', '45516A0227A25922979210A3D69DC400B2876D072FEC68B4C26557E05C7FE737'],
  ['vendor/ocr/ibem-im2typst/output-policy.json', '73B611F8CB8B9035F8DB334E5A0390956B78D20B8BBA4CF92C789221C8316797'],
  ['vendor/ocr/ibem-im2typst/LICENSE', 'B61D1B5BD1739737D2FA4395286F4F955618EA942854C60C8B810245A4DAF2CF'],
  ['vendor/ocr/ibem-im2typst/MODEL_CARD.md', 'DBBF239DF2DC281C44F76BFE7C9798817A2F750653A0753DCBB509C5FF0030FB'],
  ['vendor/ocr/ibem-im2typst/MODEL_LICENSE.md', '82C57FA9D3744FA58C1F6B346FCB2EA04C4CE73A2ED43AACE5B24B5E7022B5E7'],
  ['vendor/onnxruntime-web/LICENSE', '2F07C72751AED99790B8A4869CF2311DF85A860B22DED05FA22803587A48922C'],
]);

for (const [file, expectedHash] of pinnedVendorHashes) {
  assert(relativeFiles.has(file), `Missing vendored dependency: ${file}`);
  if (!relativeFiles.has(file)) continue;
  const source = await readFile(join(root, file));
  const actualHash = createHash('sha256').update(source).digest('hex').toUpperCase();
  assert(actualHash === expectedHash, `Vendored dependency hash mismatch: ${file}`);
}
assert(relativeFiles.has('vendor/algebrite/LICENSE'), 'Missing Algebrite license');
assert(relativeFiles.has('vendor/ocr/ibem-im2typst/LICENSE'), 'Missing IBEM OCR model license');
assert(relativeFiles.has('vendor/ocr/ibem-im2typst/MODEL_LICENSE.md'), 'Missing IBEM OCR model license notice');
assert(relativeFiles.has('vendor/onnxruntime-web/LICENSE'), 'Missing ONNX Runtime Web license');

let manifest;
try {
  manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  assert(manifest.manifest_version === 3, 'manifest_version must be 3');
  assert(Number(manifest.minimum_chrome_version) >= 109, 'minimum_chrome_version must support offscreen documents');
  assert(manifest.incognito === 'not_allowed', 'incognito must remain disabled for the shared offscreen preview boundary');
  assert(
    manifest.content_security_policy?.extension_pages === "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    'Extension CSP must allow only local scripts plus local WebAssembly compilation',
  );
} catch (error) {
  fail(`manifest.json is invalid: ${error.message}`);
  manifest = {};
}

const expectedPages = ['popup.html', 'history.html', 'analytics.html', 'review.html', 'settings.html', 'examples.html', 'help.html', 'about.html', 'offscreen.html', 'ocr-confirm.html'];
for (const page of expectedPages) assert(relativeFiles.has(page), `Missing HTML page: ${page}`);
assert(relativeFiles.has('js/content-script.js'), 'Missing on-demand content script: js/content-script.js');
assert(!manifest.content_scripts, 'Declarative content scripts are not allowed; inject on demand with activeTab');

const manifestRefs = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  manifest.options_page,
  ...(manifest.content_scripts ?? []).flatMap((item) => item.js ?? [])
].filter(Boolean);
for (const ref of manifestRefs) assert(relativeFiles.has(ref), `Manifest reference is missing: ${ref}`);

const permissions = new Set(manifest.permissions ?? []);
const allowedPermissions = new Set(['storage', 'activeTab', 'scripting', 'clipboardRead', 'clipboardWrite', 'offscreen']);
for (const permission of allowedPermissions) {
  assert(permissions.has(permission), `Required permission is missing: ${permission}`);
}
assert(permissions.size === allowedPermissions.size, `Unexpected permission found: ${[...permissions].filter((permission) => !allowedPermissions.has(permission)).join(', ')}`);

assert(
  !manifest.host_permissions?.length,
  `Network host permissions are not allowed: ${(manifest.host_permissions ?? []).join(', ')}`,
);

const jsFiles = files.filter((file) => ['.js', '.mjs'].includes(extname(file)));
for (const file of jsFiles) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) fail(`JavaScript syntax error in ${relative(root, file)}: ${(result.stderr || result.stdout).trim()}`);

  const source = await readFile(file, 'utf8');
  const relativeFile = relative(root, file).replaceAll('\\', '/');
  const isPinnedVendor = pinnedVendorHashes.has(relativeFile);
  const mayReadClipboard = relativeFile === 'js/clipboard.js';
  for (const match of source.matchAll(/(?:from\s*|import\s*)['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = resolve(dirname(file), match[1]);
    const candidates = [target, `${target}.js`, `${target}.mjs`, join(target, 'index.js')];
    let found = false;
    for (const candidate of candidates) {
      try { if ((await stat(candidate)).isFile()) { found = true; break; } } catch { /* checked below */ }
    }
    if (!found) fail(`Broken import in ${relative(root, file)}: ${match[1]}`);
  }

  if (!isPinnedVendor) {
    const urls = [...source.matchAll(/https?:\/\/[^'"`\s)]+/g)].map((match) => match[0]);
    for (const url of urls) {
      const isStandardNamespace = url === 'http://www.w3.org/2000/svg';
      if (!isStandardNamespace) fail(`External URL in JavaScript: ${url} (${relative(root, file)})`);
    }
  }

  if (file !== currentFile) {
    const forbiddenApiPatterns = isPinnedVendor
      ? [
          new RegExp('(?:globalThis|window)\\s*\\.\\s*' + ['ev', 'al'].join('')),
          new RegExp('new\\s+' + ['Fun', 'ction'].join('') + '\\s*\\('),
        ]
      : [
          ...(!mayReadClipboard ? [
            new RegExp(['navigator', 'clipboard', 'readText'].join('\\s*\\.\\s*')),
            new RegExp(['clipboard', 'read'].join('\\s*\\.\\s*') + '\\s*\\('),
          ] : []),
          new RegExp('(?:^|[^A-Za-z])' + ['ev', 'al'].join('') + '\\s*\\('),
          new RegExp('new\\s+' + ['Fun', 'ction'].join('') + '\\s*\\('),
        ];
    for (const pattern of forbiddenApiPatterns) {
      if (pattern.test(source)) fail(`Forbidden JavaScript API in ${relative(root, file)}: ${pattern}`);
    }
  }
}

for (const file of files.filter((candidate) => extname(candidate) === '.html')) {
  const source = await readFile(file, 'utf8');
  const remoteAsset = /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*['"]https?:\/\//i.exec(source);
  if (remoteAsset) fail(`External script or stylesheet in ${relative(root, file)}`);
}

const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.ico', '.onnx', '.wasm', '.tgz']);
const textFiles = files.filter((file) => !binaryExtensions.has(extname(file)));
const markerPattern = /TO[D]O|FIXM[E]/g;
for (const file of textFiles) {
  const info = await stat(file);
  if (info.size === 0) fail(`Empty file: ${relative(root, file)}`);
  const source = await readFile(file, 'utf8');
  const relativeFile = relative(root, file).replaceAll('\\', '/');
  if (
    file !== new URL(import.meta.url).pathname
    && !pinnedVendorHashes.has(relativeFile)
    && markerPattern.test(source)
  ) {
    notes.push(`Unfinished marker: ${relative(root, file)}`);
  }
  markerPattern.lastIndex = 0;
}
if (notes.length) failures.push(...notes);

const htmlCount = files.filter((file) => extname(file) === '.html').length;
const jsCount = files.filter((file) => ['.js', '.mjs'].includes(extname(file))).length;
const cssCount = files.filter((file) => extname(file) === '.css').length;

if (failures.length) {
  console.error(`Project check failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Project check passed: ${files.length} files, ${htmlCount} HTML, ${jsCount} JS/MJS, ${cssCount} CSS`);
  console.log('Manifest, references, imports, syntax, permissions, URLs, markers, and empty files are valid.');
}
