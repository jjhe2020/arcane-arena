import type {AbilityStats,DamageAmounts,UnitStats} from '../model';
import {BASIC_ATTACK_ID,DAMAGE_NAMES,groupAbilityStats} from './statistics';
export type StatisticsMetric='damage'|'taken'|'healing'|'absorbed';
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const amount=(value:number)=>Math.round(value).toLocaleString('zh-CN');
export const statisticValue=(row:UnitStats|AbilityStats,metric:StatisticsMetric)=>row[metric]??0;
export function abilityLabel(id:string,names:Map<string,string>):string{return id===BASIC_ATTACK_ID?'普通攻击':names.get(id)??({lifesteal:'攻击吸血',spell_lifesteal:'法术吸血',regeneration:'生命恢复'}[id]??id);}
export function damageBreakdown(types:DamageAmounts):string{return(['physical','magical','pure'] as const).filter(type=>types[type]>0).map(type=>`<span class="damage-${type}">${DAMAGE_NAMES[type]} ${amount(types[type])}</span>`).join('');}
function leavesHTML(rows:AbilityStats[],metric:StatisticsMetric,names:Map<string,string>):string{
 return rows.filter(row=>statisticValue(row,metric)>0).sort((a,b)=>statisticValue(b,metric)-statisticValue(a,metric)||a.key.localeCompare(b.key)).map(row=>`<div class="ability-stat-leaf"><div><span>${escape(abilityLabel(row.abilityId,names))}</span><b class="${metric==='healing'?'healing-value':''}">${amount(statisticValue(row,metric))}</b></div><small>${metric==='taken'||metric==='absorbed'?'来源':'单位'}：${escape(row.sourceName)}</small>${metric==='healing'||metric==='absorbed'?'':`<div class="damage-breakdown">${damageBreakdown(metric==='damage'?row.damageTypes:row.takenTypes)}</div>`}</div>`).join('');
}
export function unitStatisticsDetails(row:UnitStats,metric:StatisticsMetric,names:Map<string,string>,openKeys:Set<string>=new Set()):string{
 const groups=groupAbilityStats(row.abilityStats??[]).filter(group=>group[metric]>0).sort((a,b)=>b[metric]-a[metric]||a.abilityId.localeCompare(b.abilityId));
 let html=groups.map(group=>{const key=`ability:${row.id}:${metric}:${group.abilityId}`;return`<details class="ability-stat" data-stat-key="${escape(key)}" ${openKeys.has(key)?'open':''}><summary><span class="ability-stat-heading"><span>${escape(abilityLabel(group.abilityId,names))}</span><b class="${metric==='healing'?'healing-value':''}">${amount(group[metric])}</b></span>${metric==='healing'||metric==='absorbed'?'':`<span class="damage-breakdown">${damageBreakdown(metric==='damage'?group.damageTypes:group.takenTypes)}</span>`}</summary><div class="ability-stat-leaves">${leavesHTML(group.children,metric,names)}</div></details>`;}).join('');
 if(!groups.length)html='<p class="stats-empty">'+(statisticValue(row,metric)>0?'旧版记录没有技能明细。':'暂无有效'+(metric==='damage'?'伤害':metric==='taken'?'承伤':metric==='absorbed'?'吸收':'治疗')+'。')+'</p>';
 if(metric==='taken'){const summons=(row.summons??[]).filter(unit=>unit.taken>0),key=`summons:${row.id}:taken`;if(summons.length)html+=`<details class="summon-statistics" data-stat-key="${escape(key)}" ${openKeys.has(key)?'open':''}><summary>召唤物承伤 <b>${amount(summons.reduce((sum,unit)=>sum+unit.taken,0))}</b></summary><small>独立于英雄本体承伤</small>${summons.map(unit=>`<section><h5>${escape(unit.name)}</h5>${leavesHTML(unit.abilityStats??[],metric,names)}</section>`).join('')}</details>`;}
 return html;
}
