const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const { test } = require('node:test');
const { PRODUCTION_FILES, OUTPUT, checkReferences, packageSite } = require('./package-site.cjs');
const { verifyDeployment } = require('./verify-deployment.cjs');

const root = path.resolve(__dirname, '..');
const policy = (name) => JSON.parse(fs.readFileSync(path.join(root, 'deployment', name), 'utf8'));

test('OIDC trust allows exactly this repository main branch and STS audience', () => {
  const trust = policy('oidc-trust-policy.json').Statement;
  assert.equal(trust.length, 1);
  assert.equal(trust[0].Action, 'sts:AssumeRoleWithWebIdentity');
  assert.deepEqual(trust[0].Principal, { Federated: 'arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com' });
  assert.deepEqual(trust[0].Condition.StringEquals, {
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub': 'repo:dhar-arindam/perth-planner-2026-ui:ref:refs/heads/main'
  });
});

test('deployment permissions are scoped and cannot provision infrastructure', () => {
  const permissions = policy('deployment-permissions.json').Statement;
  assert.deepEqual(permissions.flatMap((entry) => entry.Action).sort(), [
    's3:ListBucket', 's3:GetBucketLocation', 's3:PutObject', 's3:DeleteObject',
    'cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'
  ].sort());
  assert.deepEqual(permissions.map((entry) => entry.Resource), [
    'arn:aws:s3:::BUCKET_NAME', 'arn:aws:s3:::BUCKET_NAME/*',
    'arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID'
  ]);
  assert.ok(permissions.every((entry) => entry.Effect === 'Allow'));
});

test('only the target CloudFront distribution receives bucket read access', () => {
  const statements = policy('s3-bucket-policy.json').Statement;
  const grants = statements.filter((entry) => entry.Effect === 'Allow');
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0], {
    Effect: 'Allow', Principal: { Service: 'cloudfront.amazonaws.com' }, Action: 's3:GetObject',
    Resource: 'arn:aws:s3:::BUCKET_NAME/*',
    Condition: { StringEquals: { 'AWS:SourceArn': 'arn:aws:cloudfront::ACCOUNT_ID:distribution/DISTRIBUTION_ID' } }
  });
  assert.ok(statements.some((entry) => entry.Effect === 'Deny' && entry.Condition?.Bool?.['aws:SecureTransport'] === 'false'));
});

test('production allowlist includes all referenced assets and excludes development files', () => {
  checkReferences();
  assert.equal(new Set(PRODUCTION_FILES).size, PRODUCTION_FILES.length);
  for (const file of PRODUCTION_FILES) assert.doesNotMatch(file, /^(infra|deployment|scripts|\.git|README|node_modules)/);
  assert.ok(PRODUCTION_FILES.includes('dm-sans-OFL.txt') && PRODUCTION_FILES.includes('manrope-OFL.txt'));
});

test('workflow retains explicit main-only guard, no infrastructure steps or environment model', () => {
  const source = fs.readFileSync(path.join(root, '.github/workflows/deploy.yml'), 'utf8');
  assert.ok(source.includes("if: github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')"));
  assert.ok(source.includes('needs: validate'));
  assert.ok(source.includes('cancel-in-progress: false'));
  assert.match(source, /role-to-assume: arn:aws:iam::176515272004:role\/PerthPlannerProduction-GitHubDeploymentRoleD4E2A70A-Dqi5GmCCzaKQ/);
  assert.doesNotMatch(source, /\bnpm\b|\bnpx\b|\bcdk\b|infra\/|cache-dependency-path|AWS_ROLE_ARN|secrets\.|pull_request_target|\benvironment:/);
  assert.ok(source.includes('id-token: write'));
  assert.ok(source.includes('pull_request:'));
  assert.ok(source.includes('workflow_dispatch:'));
});

test('PWA browser startup signal failure reports without hanging in cleanup', { timeout: 5000 }, async () => {
  const messages = [];
  const fakeProcess = { env: { PWA_BROWSER: process.execPath }, exitCode: 0 };
  const child = new EventEmitter();
  child.stderr = new EventEmitter();
  child.exitCode = null;
  child.signalCode = null;
  child.kill = () => { throw new Error('Already-exited browser must not be killed or awaited'); };
  const source = fs.readFileSync(path.join(__dirname, 'check-pwa.cjs'), 'utf8');
  await vm.runInNewContext(source, {
    __dirname, process: fakeProcess,
    require: (name) => name === 'node:child_process' ? {
      spawn: () => {
        setImmediate(() => {
          child.stderr.emit('data', Buffer.from('Simulated Linux browser startup failure'));
          child.signalCode = 'SIGTRAP';
          child.emit('exit', null, 'SIGTRAP');
        });
        return child;
      }
    } : require(name),
    setTimeout, clearTimeout,
    console: { error: (message) => messages.push(message), log() {} }
  });
  assert.equal(fakeProcess.exitCode, 1);
  assert.match(messages.join('\n'), /Browser exited before startup \(SIGTRAP\)/);
});

test('release verification checks actual content and rejects stale assets', async (context) => {
  packageSite();
  const previousUrl = process.env.CLOUDFRONT_URL;
  process.env.CLOUDFRONT_URL = 'https://fixture.cloudfront.net';
  context.after(() => {
    if (previousUrl === undefined) delete process.env.CLOUDFRONT_URL;
    else process.env.CLOUDFRONT_URL = previousUrl;
  });
  assert.deepEqual(fs.readdirSync(OUTPUT).sort(), [...PRODUCTION_FILES, 'deployment.json'].sort());
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.webmanifest': 'application/manifest+json' };
  let stale = false;
  context.mock.method(globalThis, 'fetch', async (url) => {
    const file = url.pathname.slice(1) || 'index.html';
    const bytes = stale && file === 'app.js' ? 'stale app' : fs.readFileSync(path.join(OUTPUT, file));
    return new Response(bytes, { status: 200, headers: { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' } });
  });
  await verifyDeployment();
  stale = true;
  await assert.rejects(verifyDeployment(), /Stale or corrupted file: app.js/);
});