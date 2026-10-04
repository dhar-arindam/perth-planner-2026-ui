const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

async function verifyDeployment() {
  const url = process.env.CLOUDFRONT_URL;
  assert.match(url || '', /^https:\/\/[a-z0-9]+\.cloudfront\.net\/?$/, 'CLOUDFRONT_URL must be the generated HTTPS CloudFront URL');
  const origin = `${url.replace(/\/$/, '')}/`;
  const directory = path.resolve(__dirname, '..', '.deployment');
  const release = JSON.parse(fs.readFileSync(path.join(directory, 'deployment.json'), 'utf8'));
  async function download(file) {
    const response = await fetch(new URL(file, origin), { signal: AbortSignal.timeout(30000), redirect: 'error' });
    assert.equal(response.status, 200, `${file || '/'} did not return HTTP 200`);
    return { bytes: Buffer.from(await response.arrayBuffer()), type: response.headers.get('content-type') || '' };
  }
  const metadata = await download('deployment.json');
  assert.deepEqual(JSON.parse(metadata.bytes.toString()), release, 'CloudFront release metadata is stale');
  const homepage = await download('');
  assert.match(homepage.type, /^text\/html\b/);
  assert.equal(crypto.createHash('sha256').update(homepage.bytes).digest('hex'), release.files['index.html'].sha256, 'Default root is not the latest index.html');
  await Promise.all(Object.entries(release.files).map(async ([file, expected]) => {
    const result = await download(file);
    assert.equal(crypto.createHash('sha256').update(result.bytes).digest('hex'), expected.sha256, `Stale or corrupted file: ${file}`);
    if (file === 'manifest.webmanifest') {
      assert.match(result.type, /^application\/manifest\+json\b/);
      assert.equal(JSON.parse(result.bytes.toString()).name, 'Perth Trip Planner');
    }
    if (file.endsWith('.js')) assert.match(result.type, /^(text|application)\/javascript\b/);
    if (file.endsWith('.css')) assert.match(result.type, /^text\/css\b/);
  }));
  console.log(`Verified HTTP 200, latest commit ${release.commit}, root page, all assets, manifest and service worker at ${origin}`);
}

if (require.main === module) verifyDeployment().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyDeployment };