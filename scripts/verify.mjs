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
