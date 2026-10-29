import type {EffectContext as C,SkillProgram} from '../skill-effects';
export function charged(program:SkillProgram,unlock:(c:C)=>boolean,maximum:number){
  const original=program.cast!,canCast=program.canCast,normalCd=program.cooldown??((c:C)=>Math.max(.2,c.definition.cooldowns[Math.min(c.definition.cooldowns.length-1,c.skill.points>=3?2:c.skill.points>=2?1:0)]??0));
  interface Charges { count:number; next:number|null }
  const state=(c:C):Charges=>{const key=`mainCharges:${c.skill.id}`;let s=c.caster[key] as Charges|undefined;if(!s){s={count:maximum,next:null};c.caster[key]=s;}return s;};
  program.canCast=c=>(!unlock(c)||state(c).count>0)&&(!canCast||canCast(c));
  program.cooldown=c=>unlock(c)?0:normalCd(c);
  program.cast=c=>{if(unlock(c)){const s=state(c);if(s.count<=0)return;s.count--;const reduction=c.caster.statuses.filter(x=>x.kind==='cooldownReduction').reduce((n,x)=>n+(x.value??0),0),recharge=Math.max(.2,normalCd(c)*(1-Math.min(.9,Math.max(0,reduction))));const due=Math.max(c.battle.time,s.next??c.battle.time)+recharge;s.next=due;c.delay(due-c.battle.time,()=>{s.count=Math.min(maximum,s.count+1);if(s.count===maximum)s.next=null;});}original(c);};
  program.implemented.push(`${maximum} charges with sequential recharge from source cooldown and current cooldown reduction`);
}

