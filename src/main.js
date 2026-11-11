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
  const safeUrl=value=>{try{const url=new URL(value);return url.protocol==='https:'?url.href:null;}catch{return null;}};
  try{
    const source=new URL(config?.downloadManifest??'download-manifest.json',import.meta.url);
    if(source.origin!==location.origin)throw Error('Download manifest must be served from this site');
    const response=await fetch(source);if(!response.ok)throw Error('Download manifest unavailable');const manifest=await response.json();
    if(!Array.isArray(manifest.downloads)||typeof manifest.version!=='string')throw Error('Invalid download manifest');
    const releaseUrl=safeUrl(manifest.releaseUrl);const checksumUrl=safeUrl(manifest.checksumsUrl);
    const releaseLink=panel.querySelector('[data-release-link]');const checksumLink=panel.querySelector('[data-checksum-link]');
    if(releaseUrl)releaseLink.href=releaseUrl;else releaseLink.hidden=true;
    if(checksumUrl)checksumLink.href=checksumUrl;else checksumLink.hidden=true;
    function selectPlatform(id){
      const item=manifest.downloads.find(download=>download.id===id);if(!item)return;
      panel.querySelectorAll('[data-platform]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.platform===id)));
      const available=item.available===true&&manifest.releasePublished===true&&safeUrl(item.url);
      panel.querySelector('[data-version]').textContent=`기존 공개 빌드 · ${manifest.version}`;
      panel.querySelector('[data-download-name]').textContent=available?`${item.platform} 다운로드`:`${item.platform} 공개 준비 중`;
      panel.querySelector('[data-download-meta]').textContent=available?`${item.architecture} · ${item.format} · ${item.size}`:'현재 제공하는 설치 파일이 없어요.';
      let link=panel.querySelector('[data-download-link]');
      // Use a real disabled button when an installer is unavailable, never an empty link.
      if(available){if(link.tagName!=='A'){const anchor=document.createElement('a');anchor.className=link.className;anchor.dataset.downloadLink='';link.replaceWith(anchor);link=anchor;}link.removeAttribute('aria-disabled');link.href=safeUrl(item.url);link.textContent='설치 파일 받기 ↓';}
      else{if(link.tagName!=='BUTTON'){const button=document.createElement('button');button.className=link.className;button.dataset.downloadLink='';button.type='button';link.replaceWith(button);link=button;}link.disabled=true;link.textContent='아직 준비 중이에요';}
      panel.querySelector('[data-signing]').textContent=manifest.signing?.[item.platform]??'';
      status.textContent=`${item.platform} 선택 · ${available?'설치 파일을 받을 수 있어요.':'다른 운영체제를 선택해 주세요.'}`;
    }
    panel.querySelectorAll('[data-platform]').forEach(button=>{button.addEventListener('click',()=>selectPlatform(button.dataset.platform));button.disabled=false;});
    const ua=navigator.userAgentData?.platform??navigator.platform??'';
    const initial=/Win/i.test(ua)?'windows':/Linux/i.test(ua)&&!/Android/i.test(navigator.userAgent)?'linux':'macos';
    selectPlatform(initial);
    panel.querySelector('[data-mobile-note]').hidden=!/iPhone|iPad|Android/i.test(navigator.userAgent);
  }catch{
    // Fail closed: a stale fallback must not masquerade as a checked current installer.
    const link=panel.querySelector('[data-download-link]');const button=document.createElement('button');button.type='button';button.disabled=true;button.className=link.className;button.dataset.downloadLink='';button.textContent='배포 정보를 확인해 주세요';link.replaceWith(button);status.textContent='다운로드 정보를 불러오지 못했어요. 배포 기록에서 설치 파일을 확인해 주세요.';
  }
}
