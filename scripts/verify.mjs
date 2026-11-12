import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(import.meta.dirname,'..');const dist=path.join(root,'dist');
let checked=0;
const index=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const base=(index.match(/href="([^\"]*)\/score\//)?.[1]??'');
for(const name of ['index','score','play','studio','support','privacy']){
 const html=fs.readFileSync(path.join(dist,name==='index'?'index.html':name+'/index.html'),'utf8');
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1,`${name}: one heading`);
 assert(html.includes(`https://ddirori.com${name==='index'?'/':'/'+name+'/'}`),`${name}: canonical`);
 assert(html.includes(`name="robots" content="${base?'noindex,nofollow':'index,follow'}"`),`${name}: production indexing / staging exclusion`);
 assert(!html.includes('href="https://in-c.mannlab.app/'),`${name}: no legacy support links`);
 assert(html.includes('© 2026 MannLab. All rights reserved.'),`${name}: operator copyright`);
 assert(html.includes('assets/font-subset.woff2" as="font"'),`${name}: preload the small font`);
 for(const [,attribute,value]of html.matchAll(/(href|src)="([^\"]+)"/g)){
  if(!value.startsWith('/'))continue;
  const url=new URL(value,'https://ddirori.com');
  const local=url.pathname.slice(base.length).replace(/^\//,'');
  const file=path.join(dist,local.endsWith('/')?local+'index.html':local);
  assert(fs.existsSync(file),`${name}: missing ${attribute} ${value}`);checked++;
 }
}
const score=fs.readFileSync(path.join(dist,'score/index.html'),'utf8');
assert.equal((score.match(/data-track-event="score_store_click"/g)||[]).length,3);
assert.equal((score.match(/href="https:\/\/apps.apple.com\/kr\/app\/id6808164371"/g)||[]).length,3);
assert(!score.includes('공개 준비 중'));
const appSchemas=[...score.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match=>JSON.parse(match[1]));
assert.equal(appSchemas.length,1,'Score has one app schema');
const appSchema=appSchemas[0];
assert.equal(appSchema['@type'],'SoftwareApplication');
assert.equal(appSchema.name,'Clef & Staff','Use the current public app name');
assert.equal(appSchema.alternateName,'띠로리 스코어');
assert.equal(appSchema.url,'https://ddirori.com/score/');
assert.equal(appSchema.downloadUrl,'https://apps.apple.com/kr/app/id6808164371');
assert.equal(appSchema.offers.price,0);
assert.equal(appSchema.offers.priceCurrency,'KRW');
assert(!appSchema.aggregateRating&&!appSchema.review,'Do not invent reviews');
assert(score.includes(`<meta name="description" content="${appSchema.description}"`),'Description agrees with the app schema');
assert(score.includes('<title>PDF 악보 뷰어·필기 앱 | 띠로리 스코어</title>'));
const smallFont=fs.statSync(path.join(dist,'assets/font-subset.woff2')).size;
assert(smallFont<150_000,'The primary web font stays below 150 KB');
assert(fs.readFileSync(path.join(dist,'styles.css'),'utf8').includes('font-family:DdiroriWeb,Pretendard,system-ui,sans-serif'),'Keep the complete font as a missing-character fallback');
const ga=JSON.parse(fs.readFileSync(path.join(dist,'analytics-config.json'),'utf8'));
assert.notEqual(ga.measurementId,'G-1BY2PWFWXR');assert.equal(ga.enabled,!!ga.measurementId);
if(ga.enabled)assert(/^G-[A-Z0-9]+$/.test(ga.measurementId));
const script=fs.readFileSync(path.join(dist,'main.js'),'utf8');assert(script.includes("['ddirori.com','www.ddirori.com'].includes(location.hostname)"));
for(const image of JSON.parse(fs.readFileSync(path.join(dist,'assets/sources.json'),'utf8'))){
 if(!image.asset.startsWith('score-public-'))continue;
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dist,'assets',image.asset))).digest('hex'),image.sha256);
}
const manifest=JSON.parse(fs.readFileSync(path.join(dist,'download-manifest.json'),'utf8'));assert.equal(manifest.version,'0.1.0-alpha.38');
console.log(`Verified 6 pages, ${checked} local references, 3 store CTAs, screenshot hashes and GA configuration`);
