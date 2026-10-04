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
