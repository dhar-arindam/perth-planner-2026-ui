const cdk = require('aws-cdk-lib');
const { aws_s3: s3, aws_cloudfront: cloudfront, aws_cloudfront_origins: origins, aws_iam: iam } = cdk;

class PerthPlannerStack extends cdk.Stack {
  constructor(scope, id, props = {}) {
    super(scope, id, props);

    const bucket = new s3.Bucket(this, 'SiteBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      objectOwnership: s3.ObjectOwnership.BUCKET_OWNER_ENFORCED,
      encryption: s3.BucketEncryption.S3_MANAGED,
      versioned: true,
      enforceSSL: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN
    });

    const cachePolicy = new cloudfront.CachePolicy(this, 'SiteCachePolicy', {
      minTtl: cdk.Duration.seconds(0),
      defaultTtl: cdk.Duration.seconds(60),
      maxTtl: cdk.Duration.hours(1),
      enableAcceptEncodingGzip: true,
      enableAcceptEncodingBrotli: true
    });

    const distribution = new cloudfront.Distribution(this, 'SiteDistribution', {
      comment: 'Perth Trip Planner production',
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachePolicy,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
        compress: true
      }
    });

    let provider;
    if (props.existingGitHubOidcProviderArn) {
      if (!/^arn:aws:iam::\d{12}:oidc-provider\/token\.actions\.githubusercontent\.com$/.test(props.existingGitHubOidcProviderArn)) {
        throw new Error('existingGitHubOidcProviderArn must be the GitHub OIDC provider ARN in the target AWS account.');
      }
      if (!cdk.Token.isUnresolved(this.account) && props.existingGitHubOidcProviderArn.split(':')[4] !== this.account) {
        throw new Error('The existing GitHub OIDC provider must belong to the deployment account.');
      }
      provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GitHubProvider', props.existingGitHubOidcProviderArn);
    } else {
      const oidc = new iam.CfnOIDCProvider(this, 'GitHubOidcProvider', {
        url: 'https://token.actions.githubusercontent.com',
        clientIdList: ['sts.amazonaws.com']
      });
      oidc.applyRemovalPolicy(cdk.RemovalPolicy.RETAIN);
      provider = iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, 'GitHubProvider', oidc.attrArn);
    }

    const role = new iam.Role(this, 'GitHubDeploymentRole', {
      description: 'Deploy Perth planner static files from this repository main branch only',
      maxSessionDuration: cdk.Duration.hours(1),
      assumedBy: new iam.OpenIdConnectPrincipal(provider, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': 'repo:dhar-arindam/perth-planner-2026-ui:ref:refs/heads/main'
        }
      })
    });
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:ListBucket', 's3:GetBucketLocation'],
      resources: [bucket.bucketArn]
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['s3:PutObject', 's3:DeleteObject'],
      resources: [bucket.arnForObjects('*')]
    }));
    role.addToPolicy(new iam.PolicyStatement({
      actions: ['cloudfront:CreateInvalidation', 'cloudfront:GetInvalidation'],
      resources: [this.formatArn({ service: 'cloudfront', region: '', resource: 'distribution', resourceName: distribution.distributionId })]
    }));

    new cdk.CfnOutput(this, 'S3BucketName', { value: bucket.bucketName });
    new cdk.CfnOutput(this, 'CloudFrontDistributionId', { value: distribution.distributionId });
    new cdk.CfnOutput(this, 'CloudFrontUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'GitHubDeploymentRoleArn', { value: role.roleArn });
    new cdk.CfnOutput(this, 'AwsRegion', { value: this.region });
  }
}

module.exports = { PerthPlannerStack };