import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium,devices}=require(process.env.DDIRORI_PLAYWRIGHT??'playwright');
const base=process.env.DDIRORI_LANDING_URL??'http://127.0.0.1:8110/';
const out=path.resolve(process.env.DDIRORI_LANDING_EVIDENCE??'out/ddirori-landing-review');
fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.DDIRORI_BROWSER?{executablePath:process.env.DDIRORI_BROWSER}:{})});
const pages=['index','studio','score','play','support','privacy'];
const studioManifest=await fetch(new URL('download-manifest.json',base)).then(response=>response.json());
const studioDownloads=Object.fromEntries(studioManifest.downloads.map(item=>[item.id,item]));
const expectedMeasurementId=process.env.GA4_MEASUREMENT_ID??'G-DDIRORIQA';
const result={scope:'Presentation and download routing; not installer execution or native app QA',at:new Date().toISOString(),layouts:[],checks:[],errors:[]};
function check(name,condition){assert(condition,name);result.checks.push(name);}
try{
 const context=await browser.newContext({permissions:['clipboard-read','clipboard-write']});
 const page=await context.newPage();
 page.on('pageerror',e=>result.errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('favicon.ico'))result.errors.push(`${r.status()} ${r.url()}`);});
 for(const name of pages)for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});
  await page.goto(new URL(name+'.html',base).href);
  await page.evaluate(()=>document.fonts.ready);
  await page.evaluate(()=>Promise.all([...document.images].map(image=>{image.loading='eager';return image.decode().catch(()=>{});})));
  const id=`${name}-${width}`;
  check(`${id} single heading`,await page.locator('h1').count()===1);
  check(`${id} page fits`,await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  check(`${id} local images resolve`,await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)));
  check(`${id} unified action`,await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--action').trim()==='#1971C2'));
  check(`${id} only active apps in service menu`,await page.locator('.service-dropdown a').count()===3);
  check(`${id} no deferred-service routes`,await page.locator('a[href*="stage.html"],a[href*="talk.html"],a[href*="practice.html"]').count()===0);
  result.layouts.push(id);
  if([390,1440].includes(width)&&['index','studio','score','play'].includes(name))await page.screenshot({path:path.join(out,id+'.png'),fullPage:true});
 }
 await page.setViewportSize({width:390,height:844});await page.goto(base);
 const menu=page.locator('.mobile-toggle');await menu.click();
 check('mobile menu expanded',await menu.getAttribute('aria-expanded')==='true');
 await page.getByText('서비스',{exact:true}).first().click();
 await page.locator('.service-dropdown').getByRole('link',{name:/띠로리 스코어/}).click();
 check('service menu navigates to Score',new URL(page.url()).pathname.endsWith('/score/'));
 await page.getByRole('button',{name:'메뉴 열기'}).click();await page.keyboard.press('Escape');
 check('escape closes menu and returns focus',await page.getByRole('button',{name:'메뉴 열기'}).evaluate(n=>document.activeElement===n&&n.getAttribute('aria-expanded')==='false'));
 await page.goto(new URL('studio.html#download',base).href);
 await page.getByRole('button',{name:'Windows',exact:true}).click();
 check('Windows file uses manifest',/windows-x64-setup\.exe$/.test(await page.locator('[data-download-link]').getAttribute('href')));
 check('unsigned warning visible',(await page.locator('[data-signing]').textContent()).includes('미서명'));
 await page.getByRole('button',{name:'Linux',exact:true}).click();
 check('Linux development artifact matches the published manifest',/linux-x86_64\.AppImage$/.test(await page.locator('[data-download-link]').getAttribute('href')));
 check('Linux distribution is described as a prerelease',(await page.locator('[data-signing]').textContent()).includes('프리릴리즈'));
 await page.getByRole('button',{name:'macOS',exact:true}).click();
 check('macOS restores valid link',/mac-universal\.dmg$/.test(await page.locator('[data-download-link]').getAttribute('href')));
 await page.locator('.faq summary').first().click();
 check('native FAQ expands',await page.locator('.faq details').first().getAttribute('open')!==null);
 await page.locator('[data-copy-email]').click();
 await page.waitForFunction(()=>document.querySelector('.copy-status')?.textContent);
 check('contact copy reports success',(await page.locator('.copy-status').textContent()).includes('복사했어요'));
 await page.goto(new URL('play.html',base).href);
 check('Play leads back to Studio',(await page.locator('.next-service a').getAttribute('href')).endsWith('/studio/'));
 await page.goto(new URL('score.html#practice-tools',base).href);
 check('practice tools belong to Score',await page.locator('#practice-tools').count()===1 && await page.getByRole('heading',{level:1}).count()===1);
 const storeLinks=page.locator('a[href*="apps.apple.com/"]');
 check('Score install links target the existing app',await storeLinks.count()===3 && await storeLinks.evaluateAll(links=>links.every(link=>new URL(link.href).pathname.endsWith('/id6808164371'))));
 check('Score explains the free iPhone and iPad availability',/iPhone · iPad.*무료/.test(await page.locator('.score-store-note').textContent()));
 check('Score does not claim an unreleased app',!(await page.locator('main').textContent()).includes('공개 준비 중'));
 const scoreImages=page.locator('img[src*="score-public-"]');
 check('Score presents three public reference images',await scoreImages.count()===3);
 await scoreImages.evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
 check('Score screenshot dimensions match the shipped files',await scoreImages.evaluateAll(images=>images.every(image=>image.naturalWidth===Number(image.getAttribute('width'))&&image.naturalHeight===Number(image.getAttribute('height')))));
 const recruitmentLink=page.getByRole('link',{name:'안드로이드 테스트 참여',exact:true});
 await recruitmentLink.focus();
 await page.keyboard.press('Enter');
 await page.waitForURL(url=>url.hash==='#android-test');
 const recruitment=page.getByRole('region',{name:'안드로이드 테스터를 모집합니다.'});
 const applyByEmail=recruitment.getByRole('link',{name:'이메일로 테스트 신청하기'});
 const applicationUrl=new URL(await applyByEmail.getAttribute('href'));
 check('mobile Android recruitment offers a draft and the same visible email address',await applyByEmail.isVisible()&&applicationUrl.protocol==='mailto:'&&(await recruitment.locator('#android-test-email').textContent())===applicationUrl.pathname);
 check('private and local Score previews do not load GA',await page.evaluate(()=>!window.gtag&&!document.querySelector('script[src*="googletagmanager.com"]')));
 await page.getByText('Clef & Staff를 쓰고 있었어요. 어떻게 업데이트하나요?',{exact:true}).click();
 check('Score rename FAQ opens',await page.locator('.faq details').first().getAttribute('open')!==null);
 await page.emulateMedia({reducedMotion:'reduce'});
 check('reduced motion disables smooth scrolling',await page.locator('html').evaluate(n=>getComputedStyle(n).scrollBehavior==='auto'));
 const guide=page.getByRole('link',{name:'MusicXML 예제',exact:true});
 await page.goto(new URL('studio/',base).href);
 await guide.click();
 await page.waitForURL(url=>url.hash==='#musicxml');
 await page.getByRole('link',{name:'Studio 설치 파일 보기'}).click();
 await page.waitForURL(url=>url.hash==='#download');
 check('MusicXML guide reaches the installer section on the same domain',await page.locator('#studio-platform-downloads a').count()===3);
 // Failed manifests retain verified static links; unsafe runtime URLs stay unavailable.
 const broken=await browser.newPage();
 await broken.route('**/download-manifest.json',route=>route.fulfill({status:503,body:'unavailable'}));
 await broken.goto(new URL('studio.html',base).href);
 await broken.waitForFunction(()=>document.querySelector('[data-download-status]')?.textContent.includes('불러오지 못했어요'));
 check('manifest failure offers the static installer list',await broken.locator('[data-download-link]').getAttribute('href')==='#studio-platform-downloads');
 check('manifest failure retains the checked installer URLs',await broken.locator('#studio-platform-downloads a').evaluateAll(links=>links.map(link=>link.href)).then(urls=>studioManifest.downloads.every(item=>urls.includes(item.url))));
 const unsafe=await browser.newPage();
 await unsafe.route('**/download-manifest.json',route=>route.fulfill({json:{version:'test',releasePublished:true,downloads:[{id:'macos',platform:'macOS',available:true,url:'javascript:alert(1)'}]}}));
 await unsafe.goto(new URL('studio.html',base).href);
 await unsafe.getByRole('button',{name:'macOS',exact:true}).click();
 check('unsafe installer URL blocked',await unsafe.locator('[data-download-link]').isDisabled());
 const noJs=await browser.newPage({javaScriptEnabled:false});
 await noJs.goto(new URL('studio.html',base).href);
 check('without JavaScript all three installers are reachable',await noJs.locator('#studio-platform-downloads a').evaluateAll(links=>links.map(link=>link.href)).then(urls=>studioManifest.downloads.every(item=>urls.includes(item.url))));
 check('no-JS visitors can access all service links',await noJs.locator('.footer-links').getByRole('link',{name:/^띠로리 (스튜디오|스코어|플레이)$/}).count()===3);
 await noJs.goto(new URL('score.html#android-test',base).href);
 check('Android applicants can read the address without a mail handler or JavaScript',await noJs.locator('#android-test-email').isVisible());
 // Exercise the real production-host gate without sending any QA hits to Google.
 const measured=await browser.newPage();
 await measured.route('https://ddirori.com/**',async route=>{
   const requested=new URL(route.request().url());
   // Test config response; the Google tag below is stubbed and sends no data.
   if(requested.pathname.endsWith('/analytics-config.json'))return route.fulfill({json:{provider:'ga4',enabled:true,measurementId:expectedMeasurementId}});
   const local=new URL(requested.pathname.slice(1)+requested.search,base);
   const response=await route.fetch({url:local.href});
   await route.fulfill({response});
 });
 await measured.route('https://www.googletagmanager.com/**',route=>route.fulfill({contentType:'application/javascript',body:'/* QA stub: no analytics sent */'}));
 await measured.goto('https://ddirori.com/score.html?utm_source=qa&utm_medium=test&utm_campaign=score_acquisition');
 await measured.waitForFunction(()=>window.dataLayer?.some(args=>args[0]==='config'));
 check('Score uses its independently configured GA4 property once',await measured.evaluate(id=>window.dataLayer.filter(args=>args[0]==='config'&&args[1]===id).length===1,expectedMeasurementId));
 check('automatic page views stay enabled without a manual duplicate',await measured.evaluate(()=>window.dataLayer.some(args=>args[0]==='config'&&args[2]?.send_page_view===true)&&!window.dataLayer.some(args=>args[0]==='event'&&args[1]==='page_view')));
 check('campaign parameters survive page initialization',new URL(measured.url()).searchParams.get('utm_campaign')==='score_acquisition');
 await measured.evaluate(()=>document.addEventListener('click',event=>{if(event.target.closest('a[href*="apps.apple.com"]'))event.preventDefault();}));
 await measured.locator('.score-hero a[data-track-event]').click();
 check('one store click sends one event with its position',await measured.evaluate(()=>{const events=window.dataLayer.filter(args=>args[0]==='event'&&args[1]==='score_store_click');return events.length===1&&events[0][2].location==='hero'&&events[0][2].content_type==='score'&&events[0][2].app_name==='Ddirori'&&events[0][2].link_url.endsWith('/id6808164371');}));
 await measured.goto('https://ddirori.com/?utm_source=qa&utm_medium=test&utm_campaign=studio_discovery');
 await measured.locator('.hero-home-actions a[href$="/studio/#download"]').click();
 await measured.waitForURL('https://ddirori.com/studio/#download');
 await measured.waitForFunction(()=>window.dataLayer?.some(args=>args[0]==='config'));
 check('home to Studio adds no UTM parameters',new URL(measured.url()).search==='');
 const studioEventPayloads=page=>page.evaluate(()=>window.dataLayer
   .filter(args=>args[0]==='event'&&['download_primary','download_platform'].includes(args[1]))
   .map(([,name,params])=>[name,params]));
 await measured.evaluate(()=>document.addEventListener('click',event=>{
   if(event.target.closest('a[href^="https://github.com/"]'))event.preventDefault();
 }));
 const primary=measured.locator('[data-download-link]');
 for(const id of ['windows','linux','macos']){
   await measured.locator(`[data-platform="${id}"]`).click();
   check(`${id} primary link uses the selected installer`,await primary.getAttribute('href')===studioDownloads[id].url);
 }
 check('changing platforms emits no Studio download event',(await studioEventPayloads(measured)).length===0);
 await primary.focus();
 await measured.keyboard.press('Enter');
 await measured.locator('#studio-platform-downloads').getByRole('link',{name:'Windows 설치 파일'}).click();
 const downloads=await studioEventPayloads(measured);
 check('keyboard primary and mouse platform clicks each emit one event',downloads.length===2);
 for(const [index,id,name,location] of [[0,'macos','download_primary','studio_primary'],[1,'windows','download_platform','studio_platform_list']]){
   const [event,params]=downloads[index];
   const item=studioDownloads[id];
   check(`${name} sends the current platform, URL, file and release`,event===name&&params.platform===id&&params.location===location&&params.link_url===item.url&&params.file_name===item.fileName&&params.release_version===studioManifest.version);
 }
 const mobileStudio=await browser.newPage(devices['iPhone 13']);
 await mobileStudio.goto(new URL('studio/',base).href);
 await mobileStudio.locator('[data-download-panel] .platform-tabs').waitFor();
 check('iPhone receives desktop guidance and selects no installer',await mobileStudio.locator('[data-mobile-note]').isVisible()
   && await mobileStudio.locator('[data-platform][aria-pressed="true"]').count()===0
   && await mobileStudio.locator('[data-download-link]').getAttribute('href')==='#studio-platform-downloads');
 await mobileStudio.getByRole('link',{name:'MusicXML 예제',exact:true}).click();
 await mobileStudio.getByRole('link',{name:'Studio 설치 파일 보기'}).click();
 await mobileStudio.waitForURL(url=>url.hash==='#download');
 check('mobile guide leads to desktop platform links',await mobileStudio.locator('#studio-platform-downloads a').count()===3);
 const unknownStudio=await browser.newPage({ userAgent:'Studio browser test' });
 await unknownStudio.addInitScript(()=>{
   Object.defineProperty(navigator,'userAgentData',{ value:undefined });
   Object.defineProperty(navigator,'platform',{ value:'' });
 });
 await unknownStudio.goto(new URL('studio/#download',base).href);
 await unknownStudio.locator('[data-download-panel] .platform-tabs').waitFor();
 check('unknown desktop can choose a platform without guessing the installer',await unknownStudio.locator('[data-download-link]').getAttribute('href')==='#studio-platform-downloads');
 const unconfigured=await browser.newPage();
 let unconfiguredGoogleRequests=0;
 await unconfigured.route('https://www.googletagmanager.com/**',route=>{unconfiguredGoogleRequests++;return route.abort();});
 await unconfigured.route('https://ddirori.com/**',async route=>{
   const requested=new URL(route.request().url());
   if(requested.pathname.endsWith('/analytics-config.json'))return route.fulfill({json:{provider:'ga4',enabled:false,measurementId:''}});
   const response=await route.fetch({url:new URL(requested.pathname.slice(1),base).href});
   await route.fulfill({response});
 });
 await unconfigured.goto('https://ddirori.com/score.html');
 await unconfigured.waitForLoadState('networkidle');
 check('unconfigured Ddirori sends no analytics to the legacy property',unconfiguredGoogleRequests===0&&await unconfigured.evaluate(()=>!window.gtag));
 const unavailable=await browser.newPage();
 await unavailable.route('https://ddirori.com/**',async route=>{
   if(new URL(route.request().url()).pathname.endsWith('/analytics.js'))return route.fulfill({status:503,contentType:'text/javascript',body:''});
   const requested=new URL(route.request().url());
   const response=await route.fetch({url:new URL(requested.pathname.slice(1),base).href});
   await route.fulfill({response});
 });
 await unavailable.goto('https://ddirori.com/score.html');
 check('failed analytics does not remove store links',await unavailable.locator('a[href$="/id6808164371"]').count()===3);
 await unavailable.setViewportSize({width:390,height:844});
 await unavailable.getByRole('button',{name:'메뉴 열기'}).click();
 check('failed analytics does not block the mobile menu',await unavailable.getByRole('button',{name:'메뉴 닫기'}).getAttribute('aria-expanded')==='true');
 check('no runtime or asset errors',result.errors.length===0);
 result.browser=await browser.version();
 fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(result,null,2)+'\n');
 console.log(`${result.layouts.length} layouts, ${result.checks.length} checks passed`);
}finally{await browser.close();}
