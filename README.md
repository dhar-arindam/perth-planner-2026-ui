# perth-planner-2026-ui

Perth Trip Planner is a dependency-free static application for 10-24 October 2026.
There is no backend, API, package installation, bundler, or production build step.
The HTML, CSS, JavaScript, manifest, and bundled assets are the production files.

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
`localStorage` keys and behavior. Option 1 is recorded as the chosen weekend plan
in trip data and opens automatically. Other weekend previews remain temporary;
clearing a preview or reopening returns to Option 1 and its saved actual plans.
No trip records, dates, flight details, work hours, or meal plans are changed by
offline support.

## Rottnest Island Transport

Rottnest (Saturday in Option 1, Sunday in Option 2) defaults to **Bus and walking**.
The Island Explorer guide and transport radio controls appear in both the weekend
preview and the selected day's planned/actual editor. **Bicycle** retains a short,
optional outing rather than requiring a full island loop. The transport choice is
saved on this device under `perth-trip-rottnest-mode`; weekend previews still reset
on reload to the chosen Option 1. Preview Option 2 again to reopen its saved actual plan.

Both modes support existing edit, skip, done, add and restore controls. Shared
ferry/dinner edits and added activities remain available across modes; mode-specific
stop edits remain attached to their own stops. Existing actual-plan keys and legacy
event IDs remain intact, including the original cycling activity in Bicycle mode.

The 8:45/9:00 hotel/check-in plan and 9:30 AM/4:15 PM ferries are proposals only.
Booked departure points, sailings and operator boarding requirements take precedence.
The official bus page was checked on 16 October 2026 and confirms Quokka Coaches
Island Explorer as a hop-on, hop-off service, separate from the settlement shuttle.
No current ferry booking or Island Explorer timetable was verified for this update.
Beach choices require the current official service map, timetable and walking-access
check; they are not claims of named bus stops. Verify routes, stop count, frequency,
hours, prices, ticket requirements and seasonal availability at the
[official bus information page](https://www.rottnestisland.com/visit/getting-around/by-bus).
The guide and itinerary remain offline; official websites require internet.

## AI Travel Guide

The optional guide appears below the daily plan. It is **not connected by default**;
the existing planner remains fully usable offline. AI needs connectivity and an
owner-only OAuth sign-in. No live weather, timetable, routing or opening-hours
integration is included. Chat proposals require an explicit Apply action and use
the existing planned/actual storage; fixed commitments cannot be changed by AI.
AI proposals now carry five-minute P-256 signatures bound to their exact changes,
trip revision, context, owner and session. Apply requires an authenticated server
confirmation and a verified apply receipt; it is unavailable offline, while the
manual itinerary editor stays offline-capable. The backend requires canonical
commitment metadata and strict gateway claims. It retrieves its server-only key
from one configured Secrets Manager ARN with the execution role, validates the
public half, and caches only the validated KeyObject for at most 60 seconds. Raw
PEM environment values are rejected; only the ARN and public pin are configured.
The browser receives only the matching public JWK. See the setup guide for the
environment settings and the stateless replay limitations. Stage 2B verified the
deployed Secrets Manager signer path while chat remained disabled; Bedrock and
frontend integration remain unconfigured and unverified.

Tap **Use my location** to request browser location permission for a single reading.
The guide shows coordinates, accuracy and the observation time in Perth. It does
not track in the background or request permission on page load. HTTPS or localhost
is required; permission denial, unavailable location and timeout leave manual entry
available. **Clear location** removes it from subsequent chat snapshots. A reading
stays in memory for this page and is sent with your chat message or server
confirmation of AI changes (confirmation itself does not invoke the model);
there is no reverse-geocoding lookup or automatic place-name detection. Device
location can be requested without AI sign-in, but AI chat still needs its setup
and connectivity. Device/browser location availability offline is not guaranteed.
Conversations that use location stay in memory and clear on reload, so an AI reply
cannot save echoed coordinates into chat history. Clear location stops including
the reading in new snapshots; Clear chat also resets the in-memory conversation.
Ordinary non-location chats retain their existing bounded session history.
Coordinate-like precise decimal values and degrees/minutes/seconds are rejected in AI-generated itinerary
titles/notes. A coarse device reading is labelled approximate; a manual landmark
is often more useful than an inaccurate position.

See [AI setup, architecture, security, costs and verification](docs/travel-guide.md)
before creating any AWS resources or filling in the public configuration. Approved
disabled-backend provisioning and selected real authentication checks are recorded
there; no AI frontend deployment or model invocation has been performed. Mocked guide tests run through
the existing deployment regression gate, or directly with
`node --test scripts/travel-guide.test.cjs`.

## Updates

When changing application files or trip data:

1. Increment `CACHE_NAME` in `sw.js`, match the footer's version label to that cache version, and update the footer's trip-planner date.
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

There is **one environment: production**. The static application has no build,
dependency installation, infrastructure framework, or promotion pipeline.

`GitHub main -> Actions -> GitHub OIDC -> dedicated role -> private S3 -> CloudFront OAC -> generated CloudFront URL`

### One-Time Hosting And OIDC

Create/configure hosting manually once through AWS Console/CLI. Exact commands,
policy templates, and safety notes are in [docs/aws-setup.md](docs/aws-setup.md).
The existing foundation already meets the target; **do not create another bucket,
distribution, provider, or role**. Removing CDK source does not remove the existing
AWS resources. Do not delete their legacy CloudFormation/ bootstrap stacks.

S3 must remain private, encrypted, versioned, and public-access-blocked, without
website hosting. CloudFront uses its S3 origin via OAC, `index.html` as the default
root, HTTPS, and no aliases or SPA fallback. No custom domain, Route 53, or custom
ACM certificate is needed.

GitHub uses short-lived OIDC credentials. The dedicated role trusts only
`repo:dhar-arindam/perth-planner-2026-ui:ref:refs/heads/main` and audience
`sts.amazonaws.com`. It can list/upload/delete this bucket's objects and
create/read invalidations for this distribution; it cannot create infrastructure.
The existing role ARN is a non-secret literal in the workflow. Do not add AWS keys
or GitHub environment-specific configuration.

### Four GitHub Repository Variables

Settings > Secrets and variables > Actions > Variables:

| Variable | Existing production value |
| --- | --- |
| `AWS_REGION` | `ap-south-1` |
| `S3_BUCKET_NAME` | `perthplannerproduction-sitebucket397a1860-wzqmjci6w9tn` |
| `CLOUDFRONT_DISTRIBUTION_ID` | `EV423THGIU6DJ` |
| `CLOUDFRONT_URL` | `https://d1wqegzix5mr72.cloudfront.net` |

The former `AWS_ROLE_ARN` variable is no longer used and may be removed from
GitHub. The actual dedicated IAM role is still required and must not be deleted.

### Automated Application Deployment

The workflow `.github/workflows/deploy.yml` validates JavaScript, workflow YAML,
plain policy templates, packaging, and offline/PWA behavior with Node.js 24 and
Chromium. It requires no npm install, CDK, synthesis, or application build.
PRs to `main` validate only, without an AWS token. Pushes to `main` and manual
dispatch on `main` deploy the validated artifact. Non-main dispatch cannot deploy.

`node scripts/package-site.cjs` copies only an explicit production allowlist into
ignored `.deployment/`, preserving paths and including fonts/photos/icons and
licenses. Git metadata, policy templates, docs, tests, editor files, and development
tooling are excluded. `deployment.json` records the commit and file hashes without
changing the planner. The package is an upload artifact, not a build system.

After OIDC authentication, `node scripts/deploy-site.cjs` syncs to the dedicated
bucket with obsolete-key deletion. It publishes assets first and the worker last,
uses revalidation headers for current unhashed files, and sets the manifest MIME
type explicitly. Then it submits `/*` invalidation, waits for completion, checks
S3 inventory, and verifies HTTP 200 and exact release hashes through CloudFront.
Deployment is serialized, stops on errors, and is not atomic across S3 objects;
rerun a failed upload to recover. No AWS infrastructure is created by Actions.

### Redeploy, Verify, And Roll Back

Manual redeploy: Actions > Validate and Deploy Perth Planner > Run workflow >
select `main`. Wait for the actual run to succeed, open the CloudFront URL, confirm
offline readiness, and test a normal offline reload. Installed clients retain
their existing worker until planner windows close, as described under Updates.

For exact verification, download the successful run's `production-site-<commit>`
artifact into `.deployment/`; Windows line endings can make a regenerated package
different. Then run:

```powershell
$env:CLOUDFRONT_URL = 'https://d1wqegzix5mr72.cloudfront.net'
node scripts/verify-deployment.cjs
```

Rollback with a reviewed revert commit on `main`, preserving deployment tooling.
For changed PWA files, use a new worker `CACHE_NAME` and update the footer date.
Push the rollback commit through the same validation/upload/invalidation checks.
S3 version history is a recovery aid, not the normal release path.

Safe local checks (no AWS resources created or uploads performed):

```powershell
node --check app.js
node --check data.js
node --check sw.js
node scripts/check-pwa.cjs
node --test scripts/deployment.test.cjs
node scripts/package-site.cjs
```

Do not claim production deployment succeeded until the actual Actions run and
CloudFront release verification succeed. This cleanup performs neither.
