const assert = require('node:assert/strict');
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { PRODUCTION_FILES, OUTPUT } = require('./package-site.cjs');
const { verifyDeployment } = require('./verify-deployment.cjs');

async function deploySite() {
  const bucket = process.env.S3_BUCKET_NAME;
  const distribution = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  assert.match(bucket || '', /^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'Set S3_BUCKET_NAME');
  assert.match(distribution || '', /^[A-Z0-9]+$/, 'Set CLOUDFRONT_DISTRIBUTION_ID');
  assert.match(process.env.CLOUDFRONT_URL || '', /^https:\/\/[a-z0-9]+\.cloudfront\.net\/?$/, 'Set CLOUDFRONT_URL');
  assert.ok(process.env.AWS_REGION, 'Set AWS_REGION');
  const metadata = JSON.parse(fs.readFileSync(path.join(OUTPUT, 'deployment.json'), 'utf8'));
  assert.deepEqual(Object.keys(metadata.files).sort(), [...PRODUCTION_FILES].sort(), 'Unexpected release inventory');
  assert.deepEqual(fs.readdirSync(OUTPUT).sort(), [...PRODUCTION_FILES, 'deployment.json'].sort(), 'Unexpected deployment files');
  for (const [file, expected] of Object.entries(metadata.files)) {
    const bytes = fs.readFileSync(path.join(OUTPUT, file));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected.sha256, `Invalid release file: ${file}`);
  }
  if (process.env.GITHUB_SHA) assert.equal(metadata.commit, process.env.GITHUB_SHA, 'Release does not match workflow commit');
  const aws = (...args) => execFileSync('aws', [...args, '--no-cli-pager'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const controlFiles = ['index.html', 'manifest.webmanifest', 'deployment.json', 'sw.js'];
  const exclusions = controlFiles.flatMap((file) => ['--exclude', file]);
  process.stdout.write(aws('s3', 'sync', OUTPUT, `s3://${bucket}/`, '--delete', '--cache-control', 'public,max-age=0,must-revalidate', ...exclusions));
  for (const file of controlFiles) {
    const contentType = file === 'manifest.webmanifest' ? ['--content-type', 'application/manifest+json'] : [];
    process.stdout.write(aws('s3', 'cp', path.join(OUTPUT, file), `s3://${bucket}/${file}`, '--cache-control', 'public,max-age=0,must-revalidate', ...contentType));
  }
  const keys = JSON.parse(aws('s3api', 'list-objects-v2', '--bucket', bucket, '--query', 'Contents[].Key', '--output', 'json'));
  assert.deepEqual(keys.sort(), [...PRODUCTION_FILES, 'deployment.json'].sort(), 'S3 upload inventory mismatch');
  const invalidation = JSON.parse(aws('cloudfront', 'create-invalidation', '--distribution-id', distribution, '--paths', '/*', '--output', 'json'));
  console.log(`Submitted invalidation ${invalidation.Invalidation.Id}; waiting for completion`);
  aws('cloudfront', 'wait', 'invalidation-completed', '--distribution-id', distribution, '--id', invalidation.Invalidation.Id);
  await verifyDeployment();
}

if (require.main === module) deploySite().catch((error) => { console.error(error.message); process.exitCode = 1; });
module.exports = { deploySite };