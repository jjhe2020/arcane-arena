import {patchUnitBuffs as patchButtons,buffDetailsHTML} from './buffs-ui';
import type {UnitBuffView} from './buffs';
const models=new WeakMap<HTMLElement,{buff:UnitBuffView;time:number}>();
let installed=false,anchor:HTMLElement|null=null,tooltip:HTMLElement|null=null,pinned=false,raf=0;
function hide(){anchor?.removeAttribute('aria-describedby');anchor=null;tooltip?.remove();tooltip=null;pinned=false;cancelAnimationFrame(raf);}
function position(){if(!anchor?.isConnected||!tooltip){hide();return;}const a=anchor.getBoundingClientRect(),t=tooltip.getBoundingClientRect();tooltip.style.left=`${Math.max(8,Math.min(innerWidth-t.width-8,a.left+a.width/2-t.width/2))}px`;tooltip.style.top=`${Math.max(8,Math.min(innerHeight-t.height-8,a.top>=t.height+12?a.top-t.height-8:a.bottom+8))}px`;}
function watch(){if(!anchor?.isConnected){hide();return;}raf=requestAnimationFrame(watch);}
function show(button:HTMLElement){const model=models.get(button);if(!model)return;hide();anchor=button;tooltip=document.createElement('div');tooltip.id='unitBuffTooltip';tooltip.className='buff-tooltip';tooltip.setAttribute('role','tooltip');tooltip.innerHTML=buffDetailsHTML(model.buff,model.time);document.body.append(tooltip);button.setAttribute('aria-describedby',tooltip.id);position();raf=requestAnimationFrame(watch);}
export function patchUnitBuffs(container:HTMLElement,buffs:readonly UnitBuffView[],time=0){
  patchButtons(container,buffs,time);const byKey=new Map(buffs.map(buff=>[buff.key,buff]));
  for(const button of container.querySelectorAll<HTMLElement>('[data-buff-key]')){const buff=byKey.get(button.dataset.buffKey!);if(buff)models.set(button,{buff,time});}
  if(anchor&&container.contains(anchor)&&tooltip){const model=models.get(anchor);if(model){tooltip.innerHTML=buffDetailsHTML(model.buff,model.time);position();}}
  if(anchor&&!anchor.isConnected)hide();
}
export function initializeBuffTooltips(){
  if(installed)return;installed=true;
  document.addEventListener('pointerover',event=>{if(event.pointerType!=='mouse')return;const button=(event.target as HTMLElement).closest<HTMLElement>('[data-buff-key]');if(button&&button!==anchor)show(button);});
  document.addEventListener('pointerout',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-buff-key]');if(button===anchor&&!pinned&&!button?.contains(event.relatedTarget as Node|null))hide();});
  document.addEventListener('focusin',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-buff-key]');if(button)show(button);});
  document.addEventListener('focusout',event=>{if((event.target as HTMLElement).closest('[data-buff-key]')===anchor&&!pinned)hide();});
  document.addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLElement>('[data-buff-key]');if(button){if(button===anchor&&pinned)hide();else{show(button);pinned=true;}}else hide();});
  window.addEventListener('resize',position);document.addEventListener('scroll',position,true);
}
