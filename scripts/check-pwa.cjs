const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { generateKeyPairSync } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const browserPath = process.env.PWA_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
assert.equal(manifest.name, 'Perth Trip Planner');
assert.equal(manifest.display, 'standalone');
for (const size of [192, 512]) {
  const icon = manifest.icons.find((entry) => entry.sizes === `${size}x${size}`);
  const bytes = fs.readFileSync(path.join(root, icon.src));
  assert.equal(bytes.readUInt32BE(16), size);
  assert.equal(bytes.readUInt32BE(20), size);
}

const mimeTypes = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf'
};
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  const relative = url.pathname.replace(/^\/planner\//, '') || 'index.html';
  const file = path.resolve(root, relative);
  if (!url.pathname.startsWith('/planner/') || !file.startsWith(`${root}${path.sep}`)) {
    response.writeHead(404).end();
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) response.writeHead(404).end();
    else response.writeHead(200, { 'Content-Type': mimeTypes[path.extname(file)] || 'application/octet-stream' }).end(data);
  });
});

async function main() {
  assert.ok(fs.existsSync(browserPath), 'Set PWA_BROWSER to a Chromium browser executable');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'perth-pwa-check-'));
  let browser;
  let socket;
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const origin = `http://127.0.0.1:${server.address().port}/planner/`;
    browser = spawn(browserPath, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank']);
    const endpoint = await new Promise((resolve, reject) => {
      let stderr = '';
      const failed = (error) => { cleanup(); reject(error); };
      const exited = (code, signal) => failed(new Error(`Browser exited before startup (${signal || code}): ${stderr.slice(-2000)}`));
      const timer = setTimeout(() => failed(new Error(`Browser startup timed out: ${stderr.slice(-2000)}`)), 20000);
      const cleanup = () => {
        clearTimeout(timer);
        browser.removeListener('error', failed);
        browser.removeListener('exit', exited);
      };
      browser.once('error', failed);
      browser.once('exit', exited);
      browser.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
        const match = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);
        if (match) { cleanup(); resolve(match[1]); }
      });
    });
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    let sessionId;
    const pending = new Map();
    const listeners = new Map();
    const errors = [];
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const entry = pending.get(message.id);
        if (!entry) return;
        pending.delete(message.id);
        clearTimeout(entry.timer);
        if (message.error) entry.reject(new Error(JSON.stringify(message.error)));
        else entry.resolve(message.result);
      } else {
        if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
        if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') errors.push(JSON.stringify(message.params.args));
        listeners.get(message.method)?.(message.params);
      }
    });
    function command(method, params = {}, browserLevel = false) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 30000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params, ...(!browserLevel && sessionId ? { sessionId } : {}) }));
      });
    }
    function loaded() {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Page load timed out')), 30000);
        listeners.set('Page.loadEventFired', () => { clearTimeout(timer); listeners.delete('Page.loadEventFired'); resolve(); });
      });
    }
    async function evaluate(expression) {
      const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
      return result.result.value;
    }
    async function reload() {
      const completion = loaded();
      await command('Page.reload');
      await completion;
    }
    const target = await command('Target.createTarget', { url: 'about:blank' }, true);
    sessionId = (await command('Target.attachToTarget', { targetId: target.targetId, flatten: true }, true)).sessionId;
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Network.enable');
    await command('Network.setCacheDisabled', { cacheDisabled: true });
    const completion = loaded();
    await command('Page.navigate', { url: origin });
    await completion;
    assert.equal(await evaluate('document.title'), 'Perth Trip Planner');
    const navigation = await evaluate(`(() => ({
      links: [...document.querySelectorAll('.top-nav a')].map((link) => [link.hash, Boolean(document.querySelector(link.hash))]),
      home: document.querySelector('.wordmark').hash,
      skip: document.querySelector('.skip-link').hash,
      headerPosition: getComputedStyle(document.querySelector('.topbar')).position,
      sections: [...document.querySelectorAll('main > section')].map((section) => section.id),
      heroCta: document.querySelector('.hero-cta').hash,
      date: document.querySelector('#today-date').value,
      title: document.querySelector('#today-title').textContent,
      badge: document.querySelector('.preview-pill').textContent
    }))()`);
    assert.deepEqual(navigation.links, [['#today', true], ['#flights', true], ['#weekend', true], ['#stay', true], ['#itinerary', true], ['#essentials', true]]);
    assert.equal(navigation.home, '#top');
    assert.equal(navigation.skip, '#today');
    assert.equal(navigation.headerPosition, 'sticky');
    assert.deepEqual(navigation.sections, ['top', 'today', 'flights', 'weekend', 'stay', 'itinerary', 'essentials']);
    assert.equal(navigation.heroCta, '#today');
    const localDate = await evaluate(`(() => {
      const trip = TRIP.trip;
      const parts = Object.fromEntries(new Intl.DateTimeFormat('en-AU', {
        timeZone: trip.timezone, year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(new Date()).filter(({ type }) => type !== 'literal').map(({ type, value }) => [type, value]));
      return [parts.year, parts.month, parts.day].join('-');
    })()`);
    const expectedDate = localDate < '2026-10-10' ? '2026-10-10' : localDate > '2026-10-24' ? '2026-10-24' : localDate;
    assert.equal(navigation.date, expectedDate);
    assert.equal(navigation.title, localDate < '2026-10-10' ? 'Your first day, in a glance' : localDate > '2026-10-24' ? 'Final trip day, in a glance' : 'Today, in a glance');
    assert.equal(navigation.badge, localDate < '2026-10-10' ? 'NEXT UP' : localDate > '2026-10-24' ? 'FINAL DAY' : 'TODAY');
    await evaluate(`new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Service worker readiness timed out')), 20000);
      navigator.serviceWorker.ready.then(() => {
        if (navigator.serviceWorker.controller) { clearTimeout(timer); resolve(true); }
        else navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(true); }, { once: true });
      }, reject);
    })`);
    const parsedManifest = await command('Page.getAppManifest');
    assert.deepEqual(parsedManifest.errors, []);
    const cacheCount = await evaluate('(async () => { const names = await caches.keys(); return (await (await caches.open(names[0])).keys()).length; })()');
    assert.equal(cacheCount, 16);
    const displayedVersion = await evaluate('document.querySelector("#planner-version").textContent');
    assert.match(displayedVersion, /^Version v\d+$/);
    assert.equal(await evaluate(`caches.has('perth-trip-planner-${displayedVersion.replace('Version ', '')}')`), true, 'Footer version must match the installed shell cache');
    console.log('PASS: production static files, browser manifest, PNG icons, service-worker activation, complete shell cache');

    await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    await reload();
    assert.equal(await evaluate('navigator.onLine'), false);
    assert.equal(await evaluate('document.querySelector("#planner-version").textContent'), displayedVersion, 'Footer version must remain available offline');
    assert.equal(await evaluate('!!navigator.serviceWorker.controller && window.TRIP.days.length === 15'), true);
    assert.equal(await evaluate('document.querySelectorAll(".day-card").length'), 15);
    assert.equal(await evaluate('document.querySelector("#stay").innerText.includes("11 Mount Street")'), true);
    assert.equal(await evaluate('document.querySelectorAll(".flight-segment").length'), 4);
    const interactions = await evaluate(`(() => {
      const changeDate = (date) => { const input = document.querySelector('#today-date'); input.value = date; input.dispatchEvent(new Event('change', { bubbles: true })); };
      const results = { dates: [], options: [] };
      for (const day of TRIP.days) {
        changeDate(day.date);
        results.dates.push({ date: day.date, title: document.querySelector('#today-title').textContent, badge: document.querySelector('.preview-pill').textContent, hasSelectedDay: document.querySelector('#selected-day-title').textContent.length > 0 });
      }
      for (const id of ['option1', 'option2', 'option3']) {
        document.querySelector('#option-selector [data-option="' + id + '"]').click();
        results.options.push(document.querySelector('#option-detail').innerText.includes(id === TRIP.chosenWeekendOption ? 'CHOSEN OPTION' : 'PREVIEW') && document.querySelector('#weekend-day-detail').innerText.length > 100);
      }
      document.querySelector('#clear-choice').click();
      changeDate('2026-10-12');
      const planned = [...document.querySelectorAll('#today-events .selected-event')].find(entry => entry.querySelector('h4').textContent.includes('Kings Park gardens'));
      planned.querySelector('[data-plan-action="edit-event"]').click();
      document.querySelector('#plan-title').value = 'Offline actual activity';
      document.querySelector('#plan-start').value = '5:00 PM';
      document.querySelector('#plan-form').requestSubmit();
      document.querySelector('[data-add-event="custom"]').click();
      document.querySelector('#plan-title').value = 'Offline added activity';
      document.querySelector('#plan-start').value = '8:30 PM';
      document.querySelector('#plan-form').requestSubmit();
      const checkbox = document.querySelector('[data-checklist="before-perth"]');
      checkbox.checked = true; checkbox.dispatchEvent(new Event('change', { bubbles: true }));
      for (const [field, value] of [['estimated', '900'], ['actual', '850']]) {
        const input = document.querySelector('[data-budget="Hotels"][data-field="' + field + '"]');
        input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }));
      }
      results.original = document.querySelector('#today-events').innerText.includes('PLANNED · ORIGINAL');
      results.actual = document.querySelector('#today-events').innerText.includes('Offline actual activity');
      results.added = document.querySelector('#today-events').innerText.includes('Offline added activity');
      return results;
    })()`);
    const expectedDateLabels = interactions.dates.map(({ date }, index) => {
      if (date === localDate) return ['Today, in a glance', 'TODAY'];
      if (localDate < '2026-10-10' && date === '2026-10-10') return ['Your first day, in a glance', 'NEXT UP'];
      if (localDate > '2026-10-24' && date === '2026-10-24') return ['Final trip day, in a glance', 'FINAL DAY'];
      return [`Day ${String(index + 1).padStart(2, '0')}, in a glance`, 'DATE PREVIEW'];
    });
    assert.deepEqual(interactions.dates.map(({ title, badge }) => [title, badge]), expectedDateLabels);
    assert.ok(interactions.dates.every(({ hasSelectedDay }) => hasSelectedDay));
    assert.ok(interactions.options.every(Boolean));
    assert.ok(interactions.original && interactions.actual && interactions.added);
    await reload();
    const persisted = await evaluate(`(() => {
      const date = document.querySelector('#today-date'); date.value = '2026-10-12'; date.dispatchEvent(new Event('change', { bubbles: true }));
      const text = document.querySelector('#today-events').innerText;
      return { checklist: document.querySelector('[data-checklist="before-perth"]').checked,
        estimated: document.querySelector('[data-budget="Hotels"][data-field="estimated"]').value,
        actualBudget: document.querySelector('[data-budget="Hotels"][data-field="actual"]').value,
        original: text.includes('PLANNED · ORIGINAL'), actual: text.includes('Offline actual activity'), added: text.includes('Offline added activity') };
    })()`);
    assert.deepEqual(persisted, { checklist: true, estimated: '900', actualBudget: '850', original: true, actual: true, added: true });
    await evaluate('document.querySelector("#restore-planned").click()');
    assert.equal(await evaluate('document.querySelector("#today-events").innerText.includes("Offline actual activity")'), false);
    console.log('PASS: offline cold reload, all 15 dates, all weekend options, hotels/work/flights, checklist/budget/ad-hoc persistence, planned/actual restore');

    const rottnestHelpers = `
      const selectDay = (date = '2026-10-17', option = 'option1') => {
        document.querySelector('#option-selector [data-option="' + option + '"]').click();
        const input = document.querySelector('#today-date');
        input.value = date; input.dispatchEvent(new Event('change', { bubbles: true }));
      };
      const chooseMode = (mode, context = 'selected') => document.querySelector('[data-rottnest-controls="' + context + '"] input[value="' + mode + '"]').click();
      const action = (id, name) => document.querySelector('#today-events [data-event-id="2026-10-17-' + id + '"][data-plan-action="' + name + '"]').click();
      const text = () => document.querySelector('#today-events').innerText;
    `;
    const rottnest = await evaluate(`(() => {
      ${rottnestHelpers}
      selectDay();
      const initial = document.querySelector('[data-rottnest-controls="selected"] input:checked').value;
      const guide = document.querySelector('#today-events .rottnest-guide').innerText;
      const link = document.querySelector('#today-events .rottnest-guide a').href;
      const transport = [...document.querySelectorAll('#today-events .selected-event')].filter(entry => /Proposed.*ferry/.test(entry.querySelector('h4').textContent));
      const provisional = transport.length === 2 && transport.every(entry => entry.innerText.includes('unconfirmed') && !entry.innerText.includes('CONFIRMED · FIXED') && entry.querySelector('[data-plan-action="edit-event"]'));
      action('rottnest-beach', 'edit-event');
      document.querySelector('#plan-title').value = 'Enjoy a nearby beach';
      document.querySelector('#plan-start').value = 'After confirmed arrival';
      document.querySelector('#plan-form').requestSubmit();
      action('rottnest-beach', 'complete-event');
      action('rottnest-second', 'skip-event');
      action('planned-1', 'edit-event');
      document.querySelector('#plan-start').value = 'Booked ferry time';
      document.querySelector('#plan-form').requestSubmit();
      document.querySelector('[data-add-event="custom"]').click();
      document.querySelector('#plan-title').value = 'Settlement cafe break';
      document.querySelector('#plan-start').value = 'After lunch';
      document.querySelector('#plan-form').requestSubmit();
      chooseMode('bicycle', 'weekend');
      const bicycle = text().includes('short bicycle outing') && !text().includes('Enjoy a nearby beach') && text().includes('Booked ferry time') && text().includes('Settlement cafe break');
      action('planned-3', 'complete-event');
      chooseMode('bus');
      return { initial, guide, link, provisional, bicycle,
        busRestored: text().includes('Enjoy a nearby beach') && text().includes('ACTUAL · COMPLETED') && text().includes('PLANNED · SKIPPED'),
        timeline: document.querySelector('#timeline').innerText.includes('Island Explorer'),
        focused: document.activeElement.matches('[data-rottnest-mode][value="bus"]') };
    })()`);
    assert.equal(rottnest.initial, 'bus');
    assert.match(rottnest.guide, /Needs confirmation/);
    for (const detail of ['route', 'stop count', 'frequency', 'operating hours', 'ticket price', 'seasonal availability', 'timetable', 'service map', 'Not every', 'booked', 'water', 'sunscreen', 'quokkas']) assert.ok(rottnest.guide.includes(detail), detail);
    assert.equal(rottnest.link, 'https://www.rottnestisland.com/visit/getting-around/by-bus');
    assert.ok(rottnest.provisional && rottnest.bicycle && rottnest.busRestored && rottnest.timeline && rottnest.focused);
    await reload();
    assert.equal(await evaluate(`(() => {
      ${rottnestHelpers}
      const previewIsTemporary = document.querySelector('#option-selector [aria-pressed="true"]').dataset.option === TRIP.chosenWeekendOption && document.querySelector('#option-detail').innerText.includes('CHOSEN OPTION');
      selectDay();
      return previewIsTemporary && document.querySelector('[data-rottnest-controls="selected"] input:checked').value === 'bus' && text().includes('Enjoy a nearby beach') && text().includes('ACTUAL · COMPLETED') && text().includes('PLANNED · SKIPPED') && text().includes('Booked ferry time') && text().includes('Settlement cafe break');
    })()`), true, 'Bus choice, edits, skip/completion and additions survive offline reload');
    await evaluate(`(() => { ${rottnestHelpers} chooseMode('bicycle'); })()`);
    await reload();
    assert.equal(await evaluate(`(() => {
      ${rottnestHelpers}
      selectDay();
      const bicycle = document.querySelector('[data-rottnest-controls="selected"] input:checked').value === 'bicycle' && text().includes('short bicycle outing') && text().includes('ACTUAL · COMPLETED');
      selectDay('2026-10-18', 'option2');
      const isolated = !text().includes('Settlement cafe break') && !text().includes('ACTUAL · COMPLETED') && !text().includes('Booked ferry time');
      chooseMode('bus');
      const secondDate = text().includes('Island Explorer') && !text().includes('short bicycle outing');
      selectDay();
      const restored = text().includes('Enjoy a nearby beach');
      document.querySelector('#restore-planned').click();
      return bicycle && isolated && secondDate && restored && !text().includes('Enjoy a nearby beach') && !text().includes('Settlement cafe break') && text().includes('9:30 AM (unconfirmed)');
    })()`), true, 'Bicycle persistence, date/option isolation and recoverable planned itinerary');
    console.log('PASS: offline Rottnest bus/bicycle switching, persistent choices, stable edits, completion/skip/add/restore, provisional ferry/bus guidance');

    assert.equal(await evaluate('document.querySelector("#guide-send").disabled && document.querySelector("#guide-status").textContent.includes("offline")'), true, 'AI stays unavailable offline without disabling the planner');
    const mockSigningKeys = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const guidePreload = await command('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
      const config = { apiUrl: 'https://guide.invalid/chat', oauthDomain: 'https://auth.invalid', clientId: 'mock-public-client', redirectUri: location.origin + location.pathname, scope: 'openid guide/chat', proposalPublicKey: ${JSON.stringify(mockSigningKeys.publicKey.export({ format: 'jwk' }))} };
      Object.defineProperty(window, 'TRAVEL_GUIDE_CONFIG', { get: () => config, set() {} });
      window.__issueReceipt = async (kind, snapshot, changes, sessionId, parentId = null) => {
        const contract = window.TravelGuideContract;
        const issuedAt = Math.floor(Date.now() / 1000);
        const payload = { v: 1, kind, id: crypto.randomUUID(), parentId, sessionId, subject: 'mock-owner', tripRevision: await contract.digest(TRIP), contextHash: await contract.digest(contract.contextRevision(snapshot)), changesHash: await contract.digest(changes), issuedAt, expiresAt: issuedAt + 300 };
        const key = await crypto.subtle.importKey('jwk', ${JSON.stringify(mockSigningKeys.privateKey.export({ format: 'jwk' }))}, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
        const bytes = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(contract.canonicalJSON(payload))));
        return { payload, signature: btoa(String.fromCharCode(...bytes)).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '') };
      };
      if (location.search.includes('mock-code')) sessionStorage.setItem('perth-guide-oauth', JSON.stringify({ verifier: 'mock-verifier', state: 'mock-state', createdAt: Date.now() }));
      window.__guideRequests = [];
      window.__guideMode = 'proposal';
      window.__geoCalls = [];
      window.__geoMode = 'success';
      window.__geoProvider = { getCurrentPosition(success, failure, options) {
        window.__geoCalls.push(options);
        const position = { coords: { latitude: window.__geoMode === 'invalid' ? 95 : -31.9554, longitude: 115.859, accuracy: window.__geoMode === 'approximate' ? 20000 : 24 }, timestamp: window.__geoMode === 'invalid-time' ? null : Date.now() };
        if (window.__geoMode === 'delayed') { window.__geoComplete = () => success(position); return; }
        if (window.__geoMode === 'denied') { failure({ code: 1 }); return; }
        if (window.__geoMode === 'unavailable') { failure({ code: 2 }); return; }
        if (window.__geoMode === 'timeout') { failure({ code: 3 }); return; }
        success(position);
      } };
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: window.__geoProvider });
      const original = window.fetch.bind(window);
      window.__guideUrls = [];
      window.fetch = async (url, options) => {
        if (String(url) === 'https://auth.invalid/oauth2/token') return new Response(JSON.stringify({ access_token: 'synthetic-test-token', token_type: 'Bearer', expires_in: 3600 }), { status: 200 });
        if (String(url) !== config.apiUrl) return original(url, options);
        const request = JSON.parse(options.body);
        window.__guideRequests.push(request);
        window.__guideUrls.push(String(url));
        if (request.operation === 'confirm') {
          if (window.__guideMode === 'confirm-denied') return new Response('{}', { status: 409 });
          if (window.__guideMode === 'delayed-confirm') await new Promise(resolve => { window.__completeGuide = resolve; });
          try { await TravelGuideContract.verifyAuthorization(request.commitment, { kind: 'proposal', snapshot: request.snapshot, changes: request.changes, trip: TRIP, sessionId: request.sessionId, publicKey: config.proposalPublicKey }); }
          catch { return new Response('{}', { status: 409 }); }
          const authorization = await window.__issueReceipt('apply', request.snapshot, request.changes, request.sessionId, request.commitment.payload.id);
          return new Response(JSON.stringify({ sessionId: request.sessionId, changes: request.changes, authorization }), { status: 200 });
        }
        if (window.__guideMode === 'throttle') return new Response('{}', { status: 429 });
        if (window.__guideMode === 'failure') return new Response('{}', { status: 503 });
        if (window.__guideMode === 'malformed') return new Response('Invalid reply at -31.95540, 115.85900', { status: 200 });
        if (window.__guideMode === 'delayed') await new Promise(resolve => { window.__completeGuide = resolve; });
        const day = request.snapshot.days.find(entry => entry.date === request.snapshot.selectedDate);
        const activity = day.events.find(entry => !entry.locked && entry.status === 'pending' && entry.type === 'activity');
        const changes = window.__guideMode === 'invalid' ? [{ action: 'skip', date: day.date, id: 'does-not-exist', reason: 'Invalid fixture' }] : [{ action: 'skip', date: day.date, id: activity.id, reason: 'Keep the day relaxed' }];
        const coordinateEcho = request.snapshot.location?.source === 'device' ? ' Device reading: -31.95540, 115.85900.' : '';
        const commitment = await window.__issueReceipt('proposal', request.snapshot, changes, request.sessionId);
        return new Response(JSON.stringify({ sessionId: request.sessionId, reply: 'Recommendation: skip a stop. Trip facts: use recorded completion only. Needs verification: ferry, bus and opening hours. <script>not executed</script>' + coordinateEcho, changes, commitment, liveInformation: false }), { status: 200 });
      };
    })();` });
    await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    const guideLoaded = loaded();
    await command('Page.navigate', { url: origin + '?code=mock-code&state=mock-state' });
    await guideLoaded;
    const guideSetup = await evaluate(`(async () => {
      ${rottnestHelpers}
      await new Promise(requestAnimationFrame);
      selectDay();
      action('planned-2', 'complete-event');
      const input = document.querySelector('#guide-location'); input.value = 'Thomson Bay settlement'; input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#guide-preferences').value = 'No cycling';
      return { signedIn: document.querySelector('#guide-sign-in').hidden, cleanUrl: !location.search, selected: document.querySelector('#today-date').value };
    })()`);
    assert.deepEqual(guideSetup, { signedIn: true, cleanUrl: true, selected: '2026-10-17' });
    const geolocation = await evaluate(`(() => {
      const button = document.querySelector('#guide-use-location');
      const input = document.querySelector('#guide-location');
      const status = () => document.querySelector('#guide-location-status').textContent;
      const result = { noAutomaticRequest: window.__geoCalls.length === 0 };
      button.click();
      result.success = input.value === '-31.95540, 115.85900' && status().includes('24 metres') && status().includes('Perth time');
      window.__geoMode = 'denied'; button.click();
      result.denied = status().includes('permission denied') && input.value === '-31.95540, 115.85900';
      window.__geoMode = 'unavailable'; button.click(); result.unavailable = status().includes('unavailable');
      window.__geoMode = 'timeout'; button.click(); result.timeout = status().includes('timed out');
      window.__geoMode = 'approximate'; button.click(); result.approximate = status().includes('20000 metres') && status().includes('Approximate location');
      window.__geoMode = 'invalid'; button.click(); result.invalid = status().includes('unavailable') && input.value === '-31.95540, 115.85900';
      window.__geoMode = 'invalid-time'; button.click(); result.invalidTime = status().includes('unavailable');
      window.__geoMode = 'delayed'; button.click();
      input.value = 'Hotel lobby'; input.dispatchEvent(new Event('input', { bubbles: true }));
      window.__geoComplete(); result.manualWins = input.value === 'Hotel lobby' && status().includes('typed');
      button.click(); document.querySelector('#guide-clear-location').click();
      window.__geoComplete(); result.clearWins = input.value === '' && status().includes('cleared');
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: null });
      button.click(); result.unsupported = status().includes('not supported');
      Object.defineProperty(navigator, 'geolocation', { configurable: true, value: window.__geoProvider });
      window.__geoMode = 'success'; button.click();
      result.onDemandOnly = window.__guideRequests.length === 0;
      result.freshBoundedRequest = window.__geoCalls.every(options => options.maximumAge === 0 && options.timeout === 12000 && options.enableHighAccuracy);
      return result;
    })()`);
    assert.ok(Object.values(geolocation).every(Boolean), JSON.stringify(geolocation));
    const storageFailure = await evaluate(`(async () => {
      ${rottnestHelpers}
      chooseMode('bicycle');
      const before = localStorage.getItem('perth-trip-actual-plans');
      const mode = localStorage.getItem('perth-trip-rottnest-mode');
      const original = Storage.prototype.setItem;
      let rejected = false;
      const changes = TravelGuideContract.validateChanges(PerthPlannerGuide.snapshot(), [
        { action: 'complete', date: '2026-10-17', id: '2026-10-17-planned-3', reason: 'Finished cycling' },
        { action: 'set_transport', date: '2026-10-17', mode: 'bus', reason: 'Avoid further cycling' }
      ]);
      const sessionId = crypto.randomUUID(), parentId = crypto.randomUUID();
      const receipt = await window.__issueReceipt('apply', PerthPlannerGuide.snapshot(), changes, sessionId, parentId);
      Storage.prototype.setItem = function(key, value) {
        if (key === 'perth-trip-rottnest-mode') throw new DOMException('Simulated quota failure', 'QuotaExceededError');
        return original.call(this, key, value);
      };
      try {
        await window.PerthPlannerGuide.apply(changes, undefined, { receipt, sessionId, parentId });
      } catch { rejected = true; }
      finally { Storage.prototype.setItem = original; }
      const unchanged = localStorage.getItem('perth-trip-actual-plans') === before && localStorage.getItem('perth-trip-rottnest-mode') === mode && window.PerthPlannerGuide.snapshot().rottnestMode === 'bicycle';
      chooseMode('bus');
      return { rejected, unchanged };
    })()`);
    assert.deepEqual(storageFailure, { rejected: true, unchanged: true }, 'Failed mixed writes must not partially persist itinerary changes');
    assert.equal(await evaluate(`(async () => {
      const changes = [{ action: 'set_transport', date: '2026-10-17', mode: 'bus', reason: 'No cycling' }];
      const before = localStorage.getItem('perth-trip-actual-plans');
      const sessionId = crypto.randomUUID(), parentId = crypto.randomUUID();
      const snapshot = PerthPlannerGuide.snapshot();
      let rejected = 0;
      try { await PerthPlannerGuide.apply(changes, undefined, { validated: true, confirmed: true }); } catch { rejected++; }
      const proposalReceipt = await window.__issueReceipt('proposal', snapshot, changes, sessionId);
      try { await PerthPlannerGuide.apply(changes, undefined, { receipt: proposalReceipt, sessionId, parentId }); } catch { rejected++; }
      const receipt = await window.__issueReceipt('apply', snapshot, changes, sessionId, parentId);
      try { await PerthPlannerGuide.apply([{ ...changes[0], reason: 'Altered proposal' }], undefined, { receipt, sessionId, parentId }); } catch { rejected++; }
      if (rejected !== 3 || localStorage.getItem('perth-trip-actual-plans') !== before) return false;
      await PerthPlannerGuide.apply(changes, undefined, { receipt, sessionId, parentId });
      try { await PerthPlannerGuide.apply(changes, undefined, { receipt, sessionId, parentId }); } catch (error) { return error.message.includes('already applied'); }
      return false;
    })()`), true, 'Forged flags, proposal-phase proofs, altered changes and page-local replay cannot authorize Apply');
    const guideIdle = `new Promise((resolve, reject) => {
      const form = document.querySelector('#guide-form');
      if (form.getAttribute('aria-busy') === 'false') { resolve(); return; }
      const timer = setTimeout(() => { observer.disconnect(); reject(new Error('Guide request did not finish')); }, 5000);
      const observer = new MutationObserver(() => {
        if (form.getAttribute('aria-busy') === 'false') { clearTimeout(timer); observer.disconnect(); resolve(); }
      });
      observer.observe(form, { attributes: true, attributeFilter: ['aria-busy'] });
    })`;
    const askGuide = async (message) => evaluate(`(async () => {
      document.querySelector('#guide-input').value = ${JSON.stringify(message)};
      document.querySelector('#guide-form').requestSubmit();
      await ${guideIdle};
      return { error: document.querySelector('#guide-error').textContent, proposal: !document.querySelector('#guide-proposal').hidden, busy: document.querySelector('#guide-form').getAttribute('aria-busy') };
    })()`);
    assert.deepEqual(await askGuide('What should I skip?'), { error: '', proposal: true, busy: 'false' });
    const guideRequest = await evaluate(`(() => {
      const request = window.__guideRequests.at(-1);
      const day = request.snapshot.days.find(entry => entry.date === '2026-10-17');
      return { days: request.snapshot.days.length, selected: request.snapshot.selectedDate, option: request.snapshot.option,
        location: request.snapshot.location.label, source: request.snapshot.location.source, accuracy: request.snapshot.location.accuracyMeters, latitude: request.snapshot.location.latitude, observed: Number.isFinite(Date.parse(request.snapshot.location.observedAt)), preferences: request.snapshot.preferences,
        complete: day.events.find(entry => entry.id.endsWith('planned-2')).status,
        pending: day.events.find(entry => entry.id.endsWith('rottnest-beach')).status,
        unchanged: !document.querySelector('#today-events').innerText.includes('PLANNED · SKIPPED'),
        noScript: !document.querySelector('#guide-messages script'),
        noStorageDump: !JSON.stringify(request).includes('perth-trip-budget'),
        sessionId: request.sessionId };
    })()`);
    assert.deepEqual({ ...guideRequest, sessionId: undefined }, { days: 15, selected: '2026-10-17', option: 'option1', location: '-31.95540, 115.85900', source: 'device', accuracy: 24, latitude: -31.9554, observed: true, preferences: 'No cycling', complete: 'completed', pending: 'pending', unchanged: true, noScript: true, noStorageDump: true, sessionId: undefined });
    assert.equal(await evaluate(`(() => { const stored = JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }); return !stored.includes('-31.9554') && !stored.includes('115.859'); })()`), true, 'Model-echoed precise coordinates must not persist in browser storage');
    await evaluate('document.querySelector("[data-guide-apply]").click()');
    await evaluate(guideIdle);
    assert.equal(await evaluate('document.querySelector("#today-events").innerText.includes("PLANNED · SKIPPED")'), true, 'Only confirmation applies the proposal');
    await evaluate('document.querySelector("#guide-clear-location").click()');
    await askGuide('What about the other option?');
    assert.equal(await evaluate(`window.__guideRequests.at(-1).sessionId === ${JSON.stringify(guideRequest.sessionId)} && window.__guideRequests.at(-1).history.length === 2 && window.__guideRequests.at(-1).snapshot.days.find(day => day.date === '2026-10-17').events.some(event => event.status === 'skipped')`), true, 'Follow-ups include latest state and bounded session history');
    assert.equal(await evaluate('window.__guideRequests.at(-1).snapshot.location'), null, 'Cleared location is not sent in subsequent snapshots');
    assert.equal(await evaluate(`!JSON.stringify({ local: { ...localStorage }, session: { ...sessionStorage } }).includes('-31.9554')`), true, 'Clearing location cannot cause old coordinate-bearing history to be saved later');
    const beforeRejectedConfirmation = await evaluate('localStorage.getItem("perth-trip-actual-plans")');
    await evaluate(`window.__guideMode = 'confirm-denied'; document.querySelector('[data-guide-apply]').click()`);
    await evaluate(guideIdle);
    assert.equal(await evaluate(`localStorage.getItem('perth-trip-actual-plans') === ${JSON.stringify(beforeRejectedConfirmation)} && document.querySelector('#guide-error').textContent.includes('authorization')`), true, 'Rejected server confirmation leaves the actual plan untouched');
    await evaluate(`window.__guideMode = 'proposal'`);
    await askGuide('Reconsider the remaining stop');
    await evaluate(`const manualLocation = document.querySelector('#guide-location'); manualLocation.value = 'Hotel lobby'; manualLocation.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#guide-preferences').value = 'Now very tired'; document.querySelector('[data-guide-apply]').click()`);
    assert.equal(await evaluate('document.querySelector("#guide-error").textContent.includes("context changed")'), true, 'Stale proposals cannot apply');
    await evaluate('window.__guideMode = "throttle"');
    assert.match((await askGuide('Try a relaxed suggestion')).error, /rate-limited/);
    await evaluate(`window.__guideMode = 'proposal'; document.querySelector('#guide-retry').click()`);
    await evaluate(guideIdle);
    assert.equal(await evaluate('document.querySelector("#guide-error").textContent === "" && !document.querySelector("#guide-proposal").hidden'), true, 'Retry succeeds without duplicating failed turns');
    assert.equal(await evaluate(`window.__guideRequests.at(-1).snapshot.location.source === 'user' && window.__guideRequests.at(-1).snapshot.location.label === 'Hotel lobby' && !('latitude' in window.__guideRequests.at(-1).snapshot.location)`), true, 'Manual fallback sends a place label without device coordinates');
    await evaluate('window.__guideMode = "failure"');
    assert.match((await askGuide('Another idea')).error, /unavailable/);
    await evaluate('document.querySelector("#guide-use-location").click(); window.__guideMode = "malformed"');
    const malformedLocationReply = await askGuide('A location-aware suggestion');
    assert.match(malformedLocationReply.error, /unreadable response/);
    assert.doesNotMatch(malformedLocationReply.error, /31\.955|115\.859/);
    await evaluate('window.__guideMode = "invalid"');
    assert.match((await askGuide('Invalid change fixture')).error, /Unknown or fixed/);
    await evaluate('window.__guideMode = "proposal"');
    await askGuide('One more relaxed option');
    assert.equal(await evaluate(`window.__guideUrls.every(url => !url.includes('31.955') && !url.includes('115.859')) && !location.href.includes('31.955')`), true, 'Coordinates stay out of API/page URLs');
    for (const width of [320, 375, 390, 430]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate(`document.documentElement.scrollWidth <= innerWidth && !document.querySelector('#guide-proposal').hidden && ['#guide-input', '#guide-send', '#guide-use-location', '#guide-clear-location', '[data-guide-apply]'].every(selector => {
        const element = document.querySelector(selector);
        const bounds = element.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= innerWidth && bounds.height >= 44;
      })`), true, `${width}px populated chat/proposal layout or touch target`);
      assert.equal(await evaluate(`(() => {
        const button = document.querySelector('#guide-use-location');
        window.__geoMode = 'denied'; button.click();
        const denied = document.querySelector('#guide-location-status').textContent.includes('permission denied') && !button.disabled;
        window.__geoMode = 'success'; button.click();
        return denied && !button.disabled && document.querySelector('#guide-location-status').textContent.includes('24 metres');
      })()`), true, `${width}px permission denial/retry must remain usable`);
    }
    await command('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: 0, uploadThroughput: 0 });
    assert.equal(await evaluate(`(() => {
      const before = window.__guideRequests.length;
      document.querySelector('#guide-use-location').click();
      return !navigator.onLine && document.querySelector('#guide-send').disabled && document.querySelector('#guide-location-status').textContent.includes('24 metres') && window.__guideRequests.length === before;
    })()`), true, 'Offline location controls do not send chat requests or break the manual planner');
    await command('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await evaluate('document.querySelector("#guide-input").focus()');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Tab', code: 'Tab', windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate('document.activeElement.id'), 'guide-send', 'Send is keyboard reachable from the message input');
    const signedOutResult = await evaluate(`(() => {
      window.__guideMode = 'delayed';
      const count = document.querySelectorAll('#guide-messages .guide-message').length;
      document.querySelector('#guide-input').value = 'Request interrupted by sign-out';
      document.querySelector('#guide-form').requestSubmit();
      document.querySelector('#guide-sign-out').click();
      window.__completeGuide();
      return count;
    })()`);
    await evaluate(guideIdle);
    assert.equal(await evaluate(`document.querySelectorAll('#guide-messages .guide-message').length === ${signedOutResult} && document.querySelector('#guide-proposal').hidden && document.querySelector('#guide-send').disabled`), true, 'Late responses after sign-out must not create messages or proposals');
    const savedGuidePlan = await evaluate('localStorage.getItem("perth-trip-actual-plans")');
    await reload();
    assert.equal(await evaluate(`localStorage.getItem('perth-trip-actual-plans') === ${JSON.stringify(savedGuidePlan)} && document.querySelectorAll('#guide-messages .guide-message').length === 0 && document.querySelector('#guide-send').disabled && document.querySelector('#guide-location').value === '' && window.__geoCalls.length === 0`), true, 'Plans survive reload; location-bearing chat, tokens and readings do not persist or auto-request');
    const ordinaryChatLoaded = loaded();
    await command('Page.navigate', { url: origin + '?code=mock-code&state=mock-state' });
    await ordinaryChatLoaded;
    await evaluate(`(async () => { ${rottnestHelpers} await new Promise(requestAnimationFrame); selectDay(); })()`);
    await askGuide('What should I do next without using my location?');
    const beforeInterruptedConfirmation = await evaluate('localStorage.getItem("perth-trip-actual-plans")');
    await evaluate(`window.__guideMode = 'delayed-confirm'; document.querySelector('[data-guide-apply]').click()`);
    await evaluate(`document.querySelector('#guide-sign-out').click(); window.__completeGuide()`);
    await evaluate(guideIdle);
    assert.equal(await evaluate(`localStorage.getItem('perth-trip-actual-plans') === ${JSON.stringify(beforeInterruptedConfirmation)} && document.querySelector('#guide-proposal').hidden`), true, 'Sign-out during confirmation prevents application');
    await reload();
    assert.equal(await evaluate(`document.querySelectorAll('#guide-messages .guide-message').length === 2 && document.querySelector('#guide-messages').innerText.includes('without using my location') && document.querySelector('#guide-location').value === '' && window.__geoCalls.length === 0`), true, 'Ordinary non-location chat still persists across reload');
    await command('Page.removeScriptToEvaluateOnNewDocument', { identifier: guidePreload.identifier });
    await reload();
    console.log('PASS: mocked PKCE callback, chat snapshot/status/history, escaped responses, explicit confirmation/persistence, stale rejection, throttling/failure/retry, no persistent tokens');
    console.log('PASS: device location requested only on tap, accuracy/time in chat snapshot, denial/unavailable/timeout, clear/manual races, no auto-sharing or persistent location');
    console.log('PASS: signed proposal/apply binding, confirmation rejection, forged/altered/phase proof rejection, local replay prevention and sign-out during confirmation');

    for (const width of [320, 375, 384, 390, 412, 430]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: true });
      assert.equal(await evaluate('getComputedStyle(document.querySelector(".top-nav")).display !== "none"'), true, `${width}px section navigation hidden`);
      const anchor = await evaluate(`(() => {
        document.documentElement.style.scrollBehavior = 'auto';
        const section = document.querySelector('#weekend');
        section.scrollIntoView();
        const header = document.querySelector('.topbar').getBoundingClientRect();
        const target = section.getBoundingClientRect();
        return { headerTop: header.top, headerBottom: header.bottom, targetTop: target.top };
      })()`);
      assert.equal(anchor.headerTop, 0, `${width}px sticky header position`);
      assert.ok(anchor.targetTop >= anchor.headerBottom, `${width}px section hidden under header`);
      assert.equal(await evaluate(`(() => {
        const guide = document.querySelector('#travel-guide');
        guide.scrollIntoView();
        return guide.getBoundingClientRect().top >= document.querySelector('.topbar').getBoundingClientRect().bottom;
      })()`), true, `${width}px travel guide anchor hidden under sticky header`);
      for (const scrollTarget of ['0', 'document.documentElement.scrollHeight']) {
        const headerVisible = await evaluate(`new Promise((resolve) => {
          window.scrollTo(0, ${scrollTarget});
          requestAnimationFrame(() => {
            const header = document.querySelector('.topbar');
            const bounds = header.getBoundingClientRect();
            resolve(bounds.top === 0 && bounds.bottom > 0 && bounds.bottom < innerHeight &&
              header.contains(document.elementFromPoint(innerWidth / 2, bounds.bottom - 2)));
          });
        })`);
        assert.equal(headerVisible, true, `${width}px header hidden at scroll target ${scrollTarget}`);
      }
      for (const id of ['option1', 'option2', 'option3']) {
        await evaluate(`document.querySelector('#option-selector [data-option="${id}"]').click()`);
        assert.equal(await evaluate('document.documentElement.scrollWidth <= innerWidth'), true, `${width}px ${id} overflow`);
        if (id !== 'option3') {
          for (const mode of ['bus', 'bicycle']) {
            const fits = await evaluate(`(() => {
              ${rottnestHelpers}
              selectDay('${id === 'option1' ? '2026-10-17' : '2026-10-18'}', '${id}');
              chooseMode('${mode}', 'weekend');
              return document.documentElement.scrollWidth <= innerWidth && [...document.querySelectorAll('.rottnest-modes label')].every(label => {
                const bounds = label.getBoundingClientRect();
                return bounds.width > 0 && bounds.height >= 44 && bounds.left >= 0 && bounds.right <= innerWidth;
              });
            })()`);
            assert.equal(fits, true, `${width}px ${id} ${mode} transport controls overflow or undersized`);
          }
        }
      }
      assert.equal(await evaluate('document.querySelectorAll("a[target=\\"_blank\\"]:not([aria-label*=\\"internet required\\"]) ").length'), 0);
    }
    await evaluate('document.fonts.ready');
    assert.equal(await evaluate('document.fonts.check("12px Manrope") && document.fonts.check("12px \\"DM Sans\\"")'), true);
    assert.deepEqual(errors, []);
    console.log('PASS: 320/375/384/390/412/430px with visible sticky header, all options, external-link cues, offline fonts, no console errors');
  } finally {
    socket?.close();
    if (browser && browser.exitCode === null && browser.signalCode === null) {
      const exited = new Promise((resolve) => browser.once('exit', resolve));
      browser.kill();
      await exited;
    }
    await new Promise((resolve) => server.close(resolve));
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });