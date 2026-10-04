# perth-planner-2026-ui

Perth Trip Planner is a dependency-free static application for 10-24 October 2026.
There is no backend, API, package installation, bundler, or production build step.
The HTML, CSS, JavaScript, manifest, and bundled assets are the production files.
The separate `infra/` directory uses npm/CDK for infrastructure only, not the application.

## Deployment And Installation

- Publish this folder to a static HTTPS host, preserving the relative paths. Root and subdirectory hosting are supported.
- Serve JavaScript as `text/javascript`, the manifest as `application/manifest+json`, and images/fonts with their normal MIME types.
- Do not configure an HTML fallback for missing JavaScript or asset files.
- Open the deployed URL online once and wait for the footer to say "Available offline on this device" before travelling.
- On supported Android browsers, use the browser's install/add-to-home-screen option. On iPhone/iPad, use Safari's Share > Add to Home Screen. Browser installation UI varies.
- Normal reopening and reloading work offline after preparation. A forced hard refresh can bypass the service worker and requires connectivity.
- Service workers require HTTPS (or localhost for desktop testing). Opening the HTML through `file://`, or using an insecure LAN URL on a phone, does not enable offline installation.

## Offline Contents

The worker precaches the complete shell, structured trip data, local fonts, photo,
manifest, and icons. This keeps all dates, all weekend options, flights, hotels,
Woodside, existing transport/shopping/street-food notes, checklist, and budget
available without network access. External websites, maps, bookings, live status,
and schedules still need internet and are explicitly labelled. Third-party sites
are not intercepted or cached.

Checklist, budget, flight reminders, and actual-plan edits retain their existing
`localStorage` keys and behavior. Weekend preview choices remain temporary;
reselect the same option after reopening to see that option's saved actual plans.
No trip records, dates, flight details, work hours, or meal plans are changed by
offline support.

## Updates

When changing application files or trip data:

1. Increment `CACHE_NAME` in `sw.js` and update the footer's trip-planner date.
2. Add any new runtime assets to `APP_SHELL` and deploy all files together.
3. Reopen the app online. The browser downloads a complete new cache in the background.
4. Close all planner tabs/windows and reopen once the download finishes to use the new version.

The worker does not force an update into an open planner or mix old HTML with new
scripts/data. If an update cannot download its entire shell, the installed version
remains available. Activation removes old planner caches, not user storage. Trip
information is a dated snapshot, not a live quote or current availability claim;
existing verification notes still apply.

## Validation

With Node.js 22+ and Microsoft Edge installed on Windows:

```powershell
node --check app.js
node --check data.js
node --check sw.js
node scripts/check-pwa.cjs
```

Set `PWA_BROWSER` to another Chromium browser executable when needed. The check
serves the actual static files in a subdirectory, uses a temporary browser profile,
and tests manifest/icons, worker activation, cache population, offline reload with
HTTP cache disabled, all dates/options, local persistence, planned/actual restore,
320/375/390/430px layouts, and console errors. It adds no dependencies and does not
touch the user's browser storage. The VS Code integrated browser can leave worker
registration pending, so the independent browser check is the offline gate.

## Limitations And Assets

- Offline startup requires a successful first online preparation on the same device/origin.
- Browser storage can be cleared or evicted; private browsing may restrict persistence. Reopen online and confirm readiness before travelling.
- No account, cloud sync, backup, or automatic migration from the old `file://` origin exists. Opening a new HTTPS origin uses separate device storage.
- Installation and iOS home-screen behavior require a supported browser; physical Android/iOS installation was not tested here.
- DM Sans and Manrope are bundled locally from Google Fonts with their accompanying SIL Open Font License files.
- The existing coast photo is bundled from its original Unsplash asset, `photo-1518837695005-2083093ee35b`, rather than fetched at runtime.

## Deployment

### Architecture

`GitHub main -> Actions validation -> GitHub OIDC -> deployment role -> private S3 -> CloudFront OAC -> https://<generated>.cloudfront.net`

The CDK stack is `PerthPlannerProduction`. It creates one dedicated, private S3
bucket (public access blocked, owner-enforced, encrypted, versioned, retained), one
CloudFront distribution and OAC, a distribution-scoped read bucket policy, and a
least-privilege GitHub deployment role. An account-level GitHub OIDC provider is
created only when no existing provider ARN is supplied. New providers are retained.
There is no website endpoint, custom domain, Route 53, ACM certificate, API, or SPA
error-page fallback. Viewer HTTP requests redirect to HTTPS; the default root is
`index.html`.

The role trusts only `repo:dhar-arindam/perth-planner-2026-ui:ref:refs/heads/main`
with audience `sts.amazonaws.com`. It can list/get location for its bucket,
put/delete its objects, and create/read invalidations for its distribution. It
cannot provision infrastructure. Local CDK bootstrap/deployment uses your own
short-lived AWS login, not GitHub OIDC. Never put AWS access keys in GitHub.

### Safe Local Checks (No AWS Resources Created)

Prerequisites: Node.js 24 LTS, npm, Git, AWS CLI v2, and Chromium/Edge for tests.
From the repository root, in PowerShell:

```powershell
npm ci --prefix infra
node --check app.js
node --check data.js
node --check sw.js
node scripts/check-pwa.cjs
npm test --prefix infra
node scripts/package-site.cjs
```

The browser test defaults to Windows Edge. Set `$env:PWA_BROWSER` to a different
Chromium executable if needed. CI installs Chromium and sets this variable.
`npm ci` installs infrastructure/test dependencies only. The current pinned CDK
release bundles a `brace-expansion` dependency with a high-severity npm advisory;
`npm audit fix` cannot independently replace that bundled dependency. It is not
deployed to S3 or used by the app; update CDK when an upstream fix is available.

For an offline synthesis check with an explicitly artificial account:

```powershell
$env:CDK_DEFAULT_ACCOUNT = '111111111111'
$previousRegion = $env:AWS_REGION
$env:AWS_REGION = 'ap-south-1' # inspected CLI region; validation only
Push-Location infra
npx cdk synth --no-lookups
Pop-Location
Remove-Item Env:CDK_DEFAULT_ACCOUNT
$env:AWS_REGION = $previousRegion
```

Never use the artificial account for bootstrap/deployment. This creates only
local, ignored `infra/cdk.out/` files. There is no application compile/build step.

### One-Time AWS Setup (Creates Resources)

Do not run these commands until ready to create production infrastructure.
Authenticate in your own terminal (`aws login`, or your organization's SSO login),
select the intended AWS profile, and confirm its account. Do not share credentials.
The inspected default region is `ap-south-1`; the commands use your configured
region, rather than silently deploying to a default.

```powershell
if (-not $env:AWS_REGION) { $env:AWS_REGION = $env:AWS_DEFAULT_REGION }
if (-not $env:AWS_REGION) { $env:AWS_REGION = aws configure get region }
if (-not $env:AWS_REGION) { throw 'Select an AWS region before deployment.' }
$account = aws sts get-caller-identity --query Account --output text
if ($LASTEXITCODE -ne 0) { throw 'Refresh your AWS login before continuing.' }
$account = $account.Trim()
Write-Output "Target account: $account; region: $env:AWS_REGION"

$providerArn = "arn:aws:iam::${account}:oidc-provider/token.actions.githubusercontent.com"
$providerList = aws iam list-open-id-connect-providers --output json
if ($LASTEXITCODE -ne 0) { throw 'OIDC provider inspection failed; do not assume it is absent.' }
$providers = ($providerList | ConvertFrom-Json).OpenIDConnectProviderList.Arn
$oidcContext = @()
if ($providers -contains $providerArn) {
	$oidcContext = @('-c', "existingGitHubOidcProviderArn=$providerArn")
	aws iam get-open-id-connect-provider --open-id-connect-provider-arn $providerArn
	# Confirm URL is token.actions.githubusercontent.com and ClientIDList includes sts.amazonaws.com.
}

Push-Location infra
npx cdk bootstrap "aws://$account/$env:AWS_REGION" @oidcContext
if ($LASTEXITCODE -ne 0) { throw 'CDK bootstrap failed.' }
npx cdk deploy PerthPlannerProduction @oidcContext --outputs-file outputs.json
if ($LASTEXITCODE -ne 0) { throw 'CDK deployment failed.' }
Pop-Location
```

Bootstrap creates standard CDK support resources. Deployment creates the described
production stack; review IAM changes when CDK asks for approval. No application
files are uploaded by CDK. Keep the same OIDC create/import context on subsequent
stack updates. When importing, confirm the provider belongs to this account and
supports the required audience; do not replace an existing shared provider.

### AWS Outputs And GitHub Configuration

Read the non-secret outputs after the real CDK deployment:

```powershell
$outputs = (Get-Content infra/outputs.json -Raw | ConvertFrom-Json).PerthPlannerProduction
$outputs | Format-List
Write-Output $outputs.CloudFrontUrl
```

Outputs are also visible in the CloudFormation console. In GitHub repository
Settings > Secrets and variables > Actions > Variables, add these **repository
variables**, not secrets:

| GitHub variable | Stack output |
| --- | --- |
| `AWS_REGION` | `AwsRegion` |
| `S3_BUCKET_NAME` | `S3BucketName` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `CloudFrontDistributionId` |
| `CLOUDFRONT_URL` | `CloudFrontUrl` |
| `AWS_ROLE_ARN` | `GitHubDeploymentRoleArn` |

Do not attach a GitHub environment to the deployment job without also deliberately
changing the IAM trust: environment subjects differ from the current branch subject.

### GitHub Actions Release

Commit the application, assets, licenses, workflow, infrastructure source/lockfile,
test scripts, and documentation to `main`. Generated output and dependencies stay
ignored. This coding task stages files but does not commit or push them for you.

```powershell
git status
git diff --cached --stat
git commit -m "Add first production CDK and OIDC deployment pipeline"
git push origin main
```

The workflow `Validate and Deploy Perth Planner` runs syntax checks, independent
PWA/offline browser tests, infrastructure/workflow assertions, and offline CDK
synthesis. It packages only the explicit allowlist in `scripts/package-site.cjs`
into ignored `.deployment/`, adding `deployment.json` with the commit SHA and file
hashes. `.git/`, `.github/`, `infra/`, `scripts/`, dependencies, docs, editor files,
and temporary files are never uploaded. Relative application paths stay unchanged.

PRs to `main` validate only; they get no AWS OIDC permission. Pushes to `main` and
manual dispatch on `main` deploy the validated artifact. Deployment jobs are
serialized and not cancelled midway. There is no dependency install/build in the
deployment job. The command is `node scripts/deploy-site.cjs` after OIDC auth.

It syncs assets with deletion of obsolete keys, uploads HTML/manifest/release
metadata, then publishes the worker last. All current files are unhashed and get
`public,max-age=0,must-revalidate`; CloudFront's minimum TTL is zero. MIME types are
detected by AWS CLI, with an explicit `application/manifest+json` override for the
manifest. Versioned S3 keeps previous object versions; deletion removes live keys,
not historical versions. The dedicated bucket must not contain unrelated data.

After upload the workflow checks S3 inventory, submits `/*` invalidation, waits for
completion, and verifies HTTP 200 and hashes of the root page and every released
file, including manifest, worker, and JavaScript. Any failed step stops deployment.
S3 multi-object publishing is not atomic; rerun a failed deployment to recover.

### Verify, Redeploy, And Roll Back

Wait for a successful GitHub Actions run, then open the generated CloudFront URL
on a fresh browser/profile. Confirm the footer reports offline readiness and test
offline reload. Existing installed clients may keep their previous worker until
all planner windows close, as documented under Updates.

To verify the exact release independently, download the matching
`production-site-<commit>` artifact from the successful Actions run and extract it
into `.deployment/`. Do not regenerate this verification package from a Windows
checkout: Git line-ending conversion can change hashes without changing behavior.

```powershell
$env:CLOUDFRONT_URL = $outputs.CloudFrontUrl
node scripts/verify-deployment.cjs
Invoke-WebRequest "$($outputs.CloudFrontUrl)/deployment.json"
```

Manual redeployment: GitHub Actions > Validate and Deploy Perth Planner > Run
workflow > select `main`. Non-main manual runs do not deploy. Re-running a failed
deployment run is also supported.

Rollback uses a reviewed revert commit on `main`, not a manual dispatch from an
old branch. Revert the unwanted application changes, preserving the deployment
tooling. For changed PWA files, give the restored worker a **new** `CACHE_NAME` and
update the footer date before committing; otherwise offline clients can retain the
previous cache. Push the rollback commit and let the same pipeline validate,
upload, invalidate, and verify it. The new `deployment.json` identifies the rollback
commit. Do not blindly revert the entire initial pipeline commit. S3 versioning is
an additional recovery aid, not the routine rollback mechanism.

No production URL exists until CDK deployment succeeds, and no application is
published until an actual GitHub Actions deployment completes successfully.
