// Inspect the published site's real Google tag, without delivering test events to GA.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';

const { chromium } = createRequire(import.meta.url)(process.env.DDIRORI_PLAYWRIGHT ?? 'playwright');
const origin = 'https://ddirori.com';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.DDIRORI_BROWSER ? { executablePath: process.env.DDIRORI_BROWSER } : {}),
});
try {
  const context = await browser.newContext({ serviceWorkers: 'block', permissions: ['clipboard-read', 'clipboard-write'] });
  const events = [];
  let tags = 0;
  await context.route('**/*', route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin === origin) return route.continue();
    if (url.origin === 'https://www.googletagmanager.com' && url.pathname === '/gtag/js') {
      tags++;
      return route.continue();
    }
    if (url.pathname.endsWith('/collect')) {
      const payload = request.postData() || '';
      for (const line of payload.split('\n')) {
        const row = new URLSearchParams(url.search);
        for (const [key, value] of new URLSearchParams(line)) row.set(key, value);
        if (row.has('en')) events.push({ name: row.get('en'), slug: row.get('ep.content_slug'), target: row.get('tid'), page: row.get('dl') });
      }
      return route.fulfill({ status: 204 });
    }
    return route.abort();
  });

  const page = await context.newPage();
  await page.goto(origin + '/?qa=1');
  await page.getByRole('link', { name: '무료 5분 음악수업 열기' }).click();
  await page.locator('#toggle-play').click();
  await page.waitForFunction(() => document.querySelector('#rhythm').currentTime > .15);
  assert.equal(tags, 0);
  assert.equal(events.length, 0);
  assert(await page.evaluate(() => !window.gtag));

  await page.goto(origin + '/lessons/?qa=0&utm_source=teacher&utm_medium=referral&utm_campaign=free_lessons');
  await page.locator('[data-sound="clock"]').click();
  await page.waitForFunction(() => window.dataLayer?.some(args => args[1] === 'lesson_view'));
  assert(await page.evaluate(() => !window.dataLayer.some(args => args[1] === 'lesson_start')));
  const echo = page.locator('[data-activity="echo"]');
  await echo.evaluate(node => node.play());
  await echo.evaluate(node => { node.currentTime = node.duration - .2; });
  await page.waitForFunction(() => window.dataLayer.some(args => args[1] === 'lesson_activity_end'));
  await echo.evaluate(node => node.play());
  await page.getByRole('button', { name: '교사용 링크 복사' }).click();
  const expected = ['lesson_view', 'lesson_start', 'lesson_activity_play', 'lesson_activity_end', 'lesson_teacher_share'];
  const deadline = Date.now() + 15000;
  while (!expected.every(name => events.some(event => event.name === name)) && Date.now() < deadline) {
    await delay(200);
  }
  for (const name of expected) {
    const hits = events.filter(event => event.name === name);
    assert.equal(hits.length, 1, name + ' at collection boundary');
    assert.equal(hits[0].target, 'G-KFJBY01RKT');
    if (['lesson_start','lesson_activity_play','lesson_activity_end'].includes(name)) assert.equal(hits[0].slug, 'echo');
  }
  await page.goto(origin + '/lessons/home/');
  await page.getByRole('button', { name: '둘째' }).click();
  assert(await page.evaluate(() => !window.gtag));
  assert.equal(tags, 1);
  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.emulateMedia({ reducedMotion: 'reduce' });
  const campaignUrl = origin + '/lessons/?utm_source=youtube&utm_medium=organic_social&utm_campaign=free_lessons_echo_01#echo';
  await mobile.goto(campaignUrl);
  await mobile.waitForFunction(() => {
    const audio = document.querySelector(':target audio');
    const box = audio?.getBoundingClientRect();
    return audio?.dataset.activity === 'echo' && audio.paused && box.top >= 0 && box.bottom <= innerHeight;
  });
  await mobile.waitForFunction(() => window.dataLayer?.some(args => args[1] === 'lesson_view'));
  assert(await mobile.evaluate(() => !window.dataLayer.some(args => args[1] === 'lesson_start')));
  const start = events.length;
  await mobile.locator(':target audio').click({ position: { x: 25, y: 22 } });
  await mobile.waitForFunction(() => document.querySelector(':target audio').currentTime > .15);
  const until = Date.now() + 15000;
  const campaignHit = () => events.slice(start).find(event => {
    if (event.name !== 'lesson_start' || !event.page) return false;
    const url = new URL(event.page);
    return url.searchParams.get('utm_campaign') === 'free_lessons_echo_01'
      && url.searchParams.get('utm_source') === 'youtube'
      && url.searchParams.get('utm_medium') === 'organic_social';
  });
  while (!campaignHit() && Date.now() < until) await delay(200);
  assert.equal(campaignHit()?.slug, 'echo', 'tagged mobile landing and first audio play');
  console.log('PASS: production tag, lesson events, student isolation and the tagged mobile Shorts link. All collection intercepted.');
} finally {
  await browser.close();
}
