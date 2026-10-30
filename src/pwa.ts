/// <reference types="vite/client" />
import './pwa.css';

type OfflineStatus={state:'idle'|'downloading'|'ready'|'error';completed:number;total:number;bytes:number;totalBytes:number;version:string;error?:string};
type InstallPrompt=Event&{prompt:()=>Promise<void>;userChoice:Promise<{outcome:string}>};
const size=(bytes:number)=>`${(bytes/1024/1024).toFixed(1)} MB`;

/** Offline downloads are explicit: all skins, skills, scenes and mobile variants. */
export function initializePwa():void{
 let registration:ServiceWorkerRegistration|undefined,installPrompt:InstallPrompt|undefined,updateRequested=false;
 let available=false,problem='',status:OfflineStatus={state:'idle',completed:0,total:0,bytes:0,totalBytes:0,version:''};
 const buttons:HTMLButtonElement[]=[];
 const panel=document.createElement('dialog');panel.id='offlineDialog';panel.className='offline-dialog';panel.setAttribute('aria-labelledby','offlineTitle');
 panel.innerHTML='<header><h2 id="offlineTitle">安装与离线游玩</h2><button data-offline-close aria-label="关闭离线面板">×</button></header><p id="offlineStatus" role="status" aria-live="polite"></p><progress id="offlineProgress" max="1" value="0" aria-label="离线资源下载进度"></progress><p id="offlineSize" class="offline-detail"></p><p class="offline-help">首次联网时，点击下方按钮下载全部角色、技能和场景。显示“离线就绪”后，即可断网启动、继续存档或新开对局。下载中请保持游戏打开，失败后可继续下载。</p><div class="offline-actions"><button data-action="downloadOffline">下载离线资源</button><button data-action="installPwa">添加到主屏幕</button><button data-action="updatePwa" hidden>更新并重新打开</button></div><p id="offlineInstallHelp" class="offline-help">Android：浏览器菜单 → 安装应用 / 添加到主屏幕。iPhone / iPad：Safari 分享 → 添加到主屏幕；请从主屏幕图标打开后下载资源。安装后横屏游玩，可获得更大的显示空间。</p><p class="offline-detail">请用普通浏览模式或已安装应用下载；隐私模式关闭后不会保留资源。存档保存在当前浏览器或安装后的应用中。请在常用入口完成下载；清除网站数据会同时移除离线资源与存档。浏览器可能在空间不足时回收缓存。</p>';
 document.body.append(panel);
 const downloadButton=panel.querySelector<HTMLButtonElement>('[data-action=downloadOffline]')!;
 const installButton=panel.querySelector<HTMLButtonElement>('[data-action=installPwa]')!;
 const updateButton=panel.querySelector<HTMLButtonElement>('[data-action=updatePwa]')!;
 const standalone=()=>matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||Boolean((navigator as Navigator&{standalone?:boolean}).standalone);
 function render(){
  document.documentElement.dataset.offlineState=status.state;
  const percent=status.total?Math.floor(status.completed/status.total*100):0;
  for(const button of buttons){button.textContent=status.state==='ready'?'✓ 可离线':status.state==='downloading'?`离线 ${percent}%`:'↓ 离线';button.setAttribute('aria-label',status.state==='ready'?'离线资源已就绪，打开安装与离线面板':'打开安装与离线面板');}
  const text=problem||(!available?'正在准备离线功能…':status.state==='ready'?'离线就绪 · 全部游戏资源已保存':status.state==='downloading'?`正在下载 ${percent}% · ${status.completed} / ${status.total}`:status.state==='error'?`下载未完成：${status.error||'请检查网络或可用空间后重试。'}`:'尚未完成离线下载');
  panel.querySelector('#offlineStatus')!.textContent=text;
  const progress=panel.querySelector<HTMLProgressElement>('#offlineProgress')!;progress.max=status.total||1;progress.value=status.completed;progress.hidden=!available;
  panel.querySelector('#offlineSize')!.textContent=status.total?`${size(status.bytes)} / ${size(status.totalBytes)} · ${status.total} 个资源。建议使用 Wi-Fi，并预留足够存储空间。`:'';
  downloadButton.disabled=!available||status.state==='downloading';downloadButton.textContent=status.state==='ready'?'检查离线资源':status.state==='error'||status.completed>0?'继续下载离线资源':'下载离线资源';
  installButton.hidden=standalone();installButton.textContent=installPrompt?'安装到主屏幕':'查看安装方法';
  updateButton.hidden=!registration?.waiting;
 }
 async function refresh(){
  const worker=navigator.serviceWorker.controller||registration?.active;if(!worker)return;
  const channel=new MessageChannel();
  channel.port1.onmessage=event=>{status=event.data;render();channel.port1.close();};
  worker.postMessage({type:'OFFLINE_STATUS'},[channel.port2]);
 }
 for(const container of document.querySelectorAll('.rail-global-tools,.mobile-nav,.cinema-tools,.orientation')){
  const button=document.createElement('button');button.dataset.action='offline';button.className='offline-toggle';button.addEventListener('click',()=>{render();panel.showModal();void refresh();});container.append(button);buttons.push(button);
 }
 panel.querySelector('[data-offline-close]')!.addEventListener('click',()=>panel.close());
 panel.addEventListener('click',async event=>{
  const action=(event.target as HTMLElement).closest<HTMLElement>('[data-action]')?.dataset.action;
  if(action==='downloadOffline'){
   try{
    // Request persistent storage from a user gesture; denial does not prevent caching.
    void navigator.storage?.persist?.().catch(()=>false);
    const worker=navigator.serviceWorker.controller||registration?.active;
    if(!worker)throw Error('离线服务还未就绪，请稍后重试。');
    status={...status,state:'downloading',error:undefined};render();worker.postMessage({type:'DOWNLOAD_OFFLINE'});
   }catch(error){status={...status,state:'error',error:String(error instanceof Error?error.message:error)};render();}
  }
  if(action==='installPwa'){
   if(installPrompt){const prompt=installPrompt;installPrompt=undefined;try{await prompt.prompt();await prompt.userChoice;}catch{}render();}
   else{panel.querySelector('#offlineInstallHelp')!.classList.add('offline-highlight');panel.querySelector('#offlineInstallHelp')!.scrollIntoView({block:'nearest'});}
  }
  if(action==='updatePwa'&&registration?.waiting){updateRequested=true;registration.waiting.postMessage({type:'SKIP_WAITING'});}
 });
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event as InstallPrompt;render();});
 window.addEventListener('appinstalled',()=>{installPrompt=undefined;render();});
 window.addEventListener('online',()=>{void refresh();});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden&&available)void refresh();});
 render();
 if(!import.meta.env.PROD){problem='离线功能在生产版本中启用；开发模式可正常联网游玩。';render();return;}
 if(!window.isSecureContext||!('serviceWorker' in navigator)){
  problem='当前地址不支持离线安装。请通过 HTTPS 站点打开游戏；电脑本机也可使用 localhost。手机通过普通 HTTP 局域网地址访问时仅支持联网游玩。';render();return;
 }
 navigator.serviceWorker.addEventListener('message',event=>{if(event.data?.type==='OFFLINE_PROGRESS'){status=event.data;render();}});
 navigator.serviceWorker.addEventListener('controllerchange',()=>{if(updateRequested){location.reload();return;}void refresh();});
 void (async()=>{
  try{
   registration=await navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'});
   const observe=()=>{
    const worker=registration?.installing;
    worker?.addEventListener('statechange',()=>{
     if(worker.state==='redundant'&&!available)problem='离线启动资源下载失败。可继续联网游玩；请检查网络后重新打开游戏。';
     render();
    });render();
   };
   registration.addEventListener('updatefound',observe);observe();
   await navigator.serviceWorker.ready;available=true;problem='';render();await refresh();
  }catch(error){problem=`离线功能暂不可用：${error instanceof Error?error.message:String(error)}。可继续联网游玩，请稍后重新打开游戏。`;render();}
 })();
}
