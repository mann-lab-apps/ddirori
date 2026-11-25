import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium, devices } = createRequire(import.meta.url)(process.env.DDIRORI_PLAYWRIGHT ?? 'playwright');
const base = new URL(process.env.DDIRORI_LANDING_URL ?? 'http://127.0.0.1:8110/');
const origin = 'https://ddirori.com';
const manifest = await fetch(new URL('download-manifest.json', base)).then(response => response.json());
const installers = Object.fromEntries(manifest.downloads.map(item => [item.id, item]));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DDIRORI_BROWSER ? { executablePath: process.env.DDIRORI_BROWSER } : {}),
});
const scenarios = [];
const mobile = devices['iPhone 13'];
const desktop = devices['Desktop Chrome'];

async function exercise(title, options, test) {
  const { device = desktop, hold = [], fail, replaceDocument = false, javaScriptEnabled = true, attachmentOrigin } = options;
  const page = await browser.newPage({ ...device, javaScriptEnabled });
  page.setDefaultTimeout(12000);
  const gates = new Map(hold.map(file => [file, Promise.withResolvers()]));
  const failed = Promise.withResolvers();
  const requests = [];
  let googleTagRequests = 0;
  try {
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === attachmentOrigin) return route.continue();
      if (url.origin === origin) {
        await gates.get(url.pathname)?.promise;
        if (url.pathname === fail) {
          await route.fulfill({ status: 503 });
          failed.resolve();
          return;
        }
        if (url.pathname === '/analytics-config.json') {
          return route.fulfill({ json: { provider: 'ga4', enabled: true, measurementId: 'G-DDIRORIQA' } });
        }
        return route.fulfill({ response: await route.fetch({ url: new URL(url.pathname.slice(1) + url.search, base).href }) });
      }
      if (url.origin === 'https://www.googletagmanager.com') {
        googleTagRequests++;
        if (fail === 'tag') {
          await route.abort();
          failed.resolve();
          return;
        }
        return route.fulfill({ contentType: 'application/javascript', body: '/* GA4 is isolated from browser QA */' });
      }
      const item = manifest.downloads.find(download => download.url === url.href);
      if (item) {
        requests.push(item.id);
        if (replaceDocument) return route.fulfill({ contentType: 'text/html', body: '<h1>Installer redirect fixture</h1>' });
        return route.fulfill({
          contentType: 'application/octet-stream',
          headers: { 'Content-Disposition': `attachment; filename="${item.fileName}"` },
          body: 'installer response fixture',
        });
      }
      return route.abort();
    });
    await test({ page, requests, failed: failed.promise, release: file => gates.get(file).resolve(),
      googleTags: () => googleTagRequests });
    scenarios.push(title);
  } finally {
    for (const gate of gates.values()) gate.resolve();
    await page.context().close();
  }
}

const open = (page, query = '') => page.goto(origin + '/studio/' + query + '#download', { waitUntil: 'domcontentloaded' });
const platformLink = (page, id) => page.locator(`#studio-platform-downloads a[data-track-platform="${id}"]`);
const primaryLink = page => page.locator('[data-download-link]');
const select = (page, id) => page.locator(`[data-platform="${id}"]`).click();
const configured = page => page.waitForFunction(() => window.dataLayer?.some(row => row[0] === 'config'));
const events = page => page.evaluate(() => (window.dataLayer ?? [])
  .filter(row => row[0] === 'event' && ['download_primary', 'download_platform'].includes(row[1]))
  .map(([, name, params]) => ({ name, platform: params.platform, file: params.file_name,
    version: params.release_version, url: params.link_url })));
const expected = (name, id) => ({ name, platform: id, file: installers[id].fileName, version: manifest.version, url: installers[id].url });

async function activateInstaller(page, link, id, key = false) {
  const [download] = await Promise.all([page.waitForEvent('download'), key ? link.press('Enter') : link.click()]);
  assert.equal(download.url(), installers[id].url);
  assert.equal(download.suggestedFilename(), installers[id].fileName);
  assert.equal(new URL(page.url()).origin, origin, 'attachment leaves Studio open');
  await download.delete();
}

async function verifyModifiedClicks() {
  const received = [];
  // Chromium's background download can bypass Playwright's request routes.
  const server = createServer((request, response) => {
    received.push(request.url);
    if (request.url.startsWith('/start/')) {
      response.writeHead(302, { Location: request.url.replace('/start/', '/file/') });
      response.end();
      return;
    }
    response.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="installer-fixture.bin"'
    });
    response.end('isolated installer');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const attachmentOrigin = `http://127.0.0.1:${server.address().port}`;
  const files = id => received.filter(url => url.endsWith(`/${id}`));
  async function activate(link, id, gesture) {
    const target = `${attachmentOrigin}/start/${id}`;
    await link.evaluate((anchor, href) => { anchor.href = href; }, target);
    await link.click(gesture);
    const deadline = Date.now() + 5000;
    while (files(id).length < 2 && Date.now() < deadline) await delay(25);
    assert.deepEqual(files(id), [`/start/${id}`, `/file/${id}`]);
    return target;
  }
  try {
    await exercise('middle and modifier click each track one attachment before and after module load',
      { hold: ['/analytics.js'], attachmentOrigin }, async ({ page, release }) => {
        await open(page);
        const earlyLink = platformLink(page, 'windows');
        const earlyTarget = await activate(earlyLink, 'early', { button: 'middle' });
        assert.deepEqual(await events(page), []);
        release('/analytics.js');
        await configured(page);
        const early = { ...expected('download_platform', 'windows'), url: earlyTarget };
        assert.deepEqual(await events(page), [early]);

        await select(page, 'macos');
        const link = primaryLink(page);
        const middleUrl = await activate(link, 'ready', { button: 'middle' });
        const modifiedUrl = await activate(link, 'modifier', { modifiers: ['ControlOrMeta'] });
        const tracked = [
          early, { ...expected('download_primary', 'macos'), url: middleUrl },
          { ...expected('download_primary', 'macos'), url: modifiedUrl },
        ];
        assert.deepEqual(await events(page), tracked);
        await link.click({ button: 'right' });
        if (process.platform === 'darwin') await link.click({ modifiers: ['Control'] });
        assert.deepEqual(await events(page), tracked);
        assert.deepEqual(files('modifier'), ['/start/modifier', '/file/modifier']);
        assert.equal(new URL(page.url()).origin, origin);
      });
  } finally {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

try {
  await verifyModifiedClicks();

  await exercise('iPhone attachment before analytics loads', { device: mobile, hold: ['/analytics.js'] },
    async ({ page, requests, release }) => {
      await open(page);
      await page.locator('.platform-tabs').waitFor();
      await activateInstaller(page, platformLink(page, 'windows'), 'windows');
      assert.deepEqual(await events(page), []);
      await primaryLink(page).click();
      await page.waitForURL(url => url.hash === '#studio-platform-downloads');
      release('/analytics.js');
      await configured(page);
      const early = expected('download_platform', 'windows');
      assert.deepEqual(await events(page), [early]);
      await activateInstaller(page, platformLink(page, 'windows'), 'windows');
      assert.deepEqual(await events(page), [early, early]);
      assert.deepEqual(requests, ['windows', 'windows']);
    });

  await exercise('desktop Enter snapshots selections across analytics handoff', { hold: ['/analytics.js', '/analytics-config.json'] },
    async ({ page, release }) => {
      await open(page);
      await select(page, 'macos');
      await activateInstaller(page, primaryLink(page), 'macos', true);
      await select(page, 'linux');
      await activateInstaller(page, primaryLink(page), 'linux', true);
      await select(page, 'windows');
      assert.deepEqual(await events(page), []);
      release('/analytics.js');
      await page.waitForFunction(() => !window.takeEarlyStudioDownloadClicks);
      await activateInstaller(page, primaryLink(page), 'windows', true);
      assert.deepEqual(await events(page), []);
      release('/analytics-config.json');
      await configured(page);
      const queued = ['macos', 'linux', 'windows'].map(id => expected('download_primary', id));
      assert.deepEqual(await events(page), queued);
      await activateInstaller(page, primaryLink(page), 'windows', true);
      assert.deepEqual(await events(page), [...queued, expected('download_primary', 'windows')]);
    });

  for (const fail of ['/analytics.js', 'tag']) {
    await exercise(`download stays available when ${fail} fails`, { device: mobile, fail },
      async ({ page, failed, requests }) => {
        await open(page);
        await failed;
        await activateInstaller(page, platformLink(page, 'windows'), 'windows');
        assert.deepEqual(requests, ['windows']);
      });
  }

  await exercise('QA exclusion discards early events without loading Google', { device: mobile, hold: ['/analytics.js'] },
    async ({ page, release, googleTags }) => {
      await open(page, '?qa=1');
      await activateInstaller(page, platformLink(page, 'windows'), 'windows');
      release('/analytics.js');
      await page.waitForFunction(() => sessionStorage.getItem('ddirori-analytics-qa') === '1');
      assert.deepEqual(await events(page), []);
      assert.equal(googleTags(), 0);
    });

  await exercise('actual browser download with JavaScript disabled', { device: mobile, javaScriptEnabled: false },
    async ({ page, googleTags }) => {
      await open(page);
      await activateInstaller(page, platformLink(page, 'windows'), 'windows');
      assert.equal(googleTags(), 0);
    });

  await exercise('a non-attachment response navigates even while analytics is pending',
    { device: mobile, hold: ['/analytics.js'], replaceDocument: true }, async ({ page, requests, googleTags }) => {
      await open(page);
      await platformLink(page, 'windows').click();
      await page.waitForURL(installers.windows.url);
      assert.deepEqual(requests, ['windows']);
      assert.equal(await page.locator('h1').textContent(), 'Installer redirect fixture');
      assert.equal(googleTags(), 0);
    });

  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), scenarios }, null, 2));
} finally {
  await browser.close();
}
