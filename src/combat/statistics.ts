import type {AbilityStats,Attribution,BattleState,CombatUnit,DamageAmounts,DamageFlags,DamageType,UnitStats} from '../model';

export const BASIC_ATTACK_ID='basic_attack';
export const DAMAGE_COLORS:Record<DamageType|'healing',string>={physical:'#fff0ce',magical:'#78b9ff',pure:'#ffd36a',healing:'#8fe5ae'};
export const DAMAGE_NAMES:Record<DamageType,string>={physical:'物理',magical:'魔法',pure:'纯粹'};
const amounts=():DamageAmounts=>({physical:0,magical:0,pure:0});
const positive=(amount:number)=>Number.isFinite(amount)?Math.max(0,amount):0;
export function creditedUnit(b:BattleState,unit:CombatUnit):CombatUnit{return unit.owner?b.units.find(u=>u.id===unit.owner)??unit:unit;}

/** Summon and child identities remain on leaves; root rows are display-only sums. */
export function resolveAttribution(b:BattleState,source:CombatUnit,input:Partial<Attribution>={}):Attribution{
 const abilityId=input.abilityId??BASIC_ATTACK_ID,owner=creditedUnit(b,source);
 const runtime=source.skills.find(skill=>skill?.id===abilityId&&(!input.skillInstanceId||skill.instanceId===input.skillInstanceId)) as ({statParentId?:string;statRootId?:string;instanceId?:string}|null|undefined);
 const summonAbilityId=input.summonAbilityId??(source.summoned?String(source.statSummonRootId??source.sourceSkill??BASIC_ATTACK_ID):undefined);
 return{...input,abilityId,rootAbilityId:summonAbilityId??input.rootAbilityId??runtime?.statRootId??input.parentAbilityId??runtime?.statParentId??abilityId,parentAbilityId:input.parentAbilityId??runtime?.statParentId,skillInstanceId:input.skillInstanceId??runtime?.instanceId,sourceUnitId:input.sourceUnitId??source.id,ownerUnitId:input.ownerUnitId??owner.id,sourceName:input.sourceName??source.name,...(summonAbilityId?{summonAbilityId}:{})};
}
function line(unit:CombatUnit,a:Attribution):AbilityStats{
 const rootAbilityId=a.rootAbilityId??a.abilityId,key=JSON.stringify([rootAbilityId,a.abilityId,a.sourceUnitId??'',a.skillInstanceId??'']);
 const rows=unit.abilityStats??(unit.abilityStats=[]);let row=rows.find(r=>r.key===key);
 if(!row){row={key,abilityId:a.abilityId,rootAbilityId,sourceUnitId:a.sourceUnitId??unit.id,sourceName:a.sourceName??unit.name,damage:0,taken:0,healing:0,absorbed:0,damageTypes:amounts(),takenTypes:amounts()};rows.push(row);}return row;
}
/** Call only after mitigation, shielding, delay, and overkill have resolved. */
export function recordDamage(b:BattleState,source:CombatUnit,target:CombatUnit,actual:number,type:DamageType,input:Partial<Attribution>={},_flags:DamageFlags={}):Attribution{
 const a=resolveAttribution(b,source,input),value=positive(actual);if(!value)return a;
 target.taken+=value;const received=line(target,a);received.taken+=value;received.takenTypes[type]+=value;
 if(source.side!==target.side){const owner=b.units.find(u=>u.id===a.ownerUnitId)??creditedUnit(b,source);owner.damage+=value;const dealt=line(owner,a);dealt.damage+=value;dealt.damageTypes[type]+=value;}return a;
}
/** Effective healing is supplied by the engine; this never changes HP. */
export function recordHealing(b:BattleState,source:CombatUnit,_target:CombatUnit,actual:number,input:Partial<Attribution>={}):Attribution{
 const a=resolveAttribution(b,source,input),value=positive(actual);if(!value)return a;
 const owner=b.units.find(u=>u.id===a.ownerUnitId)??creditedUnit(b,source);owner.healing+=value;line(owner,a).healing+=value;return a;
}
/** Absorption belongs to the protected body, attributed to its shield provider. */
export function recordAbsorption(b:BattleState,source:CombatUnit,target:CombatUnit,actual:number,input:Partial<Attribution>={}):Attribution{
 const a=resolveAttribution(b,source,input),value=positive(actual);if(!value)return a;target.absorbed=(target.absorbed??0)+value;const row=line(target,a);row.absorbed=(row.absorbed??0)+value;return a;
}
/** Split a single effective result without rounding or multiplying its total. */
export function distributeEffective(total:number,contributions:number[]):number[]{
 const weights=contributions.map(positive),sum=weights.reduce((a,v)=>a+v,0);if(sum<=0)return weights.map(()=>0);
 let rest=positive(total),last=-1;weights.forEach((value,index)=>{if(value>0)last=index;});return weights.map((weight,index)=>{const value=index===last?rest:Math.min(rest,positive(total)*weight/sum);rest-=value;return value;});
}
function snapshot(unit:CombatUnit):UnitStats{return{id:unit.id,name:unit.name,side:unit.side,damage:unit.damage,taken:unit.taken,healing:unit.healing,absorbed:unit.absorbed??0,abilityStats:structuredClone(unit.abilityStats??[])};}
export function snapshotBattleStats(b:BattleState):UnitStats[]{return b.units.filter(u=>!u.summoned).map(unit=>({...snapshot(unit),summons:b.units.filter(u=>u.summoned&&u.owner===unit.id).map(snapshot)}));}
export function validateUnitStatistics(value:unknown):boolean{
 if(!value||typeof value!=='object')return false;const unit=value as UnitStats;
 const finite=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
 const close=(a:number,b:number)=>Math.abs(a-b)<=1e-7*Math.max(1,a,b);
 if(typeof unit.id!=='string'||typeof unit.name!=='string'||!Number.isInteger(unit.side)||!finite(unit.damage)||!finite(unit.taken)||!finite(unit.healing)||(unit.absorbed!==undefined&&!finite(unit.absorbed)))return false;
 if(unit.abilityStats!==undefined){if(!Array.isArray(unit.abilityStats)||unit.abilityStats.length>20000)return false;const keys=new Set<string>();
  for(const row of unit.abilityStats){if(!row||['key','abilityId','rootAbilityId','sourceUnitId','sourceName'].some(key=>typeof row[key as keyof AbilityStats]!=='string')||keys.has(row.key)||!finite(row.damage)||!finite(row.taken)||!finite(row.healing)||(row.absorbed!==undefined&&!finite(row.absorbed)))return false;keys.add(row.key);
   for(const field of ['damageTypes','takenTypes'] as const){if(!row[field]||(['physical','magical','pure'] as const).some(type=>!finite(row[field][type])))return false;const sum=row[field].physical+row[field].magical+row[field].pure;if(!close(sum,field==='damageTypes'?row.damage:row.taken))return false;}
  }
  for(const metric of ['damage','taken','healing'] as const)if(!close(unit.abilityStats.reduce((n,row)=>n+row[metric],0),unit[metric]))return false;
  if(!close(unit.abilityStats.reduce((n,row)=>n+(row.absorbed??0),0),unit.absorbed??0))return false;
 }
 if(unit.summons!==undefined&&(!Array.isArray(unit.summons)||unit.summons.length>10000||unit.summons.some(summon=>!summon||typeof summon!=='object'||summon.summons!==undefined||!validateUnitStatistics(summon))))return false;
 return true;
}

export interface AbilityGroup {abilityId:string;damage:number;taken:number;healing:number;absorbed:number;damageTypes:DamageAmounts;takenTypes:DamageAmounts;children:AbilityStats[]}
export function groupAbilityStats(rows:AbilityStats[]):AbilityGroup[]{
 const result=new Map<string,AbilityGroup>();for(const row of rows){let group=result.get(row.rootAbilityId);if(!group){group={abilityId:row.rootAbilityId,damage:0,taken:0,healing:0,absorbed:0,damageTypes:amounts(),takenTypes:amounts(),children:[]};result.set(row.rootAbilityId,group);}group.damage+=row.damage;group.taken+=row.taken;group.healing+=row.healing;group.absorbed+=row.absorbed??0;for(const type of ['physical','magical','pure'] as const){group.damageTypes[type]+=row.damageTypes[type];group.takenTypes[type]+=row.takenTypes[type];}group.children.push(row);}return[...result.values()];
}
