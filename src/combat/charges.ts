import type {EffectContext as C,SkillProgram} from '../skill-effects';
export function charged(program:SkillProgram,unlock:(c:C)=>boolean,maximum:number|((c:C)=>number),rechargeOverride?:(c:C)=>number){
  const original=program.cast!,canCast=program.canCast,normalCd=program.cooldown??((c:C)=>Math.max(.2,c.definition.cooldowns[Math.min(c.definition.cooldowns.length-1,c.skill.points>=3?2:c.skill.points>=2?1:0)]??0));
  interface Charges {count:number;next:number|null;queue:number[];generation:number}
  const capacity=(c:C)=>Math.max(1,Math.floor(typeof maximum==='function'?maximum(c):maximum));
  const refresh=(c:C,s:Charges)=>{while(s.queue.length&&s.queue[0]<=c.battle.time+1e-8){s.queue.shift();s.count=Math.min(capacity(c),s.count+1);}s.next=s.queue.at(-1)??null;};
  const state=(c:C):Charges=>{const key=`mainCharges:${c.skill.id}`;let s=c.caster[key] as Charges|undefined;if(!s)s=c.caster[key]={count:capacity(c),next:null,queue:[],generation:0};refresh(c,s);return s;};
  const schedule=(c:C,s:Charges)=>{const generation=++s.generation,due=s.queue[0];if(due===undefined)return;c.delay(Math.max(0,due-c.battle.time),()=>{if(s.generation!==generation)return;refresh(c,s);schedule(c,s);});};
  program.canCast=c=>(!unlock(c)||state(c).count>0)&&(!canCast||canCast(c));
  program.cooldown=c=>unlock(c)?0:normalCd(c);
  program.reduceRecharge=(c,seconds)=>{if(!unlock(c))return;const s=state(c);if(!s.queue.length)return;const reduction=Math.min(Math.max(0,seconds),Math.max(0,s.queue[0]-c.battle.time));s.queue=s.queue.map(due=>due-reduction);refresh(c,s);schedule(c,s);};
  program.cast=c=>{if(unlock(c)){const s=state(c);if(s.count<=0)return;s.count--;const reduction=c.caster.statuses.filter(x=>x.kind==='cooldownReduction').reduce((n,x)=>n+(x.value??0),0),recharge=Math.max(.2,Math.max(0,(rechargeOverride?.(c)??normalCd(c))-(c.stolenCooldownReduction??0))*(1-Math.min(.9,Math.max(0,reduction))));s.queue.push(Math.max(c.battle.time,s.next??c.battle.time)+recharge);s.next=s.queue.at(-1)!;schedule(c,s);}original(c);};
  program.implemented.push(`${typeof maximum==='number'?maximum:'Configured'} charges with sequential recharge from source cooldown and current cooldown reduction`);
}

