# Perth Trip Planner

## Architecture And Changes

- This is a dependency-free static HTML/CSS/JavaScript PWA. Do not introduce a framework, backend, API, package manager, or build system unless explicitly requested.
- [index.html](../index.html) is the entry point; [data.js](../data.js) defines `window.TRIP`, and [app.js](../app.js) renders the UI and handles interactions. Preserve their deferred load order.
- Follow existing styles in [styles.css](../styles.css), rendering helpers, escaping, and event delegation. Keep changes focused and preserve the existing responsive design.
- Read nearby implementation and [README.md](../README.md) before editing. Preserve unrelated user changes; do not commit, push, or alter infrastructure unless requested.

## Trip Data And Persistence

- Preserve 10-24 October 2026 trip dates, confirmed flights, hotel dates, Woodside work schedule, all three weekend options, dinner timing, shopping, and street-food plans unless the user specifically requests a change.
- Confirmed flight events remain fixed and cannot be edited or skipped through actual-plan controls.
- Preserve existing `localStorage` keys and planned-versus-actual behavior. Planned entries remain recoverable; weekend previews are temporary, and saved actual plans are scoped to their date and weekend option.
- Keep tour names, operators, itinerary notes, and verification caveats available locally. Do not invent live prices, schedules, availability, or confirmed details.

## PWA And Offline Reliability

- Keep the complete itinerary, options, essentials, checklist, budget, and actual-plan editing functional without network access after initial preparation.
- [sw.js](../sw.js) precaches a complete version of the local application shell. Update `APP_SHELL` for new runtime assets; increment `CACHE_NAME` and the footer update date when releasing changed application files or trip data.
- Preserve coherent version updates: do not force a new worker into an open planner or mix old cached HTML with new scripts/data.
- Bundle runtime fonts, images, and icons locally. Keep required asset licenses. Do not cache arbitrary third-party websites; retain external links and their internet-required cues.
- Service workers require HTTPS or localhost. Do not treat `file://` usage as an offline installation or assume stored state migrates between origins.

## Validation

There is no dependency installation or production build command. The static files are the production artifacts; exclude repository metadata and test tooling from deployment.

Run relevant checks from the repository root:

```sh
node --check app.js
node --check data.js
node --check sw.js
node scripts/check-pwa.cjs
```

- Browser validation requires Node.js 22+ and Chromium; Node.js 24 LTS is suitable for CI. The test defaults to Windows Edge; set `PWA_BROWSER` to another Chromium executable when needed.
- Use the independent browser test for actual service-worker activation and offline reload; the VS Code integrated browser may leave registration pending.
- For UI/PWA changes, verify all weekend options, offline persistence, planned/actual restore, 320/375/390/430px layouts, and console errors. Normal offline reload must use the worker, not a hard refresh that bypasses it.
- Report checks that could not run and distinguish local validation from production deployment verification.

## AWS Deployment Guardrails

- Inspect current repository and AWS configuration first. Do not assume production resources exist or create/modify AWS resources without an explicit implementation request.
- Target static hosting through CloudFront's generated `*.cloudfront.net` URL with a private S3 bucket origin and OAC. Do not introduce custom domains, Route 53, or a backend.
- Use GitHub Actions OIDC and short-lived credentials. Restrict trust to this repository and the intended production branch/environment; scope IAM permissions to the target bucket and distribution. Never add long-lived AWS keys or broad administrative policies.
- Production deployment belongs to `main`; PRs validate without deploying. Restrict manual production dispatch to the intended branch and stop on any failed validation or deployment step.
- Do not apply immutable caching to HTML, manifests, service workers, or the current unhashed assets. Document release verification and rollback, and never claim the pipeline works until an actual Actions deployment succeeds.