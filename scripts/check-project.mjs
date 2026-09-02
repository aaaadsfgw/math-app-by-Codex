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
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
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
]);

for (const [file, expectedHash] of pinnedVendorHashes) {
  assert(relativeFiles.has(file), `Missing vendored dependency: ${file}`);
  if (!relativeFiles.has(file)) continue;
  const source = await readFile(join(root, file));
  const actualHash = createHash('sha256').update(source).digest('hex').toUpperCase();
  assert(actualHash === expectedHash, `Vendored dependency hash mismatch: ${file}`);
}
assert(relativeFiles.has('vendor/algebrite/LICENSE'), 'Missing Algebrite license');

let manifest;
try {
  manifest = JSON.parse(await readFile(join(root, 'manifest.json'), 'utf8'));
  assert(manifest.manifest_version === 3, 'manifest_version must be 3');
  assert(Number(manifest.minimum_chrome_version) >= 109, 'minimum_chrome_version must support offscreen documents');
  assert(manifest.incognito === 'not_allowed', 'incognito must remain disabled for the shared offscreen preview boundary');
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

const textFiles = files.filter((file) => !['.png', '.jpg', '.jpeg', '.gif', '.ico'].includes(extname(file)));
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
