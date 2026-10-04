const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { spawnSync } = require('node:child_process');
const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');
const YAML = require('yaml');
const { PerthPlannerStack } = require('../stack.cjs');
const { PRODUCTION_FILES, OUTPUT, checkReferences, packageSite } = require('../../scripts/package-site.cjs');
const { verifyDeployment } = require('../../scripts/verify-deployment.cjs');

function template(existingGitHubOidcProviderArn) {
  return Template.fromStack(new PerthPlannerStack(new cdk.App(), 'Test', {
    env: { account: '111111111111', region: 'ap-south-1' }, existingGitHubOidcProviderArn
  }));
}

test('CDK refuses an implicit region when no CLI/environment region is configured', () => {
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../app.cjs')], {
    encoding: 'utf8',
    env: { ...process.env, PATH: '', Path: '', AWS_REGION: '', AWS_DEFAULT_REGION: '', CDK_DEFAULT_REGION: 'us-east-1' }
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Select an AWS region/);
});

test('private versioned encrypted bucket and CloudFront OAC; no website or custom DNS', () => {
  const site = template();
  site.resourceCountIs('AWS::S3::Bucket', 1);
  site.hasResourceProperties('AWS::S3::Bucket', {
    PublicAccessBlockConfiguration: { BlockPublicAcls: true, BlockPublicPolicy: true, IgnorePublicAcls: true, RestrictPublicBuckets: true },
    VersioningConfiguration: { Status: 'Enabled' },
    BucketEncryption: { ServerSideEncryptionConfiguration: [{ ServerSideEncryptionByDefault: { SSEAlgorithm: 'AES256' } }] },
    WebsiteConfiguration: Match.absent()
  });
  site.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain', UpdateReplacePolicy: 'Retain' });
  site.hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
    OriginAccessControlConfig: { OriginAccessControlOriginType: 's3', SigningBehavior: 'always', SigningProtocol: 'sigv4', Name: Match.anyValue() }
  });
  site.hasResourceProperties('AWS::CloudFront::Distribution', {
    DistributionConfig: {
      DefaultRootObject: 'index.html', Aliases: Match.absent(), CustomErrorResponses: Match.absent(),
      DefaultCacheBehavior: { ViewerProtocolPolicy: 'redirect-to-https' },
      Origins: [Match.objectLike({ OriginAccessControlId: Match.anyValue(), S3OriginConfig: { OriginAccessIdentity: '' } })]
    }
  });
  site.hasResourceProperties('AWS::CloudFront::CachePolicy', { CachePolicyConfig: { MinTTL: 0, DefaultTTL: 60, MaxTTL: 3600 } });
  site.resourceCountIs('AWS::Route53::RecordSet', 0);
  site.resourceCountIs('AWS::CertificateManager::Certificate', 0);
  const policy = Object.values(site.findResources('AWS::S3::BucketPolicy'))[0].Properties.PolicyDocument;
  const grants = policy.Statement.filter((entry) => entry.Effect === 'Allow');
  assert.equal(grants.length, 1);
  assert.deepEqual(grants[0].Principal, { Service: 'cloudfront.amazonaws.com' });
  assert.ok(grants[0].Condition.StringEquals['AWS:SourceArn']);
});

test('OIDC trust is exact repository/main; deployment role cannot provision infrastructure', () => {
  const site = template();
  site.resourceCountIs('AWS::IAM::OIDCProvider', 1);
  site.hasResourceProperties('AWS::IAM::OIDCProvider', { Url: 'https://token.actions.githubusercontent.com', ClientIdList: ['sts.amazonaws.com'] });
  const role = Object.values(site.findResources('AWS::IAM::Role'))[0].Properties;
  assert.equal(role.ManagedPolicyArns, undefined);
  const trust = role.AssumeRolePolicyDocument.Statement;
  assert.equal(trust.length, 1);
  assert.equal(trust[0].Action, 'sts:AssumeRoleWithWebIdentity');
  assert.deepEqual(trust[0].Condition.StringEquals, {
    'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
    'token.actions.githubusercontent.com:sub': 'repo:dhar-arindam/perth-planner-2026-ui:ref:refs/heads/main'
  });
  const policy = Object.values(site.findResources('AWS::IAM::Policy'))[0].Properties.PolicyDocument;
  assert.deepEqual(policy.Statement.flatMap((entry) => entry.Action).sort(), [
    's3:ListBucket', 's3:GetBucketLocation', 's3:PutObject', 's3:DeleteObject', 'cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'
  ].sort());
  for (const statement of policy.Statement) {
    assert.notEqual(statement.Resource, '*');
    assert.equal(statement.Effect, 'Allow');
  }
  const reused = template('arn:aws:iam::111111111111:oidc-provider/token.actions.githubusercontent.com');
  reused.resourceCountIs('AWS::IAM::OIDCProvider', 0);
  assert.throws(() => template('arn:aws:iam::222222222222:oidc-provider/token.actions.githubusercontent.com'), /deployment account/);
});

test('production allowlist includes all runtime references and no development files', () => {
  checkReferences();
  assert.equal(new Set(PRODUCTION_FILES).size, PRODUCTION_FILES.length);
  for (const file of PRODUCTION_FILES) assert.doesNotMatch(file, /^(infra|scripts|\.git|README|node_modules)/);
  assert.ok(PRODUCTION_FILES.includes('dm-sans-OFL.txt') && PRODUCTION_FILES.includes('manrope-OFL.txt'));
});

test('workflow YAML validates; PR and non-main dispatch cannot deploy or mint AWS tokens', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../.github/workflows/deploy.yml'), 'utf8');
  const document = YAML.parseDocument(source, { uniqueKeys: true });
  assert.deepEqual(document.errors, []);
  const workflow = document.toJS();
  assert.deepEqual(workflow.on.push.branches, ['main']);
  assert.deepEqual(workflow.on.pull_request.branches, ['main']);
  assert.ok(Object.hasOwn(workflow.on, 'workflow_dispatch'));
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.equal(workflow.jobs.validate.permissions, undefined);
  assert.deepEqual(workflow.jobs.deploy.permissions, { contents: 'read', 'id-token': 'write' });
  assert.equal(workflow.jobs.deploy.needs, 'validate');
  assert.equal(workflow.jobs.deploy.if, "github.ref == 'refs/heads/main' && (github.event_name == 'push' || github.event_name == 'workflow_dispatch')");
  assert.equal(workflow.jobs.deploy.concurrency['cancel-in-progress'], false);
  assert.equal(workflow.jobs.deploy.environment, undefined);
  for (const job of Object.values(workflow.jobs)) for (const step of job.steps) {
    if (step.uses) assert.match(step.uses, /^[\w-]+\/[\w-]+@[a-f0-9]{40}$/);
    assert.notEqual(step['continue-on-error'], true);
  }
  assert.doesNotMatch(source, /secrets\.|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|pull_request_target/);
});

test('release package verifies exact production content and rejects stale CloudFront files', async (context) => {
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