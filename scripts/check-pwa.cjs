const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

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
    assert.equal(cacheCount, 13);
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
        results.options.push(document.querySelector('#option-detail').innerText.includes('PREVIEW') && document.querySelector('#weekend-day-detail').innerText.length > 100);
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