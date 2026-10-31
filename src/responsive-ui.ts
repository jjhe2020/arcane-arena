import {UI_CONFIG} from './global-config';

/** Applies sizing to controls only. Canvas coordinates and browser zoom remain
 * untouched, so pointer picking continues to use the renderer's real bounds. */
export function updateResponsiveLayout(formation:boolean):void {
 const root=document.querySelector<HTMLElement>('#game');if(!root)return;
 const width=window.innerWidth,height=window.innerHeight;
 const tablet=formation&&width>=UI_CONFIG.tabletMinimumWidth&&height>=UI_CONFIG.tabletMinimumHeight&&width/Math.max(1,height)<=UI_CONFIG.tabletMaximumAspectRatio;
 root.dataset.tabletShop=String(tablet);root.dataset.formation=String(formation);
 const scale=Math.max(UI_CONFIG.minimumTextScale,Math.min(1,width/UI_CONFIG.referenceViewportWidth,height/UI_CONFIG.referenceViewportHeight));
 root.style.setProperty('--ui-text-scale',String(scale));
 root.style.setProperty('--tablet-touch-target',UI_CONFIG.tabletTouchTarget+'px');
 root.style.setProperty('--tablet-shop-columns',String(UI_CONFIG.tabletShopColumns));
 root.style.setProperty('--buff-detail-icon-size',UI_CONFIG.buffDetailIconSize+'px');
 requestAnimationFrame(()=>fitShopNames(root));
}

function fitShopNames(root:HTMLElement):void {
 const canvas=document.createElement('canvas'),context=canvas.getContext('2d');if(!context)return;
 for(const name of root.querySelectorAll<HTMLElement>('#shopGrid .skill-name')){
  const style=getComputedStyle(name),available=Math.max(1,name.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight));
  const standard=UI_CONFIG.shopNameFontSize;
  context.font=`${style.fontWeight} ${standard}px ${style.fontFamily}`;
  const natural=context.measureText(name.textContent??'').width;
  const fitted=Math.min(standard,standard*available/Math.max(1,natural));
  // Fit the complete name, including the longest translated labels. Small
  // screens receive larger cards or scrolling before a tiny font is needed.
  name.style.setProperty('font-size',Math.max(UI_CONFIG.shopNameMinimumFontSize,fitted)+'px','important');
  name.title=name.textContent??'';
 }
}
