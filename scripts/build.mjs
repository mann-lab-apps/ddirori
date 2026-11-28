import fs from 'node:fs';
import { buildLessonAudio } from './build-lesson-audio.mjs';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const source=path.join(root,'src');
const dist=path.join(root,'dist');
const rawBase=process.env.PAGES_BASE_PATH??'';
if(rawBase && !/^\/[a-zA-Z0-9_-]+\/?$/.test(rawBase))throw Error('Invalid Pages base path');
const base=rawBase.replace(/\/$/,'');
const measurementId=(process.env.GA4_MEASUREMENT_ID??'').trim();
if(measurementId && !/^G-[A-Z0-9]+$/.test(measurementId))throw Error('Invalid GA4 measurement ID');
if(measurementId==='G-1BY2PWFWXR')throw Error('Use the new Ddirori stream, not the legacy in-c ID');
const rawBetaForm=(process.env.PLAY_BETA_FORM_URL??'').trim();
let betaForm='';
if(rawBetaForm){
  const url=new URL(rawBetaForm);
  const isRespondentForm=url.origin==='https://docs.google.com'&&/^\/forms\/d\/(?:e\/)?[A-Za-z0-9_-]+\/viewform$/.test(url.pathname);
  const isFormsShortLink=url.origin==='https://forms.gle'&&/^\/[A-Za-z0-9]+$/.test(url.pathname);
  if(url.username||url.password||!(isRespondentForm||isFormsShortLink))throw Error('Use a public Google Forms responder link for Play beta');
  betaForm=url.origin+url.pathname;
}
const routes=['index','score','score-ipad-pdf','play','play-beta','studio','support','privacy','play-privacy'];
const nestedRoutes={'play-privacy':'play/privacy','play-beta':'play/beta','score-ipad-pdf':'score/guides/ipad-pdf'};
// Update only when the guide's main content changes.
const guideLastModified = '2026-11-27';
const routePath=name=>nestedRoutes[name]??name;
const destination=name=>name==='index'?`${base}/`:`${base}/${routePath(name)}/`;
function rewrite(html,name){
  html=html.replace(/(href|src)="\.\/([^\"]+)"/g,(_,attribute,value)=>{
    const page=value.match(/^([a-z-]+)\.html(.*)$/);
    return `${attribute}="${page&&routes.includes(page[1])?destination(page[1])+page[2]:base+'/'+value}"`;
  });
  html=html.replaceAll('https://in-c.mannlab.app/clef-and-staff/support.html',destination('support'))
    .replaceAll('https://in-c.mannlab.app/support.html',destination('support'))
    .replaceAll('https://in-c.mannlab.app/privacy.html',destination('privacy'));
  const canonical=`https://ddirori.com${name==='index'?'/':'/'+routePath(name)+'/'}`;
  html=html.replace(/(<link rel="canonical" href=")[^"]*(")/,'$1'+canonical+'$2')
    .replace(/(<meta property="og:url" content=")[^"]*(")/,'$1'+canonical+'$2')
    .replace(/(<meta property="og:image" content=")[^"]*(")/,'$1https://ddirori.com/assets/social-preview.png$2');
  // The GitHub project URL is a staging address while the domain is pending.
  html=html.replace(/(<meta name="robots" content=")[^"]*(")/,'$1'+(base||name==='play-beta'?'noindex,nofollow':'index,follow')+'$2');
  if(name==='play-beta'&&betaForm){
    html=html
      .replace(/(<a class="button primary" data-play-beta-apply href=")[^"]+(">)[^<]+(<\/a>)/,
        (_,start,middle,end)=>start+betaForm+middle+'Google Forms로 베타 신청하기'+end)
      .replace(/<p class="beta-apply-help" data-play-beta-email-help>[^]*?<\/p>/,
        '<p class="beta-apply-help">신청은 Google Forms에서 받습니다. Play 스토어에 로그인한 Google 계정 이메일을 적어주세요.</p>');
  }
  const title=html.match(/<title>(.*?)<\/title>/)?.[1]??'띠로리';
  const description=html.match(/<meta name="description" content="([^"]*)"/)?.[1]??'';
  html=html.replace(/(<meta property="og:title" content=")[^"]*(")/,'$1'+title+'$2').replace(/(<meta property="og:description" content=")[^"]*(")/,'$1'+description+'$2');
  if(!html.includes('property="og:url"'))html=html.replace('</head>',`<meta property="og:url" content="${canonical}"></head>`);
  return html;
}
fs.rmSync(dist,{recursive:true,force:true});
fs.cpSync(source,dist,{recursive:true});
buildLessonAudio(path.join(dist,'lessons'));
if (base) {
  const lesson = path.join(dist, 'lessons/index.html');
  fs.writeFileSync(lesson, fs.readFileSync(lesson, 'utf8').replace('<head>', '<head>\n  <meta name="robots" content="noindex,nofollow">'));
}
for(const name of routes){
  const file=path.join(source,name+'.html');
  const html=rewrite(fs.readFileSync(file,'utf8'),name);
  const directory=name==='index'?dist:path.join(dist,routePath(name));
  fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'index.html'),html);
  // Existing shared links and bookmarks remain usable too.
  fs.writeFileSync(path.join(dist,name+'.html'),html);
}
const config=JSON.parse(fs.readFileSync(path.join(dist,'site-config.json'),'utf8'));
config.origin='https://ddirori.com';config.supportUrl=destination('support');config.privacyUrl=destination('privacy');config.services.score.pageUrl='https://ddirori.com/score/';
fs.writeFileSync(path.join(dist,'site-config.json'),JSON.stringify(config,null,2)+'\n');
fs.writeFileSync(path.join(dist,'analytics-config.json'),JSON.stringify({provider:'ga4',measurementId,enabled:!!measurementId},null,2)+'\n');
const privacy=path.join(dist,'privacy/index.html');
const privacyHtml=fs.readFileSync(privacy,'utf8').replaceAll('분석 상태: 설정 준비 중',measurementId?'분석 설정: 대표 도메인에서 사용':'분석 상태: 설정 준비 중');
fs.writeFileSync(privacy,privacyHtml);fs.writeFileSync(path.join(dist,'privacy.html'),privacyHtml);
fs.writeFileSync(path.join(dist,'.nojekyll'),'');
fs.writeFileSync(path.join(dist,'robots.txt'),`User-agent: *\n${base?'Disallow: /':'Allow: /'}\nSitemap: https://ddirori.com/sitemap.xml\n`);
const sitemapEntries = [...routes.filter(name=>name!=='play-beta'), 'lessons'].map(name => {
  const url = `https://ddirori.com${destination(name).slice(base.length)}`;
  const lastmod = name === 'score-ipad-pdf' ? `<lastmod>${guideLastModified}</lastmod>` : '';
  return `  <url><loc>${url}</loc>${lastmod}</url>`;
});
fs.writeFileSync(path.join(dist, 'sitemap.xml'),
  '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  sitemapEntries.join('\n') + '\n</urlset>\n');
console.log(`Built ${routes.length} pages; base=${base||'/'}; GA=${measurementId?'configured':'disabled (new stream pending)'}`);
