import './buffs.css';
import {buffRemainingFraction,type UnitBuffView} from './buffs';
const esc=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function buffDetailsHTML(buff:UnitBuffView,time=0):string {
 const duration=buff.lifecycle==='permanent'?`永久${buff.persistsAcrossRounds?' · 跨回合保留':''}`:buff.lifecycle==='aura'?'持续效果 · 生效期间保持':`剩余 ${Math.max(0,(buff.expiresAt??time)-time).toFixed(1)} 秒`;
 return`${buff.icon?`<img src="${esc(buff.icon)}" alt="">`:''}<strong>${esc(buff.name)}</strong><small>${buff.polarity==='negative'?'负面效果':'正面效果'} · ${duration}${buff.stacks>1?` · ${esc(buff.stacks)} 层/次`:''}</small><ul>${buff.effects.map(e=>`<li>${esc(e)}</li>`).join('')}</ul>${buff.description?`<p>${esc(buff.description)}</p>`:''}${buff.sourceName?`<p>来源：${esc(buff.sourceName)}</p>`:''}${buff.unknown?'<p>此状态尚未收录专用说明，当前显示实际来源。</p>':''}`;
}
function buttonHTML(buff:UnitBuffView,time:number):string {
 return`<button type="button" class="unit-buff ${buff.polarity}" data-buff-key="${esc(buff.key)}" aria-label="${esc(buff.name)}${buff.stacks>1?`，${buff.stacks}层/次`:''}" style="--buff-elapsed:${(1-buffRemainingFraction(buff,time))*360}deg">${buff.icon?`<img src="${esc(buff.icon)}" alt="" loading="lazy">`:`<span class="buff-letter">${esc(buff.name.slice(0,1))}</span>`}<b class="buff-count" ${buff.stacks>1?'':'hidden'}>${buff.stacks>1?esc(buff.stacks):''}</b></button>`;
}
export function unitBuffsHTML(buffs:readonly UnitBuffView[],time=0):string {
 return`<section class="unit-buffs" aria-label="状态效果">${buffs.length?buffs.map(b=>buttonHTML(b,time)).join(''):'<span class="buffs-empty">暂无状态效果</span>'}</section>`;
}
/** Keeps hovered/focused buttons alive while health, time and counters refresh. */
export function patchUnitBuffs(container:HTMLElement,buffs:readonly UnitBuffView[],time=0):void {
 const existing=new Map([...container.querySelectorAll<HTMLButtonElement>('[data-buff-key]')].map(el=>[el.dataset.buffKey!,el]));
 const keep=new Set(buffs.map(b=>b.key));for(const[key,el]of existing)if(!keep.has(key))el.remove();
 container.querySelector('.buffs-empty')?.remove();
 for(const buff of buffs){let button=existing.get(buff.key);if(!button){const template=document.createElement('template');template.innerHTML=buttonHTML(buff,time);button=template.content.firstElementChild as HTMLButtonElement;container.append(button);}button.className=`unit-buff ${buff.polarity}`;button.style.setProperty('--buff-elapsed',`${(1-buffRemainingFraction(buff,time))*360}deg`);button.setAttribute('aria-label',`${buff.name}${buff.stacks>1?`，${buff.stacks}层/次`:''}`);const count=button.querySelector<HTMLElement>('.buff-count')!;count.hidden=buff.stacks<=1;count.textContent=buff.stacks>1?String(buff.stacks):'';}
 if(!buffs.length){const empty=document.createElement('span');empty.className='buffs-empty';empty.textContent='暂无状态效果';container.append(empty);}
}
