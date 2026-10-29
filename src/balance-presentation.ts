import type {SkillDefinition} from './model';
import {skillBalance} from './config';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const number=(value:number)=>Number.isFinite(value)?Number(value.toFixed(4)).toLocaleString('zh-CN',{maximumFractionDigits:4}):'—';
/** Runtime values, including upgraded ranks, are the player-facing authority. */
export function skillBalanceHTML(definition:SkillDefinition):string{
 const native=definition.balanceDomain==='native',tiers=native?Object.keys((definition.balanceLevels??{}) as object).map(Number).sort((a,b)=>a-b):[1,2,3,6,9];
 const rows=tiers.map(tier=>({tier,balance:skillBalance(definition,tier)})).filter(row=>row.balance);if(!rows.length)return '';
 const labels=(definition.balanceParamLabels??{}) as Record<string,string>,keys=[...new Set(rows.flatMap(row=>Object.keys(row.balance!.params)))];
 const timing=`<div class="skill-balance-table"><table><caption>各等级参数 · 时间：秒，距离：Dota单位</caption><thead><tr><th>${native?'等级':'点数'}</th><th>施法前摇</th><th>后摇</th><th>冷却</th><th>魔耗</th><th>施法距离</th></tr></thead><tbody>${rows.map(({tier,balance:b})=>`<tr><th>${tier}</th><td>${number(b!.castPoint)}</td><td>${number(b!.backswing)}</td><td>${number(b!.cooldown)}</td><td>${number(b!.mana)}</td><td>${number(b!.range*100)}</td></tr>`).join('')}</tbody></table></div>`;
 const parameters=keys.length?`<div class="skill-balance-table"><table><caption>当前有效技能数值</caption><thead><tr><th>属性</th>${rows.map(row=>`<th>${row.tier}${native?'级':'点'}</th>`).join('')}</tr></thead><tbody>${keys.map(key=>`<tr><th>${escape(labels[key]??key)}</th>${rows.map(row=>`<td>${row.balance!.params[key]===undefined?'—':number(row.balance!.params[key])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`:'';
 return timing+parameters;
}
