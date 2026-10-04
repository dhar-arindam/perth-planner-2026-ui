# One-Time AWS Hosting Setup

There is one environment: production. Hosting setup is manual; future application
uploads are automated by GitHub Actions. No CDK, bootstrap, npm, build system,
custom domain, Route 53, database, or backend is required.

## Existing Foundation: Reuse, Do Not Recreate

The earlier deployment already created these resources in account `176515272004`:

| Resource | Existing value |
| --- | --- |
| Region | `ap-south-1` |
| Private bucket | `perthplannerproduction-sitebucket397a1860-wzqmjci6w9tn` |
| Distribution | `EV423THGIU6DJ` |
| OAC | `E1E1RHCJ5T3SSL` |
| Production URL | `https://d1wqegzix5mr72.cloudfront.net` |
| GitHub provider | `arn:aws:iam::176515272004:oidc-provider/token.actions.githubusercontent.com` |
| Deployment role | `arn:aws:iam::176515272004:role/PerthPlannerProduction-GitHubDeploymentRoleD4E2A70A-Dqi5GmCCzaKQ` |

**No resource-creation commands below are needed for this existing foundation.**
The repository no longer needs CDK, but its existing CloudFormation stack still
records resource ownership. Do not delete `PerthPlannerProduction` or `CDKToolkit`:
doing so can remove live hosting/roles or affect other applications. This cleanup
does not detach, update, or delete any AWS resources. Any later detachment must be
a separately reviewed maintenance task with resource retention.

Read-only verification (safe; creates nothing):

```powershell
aws sts get-caller-identity
aws s3api get-public-access-block --bucket perthplannerproduction-sitebucket397a1860-wzqmjci6w9tn
aws s3api get-bucket-encryption --bucket perthplannerproduction-sitebucket397a1860-wzqmjci6w9tn
aws s3api get-bucket-versioning --bucket perthplannerproduction-sitebucket397a1860-wzqmjci6w9tn
aws cloudfront get-distribution --id EV423THGIU6DJ
aws iam get-role --role-name PerthPlannerProduction-GitHubDeploymentRoleD4E2A70A-Dqi5GmCCzaKQ
```

## Only If No Hosting Foundation Exists

**The following commands CREATE or CONFIGURE AWS resources. Do not run them for
the existing foundation above.** They are the manual setup recipe for an empty
foundation, not an infrastructure deployment pipeline. Review the target account
and costs first. Use your own temporary AWS CLI login; do not share credentials.

Run from the repository root in PowerShell 7+, with AWS CLI v2 installed:

```powershell
function Invoke-Aws {
  param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
  $result = & aws @Arguments
  if ($LASTEXITCODE -ne 0) { throw "AWS command failed: $($Arguments[0]) $($Arguments[1])" }
  $result
}

# aws login is interactive: authenticate privately in your own terminal first.
$account = (Invoke-Aws sts get-caller-identity --query Account --output text).Trim()
$region = $env:AWS_REGION
if (-not $region) { $region = $env:AWS_DEFAULT_REGION }
if (-not $region) { $region = (Invoke-Aws configure get region).Trim() }
if (-not $region) { throw 'Select an AWS region first.' }
Write-Output "Target account: $account; region: $region"

# STOP if hosting already exists. Choose one globally unique dedicated bucket.
$bucket = "perth-planner-$account-$region"
$roleName = 'perth-planner-github-deploy'
$temporary = Join-Path ([IO.Path]::GetTempPath()) ('perth-aws-setup-' + [guid]::NewGuid())
New-Item -ItemType Directory -Path $temporary | Out-Null

# CREATE one private bucket; do not enable website hosting or public ACLs.
if ($region -eq 'us-east-1') {
  Invoke-Aws s3api create-bucket --bucket $bucket --region $region --object-ownership BucketOwnerEnforced
} else {
  Invoke-Aws s3api create-bucket --bucket $bucket --region $region --object-ownership BucketOwnerEnforced --create-bucket-configuration "LocationConstraint=$region"
}
Invoke-Aws s3api put-public-access-block --bucket $bucket --public-access-block-configuration 'BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true'
Invoke-Aws s3api put-bucket-encryption --bucket $bucket --server-side-encryption-configuration 'Rules=[{ApplyServerSideEncryptionByDefault={SSEAlgorithm=AES256}}]'
Invoke-Aws s3api put-bucket-versioning --bucket $bucket --versioning-configuration Status=Enabled

# CREATE one OAC with always-on SigV4 signing.
$oac = (Invoke-Aws cloudfront create-origin-access-control --origin-access-control-config 'Name=PerthPlannerOAC,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3' --output json | ConvertFrom-Json).OriginAccessControl.Id

# CREATE one distribution using AWS's managed CachingDisabled policy.
# This avoids another custom cache-policy resource and is safe for unhashed PWA files.
$config = @{
  CallerReference = "perth-planner-$([guid]::NewGuid())"
  Comment = 'Perth Trip Planner production'
  Enabled = $true
  DefaultRootObject = 'index.html'
  Origins = @{ Quantity = 1; Items = @(@{
    Id = 'planner-s3'; DomainName = "$bucket.s3.$region.amazonaws.com"
    OriginAccessControlId = $oac
    S3OriginConfig = @{ OriginAccessIdentity = '' }
  }) }
  DefaultCacheBehavior = @{
    TargetOriginId = 'planner-s3'; ViewerProtocolPolicy = 'redirect-to-https'
    CachePolicyId = '4135ea2d-6df8-44a3-9df3-4b5a84be39ad'
    Compress = $true
    AllowedMethods = @{ Quantity = 2; Items = @('GET','HEAD'); CachedMethods = @{ Quantity = 2; Items = @('GET','HEAD') } }
    TrustedSigners = @{ Enabled = $false; Quantity = 0 }
    TrustedKeyGroups = @{ Enabled = $false; Quantity = 0 }
  }
  ViewerCertificate = @{ CloudFrontDefaultCertificate = $true }
  Restrictions = @{ GeoRestriction = @{ RestrictionType = 'none'; Quantity = 0 } }
  HttpVersion = 'http2'; IsIPV6Enabled = $true
}
$config | ConvertTo-Json -Depth 15 | Set-Content (Join-Path $temporary 'cloudfront.json') -Encoding utf8
$distribution = (Invoke-Aws cloudfront create-distribution --distribution-config "file://$temporary/cloudfront.json" --output json | ConvertFrom-Json).Distribution
$distributionId = $distribution.Id
$url = "https://$($distribution.DomainName)"

# Render the three plain JSON policy templates; no policy grants broad access.
foreach ($name in @('s3-bucket-policy.json','oidc-trust-policy.json','deployment-permissions.json')) {
  $text = (Get-Content "deployment/$name" -Raw).Replace('ACCOUNT_ID',$account).Replace('BUCKET_NAME',$bucket).Replace('DISTRIBUTION_ID',$distributionId)
  $text | ConvertFrom-Json | ConvertTo-Json -Depth 15 | Set-Content (Join-Path $temporary $name) -Encoding utf8
}
# CONFIGURE distribution-only S3 reads and deny insecure transport.
Invoke-Aws s3api put-bucket-policy --bucket $bucket --policy "file://$temporary/s3-bucket-policy.json"

# REUSE the account-level GitHub provider; CREATE it only if absent.
$providerArn = "arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com"
$providers = (Invoke-Aws iam list-open-id-connect-providers --output json | ConvertFrom-Json).OpenIDConnectProviderList.Arn
if ($providers -notcontains $providerArn) {
  Invoke-Aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com
} else {
  $provider = Invoke-Aws iam get-open-id-connect-provider --open-id-connect-provider-arn $providerArn --output json | ConvertFrom-Json
  if ($provider.ClientIDList -notcontains 'sts.amazonaws.com') { throw 'Existing provider must support the sts.amazonaws.com audience; review it before continuing.' }
}

# CREATE the single dedicated deployment role and attach only the scoped inline policy.
$role = (Invoke-Aws iam create-role --role-name $roleName --assume-role-policy-document "file://$temporary/oidc-trust-policy.json" --output json | ConvertFrom-Json).Role
Invoke-Aws iam put-role-policy --role-name $roleName --policy-name DeployStaticPlanner --policy-document "file://$temporary/deployment-permissions.json"
Invoke-Aws cloudfront wait distribution-deployed --id $distributionId

Write-Output "AWS_REGION=$region"
Write-Output "S3_BUCKET_NAME=$bucket"
Write-Output "CLOUDFRONT_DISTRIBUTION_ID=$distributionId"
Write-Output "CLOUDFRONT_URL=$url"
Write-Output "Deployment role ARN: $($role.Arn)"
Remove-Item $temporary -Recurse -Force
```

For a freshly created foundation, put the returned role ARN into the workflow's
`role-to-assume` field. It is non-secret and fixed for this one production site.
Configure the four returned values as GitHub repository variables. No GitHub
environment, AWS access keys, or application environment files are needed.

The role grants only bucket listing/location, object put/delete, and specific
distribution invalidation create/read. The read action is required to wait for
invalidation completion. The bucket's wildcard `s3:*` statement is an HTTPS
**Deny**, not a broad permission grant. Keep the bucket dedicated to this app:
deployment removes obsolete live keys. Versioning preserves earlier versions;
deletion of the bucket is always a deliberate manual operation.

Setup does not upload the planner. After configuration, the application is
published only when the production GitHub Actions run succeeds. Do not claim
deployment succeeded based solely on resource creation or a generated URL.