const cdk = require('aws-cdk-lib');
const { PerthPlannerStack } = require('./stack.cjs');
const { execFileSync } = require('node:child_process');

const app = new cdk.App();
let region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
if (!region) {
  const profile = process.env.AWS_PROFILE || process.env.CDK_DEFAULT_PROFILE;
  try {
    region = execFileSync('aws', ['configure', 'get', 'region', ...(profile ? ['--profile', profile] : [])], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']
    }).trim();
  } catch {}
}
if (!region) throw new Error('Select an AWS region in your CLI profile or AWS_REGION before synthesis/deployment.');

new PerthPlannerStack(app, 'PerthPlannerProduction', {
  env: { region, account: process.env.CDK_DEFAULT_ACCOUNT },
  existingGitHubOidcProviderArn: app.node.tryGetContext('existingGitHubOidcProviderArn')
});