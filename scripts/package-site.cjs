const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.join(ROOT, '.deployment');
const PRODUCTION_FILES = [
  'index.html', 'styles.css', 'app.js', 'data.js', 'manifest.webmanifest', 'sw.js',
  'perth-coast.jpg', 'dm-sans.ttf', 'manrope.ttf', 'dm-sans-OFL.txt', 'manrope-OFL.txt',
  'perth-trip-planner.svg', 'perth-icon-180.png', 'perth-icon-192.png', 'perth-icon-512.png'
];

function checkReferences() {
  for (const file of PRODUCTION_FILES) assert.ok(fs.statSync(path.join(ROOT, file)).isFile(), `Missing production file: ${file}`);
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const references = manifest.icons.map((icon) => icon.src);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const css = fs.readFileSync(path.join(ROOT, 'styles.css'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) references.push(match[1]);
  for (const match of css.matchAll(/url\(['"]?([^'"\)]+)['"]?\)/g)) references.push(match[1]);
  const shell = vm.runInNewContext(`${fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')}\nAPP_SHELL;`, {
    URL,
    self: { registration: { scope: 'https://site.example/' }, addEventListener() {} }
  });
  references.push(...shell);
  for (const reference of references) {
    if (reference.startsWith('#') || /^(https?:|data:)/.test(reference)) continue;
    const file = reference.replace(/^\.\//, '').split(/[?#]/)[0] || 'index.html';
    assert.ok(PRODUCTION_FILES.includes(file), `Referenced asset not allowlisted: ${file}`);
  }
}

function packageSite() {
  checkReferences();
  const commit = process.env.GITHUB_SHA || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
  assert.match(commit, /^[a-f0-9]{40}$/i, 'A full Git commit SHA is required');
  fs.rmSync(OUTPUT, { recursive: true, force: true });
  fs.mkdirSync(OUTPUT);
  const files = {};
  for (const file of PRODUCTION_FILES) {
    const source = path.join(ROOT, file);
    fs.copyFileSync(source, path.join(OUTPUT, file));
    const bytes = fs.readFileSync(source);
    files[file] = { sha256: crypto.createHash('sha256').update(bytes).digest('hex'), size: bytes.length };
  }
  fs.writeFileSync(path.join(OUTPUT, 'deployment.json'), `${JSON.stringify({ commit, files }, null, 2)}\n`);
  console.log(`Packaged ${PRODUCTION_FILES.length} production files plus deployment.json in .deployment/ (${commit})`);
}

if (require.main === module) packageSite();
module.exports = { PRODUCTION_FILES, OUTPUT, checkReferences, packageSite };