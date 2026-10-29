import {configuredValue} from '../config';
import {balanceNumber} from '../config';
import type { CombatUnit } from '../model';
import type { EffectContext, EffectStatus, SkillProgram } from '../skill-effects';

const ID='juggernaut_omni_slash',STEP=1/30;
function value(c:EffectContext,key:string,fallback=0):number {
  const configured=configuredValue(c,key);if(configured!==undefined)return configured;
  const row=c.definition.values.filter(r=>r.slice(0,r.indexOf(':')).trim().toUpperCase()===key).at(-1);
  const values=row?.slice(row.indexOf(':')+1).match(/-?\d+(?:\.\d+)?/g)?.map(Number)??[];
  return values[Math.min(values.length-1,Math.max(0,Math.min(2,c.skill.points-1)))]??fallback;
}
function slicing(c:EffectContext):boolean {return c.caster.statuses.some(s=>s.kind==='omnislash'&&s.until>c.battle.time);}
/** Integrate slash progress on fixed ticks instead of scheduling the whole
 * sequence from one base-attack snapshot. Bonus attack speed is additive with
 * the same effective stat calculation used by ordinary engine attacks. */
function slash(c:EffectContext,miniDuration?:number):void {
  if(c.caster.dead||slicing(c))return;
  const duration=miniDuration??value(c,'DURATION')+(c.skill.points>=6?1.5:0),until=c.battle.time+duration;
  const token=`${c.caster.id}:${ID}:${c.battle.time}`,jump=value(c,'SLASH JUMP RADIUS')/100;
  const owned=(s:EffectStatus)=>s.data?.omnislashToken===token;
  const finish=()=>{c.caster.statuses=(c.caster.statuses as EffectStatus[]).filter(s=>!owned(s));};
  const targets=()=>c.enemies().filter(t=>(!c.canTarget||c.canTarget(t))&&Math.hypot(t.x-c.caster.x,t.y-c.caster.y)<=jump);
  c.dispel(c.caster);
  for(const [kind,amount]of [['invulnerable',0],['disarm',0],['omnislash',0],['attackSpeed',value(c,'BONUS ATTACK SPEED')],['attackBonus',value(c,'BONUS DAMAGE')]] as const)
    c.status(c.caster,kind,duration,amount,{dispel:'none',data:{omnislashToken:token}});
  let previous:CombatUnit=c.target,progress=0,lastTime=c.battle.time;
  const hit=(target:CombatUnit)=>{c.warp(c.caster,target.x+.5,target.y);c.attack(target,1,true);previous=target;};
  if(c.target.dead||(c.canTarget&&!c.canTarget(c.target))){finish();return;}
  hit(c.target);
  const tick=()=>{
    if(c.caster.dead||c.battle.time>=until-1e-8||!c.caster.statuses.some(s=>s.kind==='omnislash'&&owned(s as EffectStatus))){finish();return;}
    const eligible=targets();if(!eligible.length){finish();return;}
    const period=Math.max(STEP,(c.attackInterval?.(c.caster,previous)??c.caster.attackInterval/(1+value(c,'BONUS ATTACK SPEED')/100))/value(c,'SLASHES RATE MULTIPLIER',1));
    progress+=(c.battle.time-lastTime)/period;lastTime=c.battle.time;
    if(progress>=1-1e-8){progress-=1;hit(eligible[Math.floor(c.random()*eligible.length)]);}
    c.delay(STEP,tick);
  };
  c.delay(STEP,tick);
}
export function applyOmnislashClockOverride(registry:Record<string,SkillProgram>):void {
  const base=registry[ID];if(!base)return;
  registry[ID]={...base,cast:c=>slash(c),onAttack:c=>{if(c.skill.points>=9&&!slicing(c)&&c.random()<balanceNumber(c,'omnislash.trigger_chance.1',0.2))slash(c,.8);},
    implemented:[...base.implemented,'effective attack-speed slash clock with preserved fractional progress','ends and removes only its own protective/attack modifiers when no eligible nearby targets remain'],
    remaining:[...base.remaining.filter(s=>s!=='Full attack-speed status integration and early end without targets'),'Slash progress updates each fixed step; no-target check ends within one tick, and additive attack-speed/bonus-damage timing is an explicit working rule pending original-version comparison']};
}
