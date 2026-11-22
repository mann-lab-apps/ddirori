import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.DDIRORI_PLAYWRIGHT ?? 'playwright');
const base = process.env.DDIRORI_LANDING_URL ?? 'http://127.0.0.1:8117/';
const root = path.resolve(import.meta.dirname, '..');
const out = path.join(root, 'out/lesson-pilot');
fs.mkdirSync(out, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DDIRORI_BROWSER ? { executablePath: process.env.DDIRORI_BROWSER } : {}),
});
try {
  const context = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await context.newPage();
  const faults = [];
  page.on('pageerror', error => faults.push(error.message));
  page.on('response', response => {
    if (response.status() >= 400) faults.push(response.status() + ' ' + response.url());
  });
  await page.goto(base);
  await page.getByRole('link', { name: '무료 5분 음악수업 열기' }).click();
  assert.equal(new URL(page.url()).pathname, new URL('lessons/', base).pathname);
  const rhythm = page.locator('#rhythm');
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 880 });
    await page.evaluate(() => document.fonts.ready);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'teacher width ' + width);
    if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(out, 'teacher-' + width + '.png') });
  }

  assert.equal(await page.locator('body').evaluate(n => getComputedStyle(n).getPropertyValue('--dd-brand').trim()), '#A5D8FF');
  assert.equal(await page.locator('#toggle-play').evaluate(n => getComputedStyle(n).backgroundColor), 'rgb(25, 113, 194)');
  for (const [label, file] of [['박자 소리 듣기', 'clock.wav'], ['건반 소리 듣기', 'key.wav']]) {
    await page.getByRole('button', { name: label }).click();
    await page.waitForFunction(file => {
      const node = document.querySelector('#sound-example');
      return node.currentSrc.endsWith(file) && node.currentTime > .05;
    }, file);
  }
  await page.getByRole('button', { name: '리듬 재생' }).click();
  await page.waitForFunction(() => document.querySelector('#rhythm').currentTime > .05);
  assert(await page.locator('#sound-example').evaluate(node => node.paused));
  await rhythm.evaluate(node => { node.currentTime = 3; });
  await page.waitForFunction(() => document.querySelector('#phase').textContent === '첫 번째 듣기');
  await page.getByRole('button', { name: '잠시 멈춤' }).click();
  assert(await rhythm.evaluate(node => node.paused));
  await page.getByRole('button', { name: '이어서 듣기' }).click();

  for (const [label, name, ordinal] of [['기본','standard','세 번째'], ['쉬움','easy','두 번째'], ['도전','challenge','네 번째']]) {
    await page.locator('.levels label').filter({ hasText: label }).click();
    await rhythm.evaluate(node => node.play());
    await page.waitForFunction(() => document.querySelector('#rhythm').currentTime > .10);
    assert(await rhythm.evaluate(node => Number.isFinite(node.duration) && node.currentSrc.endsWith('.wav')));
    assert((await rhythm.evaluate(node => node.currentSrc)).endsWith('/' + name + '.wav'));
    assert.equal(await page.locator('.on-beat').count(), 1);
    await page.locator('#answer summary').click();
    assert((await page.locator('#answer-text').innerText()).includes(ordinal));
    assert.equal(await page.locator('.key-beats .rest').count(), name === 'challenge' ? 2 : 1);
    if (name === 'standard') {
      await page.screenshot({ path: path.join(out, 'teacher-answer.png') });
    }
  }
  await page.locator('.video-extra summary').click();
  await page.locator('video').evaluate(node => node.play());
  await page.waitForFunction(() => document.querySelector('video').currentTime > .1);
  assert(await rhythm.evaluate(node => node.paused));
  assert.equal(Math.round(await page.locator('video').evaluate(node => node.duration)), 24);
  await rhythm.evaluate(node => node.play());
  assert(await page.locator('video').evaluate(node => node.paused));
  await rhythm.evaluate(node => node.pause());

  await page.getByRole('button', { name: '링크 복사', exact: true }).click();
  const homeUrl = await page.locator('#home-link').evaluate(node => node.href);
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), homeUrl);
  assert((await page.locator('#share-status').innerText()).includes('이 기기'));
  await page.getByRole('button', { name: '교사용 링크 복사' }).click();
  const teacherUrl = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  assert.equal(teacherUrl.pathname, new URL('lessons/', base).pathname);
  assert.equal(teacherUrl.searchParams.get('utm_source'), 'teacher');
  assert.equal(teacherUrl.searchParams.get('utm_medium'), 'referral');
  assert.equal(teacherUrl.searchParams.get('utm_campaign'), 'free_lessons');
  assert(!teacherUrl.searchParams.has('from'));
  await page.evaluate(() => Object.defineProperty(navigator.clipboard, 'writeText', {
    configurable: true, value: async () => { throw new Error('denied'); },
  }));
  await page.getByRole('button', { name: '링크 복사', exact: true }).click();
  assert(await page.locator('#share-url').isVisible());
  assert.equal(await page.locator('#share-url').inputValue(), homeUrl);
  await page.evaluate(() => { window.print = () => { document.body.dataset.printInvoked = 'yes'; }; });
  await page.getByRole('button', { name: '활동지 인쇄' }).click();
  assert.equal(await page.locator('body').getAttribute('data-print-invoked'), 'yes');
  await page.emulateMedia({ media: 'print' });
  assert(await page.locator('.worksheet').isVisible());
  assert(!(await page.locator('#activities').isVisible()));
  const pdf = await page.pdf({ path: path.join(out, 'worksheet.pdf'), preferCSSPageSize: true });
  assert.equal((pdf.toString('latin1').match(/\/Type\s*\/Page\b/g) ?? []).length, 1);
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('link', { name: '수업 목록', exact: true }).click();
  assert.equal(await page.locator('.activity-list li').count(), 4);
  assert(!/29,000|구매 관심|판매 준비/.test(await page.locator('body').innerText()));
  for (const id of ['dynamics', 'melody', 'echo']) {
    await page.locator('audio[data-activity="' + id + '"]').evaluate(node => node.play());
    await page.waitForFunction(id => {
      const node = document.querySelector('audio[data-activity="' + id + '"]');
      return !node.paused && node.currentTime > .05;
    }, id);
    assert.equal(await page.locator('audio').evaluateAll(nodes => nodes.filter(node => !node.paused).length), 1);
  }
  const feedback = new URL(await page.getByRole('link', { name: '수업 사용 후기 보내기' }).getAttribute('href'));
  assert(feedback.searchParams.get('subject').includes('사용 후기'));

  await page.getByRole('link', { name: '가정 연습 열기' }).click();
  assert.equal(page.url(), homeUrl);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 880 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'home width ' + width);
    if (width === 390) await page.screenshot({ path: path.join(out, 'home-390.png') });
  }
  assert.equal(await page.locator('a[href^="mailto:"]').count(), 0);
  await rhythm.evaluate(node => node.play());
  await page.waitForFunction(() => document.querySelector('#rhythm').currentTime > .1);
  await page.getByRole('button', { name: '첫째' }).click();
  assert((await page.getByRole('status').innerText()).includes('다시'));
  assert(!(await page.locator('#bach-response').isVisible()));
  await page.getByRole('button', { name: '둘째' }).click();
  assert((await page.getByRole('status').innerText()).includes('맞았어요'));
  assert(await page.locator('#bach-response').isVisible());
  await page.setViewportSize({ width: 390, height: 880 });
  await page.screenshot({ path: path.join(out, 'home-answer.png') });
  assert(await page.evaluate(() => !window.gtag));

  await page.goto(pathToFileURL(path.join(root, 'dist/lessons/index.html')).href);
  await page.locator('.levels label').filter({ hasText: '도전' }).click();
  await rhythm.evaluate(node => node.play());
  await page.waitForFunction(() => document.querySelector('#rhythm').currentTime > .1);
  await page.getByRole('link', { name: '가정 연습 열기' }).click();
  await page.getByRole('button', { name: '둘째' }).click();
  assert((await page.getByRole('status').innerText()).includes('맞았어요'));
  // Production hostname with local assets and a stubbed Google script. No QA hits reach GA.
  const measured = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  await measured.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.hostname === 'www.googletagmanager.com') return route.fulfill({ contentType: 'text/javascript', body: '' });
    if (url.hostname !== 'ddirori.com') return route.abort();
    if (url.pathname.endsWith('analytics-config.json')) return route.fulfill({ json: { provider: 'ga4', enabled: true, measurementId: 'G-LESSONTEST' } });
    const source = await route.fetch({ url: new URL(url.pathname.slice(1), base).href });
    return route.fulfill({ response: source });
  });
  const probe = await measured.newPage();
  await probe.goto('https://ddirori.com/lessons/' + teacherUrl.search);
  const countEvent = (name) => probe.evaluate(name => window.dataLayer.filter(x => x[0] === 'event' && x[1] === name).length, name);
  await probe.waitForFunction(() => window.dataLayer?.some(x => x[1] === 'lesson_view'));
  await probe.locator('[data-activity="echo"]').evaluate(node => node.play());
  await probe.waitForFunction(() => window.dataLayer?.some(x => x[1] === 'lesson_start'));
  await probe.locator('#toggle-play').click();
  await probe.getByRole('button', { name: '교사용 링크 복사' }).click();
  await probe.waitForFunction(() => window.dataLayer?.some(x => x[1] === 'lesson_teacher_share'));
  assert.equal(await countEvent('lesson_view'), 1);
  assert.equal(await countEvent('lesson_start'), 1);
  assert.equal(await countEvent('lesson_teacher_share'), 1);
  const startParams = await probe.evaluate(() => window.dataLayer.find(x => x[1] === 'lesson_start')[2]);
  assert.equal(startParams.content_slug, 'echo');
  assert.equal(startParams.location, 'teacher_share');
  await probe.waitForFunction(() => window.dataLayer.filter(x => x[1] === 'lesson_activity_play').length === 2);
  const lesson = probe.locator('#rhythm');
  await lesson.evaluate(n => { n.currentTime = n.duration - .12; });
  await probe.waitForFunction(() => window.dataLayer.some(x => x[1] === 'lesson_activity_end'));
  await lesson.evaluate(n => n.play());
  await lesson.evaluate(n => { n.currentTime = n.duration - .12; });
  await probe.waitForFunction(() => document.querySelector('#rhythm').ended);
  assert.equal(await countEvent('lesson_activity_play'), 2);
  assert.equal(await countEvent('lesson_activity_end'), 1);
  const dims = await probe.evaluate(() => window.dataLayer.find(x => x[1] === 'lesson_activity_end')[2]);
  assert.equal(dims.content_slug, 'missing-beat');
  assert.equal(dims.difficulty, 'standard');

  // Inspect script/config requests as well as the queue to catch accidental initialization.
  const qaRequests = [];
  const watchQa = req => { if (/analytics-config|googletagmanager/.test(req.url())) qaRequests.push(req.url()); };
  probe.on('request', watchQa);
  await probe.goto('https://ddirori.com/?qa=1');
  await probe.getByRole('link', { name: '무료 5분 음악수업 열기' }).click();
  await probe.locator('#toggle-play').click();
  await probe.waitForFunction(() => document.querySelector('#rhythm').currentTime > .1);
  assert(await probe.evaluate(() => !window.gtag));
  assert.deepEqual(qaRequests, []);
  probe.off('request', watchQa);
  await probe.goto('https://ddirori.com/lessons/?qa=0');
  await probe.waitForFunction(() => window.dataLayer?.some(x => x[1] === 'lesson_view'));
  await probe.evaluate(async () => {
    const {configureAnalytics} = await import('/analytics.js');
    await Promise.all([configureAnalytics(), configureAnalytics()]);
  });
  assert.equal(await probe.evaluate(() => window.dataLayer.filter(x => x[0] === 'config').length), 1);
  probe.on('request', watchQa);
  await probe.goto('https://ddirori.com/lessons/home/');
  await probe.getByRole('button', { name: '둘째' }).click();
  assert(await probe.evaluate(() => !window.gtag));
  assert.deepEqual(qaRequests, []);
  await measured.close();
  assert.deepEqual(faults, []);
  console.log('Verified teacher and student flows at 4 widths, 3 audio levels, video, print, sharing, all free activities, acquisition events, and local files.');
} finally {
  await browser.close();
}
