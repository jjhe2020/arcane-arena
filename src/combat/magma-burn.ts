import type {BattleState,CombatUnit} from '../model';
import type {EffectContext,EffectStatus} from '../skill-effects';

export interface MagmaValues {damagePerSecond:number;slow:number;interval:number;linger:number}
interface Burn {id:number;c:EffectContext;target:CombatUnit;values:MagmaValues;until:number;next:number;cancelled:boolean}
const states=new WeakMap<BattleState,Map<string,Burn>>(),sequences=new WeakMap<BattleState,number>();
const list=(b:BattleState)=>{let m=states.get(b);if(!m){m=new Map;states.set(b,m);}return m;};
/** The three authored magma abilities share one first-provider debuff. An aura
 * refresh extends its tail without replacing damage, phase or attribution. */
export function applyMagmaBurn(c:EffectContext,target:CombatUnit,values:MagmaValues):void{
 if(target.dead||target.statuses.some(s=>['magicImmune','invulnerable','banished'].includes(s.kind)))return;
 const map=list(c.battle),old=map.get(target.id),continuing=old&&!old.cancelled&&old.until>=c.battle.time-1e-8;
 const run:Burn=continuing?old:{id:(sequences.get(c.battle)??0)+1,c,target,values:{...values},until:0,next:c.battle.time,cancelled:false};
 if(!continuing){sequences.set(c.battle,run.id);map.set(target.id,run);}
 const origin=run.c,data={magmaId:run.id};origin.status(target,'magmaBurn',values.linger,0,{harmful:true,removeOnDeath:true,dispel:'basic',data});
 const marker=(target.statuses as EffectStatus[]).find(s=>s.kind==='magmaBurn'&&s.data?.magmaId===run.id);if(!marker){map.delete(target.id);return;}run.until=marker.until;
 origin.status(target,'slow',Math.max(1e-6,run.until-c.battle.time),run.values.slow,{harmful:true,removeOnDeath:true,dispel:'basic',ignoreStatusResistance:true,data});
 if(continuing)return;
 const tick=()=>{if(run.cancelled||target.dead||map.get(target.id)!==run||c.battle.time>run.until+1e-8){if(map.get(target.id)===run)map.delete(target.id);run.cancelled=true;return;}
  if(target.statuses.some(s=>['magicImmune','invulnerable','banished'].includes(s.kind))){run.cancelled=true;map.delete(target.id);return;}
  origin.damage(target,run.values.damagePerSecond*run.values.interval,'magical',false,{flags:{damageOverTime:true}});run.next+=Math.max(1/30,run.values.interval);
  if(run.next<=run.until+1e-8)origin.delay(Math.max(0,run.next-c.battle.time),tick);else origin.delay(Math.max(0,run.next-c.battle.time),()=>{if(run.cancelled||map.get(target.id)!==run)return;if(c.battle.time<=run.until+1e-8)tick();else map.delete(target.id);});
 };tick();
}
export function magmaStatusRemoved(c:EffectContext,status:EffectStatus,reason:'dispel'|'expire'):void{
 if(reason!=='dispel'||status.kind!=='magmaBurn')return;const map=list(c.battle),run=map.get(c.target.id);if(!run||run.id!==status.data?.magmaId)return;run.cancelled=true;map.delete(c.target.id);
 c.target.statuses=(c.target.statuses as EffectStatus[]).filter(s=>s.data?.magmaId!==run.id);
}
