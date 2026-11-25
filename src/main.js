// One Ddirori web stream measures the shared website on its production domain.
// Local QA and the private design preview must not become acquisition traffic.
if(['ddirori.com','www.ddirori.com'].includes(location.hostname)){
  void import('./analytics.js').then(({bindTrackedLinks,configureAnalytics})=>{
    bindTrackedLinks();
    void configureAnalytics();
  }).catch(()=>{/* Measurement failure must not affect the page or store links. */});
}
const header=document.querySelector('.site-header');
const toggle=document.querySelector('.mobile-toggle');
const navigation=document.querySelector('.header-nav');
const serviceMenu=document.querySelector('.service-menu');
function closeNavigation(){navigation.classList.remove('is-open');toggle.setAttribute('aria-expanded','false');toggle.setAttribute('aria-label','메뉴 열기');}
toggle.addEventListener('click',()=>{const open=toggle.getAttribute('aria-expanded')!=='true';toggle.setAttribute('aria-expanded',String(open));toggle.setAttribute('aria-label',open?'메뉴 닫기':'메뉴 열기');navigation.classList.toggle('is-open',open);});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){const wasOpen=toggle.getAttribute('aria-expanded')==='true';closeNavigation();serviceMenu.open=false;if(wasOpen)toggle.focus();}});
document.addEventListener('click',event=>{if(!header.contains(event.target)){serviceMenu.open=false;closeNavigation();}});
navigation.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>{closeNavigation();serviceMenu.open=false;}));
const onScroll=()=>header.classList.toggle('scrolled',scrollY>10);addEventListener('scroll',onScroll,{passive:true});onScroll();
const tempo=document.querySelector('#tempo');
if(tempo)tempo.addEventListener('input',()=>{document.querySelector('#tempo-value').value=tempo.value;document.querySelector('.beat-dots').style.setProperty('--bpm',tempo.value);});
let config;
try{const response=await fetch(new URL('./site-config.json',import.meta.url));if(!response.ok)throw Error('Configuration unavailable');config=await response.json();}catch{config=null;}
document.querySelector('[data-copy-email]').addEventListener('click',async()=>{const status=document.querySelector('.copy-status');const address=config?.contactEmail??document.querySelector('.footer-links a[href^="mailto:"]').href.slice(7);try{await navigator.clipboard.writeText(address);status.textContent='이메일 주소를 복사했어요.';}catch{status.textContent='이메일 주소를 선택해서 복사해 주세요.';}});
const panel=document.querySelector('[data-download-panel]');
if(panel){
  const status=panel.querySelector('[data-download-status]');
  const tabs=panel.querySelector('.platform-tabs');
  const version=panel.querySelector('[data-version]');
  const name=panel.querySelector('[data-download-name]');
  const meta=panel.querySelector('[data-download-meta]');
  const signing=panel.querySelector('[data-signing]');
  const mobileNote=panel.querySelector('[data-mobile-note]');
  const platform=navigator.userAgentData?.platform??navigator.platform;
  const mobile=/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (/^Mac/i.test(platform)&&navigator.maxTouchPoints>1);
  const desktopPlatform=mobile||/CrOS/i.test(navigator.userAgent)?null:
    /^Win/i.test(platform)?'windows':
    /^Mac/i.test(platform)?'macos':
    /^Linux/i.test(platform)?'linux':null;
  mobileNote.hidden=!!desktopPlatform;

  const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}};
  try{
    const source=new URL(config?.downloadManifest??'download-manifest.json',import.meta.url);
    if(source.origin!==location.origin)throw Error('Download manifest must be served from this site');
    const response=await fetch(source);if(!response.ok)throw Error('Download manifest unavailable');
    const manifest=await response.json();
    if(!Array.isArray(manifest.downloads)||typeof manifest.version!=='string')throw Error('Invalid download manifest');

    const buttons=[...tabs.querySelectorAll('[data-platform]')];
    function selectPlatform(id){
      const item=manifest.downloads.find(download=>download.id===id);
      if(!item)return;
      buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.platform===id)));
      const url=item.available===true&&manifest.releasePublished===true?safeUrl(item.url):null;
      version.textContent=`공개 프리릴리즈 · ${manifest.version}`;
      name.textContent=url?`${item.platform} 다운로드`:`${item.platform} 공개 준비 중`;
      meta.hidden=false;
      meta.textContent=url?`${item.architecture} · ${item.format} · ${item.size}`:'현재 제공하는 설치 파일이 없어요.';
      let link=panel.querySelector('[data-download-link]');
      const tag=url?'a':'button';
      if(link.localName!==tag){
        const replacement=document.createElement(tag);
        replacement.className=link.className;
        replacement.dataset.downloadLink='';
        link.replaceWith(replacement);
        link=replacement;
      }
      if(url){
        link.href=url;
        link.textContent='설치 파일 받기 ↓';
        link.dataset.trackEvent='download_primary';
        link.dataset.trackLocation='studio_primary';
        link.dataset.trackPlatform=id;
        link.dataset.trackFile=item.fileName;
        link.dataset.trackVersion=manifest.version;
      }else{
        link.type='button';
        link.disabled=true;
        link.textContent='아직 준비 중이에요';
      }
      signing.textContent=manifest.signing?.[item.platform]??'';
      signing.hidden=!signing.textContent;
      status.textContent=`${item.platform} 선택 · ${url?'설치 파일을 받을 수 있어요.':'다른 운영체제를 선택해 주세요.'}`;
    }
    buttons.forEach(button=>{
      const id=button.dataset.platform;
      button.disabled=!manifest.downloads.some(download=>download.id===id);
      button.addEventListener('click',()=>selectPlatform(id));
    });
    tabs.hidden=false;
    if(desktopPlatform)selectPlatform(desktopPlatform);
  }catch{
    status.textContent='다운로드 정보를 불러오지 못했어요. 표시된 프리릴리즈 파일은 운영체제별 목록에서 받을 수 있어요.';
  }
}
